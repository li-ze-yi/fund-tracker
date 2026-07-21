import api from './api';

export interface FeedbackItem {
  id: number;
  user_id: number;
  content: string;
  screenshot_url: string | null;
  created_at: string;
}

export const feedbackService = {
  submit: (content: string) =>
    api.post<{ id: number; message: string }>('/feedback', { content }).then((r) => r.data),
  list: () =>
    api.get<FeedbackItem[]>('/feedback').then((r) => r.data),
};
