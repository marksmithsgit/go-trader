package db

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
)

// Logger wraps a pgx pool and provides simple trade/log writers.
// What: Async-safe database logger for trades, logs, and strategy runs/events.
// How: Initializes a connection pool, ensures tables exist, and offers insert/query helpers.
// Params: NewLogger(dsn string) to construct. Individual Log*/Query* methods accept relevant fields.
// Returns: *Logger with Close() to release resources.
type Logger struct {
    pool *pgxpool.Pool
}

// StrategyRunRow represents a row in strategy_runs for API responses.
type StrategyRunRow struct {
    RunID      string          `json:"runId"`
    StartedAt  time.Time       `json:"startedAt"`
    StoppedAt  *time.Time      `json:"stoppedAt,omitempty"`
    Instrument string          `json:"instrument"`
    Period     string          `json:"period"`
    Strategy   string          `json:"strategyKey"`
    Qty        float64         `json:"qty"`
    AtrMult    float64         `json:"atrMult"`
    Params     json.RawMessage `json:"params"`
    Status     string          `json:"status"`
}

// StrategyEventRow represents a row in strategy_events for API responses.
type StrategyEventRow struct {
    RunID      string          `json:"runId"`
    TS         time.Time       `json:"ts"`
    Instrument string          `json:"instrument"`
    Period     string          `json:"period"`
    Strategy   string          `json:"strategyKey"`
    EventType  string          `json:"eventType"`
    Signal     string          `json:"signal,omitempty"`
    Details    json.RawMessage `json:"details,omitempty"`
}

// NewLogger creates a connection pool and ensures tables exist.
func NewLogger(dsn string) (*Logger, error) {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    pool, err := pgxpool.New(ctx, dsn)
    if err != nil {
        return nil, fmt.Errorf("pgxpool.New: %w", err)
    }
    l := &Logger{pool: pool}
    if err := l.ensureSchema(ctx); err != nil {
        pool.Close()
        return nil, err
    }
    return l, nil
}

// Close releases the pool.
func (l *Logger) Close() { if l.pool != nil { l.pool.Close() } }

// ensureSchema creates minimal tables if they don't exist.
func (l *Logger) ensureSchema(ctx context.Context) error {
    stmts := []string{
        `create table if not exists trades (
            id bigserial primary key,
            ts timestamptz not null default now(),
            label text,
            instrument text,
            side text,
            order_cmd text,
            amount numeric,
            price numeric,
            sl numeric,
            tp numeric,
            status text,
            details jsonb
        )`,
        `create table if not exists logs (
            id bigserial primary key,
            ts timestamptz not null default now(),
            level text,
            category text,
            message text,
            details jsonb
        )`,
        `create table if not exists strategy_runs (
            id bigserial primary key,
            run_id text unique not null,
            started_at timestamptz not null default now(),
            stopped_at timestamptz,
            instrument text not null,
            period text not null,
            strategy_key text not null,
            qty numeric,
            atr_mult numeric,
            params jsonb,
            status text not null default 'running'
        )`,
        `create index if not exists idx_strategy_runs_instr_per on strategy_runs(instrument, period, started_at desc)`,
        `create table if not exists strategy_events (
            id bigserial primary key,
            run_id text not null,
            ts timestamptz not null default now(),
            instrument text not null,
            period text not null,
            strategy_key text not null,
            event_type text not null,
            signal text,
            details jsonb
        )`,
        `create index if not exists idx_strategy_events_run on strategy_events(run_id, ts desc)`,
    }
    for _, s := range stmts {
        if _, err := l.pool.Exec(ctx, s); err != nil {
            return fmt.Errorf("ensureSchema: %w", err)
        }
    }
    return nil
}

// LogTradeSubmitted records a submitted order.
// instrument, side, orderCmd per TradeCommand; price 0 for market
func (l *Logger) LogTradeSubmitted(label, instrument, side, orderCmd string, amount, price, sl, tp float64, details any) {
    l.insertTrade("submitted", label, instrument, side, orderCmd, amount, price, sl, tp, details)
}

// LogTradeCloseRequested records a request to close an order.
func (l *Logger) LogTradeCloseRequested(orderID, instrument, side string) {
    details := map[string]any{"orderId": orderID}
    l.insertTrade("close_requested", orderID, instrument, side, "CLOSE_ORDER", 0, 0, 0, 0, details)
}

// LogEvent writes an arbitrary log row.
func (l *Logger) LogEvent(level, category, message string, details any) {
    go func() {
        ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
        defer cancel()
        var dj []byte
        if details != nil {
            dj, _ = json.Marshal(details)
        }
        _, _ = l.pool.Exec(ctx, `insert into logs(level, category, message, details) values($1,$2,$3,$4)`, level, category, message, dj)
    }()
}

