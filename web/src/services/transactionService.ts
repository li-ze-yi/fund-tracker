import api from './api';

export const transactionService = {
  getTransactions: (code: string) =>
    api.get(`/transactions/${code}`).then((r) => r.data),

  buy: (data: { fundCode: string; amount: number; date: string; after3pm?: boolean }) =>
    api.post('/transactions/buy', data).then((r) => r.data),

  sell: (data: { fundCode: string; shares: number; fee: number; date: string; after3pm?: boolean }) =>
    api.post('/transactions/sell', data).then((r) => r.data),

  getAllTransactions: () =>
    api.get('/transactions/all').then((r) => r.data),

  deleteTransaction: (id: number) =>
    api.delete(`/transactions/${id}`).then((r) => r.data),

  settlePending: () =>
    api.post('/transactions/settle').then((r) => r.data),
};
