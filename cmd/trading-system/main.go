package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"go-trader/internal/amqp"
	"go-trader/internal/db"
	"go-trader/internal/ledger"
	"go-trader/internal/state"
	"go-trader/internal/strategy"
	"go-trader/internal/websocket"
)

// Configuration
const (
	// RabbitMQ connection URI
	amqpURI = "amqp://mark:mark@localhost:5672/"

	// Number of historical bars to fetch on startup
	historicalBarsToFetch = 200

	// Duration to drain queues on startup
	drainDuration = 10 * time.Second

	// Interval for broadcasting the full state to WebSocket clients
	broadcastInterval = 1 * time.Second
)

// FullState represents a complete snapshot of the application state for broadcasting.
type FullState struct {
	AccountInfo         state.AccountInfo                           `json:"accountInfo"`
	Ticks               map[string][]state.Tick                     `json:"ticks"`
	Bars                map[string]map[string][]state.Bar           `json:"bars"`
	HistoricalBars      map[string]map[string][]state.HistoricalBar `json:"historicalBars"`
	StrategyStatuses    []strategy.Status                           `json:"strategyStatuses,omitempty"`
	LedgerHealthSummary LedgerHealthSummary                         `json:"ledgerHealthSummary,omitempty"`
}

// Ledger health summary types for quick dashboard validation
// These provide lightweight counts and validity flags per instrument/period.
type PeriodHealth struct {
	Count    int   `json:"count"`
	Valid    bool  `json:"valid"`
	NewestTs int64 `json:"newestTs,omitempty"`
}

type TicksHealth struct {
	Count  int   `json:"count"`
	Live   bool  `json:"live"`
	LastTs int64 `json:"lastTs,omitempty"`
}

type InstrumentHealth struct {
	Instrument string                  `json:"instrument"`
	Ticks      TicksHealth             `json:"ticks"`
	Periods    map[string]PeriodHealth `json:"periods"`
}

type LedgerHealthSummary struct {
	GeneratedAt int64              `json:"generatedAt"`
	Instruments []InstrumentHealth `json:"instruments"`
}

// FrontendBroadcaster handles broadcasting state to frontend clients
type FrontendBroadcaster struct {
	stateManager   *state.StateManager
	hub            *websocket.Hub
	instrumentList []string
	publisher      *amqp.Publisher
	dbLogger       *db.Logger
	stratEngine    *strategy.Engine
}

// attachLedgerHealth computes a lightweight ledger summary for quick UI validation.
func (fb *FrontendBroadcaster) attachLedgerHealth(full FullState) FullState {
	// Define periods we expect to track (must match what JForex sends)
	periods := []string{"TEN_SECS", "ONE_MIN", "FIVE_MINS", "FIFTEEN_MINS", "ONE_HOUR", "FOUR_HOURS", "DAILY"}

	nowMs := time.Now().UnixMilli()
	liveTickWindowMs := int64(5000) // consider ticks "live" if seen in last 5s

	var instruments []InstrumentHealth
	for _, inst := range fb.instrumentList {
		// Ticks health
		ticks := fb.stateManager.GetTicks(inst)
		th := TicksHealth{Count: len(ticks), Live: false, LastTs: 0}
		if len(ticks) > 0 {
			last := ticks[len(ticks)-1]
			// prefer the newer of produced_at and tick timestamp
			if last.Timestamp > last.ProducedAt {
				th.LastTs = last.Timestamp
			} else {
				th.LastTs = last.ProducedAt
			}
			if th.LastTs > 0 && nowMs-th.LastTs <= liveTickWindowMs {
				th.Live = true
			}
		}

		// Period healths based on historical bars primarily
		phMap := make(map[string]PeriodHealth)
		for _, p := range periods {
			hb := fb.stateManager.GetHistoricalBars(inst, p)
			count := len(hb)
			valid := false
			newestTs := int64(0)
			if count > 0 {
				newestTs = hb[0].BarEndTimestamp
			}
			// Simple validity rules:
			// - have at least 200 bars
			// - no duplicates in recent window
			// - non-increasing bar_end_timestamp order in recent window
			if count >= 200 {
				dup := false
				orderOK := true
				seen := make(map[int64]struct{})
				maxCheck := count
				if maxCheck > 50 { // limit work per period
					maxCheck = 50
				}
				lastTs := int64(1<<63 - 1)
				for i := 0; i < maxCheck; i++ {
					ts := hb[i].BarEndTimestamp
					if _, exists := seen[ts]; exists {
						dup = true
						break
					}
					seen[ts] = struct{}{}
					if ts > lastTs { // should be non-increasing (newest first)
						orderOK = false
						break
					}
					lastTs = ts
				}
				valid = !dup && orderOK
			}
			phMap[p] = PeriodHealth{Count: count, Valid: valid, NewestTs: newestTs}
		}

		instruments = append(instruments, InstrumentHealth{
			Instrument: inst,
			Ticks:      th,
			Periods:    phMap,
		})
	}

	full.LedgerHealthSummary = LedgerHealthSummary{
		GeneratedAt: nowMs,
		Instruments: instruments,
	}
	return full
}

