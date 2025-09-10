package state

import (
	"sync"
)

const (
	// tickRingBufferSize is the number of recent ticks to store for each instrument.
	tickRingBufferSize = 20
	// barRingBufferSize is the number of recent bars to store for each instrument and period.
	barRingBufferSize = 200
)

// StateManager is the in-memory, thread-safe state cache for the entire trading system.
// It acts as the single source of truth for all market and account data.
type StateManager struct {
	// mu protects all fields within the StateManager.
	mu sync.RWMutex

	// ticks stores the last N ticks for each instrument.
	ticks map[string][]Tick

	// bars stores the last N bars for each instrument and period combination.
	bars map[string]map[string][]Bar

	// historicalBars stores the last N historical bars, separate from live bars.
	historicalBars map[string]map[string][]HistoricalBar

	// accountInfo holds the latest snapshot of the user's trading account.
	accountInfo AccountInfo
}

// NewStateManager creates and initializes a new StateManager.
func NewStateManager() *StateManager {
	return &StateManager{
		ticks:          make(map[string][]Tick),
		bars:           make(map[string]map[string][]Bar),
		historicalBars: make(map[string]map[string][]HistoricalBar),
	}
}

// UpdateTick adds a new tick to the state, ensuring the history size is maintained.
func (sm *StateManager) UpdateTick(tick Tick) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	instrumentTicks := sm.ticks[tick.Instrument]
	instrumentTicks = append(instrumentTicks, tick)

	// Trim the slice to maintain the ring buffer size.
	if len(instrumentTicks) > tickRingBufferSize {
		instrumentTicks = instrumentTicks[len(instrumentTicks)-tickRingBufferSize:]
	}
	sm.ticks[tick.Instrument] = instrumentTicks
}

// UpdateBar adds a new live bar to the state, ensuring the history size is maintained.
func (sm *StateManager) UpdateBar(bar Bar) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if _, ok := sm.bars[bar.Instrument]; !ok {
		sm.bars[bar.Instrument] = make(map[string][]Bar)
	}

	periodBars := sm.bars[bar.Instrument][bar.Period]
	periodBars = append(periodBars, bar)

	// Trim the slice to maintain the ring buffer size.
	if len(periodBars) > barRingBufferSize {
		periodBars = periodBars[len(periodBars)-barRingBufferSize:]
	}
	sm.bars[bar.Instrument][bar.Period] = periodBars
}

// UpdateHistoricalBar adds/updates a historical bar with timestamp-keyed deduplication.
// What: Insert or update a HistoricalBar for instrument/period while keeping at most 200, newest-first.
// How: Prefer BarEndTimestamp as the primary identity (dedup) and fall back to Sequence for legacy updates.
// Params: bar HistoricalBar (complete OHLCV+indicators, UTC timestamps)
// Returns: none (mutates in-memory state)
func (sm *StateManager) UpdateHistoricalBar(bar HistoricalBar) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if _, ok := sm.historicalBars[bar.Instrument]; !ok {
		sm.historicalBars[bar.Instrument] = make(map[string][]HistoricalBar)
	}

	periodBars := sm.historicalBars[bar.Instrument][bar.Period]

	// 1) Dedup by bar_end_timestamp (UTC): replace existing entry if same ts
	for i := range periodBars {
		if periodBars[i].BarEndTimestamp == bar.BarEndTimestamp {
			periodBars[i] = bar
			sm.historicalBars[bar.Instrument][bar.Period] = periodBars
			return
		}
	}

	// 2) Legacy: if a bar arrives with same Sequence, treat it as an update
	for i := range periodBars {
		if periodBars[i].Sequence == bar.Sequence && bar.Sequence != 0 {
			periodBars[i] = bar
			sm.historicalBars[bar.Instrument][bar.Period] = periodBars
			return
		}
	}

	// 3) Add new bar and keep newest-first ordering
	periodBars = append(periodBars, bar)

	// Sort newest-first by BarEndTimestamp (robust across sources); ties keep earlier element
	for i := 0; i < len(periodBars)-1; i++ {
		for j := i + 1; j < len(periodBars); j++ {
			if periodBars[i].BarEndTimestamp < periodBars[j].BarEndTimestamp {
				periodBars[i], periodBars[j] = periodBars[j], periodBars[i]
			}
		}
	}

	// 4) Remove any duplicates by timestamp that may still exist (first occurrence wins)
	seen := make(map[int64]struct{})
	dedup := make([]HistoricalBar, 0, len(periodBars))
	for _, b := range periodBars {
		if _, ok := seen[b.BarEndTimestamp]; ok {
			continue
		}
		seen[b.BarEndTimestamp] = struct{}{}
		dedup = append(dedup, b)
	}
	periodBars = dedup

	// 5) Trim to maintain buffer size (keep newest bars)
	if len(periodBars) > barRingBufferSize {
		periodBars = periodBars[:barRingBufferSize]
	}

	sm.historicalBars[bar.Instrument][bar.Period] = periodBars
}

// UpdateLiveBar integrates a newly closed bar (from the real-time stream) into the canonical bars.
// What: Treat incoming "live" bar as the newest completed bar for instrument/period.
// How: Do NOT keep a separate live map; directly merge into historicalBars via updateHistoricalSequenceOnLiveBar.
// Params: bar Bar (completed OHLC with indicators and UTC timestamps)
// Returns: none
func (sm *StateManager) UpdateLiveBar(bar Bar) {
	// Directly integrate into the single canonical buffer (historicalBars)
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.updateHistoricalSequenceOnLiveBar(bar.Instrument, bar.Period, bar)
}

