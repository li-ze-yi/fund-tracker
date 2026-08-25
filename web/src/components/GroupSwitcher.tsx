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
              fontWeight: isActive ? 700 : 500,
              fontSize: 13,
              letterSpacing: '0.01em',
              background: isActive
                ? 'linear-gradient(135deg, var(--accent-gold), #C49A3F)'
                : 'var(--bg-card)',
              color: isActive ? '#0B1120' : 'var(--text-primary)',
              border: isActive ? 'none' : '1px solid var(--border-subtle)',
              boxShadow: isActive
                ? '0 0 0 1px rgba(184,134,11,0.3), 0 2px 8px rgba(184,134,11,0.25), 0 0 24px rgba(184,134,11,0.06), inset 0 1px 0 rgba(255,255,255,0.2)'
                : '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'all var(--transition-base)',
              transform: isActive ? 'scale(1.05)' : 'scale(1)',
              whiteSpace: 'nowrap',
              animation: `fadeInUp 0.35s ease-out ${idx * 0.05}s both`,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'var(--border-strong)';
                e.currentTarget.style.background = 'var(--bg-card-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.04)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
              }
            }}
          >
            <div style={{ lineHeight: 1.4, color: isActive ? 'inherit' : 'var(--text-primary)' }}>{g.name}</div>
            <div className="group-amount" style={{ fontSize: 11, opacity: 0.75, marginTop: 1 }}>
              {g.total_asset != null && (
                <span className="number-tabular">¥{Number(g.total_asset).toLocaleString()}</span>
              )}
            </div>
          </div>
        );
      })}

      </div>
  );
}
