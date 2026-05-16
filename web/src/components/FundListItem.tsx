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
    update_status?: 'estimating' | 'pending_confirm' | 'confirmed' | 'market_closed';
    data_source?: 'actual' | 'estimated';
    day_of_week?: string;  // 非交易日时显示星期几
  };
  mode?: 'holding' | 'watchlist';
}

export default function FundListItem({ fund, mode = 'holding' }: FundListItemProps) {
  const navigate = useNavigate();
  const isUp = (fund.estimated_change ?? 0) >= 0;

  // 渲染更新状态标记（4种状态：估算中/待确认/已确认/休市）
  const renderUpdateIndicator = () => {
    const status = fund.update_status || 'estimating';

    switch (status) {
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

      {/* 移动端响应式优化 - 新布局策略 */}
      <style>{`
        @media screen and (max-width: 768px) {
          .fund-list-item {
            padding: 6px 10px !important;  /* 从8px 10px进一步减至6px 10px */
            margin: 0 6px 2px !important;  /* 左右边距也减小 */
            border-radius: var(--radius-md) !important;
            border-top-left-radius: var(--radius-md) !important;
            border-top-right-radius: var(--radius-md) !important;
            gap: 4px !important;  /* 从5px减至4px */
            align-items: center !important;  /* 恢复垂直居中对齐 */
            line-height: 1.2 !important;  /* 统一行高 */
            min-height: auto !important;  /* 移除最小高度限制 */
            height: 48px !important;  /* 固定高度为48px */
          }

          /* 左侧信息区：减小内部间距 */
          .fund-list-item > div[data-col="fund_name"] {
            flex: 2.2 !important;
            min-width: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 2px !important;  /* 从4px减至2px */
            justify-content: center !important;  /* 垂直居中 */
          }

          /* 基金名称行：减小字体和间距 */
          .fund-list-item > div[data-col="fund_name"] > div:first-child {
            font-size: 12px !important;  /* 从13px减至12px */
            line-height: 1.2 !important;
            gap: 4px !important;
          }
          
          /* 隐藏基金代码和类型tag */
          .fund-list-item .fund-code-type-row {
            display: none !important;
          }

          /* 隐藏基金名称行的已确认/估算中/待确认等状态标签 */
          .fund-list-item .fund-name-row > span:last-child,
          .fund-list-item .fund-name-row > span:nth-child(2) {
            display: none !important;
          }

          /* 显示持仓金额和状态标签行 */
          .fund-list-item .mobile-amount-status-row {
            display: flex !important;
            align-items: center !important;
            gap: 3px !important;  /* 从4px减至3px */
            overflow: visible !important;
            flex-wrap: nowrap !important;
            font-size: 10px !important;  /* 减小金额字体 */
          }

          /* 状态标签样式优化 */
          .fund-list-item .mobile-amount-status-row > span:last-child {
            font-size: 8px !important;  /* 从9px进一步减小 */
            padding: 1px 3px !important;  /* 进一步缩小 */
            gap: 2px !important;
            flex-shrink: 0 !important;
            min-width: auto !important;
            max-width: none !important;
            display: inline-flex !important;
          }

          /* 状态标签文字显示 */
          .fund-list-item .mobile-amount-status-row > span:last-child::after {
            display: none !important;  /* 不使用::after伪元素 */
          }

          /* 暂时禁用容器查询的自动隐藏逻辑，确保状态标签始终可见 */
          /* 如果后续需要自适应功能，可以重新启用并调整阈值 */

          /*
          // 以下容器查询逻辑已禁用，避免误隐藏状态标签
          @supports (container-type: inline-size) {
            .fund-list-item > div[data-col="fund_name"] {
              container-type: inline-size;
              container-name: fund-name-container;
            }

            @container fund-name-container (max-width: 180px) {
              .mobile-amount-status-row > span:last-child {
                padding: 1px 3px !important;
                min-width: 14px !important;
                width: 14px !important;
                justify-content: center !important;
              }

              .mobile-amount-status-row > span:last-child::after {
                content: "" !important;
              }
            }

            @container fund-name-container (max-width: 150px) {
              .mobile-amount-status-row > span:last-child {
                display: none !important;
              }
            }
          }

          @supports not (container-type: inline-size) {
            @media screen and (max-width: 380px) {
              .fund-list-item .mobile-amount-status-row > span:last-child {
                padding: 1px 3px !important;
                min-width: 14px !important;
                width: 14px !important;
                justify-content: center !important;
              }

              .fund-list-item .mobile-amount-status-row > span:last-child::after {
                content: "" !important;
              }
            }

            @media screen and (max-width: 350px) {
              .fund-list-item .mobile-amount-status-row > span:last-child {
                display: none !important;
              }
            }
          }
          */

          /* 右侧数据区：调整列宽比例和字体大小 */
          .fund-list-item > div[data-col="market_value"] {
            display: none !important;  /* 隐藏原来的独立持仓金额列 */
          }

          .fund-list-item > div[data-col="estimated_change"] {
            flex: 1.4 !important;
            text-align: right !important;
          }

          .fund-list-item > div[data-col="estimated_change"] > span {
            font-size: 12px !important;  /* 从13px减至12px */
          }

          .fund-list-item > div[data-col="daily_profit"] {
            flex: 1.4 !important;
            text-align: right !important;
          }

          .fund-list-item > div[data-col="daily_profit"] > div {
            font-size: 11px !important;  /* 从12px减至11px */
          }

          .fund-list-item > div[data-col="accumulated_profit"] {
            flex: 1.5 !important;  /* 从1增至1.5 */
            text-align: right !important;
          }
          
          /* 字体缩小 */
          .fund-list-item > div[data-col="estimated_change"] > span {
            font-size: 13px !important;
          }
          
          .fund-list-item > div[data-col="daily_profit"] > div {
            font-size: 12px !important;
          }
          
          .fund-list-item > div[data-col="accumulated_profit"] > div:first-child {
            font-size: 12px !important;
          }
          
          .fund-list-item > div[data-col="accumulated_profit"] > div:last-child {
            font-size: 10px !important;
          }

          /* 优化收益数字字体自适应，防止跨行 */
          .fund-list-item .profit-amount {
            white-space: nowrap !important;  /* 防止换行 */
            font-size: clamp(9px, 2vw, 12px) !important;  /* 从14px减至12px最大值 */
            overflow: hidden !important;
            text-overflow: ellipsis !important;  /* 超长时省略号 */
            display: inline-flex !important;
            align-items: center !important;
            line-height: 1 !important;
          }

          .fund-list-item .profit-percent {
            white-space: nowrap !important;  /* 防止换行 */
            font-size: clamp(7px, 1.6vw, 10px) !important;  /* 从11px减至10px最大值 */
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            display: inline-flex !important;
            align-items: center !important;
            line-height: 1 !important;
          }

          /* 统一估算涨幅（span）的对齐方式 */
          .fund-list-item .change-percent {
            display: inline-flex !important;
            align-items: center !important;
            line-height: 1 !important;
            vertical-align: bottom !important;
            font-size: clamp(9px, 2.2vw, 13px) !important;  /* 从15px减至13px */
          }

          /* 统一所有数据列容器的垂直对齐 */
          .fund-list-item > div[data-col="estimated_change"],
          .fund-list-item > div[data-col="daily_profit"],
          .fund-list-item > div[data-col="accumulated_profit"] {
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;  /* 改为垂直居中 */
            align-items: flex-end !important;
            gap: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
