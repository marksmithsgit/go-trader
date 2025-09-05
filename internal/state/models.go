
package state

// Tick represents a single price change in the market.
type Tick struct {
	ProducedAt int64   `json:"produced_at"`
	Timestamp  int64   `json:"timestamp"`
	PairID     int     `json:"pairId"`
	Instrument string  `json:"instrument"`
	Bid        float64 `json:"bid"`
	Ask        float64 `json:"ask"`
	BidVol     float64 `json:"bidVol"`
	AskVol     float64 `json:"askVol"`
}

// OHLCV represents the Open, High, Low, Close, and Volume for a bar.
type OHLCV struct {
	O float64 `json:"o"`
	H float64 `json:"h"`
	L float64 `json:"l"`
	C float64 `json:"c"`
	V float64 `json:"v"`
}

// Vwap contains the tick and bar volume-weighted average prices.
type Vwap struct {
	TickVwap *float64 `json:"tick_vwap"`
	BarVwap  *float64 `json:"bar_vwap"`
}

// Emas contains the exponential moving averages.
type Emas struct {
	Ema5  *float64 `json:"ema_5"`
	Ema8  *float64 `json:"ema_8"`
	Ema30 *float64 `json:"ema_30"`
	Ema50 *float64 `json:"ema_50"`
}

// Donchian contains the Donchian Channel values.
type Donchian struct {
	Upper  *float64 `json:"upper"`
	Middle *float64 `json:"middle"`
	Lower  *float64 `json:"lower"`
}

// Bollinger contains the Bollinger Bands values.
type Bollinger struct {
	Upper  *float64 `json:"upper"`
	Middle *float64 `json:"middle"`
	Lower  *float64 `json:"lower"`
}

// Bar represents a single bar of market data with technical indicators.
type Bar struct {
	ProducedAt        int64     `json:"produced_at"`
	BarStartTimestamp int64     `json:"bar_start_timestamp"`
	BarEndTimestamp   int64     `json:"bar_end_timestamp"`
	PairID            int       `json:"pairId"`
	Instrument        string    `json:"instrument"`
	Period            string    `json:"period"`
	Bid               OHLCV     `json:"bid"`
	Ask               OHLCV     `json:"ask"`
	Vwap              Vwap      `json:"vwap"`
	Emas              Emas      `json:"emas"`
	Donchian          Donchian  `json:"donchian"`
	Bollinger         Bollinger `json:"bollinger"`
}

// Demas contains the double exponential moving averages.
type Demas struct {
	Dema25  float64 `json:"dema_25"`
	Dema50  float64 `json:"dema_50"`
	Dema100 float64 `json:"dema_100"`
	Dema200 float64 `json:"dema_200"`
}

// Macd contains the Moving Average Convergence Divergence values.
type Macd struct {
	Line   float64 `json:"line"`
	Signal float64 `json:"signal"`
	Hist   float64 `json:"hist"`
}

// Rsi contains the Relative Strength Index values.
type Rsi struct {
	Fast float64 `json:"fast"`
	Slow float64 `json:"slow"`
}

// Stoch contains the Stochastic Oscillator values.
type Stoch struct {
	K float64 `json:"k"`
	D float64 `json:"d"`
}

// Keltner contains the Keltner Channel values.
type Keltner struct {
	Upper  float64 `json:"upper"`
	Middle float64 `json:"middle"`
	Lower  float64 `json:"lower"`
}

// Supertrend contains the Supertrend indicator values.
type Supertrend struct {
	Upper float64 `json:"upper"`
	Lower float64 `json:"lower"`
}

// HistoricalBar represents a single bar of historical market data with a rich set of technical indicators.
type HistoricalBar struct {
	ProducedAt        int64      `json:"produced_at"`
	BarStartTimestamp int64      `json:"bar_start_timestamp"`
	BarEndTimestamp   int64      `json:"bar_end_timestamp"`
	PairID            int        `json:"pairId"`
	Instrument        string     `json:"instrument"`
	Period            string     `json:"period"`
	Bid               OHLCV      `json:"bid"`
	Ask               OHLCV      `json:"ask"`
	Vwap              Vwap       `json:"vwap"` // TickVwap will be null
	Atr               float64    `json:"atr"`
	Obv               float64    `json:"obv"`
	Demas             Demas      `json:"demas"`
	Macd              Macd       `json:"macd"`
	Rsi               Rsi        `json:"rsi"`
	Stoch             Stoch      `json:"stoch"`
	Cci               float64    `json:"cci"`
	Mfi               float64    `json:"mfi"`
	Bollinger         Bollinger  `json:"bollinger"`
	Keltner           Keltner    `json:"keltner"`
	Donchian          Donchian   `json:"donchian"`
	Supertrend        Supertrend `json:"supertrend"`
}

// Account represents the overall state of the trading account.
type Account struct {
	AccountID       string  `json:"accountId"`
	Balance         float64 `json:"balance"`
	Equity          float64 `json:"equity"`
	MarginUsed      float64 `json:"marginUsed"`
	FreeMargin      float64 `json:"freeMargin"`
	MarginAvailable float64 `json:"marginAvailable"`
	Leverage        float64 `json:"leverage"`
	AccountPnL      float64 `json:"accountPnL"`
	UnrealizedPnL   float64 `json:"unrealizedPnL"`
}

// Position represents a single open trade.
type Position struct {
	OrderID      string  `json:"orderId"`
	Label        string  `json:"label"`
	Instrument   string  `json:"instrument"`
	OrderCommand string  `json:"orderCommand"`
	Amount       float64 `json:"amount"`
	OpenPrice    float64 `json:"openPrice"`
	StopLoss     float64 `json:"stopLoss"`
	TakeProfit   float64 `json:"takeProfit"`
	PnL          float64 `json:"pnl"`
	State        string  `json:"state"`
}

// AccountInfo represents the complete account status message.
type AccountInfo struct {
	ProducedAt int64      `json:"produced_at"`
	Timestamp  int64      `json:"timestamp"`
	Account    Account    `json:"account"`
	Positions  []Position `json:"positions"`
}
