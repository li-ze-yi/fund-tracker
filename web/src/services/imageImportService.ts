import api from './api';

export const imageImportService = {
  // 上传图片识别
  recognize: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/image-import/recognize', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // OCR可能较慢
    }).then(r => r.data);
  },

  // 确认导入
  confirmImport: (items: Array<{ fundCode: string; amount: number; totalReturn: number; groupId?: number }>) =>
    api.post('/image-import/confirm', { items }).then(r => r.data),
};
