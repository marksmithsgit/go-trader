import { create } from 'zustand';
import type { FullState } from '../types';

const WEBSOCKET_URL = 'ws://localhost:8080/ws';

interface AppState {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  fullState: FullState | null;
  connect: () => void;
  disconnect: () => void;
  requestHistoricalData: (instrument: string) => void;
}

let websocket: WebSocket | null = null;

export const useStore = create<AppState>((set: any, get: any) => ({
  connectionStatus: 'disconnected', // Start as disconnected for debugging
  fullState: null,

  connect: () => {
    if (websocket) {
      return; // Already connected or connecting
    }

    set({ connectionStatus: 'connecting' });

    websocket = new WebSocket(WEBSOCKET_URL);

    websocket.onopen = () => {
      set({ connectionStatus: 'connected' });
      console.log('WebSocket connected');
    };

    websocket.onmessage = (event) => {
      try {
        const data: FullState = JSON.parse(event.data);
        set({ fullState: data });
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = () => {
      set({ connectionStatus: 'disconnected' });
      console.log('WebSocket disconnected');
      websocket = null;
      // Optional: implement auto-reconnect logic here
      setTimeout(() => get().connect(), 5000); // Reconnect after 5 seconds
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      set({ connectionStatus: 'disconnected' });
      websocket?.close();
    };
  },

  disconnect: () => {
    if (websocket) {
      websocket.close();
      websocket = null;
    }
    set({ connectionStatus: 'disconnected' });
  },

  requestHistoricalData: (instrument: string) => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      const request = {
        type: 'HISTORICAL_DATA_REQUEST',
        instrument: instrument,
        timestamp: Date.now()
      };
      websocket.send(JSON.stringify(request));
      console.log('Requested historical data for:', instrument);
    } else {
      console.error('WebSocket not connected');
    }
  },
}));
