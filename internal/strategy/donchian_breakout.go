package strategy

import "go-trader/internal/state"

// What: Donchian Breakout strategy with optional params: len (lookback) and buf (ATR-based buffer).
// How: Computes Donchian bands over last len bars if provided; otherwise uses precomputed bands.
//       Applies optional buffer: requires breakout beyond band by buf * ATR.
// Params:
//   - len: number of bars for channel (int; default 20 if provided)
//   - buf: multiplier of ATR as buffer distance (float; default 0.0)
// Returns: SignalBuy, SignalSell, or SignalNone.

type DonchianBreakoutStrategy struct {
	len    int
	buf    float64
	atrLen int
}

func (s *DonchianBreakoutStrategy) Key() string { return "BREAKOUT_DC" }

// SetParams allows runtime configuration.
func (s *DonchianBreakoutStrategy) SetParams(p Params) {
	if p == nil { return }
	if v, ok := p["len"]; ok && int(v) > 1 { s.len = int(v) }
	if v, ok := p["buf"]; ok && v >= 0 { s.buf = v }
	if v, ok := p["atrLen"]; ok && int(v) > 1 { s.atrLen = int(v) }
}

func (s *DonchianBreakoutStrategy) Evaluate(bars []state.HistoricalBar) Signal {
	if len(bars) < 2 { return SignalNone }
	b0 := bars[0]
	c := b0.Bid.C
	upper := 0.0
	lower := 0.0
	// Compute from params if provided
	if s.len > 1 && len(bars) >= s.len {
		high := bars[0].Bid.H
		low := bars[0].Bid.L
		for i := 0; i < s.len && i < len(bars); i++ {
			if bars[i].Bid.H > high { high = bars[i].Bid.H }
			if bars[i].Bid.L < low { low = bars[i].Bid.L }
		}
		upper = high
		lower = low
	} else {
		if b0.BidDonchian.Upper != nil { upper = *b0.BidDonchian.Upper }
		if b0.BidDonchian.Lower != nil { lower = *b0.BidDonchian.Lower }
	}
	if upper == 0 && lower == 0 { return SignalNone }
	// Apply ATR buffer if requested
	if s.buf > 0 {
		atr := b0.BidAtr
		if atr <= 0 { atr = b0.AskAtr }
		if atr <= 0 {
			// fallback compute simple ATR as avg TR over atrLen or 14
			al := s.atrLen; if al <= 1 { al = 14 }
			if len(bars) > al {
				var sum float64
				for i := 0; i < al; i++ {
					h := bars[i].Bid.H; l := bars[i].Bid.L; pc := bars[i+1].Bid.C
					tr := h - l
					if v := abs(h-pc); v > tr { tr = v }
					if v := abs(l-pc); v > tr { tr = v }
					sum += tr
				}
				atr = sum / float64(al)
			}
		}
		upper += s.buf * atr
		lower -= s.buf * atr
	}
	if upper > 0 && c > upper { return SignalBuy }
	if lower > 0 && c < lower { return SignalSell }
	return SignalNone
}

func abs(x float64) float64 { if x < 0 { return -x } ; return x }

