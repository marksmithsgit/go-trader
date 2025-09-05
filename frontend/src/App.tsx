import { useEffect } from 'react';
import { useStore } from './store/store';
import Dashboard from './components/Dashboard';

function App() {
  const { connectionStatus, connect } = useStore();

  useEffect(() => {
    connect();
  }, [connect]);

  if (connectionStatus !== 'connected') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#121212',
        color: 'white',
        fontFamily: 'Arial, sans-serif'
      }}>
        <h1>🚀 Go Trading System</h1>
        <div style={{ margin: '20px 0' }}>
          {connectionStatus === 'connecting' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔄</div>
              <h2>Connecting to backend...</h2>
              <p>Establishing WebSocket connection to ws://localhost:8080/ws</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>❌</div>
              <h2>Connection Failed</h2>
              <p>Unable to connect to backend server</p>
              <p style={{ fontSize: '14px', color: '#888', marginTop: '10px' }}>
                Make sure the Go backend is running on port 8080
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <Dashboard />;
}

function DashboardComponent() {
  return <Dashboard />;
}

export default App;