import { useState, useEffect, useCallback, useRef } from 'react';
import { Empty, Alert, Button, Skeleton } from 'antd';
import { SearchOutlined, ReloadOutlined, SettingOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons';
import { holdingService } from '@/services/holdingService';
import { settingService } from '@/services/settingService';
import MarketIndexStrip from '@/components/MarketIndexStrip';
import GroupSwitcher from '@/components/GroupSwitcher';
import FundListItem from '@/components/FundListItem';
import GroupManageModal from '@/components/modals/GroupManageModal';

interface FundHolding {
  id: number;
  fund_code: string;
  fund_name: string;
  fund_type: string;
  group_id?: number;
  cost_price: number;
  shares: number;
  net_value: number;
  market_value: number;
  estimated_change: number;
  daily_profit: number;
  accumulated_profit: number;
  // 更新状态字段（与自选页面一致）
  last_updated?: string | null;
  is_fresh?: boolean;
  update_status?: 'estimating' | 'pending_confirm' | 'confirmed' | 'market_closed';
  data_source?: 'actual' | 'estimated';
  day_of_week?: string;
}

const LIST_HEADER_COLS = [
  { key: 'fund_name', label: '基金名称', flex: 2 },
  { key: 'market_value', label: '持仓金额', flex: 1 },
  { key: 'estimated_change', label: '估算涨幅', flex: 0.9 },
  { key: 'daily_profit', label: '当日收益', flex: 1 },
  { key: 'accumulated_profit', label: '累计收益', flex: 1.1 },
];

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState<FundHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [refreshFreq, setRefreshFreq] = useState(30);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
  const isLoadingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadHoldings = useCallback(async (forceRefresh = false) => {
    if (isLoadingRef.current && !forceRefresh) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      isLoadingRef.current = true;
      try {
        setError(null);
        // ✅ 传递 forceRefresh 参数到后端
        const data = await holdingService.getHoldings(forceRefresh);
        setHoldings(data.holdings || data || []);
      } catch (e: any) {
        if (e?.code === 'ERR_NETWORK') {
          setError('网络异常，请检查网络连接');
        } else {
          setError('数据获取异常，请稍后重试');
        }
      } finally {
        setLoading(false);
        isLoadingRef.current = false;
      }
    }, forceRefresh ? 0 : 300);
  }, []);

  useEffect(() => {
    loadHoldings(true);
    settingService.getSettings().then((data) => {
      const d = data.settings || data;
      if (d?.refresh_frequency != null) setRefreshFreq(d.refresh_frequency);
    }).catch(() => {});
  }, [loadHoldings]);

  useEffect(() => {
    const handleManualRefresh = () => {
      loadHoldings(true);
    };
    const handleDataChanged = () => {
      loadHoldings(true);
    };

    window.addEventListener('manual-refresh', handleManualRefresh);
    window.addEventListener('data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('manual-refresh', handleManualRefresh);
      window.removeEventListener('data-changed', handleDataChanged);
    };
  }, [loadHoldings]);

  useEffect(() => {
    if (refreshFreq <= 0) return;
    const timer = setInterval(() => loadHoldings(true), refreshFreq * 1000);
    return () => clearInterval(timer);
  }, [refreshFreq, loadHoldings]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === 'desc') { setSortDir('asc'); }
      else if (sortDir === 'asc') { setSortField(null); setSortDir(null); }
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedHoldings = [...holdings].sort((a, b) => {
    if (!sortField || !sortDir) return 0;
    const aVal = (a as any)[sortField] ?? 0;
    const bVal = (b as any)[sortField] ?? 0;
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  const displayHoldings = activeGroup
    ? sortedHoldings.filter(h => h.group_id === activeGroup)
    : sortedHoldings;

  const totalAsset = displayHoldings.reduce((s, h) => s + (h.market_value ?? 0), 0);
  const totalDaily = displayHoldings.reduce((s, h) => s + (h.daily_profit ?? 0), 0);
  const totalAccumulated = displayHoldings.reduce((s, h) => s + (h.accumulated_profit ?? 0), 0);

  if (loading) {
    return (
      <div>
        <div style={{ padding: '14px 16px' }}>
          <Skeleton.Input active style={{ width: '40%', height: 24 }} />
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr 1fr', 
          gap: 12, 
          padding: '0 16px 16px',
          marginBottom: 8
        }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16 }}>
              <Skeleton.Input active size="small" style={{ width: '60%', marginBottom: 12 }} />
              <Skeleton.Input active size="small" style={{ width: '80%' }} />
            </div>
          ))}
        </div>
        {/* ✨ 模拟真实持仓列表的骨架屏 */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 16px',
            margin: '0 10px 2px',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            borderBottom: i < 5 ? '1px solid var(--border-subtle)' : 'none'
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skeleton.Input active size="small" style={{ width: '45%', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <Skeleton.Avatar active size="small" shape="square" style={{ width: 60, height: 20 }} />
                <Skeleton.Avatar active size="small" shape="square" style={{ width: 80, height: 20 }} />
                <Skeleton.Avatar active size="small" shape="square" style={{ width: 50, height: 20 }} />
              </div>
            </div>
            <div style={{ textAlign: 'right', marginLeft: 16, minWidth: 100 }}>
              <Skeleton.Input active size="small" style={{ width: '70%', marginBottom: 4 }} />
              <Skeleton.Input active size="small" style={{ width: '60%' }} />
            </div>
            <div style={{
              width: 6,
              height: 36,
              borderRadius: 3,
              marginLeft: 12,
              background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--border-subtle) 50%, var(--bg-elevated) 75%)',
              backgroundSize: '200% 100%',
              animation: 'skeleton-loading 1.5s ease-in-out infinite'
            }} />
          </div>
        ))}
        
        <style>{`
          @keyframes skeleton-loading {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div>
      <MarketIndexStrip />

      {error ? (
        <div style={{ padding: '24px 16px' }}>
          <Alert
            type={error.includes('网络') ? 'warning' : 'error'}
            message={error}
            action={<Button size="small" onClick={() => loadHoldings(true)} icon={<ReloadOutlined />}>重试</Button>}
          />
        </div>
      ) : null}

      {!error && holdings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 16px' }}>
          <Empty description="还没有持仓，去搜索添加基金吧">
            <Button type="primary" icon={<SearchOutlined />} onClick={() => {
              const input = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement;
              if (input) { input.focus(); input.click(); }
            }}>
              搜索基金
            </Button>
          </Empty>
        </div>
      ) : null}

      {!error && holdings.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px' }} className="portfolio-group-switcher">
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <GroupSwitcher activeId={activeGroup} onChange={setActiveGroup} />
            </div>
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => setGroupManageOpen(true)}
              style={{
                flexShrink: 0,
                marginRight: 6,
                color: 'var(--text-muted)',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--transition-fast)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--accent-gold)';
                e.currentTarget.style.background = 'var(--bg-card)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.background = 'transparent';
              }}
            />
          </div>

          <div className="glass-card portfolio-total-asset" style={{
            margin: '8px 12px',
            padding: '14px 18px',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: 12,
          }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>总资产</span>
              <span className="number-tabular" style={{
                fontSize: 22,
                fontWeight: 800,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                marginLeft: 10,
              }}>
                ¥{totalAsset.toLocaleString()}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 20, alignItems: 'baseline' }}>
              <div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>当日收益</span>
                <span className="number-tabular" style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: totalDaily >= 0 ? 'var(--gain)' : 'var(--loss)',
                  fontFamily: 'var(--font-mono)',
                  marginLeft: 8,
                }}>
                  {totalDaily >= 0 ? '+' : ''}¥{totalDaily.toFixed(2)}
                </span>
              </div>
              <div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>累计收益</span>
                <span className="number-tabular" style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: totalAccumulated >= 0 ? 'var(--gain)' : 'var(--loss)',
                  fontFamily: 'var(--font-mono)',
                  marginLeft: 8,
                }}>
                  {totalAccumulated >= 0 ? '+' : ''}¥{totalAccumulated.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* 移动端响应式样式 */}
          <style>{`
            @media screen and (max-width: 768px) {
              .portfolio-total-asset {
                flex-direction: column !important;
                align-items: flex-start !important;
                padding: 10px 12px !important;  /* 从12px 14px减至10px 12px */
                gap: 6px !important;  /* 从默认gap减小 */
              }

              .portfolio-total-asset > div:first-child {
                margin-bottom: 4px !important;  /* 从8px减至4px */
                width: 100% !important;
              }

              .portfolio-total-asset > div:last-child {
                width: 100% !important;
                justify-content: flex-start !important;
                gap: 20px !important;  /* 保持收益间距 */
              }

              /* 汇总卡片字体缩小 */
              .portfolio-total-asset > div:first-child > span:first-child {
                font-size: 11px !important;  /* "总资产"标签：13px → 11px */
              }

              .portfolio-total-asset > div:first-child > span:last-child {
                font-size: 18px !important;  /* 总资产金额：22px → 18px */
                margin-left: 6px !important;  /* 间距缩小 */
              }

              .portfolio-total-asset > div:last-child > div > span:first-child {
                font-size: 11px !important;  /* "当日/累计收益"标签：13px → 11px */
              }

              .portfolio-total-asset > div:last-child > div > span:last-child {
                font-size: 13px !important;  /* 收益金额：15px → 13px */
                margin-left: 5px !important;  /* 间距缩小 */
              }

              /* 保留表头（隐藏持仓金额列）- 优化列宽比例 */
              .portfolio-table-header [data-col="fund_name"] {
                flex: 2.2 !important;  /* 从2.0增至2.2（增加1个字宽度） */
              }

              .portfolio-table-header [data-col="market_value"] {
                display: none !important;  /* 隐藏持仓金额表头 */
              }

              .portfolio-table-header [data-col="estimated_change"] {
                flex: 1.3 !important;  /* 从1.4减至1.3 */
              }

              .portfolio-table-header [data-col="daily_profit"] {
                flex: 1.3 !important;  /* 从1.4减至1.3 */
              }

              .portfolio-table-header [data-col="accumulated_profit"] {
                flex: 1.5 !important;  /* 从1.3增至1.5 */
              }

              /* 表头字体缩小 */
              .portfolio-table-header > div {
                font-size: 11px !important;
              }

              /* 减小列表项间距 */
              .fund-list-item-wrapper {
                margin-bottom: 3px !important;  /* 从8px减至3px */
              }

              /* 优化移动端间距 */
              .portfolio-group-switcher {
                padding: 4px 8px !important;
              }

              /* 减小汇总卡片与分组按钮的间距 */
              .portfolio-total-asset {
                margin-top: 2px !important;  /* 从4px减至2px */
              }
            }
          `}</style>

          <div
            className="glass-card portfolio-table-header"
            style={{
              margin: '8px 12px 4px',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderBottom: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 13,
                color: 'var(--text-secondary)',
                fontWeight: 600,
              }}
            >
              {LIST_HEADER_COLS.map(col => (
                <div
                  key={col.key}
                  data-col={col.key}
                  style={{
                    flex: col.flex,
                    textAlign: col.key === 'fund_name' ? 'left' : 'right',
                    paddingLeft: col.key === 'fund_name' ? 4 : 0,
                    cursor: col.key !== 'fund_name' ? 'pointer' : 'default',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: col.key === 'fund_name' ? 'flex-start' : 'flex-end',
                    gap: 3,
                  }}
                  onClick={() => col.key !== 'fund_name' && handleSort(col.key)}
                >
                  <span>{col.label}</span>
                  {col.key !== 'fund_name' && sortField === col.key && sortDir && (
                    <span style={{ fontSize: 11, lineHeight: 1, opacity: 0.7 }}>
                      {sortDir === 'desc'
                        ? <SortDescendingOutlined />
                        : <SortAscendingOutlined />}
                    </span>
                  )}
                  {col.key !== 'fund_name' && (!sortField || sortField !== col.key) && (
                    <span style={{ fontSize: 9, lineHeight: 1, color: 'var(--text-dim)' }}>↕</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {displayHoldings.map((fund, index) => (
            <div key={fund.id || index} className="fund-list-item-wrapper" style={{ animation: `fadeInUp 0.35s ease-out ${index * 0.05}s both` }}>
              <FundListItem fund={fund} />
            </div>
          ))}

          <GroupManageModal
            open={groupManageOpen}
            onClose={() => { setGroupManageOpen(false); loadHoldings(); }}
            onDataChange={loadHoldings}
          />
        </>
      )}
    </div>
  );
}
