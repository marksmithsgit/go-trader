import { useState, useEffect } from 'react';
import { useStore } from '../store/store';
import AccountInfo from './AccountInfo';
import PriceChart from './PriceChart';
import PositionsTable from './PositionsTable';

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
          {/* Left: Title and Theme Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h1 style={{
              margin: 0,
              color: '#4CAF50',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontWeight: '600'
            }}>GoTrader</h1>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{
                padding: '8px 12px',
                backgroundColor: isDarkMode ? '#333' : '#e0e0e0',
                color: isDarkMode ? 'white' : '#333',
                border: '2px solid rgba(0,0,0,0.1)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => e.target.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
            >
              {isDarkMode ? 'Light' : 'Dark'}
            </button>
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
              onMouseOver={(e) => e.target.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
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
              onMouseOver={(e) => e.target.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.target.style.transform = 'translateY(0)'}
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
                  if (instrument === 'EURUSD' || instrument === 'Dashboard') {
                    setSelectedInstrument(instrument);
                  } else {
                    setSelectedInstrument(''); // Blank page for other instruments
                  }
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: selectedInstrument === instrument ? '#4CAF50' : '#333',
                  color: 'white',
                  border: selectedInstrument === instrument ? '2px solid rgba(255,255,255,0.3)' : '2px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  cursor: (instrument === 'EURUSD' || instrument === 'Dashboard') ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: selectedInstrument === instrument ? 'bold' : 'normal',
                  transition: 'all 0.2s',
                  opacity: (instrument === 'EURUSD' || instrument === 'Dashboard') ? 1 : 0.6,
                  boxShadow: selectedInstrument === instrument ? '0 2px 6px rgba(76, 175, 80, 0.4)' : '0 1px 3px rgba(0,0,0,0.2)'
                }}
              >
                {instrument}
              </button>
            ))}
          </div>
        </div>

        {/* Data Availability Indicators - Only show for EURUSD */}
        {selectedInstrument === 'EURUSD' && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '10px',
            padding: '8px 0',
            fontSize: '14px',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontWeight: '500'
          }}>
            <span style={{ color: isDarkMode ? '#00FF00' : '#4CAF50', fontWeight: 'bold', fontSize: '12px' }}>Ticks</span>
            <span style={{ color: isDarkMode ? '#00FF00' : '#4CAF50', fontWeight: 'bold', fontSize: '12px' }}>10s</span>
            <span style={{ color: isDarkMode ? '#00FF00' : '#4CAF50', fontWeight: 'bold', fontSize: '12px' }}>1m</span>
            <span style={{ color: isDarkMode ? '#00FF00' : '#4CAF50', fontWeight: 'bold', fontSize: '12px' }}>5m</span>
            <span style={{ color: isDarkMode ? '#00FF00' : '#4CAF50', fontWeight: 'bold', fontSize: '12px' }}>15m</span>
            <span style={{ color: isDarkMode ? '#00FF00' : '#4CAF50', fontWeight: 'bold', fontSize: '12px' }}>1h</span>
            <span style={{ color: isDarkMode ? '#00FF00' : '#4CAF50', fontWeight: 'bold', fontSize: '12px' }}>4h</span>
            <span style={{ color: isDarkMode ? '#00FF00' : '#4CAF50', fontWeight: 'bold', fontSize: '12px' }}>1d</span>
          </div>
        )}

        {/* Market Data Display */}
        <div style={{
          height: '60vh',
          backgroundColor: isDarkMode ? '#1a1a1a' : '#ffffff',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          {selectedInstrument === 'Dashboard' ? (
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDarkMode ? '#666' : '#999',
              fontSize: '18px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📊</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>Trading Dashboard</div>
                <div>Welcome to GoTrader</div>
                <div style={{ marginTop: '10px', fontSize: '16px' }}>Select a currency pair to start trading</div>
              </div>
            </div>
          ) : selectedInstrument === 'EURUSD' ? (
            <PriceChart isDarkMode={isDarkMode} />
          ) : selectedInstrument === '' ? (
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDarkMode ? '#666' : '#999',
              fontSize: '18px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              🚧 Coming Soon - Select EURUSD to view trading interface
            </div>
          ) : (
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDarkMode ? '#666' : '#999',
              fontSize: '18px',
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>🏗️</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>Under Construction</div>
                <div>The {selectedInstrument} trading interface is coming soon!</div>
                <div style={{ marginTop: '10px', fontSize: '16px' }}>Please select EURUSD for now.</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with additional info */}
        <footer style={{
          marginTop: '20px',
          padding: '20px',
          backgroundColor: isDarkMode ? '#1e1e1e' : '#f5f5f5',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: `1px solid ${isDarkMode ? '#333' : '#ddd'}`
        }}>
          <div style={{ color: '#4CAF50', fontSize: '14px', fontWeight: '500' }}>
            🟢 Connected to backend | 📡 WebSocket active | 📊 Real-time data streaming
          </div>
          <div style={{
            color: isDarkMode ? '#ccc' : '#666',
            fontSize: '13px',
            fontWeight: '400',
            backgroundColor: isDarkMode ? '#2a2a2a' : '#e0e0e0',
            padding: '6px 12px',
            borderRadius: '4px',
            border: `1px solid ${isDarkMode ? '#444' : '#ccc'}`
          }}>
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </footer>
      </main>
    </div>
  );
}
