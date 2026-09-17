import { Layout, Menu, Dropdown, Button, Space, Typography, theme } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  FundOutlined,
  NotificationOutlined,
  DatabaseOutlined,
  MessageOutlined,
  UserOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const { Sider, Header, Content } = Layout;

const MENU_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/funds', icon: <FundOutlined />, label: '基金管理' },
  { key: '/announcements', icon: <NotificationOutlined />, label: '公告管理' },
  { key: '/cache', icon: <DatabaseOutlined />, label: '缓存管理' },
  { key: '/feedbacks', icon: <MessageOutlined />, label: '反馈管理' },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/users': '用户管理',
  '/funds': '基金管理',
  '/announcements': '公告管理',
  '/cache': '缓存管理',
  '/feedbacks': '反馈管理',
};

interface AdminLayoutProps {
  themeMode: 'light' | 'dark';
  onThemeChange: (mode: 'light' | 'dark') => void;
}

export default function AdminLayout({ themeMode, onThemeChange }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { token } = theme.useToken();

  const userAppUrl = (import.meta.env.VITE_USER_APP_URL as string) || '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={224} className="admin-sider" collapsed={false}>
        <div className="sider-brand">
          <div className="brand-mark">F</div>
          <div>
            <span className="brand-name">FundTracker</span>
            <span className="brand-tag">ADMIN CONSOLE</span>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
        <div className="sider-footer">© FundTracker Admin</div>
      </Sider>
      <Layout>
        <Header className="admin-header" style={{ background: token.colorBgContainer }}>
          <span className="page-title">{PAGE_TITLES[location.pathname] ?? '管理控制台'}</span>
          <Space size={12}>
            <Button
              icon={themeMode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
              onClick={() => onThemeChange(themeMode === 'dark' ? 'light' : 'dark')}
              title={themeMode === 'dark' ? '切换为浅色' : '切换为深色'}
            />
            <Button icon={<ExportOutlined />} href={userAppUrl} title="返回用户端">
              用户端
            </Button>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: '退出登录',
                    onClick: () => {
                      logout();
                      navigate('/login', { replace: true });
                    },
                  },
                ],
              }}
            >
              <Button>
                <UserOutlined style={{ color: token.colorPrimary }} />
                <Typography.Text style={{ marginLeft: 6 }}>{user?.username}</Typography.Text>
              </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
