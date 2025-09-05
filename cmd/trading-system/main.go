package main

import (
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
	"go-trader/internal/state"
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
	AccountInfo    state.AccountInfo                           `json:"accountInfo"`
	Ticks          map[string][]state.Tick                     `json:"ticks"`
	Bars           map[string]map[string][]state.Bar           `json:"bars"`
	HistoricalBars map[string]map[string][]state.HistoricalBar `json:"historicalBars"`
}

// FrontendCommunicator handles communication between frontend and ledger
type FrontendCommunicator struct {
	stateManager   *state.StateManager
	hub            *websocket.Hub
	instrumentList []string
	publisher      *amqp.Publisher
}

func (fc *FrontendCommunicator) Start() {
	ticker := time.NewTicker(broadcastInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			fc.broadcastCurrentState()
		default:
			// Non-blocking check for commands
			select {
			case command := <-fc.hub.Commands:
				fc.processCommand(command)
			default:
				// No command available, continue
				time.Sleep(10 * time.Millisecond)
			}
		}
	}
}

func (fc *FrontendCommunicator) broadcastCurrentState() {
	accountInfo := fc.stateManager.GetAccountInfo()
	log.Printf("DEBUG: Account Info - Balance: %.2f, Equity: %.2f", accountInfo.Account.Balance, accountInfo.Account.Equity)

	fullState := FullState{
		AccountInfo:    accountInfo,
		Ticks:          make(map[string][]state.Tick),
		Bars:           make(map[string]map[string][]state.Bar),
		HistoricalBars: make(map[string]map[string][]state.HistoricalBar),
	}

	// Get data for all active instruments
	for _, instrument := range fc.instrumentList {
		fullState.Ticks[instrument] = fc.stateManager.GetTicks(instrument)
		fullState.Bars[instrument] = make(map[string][]state.Bar)
		fullState.HistoricalBars[instrument] = make(map[string][]state.HistoricalBar)

		// Get bars for all periods that JForex should send
		periods := []string{"TEN_SECS", "ONE_MIN", "FIVE_MINS", "FIFTEEN_MINS", "ONE_HOUR", "FOUR_HOURS", "DAILY"}
		for _, period := range periods {
			bars := fc.stateManager.GetBars(instrument, period)
			if len(bars) > 0 {
				fullState.Bars[instrument][period] = bars
				log.Printf("DEBUG: Found %d bars for %s period %s", len(bars), instrument, period)
			}

			historicalBars := fc.stateManager.GetHistoricalBars(instrument, period)
			if len(historicalBars) > 0 {
				fullState.HistoricalBars[instrument][period] = historicalBars
				log.Printf("DEBUG: Found %d historical bars for %s period %s", len(historicalBars), instrument, period)
			}
		}
	}

	// Debug: Check what we actually have
	tickCount := 0
	barCount := 0
	for _, ticks := range fullState.Ticks {
		tickCount += len(ticks)
	}
	for _, periods := range fullState.Bars {
		for _, bars := range periods {
			barCount += len(bars)
		}
	}

	log.Printf("DEBUG: Broadcasting - Ticks: %d, Bars: %d", tickCount, barCount)

	jsonData, err := json.Marshal(fullState)
	if err != nil {
		log.Printf("Error marshalling state for frontend: %s", err)
		return
	}

	fc.hub.Broadcast(jsonData)
}

// processCommand handles incoming commands from the frontend
func (fc *FrontendCommunicator) processCommand(command []byte) {
	log.Printf("DEBUG: Processing command: %s", string(command))

	var req struct {
		Type       string `json:"type"`
		Instrument string `json:"instrument"`
		Timestamp  int64  `json:"timestamp"`
	}

	if err := json.Unmarshal(command, &req); err != nil {
		log.Printf("Error parsing command: %v", err)
		return
	}

	switch req.Type {
	case "HISTORICAL_DATA_REQUEST":
		log.Printf("🔄 Received historical data request for instrument: %s", req.Instrument)
		fc.RequestHistoricalData(req.Instrument)
	default:
		log.Printf("Unknown command type: %s", req.Type)
	}
}

