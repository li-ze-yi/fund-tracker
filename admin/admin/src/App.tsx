import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, Spin, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect } from 'react';
import { useAdminStore } from './store/adminStore';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Funds from './pages/Funds';
import Cache from './pages/Cache';
import Announcements from './pages/Announcements';
import Feedbacks from './pages/Feedbacks';
import SystemMonitor from './pages/SystemMonitor';
import { bindAppMessage } from './utils/appFeedback';
import './App.css';

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isInitialized } = useAdminStore();
  if (!isInitialized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!user || user.role !== 'admin') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** 将 App.useApp() 的消息实例绑定到模块级单例，供 api 拦截器等非组件代码使用 */
function MessageBridge() {
  const { message } = AntApp.useApp();
  useEffect(() => {
    bindAppMessage(message);
  }, [message]);
  return null;
}

function FullPageLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Spin size="large" />
    </div>
  );
}

const themeConfig = {
  algorithm: antTheme.darkAlgorithm,
  token: {
    colorPrimary: '#D4A84B',
    colorInfo: '#D4A84B',
    colorLink: '#F0D78C',
    colorSuccess: '#43A047',
    colorWarning: '#FB8C00',
    colorError: '#E53935',
    colorBgLayout: '#0D1117',
    colorBgContainer: '#161B22',
    colorBgElevated: '#1C2128',
    colorBgSpotlight: '#1C2128',
    colorBgMask: 'rgba(13, 17, 23, 0.6)',
    colorBorder: '#30363D',
    colorBorderSecondary: '#21262D',
    colorSplit: '#21262D',
    colorText: '#E6EDF3',
    colorTextSecondary: '#8B949E',
    colorTextTertiary: '#6E7681',
    colorTextPlaceholder: '#6E7681',
    borderRadius: 8,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Menu: {
      darkItemBg: 'transparent',
      darkItemColor: '#8B949E',
      darkItemSelectedBg: 'rgba(212, 168, 75, 0.12)',
      darkItemSelectedColor: '#F0D78C',
      darkItemHoverBg: 'rgba(212, 168, 75, 0.06)',
      darkItemHoverColor: '#E6EDF3',
      itemBorderRadius: 8,
      itemMarginInline: 8,
      iconSize: 15,
      itemHeight: 40,
    },
    Table: {
      headerBg: '#1C2128',
      headerColor: '#8B949E',
      headerSplitColor: 'transparent',
      rowHoverBg: 'rgba(212, 168, 75, 0.05)',
      borderColor: '#21262D',
      cellPaddingBlock: 12,
      cellPaddingInline: 14,
    },
    Modal: {
      contentBg: '#1C2128',
      headerBg: '#1C2128',
      footerBg: '#1C2128',
      titleColor: '#E6EDF3',
    },
    Input: {
      colorBgContainer: '#21262D',
      activeBorderColor: '#D4A84B',
      hoverBorderColor: '#8B949E',
    },
    Select: {
      colorBgContainer: '#21262D',
      optionSelectedBg: 'rgba(212, 168, 75, 0.15)',
      optionSelectedColor: '#F0D78C',
      multipleItemBg: 'rgba(212, 168, 75, 0.12)',
    },
    DatePicker: {
      colorBgContainer: '#21262D',
      activeBorderColor: '#D4A84B',
      hoverBorderColor: '#8B949E',
    },
    Button: {
      defaultBg: '#21262D',
      defaultColor: '#E6EDF3',
      defaultBorderColor: '#30363D',
      defaultHoverBg: '#282E36',
      defaultHoverBorderColor: '#D4A84B',
      defaultHoverColor: '#F0D78C',
      defaultActiveBg: '#21262D',
      defaultActiveBorderColor: '#D4A84B',
      primaryShadow: '0 2px 6px rgba(212, 168, 75, 0.25)',
    },
    Pagination: {
      itemBg: '#21262D',
      itemActiveBg: '#D4A84B',
      itemLinkBg: '#21262D',
    },
    Progress: {
      remainingColor: 'rgba(212, 168, 75, 0.15)',
      defaultColor: '#D4A84B',
    },
    Statistic: {
      contentFontSize: 28,
    },
    Tag: {
      defaultBg: '#21262D',
      defaultColor: '#8B949E',
    },
    Switch: {
      colorPrimary: '#D4A84B',
    },
    Tooltip: {
      colorBg: '#1C2128',
      colorText: '#E6EDF3',
    },
  },
};

export default function App() {
  const restoreSession = useAdminStore((s) => s.restoreSession);
  const isInitialized = useAdminStore((s) => s.isInitialized);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntApp>
        <MessageBridge />
        {!isInitialized ? (
          <FullPageLoading />
        ) : (
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }
              >
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/users" element={<Users />} />
                <Route path="/funds" element={<Funds />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/feedbacks" element={<Feedbacks />} />
                <Route path="/cache" element={<Cache />} />
                <Route path="/system" element={<SystemMonitor />} />
              </Route>
            </Routes>
          </BrowserRouter>
        )}
      </AntApp>
    </ConfigProvider>
  );
}
