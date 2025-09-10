import React from 'react';

/**
 * What: ChartToolbar renders timeframe buttons and overlay visibility toggles for the chart.
 * How: Stateless presentational component using Tailwind CSS; invokes callbacks to update parent state.
 * Params:
 *  - period: currently selected timeframe key (e.g., 'ONE_MIN')
 *  - onChangePeriod: callback to change timeframe
 *  - showEma/showBoll/showDonch/showSt: booleans to control overlay visibility
 *  - onToggleEma/onToggleBoll/onToggleDonch/onToggleSt: toggle callbacks
 * Returns: A toolbar area with timeframe button group and overlay checkboxes with color dots.
 */
export default function ChartToolbar({
  period,
  onChangePeriod,
  side,
  onChangeSide,
  showBollinger = true,
  showDonchian = false,
  showSupertrend = false,
  showKeltner = false,
  showDemas = false,
  showVwap = false,
  onToggleBollinger,
  onToggleDonchian,
  onToggleSupertrend,
  onToggleKeltner,
  onToggleDemas,
  onToggleVwap,
}: {
  period: string;
  onChangePeriod: (p: string) => void;
  side: 'bid' | 'ask';
  onChangeSide: (s: 'bid' | 'ask') => void;
  showBollinger?: boolean;
  showDonchian?: boolean;
  showSupertrend?: boolean;
  showKeltner?: boolean;
  showDemas?: boolean;
  showVwap?: boolean;
  onToggleBollinger?: (show: boolean) => void;
  onToggleDonchian?: (show: boolean) => void;
  onToggleSupertrend?: (show: boolean) => void;
  onToggleKeltner?: (show: boolean) => void;
  onToggleDemas?: (show: boolean) => void;
  onToggleVwap?: (show: boolean) => void;
}) {
  const timeframes: Array<{ key: string; label: string }> = [
    { key: 'TEN_SECS', label: '10s' },
    { key: 'ONE_MIN', label: '1m' },
    { key: 'FIVE_MINS', label: '5m' },
    { key: 'FIFTEEN_MINS', label: '15m' },
    { key: 'ONE_HOUR', label: '1h' },
    { key: 'FOUR_HOURS', label: '4h' },
    { key: 'DAILY', label: '1d' },
  ];

  return (
    <div className="col-span-full flex flex-col items-center gap-4 mb-4">
      {/* Bid/Ask Selector and Timeframes */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        {/* Bid/Ask Selector */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => onChangeSide('bid')}
            className={[
              'px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 border-2',
              side === 'bid'
                ? 'bg-blue-500 text-white shadow-lg border-blue-300 ring-2 ring-blue-300 ring-opacity-50 transform scale-105'
                : 'bg-gray-700 text-gray-300 border-gray-600 hover:text-white hover:bg-gray-600 hover:border-gray-500',
            ].join(' ')}
            title="Show Bid prices"
          >
            🔵 BID
          </button>
          <button
            onClick={() => onChangeSide('ask')}
            className={[
              'px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 border-2',
              side === 'ask'
                ? 'bg-red-500 text-white shadow-lg border-red-300 ring-2 ring-red-300 ring-opacity-50 transform scale-105'
                : 'bg-gray-700 text-gray-300 border-gray-600 hover:text-white hover:bg-gray-600 hover:border-gray-500',
            ].join(' ')}
            title="Show Ask prices"
          >
            🔴 ASK
          </button>
        </div>

        {/* Timeframes */}
        <div className="flex flex-wrap items-center gap-2">
          {timeframes.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onChangePeriod(key)}
              className={[
                'border-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200',
                period === key
                  ? 'bg-green-400 text-gray-900 border-green-300 shadow-xl ring-2 ring-green-300 ring-opacity-50 transform scale-110 font-extrabold'
                  : 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600 hover:border-gray-500',
              ].join(' ')}
              title={`Switch to ${label}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Technical Indicators - Increased gap from controls above */}
      {(onToggleBollinger || onToggleDonchian || onToggleSupertrend || onToggleKeltner || onToggleDemas || onToggleVwap) && (
        <div style={{ marginTop: 10 }} className="flex flex-wrap items-center justify-center gap-4 text-xs">
          {onToggleBollinger && (
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-amber-400"
                checked={showBollinger}
                onChange={(e) => onToggleBollinger(e.target.checked)}
              />
              <span className="inline-flex items-center gap-2 text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ffb300' }} />
                Bollinger
              </span>
            </label>
          )}
          {onToggleDonchian && (
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-purple-400"
                checked={showDonchian}
                onChange={(e) => onToggleDonchian(e.target.checked)}
              />
              <span className="inline-flex items-center gap-2 text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ab47bc' }} />
                Donchian
              </span>
            </label>
          )}
          {onToggleKeltner && (
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-blue-400"
                checked={showKeltner}
                onChange={(e) => onToggleKeltner(e.target.checked)}
              />
              <span className="inline-flex items-center gap-2 text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#42a5f5' }} />
                Keltner
              </span>
            </label>
          )}
          {onToggleDemas && (
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-cyan-400"
                checked={showDemas}
                onChange={(e) => onToggleDemas(e.target.checked)}
              />
              <span className="inline-flex items-center gap-2 text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#26c6da' }} />
                DEMA
              </span>
            </label>
          )}
          {onToggleVwap && (
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-orange-400"
                checked={showVwap}
                onChange={(e) => onToggleVwap(e.target.checked)}
              />
              <span className="inline-flex items-center gap-2 text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ff7043' }} />
                VWAP
              </span>
            </label>
          )}
          {onToggleSupertrend && (
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-green-400"
                checked={showSupertrend}
                onChange={(e) => onToggleSupertrend(e.target.checked)}
              />
              <span className="inline-flex items-center gap-2 text-gray-300">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#66bb6a' }} />
                Supertrend
              </span>
            </label>
          )}
        </div>
      )}

    </div>
  );
}

