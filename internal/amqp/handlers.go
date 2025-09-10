package amqp

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"go-trader/internal/state"

	"github.com/rabbitmq/amqp091-go"
)

// MessageHandler manages different types of message processing with dedicated goroutines
type MessageHandler struct {
	stateManager      *state.StateManager
	tickChannel       chan amqp091.Delivery
	barChannel        chan amqp091.Delivery
	historicalChannel chan amqp091.Delivery
	accountChannel    chan amqp091.Delivery
	stopChannel       chan struct{}
	wg                sync.WaitGroup
}

// NewMessageHandler creates a new message handler with dedicated channels
func NewMessageHandler(sm *state.StateManager) *MessageHandler {
	return &MessageHandler{
		stateManager:      sm,
		tickChannel:       make(chan amqp091.Delivery, 1000), // Buffer for high-frequency ticks
		barChannel:        make(chan amqp091.Delivery, 100),
		historicalChannel: make(chan amqp091.Delivery, 500), // Buffer for bulk historical data
		accountChannel:    make(chan amqp091.Delivery, 10),
		stopChannel:       make(chan struct{}),
	}
}

// Start launches all message processing goroutines
func (mh *MessageHandler) Start() {
	log.Println("Starting message handler with dedicated goroutines...")

	// Start tick processing goroutine
	mh.wg.Add(1)
	go mh.tickProcessor()

	// Start bar processing goroutines (multiple for load balancing)
	for i := 0; i < 3; i++ {
		mh.wg.Add(1)
		go mh.barProcessor(i)
	}

	// Start historical bar processing goroutines
	for i := 0; i < 2; i++ {
		mh.wg.Add(1)
		go mh.historicalProcessor(i)
	}

	// Start account info processing goroutine
	mh.wg.Add(1)
	go mh.accountProcessor()

	log.Println("All message processing goroutines started")
}

// Stop gracefully shuts down all message processing goroutines
func (mh *MessageHandler) Stop() {
	log.Println("Stopping message handler...")
	close(mh.stopChannel)
	mh.wg.Wait()
	log.Println("All message processing goroutines stopped")
}

// EnqueueTick sends a tick message to the tick processing channel
func (mh *MessageHandler) EnqueueTick(delivery amqp091.Delivery) {
	select {
	case mh.tickChannel <- delivery:
		// Successfully enqueued
	case <-mh.stopChannel:
		// Handler is stopping
		return
	default:
		// Channel full, discard message to prevent blocking
		log.Printf("WARNING: Tick channel full, discarding message for %s", delivery.RoutingKey)
		delivery.Nack(false, false) // Don't requeue
	}
}

// EnqueueBar sends a bar message to the bar processing channel
func (mh *MessageHandler) EnqueueBar(delivery amqp091.Delivery) {
	select {
	case mh.barChannel <- delivery:
		// Successfully enqueued
	case <-mh.stopChannel:
		// Handler is stopping
		return
	default:
		// Channel full, discard message to prevent blocking
		log.Printf("WARNING: Bar channel full, discarding message for %s", delivery.RoutingKey)
		delivery.Nack(false, false) // Don't requeue
	}
}

// EnqueueHistorical sends a historical bar message to the historical processing channel
func (mh *MessageHandler) EnqueueHistorical(delivery amqp091.Delivery) {
	select {
	case mh.historicalChannel <- delivery:
		// Successfully enqueued
	case <-mh.stopChannel:
		// Handler is stopping
		return
	default:
		// Channel full, discard message to prevent blocking
		log.Printf("WARNING: Historical channel full, discarding message for %s", delivery.RoutingKey)
		delivery.Nack(false, false) // Don't requeue
	}
}

// EnqueueAccount sends an account info message to the account processing channel
func (mh *MessageHandler) EnqueueAccount(delivery amqp091.Delivery) {
	select {
	case mh.accountChannel <- delivery:
		// Successfully enqueued
	case <-mh.stopChannel:
		// Handler is stopping
		return
	default:
		// Channel full, discard message to prevent blocking
		log.Printf("WARNING: Account channel full, discarding message for %s", delivery.RoutingKey)
		delivery.Nack(false, false) // Don't requeue
	}
}

// tickProcessor handles high-frequency tick messages
func (mh *MessageHandler) tickProcessor() {
	defer mh.wg.Done()
	log.Println("Tick processor started")

	ticker := time.NewTicker(time.Second * 5) // Log stats every 5 seconds
	defer ticker.Stop()

	processedTicks := 0

	for {
		select {
		case <-mh.stopChannel:
			log.Printf("Tick processor stopping. Total ticks processed: %d", processedTicks)
			return

		case delivery := <-mh.tickChannel:
			mh.processTick(delivery)
			processedTicks++

		case <-ticker.C:
			log.Printf("Tick processor stats: %d ticks processed in last 5 seconds", processedTicks)
			processedTicks = 0
		}
	}
}

