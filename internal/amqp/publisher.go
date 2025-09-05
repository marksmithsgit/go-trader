package amqp

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/rabbitmq/amqp091-go"
)

const (
	historicalRequestQueue = "H-Requests"
	tradeCommandsQueue     = "Trade_Commands"
)

// Publisher handles sending messages to RabbitMQ.
type Publisher struct {
	conn    *amqp091.Connection
	channel *amqp091.Channel
}

// NewPublisher creates and connects a new Publisher.
// It will attempt to connect to RabbitMQ with retries.
func NewPublisher(amqpURI string) (*Publisher, error) {
	var conn *amqp091.Connection
	var err error

	// Retry connection for a few seconds
	for i := 0; i < 10; i++ {
		conn, err = amqp091.Dial(amqpURI)
		if err == nil {
			break
		}
		fmt.Printf("RabbitMQ publisher connection attempt %d failed: %s\n", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ after 10 attempts: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		return nil, fmt.Errorf("failed to open a channel: %w", err)
	}

	// Enable publisher confirms for reliability
	err = ch.Confirm(false)
	if err != nil {
		fmt.Printf("Warning: Failed to enable publisher confirms: %s\n", err)
	}

	// Declare queues to ensure they exist
	_, err = ch.QueueDeclare(
		historicalRequestQueue,
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return nil, fmt.Errorf("failed to declare queue '%s': %w", historicalRequestQueue, err)
	}

	_, err = ch.QueueDeclare(
		tradeCommandsQueue,
		true,  // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return nil, fmt.Errorf("failed to declare queue '%s': %w", tradeCommandsQueue, err)
	}

	return &Publisher{conn: conn, channel: ch}, nil
}

// RequestHistoricalBars sends a request to fetch historical data for a given instrument.
type HistoricalRequest struct {
	Instrument string `json:"instrument"`
	BarsCount  int    `json:"barsCount"`
}

func (p *Publisher) RequestHistoricalBars(instrument string, barsCount int) error {
	req := HistoricalRequest{
		Instrument: instrument,
		BarsCount:  barsCount,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal historical request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err = p.channel.PublishWithContext(ctx,
		"", // exchange
		historicalRequestQueue,
		false, // mandatory
		false, // immediate
		amqp091.Publishing{
			ContentType: "application/json",
			Body:        body,
		},
	)

	if err != nil {
		return fmt.Errorf("failed to publish historical request for %s: %w", instrument, err)
	}

	return nil
}

// Close closes the publisher's channel and connection.
func (p *Publisher) Close() {
	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
}
