import { useEffect, useRef, useState } from 'react';

/**
 * 数字计数动画 hook：数值变化时从旧值平滑滚动到新值。
 * 尊重 prefers-reduced-motion：直接跳变，不做动画。
 *
 * @param value    目标数值
 * @param duration 动画时长（毫秒），默认 500
 * @returns 当前应显示的动画数值
 */
export function useCountUp(value: number, duration = 500): number {
  const [display, setDisplay] = useState(value);
  const prevValueRef = useRef(value);
  const frameRef = useRef<number>();

  useEffect(() => {
    const from = prevValueRef.current;
    const to = value;
    prevValueRef.current = value;

    if (from === to) {
      setDisplay(to);
      return;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutCubic：先快后慢
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return display;
}
