import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Dropdown, Space, Button, Tag, App } from 'antd';
import { LogoutOutlined, UserOutlined, SearchOutlined, PlusOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { fundService } from '@/services/fundService';
import { favoriteService } from '@/services/favoriteService';
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
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

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
          background: 'rgba(11, 17, 32, 0.85)',
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
              marginLeft: 'auto',
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
            <UserOutlined style={{ fontSize: 15, color: 'var(--accent-gold)' }} />
            <span className="header-username" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-secondary)' }}>{user?.username}</span>
          </Space>
        </Dropdown>

        {/* 移动端响应式优化 */}
        <style>{`
          @media screen and (max-width: 768px) {
            .header-container {
              height: 54px !important;
              padding: 0 12px !important;
              gap: 10px !important;
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
