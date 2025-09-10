package strategy

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"strings"
	"sync"
	"time"

	"go-trader/internal/amqp"
	"go-trader/internal/state"
	"go-trader/internal/db"
)

// What: Strategy interface and Engine to run strategies per instrument/period and place orders via AMQP.
// How: Engine manages goroutines keyed by instrument+period. Each loop polls StateManager for new bars.
//      On new bar, it calls the Strategy's Evaluate to get a trading signal, then publishes orders with SL/TP.
// Params:
//  - StateManager provides bars/account
//  - Publisher sends TradeCommand to JForex
// Returns: Thread-safe Engine with Start/Stop controls per instrument.

type Signal string

const (
	SignalNone Signal = "NONE"
	SignalBuy  Signal = "BUY"
	SignalSell Signal = "SELL"
)

// Status represents the runtime status of a running strategy instance.
type Status struct {
	Instrument   string `json:"instrument"`
	Period       string `json:"period"`
	Key          string `json:"key"`
	Running      bool   `json:"running"`
	LastSignal   string `json:"lastSignal"`
	LastActionAt int64  `json:"lastActionAt"`
}

// Params is a generic numeric parameter bag for strategies.
type Params map[string]float64

// Parametrizable can accept runtime parameters.
type Parametrizable interface {
	SetParams(Params)
}

// Strategy defines a pluggable evaluation over historical bars.
type Strategy interface {
	Key() string
	Evaluate(bars []state.HistoricalBar) Signal
}

// runConfig stores per-run settings.
type runConfig struct {
	instrument   string
	period       string
	strategy     Strategy
	runID        string
	qty          float64
	atrMult      float64
	params       Params
	stop         chan struct{}
	running      bool
	lastSignal   Signal
	lastActionAt time.Time
}

// Engine coordinates running strategies.
type Engine struct {
	sm        *state.StateManager
	pub       *amqp.Publisher
	db        *db.Logger
	mu        sync.Mutex
	runs      map[string]*runConfig // key: instrument|period
}

// NewEngine creates a new strategy engine.
func NewEngine(sm *state.StateManager, pub *amqp.Publisher, dbl *db.Logger) *Engine {
	return &Engine{sm: sm, pub: pub, db: dbl, runs: make(map[string]*runConfig)}
}

// StartStrategy starts a strategy for instrument/period with basic params.
func (e *Engine) StartStrategy(instrument, period string, s Strategy, qty, atrMult float64) {
	e.StartStrategyWithParams(instrument, period, s, qty, atrMult, nil)
}

// StartStrategyWithParams starts a strategy and passes optional numeric params.
func (e *Engine) StartStrategyWithParams(instrument, period string, s Strategy, qty, atrMult float64, params Params) {
	key := e.key(instrument, period)
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, ok := e.runs[key]; ok {
		log.Printf("Strategy already running for %s %s", instrument, period)
		return
	}
	// Guardrails
	if qty <= 0 { qty = 0.10 }
	if qty > 100 { qty = 100 }
	if atrMult <= 0 { atrMult = 1.0 }
	if atrMult > 20 { atrMult = 20 }
	// Apply params if supported by strategy
	if pz, ok := s.(Parametrizable); ok && params != nil {
		pz.SetParams(params)
	}
	// Generate runID
	runID := newRunID()
	cfg := &runConfig{instrument: instrument, period: period, strategy: s, runID: runID, qty: qty, atrMult: atrMult, params: params, stop: make(chan struct{}), running: true}
	e.runs[key] = cfg
	// Log run start
	if e.db != nil {
		e.db.LogStrategyRunStart(runID, instrument, period, s.Key(), qty, atrMult, params)
	}
	go e.loop(cfg)
	log.Printf("▶️ Strategy %s started on %s @ %s (qty=%.2f, atrMult=%.2f)", s.Key(), instrument, period, qty, atrMult)
}

// StopStrategy stops a running strategy for instrument/period.
func (e *Engine) StopStrategy(instrument, period string) {
	key := e.key(instrument, period)
	e.mu.Lock()
	cfg, ok := e.runs[key]
	if ok {
		delete(e.runs, key)
	}
	e.mu.Unlock()
	if ok {
		close(cfg.stop)
		if e.db != nil {
			e.db.LogStrategyRunStop(cfg.runID, "stopped")
		}
		log.Printf("⏹️ Strategy stopped on %s @ %s", instrument, period)
	}
}

