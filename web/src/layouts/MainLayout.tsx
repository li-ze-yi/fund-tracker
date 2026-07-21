import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import BottomTabBar from '@/components/BottomTabBar';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import AnnouncementModal from '@/components/modals/AnnouncementModal';

export default function MainLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 60, paddingBottom: 64 }}>
        <AnnouncementBanner />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </div>
      </div>
      <BottomTabBar />
      <AnnouncementModal />
    </div>
  );
}
