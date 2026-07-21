import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, List, App } from 'antd';
import {
  ScheduleOutlined,
  SettingOutlined,
  ImportOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  LogoutOutlined,
  MessageOutlined,
  AndroidOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import FeedbackModal from '@/components/modals/FeedbackModal';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { message } = App.useApp();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const menuItems = [
    { key: 'plans', icon: <ScheduleOutlined />, label: '定投计划', onClick: () => navigate('/plans') },
    { key: 'settings', icon: <SettingOutlined />, label: '设置', onClick: () => navigate('/settings') },
    { key: 'import', icon: <ImportOutlined />, label: '导入持仓', onClick: () => navigate('/settings') },
    { key: 'export', icon: <ExportOutlined />, label: '导出持仓', onClick: () => navigate('/settings') },
    { key: 'feedback', icon: <MessageOutlined />, label: '意见反馈', onClick: () => navigate('/settings') },
    { key: 'about', icon: <InfoCircleOutlined />, label: '关于', onClick: () => navigate('/settings') },
  ];

  const handleLogout = () => {
    logout();
    message.success('已退出登录');
    navigate('/login');
  };

  return (
    <div className="profile-page" style={{ padding: 20 }}>
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          .profile-page {
            padding: 12px 8px !important;
          }

          /* 用户信息卡片 */
          .profile-user-card {
            margin-bottom: 14px !important;
          }

          .profile-user-card > .ant-card-body {
            padding: 16px 12px !important;
          }

          .profile-avatar {
            width: 48px !important;
            height: 48px !important;
            font-size: clamp(20px, 5vw, 24px) !important;
          }

          .profile-username {
            font-size: clamp(16px, 4vw, 18px) !important;
            margin-bottom: 2px !important;
          }

          .profile-register-date {
            font-size: clamp(11px, 2.8vw, 13px) !important;
          }

          /* 菜单列表 */
          .profile-download-card {
            margin-bottom: 14px !important;
          }

          .profile-download-card > .ant-card-body {
            padding: 14px 12px !important;
          }

          .profile-menu-card {
            margin-bottom: 14px !important;
          }

          .profile-menu-card > .ant-card-body {
            padding: 8px 12px !important;
          }

          .profile-menu-item {
            padding: 10px 0 !important;
            border-radius: var(--radius-sm) !important;
          }

          .profile-menu-label {
            font-size: clamp(14px, 3.5vw, 15px) !important;
            gap: 10px !important;
          }

          .profile-menu-icon {
            font-size: clamp(15px, 4vw, 17px) !important;
          }

          .profile-menu-arrow {
            font-size: clamp(13px, 3.2vw, 14px) !important;
          }

          /* 退出登录按钮 */
          .profile-logout-btn {
            height: 46px !important;
            font-size: clamp(14px, 3.5vw, 15px) !important;
            border-radius: var(--radius-md) !important;
          }
        }
      `}</style>

      <Card className="profile-user-card" style={{ marginBottom: 20, background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            className="profile-avatar"
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-gold-light))',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 800,
              boxShadow: 'var(--shadow-glow-gold)',
            }}
          >
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div className="profile-username" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{user?.username}</div>
            <div className="profile-register-date" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
              注册时间: {user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}
            </div>
          </div>
        </div>
      </Card>

      <Card
        className="profile-download-card"
        style={{
          marginBottom: 20,
          background: 'var(--accent-gold-dim)',
          borderColor: 'var(--accent-gold)',
          cursor: 'pointer',
          transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
        }}
        onClick={() => window.open('/download/app-release.apk', '_blank')}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-glow-gold)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'var(--accent-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <AndroidOutlined />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>下载安卓客户端</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>随时随地管理您的投资组合</div>
          </div>
          <DownloadOutlined style={{ fontSize: 20, color: 'var(--accent-gold)' }} />
        </div>
      </Card>

      <Card className="profile-menu-card" style={{ marginBottom: 20, background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
        <List
          dataSource={menuItems}
          renderItem={(item) => (
            <List.Item
              className="profile-menu-item"
              onClick={item.onClick}
              style={{
                cursor: 'pointer',
                padding: '14px 0',
                transition: 'background var(--transition-fast)',
                borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span className="profile-menu-label" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, color: 'var(--text-primary)' }}>
                <span className="profile-menu-icon">{item.icon}</span>
                {item.label}
              </span>
              <span className="profile-menu-arrow" style={{ color: 'var(--text-muted)', fontSize: 14 }}>&gt;</span>
            </List.Item>
          )}
        />
      </Card>

      <Button
        className="profile-logout-btn"
        block
        danger
        icon={<LogoutOutlined />}
        onClick={handleLogout}
        style={{ height: 52, fontSize: 15, fontWeight: 600 }}
      >
        退出登录
      </Button>
    </div>
  );
}