func (e *Engine) key(instrument, period string) string { return instrument + "|" + period }

// loop polls for new bars and evaluates the strategy per bar close.
func (e *Engine) loop(cfg *runConfig) {
	var lastSeq int = -1
	t := time.NewTicker(1 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-cfg.stop:
			return
		case <-t.C:
			bars := e.sm.GetHistoricalBars(cfg.instrument, cfg.period)
			if len(bars) == 0 {
				continue
			}
			// Bars are newest-first by sequence (based on manager implementation)
			latest := bars[0]
			if latest.Sequence == lastSeq {
				continue
			}
			lastSeq = latest.Sequence
			sig := cfg.strategy.Evaluate(bars)
			if sig == SignalNone {
				continue
			}
			// Log signal event
			if e.db != nil {
				e.db.LogStrategyEvent(cfg.runID, cfg.instrument, cfg.period, cfg.strategy.Key(), "signal", string(sig), map[string]any{"seq": latest.Sequence})
			}
			// Prepare order with ATR-based SL/TP if available
			pip := getPipSize(cfg.instrument)
			atr := latest.BidAtr
			if atr <= 0 {
				atr = latest.AskAtr
			}
			slPips := 10.0
			if atr > 0 {
				slPips = cfg.atrMult * (atr / pip)
				if slPips < 1 { slPips = 1 }
			}
			// Use latest mid as reference; market order
			price := (latest.Bid.C + latest.Ask.C) / 2.0
			var sl, tp float64
			if sig == SignalBuy {
				sl = price - slPips*pip
				tp = price + slPips*pip
			} else {
				sl = price + slPips*pip
				tp = price - slPips*pip
			}
			label := cfg.instrument + "_strat_" + strings.ToLower(string(sig)) + "_" + time.Now().Format("150405")
			cmd := amqp.TradeCommand{
				Label:           label,
				Instrument:      cfg.instrument,
				OrderCmd:        string(sig), // BUY or SELL
				Amount:          cfg.qty,
				Price:           0,
				Slippage:        5,
				StopLossPrice:   sl,
				TakeProfitPrice: tp,
			}
			// Record that we acted on a signal
			cfg.lastSignal = sig
			cfg.lastActionAt = time.Now()
			// DB logs for strategy-sourced order
			if e.db != nil {
				e.db.LogStrategyEvent(
					cfg.runID, cfg.instrument, cfg.period, cfg.strategy.Key(),
					"order_submitted", string(sig),
					map[string]any{
						"label":          label,
						"entryIntent":    func() string { if sig == SignalBuy { return "long" } ; if sig == SignalSell { return "short" } ; return "none" }(),
						"entryMidPrice":  price,
						"pipSize":        pip,
						"plannedSlPips":  slPips,
						"plannedTpPips":  slPips,
						"sl":             sl,
						"tp":             tp,
						"seq":            latest.Sequence,
					},
				)
				e.db.LogTradeSubmitted(
					label, cfg.instrument, string(sig), cmd.OrderCmd,
					cmd.Amount, cmd.Price, cmd.StopLossPrice, cmd.TakeProfitPrice,
					map[string]any{"orderType":"MARKET","source":"strategy","strategyKey":cfg.strategy.Key(),"runId":cfg.runID, "pipSize": pip, "plannedSlPips": slPips},
				)
			}
			if err := e.pub.PublishSubmitOrder(cmd); err != nil {
				log.Printf("Strategy publish failed: %v", err)
			}
		}
	}
}

func getPipSize(instrument string) float64 {
	if strings.Contains(instrument, "JPY") {
		return 0.01
	}
	return 0.0001
}

// Statuses returns a snapshot of running strategy instances.
func (e *Engine) Statuses() []Status {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]Status, 0, len(e.runs))
	for _, cfg := range e.runs {
		out = append(out, Status{
			Instrument:   cfg.instrument,
			Period:       cfg.period,
			Key:          cfg.strategy.Key(),
			Running:      cfg.running,
			LastSignal:   string(cfg.lastSignal),
			LastActionAt: func() int64 { if cfg.lastActionAt.IsZero() { return 0 } ; return cfg.lastActionAt.UnixMilli() }(),
		})
	}
	return out
}


func newRunID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b) + "-" + time.Now().Format("20060102T150405.000")
}
