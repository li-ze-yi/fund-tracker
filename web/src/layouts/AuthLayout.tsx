import { Outlet } from 'react-router-dom';
import BrandBadge from '@/components/BrandBadge';

export default function AuthLayout() {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: 24,
        overflow: 'hidden',
      }}
    >
      {/* 顶部金色氛围光晕 */}
      <div style={{
        position: 'absolute',
        top: '-12%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(680px, 95vw)',
        height: 'min(680px, 95vw)',
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--accent-gold-dim), transparent 65%)',
        pointerEvents: 'none',
      }} />
      {/* 底部暖金光晕 */}
      <div style={{
        position: 'absolute',
        bottom: '-18%',
        right: '-8%',
        width: 460,
        height: 460,
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--accent-gold-dim), transparent 65%)',
        pointerEvents: 'none',
        opacity: 0.6,
      }} />

      {/* 顶部品牌水印 */}
      <div style={{
        position: 'absolute',
        top: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: 'var(--text-dim)',
        opacity: 0.55,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}>
        <BrandBadge size={26} />
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>养基发财</span>
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Outlet />
      </div>
    </div>
  );
}
