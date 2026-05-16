import api from './api';

export const favoriteService = {
  getFavorites: () => api.get('/favorites').then((r) => r.data),

  addFavorite: (code: string) =>
    api.post('/favorites', { fundCode: code }).then((r) => r.data),

  removeFavorite: (code: string) =>
    api.delete(`/favorites/${code}`).then((r) => r.data),
};