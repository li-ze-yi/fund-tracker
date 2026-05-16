import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antTheme, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
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

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  if (!isInitialized) {
    return (
      <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#D4A84B', borderRadius: 8 }, algorithm: antTheme.defaultAlgorithm }}>
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
        token: {
          colorPrimary: '#D4A84B',
          borderRadius: 8,
        },
        algorithm: antTheme.defaultAlgorithm,
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
