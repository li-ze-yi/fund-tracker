import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DownOutlined, CheckOutlined, SettingOutlined } from '@ant-design/icons';
import { fetchIndexData, fetchMarketStatus, ALL_INDEX_META } from '@/services/indexService';
import { useIsMobile } from '@/hooks/useIsMobile';

interface IndexItem {
  code: string;
  name: string;
  nameShort: string;
  point: number;
  change: number;
  changePercent: number;
}

const DEFAULT_VISIBLE = ['000001', '399001', '399006', 'HSI'];

function MarketIndexStrip() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [visibleCodes, setVisibleCodes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ft_visible_indices') || '') || DEFAULT_VISIBLE; }
    catch { return DEFAULT_VISIBLE; }
  });
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  // 统一断点：1024（与原手写 resize 断点一致，视觉行为不变）
  const isMobile = useIsMobile(1024);

  useEffect(() => {
    localStorage.setItem('ft_visible_indices', JSON.stringify(visibleCodes));
  }, [visibleCodes]);

  const loadIndices = useCallback(async () => {
    const data = await fetchIndexData(ALL_INDEX_META.map(m => m.code));
    setIndices(data);
  }, []);

  // 60s 数据轮询定时器
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 最近一次已知的市场状态（避免重复启停）
  const statusRef = useRef<boolean | null>(null);
  // 5 分钟一次的市场状态复查定时器
  const statusCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 开市时启动 60s 轮询，闭市时停止（保留最后一次数据）
  const setPolling = useCallback((enabled: boolean) => {
    if (enabled && !pollTimerRef.current) {
      pollTimerRef.current = setInterval(loadIndices, 60000);
    } else if (!enabled && pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, [loadIndices]);

  // 查询市场状态，状态翻转时启停轮询
  const checkMarketStatus = useCallback(async () => {
    try {
      const status = await fetchMarketStatus();
      if (statusRef.current !== status.isMarketOpen) {
        statusRef.current = status.isMarketOpen;
        setPolling(status.isMarketOpen);
      }
    } catch {
      // 状态查询失败时保持当前轮询状态
    }
  }, [setPolling]);

  useEffect(() => {
    // 初始立即加载一次，保证有数据展示
    loadIndices();
    // 初始化市场状态，并按 5 分钟频率复查；开市才维持 60s 轮询
    checkMarketStatus();
    statusCheckTimerRef.current = setInterval(checkMarketStatus, 300000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (statusCheckTimerRef.current) clearInterval(statusCheckTimerRef.current);
    };
  }, [loadIndices, checkMarketStatus]);

  const visibleIndices = indices.filter(i => visibleCodes.includes(i.code));

  // 纯 CSS 跑马灯：仅测量内容宽度换算动画时长（恒速与原 rAF 版一致：20px/s），无逐帧 JS
  const [marqueeDuration, setMarqueeDuration] = useState(30);
  useEffect(() => {
    if (expanded || selectorOpen) return;
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.scrollWidth;
      if (w > 0) setMarqueeDuration(Math.max(10, w / 2 / 20));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, selectorOpen, visibleIndices.length]);

  const toggleIndex = (code: string) => {
    setVisibleCodes(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : prev.length < 8 ? [...prev, code] : prev
    );
  };

  const isUp = (val: number) => val >= 0;

  const displayList = visibleIndices.length > 0 ? visibleIndices : indices.slice(0, 4);

  return (
    <>
      <div className="market-index-strip" style={{
        padding: '8px 0',
        background: 'var(--bg-header)',
        backdropFilter: 'blur(16px) saturate(150%)',
        WebkitBackdropFilter: 'blur(16px) saturate(150%)',
        boxShadow: '0 1px 0 var(--border-subtle), 0 2px 12px -2px rgba(0,0,0,0.04)',
        position: 'relative',
        overflow: 'hidden',
        ...(isMobile ? { marginLeft: 'calc(-1 * var(--content-padding))', marginRight: 'calc(-1 * var(--content-padding))' } : {}),
      }}>
        {!expanded && !selectorOpen && displayList.length > 0 ? (
          <div
            className="market-index-scroll"
            style={{
              overflow: 'hidden',
              padding: isMobile ? '4px 6px' : '6px 16px',
              WebkitMaskImage: isMobile
                ? 'linear-gradient(to right, transparent 0%, black 2%, black 98%, transparent 100%)'
                : 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
              maskImage: isMobile
                ? 'linear-gradient(to right, transparent 0%, black 2%, black 98%, transparent 100%)'
                : 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
            }}
          >
            {/* 纯 CSS 无缝跑马灯：内容渲染两份，translateX(-50%) 循环；hover 暂停见 App.css */}
            <div
              ref={trackRef}
              className="market-index-track"
              style={{ '--marquee-duration': `${marqueeDuration}s` } as React.CSSProperties}
            >
            {[...displayList, ...displayList].map((item, idx) => (
              <div
                key={`${item.code}-${idx}`}
                onClick={() => navigate(`/market?code=${item.code}`)}
                style={{
                  flexShrink: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 5,
                  padding: '2px 0',
                  marginRight: isMobile ? 16 : 24,
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {item.nameShort}
                </span>
                {item.point !== undefined ? (
                  <>
                    <span className="number-tabular" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {item.point.toFixed(2)}
                    </span>
                    <span className="number-tabular" style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isUp(item.change) ? 'var(--gain)' : 'var(--loss)',
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'nowrap'
                    }}>
                      {isUp(item.change) ? '+' : ''}{item.change.toFixed(1)}
                    </span>
                    <span className="number-tabular" style={{
                      fontSize: 11.5,
                      fontWeight: 500,
                      color: isUp(item.change) ? 'var(--gain)' : 'var(--loss)',
                      opacity: 0.75,
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'nowrap'
                    }}>
                      ({isUp(item.changePercent) ? '+' : ''}{item.changePercent.toFixed(2)}%)
                    </span>
                  </>
                ) : (
                  <span className="number-tabular" style={{ fontSize: 11.5, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    加载中...
                  </span>
                )}
              </div>
            ))}
            </div>
          </div>
        ) : expanded ? (
          <div className="market-index-expanded" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 16px' }}>
            {displayList.map((item) => (
              <div
                key={item.code}
                onClick={() => navigate(`/market?code=${item.code}`)}
                style={{
                  minWidth: 112,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: item.point !== undefined ? (isUp(item.change) ? 'var(--gain-bg)' : 'var(--loss-bg)') : 'var(--flat-bg)',
                  border: item.point !== undefined ? `1px solid ${isUp(item.change) ? 'var(--gain-border)' : 'var(--loss-border)'}` : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all var(--transition-base)',
                  boxShadow: '0 2px 10px -6px color-mix(in srgb, var(--accent-gold) 24%, transparent)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
                  e.currentTarget.style.boxShadow = '0 6px 18px -6px color-mix(in srgb, var(--accent-gold) 40%, transparent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 10px -6px color-mix(in srgb, var(--accent-gold) 24%, transparent)';
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{item.name}</div>
                <div className="number-tabular" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>
                  {item.point !== undefined ? item.point.toFixed(2) : '--'}
                </div>
                <div className="number-tabular" style={{ fontSize: 12, fontWeight: 600, color: item.point !== undefined ? (isUp(item.change) ? 'var(--gain)' : 'var(--loss)') : 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {item.point !== undefined ? `${isUp(item.change) ? '+' : ''}${item.change.toFixed(2)}  ${isUp(item.changePercent) ? '+' : ''}${item.changePercent.toFixed(2)}%` : '--'}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="market-index-actions">
          <div
            className={`market-index-btn${expanded ? ' is-active' : ''}`}
            onClick={() => { setExpanded(!expanded); setSelectorOpen(false); }}
            title={expanded ? '收起指数列表' : '展开指数列表'}
          >
            <DownOutlined style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
          </div>
          <div className="market-index-btn-divider" />
          <div
            className={`market-index-btn${selectorOpen ? ' is-active' : ''}`}
            onClick={() => { setSelectorOpen(!selectorOpen); setExpanded(false); }}
            title="选择显示的指数"
          >
            <SettingOutlined />
          </div>
        </div>

      </div>

      {selectorOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--bg-glass)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'flex-end',
          }}
          onClick={() => setSelectorOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxHeight: '70vh',
              background: 'var(--bg-elevated)',
              borderTopLeftRadius: 'var(--radius-xl)',
              borderTopRightRadius: 'var(--radius-xl)',
              padding: '20px 16px',
              animation: 'fadeInUp 0.25s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>选择显示的指数</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>已选 {visibleCodes.length}/8 个</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, overflowY: 'auto', maxHeight: 'calc(70vh - 120px)' }}>
              {ALL_INDEX_META.map((meta) => {
                const selected = visibleCodes.includes(meta.code);
                const realData = indices.find(i => i.code === meta.code);
                return (
                  <div
                    key={meta.code}
                    onClick={() => toggleIndex(meta.code)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '11px 12px',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      background: selected ? 'var(--accent-gold-dim)' : 'transparent',
                      border: `1px solid ${selected ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{meta.name}</div>
                      <div className="number-tabular" style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1, fontFamily: 'var(--font-mono)' }}>
                        {realData && realData.point > 0 ? (
                          <>
                            <span>{realData.point.toFixed(2)}</span>
                            {'  '}
                            <span style={{ color: isUp(realData.change) ? 'var(--gain)' : 'var(--loss)' }}>
                              {isUp(realData.change) ? '+' : ''}{realData.changePercent.toFixed(2)}%
                            </span>
                          </>
                        ) : '--'}
                      </div>
                    </div>
                    {selected && <CheckOutlined style={{ color: 'var(--accent-gold)', fontSize: 14, flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>

            <div style={{ textAlign: 'center', paddingTop: 14, borderTop: '1px solid var(--border-subtle)', marginTop: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>点击空白处关闭</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// React.memo：父级重渲染时跳过无意义的子树重渲（数据轮询自持）
export default memo(MarketIndexStrip);
