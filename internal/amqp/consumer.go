package amqp

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"go-trader/internal/state"

	"github.com/rabbitmq/amqp091-go"
)

const (
	staleMessageThreshold = 3 * time.Second
	ticksQueue            = "Market_Data_Ticks"
	historicalBarsQueue   = "H-Bars"
	accountInfoQueue      = "Account_Info"
)

// A list of all instruments the system trades.
// This will be used to dynamically create queue consumers for each instrument's bar data.
// Temporarily disabled most queues except EURUSD for testing
var instrumentList = []string{
	"EURUSD", // Only EURUSD enabled for now
	// "GBPUSD", "USDJPY", "USDCHF", "AUDUSD",
	// "USDCAD", "NZDUSD", "EURJPY", "GBPJPY", "EURGBP",
}

// Consumer handles receiving messages from RabbitMQ.
type Consumer struct {
	conn         *amqp091.Connection
	stateManager *state.StateManager
}

// NewConsumer creates and connects a new Consumer.
func NewConsumer(amqpURI string, sm *state.StateManager) (*Consumer, error) {
	var conn *amqp091.Connection
	var err error

	for i := 0; i < 10; i++ {
		conn, err = amqp091.Dial(amqpURI)
		if err == nil {
			break
		}
		log.Printf("RabbitMQ connection attempt %d failed: %s", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ after 10 attempts: %w", err)
	}

	return &Consumer{conn: conn, stateManager: sm}, nil
}

// StartConsumers starts a goroutine for each queue to begin consuming messages.
func (c *Consumer) StartConsumers() error {
	ch, err := c.conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open a channel: %w", err)
	}

	// Enable channel flow control and set QoS
	err = ch.Qos(1, 0, false)
	if err != nil {
		log.Printf("Warning: Failed to set QoS: %s", err)
	}

	// Generic handler function
	handleFunc := func(queueName string, handler func(d amqp091.Delivery)) {
		// Retry consumer registration a few times for robustness
		var msgs <-chan amqp091.Delivery
		var err error

		for retry := 0; retry < 3; retry++ {
			msgs, err = ch.Consume(
				queueName,
				"",    // consumer
				true,  // auto-ack
				false, // exclusive
				false, // no-local
				false, // no-wait
				nil,   // args
			)
			if err == nil {
				break
			}

			// Check for specific error types
			if strings.Contains(err.Error(), "NOT_FOUND") {
				log.Printf("Queue %s does not exist yet, skipping consumer registration", queueName)
				return
			}

			if strings.Contains(err.Error(), "channel/connection is not open") {
				log.Printf("Channel not ready for queue %s, retrying in 1 second (attempt %d/3)", queueName, retry+1)
				time.Sleep(1 * time.Second)
				continue
			}

			// Other errors
			log.Printf("Failed to register consumer for queue %s: %s", queueName, err)
			return
		}

		if err != nil {
			log.Printf("Failed to register consumer for queue %s after retries: %s", queueName, err)
			return
		}

		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Consumer for queue %s panicked: %v", queueName, r)
				}
			}()

			for d := range msgs {
				handler(d)
			}
			log.Printf("Consumer for queue %s has shut down", queueName)
		}()
		log.Printf("Successfully started consumer for queue: %s", queueName)
	}

	// Start consumers for all queues
	handleFunc(ticksQueue, c.tickHandler)
	handleFunc(historicalBarsQueue, c.historicalBarHandler)
	handleFunc(accountInfoQueue, c.accountInfoHandler)

	// Start a consumer for each instrument's live bar queue
	// Note: Some queues may not exist yet, which is fine - we'll skip them
	for _, instrument := range instrumentList {
		barQueueName := fmt.Sprintf("Market_Data_Bars_%s", instrument)
		handleFunc(barQueueName, c.barHandler)
	}

	return nil
}

// isStale checks if a message is older than the defined threshold.
func isStale(producedAt int64) bool {
	return time.Now().UnixMilli()-producedAt > staleMessageThreshold.Milliseconds()
}

func (c *Consumer) tickHandler(d amqp091.Delivery) {
	var tick state.Tick
	if err := json.Unmarshal(d.Body, &tick); err != nil {
		log.Printf("Error unmarshalling tick: %s", err)
		return
	}

	if isStale(tick.ProducedAt) {
		// log.Printf("Discarding stale tick for %s", tick.Instrument)
		return
	}

	c.stateManager.UpdateTick(tick)
}

func (c *Consumer) barHandler(d amqp091.Delivery) {
	var bar state.Bar
	if err := json.Unmarshal(d.Body, &bar); err != nil {
		log.Printf("Error unmarshalling bar: %s", err)
		return
	}

	if isStale(bar.ProducedAt) {
		// log.Printf("Discarding stale bar for %s", bar.Instrument)
		return
	}

	log.Printf("DEBUG: Received bar for %s, period: %s", bar.Instrument, bar.Period)
	c.stateManager.UpdateBar(bar)
}

func (c *Consumer) historicalBarHandler(d amqp091.Delivery) {
	var bar state.HistoricalBar
	if err := json.Unmarshal(d.Body, &bar); err != nil {
		log.Printf("Error unmarshalling historical bar: %s", err)
		return
	}

	if isStale(bar.ProducedAt) {
		log.Printf("DEBUG: Discarding stale historical bar for %s, period: %s", bar.Instrument, bar.Period)
		return
	}

	log.Printf("DEBUG: Received historical bar for %s, period: %s", bar.Instrument, bar.Period)
	c.stateManager.UpdateHistoricalBar(bar)
}

func (c *Consumer) accountInfoHandler(d amqp091.Delivery) {
	var info state.AccountInfo
	if err := json.Unmarshal(d.Body, &info); err != nil {
		log.Printf("Error unmarshalling account info: %s", err)
		return
	}

	if isStale(info.ProducedAt) {
		// log.Printf("Discarding stale account info")
		return
	}

	log.Printf("DEBUG: Received account info - Balance: %.2f, Equity: %.2f", info.Account.Balance, info.Account.Equity)
	c.stateManager.UpdateAccountInfo(info)
}

// DrainQueues consumes and discards all messages currently in the queues.
// This is useful on startup to clear any backlog of stale data.
func (c *Consumer) DrainQueues(duration time.Duration) error {
	ch, err := c.conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open a channel: %w", err)
	}
	defer ch.Close()

	queuesToDrain := []string{ticksQueue, historicalBarsQueue, accountInfoQueue}
	for _, instrument := range instrumentList {
		queuesToDrain = append(queuesToDrain, fmt.Sprintf("Market_Data_Bars_%s", instrument))
	}

	log.Printf("Draining %d queues for up to %s...", len(queuesToDrain), duration)

	timeout := time.After(duration)
	totalMsgCount := 0

	for _, queueName := range queuesToDrain {
		queueMsgCount := 0
		draining := true
		for draining {
			select {
			case <-timeout:
				log.Printf("Draining timed out. Discarded %d messages in total.", totalMsgCount)
				return nil
			default:
				_, ok, err := ch.Get(queueName, true) // auto-ack
				if err != nil {
					log.Printf("Error getting message from queue %s: %s. Moving to next queue.", queueName, err)
					draining = false
					break
				}
				if !ok {
					if queueMsgCount > 0 {
						log.Printf("Drained %d messages from queue %s.", queueMsgCount, queueName)
					}
					draining = false
					break // No more messages in this queue
				}
				queueMsgCount++
				totalMsgCount++
			}
		}
	}

	log.Printf("Finished draining all specified queues. Discarded %d messages in total.", totalMsgCount)
	return nil
}

// Close closes the consumer's connection.
func (c *Consumer) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}
