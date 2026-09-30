import BrandBadge from '@/components/BrandBadge';

/**
 * 品牌级全屏/路由加载动画：
 * 金色氛围光晕 + 金色渐变旋转圆环 + 中央呼吸徽章 + 金色品牌名 + 底部呼吸文字。
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
        gap: 20,
      }}
    >
      <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* 金色氛围光晕（缓慢呼吸，给整个 loader 一层"灯下"感） */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-gold) 24%, transparent), transparent 70%)',
            animation: 'loading-breathe 2.6s ease-in-out infinite',
          }}
        />
        {/* 金色渐变旋转环 */}
        <div
          className="loading-ring"
          style={{
            position: 'absolute',
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, transparent 12%, var(--accent-gold) 55%, var(--accent-gold-light) 85%, transparent)',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
            animation: 'loading-spin 1.1s linear infinite',
            filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--accent-gold) 45%, transparent))',
          }}
        />
        {/* 中央品牌徽章 */}
        <div
          style={{
            position: 'relative',
            animation: 'loading-breathe 1.6s ease-in-out infinite',
          }}
        >
          <BrandBadge size={32} />
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.08em',
            background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-gold-light))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'loading-fade 1.8s ease-in-out infinite',
          }}
        >
          养基发财
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            letterSpacing: '0.05em',
            marginTop: 6,
            animation: 'loading-fade 1.8s ease-in-out infinite',
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}