func (fb *FrontendBroadcaster) Start() {
	ticker := time.NewTicker(broadcastInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			fb.broadcastCurrentState()
		default:
			// Non-blocking check for commands
			select {
			case command := <-fb.hub.Commands:
				fb.processCommand(command)
			default:
				// No command available, continue
				time.Sleep(10 * time.Millisecond)
			}
		}
	}
}

func (fb *FrontendBroadcaster) broadcastCurrentState() {
	accountInfo := fb.stateManager.GetAccountInfo()

	fullState := FullState{
		AccountInfo:    accountInfo,
		Ticks:          make(map[string][]state.Tick),
		Bars:           make(map[string]map[string][]state.Bar),
		HistoricalBars: make(map[string]map[string][]state.HistoricalBar),
	}

	// Get data for all active instruments
	for _, instrument := range fb.instrumentList {
		fullState.Ticks[instrument] = fb.stateManager.GetTicks(instrument)
		fullState.Bars[instrument] = make(map[string][]state.Bar)
		fullState.HistoricalBars[instrument] = make(map[string][]state.HistoricalBar)

		// Get bars for all periods that JForex should send
		periods := []string{"TEN_SECS", "ONE_MIN", "FIVE_MINS", "FIFTEEN_MINS", "ONE_HOUR", "FOUR_HOURS", "DAILY"}
		for _, period := range periods {
			bars := fb.stateManager.GetBars(instrument, period)
			if len(bars) > 0 {
				fullState.Bars[instrument][period] = bars
			}

			historicalBars := fb.stateManager.GetHistoricalBars(instrument, period)
			if len(historicalBars) > 0 {
				fullState.HistoricalBars[instrument][period] = historicalBars
			}
		}
		// Include strategy statuses
		if fb.stratEngine != nil {
			fullState.StrategyStatuses = fb.stratEngine.Statuses()
		}

		// Compute and attach a lightweight ledger health summary for the dashboard
		fullState = fb.attachLedgerHealth(fullState)

	}

	jsonData, err := json.Marshal(fullState)

	if err != nil {
		log.Printf("Error marshalling state for frontend: %s", err)
		return
	}

	fb.hub.Broadcast(jsonData)
}