// updateHistoricalSequenceOnLiveBar integrates a newly completed live bar into historicals.
// What: Insert/update the newest completed bar into the historical buffer for instrument/period.
// How: Convert live->HistoricalBar, dedup by BarEndTimestamp; if new, prepend; keep <=200, newest-first.
// Params: instrument, period, liveBar (completed bar)
// Returns: none (mutates in-memory state)
func (sm *StateManager) updateHistoricalSequenceOnLiveBar(instrument, period string, liveBar Bar) {
	if _, ok := sm.historicalBars[instrument]; !ok {
		sm.historicalBars[instrument] = make(map[string][]HistoricalBar)
	}

	historicalBars := sm.historicalBars[instrument][period]

	// Convert live bar to historical bar format
	historicalBar := HistoricalBar{
		ProducedAt:        liveBar.ProducedAt,
		BarStartTimestamp: liveBar.BarStartTimestamp,
		BarEndTimestamp:   liveBar.BarEndTimestamp,
		PairID:            liveBar.PairID,
		Instrument:        liveBar.Instrument,
		Period:            liveBar.Period,
		Bid:               liveBar.Bid,
		Ask:               liveBar.Ask,
		BidVwap:           Vwap{TickVwap: nil}, // Live bars don't have tick VWAP
		AskVwap:           Vwap{TickVwap: nil},
		BidAtr:            0.0,
		AskAtr:            0.0,
		BidObv:            0.0,
		AskObv:            0.0,
		BidDemas:          Demas{Dema25: 0, Dema50: 0, Dema100: 0, Dema200: 0},
		AskDemas:          Demas{Dema25: 0, Dema50: 0, Dema100: 0, Dema200: 0},
		BidMacd:           Macd{Line: 0, Signal: 0, Hist: 0},
		AskMacd:           Macd{Line: 0, Signal: 0, Hist: 0},
		BidRsi:            Rsi{Fast: 0, Slow: 0},
		AskRsi:            Rsi{Fast: 0, Slow: 0},
		BidStoch:          Stoch{K: 0, D: 0},
		AskStoch:          Stoch{K: 0, D: 0},
		BidCci:            0.0,
		AskCci:            0.0,
		BidMfi:            0.0,
		AskMfi:            0.0,
		BidBollinger:      liveBar.BidBollinger,
		AskBollinger:      liveBar.AskBollinger,
		BidKeltner:        Keltner{Upper: 0, Middle: 0, Lower: 0},
		AskKeltner:        Keltner{Upper: 0, Middle: 0, Lower: 0},
		BidDonchian:       liveBar.BidDonchian,
		AskDonchian:       liveBar.AskDonchian,
		BidSupertrend:     Supertrend{Upper: 0, Lower: 0},
		AskSupertrend:     Supertrend{Upper: 0, Lower: 0},
		Sequence:          1,
	}

	// 1) If a bar with the same end timestamp exists, replace it in-place
	for i := range historicalBars {
		if historicalBars[i].BarEndTimestamp == historicalBar.BarEndTimestamp {
			historicalBars[i] = historicalBar
			// Reorder newest-first by timestamp to be safe
			for a := 0; a < len(historicalBars)-1; a++ {
				for b := a + 1; b < len(historicalBars); b++ {
					if historicalBars[a].BarEndTimestamp < historicalBars[b].BarEndTimestamp {
						historicalBars[a], historicalBars[b] = historicalBars[b], historicalBars[a]
					}
				}
			}
			// Trim
			if len(historicalBars) > barRingBufferSize {
				historicalBars = historicalBars[:barRingBufferSize]
			}
			sm.historicalBars[instrument][period] = historicalBars
			return
		}
	}

	// 2) Otherwise prepend as the newest
	historicalBars = append([]HistoricalBar{historicalBar}, historicalBars...)

	// 3) Remove any duplicates by timestamp (first occurrence wins)
	seen := make(map[int64]struct{})
	unique := make([]HistoricalBar, 0, len(historicalBars))
	for _, b := range historicalBars {
		if _, ok := seen[b.BarEndTimestamp]; ok {
			continue
		}
		seen[b.BarEndTimestamp] = struct{}{}
		unique = append(unique, b)
	}
	historicalBars = unique

	// 4) Trim to maintain buffer size
	if len(historicalBars) > barRingBufferSize {
		historicalBars = historicalBars[:barRingBufferSize]
	}

	sm.historicalBars[instrument][period] = historicalBars
}

// UpdateAccountInfo updates the current account and position status.
func (sm *StateManager) UpdateAccountInfo(info AccountInfo) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.accountInfo = info
}

// GetTicks returns a copy of the recent ticks for a given instrument.
func (sm *StateManager) GetTicks(instrument string) []Tick {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	// Return a copy to prevent race conditions on the slice itself.
	ticksCopy := make([]Tick, len(sm.ticks[instrument]))
	copy(ticksCopy, sm.ticks[instrument])
	return ticksCopy
}

// GetBars returns a copy of the recent bars for a given instrument and period.
func (sm *StateManager) GetBars(instrument, period string) []Bar {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	if _, ok := sm.bars[instrument]; !ok {
		return nil
	}

	barsCopy := make([]Bar, len(sm.bars[instrument][period]))
	copy(barsCopy, sm.bars[instrument][period])
	return barsCopy
}

// GetHistoricalBars returns a copy of the recent historical bars.
func (sm *StateManager) GetHistoricalBars(instrument, period string) []HistoricalBar {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	if _, ok := sm.historicalBars[instrument]; !ok {
		return nil
	}

	barsCopy := make([]HistoricalBar, len(sm.historicalBars[instrument][period]))
	copy(barsCopy, sm.historicalBars[instrument][period])
	return barsCopy
}

// GetAccountInfo returns a copy of the latest account information.
func (sm *StateManager) GetAccountInfo() AccountInfo {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	// The AccountInfo struct and its slices are copied by value, ensuring thread safety.
	return sm.accountInfo
}
