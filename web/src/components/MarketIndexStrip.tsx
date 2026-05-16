import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UpOutlined, DownOutlined, CheckOutlined } from '@ant-design/icons';
import { fetchIndexData, ALL_INDEX_META } from '@/services/indexService';

interface IndexItem {
  code: string;
  name: string;
  nameShort: string;
  point: number;
  change: number;
  changePercent: number;
}

const DEFAULT_VISIBLE = ['000001', '399001', '399006', 'HSI'];

export default function MarketIndexStrip() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [visibleCodes, setVisibleCodes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ft_visible_indices') || '') || DEFAULT_VISIBLE; }
    catch { return DEFAULT_VISIBLE; }
  });
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState(0);

  useEffect(() => {
    localStorage.setItem('ft_visible_indices', JSON.stringify(visibleCodes));
  }, [visibleCodes]);

  const loadIndices = useCallback(async () => {
    const data = await fetchIndexData(ALL_INDEX_META.map(m => m.code));
    setIndices(data);
  }, []);

  useEffect(() => {
    loadIndices();
    const timer = setInterval(loadIndices, 60000);
    return () => clearInterval(timer);
  }, [loadIndices]);

  const visibleIndices = indices.filter(i => visibleCodes.includes(i.code));

  useEffect(() => {
    if (expanded || selectorOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    let pos = 0;
    const interval = setInterval(() => {
      pos += 0.4;
      if (pos >= el.scrollWidth / 2) pos = 0;
      setScrollPos(pos);
      el.scrollTo({ left: pos, behavior: 'instant' as any });
    }, 30);
    return () => clearInterval(interval);
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
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {!expanded && !selectorOpen && displayList.length > 0 ? (
          <div
            ref={scrollRef}
            className="market-index-scroll"
            style={{
              display: 'flex',
              overflow: 'hidden',
              gap: 24,
              padding: '6px 16px',
            }}
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
        ) : expanded ? (
          <div className="market-index-expanded" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 16px' }}>
            {displayList.map((item) => (
              <div
                key={item.code}
                onClick={() => navigate(`/market?code=${item.code}`)}
                style={{
                  minWidth: 108,
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: item.point !== undefined ? (isUp(item.change) ? 'var(--gain-bg)' : 'var(--loss-bg)') : 'var(--flat-bg)',
                  border: item.point !== undefined ? `1px solid ${isUp(item.change) ? 'var(--gain-border)' : 'var(--loss-border)'}` : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'transform var(--transition-fast)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
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

        <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 2 }}>
          <div
            onClick={() => { setExpanded(!expanded); setSelectorOpen(false); }}
            style={{
              cursor: 'pointer',
              padding: '6px 8px',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
              transition: 'all var(--transition-fast)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            {expanded ? <UpOutlined style={{ fontSize: 11 }} /> : <DownOutlined style={{ fontSize: 11 }} />}
          </div>
          <div
            onClick={() => { setSelectorOpen(!selectorOpen); setExpanded(false); }}
            style={{
              cursor: 'pointer',
              padding: '6px 8px',
              color: selectorOpen ? 'var(--accent-gold)' : 'var(--text-muted)',
              borderRadius: 'var(--radius-sm)',
              transition: 'all var(--transition-fast)',
              border: selectorOpen ? '1px solid var(--accent-gold)' : '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 500,
            }}
            onMouseEnter={(e) => { if (!selectorOpen) e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={(e) => { if (!selectorOpen) e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            ⚙
          </div>
        </div>

        {/* 移动端响应式优化 */}
        <style>{`
          @media screen and (max-width: 768px) {
            .market-index-strip {
              padding: 6px 0 !important;
            }
            
            .market-index-scroll {
              gap: 16px !important;
              padding: 4px 12px !important;
            }
            
            .market-index-scroll > div {
              gap: 3px !important;
            }
            
            .market-index-scroll > div > span:first-child {
              font-size: 11px !important;
            }
            
            .market-index-scroll > div > span:nth-child(2) {
              font-size: 12px !important;
            }
            
            .market-index-scroll > div > span:nth-child(3),
            .market-index-scroll > div > span:nth-child(4) {
              font-size: 10px !important;
            }
            
            .market-index-expanded {
              gap: 6px !important;
              padding: 8px 12px !important;
            }
            
            .market-index-expanded > div {
              min-width: calc(50% - 3px) !important;
              max-width: calc(50% - 3px) !important;
              padding: 6px 10px !important;
            }
          }
        `}</style>
      </div>

      {selectorOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
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
