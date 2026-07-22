import { useState, useEffect } from 'react';
import { Empty, Skeleton, App } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { favoriteService } from '@/services/favoriteService';
import { fundService } from '@/services/fundService';
import FundListItem from '@/components/FundListItem';

interface FavoriteItem {
  id: number;
  fund_code: string;
  fund_name?: string;
  fund_type?: string;
  net_value?: number;
  estimated_change?: number;
  market_value?: number;
  daily_profit?: number;
  accumulated_profit?: number;
  // 更新状态字段（与持仓页面一致）
  last_updated?: string | null;
  is_fresh?: boolean;
  update_status?: 'estimating' | 'pending_confirm' | 'confirmed' | 'market_closed' | 'pre_market';
  data_source?: 'actual' | 'estimated';
  day_of_week?: string;
}

export default function WatchlistPage() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { message } = App.useApp();

  const loadFavorites = async () => {
    try {
      const data = await favoriteService.getFavorites();
      const list: FavoriteItem[] = data.favorites || data || [];
      if (list.length === 0) { setFavorites(list); return; }

      // ★ 使用批量接口：1次请求获取所有基金数据（替代逐个调用 /funds/:code）
      const codes = list.map((item: any) => item.fund_code);
      const batchInfo: any[] = await fundService.batchGetFundInfo(codes);

      // 合并自选ID和基金实时数据
      const enriched: FavoriteItem[] = list.map((item: any, index: number) => {
        const info = batchInfo[index] || {};
        return {
          ...item,
          fund_name: info.name || item.fund_code,
          fund_type: info.type || '',
          net_value: info.net_value ?? undefined,
          estimated_change: info.estimated_change ?? undefined,
          market_value: info.market_value ?? undefined,
          daily_profit: info.daily_profit ?? undefined,
          accumulated_profit: info.accumulated_profit ?? undefined,
          last_updated: info.last_updated ?? null,
          is_fresh: info.is_fresh ?? false,
          update_status: info.update_status ?? 'estimating',
          data_source: info.data_source ?? 'estimated',
          day_of_week: info.day_of_week ?? undefined,
        };
      });

      setFavorites(enriched);
    } catch {
      message.error('获取自选列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFavorites(); }, []);

  const removeFavorite = async (code: string) => {
    try {
      await favoriteService.removeFavorite(code);
      message.success('已取消自选');
      loadFavorites();
    } catch {
      message.error('操作失败');
    }
  };

  if (loading) {
    return (
      <div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} active avatar paragraph={{ rows: 2 }} style={{ marginTop: 8, padding: '0 16px' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="watchlist-page" style={{ padding: '20px 0' }}>
      <div className="watchlist-title" style={{
        padding: '0 16px 12px',
        fontSize: 22,
        fontWeight: 700,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
      }}>
        自选基金
      </div>
      {favorites.length === 0 ? (
        <Empty
          className="watchlist-empty"
          style={{ marginTop: 80 }}
          description={
            <span className="watchlist-empty-description" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              还没有添加自选基金，去搜索添加吧
            </span>
          }
        />
      ) : (
        favorites.map((item) => (
          <div key={item.id || item.fund_code} style={{ position: 'relative', marginBottom: 2 }}>
            <FundListItem fund={item} mode="watchlist" />
            <Button
              size="small"
              type="text"
              icon={<StarFilled style={{ color: '#D4A84B' }} />}
              onClick={() => removeFavorite(item.fund_code)}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0,
                transition: 'opacity var(--transition-fast)',
                zIndex: 10,
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
            >
              取消
            </Button>
          </div>
        ))
      )}
    </div>
  );
}