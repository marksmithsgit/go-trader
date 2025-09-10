package amqp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/rabbitmq/amqp091-go"
)

const (
	tradeCommandsQueue = "Trade_Commands"
)

// instrumentList contains all instruments the system trades.
// Used for declaring historical request queues for all currency pairs.
var instrumentList = []string{
	"EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD",
	"USDCAD", "NZDUSD", "EURJPY", "GBPJPY", "EURGBP",
}

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
	for _, instrument := range instrumentList {
		queueName := fmt.Sprintf("%s_H-Requests", instrument)
		_, err = ch.QueueDeclare(
			queueName,
			true,  // durable
			false, // delete when unused
			false, // exclusive
			false, // no-wait
			nil,   // arguments
		)
		if err != nil {
			return nil, fmt.Errorf("failed to declare queue '%s': %w", queueName, err)
		}
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
// What:
//   Publish a request that the JForex HistoricalBarRequester strategies will parse reliably.
// How:
//   Their current Java parser naively strips only '{' and '"' and then splits on commas/colons.
//   JSON bodies like {"barsCount":200} leave a trailing '}', causing NumberFormatException.
//   To be robust, we publish a simple plain-text key/value payload without braces or quotes:
//     instrument:EURUSD,barsCount:200
// Params:
//   instrument string, barsCount int
// Returns:
//   error if publish fails.
func (p *Publisher) RequestHistoricalBars(instrument string, barsCount int) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	queueName := fmt.Sprintf("%s_H-Requests", instrument)

	// Plain-text payload compatible with the requester's naive parser
	payload := fmt.Sprintf("instrument:%s,barsCount:%d", instrument, barsCount)

	err := p.channel.PublishWithContext(ctx,
		"", // exchange
		queueName,
		false, // mandatory
		false, // immediate
		amqp091.Publishing{
			ContentType: "text/plain",
			Body:        []byte(payload),
		},
	)

	if err != nil {
		return fmt.Errorf("failed to publish historical request for %s to queue %s: %w", instrument, queueName, err)
	}
	return nil
}

// RequestAllHistoricalBars sends a request to fetch historical data for all instruments.
func (p *Publisher) RequestAllHistoricalBars(barsCount int) error {
	log.Printf("Broadcasting historical bar request for %d bars to all %d instruments...", barsCount, len(instrumentList))
	for _, instrument := range instrumentList {
		err := p.RequestHistoricalBars(instrument, barsCount)
		if err != nil {
			// Log the error but continue trying other instruments
			log.Printf("Failed to publish historical request for %s: %v", instrument, err)
		}
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

// TradeCommand is the generic payload consumed by JForex TradeManager
// Fields align with TradeManager.java parseSimpleJson expectations
// command: SUBMIT_ORDER | CLOSE_ORDER | MODIFY_ORDER
// orderCmd: BUY | SELL | BUY_LIMIT | SELL_LIMIT | BUY_STOP | SELL_STOP
// amount: JForex order amount (e.g., 0.10 = 10k units)
// stopLossPrice / takeProfitPrice: absolute prices (optional)
// slippage: in pips (optional)
type TradeCommand struct {
	Command         string  `json:"command"`
	Label           string  `json:"label,omitempty"`
	Instrument      string  `json:"instrument,omitempty"`
	OrderCmd        string  `json:"orderCmd,omitempty"`
	Amount          float64 `json:"amount,omitempty"`
	Price           float64 `json:"price,omitempty"`
	Slippage        float64 `json:"slippage,omitempty"`
	StopLossPrice   float64 `json:"stopLossPrice,omitempty"`
	TakeProfitPrice float64 `json:"takeProfitPrice,omitempty"`
	OrderID         string  `json:"orderId,omitempty"`
}

// PublishSubmitOrder publishes a SUBMIT_ORDER command
func (p *Publisher) PublishSubmitOrder(cmd TradeCommand) error {
	cmd.Command = "SUBMIT_ORDER"
	return p.publishTradeCommand(cmd)
}

// PublishCloseOrder publishes a CLOSE_ORDER command by orderId
func (p *Publisher) PublishCloseOrder(orderID string) error {
	cmd := TradeCommand{Command: "CLOSE_ORDER", OrderID: orderID}
	return p.publishTradeCommand(cmd)
}

// PublishModifyOrder publishes a MODIFY_ORDER command (e.g., to set SL/TP)
func (p *Publisher) PublishModifyOrder(orderID string, sl, tp float64) error {
	cmd := TradeCommand{Command: "MODIFY_ORDER", OrderID: orderID}
	if sl > 0 {
		cmd.StopLossPrice = sl
	}
	if tp > 0 {
		cmd.TakeProfitPrice = tp
	}
	return p.publishTradeCommand(cmd)
}

func (p *Publisher) publishTradeCommand(cmd TradeCommand) error {
	body, err := json.Marshal(cmd)
	if err != nil {
		return fmt.Errorf("failed to marshal trade command: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return p.channel.PublishWithContext(ctx, "", tradeCommandsQueue, false, false, amqp091.Publishing{
		ContentType: "application/json",
		Body:        body,
	})
}

