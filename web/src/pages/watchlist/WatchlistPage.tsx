import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Empty, Skeleton, App } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
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
  last_updated?: string | null;
  is_fresh?: boolean;
  update_status?: 'estimating' | 'pending_confirm' | 'confirmed' | 'market_closed' | 'pre_market' | 'no_estimate';
  data_source?: 'actual' | 'estimated';
  day_of_week?: string;
}

const DELETE_WIDTH = 72;

function SwipeToDelete({
  children,
  onDelete,
  isOpen,
  onOpen,
  onClose,
}: {
  children: ReactNode;
  onDelete: () => void;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentTranslateRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setTranslateX(-DELETE_WIDTH);
      currentTranslateRef.current = -DELETE_WIDTH;
    } else {
      setTranslateX(0);
      currentTranslateRef.current = 0;
    }
  }, [isOpen]);

  const handleStart = useCallback((clientX: number) => {
    startXRef.current = clientX;
    setIsDragging(true);
  }, []);

  const handleMove = useCallback((clientX: number) => {
    if (!isDragging) return;
    const delta = clientX - startXRef.current;
    let newTranslate = currentTranslateRef.current + delta;
    newTranslate = Math.min(0, Math.max(-DELETE_WIDTH * 1.5, newTranslate));
    setTranslateX(newTranslate);
  }, [isDragging]);

  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const threshold = -DELETE_WIDTH / 2;
    if (translateX <= threshold) {
      setTranslateX(-DELETE_WIDTH);
      currentTranslateRef.current = -DELETE_WIDTH;
      onOpen();
    } else {
      setTranslateX(0);
      currentTranslateRef.current = 0;
      onClose();
    }
  }, [isDragging, translateX, onOpen, onClose]);

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        marginBottom: 2,
        touchAction: 'pan-y',
      }}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={handleEnd}
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => {
        if (isDragging) handleMove(e.clientX);
      }}
      onMouseUp={handleEnd}
      onMouseLeave={() => {
        if (isDragging) handleEnd();
      }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: DELETE_WIDTH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #ef4444, #dc2626)',
          borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
          cursor: 'pointer',
          // 跟随滑动位移：初始完全藏在容器外，滑动时同步露出
          transform: `translateX(${DELETE_WIDTH + translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: translateX < -20 ? '-4px 0 12px rgba(239, 68, 68, 0.3)' : 'none',
          pointerEvents: translateX < -10 ? 'auto' : 'none',
          opacity: translateX < -10 ? 1 : 0.6,
        }}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          color: '#fff',
        }}>
          <DeleteOutlined style={{ fontSize: 18 }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>取消</span>
        </div>
      </div>

      <div
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSwipeId, setOpenSwipeId] = useState<string | number | null>(null);
  const { message } = App.useApp();

  const loadFavorites = async () => {
    try {
      const data = await favoriteService.getFavorites();
      const list: FavoriteItem[] = data.favorites || data || [];
      if (list.length === 0) { setFavorites(list); return; }

      const codes = list.map((item: any) => item.fund_code);
      const batchInfo: any[] = await fundService.batchGetFundInfo(codes);

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
      setOpenSwipeId(null);
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
        favorites.map((item, idx) => {
          const key = item.id || item.fund_code;
          return (
            <SwipeToDelete
              key={key}
              isOpen={openSwipeId === key}
              onOpen={() => setOpenSwipeId(key)}
              onClose={() => {
                if (openSwipeId === key) setOpenSwipeId(null);
              }}
              onDelete={() => removeFavorite(item.fund_code)}
            >
              <FundListItem fund={item} mode="watchlist" index={idx} />
            </SwipeToDelete>
          );
        })
      )}
    </div>
  );
}