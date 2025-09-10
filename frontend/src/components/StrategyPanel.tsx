import React, { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import type { StrategyStatus, StrategyRunRow } from '../types';
import StrategyRunDrawer from './StrategyRunDrawer';



/**
 * What: StrategyPanel lets you select and control an automated strategy per instrument.
 * How: Sends WebSocket commands (STRATEGY_START/STOP) via store to backend StrategyEngine; also syncs timeframe.
 * Params:
 *  - instrument: symbol to display context
 *  - period: selected timeframe key
 *  - onChangePeriod: handler to change timeframe in the parent/chart
 * Returns: Tailwind card with strategy selector, timeframe buttons, quantity/ATR inputs, Start/Stop controls, and status.
 */
export default function StrategyPanel({
  instrument,
  period,
  onChangePeriod,
  isDarkMode = true,
}: {
  instrument: string;
  period: string;
  onChangePeriod: (p: string) => void;
  isDarkMode?: boolean;
}) {
  const strategies = useMemo(() => [
    { key: 'DEMA_RSI', name: 'DEMA + RSI (starter)' },
    { key: 'BREAKOUT_DC', name: 'Donchian Breakout' },
    { key: 'SUPERTREND_TREND', name: 'Supertrend Trend-Follow' },
  ], []);

  const timeframes: Array<{ key: string; label: string }> = [
    { key: 'TEN_SECS', label: '10s' },
    { key: 'ONE_MIN', label: '1m' },
    { key: 'FIVE_MINS', label: '5m' },
    { key: 'FIFTEEN_MINS', label: '15m' },
    { key: 'ONE_HOUR', label: '1h' },
    { key: 'FOUR_HOURS', label: '4h' },
    { key: 'DAILY', label: '1d' },
  ];

  const [selectedStrategy, setSelectedStrategy] = useState<string>('DEMA_RSI');
  const [running, setRunning] = useState<boolean>(false);
  const [qty, setQty] = useState<number>(0.1);
  const [atrMult, setAtrMult] = useState<number>(1.0);
  // Strategy-specific params (lightweight, extendable)
  const [dcLen, setDcLen] = useState<number>(20);
  const [dcBuf, setDcBuf] = useState<number>(0.5); // ATR buffer multiplier
  const [stAtrLen, setStAtrLen] = useState<number>(10);
  const [stMult, setStMult] = useState<number>(3.0);

  // Local Strategy Bank (risk-free, localStorage only)
  type BankItem = { name: string; strategyKey: string; params: Record<string, number> };
  const [bank, setBank] = useState<BankItem[]>(() => {
    try { const raw = localStorage.getItem('strategyBankV1'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [selectedBank, setSelectedBank] = useState<string>(''); // name
  React.useEffect(() => { try { localStorage.setItem('strategyBankV1', JSON.stringify(bank)); } catch {} }, [bank]);


  const fullState = useStore((s) => s.fullState);
  const backendStatus = useMemo(() => {
    const list = fullState?.strategyStatuses || [];
    return list.find((s: StrategyStatus) => s.instrument === instrument && s.period === period);
  }, [fullState, instrument, period]);
  const backendRunning = !!backendStatus?.running;
  // Persist basic settings per instrument
  const [showDrawer, setShowDrawer] = useState(false);

  const [recentRuns, setRecentRuns] = useState<StrategyRunRow[]>([]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`strategy:${instrument}`);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.strategyKey) setSelectedStrategy(s.strategyKey);
        if (typeof s.qty === 'number') setQty(s.qty);
        if (typeof s.atrMult === 'number') setAtrMult(s.atrMult);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument]);

  // Load per-instrument+strategy params when switching
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`strategyParams:${instrument}:${selectedStrategy}`);
      if (raw) {
        const p = JSON.parse(raw) as Record<string, number>;
        if (selectedStrategy === 'BREAKOUT_DC') { if (p.len) setDcLen(p.len); if (p.buf) setDcBuf(p.buf); }
        if (selectedStrategy === 'SUPERTREND_TREND') { if (p.atrLen) setStAtrLen(p.atrLen); if (p.mult) setStMult(p.mult); }
      }
    } catch {}
  }, [instrument, selectedStrategy]);

  // Save per-instrument+strategy params on change
  React.useEffect(() => {
    try {
      const p: Record<string, number> = {};
      if (selectedStrategy === 'BREAKOUT_DC') { p.len = dcLen; p.buf = dcBuf; }
      if (selectedStrategy === 'SUPERTREND_TREND') { p.atrLen = stAtrLen; p.mult = stMult; }
      localStorage.setItem(`strategyParams:${instrument}:${selectedStrategy}`, JSON.stringify(p));
    } catch {}
  }, [instrument, selectedStrategy, dcLen, dcBuf, stAtrLen, stMult]);

  const paramsForSelected = useMemo(() => {
    const p: Record<string, number> = {};
    if (selectedStrategy === 'BREAKOUT_DC') { p.len = dcLen; p.buf = dcBuf; }
    if (selectedStrategy === 'SUPERTREND_TREND') { p.atrLen = stAtrLen; p.mult = stMult; }
    return p;
  }, [selectedStrategy, dcLen, dcBuf, stAtrLen, stMult]);
  React.useEffect(() => {
    try {
      const payload = { strategyKey: selectedStrategy, qty, atrMult };
      localStorage.setItem(`strategy:${instrument}`, JSON.stringify(payload));
    } catch {}
  }, [instrument, selectedStrategy, qty, atrMult]);


  const startStrategy = useStore((s) => s.startStrategy);
  const stopStrategy = useStore((s) => s.stopStrategy);


  const [note, setNote] = useState<string>('Idle');

  const handleStart = () => {
    setRunning(true);
    setNote(`Running ${selectedStrategy} on ${instrument} @ ${period}`);
    startStrategy({ instrument, strategyKey: selectedStrategy, period, qty, atrMult, params: paramsForSelected });
  };

  const handleStop = () => {
    setRunning(false);
    setNote('Stopped');
    stopStrategy({ instrument, period });
  };

  const cardBg = isDarkMode ? '#1e293b' : '#ffffff';
  const border = isDarkMode ? '#334155' : '#e5e7eb';
  const text = isDarkMode ? '#e2e8f0' : '#111827';
  return (
    <div className="rounded-xl shadow-lg p-6 bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white">Strategy Engine</h3>
          <p className="text-xs text-gray-400 mt-1">Configure, run and monitor strategies for <span className="text-gray-200 font-medium">{instrument}</span></p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-200 bg-gray-700/70 px-3 py-1 rounded-lg border border-gray-600">{instrument}</span>
          <span className={`text-xs px-3 py-1 rounded-full font-semibold border ${backendRunning ? 'bg-green-500/90 border-green-400 text-white' : 'bg-gray-600 border-gray-500 text-gray-200'}`}>
            {backendRunning ? '🟢 Running' : '⭕ Stopped'}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">


      {/* Strategy Configuration */}
      <div className="lg:col-span-8 bg-gray-800/60 rounded-xl p-5 mb-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs uppercase tracking-wide text-gray-400">Strategy Configuration</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Strategy selector */}
          <div>
            <label className="block text-[11px] font-medium text-gray-300 mb-2">Select Strategy</label>
            <select
              className="w-full bg-gray-700/70 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
            >
              {strategies.map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          </div>
          {/* Strategy Bank (local) */}
          <div>
            <label className="block text-[11px] font-medium text-gray-300 mb-2">Strategy Bank</label>
            <div className="flex items-center gap-2">
              <select
                className="flex-1 bg-gray-700/70 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                value={selectedBank}
                onChange={(e) => {
                  const name = e.target.value; setSelectedBank(name);
                  const item = bank.find(b => b.name === name);
                  if (!item) return;
                  setSelectedStrategy(item.strategyKey);
                  if (item.params) {
                    if (item.strategyKey === 'BREAKOUT_DC') { if (item.params.len) setDcLen(item.params.len); if (item.params.buf) setDcBuf(item.params.buf); }
                    if (item.strategyKey === 'SUPERTREND_TREND') { if (item.params.atrLen) setStAtrLen(item.params.atrLen); if (item.params.mult) setStMult(item.params.mult); }
                  }
                }}
              >
                <option value="">— Select preset —</option>
                {bank.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 shadow-md"
                onClick={() => {
                  const name = prompt('Save current as preset name:');
                  if (!name) return;
                  const params = {...paramsForSelected};
                  const next = bank.filter(b => b.name !== name).concat([{ name, strategyKey: selectedStrategy, params }]);
                  setBank(next); setSelectedBank(name);
                }}
              >Save as</button>
              <button
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 shadow-md"
                onClick={() => { if (!selectedBank) return; setBank(bank.filter(b => b.name !== selectedBank)); setSelectedBank(''); }}
              >Delete</button>
            </div>
          </div>
      {/* Strategy Status & Information Panel (Right column, row 1) */}
      <div className="lg:col-span-4 bg-gray-800/50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-yellow-400 rounded"></span>
          Strategy Status & Information
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
          {/* Current Status */}
          <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
            <h5 className="text-xs font-medium text-yellow-300 mb-2">Current Status</h5>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Engine:</span>
                <span className={backendRunning ? 'text-green-400' : 'text-red-400'}>
                  {backendRunning ? '🟢 Running' : '🔴 Stopped'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Strategy:</span>
                <span className="text-white">{strategies.find(s => s.key === selectedStrategy)?.name || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Timeframe:</span>
                <span className="text-white">{timeframes.find(t => t.key === period)?.label || 'None'}</span>
              </div>
              {backendStatus?.lastSignal && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Signal:</span>
                  <span className="text-blue-400">{backendStatus.lastSignal}</span>
                </div>
              )}
              {backendStatus?.lastActionAt && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Action:</span>
                  <span className="text-gray-300">{new Date(backendStatus.lastActionAt).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Strategy Information */}
          <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
            <h5 className="text-xs font-medium text-blue-300 mb-2">Strategy Information</h5>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Position Size:</span>
                <span className="text-white">{qty} lots</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">ATR Multiplier:</span>
                <span className="text-white">{atrMult}x</span>
              </div>
              {selectedStrategy === 'BREAKOUT_DC' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-400">DC Length:</span>
                    <span className="text-white">{dcLen}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Buffer:</span>
                    <span className="text-white">{dcBuf}x ATR</span>
                  </div>
                </>
              )}
              {selectedStrategy === 'SUPERTREND_TREND' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-400">ATR Length:</span>
                    <span className="text-white">{stAtrLen}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">ST Multiplier:</span>
                    <span className="text-white">{stMult}x</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Status Message */}
        <div className="mt-4 p-3 bg-gray-700/30 rounded-lg border border-gray-600">
          <div className="text-xs text-gray-300">
            <span className="font-medium">System Status:</span> {backendStatus ? (
              <span className="text-gray-200">
                Backend {backendRunning ? 'Running' : 'Stopped'}{backendStatus.lastSignal ? ` — Last: ${backendStatus.lastSignal}` : ''}
                {backendStatus.lastActionAt ? ` @ ${new Date(backendStatus.lastActionAt).toLocaleTimeString()}` : ''}
              </span>
            ) : (
              <span className="text-gray-400">{note}</span>
            )}
          </div>
        </div>
      </div>

        </div>
      </div>

      {/* Timeframe and Parameters Section */}
      <div className="lg:col-span-8 bg-gray-800/50 rounded-lg p-4 mb-6">
        <h4 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-green-400 rounded"></span>
          Execution Settings
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Timeframe buttons */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-3">Strategy Timeframe</label>
            <div className="grid grid-cols-4 gap-2">
              {timeframes.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => onChangePeriod(key)}
                  className={[
                    'border-2 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200',
                    period === key
                      ? 'bg-green-500 text-white border-green-400 shadow-lg ring-2 ring-green-300 ring-opacity-50 transform scale-105'
                      : 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600 hover:border-gray-500',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-3">Risk & Strategy Parameters</label>
            <div className="space-y-4">
              {/* Basic Parameters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Position Size (lots)</label>
                  <input
                    type="number"
                    step={0.01}
                    min={0.01}
                    max={100}
                    value={qty}
                    onChange={(e) => setQty(Math.max(0.01, Math.min(100, parseFloat(e.target.value) || 0.01)))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">ATR Multiplier</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0.1}
                    max={10}
                    value={atrMult}
                    onChange={(e) => setAtrMult(Math.max(0.1, Math.min(10, parseFloat(e.target.value) || 1)))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Strategy-Specific Parameters */}
              {selectedStrategy === 'BREAKOUT_DC' && (
                <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                  <h5 className="text-xs font-medium text-blue-300 mb-2">Donchian Channel Settings</h5>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Channel Length</label>
                      <input
                        type="number"
                        min={2}
                        max={500}
                        value={dcLen}
                        onChange={(e) => setDcLen(Math.max(2, Math.min(500, parseInt(e.target.value || '20'))))}
                        className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Buffer Multiplier</label>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={10}
                        value={dcBuf}
                        onChange={(e) => setDcBuf(Math.max(0, Math.min(10, parseFloat(e.target.value || '0.5'))))}
                        className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedStrategy === 'SUPERTREND_TREND' && (
                <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                  <h5 className="text-xs font-medium text-purple-300 mb-2">Supertrend Settings</h5>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">ATR Length</label>
                      <input
                        type="number"
                        min={2}
                        max={200}
                        value={stAtrLen}
                        onChange={(e) => setStAtrLen(Math.max(2, Math.min(200, parseInt(e.target.value || '14'))))}
                        className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Multiplier</label>
                      <input
                        type="number"
                        step={0.1}
                        min={0.1}
                        max={10}
                        value={stMult}
                        onChange={(e) => setStMult(Math.max(0.1, Math.min(10, parseFloat(e.target.value || '3'))))}
                        className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1.5 text-sm text-white focus:ring-1 focus:ring-purple-400"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      {/* Recent Strategy Runs (Right column, row 2) */}
      <div className="lg:col-span-4 bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <span className="w-1 h-4 bg-purple-400 rounded"></span>
            Recent Strategy Runs
          </h4>
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-3 py-1.5 border border-gray-600 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 transition-all"
              onClick={() => setShowDrawer(true)}
            >
              📊 Open Drawer
            </button>
            <button
              className="text-xs px-3 py-1.5 border border-blue-600 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all"
              onClick={async () => {
                const runs = await useStore.getState().fetchStrategyRuns({ instrument, period, limit: 10 });
                setRecentRuns(runs);
              }}
            >
              🔄 Load
            </button>
          </div>
        </div>
        <div className="space-y-2 max-h-32 overflow-auto">
          {recentRuns.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-4 bg-gray-700/30 rounded-lg border border-gray-600 border-dashed">
              No strategy runs yet. Click "Start Strategy" to begin.
            </div>
          ) : recentRuns.map((r) => (
            <div key={r.runId} className="text-xs text-gray-200 flex items-center justify-between bg-gray-700/50 p-2 rounded border border-gray-600">
              <span>{r.strategyKey} · {new Date(r.startedAt).toLocaleTimeString()} · {r.status}</span>
              <button
                className="ml-2 text-[10px] px-2 py-0.5 border border-gray-600 rounded bg-gray-800"
                onClick={async () => {
                  const evts = await useStore.getState().fetchStrategyEvents({ runId: r.runId, limit: 50 });
                  console.log('Events for run', r.runId, evts);
                  alert(`Events: ${evts.slice(0,5).map((e:any)=>e.eventType+ (e.signal? ':'+e.signal:'' )).join(', ')}${evts.length>5?' …':''}`);
                }}
              >Events</button>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-8 bg-gray-800/50 rounded-lg p-4 mb-6">
        <h4 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-orange-400 rounded"></span>
          Strategy Control
        </h4>

        <div className="flex items-center gap-4">
          <button
            onClick={handleStart}
            disabled={backendRunning}
            className={`flex-1 px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 shadow-lg ${
              backendRunning
                ? 'opacity-50 cursor-not-allowed bg-gray-600 text-gray-400'
                : 'bg-green-600 hover:bg-green-700 text-white border-2 border-green-500 hover:border-green-400 transform hover:scale-105'
            }`}
          >
            🚀 Start Strategy
          </button>
          <button
            onClick={handleStop}
            disabled={!backendRunning}
            className={`flex-1 px-6 py-3 rounded-lg text-sm font-bold transition-all duration-200 shadow-lg ${
              !backendRunning
                ? 'opacity-50 cursor-not-allowed bg-gray-600 text-gray-400'
                : 'bg-red-600 hover:bg-red-700 text-white border-2 border-red-500 hover:border-red-400 transform hover:scale-105'
            }`}
          >
            ⛔ Stop Strategy
          </button>
        </div>
      </div>
      </div>




      <StrategyRunDrawer open={showDrawer} instrument={instrument} period={period} onClose={() => setShowDrawer(false)} />

    </div>
  );
}

