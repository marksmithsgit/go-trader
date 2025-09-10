import { create } from 'zustand';
import type { FullState } from '../types';


const API_BASE = 'http://localhost:8080';

const WEBSOCKET_URL = 'ws://localhost:8080/ws';

interface ChartSettings {
  period: string;
  side: 'bid' | 'ask';
  showBollinger: boolean;
  showDonchian: boolean;
  showSupertrend: boolean;
  showKeltner: boolean;
  showDemas: boolean;
  showVwap: boolean;
}

interface AppState {
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  fullState: FullState | null;
  chartSettings: ChartSettings;
  setChartSettings: (settings: Partial<ChartSettings>) => void;
  connect: () => void;
  disconnect: () => void;
  requestHistoricalData: (instrument: string) => void;
  sendCommand: (payload: any) => void;
  placeMarketOrder: (p: { instrument: string; side: 'BUY' | 'SELL'; qty: number; slPips?: number; tpPips?: number; slippage?: number }) => void;
  placeLimitOrder: (p: { instrument: string; side: 'BUY' | 'SELL'; qty: number; price: number; slPips?: number; tpPips?: number }) => void;
  closeAll: (p: { instrument: string; side: 'BUY' | 'SELL' }) => void;
  startStrategy: (p: { instrument: string; strategyKey: string; period: string; qty?: number; atrMult?: number; params?: Record<string, number> }) => void;
  stopStrategy: (p: { instrument: string; period: string }) => void;
  fetchStrategyRuns: (p: { instrument?: string; period?: string; limit?: number }) => Promise<any[]>;
  fetchStrategyEvents: (p: { runId: string; limit?: number }) => Promise<any[]>;
}

let websocket: WebSocket | null = null;

export const useStore = create<AppState>((set, get) => ({
  connectionStatus: 'disconnected', // Start as disconnected for debugging
  fullState: null,

  // Global chart settings
  chartSettings: {
    period: 'ONE_MIN',
    side: 'bid',
    showBollinger: true,
    showDonchian: false,
    showSupertrend: false,
    showKeltner: false,
    showDemas: false,
    showVwap: false,
  },

  setChartSettings: (settings: Partial<ChartSettings>) => {
    set((state) => ({
      chartSettings: { ...state.chartSettings, ...settings }
    }));
  },

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
      const request = { type: 'HISTORICAL_DATA_REQUEST', instrument, timestamp: Date.now() };
      websocket.send(JSON.stringify(request));
      console.log('Requested historical data for:', instrument);
    } else {
      console.error('WebSocket not connected');
    }
  },

  sendCommand: (payload: any) => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify(payload));
    } else {
      console.error('WebSocket not connected');
    }
  },

  placeMarketOrder: ({ instrument, side, qty, slPips = 0, tpPips = 0, slippage = 5 }) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    const cmd = { type: 'PLACE_ORDER', instrument, side, qty, slPips, tpPips, slippage, orderType: 'MARKET' };
    websocket.send(JSON.stringify(cmd));
  },

  placeLimitOrder: ({ instrument, side, qty, price, slPips = 0, tpPips = 0 }) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    const cmd = { type: 'PLACE_LIMIT', instrument, side, qty, price, slPips, tpPips };
    websocket.send(JSON.stringify(cmd));
  },

  closeAll: ({ instrument, side }) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    const cmd = { type: 'CLOSE_ALL', instrument, side };
    websocket.send(JSON.stringify(cmd));
  },

  startStrategy: ({ instrument, strategyKey, period, qty = 0.1, atrMult = 1.0, params }) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    const cmd = { type: 'STRATEGY_START', instrument, strategyKey, period, qty, atrMult, params };
    websocket.send(JSON.stringify(cmd));
  },

  stopStrategy: ({ instrument, period }) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
    const cmd = { type: 'STRATEGY_STOP', instrument, period };
    websocket.send(JSON.stringify(cmd));
  },

  fetchStrategyRuns: async ({ instrument = '', period = '', limit = 50 }) => {
    const params = new URLSearchParams({ instrument, period, limit: String(limit) });
    const res = await fetch(`${API_BASE}/api/strategy/runs?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  },

  fetchStrategyEvents: async ({ runId, limit = 200 }) => {
    const params = new URLSearchParams({ runId, limit: String(limit) });
    const res = await fetch(`${API_BASE}/api/strategy/events?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  },

}));