// processCommand handles incoming commands from the frontend
func (fb *FrontendBroadcaster) processCommand(command []byte) {
	// Unified command schema expected from frontend
	type Req struct {
		Type        string             `json:"type"`
		Instrument  string             `json:"instrument"`
		Side        string             `json:"side,omitempty"`      // BUY | SELL
		Qty         float64            `json:"qty,omitempty"`       // JForex amount (e.g., 0.10 = 10k)
		OrderType   string             `json:"orderType,omitempty"` // MARKET | LIMIT
		Price       float64            `json:"price,omitempty"`     // For LIMIT
		SlPips      float64            `json:"slPips,omitempty"`
		TpPips      float64            `json:"tpPips,omitempty"`
		Slippage    float64            `json:"slippage,omitempty"`
		StrategyKey string             `json:"strategyKey,omitempty"`
		Period      string             `json:"period,omitempty"`
		AtrMult     float64            `json:"atrMult,omitempty"`
		Params      map[string]float64 `json:"params,omitempty"`
		OrderID     string             `json:"orderId,omitempty"`
	}

	var req Req
	if err := json.Unmarshal(command, &req); err != nil {
		log.Printf("Error parsing command: %v", err)
		return
	}

	switch req.Type {
	case "STRATEGY_START":
		if req.Instrument == "" {
			log.Printf("Invalid STRATEGY_START: missing instrument")
			return
		}
		stratKey := strings.ToUpper(strings.TrimSpace(req.StrategyKey))
		period := req.Period
		if period == "" {
			period = "ONE_MIN"
		}
		qty := req.Qty
		if qty <= 0 {
			qty = 0.10
		}
		atrMult := req.AtrMult
		if atrMult <= 0 {
			atrMult = 1.0
		}
		var strat strategy.Strategy
		switch stratKey {
		case "DEMA_RSI", "DEMA+RSI", "DEMA":
			strat = &strategy.DemaRsiStrategy{}
		case "BREAKOUT_DC":
			strat = &strategy.DonchianBreakoutStrategy{}
		case "SUPERTREND_TREND":
			strat = &strategy.SupertrendStrategy{}
		default:
			strat = &strategy.DemaRsiStrategy{}
		}
		if fb.stratEngine != nil {
			fb.stratEngine.StartStrategyWithParams(req.Instrument, period, strat, qty, atrMult, req.Params)
		}

	case "STRATEGY_STOP":
		if req.Instrument == "" {
			log.Printf("Invalid STRATEGY_STOP: missing instrument")
			return
		}
		period := req.Period
		if period == "" {
			period = "ONE_MIN"
		}
		if fb.stratEngine != nil {
			fb.stratEngine.StopStrategy(req.Instrument, period)
		}

	case "HISTORICAL_DATA_REQUEST":
		log.Printf("🔄 Received historical data request for instrument: %s", req.Instrument)
		fb.requestHistoricalData(req.Instrument)

	case "PLACE_ORDER": // Market order
		if req.Instrument == "" || (req.Side != "BUY" && req.Side != "SELL") || req.Qty <= 0 {
			log.Printf("Invalid PLACE_ORDER request: %+v", req)
			return
		}
		pip := getPipSize(req.Instrument)
		// Get latest tick for price reference
		ticks := fb.stateManager.GetTicks(req.Instrument)
		if len(ticks) == 0 {
			log.Printf("No ticks for instrument %s to place market order", req.Instrument)

		}
		last := ticks[len(ticks)-1]
		entry := last.Ask
		if req.Side == "SELL" {
			entry = last.Bid
		}
		var sl, tp float64
		if req.SlPips > 0 {
			if req.Side == "BUY" {
				sl = entry - req.SlPips*pip

			} else {
				sl = entry + req.SlPips*pip
			}
		}
		if req.TpPips > 0 {
			if req.Side == "BUY" {
				tp = entry + req.TpPips*pip
			} else {
				tp = entry - req.TpPips*pip
			}
		}
		label := fmt.Sprintf("%s_%s_%d", req.Instrument, strings.ToLower(req.Side), time.Now().UnixMilli())
		if req.Slippage == 0 {
			req.Slippage = 5
		}
		cmd := amqp.TradeCommand{
			Label:           label,
			Instrument:      req.Instrument,
			OrderCmd:        req.Side, // BUY or SELL market
			Amount:          req.Qty,
			Price:           0,
			Slippage:        req.Slippage,
			StopLossPrice:   sl,
			TakeProfitPrice: tp,
		}
		if fb.dbLogger != nil {
			fb.dbLogger.LogTradeSubmitted(label, req.Instrument, req.Side, cmd.OrderCmd, req.Qty, cmd.Price, cmd.StopLossPrice, cmd.TakeProfitPrice, map[string]any{"orderType": "MARKET"})
		}
		if err := fb.publisher.PublishSubmitOrder(cmd); err != nil {
			log.Printf("Failed to publish market order: %v", err)
		}

	case "PLACE_LIMIT":
		if req.Instrument == "" || (req.Side != "BUY" && req.Side != "SELL") || req.Qty <= 0 || req.Price <= 0 {
			log.Printf("Invalid PLACE_LIMIT request: %+v", req)
			return
		}
		pip := getPipSize(req.Instrument)
		var sl, tp float64
		if req.SlPips > 0 {
			if req.Side == "BUY" {
				sl = req.Price - req.SlPips*pip
			} else {
				sl = req.Price + req.SlPips*pip
			}
		}
		if req.TpPips > 0 {
			if req.Side == "BUY" {
				tp = req.Price + req.TpPips*pip
			} else {
				tp = req.Price - req.TpPips*pip
			}
		}
		label := fmt.Sprintf("%s_%s_limit_%d", req.Instrument, strings.ToLower(req.Side), time.Now().UnixMilli())
		orderCmd := "BUY_LIMIT"
		if req.Side == "SELL" {
			orderCmd = "SELL_LIMIT"
		}
		cmd := amqp.TradeCommand{
			Label:           label,
			Instrument:      req.Instrument,
			OrderCmd:        orderCmd,
			Amount:          req.Qty,
			Price:           req.Price,
			StopLossPrice:   sl,
			TakeProfitPrice: tp,
		}
		if fb.dbLogger != nil {
			fb.dbLogger.LogTradeSubmitted(label, req.Instrument, req.Side, cmd.OrderCmd, req.Qty, cmd.Price, cmd.StopLossPrice, cmd.TakeProfitPrice, map[string]any{"orderType": "LIMIT"})
		}
		if err := fb.publisher.PublishSubmitOrder(cmd); err != nil {
			log.Printf("Failed to publish limit order: %v", err)
		}

	case "CLOSE_ALL":
		// Close all open orders on instrument for the given side
		if req.Instrument == "" || (req.Side != "BUY" && req.Side != "SELL") {
			log.Printf("Invalid CLOSE_ALL request: %+v", req)
			return
		}
		acct := fb.stateManager.GetAccountInfo()
		count := 0
		for _, pos := range acct.Positions {
			if pos.Instrument == req.Instrument && strings.EqualFold(pos.OrderCommand, req.Side) {
				if err := fb.publisher.PublishCloseOrder(pos.OrderID); err != nil {
					log.Printf("Failed to publish close for %s: %v", pos.OrderID, err)
					continue
				}
				if fb.dbLogger != nil {

					fb.dbLogger.LogTradeCloseRequested(pos.OrderID, pos.Instrument, pos.OrderCommand)
				}
				count++
			}
		}
		log.Printf("Requested close for %d %s positions on %s", count, req.Side, req.Instrument)

	case "CLOSE_ORDER":
		// Close a specific order by OrderID
		if strings.TrimSpace(req.OrderID) == "" {
			log.Printf("Invalid CLOSE_ORDER request: missing orderId")
			return
		}
		if err := fb.publisher.PublishCloseOrder(req.OrderID); err != nil {
			log.Printf("Failed to publish close for %s: %v", req.OrderID, err)
			return
		}
		if fb.dbLogger != nil {
			fb.dbLogger.LogTradeCloseRequested(req.OrderID, req.Instrument, req.Side)
		}
		log.Printf("Requested close for orderId=%s", req.OrderID)

	default:
		log.Printf("Unknown command type: %s", req.Type)
	}
}

