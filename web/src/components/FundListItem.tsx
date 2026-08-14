import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag } from 'antd';
import { useHideAmountStore } from '@/store/hideAmountStore';

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
    update_time?: string | null;
    is_fresh?: boolean;
    update_status?: 'estimating' | 'pending_confirm' | 'confirmed' | 'market_closed' | 'pre_market' | 'no_estimate' | 'sold_out' | 'pending_purchase';
    data_source?: 'actual' | 'estimated';
    day_of_week?: string;  // 非交易日时显示星期几
  };
  mode?: 'holding' | 'watchlist';
  index?: number;
}

// 更新状态标记（估算中/待确认/已确认/休市/待开市/前一日/已清仓/待入库）
interface UpdateIndicatorProps {
  status?: string;
  dayOfWeek?: string;
}

const UpdateIndicator = memo(function UpdateIndicator({ status, dayOfWeek }: UpdateIndicatorProps) {
  const s = status || 'estimating';

  switch (s) {
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
            color: 'var(--status-pre-market)',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--status-pre-market-bg)',
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--status-pre-market)',
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
          data-label={`休市${dayOfWeek ? `(${dayOfWeek})` : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: 500,
            color: 'var(--status-standby)',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--status-standby-bg)',
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--status-standby)',
              display: 'inline-block',
            }}
          />
          休市{dayOfWeek ? `(${dayOfWeek})` : ''}
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
            color: 'var(--status-estimating)',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--status-estimating-bg)',
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--status-estimating)',
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
            color: 'var(--status-pending)',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--status-pending-bg)',
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--status-pending)',
              display: 'inline-block',
            }}
          />
          待确认
        </span>
      );

    case 'no_estimate':
      // 估算失败（灰色）- 显示前一日数据
      return (
        <span
          data-label="前一日"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: 500,
            color: 'var(--status-standby)',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--status-standby-bg)',
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--status-standby)',
              display: 'inline-block',
            }}
          />
          前一日
        </span>
      );

    case 'sold_out':
      // 已清仓（灰色）- 基金全部卖出，持仓记录保留
      return (
        <span
          data-label="已清仓"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: 500,
            color: 'var(--status-standby)',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--status-standby-bg)',
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--status-standby)',
              display: 'inline-block',
            }}
          />
          已清仓
        </span>
      );

    case 'pending_purchase':
      // 📋 待入库（紫色）- 新购基金等待净值确认
      return (
        <span
          data-label="待入库"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: 500,
            color: 'var(--status-pending-purchase)',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--status-pending-purchase-bg)',
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--status-pending-purchase)',
              display: 'inline-block',
              animation: 'pulse-red 3s ease-in-out infinite',
            }}
          />
          待入库
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
            color: 'var(--status-confirmed)',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'var(--status-confirmed-bg)',
            letterSpacing: '0.02em',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--status-confirmed)',
              display: 'inline-block',
            }}
          />
          已确认
        </span>
      );
  }
});

function FundListItemInner({ fund, mode = 'holding', index = 0 }: FundListItemProps) {
  const navigate = useNavigate();
  const isUp = (fund.estimated_change ?? 0) >= 0;
  const hideAmount = useHideAmountStore((s) => s.hidden);
  const isMarketClosed = fund.update_status === 'market_closed' || fund.update_status === 'pre_market';
  const isSoldOut = fund.update_status === 'sold_out';
  const isPendingPurchase = fund.update_status === 'pending_purchase';
  const isEvenRow = index % 2 === 0;

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
          background: isEvenRow ? 'var(--bg-row-even)' : 'var(--bg-row-odd)',
          border: '1px solid var(--border-subtle)',
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          transition: 'all var(--transition-base)',
          position: 'relative',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-default)';
          e.currentTarget.style.background = 'var(--bg-row-hover)';
          e.currentTarget.style.transform = 'translateX(2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          e.currentTarget.style.background = isEvenRow ? 'var(--bg-row-even)' : 'var(--bg-row-odd)';
          e.currentTarget.style.transform = 'translateX(0)';
        }}
      >
        {/* 左侧涨跌色带 */}
        {!isMarketClosed && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: isUp
              ? 'linear-gradient(180deg, var(--gain), var(--gain-band-end))'
              : 'linear-gradient(180deg, var(--loss), var(--loss-band-end))',
            opacity: 0.7,
          }} />
        )}
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
            <UpdateIndicator status={fund.update_status} dayOfWeek={fund.day_of_week} />
          </div>
          <div style={{ 
            display: 'flex', 
            gap: 8, 
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <span className="number-tabular" style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
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
            {fund.update_status === 'no_estimate' ? (
              <span className="number-tabular" style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                background: 'var(--flat-bg)',
                padding: '1px 5px',
                borderRadius: 3,
                opacity: 0.6,
              }}>
                净值 --
              </span>
            ) : fund.net_value && (
              <span className="number-tabular" style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                background: 'var(--flat-bg)',
                padding: '1px 5px',
                borderRadius: 3,
              }}>
                净值 {hideAmount ? '****' : fund.net_value.toFixed(4)}
              </span>
            )}
            {fund.last_updated && (
              <span className="number-tabular" style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                opacity: 0.8,
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
            color: isMarketClosed ? 'var(--text-muted)' : (isUp ? 'var(--gain)' : 'var(--loss)'),
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.01em',
          }}>
            {isMarketClosed ? '--' : `${isUp ? '+' : ''}${(fund.estimated_change ?? 0).toFixed(2)}%`}
          </span>
          {!isMarketClosed && (
            <span style={{
              fontSize: 12,
              color: isUp ? 'var(--gain)' : 'var(--loss)',
              opacity: 0.7,
              fontFamily: 'var(--font-mono)',
            }}>
              {hideAmount ? '****' : `${isUp ? '+' : ''}${((fund.estimated_change ?? 0) * (fund.net_value || 1) / 100).toFixed(4)}`}
            </span>
          )}
        </div>

        {!isMarketClosed && (
          <div style={{
            width: 6,
            height: 36,
            borderRadius: 3,
            background: isUp
              ? 'var(--gain-bar)'
              : 'var(--loss-bar)',
            marginLeft: 12,
            flexShrink: 0,
          }} />
        )}
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
        background: isEvenRow ? 'var(--bg-row-even)' : 'var(--bg-row-odd)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-subtle)',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.background = 'var(--bg-row-hover)';
        e.currentTarget.style.transform = 'translateX(2px)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.background = isEvenRow ? 'var(--bg-row-even)' : 'var(--bg-row-odd)';
        e.currentTarget.style.transform = 'translateX(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
      }}
    >
      {/* 左侧涨跌色带 */}
      {!isMarketClosed && !isSoldOut && !isPendingPurchase && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: isUp
            ? 'linear-gradient(180deg, var(--gain), var(--gain-band-end))'
            : 'linear-gradient(180deg, var(--loss), var(--loss-band-end))',
          opacity: 0.85,
        }} />
      )}
      <div style={{ flex: 2, minWidth: 0 }} data-col="fund_name" data-market-value={`¥${(fund.market_value ?? 0).toLocaleString()}`}>
        <div className="fund-name-row" style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fund.fund_name || fund.fund_code}
          </span>
          <UpdateIndicator status={fund.update_status} dayOfWeek={fund.day_of_week} />
        </div>
        <div className="fund-code-type-row" style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 3 }}>
          <span className="number-tabular" style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{fund.fund_code}</span>
          {fund.fund_type && (
            <Tag style={{ fontSize: 10, lineHeight: '17px', padding: '0 5px', background: 'var(--flat-bg)', color: 'var(--text-secondary)', border: 'none', borderRadius: 3 }}>
              {fund.fund_type}
            </Tag>
          )}
        </div>
        {/* 移动端：持仓金额 + 状态标签行 */}
        <div className="mobile-amount-status-row" style={{ display: 'none' }}>
          <span className="number-tabular" style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {hideAmount ? '****' : `¥${(fund.market_value ?? 0).toLocaleString()}`}
          </span>
          <UpdateIndicator status={fund.update_status} dayOfWeek={fund.day_of_week} />
        </div>
      </div>

      <div style={{ flex: 1, textAlign: 'right' }} data-col="market_value" className="number-tabular">
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {hideAmount ? '****' : `¥${(fund.market_value ?? 0).toLocaleString()}`}
        </div>
      </div>

      <div className="number-tabular" style={{ flex: 0.9, textAlign: 'right' }} data-col="estimated_change">
        <span className="change-percent" style={{ fontSize: 15, fontWeight: 700, color: (isMarketClosed || isSoldOut || isPendingPurchase) ? 'var(--text-muted)' : (isUp ? 'var(--gain)' : 'var(--loss)'), fontFamily: 'var(--font-mono)' }}>
          {(isMarketClosed || isSoldOut || isPendingPurchase) ? '--' : `${isUp ? '+' : ''}${(fund.estimated_change ?? 0).toFixed(2)}%`}
        </span>
        {fund.update_status === 'no_estimate' && (fund.update_time || fund.last_updated) && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
            ({(() => {
              const dateStr = fund.update_time || fund.last_updated || '';
              const d = new Date(dateStr);
              if (isNaN(d.getTime())) return '';
              return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            })()})
          </div>
        )}
      </div>

      <div className="number-tabular" style={{ flex: 1, textAlign: 'right' }} data-col="daily_profit">
        <div className="profit-amount" style={{ fontSize: 14, fontWeight: 600, color: (isMarketClosed || isSoldOut || isPendingPurchase) ? 'var(--text-muted)' : (isDailyUp ? 'var(--gain)' : 'var(--loss)'), fontFamily: 'var(--font-mono)' }}>
          {(isMarketClosed || isPendingPurchase) ? '--' : (hideAmount ? '****' : `${isDailyUp ? '+' : '-'}¥${Math.abs(fund.daily_profit ?? 0).toFixed(2)}`)}
        </div>
      </div>

      <div className="number-tabular" style={{ flex: 1.1, textAlign: 'right' }} data-col="accumulated_profit">
        <div className="profit-amount" style={{ fontSize: 14, fontWeight: 600, color: isAccumulatedUp ? 'var(--gain)' : 'var(--loss)', fontFamily: 'var(--font-mono)' }}>
          {hideAmount ? '****' : `${isAccumulatedUp ? '+' : '-'}¥${Math.abs(fund.accumulated_profit ?? 0).toFixed(2)}`}
        </div>
        <div className="profit-percent" style={{ fontSize: 11, fontWeight: 400, color: isAccumulatedUp ? 'var(--gain)' : 'var(--loss)', opacity: 0.7, marginTop: 1, fontFamily: 'var(--font-mono)' }}>
          ({isAccumulatedUp ? '+' : ''}{totalReturnPct.toFixed(2)}%)
        </div>
      </div>

    </div>
  );
}

export default memo(FundListItemInner);