// RequestHistoricalData handles requests for historical data from the frontend
func (fc *FrontendCommunicator) RequestHistoricalData(instrument string) {
	log.Printf("Requesting historical data for instrument: %s", instrument)

	// Request historical data using the publisher
	if err := fc.publisher.RequestHistoricalBars(instrument, 1000); err != nil {
		log.Printf("Error requesting historical data for %s: %v", instrument, err)
	} else {
		log.Printf("Successfully requested historical data for %s", instrument)
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
// Temporarily disabled most queues except EURUSD for testing
var instrumentList = []string{
	"EURUSD", // Only EURUSD enabled for now
	// "GBPUSD", "USDJPY", "USDCHF", "AUDUSD",
	// "USDCAD", "NZDUSD", "EURJPY", "GBPJPY", "EURGBP",
}

func main() {
	log.Println("Starting Go Trading System Backend...")

	// --- 1. Initialize Core Components ---
	stateManager := state.NewStateManager()
	log.Println("State Manager initialized.")

	publisher, err := amqp.NewPublisher(amqpURI)
	if err != nil {
		log.Fatalf("Failed to initialize AMQP publisher: %s", err)
	}
	defer publisher.Close()
	log.Println("AMQP Publisher initialized.")

	consumer, err := amqp.NewConsumer(amqpURI, stateManager)
	if err != nil {
		log.Fatalf("Failed to initialize AMQP consumer: %s", err)
	}
	defer consumer.Close()
	log.Println("AMQP Consumer initialized.")

	log.Println("--- Startup Sequence Initiated ---")

	// Drain queues to clear any backlog
	log.Println("Attempting to drain queues...")
	if err := consumer.DrainQueues(drainDuration); err != nil {
		log.Printf("Warning: Failed to drain queues: %s", err)
	}
	log.Println("Queue draining process completed.")

	// Request historical data for all instruments
	log.Printf("Requesting initial historical data for %d instruments...", len(instrumentList))
	for _, instrument := range instrumentList {
		log.Printf("Requesting historical data for %s...", instrument)
		if err := publisher.RequestHistoricalBars(instrument, historicalBarsToFetch); err != nil {
			log.Printf("Warning: Failed to request historical bars for %s: %s", instrument, err)
		}
	}
	log.Println("Historical data requests sent.")

	// --- 3. Start Live Consumers ---
	log.Println("Starting live consumers...")
	if err := consumer.StartConsumers(); err != nil {
		log.Fatalf("Failed to start consumers: %s", err)
	}
	log.Println("Live consumers started. System is now operational.")

	// --- 4. Start WebSocket Hub and Broadcaster ---
	hub := websocket.NewHub()
	go hub.Run()
	log.Println("WebSocket Hub started.")

	// Start frontend communication handler
	go func() {
		frontendComm := &FrontendCommunicator{
			stateManager:   stateManager,
			hub:            hub,
			instrumentList: instrumentList,
			publisher:      publisher,
		}
		frontendComm.Start()
	}()

	// --- 5. Start WebSocket server with port conflict resolution ---
	go func() {
		webSocketAddr := ":8080"
		maxRetries := 5

		for i := 0; i < maxRetries; i++ {
			listener, err := net.Listen("tcp", webSocketAddr)
			if err != nil {
				if strings.Contains(err.Error(), "address already in use") {
					log.Printf("Port %s already in use, attempting to kill conflicting process (attempt %d/%d)", webSocketAddr, i+1, maxRetries)

					// Find and kill process using the port
					if killProcessUsingPort("8080") {
						log.Printf("Successfully killed conflicting process, retrying in 2 seconds...")
						time.Sleep(2 * time.Second)
						continue
					} else {
						log.Printf("Failed to kill conflicting process, trying different port")
						// Try a different port
						webSocketAddr = ":8081"
						i-- // Don't count this as a retry
						continue
					}
				} else {
					log.Fatalf("Failed to start WebSocket server: %s", err)
				}
			}

			// Successfully got the port
			log.Printf("WebSocket server listening on %s", webSocketAddr)

			// Handle WebSocket connections
			http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
				hub.ServeWs(w, r)
			})

			if err := http.Serve(listener, nil); err != nil {
				log.Printf("WebSocket server error: %s", err)
			}
			return
		}

		log.Fatalf("Failed to start WebSocket server after %d attempts", maxRetries)
	}()

	// --- 6. Wait for Shutdown Signal ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutdown signal received. Closing connections and exiting.")
}