// Strategy run/event logging
func (l *Logger) LogStrategyRunStart(runID, instrument, period, strategyKey string, qty, atrMult float64, params map[string]float64) {
    go func() {
        ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
        defer cancel()
        var pj []byte
        if params != nil { pj, _ = json.Marshal(params) }
        _, _ = l.pool.Exec(ctx, `insert into strategy_runs(run_id, instrument, period, strategy_key, qty, atr_mult, params, status)
            values($1,$2,$3,$4,$5,$6,$7,'running')`, runID, instrument, period, strategyKey, qty, atrMult, pj)
    }()
}

func (l *Logger) LogStrategyRunStop(runID, status string) {
    go func() {
        ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
        defer cancel()
        if status == "" { status = "stopped" }
        _, _ = l.pool.Exec(ctx, `update strategy_runs set stopped_at = now(), status=$2 where run_id=$1`, runID, status)
    }()
}

func (l *Logger) LogStrategyEvent(runID, instrument, period, strategyKey, eventType, signal string, details any) {
    go func() {
        ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
        defer cancel()
        var dj []byte
        if details != nil { dj, _ = json.Marshal(details) }
        _, _ = l.pool.Exec(ctx, `insert into strategy_events(run_id, instrument, period, strategy_key, event_type, signal, details)
            values($1,$2,$3,$4,$5,$6,$7)`, runID, instrument, period, strategyKey, eventType, signal, dj)
    }()
}

// LogStrategyOrderFilled writes a standardized fill event.
// details should include: label, orderId, side, entryPrice, fillPrice, qty, sl, tp, pipSize, plannedSlPips
func (l *Logger) LogStrategyOrderFilled(runID, instrument, period, strategyKey string, details any) {
    l.LogStrategyEvent(runID, instrument, period, strategyKey, "order_filled", "", details)
}

// LogStrategyTradeClosed writes a standardized trade close event with PnL.
// details should include: label, orderId, side, entryPrice, exitPrice, qty, pnl, pnlPips, holdMins
func (l *Logger) LogStrategyTradeClosed(runID, instrument, period, strategyKey string, details any) {
    l.LogStrategyEvent(runID, instrument, period, strategyKey, "trade_closed", "", details)
}


// Queries for API
func (l *Logger) QueryStrategyRuns(ctx context.Context, instrument, period string, limit int) ([]StrategyRunRow, error) {
    if limit <= 0 || limit > 200 { limit = 50 }
    rows, err := l.pool.Query(ctx, `select run_id, started_at, stopped_at, instrument, period, strategy_key, coalesce(qty,0), coalesce(atr_mult,0), coalesce(params,'{}'::jsonb), status
        from strategy_runs where ($1='' or instrument=$1) and ($2='' or period=$2)
        order by started_at desc limit $3`, instrument, period, limit)
    if err != nil { return nil, err }
    defer rows.Close()
    res := []StrategyRunRow{}
    for rows.Next() {
        var r StrategyRunRow
        if err := rows.Scan(&r.RunID, &r.StartedAt, &r.StoppedAt, &r.Instrument, &r.Period, &r.Strategy, &r.Qty, &r.AtrMult, &r.Params, &r.Status); err != nil {
            return nil, err
        }
        res = append(res, r)
    }
    return res, nil
}

func (l *Logger) QueryStrategyEvents(ctx context.Context, runID string, limit int) ([]StrategyEventRow, error) {
    if limit <= 0 || limit > 1000 { limit = 200 }
    rows, err := l.pool.Query(ctx, `select run_id, ts, instrument, period, strategy_key, event_type, coalesce(signal,''), coalesce(details,'{}'::jsonb)
        from strategy_events where run_id=$1 order by ts desc limit $2`, runID, limit)
    if err != nil { return nil, err }
    defer rows.Close()
    res := []StrategyEventRow{}
    for rows.Next() {
        var r StrategyEventRow
        if err := rows.Scan(&r.RunID, &r.TS, &r.Instrument, &r.Period, &r.Strategy, &r.EventType, &r.Signal, &r.Details); err != nil {
            return nil, err
        }
        res = append(res, r)
    }
    return res, nil
}

func (l *Logger) insertTrade(status, label, instrument, side, orderCmd string, amount, price, sl, tp float64, details any) {
    go func() {
        ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
        defer cancel()
        var dj []byte
        if details != nil { dj, _ = json.Marshal(details) }
        _, _ = l.pool.Exec(ctx,
            `insert into trades(label, instrument, side, order_cmd, amount, price, sl, tp, status, details)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            label, instrument, side, orderCmd, amount, price, sl, tp, status, dj,
        )
    }()
}
