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
	BidVwap           Vwap      `json:"bid_vwap"`
	AskVwap           Vwap      `json:"ask_vwap"`
	BidEmas           Emas      `json:"bid_emas"`
	AskEmas           Emas      `json:"ask_emas"`
	BidDonchian       Donchian  `json:"bid_donchian"`
	AskDonchian       Donchian  `json:"ask_donchian"`
	BidBollinger      Bollinger `json:"bid_bollinger"`
	AskBollinger      Bollinger `json:"ask_bollinger"`
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
	BidVwap           Vwap       `json:"bid_vwap"` // TickVwap will be null
	AskVwap           Vwap       `json:"ask_vwap"` // TickVwap will be null
	BidAtr            float64    `json:"bid_atr"`
	AskAtr            float64    `json:"ask_atr"`
	BidObv            float64    `json:"bid_obv"`
	AskObv            float64    `json:"ask_obv"`
	BidDemas          Demas      `json:"bid_demas"`
	AskDemas          Demas      `json:"ask_demas"`
	BidMacd           Macd       `json:"bid_macd"`
	AskMacd           Macd       `json:"ask_macd"`
	BidRsi            Rsi        `json:"bid_rsi"`
	AskRsi            Rsi        `json:"ask_rsi"`
	BidStoch          Stoch      `json:"bid_stoch"`
	AskStoch          Stoch      `json:"ask_stoch"`
	BidCci            float64    `json:"bid_cci"`
	AskCci            float64    `json:"ask_cci"`
	BidMfi            float64    `json:"bid_mfi"`
	AskMfi            float64    `json:"ask_mfi"`
	BidBollinger      Bollinger  `json:"bid_bollinger"`
	AskBollinger      Bollinger  `json:"ask_bollinger"`
	BidKeltner        Keltner    `json:"bid_keltner"`
	AskKeltner        Keltner    `json:"ask_keltner"`
	BidDonchian       Donchian   `json:"bid_donchian"`
	AskDonchian       Donchian   `json:"ask_donchian"`
	BidSupertrend     Supertrend `json:"bid_supertrend"`
	AskSupertrend     Supertrend `json:"ask_supertrend"`
	Sequence          int        `json:"sequence"`
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
