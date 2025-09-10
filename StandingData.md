# Standing Data Reference

This document provides a reference for all message formats and technical indicators used in the JForex-based trading system.

## 1. Market Data Messages

These messages are sent by the `MultiTickDataFeeder` and `EURUSD_BarDataFeeder` strategies.

### 1.1. Tick Message (`Market_Data_Ticks` queue)

Sent for each new tick for all subscribed instruments.

**Example:**
```json
{
  "produced_at": 1678886400000,
  "timestamp": 1678886400000,
  "pairId": 1,
  "instrument": "EURUSD",
  "bid": 1.065,
  "ask": 1.0652,
  "bidVol": 1.5,
  "askVol": 1.2
}
```

**Fields:**

| Field          | Type    | Description                               |
|----------------|---------|-------------------------------------------|
| `produced_at`  | Integer | Unix timestamp (milliseconds) of message creation. |
| `timestamp`    | Integer | Unix timestamp (milliseconds) of the tick. |
| `pairId`       | Integer | Unique ID for the instrument.             |
| `instrument`   | String  | Instrument name (e.g., "EURUSD").         |
| `bid`          | Float   | Bid price.                                |
| `ask`          | Float   | Ask price.                                |
| `bidVol`       | Float   | Bid volume.                               |
| `askVol`       | Float   | Ask volume.                               |

### 1.2. Bar Message (`*_Market_Data_Bars` queues)

Sent at the close of each bar for a specific instrument. The queue name is instrument-specific (e.g., `EURUSD_Market_Data_Bars`).

**Example:**
```json
{
  "produced_at": 1678886400000,
  "bar_start_timestamp": 1678886340000,
  "bar_end_timestamp": 1678886400000,
  "pairId": 1,
  "instrument": "EURUSD",
  "period": "ONE_MIN",
  "bid": { "o": 1.065, "h": 1.0655, "l": 1.0648, "c": 1.0652, "v": 100.0 },
  "ask": { "o": 1.0652, "h": 1.0657, "l": 1.065, "c": 1.0654, "v": 95.0 },
  "vwap": { "tick_vwap": 1.0651, "bar_vwap": 1.0652 },
  "emas": { "ema_5": 1.065, "ema_8": 1.0648, "ema_30": 1.064, "ema_50": 1.0635 },
  "donchian": { "upper": 1.066, "middle": 1.065, "lower": 1.064 },
  "bollinger": { "upper": 1.0665, "middle": 1.0655, "lower": 1.0645 }
}
```

**Fields:**

| Field                 | Type   | Description                                      |
|-----------------------|--------|--------------------------------------------------|
| `produced_at`         | Integer| Unix timestamp (milliseconds) of message creation. |
| `bar_start_timestamp` | Integer| Unix timestamp (milliseconds) of bar start.      |
| `bar_end_timestamp`   | Integer| Unix timestamp (milliseconds) of bar end.        |
| `pairId`              | Integer| Unique ID for the instrument.                    |
| `instrument`          | String | Instrument name (e.g., "EURUSD").                |
| `period`              | String | Bar period (e.g., "ONE_MIN").                    |
| `bid`                 | Object | Bid OHLCV data.                                  |
| `ask`                 | Object | Ask OHLCV data.                                  |
| `vwap`                | Object | Volume-Weighted Average Price data.              |
| `emas`                | Object | Exponential Moving Averages.                     |
| `donchian`            | Object | Donchian Channel indicator data.                 |
| `bollinger`           | Object | Bollinger Bands indicator data.                  |

---

## 2. Historical Data Messages

Used by the `HistoricalBarRequester` to provide historical bar data on demand.

### 2.1. Historical Request (`H-Requests` queue)

A request for historical bar data.

**Example:**
```json
{ "instrument": "GBPUSD", "barsCount": 100 }
```

**Fields:**

| Field         | Type    | Description                                     |
|---------------|---------|-------------------------------------------------|
| `instrument`  | String  | The instrument to fetch data for (e.g., "GBPUSD"). |
| `barsCount`   | Integer | The number of historical bars to retrieve.      |

### 2.2. Historical Bar Data (`H-Bars` queue)

The response to a historical data request, containing a bar with a rich set of technical indicators.

