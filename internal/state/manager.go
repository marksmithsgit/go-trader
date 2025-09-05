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

// UpdateHistoricalBar adds a new historical bar to the state.
func (sm *StateManager) UpdateHistoricalBar(bar HistoricalBar) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if _, ok := sm.historicalBars[bar.Instrument]; !ok {
		sm.historicalBars[bar.Instrument] = make(map[string][]HistoricalBar)
	}

	periodBars := sm.historicalBars[bar.Instrument][bar.Period]
	periodBars = append(periodBars, bar)

	// Trim the slice to maintain the ring buffer size.
	if len(periodBars) > barRingBufferSize {
		periodBars = periodBars[len(periodBars)-barRingBufferSize:]
	}
	sm.historicalBars[bar.Instrument][bar.Period] = periodBars
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
