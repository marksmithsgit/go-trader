import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import ChartArea from './ChartArea';
import ChartToolbar from './ChartToolbar';
import StrategyPanel from './StrategyPanel';


// Helper function to get theme colors
const getThemeColors = (isDarkMode: boolean) => ({
  background: isDarkMode ? '#1a1a1a' : '#ffffff',
  cardBackground: isDarkMode ? '#2a2a2a' : '#f5f5f5',
  border: isDarkMode ? '#555' : '#ddd',
  text: isDarkMode ? 'white' : '#333',
  textSecondary: isDarkMode ? '#ccc' : '#666',
  inputBackground: isDarkMode ? '#333' : '#e0e0e0'
});

export default function PriceChart({ isDarkMode, instrument: instrumentProp = 'EURUSD' }: { isDarkMode: boolean; instrument?: string }) {
  const { fullState, placeMarketOrder, placeLimitOrder, closeAll, closePosition, requestHistoricalData, chartSettings, setChartSettings } = useStore();
  const themeColors = getThemeColors(isDarkMode);
  const instrument = instrumentProp;
  // const period = 'TEN_SECS';
  const [bidChange, setBidChange] = useState<'up' | 'down' | null>(null);
  const [askChange, setAskChange] = useState<'up' | 'down' | null>(null);
  const [limitOrder, setLimitOrder] = useState({
    side: 'SELL',
    entryPips: '',
    stopLossPips: '10',
    takeProfitPips: '10'
  });

  const [quickOrder, setQuickOrder] = useState({
    stopLossPips: '10',
    takeProfitPips: '10'
  });
  const prevBidRef = useRef<number | null>(null);
  // Risk model selection: FIXED (pips), ATR (x multiplier), PCT (% account risk)
  const [riskMode, setRiskMode] = useState<'FIXED' | 'ATR' | 'PCT'>('FIXED');
  // Collapsible trading panels (Quick Trade + Advanced Order)
  const [showTradingPanels, setShowTradingPanels] = useState<boolean>(false);
  const [atrMult, setAtrMult] = useState<string>('1.0');
  const [riskPct, setRiskPct] = useState<string>('1.0');

  // Use global chart settings
  const {
    period,
    side,
    showBollinger,
    showDonchian,
    showSupertrend,
    showKeltner,
    showDemas,
    showVwap
  } = chartSettings;

  // Update functions for global settings
  const setPeriod = (newPeriod: string) => setChartSettings({ period: newPeriod });
  const setSide = (newSide: 'bid' | 'ask') => setChartSettings({ side: newSide });
  const setShowBollinger = (show: boolean) => setChartSettings({ showBollinger: show });
  const setShowDonchian = (show: boolean) => setChartSettings({ showDonchian: show });
  const setShowSupertrend = (show: boolean) => setChartSettings({ showSupertrend: show });
  const setShowKeltner = (show: boolean) => setChartSettings({ showKeltner: show });
  const setShowDemas = (show: boolean) => setChartSettings({ showDemas: show });
  const setShowVwap = (show: boolean) => setChartSettings({ showVwap: show });
  // Remove localStorage persistence since we're using global state now

  // If selected period has no data yet, auto-fallback to a present one
  useEffect(() => {
    const histMap = fullState?.historicalBars?.[instrument] || {};
    const liveMap = fullState?.bars?.[instrument] || {};
    const hasData = (m: Record<string, any[]>, p: string) => Array.isArray(m[p]) && m[p].length > 0;
    const currentHas = hasData(histMap, period) || hasData(liveMap, period);
    if (currentHas) return;
    const available = Array.from(new Set([...Object.keys(histMap), ...Object.keys(liveMap)]));
    if (available.length === 0) return;
    const pref = ['ONE_MIN','FIVE_MINS','FIFTEEN_MINS','ONE_HOUR','TEN_SECS','FOUR_HOURS','DAILY'];
    const next = pref.find(p => available.includes(p)) || available[0];
    if (next && next !== period) setPeriod(next);
  }, [fullState, instrument]);

  // Helpers to compute pip and ATR-derived distances
  // Request historical data when instrument/period changes
  useEffect(() => {
    try { requestHistoricalData(instrument); } catch {}
  }, [instrument, period, requestHistoricalData]);

  const pip = instrument.includes('JPY') ? 0.01 : 0.0001;
  const pickAtrPips = () => {
    // Prefer the selected period, then fall back to others
    const candidates = [period, 'ONE_MIN','FIVE_MINS','FIFTEEN_MINS','ONE_HOUR'];
    const tried = new Set<string>();
    for (const p of candidates) {
      if (tried.has(p)) continue;
      tried.add(p);
      const arr = fullState?.historicalBars?.[instrument]?.[p] || [];
      if (arr.length > 0) {
        const last = arr[arr.length - 1] as any;
        const atr = (last?.atr as number) || (last?.ask_atr as number) || (last?.bid_atr as number) || 0; // price units
        if (atr > 0) return atr / pip; // convert to pips
      }
    }
    return 0;
  };

  const computeQtyForRisk = (slPips: number) => {
    const balance = fullState?.accountInfo?.account?.balance ?? 0;
    const pct = parseFloat(riskPct) || 0;
    if (pct <= 0 || slPips <= 0) return 0.1; // default 0.1 lot
    const riskAmount = balance * (pct / 100);
    // Assume ~$10/pip @ 1.0 lot on majors => $1/pip @ 0.1 lot
    // So quantity in lots ≈ (riskAmount / slPips) * 0.1
    const lots = (riskAmount / slPips) * 0.1;
    // clamp to reasonable range
    return Math.max(0.01, Math.min(2.0, parseFloat(lots.toFixed(2))));
  };

  const prevAskRef = useRef<number | null>(null);

  // Debug: Show all available data
  // const allBars = fullState?.bars?.[instrument] || {};
  // const availablePeriods = Object.keys(allBars);
  // const bars = fullState?.bars?.[instrument]?.[period] || [];
  const ticks = fullState?.ticks?.[instrument] || [];

  const positions = fullState?.accountInfo?.positions || [];

  // Try to find bars with any period if TEN_SECS doesn't exist
  // let actualPeriod = period;
  // if (bars.length === 0 && availablePeriods.length > 0) {
  //   actualPeriod = availablePeriods[0];
  // }

  // Get latest tick
  const latestTick = ticks.length > 0 ? ticks[ticks.length - 1] : null;

  // Track price changes for flashing effect
  useEffect(() => {
    if (latestTick) {
      if (prevBidRef.current !== null) {
        if (latestTick.bid > prevBidRef.current) {
          setBidChange('up');
          setTimeout(() => setBidChange(null), 500);
        } else if (latestTick.bid < prevBidRef.current) {
          setBidChange('down');
          setTimeout(() => setBidChange(null), 500);
        }
      }
      if (prevAskRef.current !== null) {
        if (latestTick.ask > prevAskRef.current) {
          setAskChange('up');
          setTimeout(() => setAskChange(null), 500);
        } else if (latestTick.ask < prevAskRef.current) {
          setAskChange('down');
          setTimeout(() => setAskChange(null), 500);
        }
      }
      prevBidRef.current = latestTick.bid;
      prevAskRef.current = latestTick.ask;
    }
  }, [latestTick]);

  return (
    <div style={{
      padding: '20px',
      height: '100%',
      backgroundColor: themeColors.background,
      color: themeColors.text,
      borderRadius: '8px',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>

      {/* Chart Controls - moved above chart */}
      <div style={{
        backgroundColor: themeColors.cardBackground,
        padding: '12px',
        borderRadius: '8px',
        marginBottom: '12px',
        border: `1px solid ${themeColors.border}`,
        boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <ChartToolbar
          period={period}
          onChangePeriod={setPeriod}
          side={side}
          onChangeSide={setSide}
          showBollinger={showBollinger}
          showDonchian={showDonchian}
          showSupertrend={showSupertrend}
          showKeltner={showKeltner}
          showDemas={showDemas}
          showVwap={showVwap}
          onToggleBollinger={setShowBollinger}
          onToggleDonchian={setShowDonchian}
          onToggleSupertrend={setShowSupertrend}
          onToggleKeltner={setShowKeltner}
          onToggleDemas={setShowDemas}
          onToggleVwap={setShowVwap}
        />
      </div>

      {/* Chart Area */}
      <div style={{ marginBottom: '20px', background: isDarkMode ? '#0f1115' : '#fff', border: `1px solid ${themeColors.border}`, borderRadius: 8 }}>
        <ChartArea
          instrument={instrument}
          period={period}
          side={side}
          height={420}
          dark={isDarkMode}
          showBollinger={showBollinger}
          showDonchian={showDonchian}
          showSupertrend={showSupertrend}
          showKeltner={showKeltner}
          showDemas={showDemas}
          showVwap={showVwap}
        />
      </div>

      {/* Toggle for Trading Panels */}
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <button
          onClick={() => setShowTradingPanels(v => !v)}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: `1px solid ${themeColors.border}`,
            background: isDarkMode ? '#2a2a2a' : '#f3f4f6',
            color: themeColors.text,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >{showTradingPanels ? 'Hide Trading Panels ▲' : 'Show Trading Panels ▼'}</button>
      </div>

      {/* Live Price Display - reduced height */}
      <div style={{
        backgroundColor: themeColors.cardBackground,
        padding: '12px',
        borderRadius: '8px',
        marginBottom: '12px',
        border: `1px solid ${themeColors.border}`,
        boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        {latestTick ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center' }}>
            <div style={{
              textAlign: 'center',
              backgroundColor: themeColors.inputBackground,
              padding: '8px',
              borderRadius: '6px',
              border: `1px solid ${themeColors.border}`,
              transition: 'all 0.3s ease'
            }}>
              <div style={{
                fontSize: '11px',
                color: themeColors.textSecondary,
                marginBottom: '4px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>BID</div>
              <div style={{
                fontSize: '28px',
                fontWeight: '700',
                color: bidChange === 'up' ? '#4CAF50' : bidChange === 'down' ? '#f44336' : themeColors.text,
                transition: 'color 0.5s',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                { (instrument.includes('JPY') ? latestTick.bid.toFixed(3) : latestTick.bid.toFixed(5)) }
              </div>
              <div style={{
                fontSize: '11px',
                color: themeColors.textSecondary,
                marginTop: '5px',
                fontWeight: '600'
              }}>{instrument}</div>
            </div>

            {/* Spread Section */}
            <div style={{
              textAlign: 'center',
              backgroundColor: isDarkMode ? '#333' : '#e8f5e8',
              padding: '8px 12px',
              borderRadius: '8px',
              border: `1px solid ${themeColors.border}`,
              minWidth: '120px'
            }}>
              <div style={{
                fontSize: '10px',
                color: themeColors.textSecondary,
                marginBottom: '5px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>SPREAD</div>
              <div style={{
                fontSize: '18px',
                fontWeight: '700',
                color: '#FF9800',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                {(((latestTick.ask - latestTick.bid) * (instrument.includes('JPY') ? 100 : 10000))).toFixed(1)}
              </div>
              <div style={{
                fontSize: '9px',
                color: themeColors.textSecondary,
                marginTop: '3px',
                fontWeight: '500'
              }}>
                pips
              </div>
            </div>

            <div style={{
              textAlign: 'center',
              backgroundColor: themeColors.inputBackground,
              padding: '8px',
              borderRadius: '8px',
              border: `1px solid ${themeColors.border}`,
              transition: 'all 0.3s ease'
            }}>
              <div style={{
                fontSize: '12px',


                color: themeColors.textSecondary,
                marginBottom: '8px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>ASK</div>
              <div style={{
                fontSize: '28px',
                fontWeight: '700',
                color: askChange === 'up' ? '#4CAF50' : askChange === 'down' ? '#f44336' : themeColors.text,
                transition: 'color 0.5s',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                { (instrument.includes('JPY') ? latestTick.ask.toFixed(3) : latestTick.ask.toFixed(5)) }
              </div>
              <div style={{
                fontSize: '11px',
                color: themeColors.textSecondary,
                marginTop: '5px',
                fontWeight: '600'
              }}>{instrument}</div>



            </div>
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            color: themeColors.textSecondary,
            padding: '12px',
            fontSize: '13px'
          }}>
            Waiting for live price data...
          </div>
        )}
      </div>

      {/* Trading Interface (collapsible) */}
      {showTradingPanels && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

        {/* Quick Trading Panel */}
        <div style={{
          backgroundColor: themeColors.cardBackground,
          padding: '20px',
          borderRadius: '8px',
          border: `1px solid ${themeColors.border}`,
          boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h4 style={{
            margin: '0 0 20px 0',
            color: themeColors.text,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '16px',
            fontWeight: '600',
            textAlign: 'center'
          }}>⚡ Quick Trade</h4>

          {/* Risk Model Selection */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '10px' }}>
              <button
                onClick={() => setRiskMode('FIXED')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: riskMode==='FIXED' ? '2px solid #4CAF50' : `1px solid ${themeColors.border}`,
                  background: riskMode==='FIXED' ? '#4CAF50' : themeColors.inputBackground,
                  color: riskMode==='FIXED' ? 'white' : themeColors.text,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '11px',
                  transition: 'all 0.2s ease'
                }}
              >Fixed Pips</button>
              <button
                onClick={() => setRiskMode('ATR')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: riskMode==='ATR' ? '2px solid #03A9F4' : `1px solid ${themeColors.border}`,
                  background: riskMode==='ATR' ? '#03A9F4' : themeColors.inputBackground,
                  color: riskMode==='ATR' ? 'white' : themeColors.text,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '11px',
                  transition: 'all 0.2s ease'
                }}
              >ATR x</button>
              <button
                onClick={() => setRiskMode('PCT')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: riskMode==='PCT' ? '2px solid #FF9800' : `1px solid ${themeColors.border}`,
                  background: riskMode==='PCT' ? '#FF9800' : themeColors.inputBackground,
                  color: riskMode==='PCT' ? 'white' : themeColors.text,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '11px',
                  transition: 'all 0.2s ease'
                }}
              >% Risk</button>
            </div>

            {riskMode === 'ATR' && (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <label style={{ fontSize: '11px', color: themeColors.textSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ATR Multiplier
                  <input type="number" step="0.1" value={atrMult} onChange={(e) => setAtrMult(e.target.value)}
                    style={{ width: '70px', padding: '4px', backgroundColor: themeColors.inputBackground, color: themeColors.text, border: `1px solid ${themeColors.border}`, borderRadius: '4px', textAlign: 'center', fontSize: '11px' }} />
                </label>
              </div>
            )}

            {riskMode === 'PCT' && (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <label style={{ fontSize: '11px', color: themeColors.textSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Risk %
                  <input type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(e.target.value)}
                    style={{ width: '70px', padding: '4px', backgroundColor: themeColors.inputBackground, color: themeColors.text, border: `1px solid ${themeColors.border}`, borderRadius: '4px', textAlign: 'center', fontSize: '11px' }} />
                </label>
              </div>
            )}
          </div>

          {/* Quick Order SL/TP Inputs */}
          <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '15px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  color: themeColors.textSecondary,
                  marginBottom: '4px',
                  fontWeight: '500',
                  textAlign: 'center',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>Stop Loss (pips)</label>
                <input
                  type="number"
                  step="0.1"
                  value={quickOrder.stopLossPips}
                  onChange={(e) => setQuickOrder({...quickOrder, stopLossPips: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: themeColors.inputBackground,
                    color: themeColors.text,
                    border: `1px solid ${themeColors.border}`,
                    borderRadius: '4px',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    fontSize: '13px',
                    textAlign: 'center',
                    fontWeight: '500'
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  color: themeColors.textSecondary,
                  marginBottom: '4px',
                  fontWeight: '500',
                  textAlign: 'center',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>Take Profit (pips)</label>
                <input
                  type="number"
                  step="0.1"
                  value={quickOrder.takeProfitPips}
                  onChange={(e) => setQuickOrder({...quickOrder, takeProfitPips: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: themeColors.inputBackground,
                    color: themeColors.text,
                    border: `1px solid ${themeColors.border}`,
                    borderRadius: '4px',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    fontSize: '13px',
                    textAlign: 'center',
                    fontWeight: '500'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Quick Order Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <button
              style={{
                padding: '10px 12px',
                backgroundColor: '#4CAF50',
                color: 'black',
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 6px rgba(76, 175, 80, 0.4)'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => (e.target as HTMLElement).style.transform = 'translateY(0)'}
              onClick={() => {
                if (!latestTick) return;
                let sl = parseFloat(quickOrder.stopLossPips) || 0;
                let tp = parseFloat(quickOrder.takeProfitPips) || 0;
                let qty = 0.1;
                if (riskMode === 'ATR') {
                  const mult = parseFloat(atrMult) || 1.0;
                  const atrPips = pickAtrPips();
                  if (atrPips > 0) {
                    sl = Math.max(1, mult * atrPips);
                    if (tp <= 0) tp = sl; // symmetric by default
                  }
                } else if (riskMode === 'PCT') {
                  if (sl <= 0) sl = 10; // default safeguard
                  qty = computeQtyForRisk(sl);
                }
                placeMarketOrder({ instrument, side: 'BUY', qty, slPips: sl, tpPips: tp });
              }}
            >
              BUY MARKET
            </button>
            <button
              style={{
                padding: '10px 12px',
                backgroundColor: '#f44336',
                color: 'black',
                border: '2px solid rgba(255,255,255,0.3)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 6px rgba(244, 67, 54, 0.4)'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => (e.target as HTMLElement).style.transform = 'translateY(0)'}
              onClick={() => {
                if (!latestTick) return;
                let sl = parseFloat(quickOrder.stopLossPips) || 0;
                let tp = parseFloat(quickOrder.takeProfitPips) || 0;
                let qty = 0.1;
                if (riskMode === 'ATR') {
                  const mult = parseFloat(atrMult) || 1.0;
                  const atrPips = pickAtrPips();
                  if (atrPips > 0) {
                    sl = Math.max(1, mult * atrPips);
                    if (tp <= 0) tp = sl;
                  }
                } else if (riskMode === 'PCT') {
                  if (sl <= 0) sl = 10;
                  qty = computeQtyForRisk(sl);
                }
                placeMarketOrder({ instrument, side: 'SELL', qty, slPips: sl, tpPips: tp });
              }}
            >
              SELL MARKET
            </button>
          </div>

          {/* Close Position Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              style={{
                padding: '8px 12px',
                backgroundColor: '#FF6B35',
                color: 'black',
                border: '2px solid rgba(0,0,0,0.2)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(255, 107, 53, 0.3)'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => (e.target as HTMLElement).style.transform = 'translateY(0)'}
              onClick={() => {
                closeAll({ instrument, side: 'BUY' });
              }}
            >
              Close BUY
            </button>
            <button
              style={{
                padding: '8px 12px',
                backgroundColor: '#FF6B35',
                color: 'black',
                border: '2px solid rgba(0,0,0,0.2)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(255, 107, 53, 0.3)'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => (e.target as HTMLElement).style.transform = 'translateY(0)'}
              onClick={() => {
                closeAll({ instrument, side: 'SELL' });
              }}
            >
              Close SELL
            </button>
          </div>
        </div>

        {/* Advanced Trading Panel */}
        <div style={{
          backgroundColor: themeColors.cardBackground,
          padding: '20px',
          borderRadius: '8px',
          border: `1px solid ${themeColors.border}`,
          boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h4 style={{
            margin: '0 0 20px 0',
            color: themeColors.text,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: '16px',
            fontWeight: '600',
            textAlign: 'center'
          }}>🎯 Advanced Order</h4>

          {/* Buy/Sell Selection */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginBottom: '15px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: '10px 20px',
                borderRadius: '8px',
                backgroundColor: '#4CAF50',
                border: limitOrder.side === 'BUY' ? '2px solid rgba(255,255,255,0.3)' : `1px solid ${themeColors.border}`,
                transition: 'all 0.2s ease',
                boxShadow: limitOrder.side === 'BUY' ? '0 2px 6px rgba(76, 175, 80, 0.4)' : 'none',
                minWidth: '80px'
              }}>
                <input
                  type="radio"
                  name="side"
                  value="BUY"
                  checked={limitOrder.side === 'BUY'}
                  onChange={(e) => setLimitOrder({...limitOrder, side: e.target.value})}
                  style={{ display: 'none' }}
                />
                <span style={{
                  color: limitOrder.side === 'BUY' ? 'black' : themeColors.text,
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}>BUY</span>
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: '10px 20px',
                borderRadius: '8px',
                backgroundColor: '#f44336',
                border: limitOrder.side === 'SELL' ? '2px solid rgba(255,255,255,0.3)' : `1px solid ${themeColors.border}`,
                transition: 'all 0.2s ease',
                boxShadow: limitOrder.side === 'SELL' ? '0 2px 6px rgba(244, 67, 54, 0.4)' : 'none',
                minWidth: '80px'
              }}>
                <input
                  type="radio"
                  name="side"
                  value="SELL"
                  checked={limitOrder.side === 'SELL'}
                  onChange={(e) => setLimitOrder({...limitOrder, side: e.target.value})}
                  style={{ display: 'none' }}
                />
                <span style={{
                  color: limitOrder.side === 'SELL' ? 'black' : themeColors.text,
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}>SELL</span>
              </label>
            </div>
          </div>

          {/* Pip-based Price Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '15px' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '11px',
                color: themeColors.textSecondary,
                marginBottom: '4px',
                fontWeight: '500',
                textAlign: 'center',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>Entry (pips)</label>
              <input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={limitOrder.entryPips}
                onChange={(e) => setLimitOrder({...limitOrder, entryPips: e.target.value})}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: themeColors.inputBackground,
                  color: themeColors.text,
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: '4px',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  fontSize: '13px',
                  textAlign: 'center',
                  fontWeight: '500'
                }}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '11px',
                color: themeColors.textSecondary,
                marginBottom: '4px',
                fontWeight: '500',
                textAlign: 'center',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>Stop Loss (pips)</label>
                                <input
                    type="number"
                    step="0.1"
                    placeholder="10.0"
                    value={limitOrder.stopLossPips}
                    onChange={(e) => setLimitOrder({...limitOrder, stopLossPips: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: themeColors.inputBackground,
                      color: themeColors.text,
                      border: `1px solid ${themeColors.border}`,
                      borderRadius: '4px',
                      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      fontSize: '13px',
                      textAlign: 'center',
                      fontWeight: '500'
                    }}
                  />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: '11px',
                color: themeColors.textSecondary,
                marginBottom: '4px',
                fontWeight: '500',
                textAlign: 'center',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>Take Profit (pips)</label>
                                <input
                    type="number"
                    step="0.1"
                    placeholder="10.0"
                    value={limitOrder.takeProfitPips}
                    onChange={(e) => setLimitOrder({...limitOrder, takeProfitPips: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: themeColors.inputBackground,
                      color: themeColors.text,
                      border: `1px solid ${themeColors.border}`,
                      borderRadius: '4px',
                      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      fontSize: '13px',
                      textAlign: 'center',
                      fontWeight: '500'
                    }}
                  />
            </div>
          </div>

          <button
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#FF9800',
              color: 'black',
              border: '2px solid rgba(0,0,0,0.2)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: '14px',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 6px rgba(255, 152, 0, 0.4)'
            }}
            onMouseOver={(e) => (e.target as HTMLElement).style.transform = 'translateY(-1px)'}
            onMouseOut={(e) => (e.target as HTMLElement).style.transform = 'translateY(0)'}
            onClick={() => {
              if (!latestTick) return;
              const entryPips = parseFloat(limitOrder.entryPips) || 0;
              let slPips = parseFloat(limitOrder.stopLossPips) || 0;
              let tpPips = parseFloat(limitOrder.takeProfitPips) || 0;
              const pip = instrument.includes('JPY') ? 0.01 : 0.0001;
              const side = limitOrder.side as 'BUY' | 'SELL';
              const reference = side === 'BUY' ? latestTick.bid : latestTick.ask;
              const price = side === 'BUY' ? reference - entryPips * pip : reference + entryPips * pip;
              let qty = 0.1;
              if (riskMode === 'ATR') {
                const mult = parseFloat(atrMult) || 1.0;
                const atrP = pickAtrPips();
                if (atrP > 0) {
                  slPips = Math.max(1, mult * atrP);
                  if (tpPips <= 0) tpPips = slPips;
                }
              } else if (riskMode === 'PCT') {
                if (slPips <= 0) slPips = 10;
                qty = computeQtyForRisk(slPips);
                if (tpPips <= 0) tpPips = slPips;
              }
              placeLimitOrder({ instrument, side, qty, price, slPips, tpPips });
            }}
          >
            Place Advanced Order
          </button>

        {/* Open Positions Table (spans both columns) */}
        <div style={{ gridColumn: '1 / -1', backgroundColor: themeColors.cardBackground, padding: '16px', borderRadius: '8px', border: `1px solid ${themeColors.border}`, boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h4 style={{ margin: '0 0 12px 0', color: themeColors.text, fontSize: '15px', fontWeight: 600 }}>📂 Open Positions</h4>
          {positions.length === 0 ? (
            <div style={{ color: themeColors.textSecondary, fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>No open positions</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: themeColors.textSecondary }}>
                    <th style={{ padding: '8px' }}>Instrument</th>
                    <th style={{ padding: '8px' }}>Side</th>
                    <th style={{ padding: '8px' }}>Amount</th>
                    <th style={{ padding: '8px' }}>Open Price</th>
                    <th style={{ padding: '8px' }}>P/L</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                      <tr key={p.orderId} style={{ borderTop: `1px solid ${themeColors.border}` }}>
                        <td style={{ padding: '8px', color: themeColors.text }}>{p.instrument}</td>
                        <td style={{ padding: '8px', color: p.orderCommand === 'BUY' ? '#4CAF50' : '#f44336', fontWeight: 700 }}>{p.orderCommand}</td>
                        <td style={{ padding: '8px', color: themeColors.text }}>{p.amount.toFixed(2)}</td>
                        <td style={{ padding: '8px', color: themeColors.text }}>{p.openPrice?.toFixed(5) ?? '-'}</td>
                        <td style={{ padding: '8px', color: (p.pnl || 0) >= 0 ? '#4CAF50' : '#f44336' }}>{(p.pnl ?? 0).toFixed(2)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <button
                            style={{
                              padding: '6px 10px',
                              backgroundColor: '#FF6B35',
                              color: 'black',
                              border: '2px solid rgba(0,0,0,0.2)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }}
                            onClick={() => closePosition({ orderId: p.orderId })}
                          >Close</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        </div>
      </div>
      )}


      {/* Strategy Panel */}
      <div style={{ marginTop: '12px' }}>
        <StrategyPanel instrument={instrument} period={period} onChangePeriod={setPeriod} isDarkMode={isDarkMode} />
      </div>



    </div>
  );
}
