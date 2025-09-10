package strategy

import "go-trader/internal/state"

// What: DEMA+RSI starter strategy.
// How: Generates BUY when DEMA25 crosses above DEMA50 and RSI Fast > 50; SELL on opposite cross and RSI Fast < 50.
// Params: Uses the bars provided; no external params.
// Returns: SignalBuy, SignalSell, or SignalNone.

type DemaRsiStrategy struct{}

func (s DemaRsiStrategy) Key() string { return "DEMA_RSI" }

func (s DemaRsiStrategy) Evaluate(bars []state.HistoricalBar) Signal {
	if len(bars) < 3 {
		return SignalNone
	}
	// bars[0] is newest per StateManager; use two most recent closes for cross
	b0 := bars[0]
	b1 := bars[1]
	// Use Bid side indicators when available
	d25_0 := b0.BidDemas.Dema25
	d50_0 := b0.BidDemas.Dema50
	d25_1 := b1.BidDemas.Dema25
	d50_1 := b1.BidDemas.Dema50
	rsi0 := b0.BidRsi.Fast
	// Cross up: d25 crosses above d50 and RSI confirms
	if d25_1 <= d50_1 && d25_0 > d50_0 && rsi0 > 50 {
		return SignalBuy
	}
	// Cross down: d25 crosses below d50 and RSI confirms
	if d25_1 >= d50_1 && d25_0 < d50_0 && rsi0 < 50 {
		return SignalSell
	}
	return SignalNone
}
