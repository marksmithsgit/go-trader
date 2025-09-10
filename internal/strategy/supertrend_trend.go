package strategy

import "go-trader/internal/state"

// What: Supertrend Trend-Follow strategy with optional params: atrLen and mult.
// How: If params provided, computes simple Supertrend bands from bars; otherwise uses precomputed bands.
//      Emits BUY when price crosses above lower band; SELL when crosses below upper band.
// Params:
//  - atrLen (int): ATR lookback. Default 10 if provided.
//  - mult (float): ATR multiplier. Default 3.0 if provided.
// Returns: SignalBuy, SignalSell, or SignalNone.

type SupertrendStrategy struct {
	atrLen int
	mult   float64
}

func (s *SupertrendStrategy) Key() string { return "SUPERTREND_TREND" }

// SetParams allows runtime configuration.
func (s *SupertrendStrategy) SetParams(p Params) {
	if p == nil { return }
	if v, ok := p["atrLen"]; ok && int(v) > 1 { s.atrLen = int(v) }
	if v, ok := p["mult"]; ok && v > 0 { s.mult = v }
}

func (s *SupertrendStrategy) Evaluate(bars []state.HistoricalBar) Signal {
	if len(bars) < 2 { return SignalNone }
	b0 := bars[0]; b1 := bars[1]
	c0 := b0.Bid.C; c1 := b1.Bid.C
	var upper0, lower0, upper1, lower1 float64
	if s.atrLen > 1 && s.mult > 0 {
		al := s.atrLen
		if len(bars) <= al { return SignalNone }
		atr0 := simpleATR(bars, al)    // ATR at current
		atr1 := simpleATR(bars[1:], al) // ATR at previous (shifted)
		m0 := (b0.Bid.H + b0.Bid.L) / 2.0
		m1 := (b1.Bid.H + b1.Bid.L) / 2.0
		upper0 = m0 + s.mult*atr0
		lower0 = m0 - s.mult*atr0
		upper1 = m1 + s.mult*atr1
		lower1 = m1 - s.mult*atr1
	} else {
		upper0 = b0.BidSupertrend.Upper
		lower0 = b0.BidSupertrend.Lower
		upper1 = b1.BidSupertrend.Upper
		lower1 = b1.BidSupertrend.Lower
	}
	if lower1 > 0 && c1 <= lower1 && lower0 > 0 && c0 > lower0 { return SignalBuy }
	if upper1 > 0 && c1 >= upper1 && upper0 > 0 && c0 < upper0 { return SignalSell }
	return SignalNone
}

// simpleATR computes a simple average True Range over last n bars of the slice (0 is newest).
func simpleATR(bars []state.HistoricalBar, n int) float64 {
	if len(bars) <= n { return 0 }
	var sum float64
	for i := 0; i < n; i++ {
		h := bars[i].Bid.H; l := bars[i].Bid.L; pc := bars[i+1].Bid.C
		tr := h - l
		if v := abs(h-pc); v > tr { tr = v }
		if v := abs(l-pc); v > tr { tr = v }
		sum += tr
	}
	return sum / float64(n)
}

