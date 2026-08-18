import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Dropdown, Space, Button, Tag, App, Tooltip } from 'antd';
import { LogoutOutlined, UserOutlined, SearchOutlined, PlusOutlined, StarOutlined, StarFilled, CameraOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { fundService } from '@/services/fundService';
import { favoriteService } from '@/services/favoriteService';
import { settingService, type SettingsData } from '@/services/settingService';
import type { FundInfo } from '@/services/fundService';
import AddHoldingModal from '@/components/modals/AddHoldingModal';
import ImageImportModal from '@/components/modals/ImageImportModal';

export default function Header() {
  const { user, logout } = useAuthStore();
  const themeMode = useThemeStore((s) => s.mode);
  const toggleTheme = useThemeStore((s) => s.toggleMode);
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
  const [burstKey, setBurstKey] = useState(0);
  const [refreshFreq, setRefreshFreq] = useState(30);
  const [countdown, setCountdown] = useState(30);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const countdownResetRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    settingService.getSettings().then((data) => {
      // 兼容两种响应结构：{ settings: {...} } 或直接返回设置对象
      const settings = (data as { settings?: SettingsData })?.settings || data;
      if (settings?.refresh_frequency != null) {
        setRefreshFreq(settings.refresh_frequency);
        setCountdown(settings.refresh_frequency);
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
          // 保存内部 setTimeout 句柄，组件卸载时一并清理，避免定时器泄漏
          countdownResetRef.current = setTimeout(() => {
            setRefreshing(false);
            setBurstKey(k => k + 1);
            countdownResetRef.current = undefined;
          }, 1000);
          return refreshFreq;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (countdownResetRef.current) clearTimeout(countdownResetRef.current);
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
      setBurstKey(k => k + 1);
      message.success('数据已刷新');
    }, 1000);
  };

  const refreshProgress = refreshFreq > 0 ? (refreshFreq - countdown) / refreshFreq : 0;

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

  const isMobile = useIsMobile();

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
          background: 'var(--bg-header)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          boxShadow: '0 1px 0 var(--border-subtle), 0 4px 24px -4px rgba(0,0,0,0.06)',
          zIndex: 100,
        }}
      >
        <div style={{ maxWidth: 'var(--content-max-width)', margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', height: '100%', gap: 14, padding: '0 var(--content-padding)' }}>
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
                style={{ color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 15 }}
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
          {/* 自动刷新沙漏（点击刷新，倒计时动画集成于此） */}
          <span
            className="header-countdown"
            onClick={handleManualRefresh}
            role="button"
            aria-label={refreshing ? '正在刷新…' : '手动刷新'}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleManualRefresh(); } }}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
              userSelect: 'none',
              color: 'var(--text-dim)',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              width: isMobile ? 36 : 42,
              height: isMobile ? 36 : 42,
              minWidth: isMobile ? 36 : 42,
              minHeight: isMobile ? 36 : 42,
              borderRadius: '10px',
              border: '1.5px solid var(--border-strong)',
              background: 'var(--bg-card)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              justifyContent: 'center',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              if (!refreshing) { e.currentTarget.style.boxShadow = '0 0 10px var(--neon-glow-gold)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
              e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.04)';
            }}
          >
            {/* 沙漏：沙子随倒计时从上瓶漏到下瓶，刷新时多圈翻转 */}
            <span className={`hourglass${countdown <= 5 && !refreshing ? ' urgent' : ''}`} style={{ display: 'inline-flex', position: 'relative', transform: refreshing ? 'rotate(1080deg)' : 'rotate(0deg)', transition: 'transform 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              <svg width={isMobile ? 24 : 30} height={isMobile ? 28 : 35} viewBox="0 0 24 28">
                <defs>
                  <linearGradient id="hdrSand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#F0D78C" />
                    <stop offset="1" stopColor="#C79A3B" />
                  </linearGradient>
                </defs>
                {/* 瓶身实心底（凸显沙漏形状） */}
                <path d="M2 2 L22 2 L12 13 Z M12 15 L22 26 L2 26 Z" fill="var(--bg-card)" />
                {/* 上瓶沙子：锥形，沙量随倒计时减少 */}
                {(() => {
                  const fu = 1 - refreshProgress;
                  const yTop = 13 - fu * 11;
                  const wTop = 20 * fu;
                  return <polygon points={`${12 - wTop / 2},${yTop} ${12 + wTop / 2},${yTop} 12,13`} fill="url(#hdrSand)" />;
                })()}
                {/* 下瓶沙子：锥形，沙量随倒计时增加 */}
                {(() => {
                  const fl = refreshProgress;
                  const yBot = 26 - fl * 11;
                  const wBot = 20 * (1 - fl);
                  return <polygon points={`${12 - wBot / 2},${yBot} ${12 + wBot / 2},${yBot} 22,26 2,26`} fill="url(#hdrSand)" />;
                })()}
                {/* 瓶颈流沙亮点 */}
                <rect x="11.2" y="12.6" width="1.6" height="2.2" fill="#E8C96A" opacity="0.95" />
                {/* 瓶身描边（加粗，强化轮廓） */}
                <path d="M2 2 L22 2 L12 13 Z M12 15 L22 26 L2 26 Z" fill="none" stroke="var(--hero-border-light)" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </span>
            {/* 刷新完成粒子爆发（只在刷新结束瞬间播放一次） */}
            {burstKey > 0 && (
              <span key={burstKey} className="refresh-burst">
                {[...Array(8)].map((_, i) => (
                  <span
                    key={i}
                    className="burst-particle"
                    style={{ '--angle': `${i * 45}deg` } as React.CSSProperties}
                  />
                ))}
              </span>
            )}
          </span>

          {/* 明暗主题切换：干净幽灵圆钮 */}
          <Tooltip title={themeMode === 'dark' ? '切换浅色模式' : '切换深色模式'}>
            <div
              onClick={toggleTheme}
              role="button"
              aria-label="切换主题"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTheme(); } }}
              className="header-icon-btn"
              style={{
                width: isMobile ? 36 : 42,
                height: isMobile ? 36 : 42,
                minWidth: isMobile ? 36 : 42,
                minHeight: isMobile ? 36 : 42,
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-card)',
                border: '1.5px solid var(--border-strong)',
                color: 'var(--text-secondary)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
                transition: 'all var(--transition-fast)',
              }}
            >
              <span key={themeMode} className="theme-icon-swap">
                {themeMode === 'dark'
                  ? <SunOutlined style={{ fontSize: isMobile ? 15 : 17, color: '#FFB300' }} />
                  : <MoonOutlined style={{ fontSize: isMobile ? 15 : 17, color: '#C9D2E0' }} />}
              </span>
            </div>
          </Tooltip>

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
                border: '1px solid var(--border-strong)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-card)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <UserOutlined className="header-avatar-icon" style={{ fontSize: 18, color: 'var(--accent-gold)' }} />
              <span className="header-username" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-secondary)' }}>{user?.username}</span>
            </Space>
          </Dropdown>
        </div>

        </div>
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
