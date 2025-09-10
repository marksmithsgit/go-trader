package ledger

import (
	"log"
	"sync"
	"time"

	"go-trader/internal/amqp"
	"go-trader/internal/state"
)

// CentralLedger coordinates all data sources and maintains the trading system's state
type CentralLedger struct {
	// Core components
	stateManager   *state.StateManager
	messageHandler *amqp.MessageHandler
	publisher      *amqp.Publisher
	hub            interface{} // Will be set to websocket.Hub

	// Configuration
	instrumentList        []string
	historicalBarsToFetch int

	// Control channels
	commandChannel chan LedgerCommand
	stopChannel    chan struct{}
	wg             sync.WaitGroup

	// Statistics
	startTime         time.Time
	messagesProcessed map[string]int64
	lastHistRequest   map[string]time.Time
	mu                sync.RWMutex
}

// LedgerCommand represents commands that can be sent to the ledger
type LedgerCommand struct {
	Type       string
	Instrument string
	Data       interface{}
}

// LedgerStats represents real-time statistics about the ledger
type LedgerStats struct {
	Uptime              time.Duration
	MessagesProcessed   map[string]int64
	ActiveInstruments   []string
	TickCounts          map[string]int
	BarCounts           map[string]map[string]int
	HistoricalBarCounts map[string]map[string]int
}

// NewCentralLedger creates a new central ledger instance
func NewCentralLedger(
	stateManager *state.StateManager,
	messageHandler *amqp.MessageHandler,
	publisher *amqp.Publisher,
	hub interface{},
	instrumentList []string,
	historicalBarsToFetch int,
) *CentralLedger {

	return &CentralLedger{
		stateManager:          stateManager,
		messageHandler:        messageHandler,
		publisher:             publisher,
		hub:                   hub,
		instrumentList:        instrumentList,
		historicalBarsToFetch: historicalBarsToFetch,
		commandChannel:        make(chan LedgerCommand, 100),
		stopChannel:           make(chan struct{}),
		startTime:             time.Now(),
		messagesProcessed:     make(map[string]int64),
		lastHistRequest:       make(map[string]time.Time),
	}
}

// Start initializes and starts all ledger operations
func (cl *CentralLedger) Start() error {
	log.Println("Starting Central Ledger...")

	// Start the command processor
	cl.wg.Add(1)
	go cl.commandProcessor()

	// Start the statistics broadcaster
	cl.wg.Add(1)
	go cl.statsBroadcaster()

	// Initialize historical data requests
	if err := cl.initializeHistoricalData(); err != nil {
		log.Printf("Warning: Failed to initialize historical data: %v", err)
	}

	// Start ledger health checker to backfill/ensure completeness
	cl.startLedgerHealthChecker()

	log.Printf("Central Ledger started successfully for %d instruments", len(cl.instrumentList))
	return nil
}

// Stop gracefully shuts down the ledger
func (cl *CentralLedger) Stop() {
	log.Println("Stopping Central Ledger...")
	close(cl.stopChannel)
	cl.wg.Wait()
	log.Println("Central Ledger stopped")
}

// SendCommand sends a command to the ledger
func (cl *CentralLedger) SendCommand(cmd LedgerCommand) {
	select {
	case cl.commandChannel <- cmd:
		// Command sent successfully
	case <-cl.stopChannel:
		// Ledger is stopping
		log.Printf("Cannot send command, ledger is stopping: %s", cmd.Type)
	}
}

