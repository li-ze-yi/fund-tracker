import { useNavigate, useLocation } from 'react-router-dom';
import {
  PieChartOutlined,
  StarOutlined,
  DotChartOutlined,
  BarChartOutlined,
  UserOutlined,
} from '@ant-design/icons';

const tabs = [
  { path: '/portfolio', icon: <PieChartOutlined />, label: '持仓' },
  { path: '/watchlist', icon: <StarOutlined />, label: '自选' },
  { path: '/market/rotation', icon: <DotChartOutlined />, label: '行情' },
  { path: '/stats', icon: <BarChartOutlined />, label: '统计' },
  { path: '/profile', icon: <UserOutlined />, label: '我的' },
];

export default function BottomTabBar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        maxWidth: 'var(--content-max-width)',
        margin: '0 auto',
        height: 58,
        background: 'var(--bg-tabbar)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 -1px 0 var(--border-subtle), 0 -4px 24px -4px rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map((tab) => {
        // 前缀匹配：进入 /fund/:code、/market/rotation 等子路由时保持对应 tab 高亮。
        // 根路径 '/' 需精确匹配，避免吞掉其它所有路径。
        const active = tab.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(tab.path);
        return (
          <div
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              cursor: 'pointer',
              padding: '8px 16px',
              borderRadius: active ? 'var(--radius-md)' : 'var(--radius-sm)',
              transition: 'all var(--transition-base)',
              minWidth: 64,
              minHeight: 48,
              background: active ? 'var(--accent-gold-dim)' : 'transparent',
              transform: active ? 'translateY(-2px)' : 'translateY(0)',
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            <span style={{
              fontSize: active ? 23 : 21,
              color: active ? 'var(--accent-gold)' : 'var(--text-secondary)',
              transition: 'all var(--transition-base)',
              lineHeight: 1,
              display: 'block',
              filter: active ? 'drop-shadow(0 2px 4px rgba(212,168,75,0.3))' : 'none',
            }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: active ? 700 : 600,
              color: active ? 'var(--accent-gold)' : 'var(--text-secondary)',
              letterSpacing: '0.02em',
              transition: 'all var(--transition-fast)',
              lineHeight: 1.2,
            }}>
              {tab.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
