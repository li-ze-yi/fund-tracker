/**
 * 品牌徽章：金色渐变圆角标 + 上升趋势线。
 * 用于 Header 品牌区、登录/注册页等品牌展示场景。
 */
export default function BrandBadge({ size = 30 }: { size?: number }) {
  const icon = Math.max(14, Math.round(size * 0.56));
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-gold-light))',
        boxShadow: '0 2px 8px rgba(212, 168, 75, 0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
        flexShrink: 0,
      }}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none">
        <path d="M4 16.5 L9.5 10.5 L13.5 13.5 L20 6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20" cy="6" r="2.3" fill="#fff" />
        <circle cx="4" cy="16.5" r="2.3" fill="#fff" />
      </svg>
    </span>
  );
}
