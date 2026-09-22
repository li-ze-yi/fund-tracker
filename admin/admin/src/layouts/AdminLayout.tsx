import { useMemo, useState } from 'react';
import { Layout, Menu, Button, Avatar, Dropdown, Tooltip, Badge } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  FundOutlined,
  CloudOutlined,
  BellOutlined,
  MessageOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  DownOutlined,
  MonitorOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAdminStore } from '../store/adminStore';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/funds', icon: <FundOutlined />, label: '基金管理' },
  { key: '/announcements', icon: <BellOutlined />, label: '公告管理' },
  { key: '/feedbacks', icon: <MessageOutlined />, label: '意见反馈' },
  { key: '/cache', icon: <CloudOutlined />, label: '缓存检测' },
  { key: '/system', icon: <MonitorOutlined />, label: '系统监控' },
];

const pageTitles: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/users': '用户管理',
  '/funds': '基金管理',
  '/announcements': '公告管理',
  '/feedbacks': '意见反馈',
  '/cache': '缓存检测',
  '/system': '系统监控',
};

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAdminStore();

  const currentTitle = useMemo(
    () => pageTitles[location.pathname] || '管理后台',
    [location.pathname]
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        collapsedWidth={64}
        className="admin-sider"
        style={{
          background: '#0D1117',
          borderRight: '1px solid #30363D',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
        theme="dark"
      >
        {/* Logo 区 */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 18px',
            borderBottom: '1px solid #21262D',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: collapsed ? 18 : 20,
              fontWeight: 700,
              letterSpacing: 0.5,
              background: 'linear-gradient(135deg, #D4A84B, #F0D78C)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              whiteSpace: 'nowrap',
            }}
          >
            {collapsed ? '养' : '养基发财'}
          </span>
          {!collapsed && (
            <span
              style={{
                fontSize: 11,
                color: '#8B949E',
                marginLeft: 10,
                background: 'rgba(212,168,75,0.15)',
                padding: '2px 8px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
              }}
            >
              管理后台
            </span>
          )}
        </div>

        {/* 菜单区 */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{
              background: 'transparent',
              borderRight: 'none',
              paddingTop: 10,
            }}
            theme="dark"
          />
        </div>

        {/* 底部用户区 */}
        <div
          style={{
            padding: collapsed ? '10px 0' : '12px 12px',
            borderTop: '1px solid #21262D',
            flexShrink: 0,
          }}
        >
          <Dropdown menu={{ items: userMenuItems }} placement="topRight" trigger={['click']}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: 8,
                transition: 'background 0.2s ease',
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
            >
              <Badge dot color="#43A047" offset={[-2, 2]}>
                <Avatar size={30} icon={<UserOutlined />} style={{ background: 'linear-gradient(135deg, #D4A84B, #B8922E)', flexShrink: 0 }} />
              </Badge>
              {!collapsed && (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#E6EDF3',
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {user?.username}
                    </div>
                    <div style={{ fontSize: 11, color: '#8B949E' }}>管理员</div>
                  </div>
                  <DownOutlined style={{ fontSize: 10, color: '#8B949E' }} />
                </>
              )}
            </div>
          </Dropdown>
        </div>
      </Sider>

      <Layout style={{ minWidth: 0 }}>
        <Header
          style={{
            padding: '0 20px',
            background: '#161B22',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #30363D',
            height: 56,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ color: '#8B949E', fontSize: 16 }}
            />
            <span style={{ fontSize: 15, fontWeight: 600, color: '#E6EDF3' }}>
              {currentTitle}
            </span>
          </div>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 8,
                transition: 'background 0.2s ease',
              }}
            >
              <Avatar size={28} icon={<UserOutlined />} style={{ background: 'linear-gradient(135deg, #D4A84B, #B8922E)' }} />
              <span style={{ color: '#E6EDF3', fontSize: 13 }}>{user?.username}</span>
              <Tooltip title="退出登录">
                <Button
                  type="text"
                  size="small"
                  icon={<LogoutOutlined />}
                  onClick={handleLogout}
                  style={{ color: '#8B949E' }}
                />
              </Tooltip>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 20, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
