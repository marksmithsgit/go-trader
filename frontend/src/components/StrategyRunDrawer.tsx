import React from 'react';
import { useStore } from '../store/store';
import type { StrategyRunRow, StrategyEventRow } from '../types';

/**
 * What: StrategyRunDrawer shows recent strategy runs and a timeline of events for a selected run.
 * How: Calls backend REST endpoints via store.fetchStrategyRuns/Events; renders a right-side drawer.
 * Params:
 *  - open: boolean to show/hide the drawer
 *  - instrument: instrument filter for runs
 *  - period: timeframe filter for runs
 *  - onClose: callback when user closes the drawer
 * Returns: A floating drawer with run list, run details (params), events timeline and quick metrics.
 */
export default function StrategyRunDrawer({ open, instrument, period, onClose }: { open: boolean; instrument: string; period: string; onClose: () => void; }) {
  const fetchRuns = useStore((s) => s.fetchStrategyRuns);
  const fetchEvents = useStore((s) => s.fetchStrategyEvents);

  const [runs, setRuns] = React.useState<StrategyRunRow[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<StrategyRunRow | null>(null);
  const [events, setEvents] = React.useState<StrategyEventRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      if (!open) return;
      setLoading(true);
      try {
        const rs = await fetchRuns({ instrument, period, limit: 25 });
        if (!mounted) return;
        setRuns(rs);
        if (rs.length > 0) {
          setSelectedRun(rs[0]);
        } else {
          setSelectedRun(null);
          setEvents([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [open, instrument, period, fetchRuns]);

  React.useEffect(() => {
    let mounted = true;
    async function loadEvents() {
      if (!selectedRun) { setEvents([]); return; }
      setLoading(true);
      try {
        const evts = await fetchEvents({ runId: selectedRun.runId, limit: 500 });
        if (!mounted) return;
        // Events come newest-first; we prefer oldest-first for timeline
        setEvents([...evts].reverse());
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadEvents();
    return () => { mounted = false; };
  }, [selectedRun, fetchEvents]);

  // Compute simple metrics
  const metrics = React.useMemo(() => {
    const total = events.length;
    const signals = events.filter(e => e.eventType === 'signal');
    const buy = signals.filter(e => (e.signal || '').toUpperCase() === 'BUY').length;
    const sell = signals.filter(e => (e.signal || '').toUpperCase() === 'SELL').length;
    const orders = events.filter(e => e.eventType.includes('order')).length;

    // Duration and signals/hour
    const startMs = selectedRun?.startedAt ? new Date(selectedRun.startedAt).getTime() : 0;
    const stopMs = selectedRun?.stoppedAt ? new Date(selectedRun.stoppedAt).getTime() : Date.now();
    const durationMins = startMs ? Math.max(0, Math.round((stopMs - startMs) / 60000)) : 0;
    const durationHours = durationMins / 60;
    const signalsPerHour = durationHours > 0 ? Number((signals.length / durationHours).toFixed(2)) : 0;

    // Net pips and PnL if provided in event details (trade_closed preferred)
    let netPips = 0;
    let netPnl = 0;
    let wins = 0;
    let losses = 0;
    for (const e of events) {
      const d: any = (e as any).details || {};
      const pips = typeof d?.pnlPips === 'number' ? d.pnlPips : (typeof d?.pips === 'number' ? d.pips : undefined);
      const pnl = typeof d?.pnl === 'number' ? d.pnl : undefined;
      if (typeof pips === 'number' && Number.isFinite(pips)) {
        netPips += pips;
        if (pips > 0) wins++; else if (pips < 0) losses++;
      } else if (typeof pnl === 'number' && Number.isFinite(pnl)) {
        if (pnl > 0) wins++; else if (pnl < 0) losses++;
      }
      if (typeof pnl === 'number' && Number.isFinite(pnl)) netPnl += pnl;
    }
    const closed = wins + losses;
    const winRate = closed > 0 ? Number(((wins / closed) * 100).toFixed(1)) : 0;

    return { total, signals: signals.length, buy, sell, orders, durationMins, signalsPerHour, netPips, netPnl, winRate };
  }, [events, selectedRun]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ pointerEvents: 'auto', position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />

      {/* Drawer */}
      <div style={{ pointerEvents: 'auto', position: 'absolute', top: 0, right: 0, height: '100%', width: '420px', background: '#1e1e1e', color: '#eee', borderLeft: '1px solid #444', boxShadow: '0 0 20px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #333' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Strategy Runs · {instrument} · {period}</div>
          <button onClick={onClose} style={{ background: '#333', border: '1px solid #555', color: '#fff', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>Close</button>
        </div>

        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          {/* Runs list & refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={selectedRun?.runId || ''} onChange={(e) => {
              const r = runs.find(x => x.runId === e.target.value) || null;
              setSelectedRun(r);
            }} style={{ flex: 1, background: '#2a2a2a', border: '1px solid #555', color: '#fff', padding: '8px 10px', borderRadius: 6 }}>
              <option value="">— Select a run —</option>
              {runs.map(r => (
                <option key={r.runId} value={r.runId}>{r.strategyKey} · {new Date(r.startedAt).toLocaleString()} · {r.status}</option>
              ))}
            </select>
            <button onClick={async () => {
              setLoading(true);
              try {
                const rs = await fetchRuns({ instrument, period, limit: 25 });
                setRuns(rs);
              } finally {
                setLoading(false);
              }
            }} style={{ background: '#333', border: '1px solid #555', color: '#fff', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>Refresh</button>
          </div>

          {/* Run details */}
          {selectedRun && (
            <div style={{ background: '#242424', border: '1px solid #444', borderRadius: 8, padding: 10, fontSize: 12 }}>
              <div style={{ marginBottom: 6, color: '#ccc' }}>
                <strong>Run:</strong> {selectedRun.runId}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div><span style={{ color: '#999' }}>Strategy:</span> {selectedRun.strategyKey}</div>
                <div><span style={{ color: '#999' }}>Status:</span> {selectedRun.status}</div>
                <div><span style={{ color: '#999' }}>Started:</span> {new Date(selectedRun.startedAt).toLocaleString()}</div>
                <div><span style={{ color: '#999' }}>Stopped:</span> {selectedRun.stoppedAt ? new Date(selectedRun.stoppedAt).toLocaleString() : '—'}</div>
                <div><span style={{ color: '#999' }}>Qty:</span> {selectedRun.qty}</div>
                <div><span style={{ color: '#999' }}>ATR Mult:</span> {selectedRun.atrMult}</div>
              </div>
              {/* Params */}
              {selectedRun.params && Object.keys(selectedRun.params || {}).length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ color: '#aaa', marginBottom: 4 }}>Params</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(selectedRun.params).map(([k,v]) => (
                      <span key={k} style={{ background: '#2d2d2d', border: '1px solid #555', borderRadius: 6, padding: '4px 8px' }}>{k}: {v as any}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat( auto-fill, minmax(90px, 1fr) )', gap: 8, fontSize: 12 }}>
            <MetricBox label="Events" value={String(metrics.total)} />
            <MetricBox label="Signals" value={String(metrics.signals)} />
            <MetricBox label="BUY" value={String(metrics.buy)} />
            <MetricBox label="SELL" value={String(metrics.sell)} />
            <MetricBox label="Orders" value={String(metrics.orders)} />
            <MetricBox label="Duration" value={`${metrics.durationMins || 0}m`} />
            <MetricBox label="Sig/hr" value={`${metrics.signalsPerHour || 0}`} />
            <MetricBox label="Win%" value={`${metrics.winRate || 0}%`} />
            <MetricBox label="Net Pips" value={`${metrics.netPips || 0}`} />
            <MetricBox label="Net PnL" value={`${metrics.netPnl || 0}`} />
          </div>

          {/* Timeline */}
          <div style={{ background: '#242424', border: '1px solid #444', borderRadius: 8, padding: 10, fontSize: 12, maxHeight: '50vh', overflow: 'auto' }}>
            {loading && <div style={{ color: '#aaa' }}>Loading…</div>}
            {!loading && events.length === 0 && <div style={{ color: '#aaa' }}>No events.</div>}
            {!loading && events.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {events.map((e, i) => (
                  <li key={i} style={{ padding: '6px 0', borderBottom: '1px dashed #3a3a3a' }}>
                    <div style={{ color: '#aaa' }}>{new Date(e.ts).toLocaleString()} · <strong>{e.eventType}</strong> {e.signal ? `· ${e.signal}` : ''}</div>
                    {e.details && Object.keys(e.details).length > 0 && (
                      <div style={{ color: '#999', marginTop: 2 }}>
                        {Object.entries(e.details).slice(0,6).map(([k,v]) => (
                          <span key={k} style={{ marginRight: 8 }}>{k}: {String(v)}</span>
                        ))}
                        {Object.keys(e.details).length > 6 ? '…' : ''}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#242424', border: '1px solid #444', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ color: '#aaa', fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{value}</div>
    </div>
  );
}

