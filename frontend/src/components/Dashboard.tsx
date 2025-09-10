import { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import PriceChart from './PriceChart';

export default function Dashboard() {
  const { fullState, requestHistoricalData } = useStore();
  const [selectedInstrument, setSelectedInstrument] = useState('Dashboard');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const account = fullState?.accountInfo?.account;
  const positions = fullState?.accountInfo?.positions || [];

  const instruments = ['Dashboard', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP'];

  useEffect(() => {
    document.body.style.backgroundColor = isDarkMode ? '#121212' : '#ffffff';
    document.body.style.color = isDarkMode ? 'white' : '#333';
  }, [isDarkMode]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: isDarkMode ? '#121212' : '#ffffff',
      color: isDarkMode ? 'white' : '#333',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header with Account & Position Overview */}
      <header style={{
        backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5',
        padding: '20px',
        borderBottom: `1px solid ${isDarkMode ? '#333' : '#ddd'}`,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '20px',
          alignItems: 'center',
          marginBottom: '15px'
        }}>
          {/* Left: Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h1 style={{
              margin: 0,
              color: '#4CAF50',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontWeight: '600'
            }}>Marks GoTrader</h1>
          </div>

          {/* Center: Account Info */}
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '12px',
                color: isDarkMode ? '#888' : '#666',
                marginBottom: '4px',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>Account Balance</div>
              <div style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: '#4CAF50',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                £{account?.balance?.toFixed(2) || '0.00'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '12px',
                color: isDarkMode ? '#888' : '#666',
                marginBottom: '4px',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>Equity</div>
              <div style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: '#2196F3',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                £{account?.equity?.toFixed(2) || '0.00'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '12px',
                color: isDarkMode ? '#888' : '#666',
                marginBottom: '4px',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>Open Positions</div>
              <div style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: '#FF9800',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                {positions.length}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '12px',
                color: isDarkMode ? '#888' : '#666',
                marginBottom: '4px',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>Unrealized P/L</div>
              <div style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: (account?.unrealizedPnL || 0) >= 0 ? '#4CAF50' : '#f44336',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                £{account?.unrealizedPnL?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            {/* Dark/Light toggle moved here, styled like other buttons */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{
                padding: '8px 12px',
                backgroundColor: isDarkMode ? '#ffffff' : '#333333',
                color: isDarkMode ? '#333333' : '#ffffff',
                border: '2px solid rgba(0,0,0,0.2)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                boxShadow: isDarkMode ? '0 2px 4px rgba(0,0,0,0.2)' : '0 2px 4px rgba(0,0,0,0.5)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => (e.target as HTMLElement).style.transform = 'translateY(0)'}
            >
              {isDarkMode ? 'Light' : 'Dark'}
            </button>

            <button
              style={{
                padding: '8px 12px',
                backgroundColor: '#FF9800',
                color: 'black',
                border: '2px solid rgba(0,0,0,0.2)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                boxShadow: '0 2px 4px rgba(255, 152, 0, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => (e.target as HTMLElement).style.transform = 'translateY(0)'}
              onClick={() => requestHistoricalData(selectedInstrument)}
            >
              Request H Data
            </button>
            <button
              style={{
                padding: '8px 12px',
                backgroundColor: '#f44336',
                color: 'black',
                border: '2px solid rgba(0,0,0,0.2)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                boxShadow: '0 2px 4px rgba(244, 67, 54, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => (e.target as HTMLElement).style.transform = 'translateY(0)'}
              onClick={() => {
                if (window.confirm('EMERGENCY STOP: This will close all positions and stop all trading strategies. Are you sure?')) {
                  console.log('Emergency Stop Activated');
                  // TODO: Send emergency stop command to backend
                }
              }}
            >
              EMERGENCY STOP
            </button>
          </div>
        </div>

        {/* Position Summary */}
        {positions.length > 0 && (
          <div style={{
            backgroundColor: isDarkMode ? '#2a2a2a' : '#f0f0f0',
            padding: '10px',
            borderRadius: '6px',
            marginTop: '10px'
          }}>
            <div style={{
              fontSize: '14px',
              marginBottom: '8px',
              color: '#FF9800',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>📊 Active Positions:</div>
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              {positions.slice(0, 5).map((pos, index) => (
                <div key={index} style={{
                  backgroundColor: isDarkMode ? '#333' : '#e0e0e0',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: isDarkMode ? 'white' : '#333',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  <div style={{ fontWeight: 'bold', color: '#2196F3' }}>{pos.instrument}</div>
                  <div>{pos.orderCommand} | {pos.amount} | P/L: £{pos.pnl.toFixed(2)}</div>
                </div>
              ))}
              {positions.length > 5 && (
                <div style={{
                  padding: '8px 12px',
                  color: isDarkMode ? '#888' : '#666',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  +{positions.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main style={{ padding: '20px' }}>
        {/* Instrument Tabs */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {instruments.map((instrument) => (
              <button
                key={instrument}
                onClick={() => {
                  setSelectedInstrument(instrument);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: selectedInstrument === instrument ? '#4CAF50' : '#333',
                  color: 'white',
                  border: selectedInstrument === instrument ? '2px solid rgba(255,255,255,0.3)' : '2px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: selectedInstrument === instrument ? 'bold' : 'normal',
                  transition: 'all 0.2s',
                  opacity: 1,
                  boxShadow: selectedInstrument === instrument ? '0 2px 6px rgba(76, 175, 80, 0.4)' : '0 1px 3px rgba(0,0,0,0.2)'
                }}
              >
                {instrument}
              </button>
            ))}
          </div>
        </div>



        {/* Main Content Area - allow page to scroll naturally (no inner scrollbars) */}
        <div style={{
          backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
          borderRadius: '8px'
        }}>
          {selectedInstrument === 'Dashboard' ? (
            <div style={{ padding: '12px' }}>
              {fullState?.ledgerHealthSummary ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>Ledger Health</div>
                    <div style={{ fontSize: 12, color: isDarkMode ? '#aaa' : '#666' }}>
                      Updated: {new Date(fullState.ledgerHealthSummary.generatedAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <div style={{ borderTop: `1px solid ${isDarkMode ? '#333' : '#eee'}` }} />
                  <div style={{ marginTop: 8, fontSize: 12, color: isDarkMode ? '#aaa' : '#666' }}>
                    Green dot = live ticks in last 5s • Valid = 200 bars, ordered, no dups (recent window)
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {fullState.ledgerHealthSummary.instruments.map((row) => (
                      <div key={row.instrument} style={{
                        display: 'grid',
                        gridTemplateColumns: '120px 100px repeat(7, 1fr)',
                        gap: 8,
                        alignItems: 'center',
                        padding: '6px 8px',
                        borderBottom: `1px solid ${isDarkMode ? '#333' : '#eee'}`
                      }}>
                        <div style={{ fontWeight: 600, color: '#2196F3' }}>{row.instrument}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: isDarkMode ? '#ccc' : '#555' }}>ticks:</span>
                          <span>{row.ticks.count}</span>
                          <span title={row.ticks.live ? 'Live' : 'Stale'} style={{
                            width: 8, height: 8, borderRadius: '50%',
                            backgroundColor: row.ticks.live ? '#4CAF50' : '#f44336', display: 'inline-block'
                          }} />
                        </div>
                        {['TEN_SECS','ONE_MIN','FIVE_MINS','FIFTEEN_MINS','ONE_HOUR','FOUR_HOURS','DAILY'].map((p) => {
                          const pHealth = row.periods[p];
                          const ready = pHealth && pHealth.count >= 200;
                          const valid = pHealth?.valid;
                          return (
                            <div key={p} style={{ fontSize: 12 }}>
                              <div style={{ color: isDarkMode ? '#aaa' : '#666' }}>{p.replace('_',' ').toLowerCase()}</div>
                              <div>
                                <span style={{ fontWeight: 600 }}>{pHealth?.count || 0}</span>
                                <span style={{ marginLeft: 6, color: valid ? '#4CAF50' : ready ? '#FF9800' : '#f44336' }}>
                                  {valid ? '✓' : ready ? '•' : '×'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{
                  height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isDarkMode ? '#666' : '#999', fontSize: 16
                }}>
                  Waiting for ledger summary...
                </div>
              )}
            </div>
          ) : (
            <PriceChart isDarkMode={isDarkMode} instrument={selectedInstrument} />
          )}
        </div>


      </main>
    </div>
  );
}
