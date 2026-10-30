import { useState, useEffect } from 'react';

// 响应式判断移动端：监听窗口 resize，视口宽度 <= breakpoint（默认 768）视为移动端。
// 组件卸载时自动清除监听，避免内存泄漏。
export function useIsMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}