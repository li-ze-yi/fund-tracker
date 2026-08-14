import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import echarts from '@/utils/echarts';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';

export interface EChartOpts {
  renderer?: 'canvas' | 'svg';
  devicePixelRatio?: number;
  width?: number | string;
  height?: number | string;
}

interface EChartProps {
  option: EChartsCoreOption;
  style?: CSSProperties;
  className?: string;
  opts?: EChartOpts;
  notMerge?: boolean;
  lazyUpdate?: boolean;
}

export default function EChart({ option, style, className, opts, notMerge, lazyUpdate }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, {
      renderer: opts?.renderer ?? 'canvas',
      devicePixelRatio: opts?.devicePixelRatio,
      width: opts?.width,
      height: opts?.height,
    });
    chartRef.current = chart;
    chart.setOption(option, notMerge ?? false, lazyUpdate ?? false);

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, notMerge ?? false, lazyUpdate ?? false);
  }, [option, notMerge, lazyUpdate]);

  return <div ref={containerRef} className={className} style={{ width: '100%', maxWidth: '100vw', overflow: 'hidden', ...style }} />;
}