package amqp

import (
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

	accountInfoQueue = "Account_Info"
)

// Note: instrumentList is declared in publisher.go to avoid duplication

// Consumer handles receiving messages from RabbitMQ.
type Consumer struct {
	conn           *amqp091.Connection
	messageHandler *MessageHandler
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

	messageHandler := NewMessageHandler(sm)
	messageHandler.Start()

	return &Consumer{conn: conn, messageHandler: messageHandler}, nil
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
				false, // auto-ack (manual acks in processors)
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
	handleFunc(accountInfoQueue, c.accountInfoHandler)

	// Start a consumer for each instrument's live bar queue
	// Note: Some queues may not exist yet, which is fine - we'll skip them
	for _, instrument := range instrumentList {
		barQueueName := fmt.Sprintf("%s_Market_Data_Bars", instrument)
		handleFunc(barQueueName, c.barHandler)
	}

	// Start a consumer for each instrument's historical bar queue
	for _, instrument := range instrumentList {
		historicalBarQueueName := fmt.Sprintf("%s_H-Bars", instrument)
		handleFunc(historicalBarQueueName, c.historicalBarHandler)
	}

	return nil
}

// isStale checks if a message is older than the defined threshold.
func isStale(producedAt int64) bool {
	return time.Now().UnixMilli()-producedAt > staleMessageThreshold.Milliseconds()
}

func (c *Consumer) tickHandler(d amqp091.Delivery) {
	// Pass tick messages to the dedicated tick processor
	c.messageHandler.EnqueueTick(d)
}

func (c *Consumer) barHandler(d amqp091.Delivery) {
	// Pass bar messages to the dedicated bar processors
	c.messageHandler.EnqueueBar(d)
}

func (c *Consumer) historicalBarHandler(d amqp091.Delivery) {
	// Pass historical bar messages to the dedicated historical processors
	c.messageHandler.EnqueueHistorical(d)
}

func (c *Consumer) accountInfoHandler(d amqp091.Delivery) {
	// Pass account info messages to the dedicated account processor
	c.messageHandler.EnqueueAccount(d)
}

// DrainQueues consumes and discards all messages currently in the queues.
// This is useful on startup to clear any backlog of stale data.
func (c *Consumer) DrainQueues(duration time.Duration) error {
	ch, err := c.conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open a channel: %w", err)
	}
	defer ch.Close()

	queuesToDrain := []string{ticksQueue, accountInfoQueue}
	for _, instrument := range instrumentList {
		queuesToDrain = append(queuesToDrain, fmt.Sprintf("%s_Market_Data_Bars", instrument))
		queuesToDrain = append(queuesToDrain, fmt.Sprintf("%s_H-Bars", instrument))
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

// GetMessageHandler returns the message handler for external access
func (c *Consumer) GetMessageHandler() *MessageHandler {
	return c.messageHandler
}

// Close closes the consumer's connection and message handler.
func (c *Consumer) Close() {
	if c.messageHandler != nil {
		c.messageHandler.Stop()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}