// GetStats returns current ledger statistics
func (cl *CentralLedger) GetStats() LedgerStats {
	cl.mu.RLock()
	defer cl.mu.RUnlock()

	stats := LedgerStats{
		Uptime:              time.Since(cl.startTime),
		MessagesProcessed:   make(map[string]int64),
		ActiveInstruments:   make([]string, len(cl.instrumentList)),
		TickCounts:          make(map[string]int),
		BarCounts:           make(map[string]map[string]int),
		HistoricalBarCounts: make(map[string]map[string]int),
	}

	// Copy message counts
	for k, v := range cl.messagesProcessed {
		stats.MessagesProcessed[k] = v
	}

	// Copy instrument list
	copy(stats.ActiveInstruments, cl.instrumentList)

	// Get current data counts from state manager
	for _, instrument := range cl.instrumentList {
		stats.TickCounts[instrument] = len(cl.stateManager.GetTicks(instrument))

		stats.BarCounts[instrument] = make(map[string]int)
		stats.HistoricalBarCounts[instrument] = make(map[string]int)

		periods := []string{"TEN_SECS", "ONE_MIN", "FIVE_MINS", "FIFTEEN_MINS", "ONE_HOUR", "FOUR_HOURS", "DAILY"}
		for _, period := range periods {
			stats.BarCounts[instrument][period] = len(cl.stateManager.GetBars(instrument, period))
			stats.HistoricalBarCounts[instrument][period] = len(cl.stateManager.GetHistoricalBars(instrument, period))
		}
	}

	return stats
}

// commandProcessor handles incoming commands
func (cl *CentralLedger) commandProcessor() {
	defer cl.wg.Done()
	log.Println("Command processor started")

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-cl.stopChannel:
			log.Println("Command processor stopping")
			return

		case cmd := <-cl.commandChannel:
			cl.processCommand(cmd)

		case <-ticker.C:
			cl.performMaintenanceTasks()
		}
	}
}

// processCommand handles individual commands
func (cl *CentralLedger) processCommand(cmd LedgerCommand) {
	cl.mu.Lock()
	cl.messagesProcessed[cmd.Type]++
	cl.mu.Unlock()

	switch cmd.Type {
	case "REQUEST_HISTORICAL_DATA":
		if instrument, ok := cmd.Data.(string); ok {
			log.Printf("Processing historical data request for %s", instrument)
			if err := cl.publisher.RequestHistoricalBars(instrument, cl.historicalBarsToFetch); err != nil {
				log.Printf("Failed to request historical data for %s: %v", instrument, err)
			}
		}

	case "UPDATE_INSTRUMENT_STATUS":
		if instrument, ok := cmd.Data.(string); ok {
			log.Printf("Updating status for instrument %s", instrument)
			// Could add instrument-specific status tracking here
		}

	default:
		log.Printf("Unknown command type: %s", cmd.Type)
	}
}

// statsBroadcaster periodically broadcasts ledger statistics
func (cl *CentralLedger) statsBroadcaster() {
	defer cl.wg.Done()
	log.Println("Statistics broadcaster started")

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-cl.stopChannel:
			log.Println("Statistics broadcaster stopping")
			return

		case <-ticker.C:
			stats := cl.GetStats()
			log.Printf("Ledger Stats - Uptime: %v, Instruments: %d, Total Messages: %d",
				stats.Uptime.Truncate(time.Second),
				len(stats.ActiveInstruments),
				cl.getTotalMessageCount())

			// Broadcast stats to WebSocket clients if needed
			// cl.hub.BroadcastLedgerStats(stats)
		}
	}
}

// performMaintenanceTasks runs periodic maintenance tasks
func (cl *CentralLedger) performMaintenanceTasks() {
	// Check for stale data and clean up if necessary
	cl.checkDataConsistency()

	// Log current ledger state
	cl.logCurrentState()
}

// checkDataConsistency validates data integrity across instruments
func (cl *CentralLedger) checkDataConsistency() {
	for _, instrument := range cl.instrumentList {
		ticks := cl.stateManager.GetTicks(instrument)

		// Check if we have recent tick data (within last 5 minutes)
		if len(ticks) > 0 {
			lastTick := ticks[len(ticks)-1]
			timeSinceLastTick := time.Since(time.UnixMilli(lastTick.Timestamp))

			if timeSinceLastTick > 5*time.Minute {
				log.Printf("WARNING: Stale tick data for %s - last tick %v ago",
					instrument, timeSinceLastTick.Truncate(time.Second))
			}
		} else {
			log.Printf("WARNING: No tick data available for %s", instrument)
		}
	}
}