// barProcessor handles live bar messages
func (mh *MessageHandler) barProcessor(id int) {
	defer mh.wg.Done()
	log.Printf("Bar processor %d started", id)

	ticker := time.NewTicker(time.Second * 10) // Log stats every 10 seconds
	defer ticker.Stop()

	processedBars := 0

	for {
		select {
		case <-mh.stopChannel:
			log.Printf("Bar processor %d stopping. Total bars processed: %d", id, processedBars)
			return

		case delivery := <-mh.barChannel:
			mh.processBar(delivery)
			processedBars++

		case <-ticker.C:
			log.Printf("Bar processor %d stats: %d bars processed in last 10 seconds", id, processedBars)
			processedBars = 0
		}
	}
}

// historicalProcessor handles bulk historical bar messages
func (mh *MessageHandler) historicalProcessor(id int) {
	defer mh.wg.Done()
	log.Printf("Historical processor %d started", id)

	ticker := time.NewTicker(time.Second * 30) // Log stats every 30 seconds
	defer ticker.Stop()

	processedBars := 0

	for {
		select {
		case <-mh.stopChannel:
			log.Printf("Historical processor %d stopping. Total historical bars processed: %d", id, processedBars)
			return

		case delivery := <-mh.historicalChannel:
			mh.processHistoricalBar(delivery)
			processedBars++

		case <-ticker.C:
			log.Printf("Historical processor %d stats: %d bars processed in last 30 seconds", id, processedBars)
			processedBars = 0
		}
	}
}

// accountProcessor handles account and position messages
func (mh *MessageHandler) accountProcessor() {
	defer mh.wg.Done()
	log.Println("Account processor started")

	for {
		select {
		case <-mh.stopChannel:
			log.Println("Account processor stopping")
			return

		case delivery := <-mh.accountChannel:
			mh.processAccountInfo(delivery)
		}
	}
}

// processTick handles individual tick messages
func (mh *MessageHandler) processTick(delivery amqp091.Delivery) {
	var tick state.Tick
	if err := json.Unmarshal(delivery.Body, &tick); err != nil {
		log.Printf("Error unmarshalling tick: %s", err)
		delivery.Nack(false, false)
		return
	}

	if isStale(tick.ProducedAt) {
		delivery.Ack(false)
		return
	}

	mh.stateManager.UpdateTick(tick)
	delivery.Ack(false)
}

// processBar handles individual bar messages
func (mh *MessageHandler) processBar(delivery amqp091.Delivery) {
	var bar state.Bar
	if err := json.Unmarshal(delivery.Body, &bar); err != nil {
		log.Printf("Error unmarshalling bar: %s", err)
		delivery.Nack(false, false)
		return
	}

	if isStale(bar.ProducedAt) {
		delivery.Ack(false)
		return
	}

	log.Printf("Processing live bar for %s, period: %s", bar.Instrument, bar.Period)
	mh.stateManager.UpdateLiveBar(bar)
	delivery.Ack(false)
}

// processHistoricalBar handles historical bar messages
func (mh *MessageHandler) processHistoricalBar(delivery amqp091.Delivery) {
	var bar state.HistoricalBar
	if err := json.Unmarshal(delivery.Body, &bar); err != nil {
		log.Printf("Error unmarshalling historical bar: %s", err)
		delivery.Nack(false, false)
		return
	}


	log.Printf("Processing historical bar for %s, period: %s, sequence: %d", bar.Instrument, bar.Period, bar.Sequence)
	mh.stateManager.UpdateHistoricalBar(bar)
	delivery.Ack(false)
}

// processAccountInfo handles account and position messages
func (mh *MessageHandler) processAccountInfo(delivery amqp091.Delivery) {
	var info state.AccountInfo
	if err := json.Unmarshal(delivery.Body, &info); err != nil {
		log.Printf("Error unmarshalling account info: %s", err)
		delivery.Nack(false, false)
		return
	}

	if isStale(info.ProducedAt) {
		delivery.Ack(false)
		return
	}

	log.Printf("Processing account info - Balance: %.2f, Equity: %.2f, Positions: %d",
		info.Account.Balance, info.Account.Equity, len(info.Positions))
	mh.stateManager.UpdateAccountInfo(info)
	delivery.Ack(false)
}
