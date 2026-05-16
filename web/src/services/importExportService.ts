import api from './api';

export const importExportService = {
  importHoldings: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/import-export/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  downloadTemplate: () =>
    api.get('/import-export/template', { responseType: 'blob' }).then((r) => r.data),

  exportHoldings: (params: { scope: string; format: string }) =>
    api.get('/import-export/export', { params, responseType: 'blob' }).then((r) => r.data),
};