import { useNavigate, useLocation } from 'react-router-dom';
import {
  PieChartOutlined,
  StarOutlined,
  BarChartOutlined,
  UserOutlined,
} from '@ant-design/icons';

const tabs = [
  { path: '/portfolio', icon: <PieChartOutlined />, label: '持仓' },
  { path: '/watchlist', icon: <StarOutlined />, label: '自选' },
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
        height: 58,
        background: 'rgba(11, 17, 32, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map((tab) => {
        const active = location.pathname === tab.path;
        return (
          <div
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: 'pointer',
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              transition: 'all var(--transition-fast)',
              minWidth: 64,
              minHeight: 56,
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = 'var(--bg-card)';
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <span style={{
              fontSize: 22,
              color: active ? 'var(--accent-gold)' : 'var(--text-dim)',
              transition: 'color var(--transition-fast)',
              lineHeight: 1,
              display: 'block',
            }}>
              {tab.icon}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              color: active ? 'var(--accent-gold)' : 'var(--text-dim)',
              letterSpacing: '0.02em',
              transition: 'all var(--transition-fast)',
              lineHeight: 1.2,
            }}>
              {tab.label}
            </span>
            {active && (
              <div style={{
                width: 18,
                height: 3,
                borderRadius: 2.5,
                background: 'linear-gradient(90deg, var(--accent-gold), var(--accent-gold-light))',
                marginTop: -1,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
