import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, useLayoutEffect, lazy, Suspense } from 'react';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LoadingScreen from './components/LoadingScreen';
import './App.css';

// 路由级懒加载 - 首屏只加载当前页面，其余按需加载
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const PortfolioPage = lazy(() => import('./pages/portfolio/PortfolioPage'));
const WatchlistPage = lazy(() => import('./pages/watchlist/WatchlistPage'));
const StatsPage = lazy(() => import('./pages/stats/StatsPage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const FundDetailPage = lazy(() => import('./pages/fund/FundDetailPage'));
const MarketDetailPage = lazy(() => import('./pages/market/MarketDetailPage'));
const IndustryRotationPage = lazy(() => import('./pages/market/IndustryRotationPage'));
const InvestmentPlanPage = lazy(() => import('./pages/plans/InvestmentPlanPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  if (!isInitialized) {
    return <LoadingScreen text="正在启动…" />;
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const themeMode = useThemeStore((s) => s.mode);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // 用 useLayoutEffect 在首帧绘制前同步 data-theme，确保界面主题与切换图标（store.mode）始终一致，
  // 避免刷新/恢复页面时出现“界面浅色、图标深色”之类的脱节。
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  const isLight = themeMode === 'light';
  // 暗色模式使用 darkAlgorithm，避免 Ant Design 组件按浅色算法渲染导致界面偏白
  const antAlgorithm = isLight ? antTheme.defaultAlgorithm : antTheme.darkAlgorithm;
  // 与 App.css 令牌保持一致：浅色「沙丘米白 F」/ 深色「墨金 V3」
  const antToken = {
    colorPrimary: isLight ? '#3E4A33' : '#D9B863',
    borderRadius: isLight ? 8 : 3,
    colorBgContainer: isLight ? '#FBF7F0' : '#111823',
    colorBgElevated: isLight ? '#FBF7F0' : '#111823',
    colorBgLayout: isLight ? '#F2ECE1' : '#0A0E14',
    colorText: isLight ? '#2B3128' : '#EDE8DC',
    colorTextSecondary: isLight ? '#8C9182' : '#A69D8B',
    colorBorder: isLight ? 'rgba(63, 74, 52, 0.30)' : 'rgba(214, 182, 110, 0.22)',
    colorBorderSecondary: isLight ? 'rgba(63, 74, 52, 0.15)' : 'rgba(214, 182, 110, 0.12)',
  };

  if (!isInitialized) {
    return (
      <ConfigProvider locale={zhCN} theme={{ token: antToken, algorithm: antAlgorithm }}>
        <AntApp>
          <LoadingScreen text="正在启动…" />
        </AntApp>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: antToken,
        algorithm: antAlgorithm,
      }}
    >
      <AntApp>
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen text="页面加载中…" />}>
            <Routes>
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>
              <Route
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Navigate to="/portfolio" replace />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/watchlist" element={<WatchlistPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/fund/:code" element={<FundDetailPage />} />
                <Route path="/market" element={<MarketDetailPage />} />
                <Route path="/market/rotation" element={<IndustryRotationPage />} />
                <Route path="/plans" element={<InvestmentPlanPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
