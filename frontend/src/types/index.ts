export interface OHLCV {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Vwap {
  tick_vwap: number | null;
  bar_vwap: number | null;
}

export interface Emas {
  ema_5: number | null;
  ema_8: number | null;
  ema_30: number | null;
  ema_50: number | null;
}

export interface Donchian {
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface Bollinger {
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface Bar {
  produced_at: number;
  bar_start_timestamp: number;
  bar_end_timestamp: number;
  pairId: number;
  instrument: string;
  period: string;
  bid: OHLCV;
  ask: OHLCV;
  vwap: Vwap;
  emas: Emas;
  donchian: Donchian;
  bollinger: Bollinger;
}

export interface Demas {
  dema_25: number;
  dema_50: number;
  dema_100: number;
  dema_200: number;
}

export interface Macd {
  line: number;
  signal: number;
  hist: number;
}

export interface Rsi {
  fast: number;
  slow: number;
}

export interface Stoch {
  k: number;
  d: number;
}

export interface Keltner {
  upper: number;
  middle: number;
  lower: number;
}

export interface Supertrend {
  upper: number;
  lower: number;
}

export interface HistoricalBar {
  produced_at: number;
  bar_start_timestamp: number;
  bar_end_timestamp: number;
  sequence?: number;
  pairId: number;
  instrument: string;
  period: string;
  bid: OHLCV;
  ask: OHLCV;
  // Bid-side indicators
  bid_vwap?: Vwap | null;
  bid_atr?: number;
  bid_obv?: number;
  bid_demas?: Demas;
  bid_macd?: Macd;
  bid_rsi?: Rsi;
  bid_stoch?: Stoch;
  bid_cci?: number;
  bid_mfi?: number;
  bid_bollinger?: Bollinger;
  bid_keltner?: Keltner;
  bid_donchian?: Donchian;
  bid_supertrend?: Supertrend;
  // Ask-side indicators
  ask_vwap?: Vwap | null;
  ask_atr?: number;
  ask_obv?: number;
  ask_demas?: Demas;
  ask_macd?: Macd;
  ask_rsi?: Rsi;
  ask_stoch?: Stoch;
  ask_cci?: number;
  ask_mfi?: number;
  ask_bollinger?: Bollinger;
  ask_keltner?: Keltner;
  ask_donchian?: Donchian;
  ask_supertrend?: Supertrend;
}

export interface Tick {
  produced_at: number;
  timestamp: number;
  pairId: number;
  instrument: string;
  bid: number;
  ask: number;
  bidVol: number;
  askVol: number;
}

export interface Position {
  orderId: string;
  label: string;
  instrument: string;
  orderCommand: string;
  amount: number;
  openPrice: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  state: string;
}

export interface Account {
  accountId: string;
  balance: number;
  equity: number;
  marginUsed: number;
  freeMargin: number;
  marginAvailable: number;
  leverage: number;
  accountPnL: number;
  unrealizedPnL: number;
}

export interface AccountInfo {
  produced_at: number;
  timestamp: number;
  account: Account;
  positions: Position[];
}

export interface StrategyStatus {
  instrument: string;
  period: string;
  key: string;
  running: boolean;
  lastSignal: 'BUY' | 'SELL' | 'NONE' | string;
  lastActionAt: number; // ms epoch
}

export interface PeriodHealth {
  count: number;
  valid: boolean;
  newestTs?: number;
}

export interface TicksHealth {
  count: number;
  live: boolean;
  lastTs?: number;
}

export interface InstrumentHealthSummary {
  instrument: string;
  ticks: TicksHealth;
  periods: Record<string, PeriodHealth>;
}

export interface LedgerHealthSummary {
  generatedAt: number;
  instruments: InstrumentHealthSummary[];
}

export interface FullState {
  accountInfo: AccountInfo;
  ticks: Record<string, Tick[]>;
  bars: Record<string, Record<string, Bar[]>>;
  historicalBars: Record<string, Record<string, HistoricalBar[]>>;
  strategyStatuses?: StrategyStatus[];
  ledgerHealthSummary?: LedgerHealthSummary;
}


export interface StrategyRunRow {
  runId: string;
  startedAt: string; // ISO
  stoppedAt?: string;
  instrument: string;
  period: string;
  strategyKey: string;
  qty: number;
  atrMult: number;
  params: Record<string, number>;
  status: string;
}

export interface StrategyEventRow {
  runId: string;
  ts: string; // ISO
  instrument: string;
  period: string;
  strategyKey: string;
  eventType: string; // signal|order_submitted|...
  signal?: string;
  details?: Record<string, any>;
}
