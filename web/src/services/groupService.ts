import api from './api';

export const groupService = {
  getGroups: () => api.get('/groups').then((r) => r.data),

  createGroup: (name: string) =>
    api.post('/groups', { name }).then((r) => r.data),

  updateGroup: (id: number, name: string) =>
    api.put(`/groups/${id}`, { name }).then((r) => r.data),

  deleteGroup: (id: number) =>
    api.delete(`/groups/${id}`).then((r) => r.data),
};