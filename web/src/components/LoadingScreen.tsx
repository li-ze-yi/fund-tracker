import BrandBadge from '@/components/BrandBadge';

/**
 * 品牌级全屏/路由加载动画：
 * 金色渐变旋转圆环 + 中央品牌徽章 + 底部呼吸文字。
 * 背景透明，可叠在全局氛围背景之上；动画遵循 prefers-reduced-motion（由全局规则禁用）。
 */
export default function LoadingScreen({ text = '加载中…' }: { text?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 22,
      }}
    >
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        {/* 金色渐变旋转环 */}
        <div
          className="loading-ring"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, transparent 12%, var(--accent-gold) 55%, var(--accent-gold-light) 85%, transparent)',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
            animation: 'loading-spin 1.1s linear infinite',
          }}
        />
        {/* 中央品牌徽章 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'loading-breathe 1.6s ease-in-out infinite',
          }}
        >
          <BrandBadge size={30} />
        </div>
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          letterSpacing: '0.05em',
          animation: 'loading-fade 1.6s ease-in-out infinite',
        }}
      >
        {text}
      </div>
    </div>
  );
}
