import { Outlet } from 'react-router-dom';
import Header from '@/components/Header';
import BottomTabBar from '@/components/BottomTabBar';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import AnnouncementModal from '@/components/modals/AnnouncementModal';

export default function MainLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Header />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 60, paddingBottom: 64, minHeight: 0, overflow: 'hidden' }}>
        <AnnouncementBanner />
        <main className="page-content">
          <div className="page-stage">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomTabBar />
      <AnnouncementModal />
    </div>
  );
}
