import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/store';

// Helper function to get theme colors
const getThemeColors = (isDarkMode: boolean) => ({
  background: isDarkMode ? '#1a1a1a' : '#ffffff',
  cardBackground: isDarkMode ? '#2a2a2a' : '#f5f5f5',
  border: isDarkMode ? '#555' : '#ddd',
  text: isDarkMode ? 'white' : '#333',
  textSecondary: isDarkMode ? '#ccc' : '#666',
  inputBackground: isDarkMode ? '#333' : '#e0e0e0'
});

export default function PriceChart({ isDarkMode }: { isDarkMode: boolean }) {
  const { fullState, requestHistoricalData } = useStore();
  const themeColors = getThemeColors(isDarkMode);
  const instrument = 'EURUSD';
  const period = 'TEN_SECS';
  const [expanded, setExpanded] = useState(false);
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
  const prevAskRef = useRef<number | null>(null);

  // Debug: Show all available data
  const allBars = fullState?.bars?.[instrument] || {};
  const availablePeriods = Object.keys(allBars);
  const bars = fullState?.bars?.[instrument]?.[period] || [];
  const ticks = fullState?.ticks?.[instrument] || [];

  // Try to find bars with any period if TEN_SECS doesn't exist
  let actualBars = bars;
  let actualPeriod = period;
  if (bars.length === 0 && availablePeriods.length > 0) {
    actualPeriod = availablePeriods[0];
    actualBars = allBars[actualPeriod] || [];
  }

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

      {/* Live Price Display */}
      <div style={{
        backgroundColor: themeColors.cardBackground,
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        border: `1px solid ${themeColors.border}`,
        boxShadow: isDarkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        {latestTick ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '15px', marginBottom: '20px', alignItems: 'center' }}>
            <div style={{
              textAlign: 'center',
              backgroundColor: themeColors.inputBackground,
              padding: '20px',
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
              }}>BID</div>
              <div style={{
                fontSize: '28px',
                fontWeight: '700',
                color: bidChange === 'up' ? '#4CAF50' : bidChange === 'down' ? '#f44336' : themeColors.text,
                transition: 'color 0.5s',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                {latestTick.bid.toFixed(5)}
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
              padding: '15px 20px',
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
                {((latestTick.ask - latestTick.bid) * 10000).toFixed(1)}
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
              padding: '20px',
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
                {latestTick.ask.toFixed(5)}
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
            padding: '30px',
            fontSize: '16px'
          }}>
            Waiting for live price data...
          </div>
        )}
      </div>

      {/* Trading Interface */}
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
              onMouseOver={(e) => e.target.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
              onClick={() => {
                if (latestTick) {
                  console.log('Buy Market Order at Ask:', latestTick.ask, 'SL:', quickOrder.stopLossPips, 'TP:', quickOrder.takeProfitPips);
                  // TODO: Send order to backend
                }
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
              onMouseOver={(e) => e.target.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
              onClick={() => {
                if (latestTick) {
                  console.log('Sell Market Order at Bid:', latestTick.bid, 'SL:', quickOrder.stopLossPips, 'TP:', quickOrder.takeProfitPips);
                  // TODO: Send order to backend
                }
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
              onMouseOver={(e) => e.target.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
              onClick={() => {
                console.log('Close All BUY Positions');
                // TODO: Send close buy positions command to backend
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
              onMouseOver={(e) => e.target.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
              onClick={() => {
                console.log('Close All SELL Positions');
                // TODO: Send close sell positions command to backend
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
            onMouseOver={(e) => e.target.style.transform = 'translateY(-1px)'}
            onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
            onClick={() => console.log('Advanced Order:', limitOrder)}
          >
            Place Advanced Order
          </button>
        </div>
      </div>



    </div>
  );
}
