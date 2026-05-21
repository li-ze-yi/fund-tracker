import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Dropdown, Space, Button, Tag, App, Tooltip } from 'antd';
import { LogoutOutlined, UserOutlined, SearchOutlined, PlusOutlined, StarOutlined, StarFilled, ReloadOutlined, CameraOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { fundService } from '@/services/fundService';
import { favoriteService } from '@/services/favoriteService';
import { settingService } from '@/services/settingService';
import type { FundInfo } from '@/services/fundService';
import AddHoldingModal from '@/components/modals/AddHoldingModal';
import ImageImportModal from '@/components/modals/ImageImportModal';

export default function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<FundInfo[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [holdingOpen, setHoldingOpen] = useState(false);
  const [imageImportOpen, setImageImportOpen] = useState(false);
  const [selectedFund, setSelectedFund] = useState<FundInfo | null>(null);
  const [favoritedCodes, setFavoritedCodes] = useState<Set<string>>(new Set());
  const [animatingStar, setAnimatingStar] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFreq, setRefreshFreq] = useState(30);
  const [countdown, setCountdown] = useState(30);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    settingService.getSettings().then((data) => {
      const d = data.settings || data;
      if (d?.refresh_frequency != null) {
        setRefreshFreq(d.refresh_frequency);
        setCountdown(d.refresh_frequency);
      }
    }).catch(() => {});
  }, []);

  // 监听设置页面的刷新频率变更
  useEffect(() => {
    const handler = (e: Event) => {
      const freq = (e as CustomEvent).detail?.frequency;
      if (freq != null) {
        setRefreshFreq(freq);
        setCountdown(freq);
      }
    };
    window.addEventListener('refresh-frequency-changed', handler);
    return () => window.removeEventListener('refresh-frequency-changed', handler);
  }, []);

  useEffect(() => {
    if (refreshFreq <= 0) return;

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // 自动刷新时触发动画
          setRefreshing(true);
          window.dispatchEvent(new CustomEvent('manual-refresh', {
            detail: { forceRefresh: true, timestamp: Date.now() }
          }));
          setTimeout(() => setRefreshing(false), 1000);
          return refreshFreq;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [refreshFreq]);

  const handleManualRefresh = () => {
    if (refreshing) return;

    setRefreshing(true);
    setCountdown(refreshFreq);

    window.dispatchEvent(new CustomEvent('manual-refresh', {
      detail: { forceRefresh: true, timestamp: Date.now() }
    }));

    setTimeout(() => {
      setRefreshing(false);
      message.success('数据已刷新');
    }, 1000);
  };

  const progressPercent = refreshFreq > 0 ? ((refreshFreq - countdown) / refreshFreq) * 100 : 0;

  const onSearchChange = (value: string) => {
    setSearchValue(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      fundService.searchFunds(value).then((data) => {
        const funds: FundInfo[] = data.funds || data || [];
        setSearchResults(funds.slice(0, 10));
        setSearchOpen(true);
      }).catch(() => {
        setSearchResults([]);
        setSearchOpen(true);
      });
    }, 300);
  };

  const handleAddHolding = (fund: FundInfo) => {
    setSelectedFund(fund);
    setHoldingOpen(true);
    setSearchOpen(false);
    setSearchValue('');
  };

  const handleAddFavorite = async (e: React.MouseEvent, fund: FundInfo) => {
    e.stopPropagation();
    
    if (favoritedCodes.has(fund.code)) {
      message.info('已在自选列表中');
      return;
    }

    setAnimatingStar(fund.code);
    
    try {
      await favoriteService.addFavorite(fund.code);
      setFavoritedCodes(prev => new Set(prev).add(fund.code));
      message.success(`已添加 ${fund.name} 到自选`);
      
      setTimeout(() => {
        setAnimatingStar(null);
      }, 600);
    } catch (err) {
      message.error('添加失败，请重试');
      setAnimatingStar(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const dropdownContent = (
    <div style={{
      width: isMobile ? 'calc(100vw - 24px)' : 'min(400px, calc(100vw - 32px))',
      maxHeight: isMobile ? 'min(70vh, calc(100vh - 140px))' : 'min(480px, calc(100vh - 120px))',
      overflowY: 'auto',
      overflowX: 'hidden',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      borderRadius: isMobile ? 'var(--radius-md)' : 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)',
      position: 'relative',
    }}
    >
      {searchResults.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <SearchOutlined style={{ fontSize: 24, opacity: 0.3, display: 'block', marginBottom: 8 }} />
          <div style={{ fontSize: 13 }}>未找到相关基金</div>
        </div>
      ) : (
        searchResults.map((f, idx) => (
          <div
            key={f.code}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: isMobile ? '10px 12px' : '12px 14px',
              cursor: 'pointer',
              borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              transition: 'background var(--transition-fast)',
              animation: `fadeInUp 0.25s ease-out ${idx * 0.03}s both`,
              minHeight: isMobile ? 60 : 72,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div
              style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
              onClick={() => { navigate(`/fund/${f.code}`); setSearchOpen(false); setSearchValue(''); }}
            >
              <div style={{
                fontSize: isMobile ? 13.5 : 14.5,
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.3,
                marginBottom: isMobile ? 1 : 2
              }}>
                {f.name}
              </div>
              <div style={{ display: 'flex', gap: isMobile ? 4 : 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="number-tabular" style={{ fontSize: isMobile ? 11 : 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{f.code}</span>
                {f.type && (
                  <Tag
                    style={{
                      fontSize: isMobile ? 9 : 10,
                      lineHeight: isMobile ? '16px' : '18px',
                      padding: isMobile ? '0 5px' : '0 6px',
                      background: 'var(--accent-gold-dim)',
                      color: 'var(--accent-gold-light)',
                      border: 'none',
                      borderRadius: 4,
                    }}
                  >{f.type}</Tag>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 12 }}>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => { e.stopPropagation(); handleAddHolding(f); }}
                style={{
                  fontSize: 11,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--accent-gold)',
                  color: 'var(--accent-gold)',
                  background: 'transparent',
                }}
              />
              <Button
                size="small"
                icon={favoritedCodes.has(f.code) || animatingStar === f.code ? <StarFilled /> : <StarOutlined />}
                onClick={(e) => handleAddFavorite(e, f)}
                shape="circle"
                style={{
                  border: favoritedCodes.has(f.code) || animatingStar === f.code ? '1px solid var(--accent-gold)' : '1px solid var(--border-default)',
                  color: favoritedCodes.has(f.code) || animatingStar === f.code ? 'var(--accent-gold)' : 'var(--text-muted)',
                  background: favoritedCodes.has(f.code) || animatingStar === f.code ? 'rgba(212, 160, 23, 0.1)' : 'transparent',
                  transform: animatingStar === f.code ? 'scale(1.2)' : 'scale(1)',
                  transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                  boxShadow: animatingStar === f.code ? '0 0 12px rgba(212, 160, 23, 0.5)' : 'none',
                }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <>
      <div
        className="header-container"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 60,
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 18px',
          zIndex: 100,
          gap: 14,
        }}
      >
        <span
          onClick={() => navigate('/portfolio')}
          className="header-title"
          style={{
            fontWeight: 800,
            fontSize: 19,
            letterSpacing: '-0.02em',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-gold-light))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          养基发财
        </span>

        <Dropdown
          open={searchOpen && !!searchValue.trim()}
          onOpenChange={(open) => { if (!open) setSearchOpen(false); }}
          popupRender={() => dropdownContent}
          trigger={['click']}
          placement="bottomLeft"
          overlayStyle={{
            paddingTop: isMobile ? 6 : 8,
            ...(isMobile ? { width: 'calc(100vw - 24px)', left: '12px' } : {}),
          }}
        >
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
            prefix={<SearchOutlined style={{ color: 'var(--text-dim)' }} />}
            suffix={
              <CameraOutlined
                style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15 }}
                onClick={(e) => { e.stopPropagation(); setImageImportOpen(true); }}
              />
            }
            placeholder="搜索基金代码 / 名称"
            className="header-search"
            style={{
              flex: 1,
              maxWidth: 380,
              borderRadius: 'var(--radius-full)',
              height: 38,
              background: 'var(--bg-input)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          />
        </Dropdown>

        <div className="header-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            onClick={handleManualRefresh}
            className={`header-energy-button${refreshing ? ' refreshing' : ''}${countdown <= Math.max(5, refreshFreq * 0.15) && !refreshing ? ' urgent' : ''}`}
            style={{
              position: 'relative',
              width: isMobile ? 40 : 44,
              height: isMobile ? 40 : 44,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: isMobile ? 44 : 44,
              minHeight: isMobile ? 44 : 44,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              borderRadius: '50%',
              background: refreshing
                ? 'linear-gradient(135deg, rgba(212,168,75,0.25), rgba(184,134,11,0.15))'
                : `linear-gradient(135deg, rgba(212,168,75,${0.05 + progressPercent * 0.002}), rgba(184,134,11,${0.02 + progressPercent * 0.001}))`,
              boxShadow: refreshing
                ? '0 0 12px rgba(212,168,75,0.3), inset 0 0 8px rgba(212,168,75,0.1)'
                : progressPercent > 80
                  ? '0 0 10px rgba(212,168,75,0.2), inset 0 0 6px rgba(212,168,75,0.05)'
                  : 'inset 0 1px 2px rgba(0,0,0,0.1)',
              transition: 'all 0.3s ease',
            }}
          >
            {/* 渐变进度环 */}
            <div
              className="energy-ring"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: `conic-gradient(from -90deg, #F0D78C ${progressPercent * 0.3}%, #D4A84B ${progressPercent * 0.7}%, #B8860B ${progressPercent}%, rgba(212, 168, 75, 0.1) ${progressPercent}%)`,
                WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))',
                mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))',
                transition: refreshing ? 'background 0.15s ease-out' : 'background 0.5s ease-out',
              }}
            />
            <ReloadOutlined
              spin={refreshing}
              style={{
                fontSize: isMobile ? 14 : 16,
                color: refreshing ? '#F0D78C' : 'var(--accent-gold)',
                position: 'relative',
                zIndex: 2,
                filter: refreshing ? 'drop-shadow(0 0 4px rgba(212,168,75,0.6))' : 'none',
                transition: 'all 0.3s ease',
              }}
            />
          </div>

          <Dropdown
            menu={{
              items: [
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout },
              ],
              style: { background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' },
            }}
            overlayStyle={{ paddingTop: 6 }}
          >
            <Space
              className="header-user"
              style={{
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                transition: 'background var(--transition-fast)',
                border: '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-card)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <UserOutlined style={{ fontSize: 18, color: 'var(--accent-gold)' }} />
              <span className="header-username" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-secondary)' }}>{user?.username}</span>
            </Space>
          </Dropdown>
        </div>

        {/* 移动端响应式优化 */}
        <style>{`
          .header-energy-button {
            transition: transform 0.15s ease-out, box-shadow 0.3s ease;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
            -webkit-user-select: none;
          }

          .header-energy-button:hover {
            transform: scale(1.08);
          }

          .header-energy-button:active {
            transform: scale(0.92);
          }

          /* 进度接近完成时的脉冲效果 */
          .header-energy-button.urgent .energy-ring {
            animation: ring-pulse 1.5s ease-in-out infinite;
          }

          /* 刷新时的爆发动画 */
          .header-energy-button.refreshing {
            animation: refresh-burst 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
          }

          .header-energy-button.refreshing::after {
            content: '';
            position: absolute;
            inset: -4px;
            border-radius: 50%;
            border: 2px solid rgba(212, 168, 75, 0.6);
            animation: refresh-ripple 0.8s ease-out forwards;
          }

          @keyframes ring-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }

          @keyframes refresh-burst {
            0% { transform: scale(1); }
            30% { transform: scale(0.85); }
            60% { transform: scale(1.15); }
            100% { transform: scale(1); }
          }

          @keyframes refresh-ripple {
            0% {
              transform: scale(0.8);
              opacity: 1;
            }
            100% {
              transform: scale(1.6);
              opacity: 0;
            }
          }

          @media screen and (max-width: 768px) {
            .header-container {
              height: 54px !important;
              padding: 0 12px !important;
              gap: 6px !important;
            }

            .header-actions {
              gap: 4px !important;
            }
            
            .header-title {
              font-size: 16px !important;
            }
            
            .header-search {
              max-width: none !important;
              flex: 1 !important;
              min-width: 0 !important;
              height: 34px !important;
              font-size: 12px !important;
              overflow: hidden !important;
              display: flex !important;
              align-items: center !important;
            }

            .header-search .ant-input-prefix,
            .header-search .ant-input-suffix {
              display: flex !important;
              align-items: center !important;
            }

            .header-search .anticon {
              display: inline-flex !important;
              align-items: center !important;
              justify-content: center !important;
            }

            .header-search .ant-input {
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              white-space: nowrap !important;
            }

            .header-search input {
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              white-space: nowrap !important;
            }

            .header-search input::placeholder,
            .header-search .ant-input::placeholder {
              font-size: 11px !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              white-space: nowrap !important;
            }
            
            .header-user {
              padding: 4px 8px !important;
              gap: 4px !important;
            }
            
            .header-username {
              display: none !important;
            }
            
            .header-user .anticon {
              font-size: 16px !important;
            }

            /* 能量按钮移动端优化 */
            .header-energy-button {
              width: 40px !important;
              height: 40px !important;
              touch-action: manipulation !important;
            }

            /* 搜索下拉框移动端优化 */
            .ant-dropdown {
              width: calc(100vw - 24px) !important;
              left: 12px !important;
            }

            .ant-dropdown .ant-dropdown-menu {
              max-height: none !important;
              overflow-y: auto !important;
            }
          }

          /* 超小屏幕额外适配 (iPhone SE 等) */
          @media screen and (max-width: 375px) {
            .header-container {
              height: 50px !important;
              padding: 0 10px !important;
              gap: 4px !important;
            }

            .header-actions {
              gap: 2px !important;
            }

            .header-title {
              font-size: 15px !important;
              letter-spacing: -0.01em !important;
            }

            .header-search {
              height: 32px !important;
              font-size: 11px !important;
            }

            .header-search input::placeholder,
            .header-search .ant-input::placeholder {
              font-size: 10px !important;
            }

            /* 超小屏能量按钮 */
            .header-energy-button {
              width: 36px !important;
              height: 36px !important;
              min-width: 44px !important;
              min-height: 44px !important;
            }

            .header-user {
              padding: 3px 6px !important;
            }

            .header-user .anticon {
              font-size: 15px !important;
            }
          }
        `}</style>
      </div>

      <AddHoldingModal
        open={holdingOpen}
        fundCode={selectedFund?.code || ''}
        fundName={selectedFund?.name || ''}
        onClose={() => setHoldingOpen(false)}
        onSuccess={() => {
          window.dispatchEvent(new CustomEvent('data-changed', { detail: { type: 'holding-added' } }));
          navigate('/portfolio');
        }}
      />
      <ImageImportModal
        open={imageImportOpen}
        onClose={() => setImageImportOpen(false)}
        onSuccess={() => {
          setImageImportOpen(false);
          window.dispatchEvent(new CustomEvent('data-changed', { detail: { type: 'holding-imported' } }));
          navigate('/portfolio');
        }}
      />
    </>
  );
}
