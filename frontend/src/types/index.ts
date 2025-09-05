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
  pairId: number;
  instrument: string;
  period: string;
  bid: OHLCV;
  ask: OHLCV;
  vwap: Vwap;
  atr: number;
  obv: number;
  demas: Demas;
  macd: Macd;
  rsi: Rsi;
  stoch: Stoch;
  cci: number;
  mfi: number;
  bollinger: Bollinger;
  keltner: Keltner;
  donchian: Donchian;
  supertrend: Supertrend;
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

export interface FullState {
  accountInfo: AccountInfo;
  ticks: Record<string, Tick[]>;
  bars: Record<string, Record<string, Bar[]>>;
  historicalBars: Record<string, Record<string, HistoricalBar[]>>;
}