// getPipSize returns pip size based on instrument
func getPipSize(instrument string) float64 {
	if strings.Contains(instrument, "JPY") {
		return 0.01
	}
	return 0.0001
}

// requestHistoricalData handles requests for historical data from the frontend
// What: Forward a per-instrument historical request to the JForex HistoricalBarRequester via AMQP.
// How: Publishes to '<INSTRUMENT>_H-Requests' with barsCount=historicalBarsToFetch using the AMQP publisher.
// Params: instrument string symbol, e.g., 'EURUSD'.
// Returns: None. Logs errors if publish fails.
func (fb *FrontendBroadcaster) requestHistoricalData(instrument string) {
	if instrument == "" || fb.publisher == nil {
		log.Printf("Historical data request ignored (instrument empty or publisher nil)")
		return
	}
	log.Printf("Requesting %d historical bars for %s via AMQP...", historicalBarsToFetch, instrument)
	if err := fb.publisher.RequestHistoricalBars(instrument, historicalBarsToFetch); err != nil {
		log.Printf("Failed to publish historical request for %s: %v", instrument, err)
	}
}

// killProcessUsingPort finds and kills the process using the specified port
func killProcessUsingPort(port string) bool {
	// Try lsof first (Linux/macOS)
	cmd := exec.Command("lsof", "-ti", fmt.Sprintf(":%s", port))
	output, err := cmd.Output()
	if err != nil {
		// If lsof fails, try netstat (alternative method)
		log.Printf("lsof failed, trying netstat method")
		cmd = exec.Command("sh", "-c", fmt.Sprintf("netstat -tulpn 2>/dev/null | grep :%s | awk '{print $7}' | cut -d'/' -f1", port))
		output, err = cmd.Output()
		if err != nil {
			log.Printf("Both lsof and netstat failed to find process using port %s", port)
			return false
		}
	}

	// Parse the output to get PID
	pidStr := strings.TrimSpace(string(output))
	if pidStr == "" {
		log.Printf("No process found using port %s", port)
		return false
	}

	// Handle multiple PIDs (take the first one)
	pidStr = strings.Split(pidStr, "\n")[0]

	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		log.Printf("Failed to parse PID '%s': %v", pidStr, err)
		return false
	}

	// Don't kill our own process
	ourPid := os.Getpid()
	if pid == ourPid {
		log.Printf("Found our own process (PID %d), not killing", pid)
		return false
	}

	log.Printf("Killing process %d using port %s", pid, port)

	// Try SIGTERM first
	process, err := os.FindProcess(pid)
	if err != nil {
		log.Printf("Failed to find process %d: %v", pid, err)
		return false
	}

	err = process.Kill()
	if err != nil {
		log.Printf("Failed to kill process %d: %v", pid, err)
		return false
	}

	// Wait a moment for the process to die
	time.Sleep(500 * time.Millisecond)

	return true
}