**Example:**
```json
{
  "produced_at": 1678886400000,
  "bar_start_timestamp": 1678882800000,
  "bar_end_timestamp": 1678886400000,
  "pairId": 2,
  "instrument": "GBPUSD",
  "period": "ONE_HOUR",
  "bid": { "o": 1.215, "h": 1.216, "l": 1.214, "c": 1.2155, "v": 250.0 },
  "ask": { "o": 1.2152, "h": 1.2162, "l": 1.2142, "c": 1.2157, "v": 240.0 },
  "vwap": { "tick_vwap": null },
  "atr": 0.0015,
  "obv": 150000.0,
  "demas": { "dema_25": 1.215, "dema_50": 1.214, "dema_100": 1.212, "dema_200": 1.208 },
  "macd": { "line": 0.0005, "signal": 0.0004, "hist": 0.0001 },
  "rsi": { "fast": 65.0, "slow": 60.0 },
  "stoch": { "k": 80.0, "d": 75.0 },
  "cci": 120.0,
  "mfi": 70.0,
  "bollinger": { "upper": 1.217, "middle": 1.215, "lower": 1.213 },
  "keltner": { "upper": 1.2175, "middle": 1.2155, "lower": 1.2135 },
  "donchian": { "upper": 1.2165, "middle": 1.215, "lower": 1.2135 },
  "supertrend": { "upper": 1.218, "lower": 1.213 }
}
```

---

## 3. Trade and Account Messages

Used by the `TradeManager` for trade execution and account monitoring.

### 3.1. Trade Command (`Trade_Commands` queue)

Commands to execute, modify, or close trades.

**Submit Order Example:**
```json
{
  "command": "SUBMIT_ORDER",
  "label": "my_order_123",
  "instrument": "EURUSD",
  "orderCmd": "BUY",
  "amount": 0.1,
  "price": 1.065,
  "slippage": 5,
  "stopLossPrice": 1.06,
  "takeProfitPrice": 1.07
}
```

**Close Order Example:**
```json
{ "command": "CLOSE_ORDER", "orderId": "12345" }
```

**Modify Order Example:**
```json
{ "command": "MODIFY_ORDER", "orderId": "12345", "stopLossPrice": 1.062 }
```

### 3.2. Account Info (`Account_Info` queue)

Periodic updates on the account status and open positions.

**Example:**
```json
{
  "produced_at": 1678886400000,
  "timestamp": 1678886400000,
  "account": {
    "accountId": "ACCOUNT123",
    "balance": 10000.0,
    "equity": 10050.0,
    "marginUsed": 200.0,
    "freeMargin": 9850.0,
    "marginAvailable": 10050.0,
    "leverage": 100.0,
    "accountPnL": 50.0,
    "unrealizedPnL": 50.0
  },
  "positions": [
    {
      "orderId": "12345",
      "label": "my_order_123",
      "instrument": "EURUSD",
      "orderCommand": "BUY",
      "amount": 0.1,
      "openPrice": 1.065,
      "stopLoss": 1.06,
      "takeProfit": 1.07,
      "pnl": 50.0,
      "state": "FILLED"
    }
  ]
}
```

---

## 4. Technical Indicators

This section lists all technical indicators found in the message payloads.

| Indicator             | Found In                               | Description                                             |
|-----------------------|----------------------------------------|---------------------------------------------------------|
| **ATR**               | Historical Bar Data                    | Average True Range.                                     |
| **Bollinger Bands**   | Live & Historical Bar Data             | Measures volatility with upper, middle, and lower bands. |
| **CCI**               | Historical Bar Data                    | Commodity Channel Index.                                |
| **DEMA**              | Historical Bar Data                    | Double Exponential Moving Average.                      |
| **Donchian Channel**  | Live & Historical Bar Data             | Shows the highest high and lowest low over a period.    |
| **EMA**               | Live Bar Data                          | Exponential Moving Average.                             |
| **Keltner Channel**   | Historical Bar Data                    | Volatility channel based on ATR.                        |
| **MACD**              | Historical Bar Data                    | Moving Average Convergence Divergence.                  |
| **MFI**               | Historical Bar Data                    | Money Flow Index.                                       |
| **OBV**               | Historical Bar Data                    | On-Balance Volume.                                      |
| **RSI**               | Historical Bar Data                    | Relative Strength Index.                                |
| **Stochastic**        | Historical Bar Data                    | Stochastic Oscillator (%K and %D).                      |
| **SuperTrend**        | Historical Bar Data                    | Trend-following indicator.                              |
| **VWAP**              | Live Bar Data                          | Volume-Weighted Average Price.                          |


## Bar Periods and there JForex names are listed below

10 seconds = TEN_SECS
1 minute = ONE_MIN
5 minutes = FIVE_MINS
15 minutes = FIFTEEN_MINS 
1 hour = ONE_HOUR
4 hours = FOUR_HOURS
Daily = DAILY

## Currency PAIR_ID

EURUSD = 1
USDJPY = 2
GBPUSD = 3
USDCHF = 4
AUDUSD = 5
USDCAD = 6
NZDUSD = 7
EURJPY = 8
GBPJPY = 9
EURGBP = 10



