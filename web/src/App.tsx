import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antTheme, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import PortfolioPage from './pages/portfolio/PortfolioPage';
import WatchlistPage from './pages/watchlist/WatchlistPage';
import StatsPage from './pages/stats/StatsPage';
import ProfilePage from './pages/profile/ProfilePage';
import FundDetailPage from './pages/fund/FundDetailPage';
import MarketDetailPage from './pages/market/MarketDetailPage';
import InvestmentPlanPage from './pages/plans/InvestmentPlanPage';
import SettingsPage from './pages/settings/SettingsPage';
import './App.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  if (!isInitialized) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  const isLight = themeMode === 'light';
  const antAlgorithm = isLight ? antTheme.defaultAlgorithm : antTheme.defaultAlgorithm;
  const antToken = {
    colorPrimary: isLight ? '#B8860B' : '#D4A84B',
    borderRadius: 8,
    colorBgContainer: isLight ? '#FFFFFF' : '#111827',
    colorBgElevated: isLight ? '#FFFFFF' : '#111827',
    colorBgLayout: isLight ? '#F5F7FA' : '#0B1120',
    colorText: isLight ? '#1E293B' : '#F1F5F9',
    colorTextSecondary: isLight ? '#64748B' : '#94A3B8',
    colorBorder: isLight ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.14)',
    colorBorderSecondary: isLight ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.08)',
  };

  if (!isInitialized) {
    return (
      <ConfigProvider locale={zhCN} theme={{ token: antToken, algorithm: antAlgorithm }}>
        <AntApp>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <Spin size="large" />
          </div>
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
              <Route path="/plans" element={<InvestmentPlanPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}