// A list of all instruments the system trades.
// All 10 currency pairs enabled for full trading system
var instrumentList = []string{
	"EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD",
	"USDCAD", "NZDUSD", "EURJPY", "GBPJPY", "EURGBP",
}

func main() {
	log.Println("🚀 Starting Go Trading System Backend with Central Ledger...")

	// --- 1. Initialize Core Components ---
	stateManager := state.NewStateManager()
	log.Println("✅ State Manager initialized.")

	publisher, err := amqp.NewPublisher(amqpURI)
	if err != nil {
		log.Fatalf("❌ Failed to initialize AMQP publisher: %s", err)
	}
	defer publisher.Close()
	log.Println("✅ AMQP Publisher initialized.")

	consumer, err := amqp.NewConsumer(amqpURI, stateManager)
	if err != nil {
		log.Fatalf("❌ Failed to initialize AMQP consumer: %s", err)
	}
	defer consumer.Close()

	// --- 2b. Initialize DB Logger ---
	dsn := "postgres://postgres:postgres@10.10.10.3:5432/gotrader?sslmode=disable"
	dbLogger, err := db.NewLogger(dsn)
	if err != nil {
		log.Printf("⚠️ Failed to initialize DB logger: %v", err)
	} else {
		log.Println("✅ DB Logger initialized.")
		defer dbLogger.Close()
	}

	log.Println("✅ AMQP Consumer initialized.")

	// Initialize Strategy Engine
	stratEngine := strategy.NewEngine(stateManager, publisher, dbLogger)

	// 🧹 Drain queues BEFORE requesting/consuming historicals to avoid discarding fresh data
	log.Println("🧹 Draining queues to clear backlog (pre-start)...")
	if err := consumer.DrainQueues(drainDuration); err != nil {
		log.Printf("⚠️ Warning: Failed to drain queues: %s", err)
	}
	log.Println("✅ Pre-start queue draining completed.")

	// --- 3. Start Live Consumers (now that queues are clean)
	log.Println("📡 Starting live consumers...")
	if err := consumer.StartConsumers(); err != nil {
		log.Fatalf("❌ Failed to start consumers: %s", err)
	}
	log.Println("✅ Live consumers started. System is now ready to request historicals.")

	// --- 2. Initialize Central Ledger ---
	centralLedger := ledger.NewCentralLedger(
		stateManager,
		consumer.GetMessageHandler(), // We'll need to add this getter method
		publisher,
		nil, // Will be set after hub initialization
		instrumentList,
		historicalBarsToFetch,
	)

	if err := centralLedger.Start(); err != nil {
		log.Fatalf("❌ Failed to start Central Ledger: %s", err)
	}
	defer centralLedger.Stop()
	log.Println("✅ Central Ledger started.")

	log.Println("--- Startup Sequence Initiated ---")

	// Queues were already drained before starting consumers; skipping post-start drain.
	// Consumers already started above; keeping this section for log structure continuity.
	log.Println("✅ Queues were already drained earlier.")
	log.Println("✅ Consumers already started earlier; continuing startup.")

	// --- 4. Start WebSocket Hub and Broadcaster ---
	hub := websocket.NewHub()
	go hub.Run()
	log.Println("🌐 WebSocket Hub started.")

	// Update ledger with hub reference and start frontend broadcaster
	centralLedger.SetHub(hub) // We'll need to add this method

	go func() {
		frontendBroadcaster := &FrontendBroadcaster{
			stateManager:   stateManager,
			hub:            hub,
			instrumentList: instrumentList,
			publisher:      publisher,
			dbLogger:       dbLogger,
			stratEngine:    stratEngine,
		}
		frontendBroadcaster.Start()
	}()

	// --- HTTP API for strategy runs/events ---
	http.HandleFunc("/api/strategy/runs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if dbLogger == nil {
			w.Write([]byte("[]"))
			return
		}
		instrument := r.URL.Query().Get("instrument")
		period := r.URL.Query().Get("period")
		limit := 50
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		runs, err := dbLogger.QueryStrategyRuns(ctx, instrument, period, limit)
		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(`{"error":"db"}`))
			return
		}
		json.NewEncoder(w).Encode(runs)
	})
	http.HandleFunc("/api/strategy/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if dbLogger == nil {
			w.Write([]byte("[]"))
			return
		}
		runID := r.URL.Query().Get("runId")
		if runID == "" {
			w.Write([]byte("[]"))
			return
		}
		limit := 200
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		evts, err := dbLogger.QueryStrategyEvents(ctx, runID, limit)
		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(`{"error":"db"}`))
			return
		}
		json.NewEncoder(w).Encode(evts)
	})

	// --- HTTP API: Ledger counts (ticks/bars/historical per instrument/period)
	http.HandleFunc("/api/ledger/counts", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Allow cross-origin for easy local debugging from Vite dev server
		w.Header().Set("Access-Control-Allow-Origin", "*")

		// Optional: instrument=EURUSD to scope; otherwise return all
		instrument := r.URL.Query().Get("instrument")

		// Periods that our system handles
		periods := []string{"TEN_SECS", "ONE_MIN", "FIVE_MINS", "FIFTEEN_MINS", "ONE_HOUR", "FOUR_HOURS", "DAILY"}

		type counts struct {
			// What: Lightweight counts per instrument for quick verification.
			// How: Bars counts are sourced from the canonical historical buffer (completed bars only).
			Ticks int            `json:"ticks"`
			Bars  map[string]int `json:"bars"`
		}

		// Helper to compute counts for one instrument
		compute := func(instr string) counts {
			c := counts{Bars: map[string]int{}}
			c.Ticks = len(stateManager.GetTicks(instr))
			for _, p := range periods {
				// Canonical completed bars: use historical bars store
				c.Bars[p] = len(stateManager.GetHistoricalBars(instr, p))
			}
			return c
		}

		enc := json.NewEncoder(w)

		if instrument != "" {
			res := map[string]counts{instrument: compute(instrument)}
			if err := enc.Encode(res); err != nil {
				w.WriteHeader(500)
			}
			return
		}

		all := make(map[string]counts, len(instrumentList))
		for _, instr := range instrumentList {
			all[instr] = compute(instr)
		}
		if err := enc.Encode(all); err != nil {
			w.WriteHeader(500)
		}
	})

	// --- 5. Start WebSocket server with port conflict resolution ---
	go func() {
		webSocketAddr := ":8080"
		maxRetries := 5

		for i := 0; i < maxRetries; i++ {
			listener, err := net.Listen("tcp", webSocketAddr)
			if err != nil {
				if strings.Contains(err.Error(), "address already in use") {
					log.Printf("🔄 Port %s already in use, attempting to kill conflicting process (attempt %d/%d)",
						webSocketAddr, i+1, maxRetries)

					if killProcessUsingPort("8080") {
						log.Printf("✅ Successfully killed conflicting process, retrying in 2 seconds...")
						time.Sleep(2 * time.Second)
						continue
					} else {
						log.Printf("❌ Failed to kill conflicting process, trying different port")
						webSocketAddr = ":8081"
						i-- // Don't count this as a retry
						continue
					}
				} else {
					log.Fatalf("❌ Failed to start WebSocket server: %s", err)
				}
			}

			log.Printf("🌐 WebSocket server listening on %s", webSocketAddr)

			http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
				hub.ServeWs(w, r)
			})

			if err := http.Serve(listener, nil); err != nil {
				log.Printf("❌ WebSocket server error: %s", err)
			}
			return
		}

		log.Fatalf("❌ Failed to start WebSocket server after %d attempts", maxRetries)
	}()

	// --- 6. Log System Status ---
	log.Printf("🎉 Trading System Operational!")
	log.Printf("📊 Monitoring %d currency pairs: %v", len(instrumentList), instrumentList)
	log.Printf("⏱️  Historical bars per instrument: %d", historicalBarsToFetch)

	// --- 7. Wait for Shutdown Signal ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("🛑 Shutdown signal received. Gracefully closing connections and exiting.")
}
