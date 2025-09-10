import { useEffect, useRef, useState } from 'react';
import * as LightweightCharts from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, LineData } from 'lightweight-charts';
import { useStore } from '../store/store';

/**
 * What: Simple chart that displays 200 bars from the Go ledger for a currency pair and period.
 * How: Gets historicalBars from fullState, converts to candlestick data, shows technical indicators from backend.
 * Params:
 *   - instrument: currency pair (e.g., 'EURUSD')
 *   - period: timeframe (e.g., 'ONE_MIN', 'FIVE_MINS', etc.)
 *   - height: chart height in pixels
 *   - dark: theme mode
 * Returns: Chart displaying exactly 200 bars with technical indicator overlays from backend data.
 */
export default function ChartArea({
  instrument,
  height = 400,
  period = 'ONE_MIN',
  side = 'bid',
  dark = false,
  showBollinger = true,
  showDonchian = false,
  showSupertrend = false,
  showKeltner = false,
  showDemas = false,
  showVwap = false
}: {
  instrument: string;
  height?: number;
  period?: string;
  side?: 'bid' | 'ask';
  dark?: boolean;
  showBollinger?: boolean;
  showDonchian?: boolean;
  showSupertrend?: boolean;
  showKeltner?: boolean;
  showDemas?: boolean;
  showVwap?: boolean;
}) {
  const { fullState } = useStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Technical indicator series refs
  const bollingerUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bollingerLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const donchianUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const donchianMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const donchianLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const keltnerUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const keltnerMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const keltnerLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const dema25Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const dema50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const dema100Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const dema200Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);
  const supertrendRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    try {
      // Theme colors
      const bg = dark ? '#0f1115' : '#ffffff';
      const txt = dark ? '#d6d6d6' : '#222';
      const grid = dark ? '#1c1f26' : '#e8e8e8';
      const border = dark ? '#2a2f38' : '#cfd8dc';

      // Create chart with disabled interactions to always show 200 bars
      const chart = LightweightCharts.createChart(containerRef.current, {
        height,
        layout: { background: { color: bg }, textColor: txt },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        timeScale: {
          rightOffset: 0,
          barSpacing: 6,
          borderColor: border,
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        rightPriceScale: { borderColor: border },
        crosshair: { mode: 1 },
        // Disable zooming and scrolling
        handleScroll: false,
        handleScale: false,
      });

      // Add candlestick series (v5 API)
      const candlestickSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      // Add technical indicator series (v5 API)
      bollingerUpperRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#ffb300', lineWidth: 1, priceLineVisible: false });
      bollingerMiddleRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#ffa000', lineWidth: 2, priceLineVisible: false });
      bollingerLowerRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#ffb300', lineWidth: 1, priceLineVisible: false });

      donchianUpperRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#ab47bc', lineWidth: 1, priceLineVisible: false });
      donchianMiddleRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#8e24aa', lineWidth: 2, priceLineVisible: false });
      donchianLowerRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#ab47bc', lineWidth: 1, priceLineVisible: false });

      keltnerUpperRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#42a5f5', lineWidth: 1, priceLineVisible: false });
      keltnerMiddleRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#1976d2', lineWidth: 2, priceLineVisible: false });
      keltnerLowerRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#42a5f5', lineWidth: 1, priceLineVisible: false });

      dema25Ref.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#26c6da', lineWidth: 1, priceLineVisible: false });
      dema50Ref.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#00acc1', lineWidth: 1, priceLineVisible: false });
      dema100Ref.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#0097a7', lineWidth: 2, priceLineVisible: false });
      dema200Ref.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#00838f', lineWidth: 3, priceLineVisible: false });

      vwapRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#ff7043', lineWidth: 2, priceLineVisible: false });

      // Supertrend as single adaptive line
      supertrendRef.current = chart.addSeries(LightweightCharts.LineSeries, { color: '#66bb6a', lineWidth: 2, priceLineVisible: false });

      chartRef.current = chart;
      candlestickSeriesRef.current = candlestickSeries;

    } catch (error) {
      console.error('Error creating chart:', error);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [height, dark]);

  // Update chart data when fullState changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !chartRef.current) return;

    // Get 200 bars from the Go ledger for this instrument and period
    const historicalBars = fullState?.historicalBars?.[instrument]?.[period] || [];

    if (historicalBars.length === 0) {
      console.debug(`ChartArea: No bars for ${instrument} ${period}`);
      return;
    }



    // Sort bars by timestamp (ascending order for chart)
    const sortedBars = [...historicalBars].sort((a, b) => a.bar_end_timestamp - b.bar_end_timestamp);

    // Convert to candlestick data format using selected side
    const candlestickData: CandlestickData[] = sortedBars.map(bar => {
      const ohlc = side === 'bid' ? bar.bid : bar.ask;
      return {
        time: Math.floor(bar.bar_end_timestamp / 1000) as any,
        open: ohlc.o,
        high: ohlc.h,
        low: ohlc.l,
        close: ohlc.c,
      };
    });

    // Set candlestick data
    candlestickSeriesRef.current.setData(candlestickData);

    // Fit chart to content to show all 200 bars
    chartRef.current.timeScale().fitContent();

    // Helper function to convert indicator data to line format
    const mapToLineData = (selector: (bar: any) => number | null | undefined): LineData[] => {
      const result = sortedBars
        .map(bar => ({
          time: Math.floor(bar.bar_end_timestamp / 1000) as any,
          value: selector(bar)
        }))
        .filter(point => typeof point.value === 'number' && Number.isFinite(point.value)) as LineData[];

      // Debug logging for problematic indicators
      if (result.length === 0) {
        console.debug('No valid data points for indicator');
      } else if (result.length < 10) {
        console.debug(`Only ${result.length} valid data points for indicator`);
      }

      return result;
    };

    // Update technical indicators with data from backend (only if enabled)
    // Use selected side for all indicators
    const getIndicator = (bar: any, indicator: string) => {
      return side === 'bid' ? bar[`bid_${indicator}`] : bar[`ask_${indicator}`];
    };

    // Debug: Log sample bar data to see what indicators are available (only once)
    if (sortedBars.length > 0 && showKeltner) {
      const sampleBar = sortedBars[0];
      console.log('Keltner data structure:', {
        bid_keltner: sampleBar.bid_keltner,
        ask_keltner: sampleBar.ask_keltner,
        side: side,
        selectedIndicator: getIndicator(sampleBar, 'keltner')
      });
    }

    if (showBollinger) {
      if (bollingerUpperRef.current) {
        bollingerUpperRef.current.setData(mapToLineData(bar => getIndicator(bar, 'bollinger')?.upper));
      }
      if (bollingerMiddleRef.current) {
        bollingerMiddleRef.current.setData(mapToLineData(bar => getIndicator(bar, 'bollinger')?.middle));
      }
      if (bollingerLowerRef.current) {
        bollingerLowerRef.current.setData(mapToLineData(bar => getIndicator(bar, 'bollinger')?.lower));
      }
    } else {
      if (bollingerUpperRef.current) bollingerUpperRef.current.setData([]);
      if (bollingerMiddleRef.current) bollingerMiddleRef.current.setData([]);
      if (bollingerLowerRef.current) bollingerLowerRef.current.setData([]);
    }

    if (showDonchian) {
      if (donchianUpperRef.current) {
        donchianUpperRef.current.setData(mapToLineData(bar => getIndicator(bar, 'donchian')?.upper));
      }
      if (donchianMiddleRef.current) {
        donchianMiddleRef.current.setData(mapToLineData(bar => getIndicator(bar, 'donchian')?.middle));
      }
      if (donchianLowerRef.current) {
        donchianLowerRef.current.setData(mapToLineData(bar => getIndicator(bar, 'donchian')?.lower));
      }
    } else {
      if (donchianUpperRef.current) donchianUpperRef.current.setData([]);
      if (donchianMiddleRef.current) donchianMiddleRef.current.setData([]);
      if (donchianLowerRef.current) donchianLowerRef.current.setData([]);
    }

    if (showKeltner) {
      if (keltnerUpperRef.current) {
        keltnerUpperRef.current.setData(mapToLineData(bar => getIndicator(bar, 'keltner')?.upper));
      }
      if (keltnerMiddleRef.current) {
        keltnerMiddleRef.current.setData(mapToLineData(bar => getIndicator(bar, 'keltner')?.middle));
      }
      if (keltnerLowerRef.current) {
        keltnerLowerRef.current.setData(mapToLineData(bar => getIndicator(bar, 'keltner')?.lower));
      }
    } else {
      if (keltnerUpperRef.current) keltnerUpperRef.current.setData([]);
      if (keltnerMiddleRef.current) keltnerMiddleRef.current.setData([]);
      if (keltnerLowerRef.current) keltnerLowerRef.current.setData([]);
    }

    if (showDemas) {
      if (dema25Ref.current) {
        dema25Ref.current.setData(mapToLineData(bar => getIndicator(bar, 'demas')?.dema_25));
      }
      if (dema50Ref.current) {
        dema50Ref.current.setData(mapToLineData(bar => getIndicator(bar, 'demas')?.dema_50));
      }
      if (dema100Ref.current) {
        dema100Ref.current.setData(mapToLineData(bar => getIndicator(bar, 'demas')?.dema_100));
      }
      if (dema200Ref.current) {
        dema200Ref.current.setData(mapToLineData(bar => getIndicator(bar, 'demas')?.dema_200));
      }
    } else {
      if (dema25Ref.current) dema25Ref.current.setData([]);
      if (dema50Ref.current) dema50Ref.current.setData([]);
      if (dema100Ref.current) dema100Ref.current.setData([]);
      if (dema200Ref.current) dema200Ref.current.setData([]);
    }

    if (showVwap) {
      if (vwapRef.current) {
        // VWAP should use bar_vwap field from the Vwap structure
        vwapRef.current.setData(mapToLineData(bar => getIndicator(bar, 'vwap')?.bar_vwap));
      }
    } else {
      if (vwapRef.current) vwapRef.current.setData([]);
    }

    if (showSupertrend) {
      if (supertrendRef.current) {
        // Create adaptive Supertrend line that switches between upper and lower values
        const supertrendData: LineData[] = sortedBars
          .map(bar => {
            const time = Math.floor(bar.bar_end_timestamp / 1000) as any;
            const supertrend = getIndicator(bar, 'supertrend');
            const upper = supertrend?.upper;
            const lower = supertrend?.lower;
            const ohlc = side === 'bid' ? bar.bid : bar.ask;
            const close = ohlc.c;

            // Use the appropriate Supertrend value based on price position
            // If close is above upper, use lower (bullish trend)
            // If close is below lower, use upper (bearish trend)
            let value: number | null = null;
            if (typeof upper === 'number' && typeof lower === 'number' && typeof close === 'number') {
              value = close > upper ? lower : upper;
            }

            return { time, value };
          })
          .filter(point => typeof point.value === 'number' && Number.isFinite(point.value)) as LineData[];

        supertrendRef.current.setData(supertrendData);
      }
    } else {
      if (supertrendRef.current) supertrendRef.current.setData([]);
    }

    // Fit chart to content
    chartRef.current.timeScale().fitContent();

  }, [fullState, instrument, period, side, showBollinger, showDonchian, showKeltner, showDemas, showVwap, showSupertrend]);

  // Auto-resize chart width with container
  useEffect(() => {
    if (!containerRef.current || !chartRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        chartRef.current.applyOptions({ width: Math.max(200, Math.floor(rect.width)) });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Show data count for debugging
  const barCount = (fullState?.historicalBars?.[instrument]?.[period] || []).length;

  return (
    <div ref={containerRef} className="w-full relative" style={{ height }}>
      {/* Data indicator */}
      <div style={{
        position: 'absolute',
        top: 8,
        left: 8,
        fontSize: 11,
        padding: '4px 8px',
        borderRadius: 4,
        background: dark ? 'rgba(28, 31, 38, 0.9)' : 'rgba(238, 242, 247, 0.9)',
        color: dark ? '#9fb0c0' : '#37474f',
        border: `1px solid ${dark ? '#2a2f38' : '#cfd8dc'}`,
        zIndex: 10
      }}>
        {barCount} bars
      </div>
    </div>
  );
}

