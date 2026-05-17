import { useState, useEffect, useCallback, useRef } from 'react';
import { groupService } from '@/services/groupService';

interface Group {
  id: number | null;
  name: string;
  total_asset?: number;
  totalValue?: number;
  holdingCount?: number;
}

interface GroupSwitcherProps {
  activeId: number | null;
  onChange: (id: number | null) => void;
}

export default function GroupSwitcher({ activeId, onChange }: GroupSwitcherProps) {
  const [groups, setGroups] = useState<Group[]>([]);

  const loadGroups = useCallback(async () => {
    try {
      const data = await groupService.getGroups();
      const rawGroups = data.groups || data || [];
      const validGroups = rawGroups
        .filter((g: any) => g && typeof g.name === 'string' && g.name.trim() && !g.name.includes('条日志'))
        .map((g: any) => ({
          id: g.id ?? null,
          name: g.name.trim(),
          total_asset: g.total_asset ?? g.totalValue ?? undefined,
        }));
      setGroups(validGroups);
    } catch (e) {
      setGroups([]);
    }
  }, []);

  // 防抖版本的loadGroups，用于事件监听
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedLoadGroups = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadGroups();
    }, 500); // 500ms防抖延迟
  }, [loadGroups]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    const handleDataChange = () => {
      debouncedLoadGroups(); // 使用防抖版本
    };
    window.addEventListener('data-changed', handleDataChange);
    return () => {
      window.removeEventListener('data-changed', handleDataChange);
      // 清理防抖定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [debouncedLoadGroups]);

  const allGroups = [{ id: null as number | null, name: '全部', total_asset: undefined }, ...groups];

  return (
    <div
      className="group-switcher-container"
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        gap: 8,
        padding: '12px 16px',
        alignItems: 'flex-start',
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border-subtle) transparent',
        minWidth: 0,
        width: '100%',
      }}
    >
      {allGroups.map((g, idx) => {
        const isActive = (activeId === null && g.id === null) || activeId === g.id;
        return (
          <div
            key={`group-${g.id ?? 'all'}-${idx}`}
            onClick={() => onChange(g.id)}
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              fontWeight: isActive ? 600 : 500,
              fontSize: 13,
              letterSpacing: '0.01em',
              background: isActive
                ? 'linear-gradient(135deg, var(--accent-gold), #C49A3F)'
                : 'var(--bg-glass)',
              color: isActive ? '#0B1120' : 'var(--text-secondary)',
              border: isActive ? 'none' : '1px solid var(--border-subtle)',
              boxShadow: isActive
                ? 'var(--shadow-glow-gold)'
                : 'var(--shadow-sm)',
              transition: 'all var(--transition-base)',
              transform: isActive ? 'scale(1.02)' : 'scale(1)',
              whiteSpace: 'nowrap',
              animation: `fadeInUp 0.35s ease-out ${idx * 0.05}s both`,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'var(--border-strong)';
                e.currentTarget.style.background = 'var(--bg-card-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.background = 'var(--bg-glass)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            <div style={{ lineHeight: 1.4 }}>{g.name}</div>
            <div className="group-amount" style={{ fontSize: 11, opacity: 0.75, marginTop: 1 }}>
              {g.total_asset != null && (
                <span className="number-tabular">¥{Number(g.total_asset).toLocaleString()}</span>
              )}
            </div>
          </div>
        );
      })}

      {/* 移动端响应式优化 */}
      <style>{`
        .group-switcher-container {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .group-switcher-container::-webkit-scrollbar {
          height: 6px;
          width: 6px;
        }

        .group-switcher-container::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 3px;
        }

        .group-switcher-container::-webkit-scrollbar-thumb {
          background: var(--border-subtle);
          border-radius: 3px;
          transition: background 0.2s ease;
        }

        .group-switcher-container::-webkit-scrollbar-thumb:hover {
          background: var(--border-strong);
        }

        @media screen and (max-width: 768px) {
          .group-switcher-container {
            padding: 8px 12px !important;
            gap: 6px !important;
            -webkit-overflow-scrolling: touch;
            scroll-snap-type: x mandatory;
          }

          .group-switcher-container > div {
            padding: 6px 14px !important;
            font-size: 12px !important;
            scroll-snap-align: start;
          }

          /* 隐藏分组金额 */
          .group-amount {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
