import { useState, useEffect } from 'react';

// 响应式判断移动端：监听窗口 resize，视口宽度 <= 768 视为移动端。
// 组件卸载时自动清除监听，避免内存泄漏。
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}