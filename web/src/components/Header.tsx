import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Dropdown, Space, Button, Tag, App, Tooltip } from 'antd';
import { LogoutOutlined, UserOutlined, SearchOutlined, PlusOutlined, StarOutlined, StarFilled, ReloadOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { fundService } from '@/services/fundService';
import { favoriteService } from '@/services/favoriteService';
import { settingService } from '@/services/settingService';
import type { FundInfo } from '@/services/fundService';
import AddHoldingModal from '@/components/modals/AddHoldingModal';

export default function Header() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<FundInfo[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [holdingOpen, setHoldingOpen] = useState(false);
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

  useEffect(() => {
    if (refreshFreq <= 0) return;

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return refreshFreq;
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
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
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
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
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
            allowClear
          />
        </Dropdown>

        <div className="header-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            onClick={handleManualRefresh}
            className="header-energy-button"
            style={{
              position: 'relative',
              width: isMobile ? 48 : 52,
              height: isMobile ? 48 : 52,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // 移动端优化:增大最小触摸区域至48x48px,确保符合WCAG 2.1 AA标准
              minWidth: isMobile ? 48 : 52,
              minHeight: isMobile ? 48 : 52,
              // 添加touch-action优化,消除300ms点击延迟
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              // 确保点击区域足够大,便于手指操作
              padding: isMobile ? 2 : 0,
            }}
          >
            {(() => {
              const urgency = refreshFreq > 0 ? (refreshFreq - countdown) / refreshFreq : 0;
              const timeRatio = refreshFreq > 0 ? countdown / refreshFreq : 1;
              const isUrgent = countdown <= Math.max(5, refreshFreq * 0.15);
              const isCritical = countdown <= Math.max(2, refreshFreq * 0.08);

              const particleSpeed = isCritical ? 15 : isUrgent ? 25 : (40 + timeRatio * 60);
              const corePulseSpeed = isCritical ? 0.35 : isUrgent ? 0.6 : (1 + timeRatio);
              const glowIntensity = 0.4 + urgency * 0.6;

              return (
                <svg
                  width={isMobile ? 48 : 52}
                  height={isMobile ? 48 : 52}
                  viewBox="0 0 120 120"
                  className="energy-svg"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    // 移动端优化:降低发光强度,避免在小屏幕上过于刺眼
                    filter: refreshing
                      ? `drop-shadow(0 0 ${isMobile ? 10 : 15 * glowIntensity}px rgba(212,168,75,${isMobile ? glowIntensity * 0.7 : glowIntensity})) drop-shadow(0 0 ${isMobile ? 18 : 30 * glowIntensity}px rgba(240,215,140,${isMobile ? glowIntensity * 0.4 : glowIntensity * 0.6})) drop-shadow(0 0 ${isMobile ? 35 : 60 * glowIntensity}px rgba(184,134,11,${isMobile ? glowIntensity * 0.2 : glowIntensity * 0.3}))`
                      : 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
                    transition: 'filter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <defs>
                    <linearGradient id="energyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#F0D78C" />
                      <stop offset="50%" stopColor="#D4A84B" />
                      <stop offset="100%" stopColor="#B8860B" />
                    </linearGradient>

                    <radialGradient id="energyCoreGradient">
                      <stop offset="0%" stopColor="#F0D78C" />
                      <stop offset="100%" stopColor="#B8860B" />
                    </radialGradient>

                    <filter id="energyGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* 外圈能量环 - 背景轨道 */}
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="rgba(212, 168, 75, 0.2)"
                    strokeWidth="12"
                  />

                  {/* 填充的能量弧 - 与倒计时精确同步 */}
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="url(#energyGradient)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${progressPercent * 3.27} 327`}
                    transform="rotate(-90 60 60)"
                    filter={refreshing ? 'url(#energyGlow)' : ''}
                    style={{
                      transition: refreshing ? 'stroke-dasharray 0.15s ease-out' : 'stroke-dasharray 0.5s ease-out',
                      animation: !refreshing && isUrgent ? 'energy-pulse-fast 1s infinite' : 'none'
                    }}
                  />

                  {/* 内部能量核心 - 发光强度随进度增加 */}
                  <circle
                    cx="60"
                    cy="60"
                    r="30"
                    fill="url(#energyCoreGradient)"
                    opacity={0.25 + progressPercent * 0.0075}
                    style={{
                      filter: `drop-shadow(0 0 ${15 + progressPercent * 0.35}px rgba(212, 168, 75, ${0.35 + progressPercent * 0.0065}))`,
                      transition: 'opacity 0.5s ease',
                      animation: refreshing ? `energy-core-active ${corePulseSpeed}s infinite` : (isCritical ? `energy-core-critical ${corePulseSpeed}s infinite` : isUrgent ? `energy-core-urgent ${corePulseSpeed}s infinite` : `energy-core-idle ${corePulseSpeed + 1}s infinite`)
                    }}
                  />

                  {/* 能量粒子环绕 - 移动端减少粒子数量以提升性能 */}
                  {!refreshing && [...Array(isMobile ? 5 : 8)].map((_, i) => {
                    const angle = (i * (isMobile ? 72 : 45) + Date.now() / particleSpeed) * Math.PI / 180;
                    const radiusOffset = isUrgent ? (isMobile ? 3 : 4) : (isMobile ? 2 : 3);
                    const radius = (isMobile ? 36 : 38) + Math.sin(Date.now() / (isUrgent ? (isMobile ? 300 : 350) : (isMobile ? 450 : 500)) + i) * radiusOffset;
                    const x = 60 + radius * Math.cos(angle);
                    const y = 60 + radius * Math.sin(angle);
                    const sizeBase = isUrgent ? (isMobile ? 3 : 3.5) : (isMobile ? 2.5 : 3);
                    const sizeVar = isUrgent ? (isMobile ? 1.2 : 1.5) : (isMobile ? 0.8 : 1);

                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r={sizeBase + Math.sin(Date.now() / (isUrgent ? (isMobile ? 200 : 250) : (isMobile ? 250 : 300)) + i * 0.5) * sizeVar}
                        fill="#F0D78C"
                        opacity={0.85 + urgency * 0.15}
                        filter="url(#energyGlow)"
                      >
                        <animate
                          attributeName="r"
                          values={`${sizeBase}; ${sizeBase + sizeVar}; ${sizeBase}`}
                          dur={`${isUrgent ? (isMobile ? 0.6 + i * 0.1 : 0.8 + i * 0.12) : (isMobile ? 1.2 + i * 0.15 : 1.5 + i * 0.2)}s`}
                          repeatCount="indefinite"
                        />
                      </circle>
                    );
                  })}

                  {/* 刷新时的能量爆发动画 - 移动端减少粒子数量 */}
                  {refreshing && (
                    <>
                      {[...Array(isMobile ? 10 : 16)].map((_, i) => {
                        const angle = (i * (isMobile ? 36 : 22.5)) * Math.PI / 180;
                        const radius = 25 + (Date.now() % 1000) / 20;
                        const x = 60 + radius * Math.cos(angle);
                        const y = 60 + radius * Math.sin(angle);

                        return (
                          <circle
                            key={`burst-${i}`}
                            cx={x}
                            cy={y}
                            r={isMobile ? 1.5 : 2}
                            fill="#F0D78C"
                            opacity={Math.max(0, 1 - radius / 50)}
                          >
                            <animate
                              attributeName="cx"
                              from={60}
                              to={x}
                              dur={`${isMobile ? 0.6 : 0.8}s`}
                              repeatCount="indefinite"
                            />
                            <animate
                              attributeName="cy"
                              from={60}
                              to={y}
                              dur={`${isMobile ? 0.6 : 0.8}s`}
                              repeatCount="indefinite"
                            />
                          </circle>
                        );
                      })}
                    </>
                  )}
                </svg>
              );
            })()}

            {/* 中心图标区域 */}
            <div
              style={{
                position: 'relative',
                zIndex: 2,
                width: isMobile ? 40 : 44,
                height: isMobile ? 40 : 44,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <ReloadOutlined
                spin={refreshing}
                style={{
                  fontSize: isMobile ? 11 : 16,
                  color: refreshing ? '#ffffff' : 'rgba(255,255,255,0.9)',
                  transition: 'all 0.4s ease',
                  // 移动端优化:降低发光强度和尺寸
                  filter: refreshing
                    ? `drop-shadow(0 0 ${isMobile ? 5 : 10}px rgba(212,168,75,1))`
                    : 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
                }}
              />
            </div>
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
          @keyframes energy-core-idle {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.08); opacity: 0.7; }
          }

          @keyframes energy-core-urgent {
            0%, 100% { transform: scale(1); opacity: 0.6; }
            25% { transform: scale(1.15); opacity: 0.9; }
            50% { transform: scale(1); opacity: 0.6; }
            75% { transform: scale(1.15); opacity: 0.9; }
          }

          @keyframes energy-core-critical {
            0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.7; }
            20% { transform: scale(1.25) rotate(72deg); opacity: 1; }
            40% { transform: scale(1) rotate(144deg); opacity: 0.7; }
            60% { transform: scale(1.25) rotate(216deg); opacity: 1; }
            80% { transform: scale(1) rotate(288deg); opacity: 0.7; }
          }

          @keyframes energy-core-active {
            0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
            25% { transform: scale(1.2) rotate(90deg); opacity: 0.8; }
            50% { transform: scale(1) rotate(180deg); opacity: 1; }
            75% { transform: scale(1.2) rotate(270deg); opacity: 0.8; }
          }

          @keyframes energy-pulse-fast {
            0%, 100% {
              filter: drop-shadow(0 0 15px rgba(212,168,75,0.6));
              stroke-dashoffset: 0;
            }
            50% {
              filter: drop-shadow(0 0 25px rgba(240,215,140,0.9));
              stroke-dashoffset: 5;
            }
          }

          /* 移动端优化的触摸反馈动画 */
          @keyframes mobile-touch-feedback {
            0% { transform: scale(1); }
            50% { transform: scale(0.95); }
            100% { transform: scale(1); }
          }

          .header-energy-button {
            transition: all 0.4s ease;
            /* 确保按钮在移动端有足够的可访问性 */
            -webkit-tap-highlight-color: transparent;
            user-select: none;
            -webkit-user-select: none;
          }

          .header-energy-button:hover {
            transform: scale(1.05);
          }

          /* 移动端触摸激活状态 */
          .header-energy-button:active {
            transform: scale(0.96);
            transition: transform 0.15s ease-out;
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

            /* 清除按钮 X 图标优化 */
            .header-search .ant-input-clear-icon {
              font-size: 14px !important;           /* ✅ 增大图标 */
              color: var(--text-secondary) !important; /* ✅ 更明显 */
              opacity: 1 !important;                /* ✅ 完全可见 */
              margin-right: 4px !important;
            }

            .header-search .ant-input-clear-icon:hover {
              color: var(--text-primary) !important;
              transform: scale(1.15) !important;
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
              width: 48px !important;
              height: 48px !important;
              /* 增强移动端触摸反馈 */
              touch-action: manipulation !important;
            }

            .header-energy-button svg {
              width: 48px !important;
              height: 48px !important;
            }

            .header-energy-button > div:last-child {
              width: 40px !important;
              height: 40px !important;
            }

            .header-energy-button > div:last-child .anticon {
              font-size: 11px !important;
              -webkit-text-size-adjust: none !important;
              transform: scale(0.5) !important;
              display: inline-block !important;
            }

            /* 移动端动画参数优化 - 降低复杂度提升性能 */
            .energy-svg {
              animation-composition: add !important;
              will-change: filter, transform !important;
              /* 优化GPU加速 */
              transform: translateZ(0) !important;
              backface-visibility: hidden !important;
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

            /* 超小屏能量按钮进一步缩小但保持最小触摸区域 */
            .header-energy-button {
              width: 44px !important;
              height: 44px !important;
              /* 保持WCAG 2.1 AA标准的44x44px最小触摸目标 */
              min-width: 44px !important;
              min-height: 44px !important;
            }

            .header-energy-button svg {
              width: 44px !important;
              height: 44px !important;
            }

            .header-energy-button > div:last-child {
              width: 36px !important;
              height: 36px !important;
            }

            .header-energy-button > div:last-child .anticon {
              font-size: 10px !important;
              -webkit-text-size-adjust: none !important;
              transform: scale(0.45) !important;
              display: inline-block !important;
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
    </>
  );
}
