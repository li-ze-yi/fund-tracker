import api from './api';

export interface Announcement {
  id: number;
  title: string;
  content: string;
  type: 'popup' | 'banner';
  status: 'active' | 'inactive';
  publish_version: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export const announcementService = {
  getActivePopup: () =>
    api.get<Announcement | null>('/announcements/active/popup').then((r) => r.data),
  getActiveBanner: () =>
    api.get<Announcement | null>('/announcements/active/banner').then((r) => r.data),
};