import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag } from 'antd';

interface FundListItemProps {
  fund: {
    id: number;
    fund_code: string;
    fund_name?: string;
    fund_type?: string;
    cost_price?: number;
    shares?: number;
    net_value?: number;
    market_value?: number;
    estimated_change?: number;
    daily_profit?: number;
    accumulated_profit?: number;
    // 更新状态字段（4种状态：估算中/待确认/已确认/休市）
    last_updated?: string | null;
    is_fresh?: boolean;
    update_status?: 'estimating' | 'pending_confirm' | 'confirmed' | 'market_closed' | 'pre_market';
    data_source?: 'actual' | 'estimated';
    day_of_week?: string;  // 非交易日时显示星期几
  };
  mode?: 'holding' | 'watchlist';
}

function FundListItemInner({ fund, mode = 'holding' }: FundListItemProps) {
  const navigate = useNavigate();
  const isUp = (fund.estimated_change ?? 0) >= 0;

  // 渲染更新状态标记（5种状态：估算中/待确认/已确认/休市/待开市）
  const renderUpdateIndicator = () => {
    const status = fund.update_status || 'estimating';

    switch (status) {
      case 'pre_market':
        // 🌅 待开市（蓝色）- 盘前等待开盘
        return (
          <span
            data-label="待开市"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              fontWeight: 500,
              color: '#3B82F6',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(59, 130, 246, 0.1)',
              letterSpacing: '0.02em',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#3B82F6',
                display: 'inline-block',
              }}
            />
            待开市
          </span>
        );

      case 'market_closed':
        // 🏁 休市（灰色）- 非交易日（周末/节假日）
        return (
          <span
            data-label={`休市${fund.day_of_week ? `(${fund.day_of_week})` : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              fontWeight: 500,
              color: '#6B7280',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(107, 114, 128, 0.1)',
              letterSpacing: '0.02em',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#6B7280',
                display: 'inline-block',
              }}
            />
            休市{fund.day_of_week ? `(${fund.day_of_week})` : ''}
          </span>
        );

      case 'estimating':
        // 📊 估算中（红色）- 盘中实时估算值，数据不确定
        return (
          <span
            data-label="估算中"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              fontWeight: 500,
              color: '#EF4444',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(239, 68, 68, 0.1)',
              letterSpacing: '0.02em',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#EF4444',
                display: 'inline-block',
                animation: 'pulse-red 3s ease-in-out infinite',
              }}
            />
            估算中
          </span>
        );

      case 'pending_confirm':
        // ⏳ 待确认（橙色）- 收盘后等待正式净值
        return (
          <span
            data-label="待确认"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              fontWeight: 500,
              color: '#F97316',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(249, 115, 22, 0.1)',
              letterSpacing: '0.02em',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#F97316',
                display: 'inline-block',
              }}
            />
            待确认
          </span>
        );

      case 'confirmed':
      default:
        // ✅ 已确认（浅金黄色）- 基金公司确认的实际净值，数据准确
        return (
          <span
            data-label="已确认"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              fontWeight: 500,
              color: '#f5d584',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(245, 213, 132, 0.15)',
              letterSpacing: '0.02em',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#f5d584',
                display: 'inline-block',
              }}
            />
            已确认
          </span>
        );
    }
  };

  if (mode === 'watchlist') {
    return (
      <div
        onClick={() => navigate(`/fund/${fund.fund_code}`)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 16px',
          margin: '0 10px 2px',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          transition: 'all var(--transition-fast)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-default)';
          e.currentTarget.style.background = 'var(--bg-card-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          e.currentTarget.style.background = 'var(--bg-card)';
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fund.fund_name || fund.fund_code}
            </span>
            {renderUpdateIndicator()}
          </div>
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <span className="number-tabular" style={{
              fontSize: 12,
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
            }}>
              {fund.fund_code}
            </span>
            {fund.fund_type && (
              <Tag style={{
                fontSize: 10,
                lineHeight: '16px',
                padding: '0 5px',
                background: 'var(--accent-gold-dim)',
                color: 'var(--accent-gold-light)',
                border: 'none',
                borderRadius: 3,
                fontWeight: 500,
              }}>
                {fund.fund_type}
              </Tag>
            )}
            {fund.net_value && (
              <span className="number-tabular" style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                background: 'var(--flat-bg)',
                padding: '1px 5px',
                borderRadius: 3,
              }}>
                净值 {fund.net_value.toFixed(4)}
              </span>
            )}
            {fund.last_updated && (
              <span className="number-tabular" style={{
                fontSize: 10,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
                opacity: 0.7,
              }}>
                {new Date(fund.last_updated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        <div className="number-tabular" style={{
          textAlign: 'right',
          marginLeft: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
        }}>
          <span style={{
            fontSize: 17,
            fontWeight: 700,
            color: isUp ? 'var(--gain)' : 'var(--loss)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.01em',
          }}>
            {isUp ? '+' : ''}{(fund.estimated_change ?? 0).toFixed(2)}%
          </span>
          <span style={{
            fontSize: 12,
            color: isUp ? 'var(--gain)' : 'var(--loss)',
            opacity: 0.7,
            fontFamily: 'var(--font-mono)',
          }}>
            {isUp ? '+' : ''}{((fund.estimated_change ?? 0) * (fund.net_value || 1) / 100).toFixed(4)}
          </span>
        </div>

        <div style={{
          width: 6,
            height: 36,
            borderRadius: 3,
            background: isUp
              ? 'linear-gradient(180deg, rgba(239, 68, 68, 0.8), rgba(239, 68, 68, 0.1))'
              : 'linear-gradient(180deg, rgba(34, 197, 94, 0.8), rgba(34, 197, 94, 0.1))',
            marginLeft: 12,
          flexShrink: 0,
        }} />
      </div>
    );
  }

  const isDailyUp = (fund.daily_profit ?? 0) >= 0;
  const isAccumulatedUp = (fund.accumulated_profit ?? 0) >= 0;
  const totalCost = (fund.cost_price ?? 0) * (fund.shares ?? 0);
  const totalReturnPct = totalCost > 0 ? ((fund.accumulated_profit ?? 0) / totalCost) * 100 : 0;

  return (
    <div
      onClick={() => navigate(`/fund/${fund.fund_code}`)}
      className="fund-list-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '13px 16px',
        margin: '0 10px 2px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: 'var(--bg-card)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--border-subtle)',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        transition: 'all var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.background = 'var(--bg-card-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.background = 'var(--bg-card)';
      }}
    >
      <div style={{ flex: 2, minWidth: 0 }} data-col="fund_name" data-market-value={`¥${(fund.market_value ?? 0).toLocaleString()}`}>
        <div className="fund-name-row" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fund.fund_name || fund.fund_code}
          </span>
          {renderUpdateIndicator()}
        </div>
        <div className="fund-code-type-row" style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 3 }}>
          <span className="number-tabular" style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{fund.fund_code}</span>
          {fund.fund_type && (
            <Tag style={{ fontSize: 10, lineHeight: '17px', padding: '0 5px', background: 'var(--flat-bg)', color: 'var(--text-secondary)', border: 'none', borderRadius: 3 }}>
              {fund.fund_type}
            </Tag>
          )}
        </div>
        {/* 移动端：持仓金额 + 状态标签行 */}
        <div className="mobile-amount-status-row" style={{ display: 'none' }}>
          <span className="number-tabular" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            ¥{(fund.market_value ?? 0).toLocaleString()}
          </span>
          {renderUpdateIndicator()}
        </div>
      </div>

      <div style={{ flex: 1, textAlign: 'right' }} data-col="market_value" className="number-tabular">
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          ¥{(fund.market_value ?? 0).toLocaleString()}
        </div>
      </div>

      <div className="number-tabular" style={{ flex: 0.9, textAlign: 'right' }} data-col="estimated_change">
        <span className="change-percent" style={{ fontSize: 15, fontWeight: 700, color: isUp ? 'var(--gain)' : 'var(--loss)', fontFamily: 'var(--font-mono)' }}>
          {isUp ? '+' : ''}{(fund.estimated_change ?? 0).toFixed(2)}%
        </span>
      </div>

      <div className="number-tabular" style={{ flex: 1, textAlign: 'right' }} data-col="daily_profit">
        <div className="profit-amount" style={{ fontSize: 14, fontWeight: 600, color: isDailyUp ? 'var(--gain)' : 'var(--loss)', fontFamily: 'var(--font-mono)' }}>
          {isDailyUp ? '+' : ''}¥{(fund.daily_profit ?? 0).toFixed(2)}
        </div>
      </div>

      <div className="number-tabular" style={{ flex: 1.1, textAlign: 'right' }} data-col="accumulated_profit">
        <div className="profit-amount" style={{ fontSize: 14, fontWeight: 600, color: isAccumulatedUp ? 'var(--gain)' : 'var(--loss)', fontFamily: 'var(--font-mono)' }}>
          {isAccumulatedUp ? '+' : ''}¥{(fund.accumulated_profit ?? 0).toFixed(2)}
        </div>
        <div className="profit-percent" style={{ fontSize: 11, fontWeight: 400, color: isAccumulatedUp ? 'var(--gain)' : 'var(--loss)', opacity: 0.6, marginTop: 1, fontFamily: 'var(--font-mono)' }}>
          ({isAccumulatedUp ? '+' : ''}{totalReturnPct.toFixed(2)}%)
        </div>
      </div>

    </div>
  );
}

export default memo(FundListItemInner);
