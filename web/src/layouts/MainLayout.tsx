import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import BottomTabBar from '@/components/BottomTabBar';

export default function MainLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header />
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 64, paddingTop: 60 }}>
        <Outlet />
      </div>
      <BottomTabBar />
    </div>
  );
}
