import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, useLayoutEffect, useState, lazy, Suspense } from 'react';
import { useAuthStore } from './store/authStore';
import AdminLayout from './layouts/AdminLayout';
import LoginPage from './pages/LoginPage';
import LoadingScreen from './components/LoadingScreen';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const FundsPage = lazy(() => import('./pages/FundsPage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));
const CachePage = lazy(() => import('./pages/CachePage'));
const FeedbacksPage = lazy(() => import('./pages/FeedbacksPage'));

type ThemeMode = 'light' | 'dark';

function AdminRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  if (!isInitialized) return <LoadingScreen text="正在启动…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    () => (localStorage.getItem('admin_theme') as ThemeMode) || 'dark'
  );

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const toggleTheme = (mode: ThemeMode) => {
    localStorage.setItem('admin_theme', mode);
    setThemeMode(mode);
  };

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  const isLight = themeMode === 'light';
  const antAlgorithm = isLight ? antTheme.defaultAlgorithm : antTheme.darkAlgorithm;
  const antToken = {
    colorPrimary: isLight ? '#8F6A06' : '#D4A84B',
    borderRadius: 8,
    colorBgContainer: isLight ? '#FFFFFF' : '#111827',
    colorBgElevated: isLight ? '#FFFFFF' : '#131C30',
    colorBgLayout: isLight ? '#F7F8FA' : '#0B1120',
    colorText: isLight ? '#1E293B' : '#F1F5F9',
    colorTextSecondary: isLight ? '#64748B' : '#94A3B8',
    colorBorder: isLight ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.14)',
    colorBorderSecondary: isLight ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.08)',
  };

  return (
    <ConfigProvider locale={zhCN} theme={{ token: antToken, algorithm: antAlgorithm }}>
      <AntApp>
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen text="页面加载中…" />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <AdminRoute>
                    <AdminLayout themeMode={themeMode} onThemeChange={toggleTheme} />
                  </AdminRoute>
                }
              >
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/funds" element={<FundsPage />} />
                <Route path="/announcements" element={<AnnouncementsPage />} />
                <Route path="/cache" element={<CachePage />} />
                <Route path="/feedbacks" element={<FeedbacksPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