// logCurrentState logs a summary of the current ledger state
func (cl *CentralLedger) logCurrentState() {
	totalTicks := 0
	totalBars := 0
	totalHistoricalBars := 0

	for _, instrument := range cl.instrumentList {
		totalTicks += len(cl.stateManager.GetTicks(instrument))

		periods := []string{"TEN_SECS", "ONE_MIN", "FIVE_MINS", "FIFTEEN_MINS", "ONE_HOUR", "FOUR_HOURS", "DAILY"}
		for _, period := range periods {
			totalBars += len(cl.stateManager.GetBars(instrument, period))
			totalHistoricalBars += len(cl.stateManager.GetHistoricalBars(instrument, period))
		}
	}

	log.Printf("Ledger State - Ticks: %d, Bars: %d, Historical Bars: %d",
		totalTicks, totalBars, totalHistoricalBars)
}

// initializeHistoricalData requests historical data for all instruments
func (cl *CentralLedger) initializeHistoricalData() error {
	log.Printf("Requesting initial historical data for %d instruments (%d bars each)...",
		len(cl.instrumentList), cl.historicalBarsToFetch)

	for _, instrument := range cl.instrumentList {
		if err := cl.publisher.RequestHistoricalBars(instrument, cl.historicalBarsToFetch); err != nil {
			log.Printf("Failed to request historical data for %s: %v", instrument, err)
			continue
		}
		log.Printf("Requested %d historical bars for %s", cl.historicalBarsToFetch, instrument)
	}

	return nil
}

// getTotalMessageCount returns the total number of messages processed
func (cl *CentralLedger) getTotalMessageCount() int64 {
	cl.mu.RLock()
	defer cl.mu.RUnlock()

	total := int64(0)
	for _, count := range cl.messagesProcessed {
		total += count
	}
	return total
}

// RequestHistoricalDataForInstrument sends a command to request historical data
func (cl *CentralLedger) RequestHistoricalDataForInstrument(instrument string) {
	cl.SendCommand(LedgerCommand{
		Type:       "REQUEST_HISTORICAL_DATA",
		Instrument: instrument,
		Data:       instrument,
	})
}

// SetHub sets the WebSocket hub reference
func (cl *CentralLedger) SetHub(hub interface{}) {
	cl.mu.Lock()
	defer cl.mu.Unlock()
	cl.hub = hub
}

// GetInstruments returns the list of active instruments
func (cl *CentralLedger) GetInstruments() []string {
	return cl.instrumentList
}


// startLedgerHealthChecker periodically ensures we have the desired number of
// historical bars for each instrument/period and re-requests if missing.
func (cl *CentralLedger) startLedgerHealthChecker() {
	cl.wg.Add(1)
	go func() {
		defer cl.wg.Done()
		log.Println("Ledger health checker started")
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		cooldown := 30 * time.Second
		periods := []string{"TEN_SECS", "ONE_MIN", "FIVE_MINS", "FIFTEEN_MINS", "ONE_HOUR", "FOUR_HOURS", "DAILY"}
		for {
			select {
			case <-cl.stopChannel:
				log.Println("Ledger health checker stopping")
				return
			case <-ticker.C:
				for _, instrument := range cl.instrumentList {
					// If any period is short, request for this instrument (requester sends all periods)
					needs := false
					for _, p := range periods {
						if len(cl.stateManager.GetHistoricalBars(instrument, p)) < cl.historicalBarsToFetch {
							needs = true
							break
						}
					}
					if !needs {
						continue
					}
					cl.mu.Lock()
					last := cl.lastHistRequest[instrument]
					if time.Since(last) < cooldown {
						cl.mu.Unlock()
						continue
					}
					cl.lastHistRequest[instrument] = time.Now()
					cl.mu.Unlock()
					log.Printf("HealthCheck: %s missing historical bars; requesting %d bars", instrument, cl.historicalBarsToFetch)
					if err := cl.publisher.RequestHistoricalBars(instrument, cl.historicalBarsToFetch); err != nil {
						log.Printf("HealthCheck: failed to request historical bars for %s: %v", instrument, err)
					}
				}
			}
		}
	}()
}
