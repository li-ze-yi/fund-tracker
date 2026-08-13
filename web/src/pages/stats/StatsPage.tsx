import { useState, useEffect } from 'react';
import { Card, Segmented, Table, Skeleton, Empty, Tooltip } from 'antd';
import { BarChartOutlined, CalendarOutlined, DollarOutlined, PercentageOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { statsService } from '@/services/statsService';
import { useThemeStore } from '@/store/themeStore';
import { useHideAmountStore } from '@/store/hideAmountStore';

type Period = 'daily' | 'monthly' | 'yearly';
type ViewMode = 'chart' | 'date_table';

const MOCK_DAILY_DATA = [
  { date: '2026-05-11', profit: 128.56, return_rate: 0.85 },
  { date: '2026-05-10', profit: -45.23, return_rate: -0.30 },
  { date: '2026-05-09', profit: 89.34, return_rate: 0.59 },
  { date: '2026-05-08', profit: -12.78, return_rate: -0.08 },
  { date: '2026-05-07', profit: 156.42, return_rate: 1.04 },
  { date: '2026-05-06', profit: 67.89, return_rate: 0.45 },
  { date: '2026-05-05', profit: -98.21, return_rate: -0.65 },
  { date: '2026-05-04', profit: 203.15, return_rate: 1.35 },
  { date: '2026-05-03', profit: 34.67, return_rate: 0.23 },
  { date: '2026-05-02', profit: -56.43, return_rate: -0.37 },
  { date: '2026-05-01', profit: 178.92, return_rate: 1.19 },
  { date: '2026-04-30', profit: 245.68, return_rate: 1.63 },
];

const MOCK_MONTHLY_DATA = [
  { month: '2026-05', profit: 895.32, return_rate: 5.96, accumulated_profit: 12580.50 },
  { month: '2026-04', profit: 1234.78, return_rate: 8.22, accumulated_profit: 11685.18 },
  { month: '2026-03', profit: -345.67, return_rate: -2.30, accumulated_profit: 10450.40 },
  { month: '2026-02', profit: 678.90, return_rate: 4.52, accumulated_profit: 10796.07 },
  { month: '2026-01', profit: 1122.34, return_rate: 7.47, accumulated_profit: 10117.17 },
  { month: '2025-12', profit: 890.12, return_rate: 5.93, accumulated_profit: 8994.83 },
  { month: '2025-11', profit: -234.56, return_rate: -1.56, accumulated_profit: 8104.71 },
  { month: '2025-10', profit: 1567.89, return_rate: 10.44, accumulated_profit: 8339.27 },
  { month: '2025-09', profit: 445.23, return_rate: 2.96, accumulated_profit: 6771.38 },
  { month: '2025-08', profit: -123.45, return_rate: -0.82, accumulated_profit: 6326.15 },
  { month: '2025-07', profit: 1890.67, return_rate: 12.58, accumulated_profit: 6449.60 },
  { month: '2025-06', profit: 556.78, return_rate: 3.70, accumulated_profit: 4558.93 },
];

const MOCK_YEARLY_DATA = [
  { year: '2026', profit: 895.32, return_rate: 5.96, accumulated_profit: 12580.50 },
  { year: '2025', profit: 8543.21, return_rate: 57.00, accumulated_profit: 11685.18 },
  { year: '2024', profit: 3245.67, return_rate: 21.64, accumulated_profit: 3141.97 },
];

// 日期表格视图粒度：日（日历网格）/ 月（12 月网格）/ 年（多年年度网格）
type CalendarGranularity = 'day' | 'month' | 'year';

// 日期表格视图 Props
interface DateTableViewProps {
  data: { date: string; profit: number; return_rate: number }[];
  monthlyData: { month: string; profit: number; return_rate: number; accumulated_profit?: number }[];
  yearlyData: { year: string; profit: number; return_rate: number; accumulated_profit?: number }[];
  currentMonth: { year: number; month: number };
  currentYear: number;
  granularity: CalendarGranularity;
  onMonthChange: (year: number, month: number) => void;
  onYearChange: (year: number) => void;
  onGranularityChange: (g: CalendarGranularity) => void;
  hideAmount: boolean;
  isLight: boolean;
  isMobile: boolean;
  // 收益率显示切换：false=显示金额，true=显示收益率（由主组件控制）
  showReturnRate: boolean;
  onShowReturnRateChange: (v: boolean) => void;
  selectedDay: string | null;
  selectedMonth: number | null;
  selectedYear: number | null;
  fundBreakdown: { fund_code: string; fund_name: string; profit: number; return_rate: number; market_value: number; total_cost: number }[];
  fundBreakdownLoading: boolean;
  onSelectDay: (date: string) => void;
  onSelectMonth: (month: number) => void;
  onSelectYear: (year: number) => void;
}

// 日期表格视图组件（日历网格 / 年度月份网格 / 多年年度网格）
function DateTableView({ data, monthlyData, yearlyData, currentMonth, currentYear, granularity, onMonthChange, onYearChange, onGranularityChange, hideAmount, isLight, isMobile, showReturnRate, onShowReturnRateChange, selectedDay, selectedMonth, selectedYear, fundBreakdown, fundBreakdownLoading, onSelectDay, onSelectMonth, onSelectYear }: DateTableViewProps) {
  const { year, month } = currentMonth;

  // 根据实际文本长度（含符号与 2 位小数）动态返回字号：短数字更大，长数字自动缩小避免溢出
  // bonus 用于日/月/年视图差异化放大（格子越大 bonus 越大）
  const getDynamicFontSize = (text: string, isMobile: boolean, bonus = 0): number => {
    const len = text.length;
    let size;
    if (len <= 4) size = 15;        // 短数字：+993 / 999
    else if (len <= 6) size = 14;   // +99.45 / -8532
    else if (len <= 8) size = 13;   // +993.45 / -8532.40
    else if (len <= 10) size = 12;  // -8532.40 / +12345.67
    else size = 11;                 // 更长
    size += bonus;
    return isMobile ? size : size + 3;
  };

  // 今天
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const isCurrentYear = today.getFullYear() === currentYear;
  const todayDate = isCurrentMonth ? today.getDate() : -1;
  const currentMonthNum = isCurrentYear ? today.getMonth() + 1 : -1;

  // 年视图（12 月网格）：按月份建立映射
  const monthlyMap = new Map<string, { profit: number; return_rate: number; accumulated_profit?: number }>();
  monthlyData.forEach((m) => {
    if (m && m.month) {
      monthlyMap.set(m.month, { profit: m.profit ?? 0, return_rate: m.return_rate ?? 0, accumulated_profit: m.accumulated_profit });
    }
  });

  // 多年视图：按年份建立映射
  const yearlyMap = new Map<string, { profit: number; return_rate: number; accumulated_profit?: number }>();
  yearlyData.forEach((y) => {
    if (y && y.year) {
      yearlyMap.set(y.year, { profit: y.profit ?? 0, return_rate: y.return_rate ?? 0, accumulated_profit: y.accumulated_profit });
    }
  });

  // 多年视图：显示当前年份前后各 3 年，共 7 年
  const yearStart = currentYear - 3;
  const yearEnd = currentYear + 3;
  const years = Array.from({ length: yearEnd - yearStart + 1 }, (_, i) => yearStart + i);

  // 计算当月1号是星期几（周日=0）
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  // 当月天数
  const daysInMonth = new Date(year, month, 0).getDate();

  // 按日期建立映射
  const dataMap = new Map<string, { profit: number; return_rate: number }>();
  data.forEach((d) => {
    if (d && d.date) {
      dataMap.set(d.date, { profit: d.profit ?? 0, return_rate: d.return_rate ?? 0 });
    }
  });

  // 色块分档（按收益率绝对值）
  const getTier = (returnRate: number): { tier: number; isGain: boolean } | null => {
    if (!returnRate || returnRate === 0) return null;
    const abs = Math.abs(returnRate);
    const isGain = returnRate > 0;
    let tier: number;
    if (abs < 0.5) tier = 1;
    else if (abs < 1) tier = 2;
    else if (abs < 2) tier = 3;
    else tier = 4;
    return { tier, isGain };
  };

  // 获取色块背景色（用 rgba 直接写，不依赖 CSS 变量）
  const getCellBg = (tier: number, isGain: boolean): string => {
    const opacities = [0.18, 0.40, 0.65, 0.90];
    const opacity = opacities[tier - 1];
    if (isGain) {
      return isLight
        ? `rgba(229, 57, 53, ${opacity})`
        : `rgba(239, 68, 68, ${opacity})`;
    } else {
      return isLight
        ? `rgba(67, 160, 71, ${opacity})`
        : `rgba(34, 197, 94, ${opacity})`;
    }
  };

  const getZeroCellBg = (): string => {
    return isLight
      ? 'rgba(148, 163, 184, 0.25)'
      : 'rgba(148, 163, 184, 0.18)';
  };

  // 格式化收益缩略（单元格内显示，保留 2 位小数）
  const formatProfitShort = (profit: number): string => {
    if (hideAmount) return '****';
    const rounded = Math.round(profit * 100) / 100;
    if (rounded === 0) return '+0.00';
    const sign = rounded >= 0 ? '+' : '-';
    return `${sign}${Math.abs(rounded).toFixed(2)}`;
  };

  // 格式化 Tooltip 收益金额
  const formatTooltipProfit = (profit: number): string => {
    if (hideAmount) return '****';
    const sign = profit >= 0 ? '+' : '-';
    return `${sign}¥${Math.abs(profit).toFixed(2)}`;
  };

  // 月份切换
  const goPrevMonth = () => {
    let m = month - 1;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    onMonthChange(y, m);
  };

  const goNextMonth = () => {
    let m = month + 1;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    onMonthChange(y, m);
  };

  const backToCurrentMonth = () => {
    const now = new Date();
    onMonthChange(now.getFullYear(), now.getMonth() + 1);
  };

  // 构建单元格数组
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  // 图例色块
  const legendLossColors = [1, 2, 3, 4].map((t) => getCellBg(t, false));
  const legendGainColors = [1, 2, 3, 4].map((t) => getCellBg(t, true));

  // 日期导航参数（根据粒度统一计算，供第二行导航行使用）
  const goPrev = granularity === 'day'
    ? goPrevMonth
    : granularity === 'month'
      ? () => onYearChange(currentYear - 1)
      : () => onYearChange(currentYear - 7);
  const goNext = granularity === 'day'
    ? goNextMonth
    : granularity === 'month'
      ? () => onYearChange(currentYear + 1)
      : () => onYearChange(currentYear + 7);
  const navTitle = granularity === 'day'
    ? `${year} 年 ${month} 月`
    : granularity === 'month'
      ? `${currentYear} 年`
      : `${yearStart} - ${yearEnd} 年`;
  const isCurrent = granularity === 'day'
    ? isCurrentMonth
    : granularity === 'month'
      ? isCurrentYear
      : (yearStart <= today.getFullYear() && today.getFullYear() <= yearEnd);
  const backToCurrent = granularity === 'day'
    ? backToCurrentMonth
    : () => onYearChange(today.getFullYear());
  const backLabel = granularity === 'day' ? '返回本月' : '返回今年';

  return (
    <div className="date-table-view">
      {/* 第二行：日期导航（居中） */}
      <div className="date-table-header" style={{ justifyContent: 'center', marginBottom: 12 }}>
        <button className="date-table-nav-btn" onClick={goPrev} aria-label="上一个">‹</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span className="date-table-title">{navTitle}</span>
          {!isCurrent && <button className="date-table-back-btn" onClick={backToCurrent}>{backLabel}</button>}
        </div>
        <button className="date-table-nav-btn" onClick={goNext} aria-label="下一个">›</button>
      </div>

      {granularity === 'day' ? (
        <>
          {/* 7 列网格 */}
          <div className="date-table-grid">
            {weekDays.map((d, i) => (
              <div key={`wd-${i}`} className="date-table-weekday">{d}</div>
            ))}
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="date-table-cell empty" />;
              }
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayData = dataMap.get(dateStr);
              const hasRecord = !!dayData;
              const hasData = hasRecord && dayData!.return_rate !== 0;
              const isZero = hasRecord && dayData!.return_rate === 0;
              const tierInfo = hasData ? getTier(dayData!.return_rate) : null;
              const isToday = day === todayDate;

              const cellStyle: React.CSSProperties = {
                background: tierInfo ? getCellBg(tierInfo.tier, tierInfo.isGain) : (isZero ? getZeroCellBg() : 'var(--bg-card)'),
                boxShadow: isToday ? 'inset 0 0 0 2px var(--accent-gold)' : 'none',
              };

              const textColor = tierInfo
                ? (tierInfo.tier === 1 ? (tierInfo.isGain ? 'var(--gain)' : 'var(--loss)') : '#fff')
                : 'var(--text-secondary)';

              const tooltipContent = (
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{dateStr}</div>
                  {dayData ? (
                    <>
                      <div>收益: {formatTooltipProfit(dayData.profit)}</div>
                      <div>收益率: {dayData.return_rate >= 0 ? '+' : ''}{dayData.return_rate.toFixed(2)}%</div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>无数据</div>
                  )}
                </div>
              );

              const cellMainText = hasData
                ? showReturnRate
                  ? `${dayData!.return_rate >= 0 ? '+' : ''}${dayData!.return_rate.toFixed(2)}%`
                  : formatProfitShort(dayData!.profit)
                : '';

              return (
                <Tooltip key={dateStr} title={tooltipContent} placement="top">
                  <div
                    className="date-table-cell"
                    style={{
                      ...cellStyle,
                      outline: selectedDay === dateStr ? '2px solid var(--accent-gold)' : 'none',
                      outlineOffset: selectedDay === dateStr ? 1 : 0,
                      cursor: 'pointer',
                    }}
                    onClick={() => onSelectDay(dateStr)}
                  >
                    <span style={{ fontSize: isMobile ? 16 : 18, fontFamily: 'var(--font-mono)', fontWeight: 600, color: textColor, lineHeight: 1 }}>
                      {day}
                    </span>
                    {hasData && (
                      <span style={{ fontSize: getDynamicFontSize(cellMainText, isMobile, 0), fontFamily: 'var(--font-mono)', fontWeight: 600, color: textColor, lineHeight: 1, marginTop: 2 }}>
                        {cellMainText}
                      </span>
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </>
      ) : granularity === 'month' ? (
        <>
          {/* 月视图：12 个月网格 */}
          {/* 12 个月网格 4x3 */}
          <div className="year-grid-view">
            {Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              const monthKey = `${currentYear}-${String(m).padStart(2, '0')}`;
              const mData = monthlyMap.get(monthKey);
              const hasRecord = !!mData;
              const hasData = hasRecord && mData!.return_rate !== 0;
              const isZero = hasRecord && mData!.return_rate === 0;
              const tierInfo = hasData ? getTier(mData!.return_rate) : null;
              const isThisMonth = m === currentMonthNum;

              const cellStyle: React.CSSProperties = {
                background: tierInfo ? getCellBg(tierInfo.tier, tierInfo.isGain) : (isZero ? getZeroCellBg() : 'var(--bg-card)'),
                boxShadow: isThisMonth ? 'inset 0 0 0 2px var(--accent-gold)' : 'none',
                outline: selectedMonth === m ? '2px solid var(--accent-gold)' : 'none',
                outlineOffset: selectedMonth === m ? 1 : 0,
              };

              const textColor = tierInfo
                ? (tierInfo.tier === 1 ? (tierInfo.isGain ? 'var(--gain)' : 'var(--loss)') : '#fff')
                : 'var(--text-secondary)';

              const tooltipContent = (
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{currentYear} 年 {m} 月</div>
                  {mData ? (
                    <>
                      <div>收益: {formatTooltipProfit(mData.profit)}</div>
                      <div>收益率: {mData.return_rate >= 0 ? '+' : ''}{mData.return_rate.toFixed(2)}%</div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>无数据</div>
                  )}
                </div>
              );

              // 只显示金额或收益率（根据 showReturnRate 切换），不同时显示
              const mainText = !hasData
                ? ''
                : showReturnRate
                  ? `${mData!.return_rate >= 0 ? '+' : ''}${mData!.return_rate.toFixed(2)}%`
                  : formatProfitShort(mData!.profit);

              return (
                <Tooltip key={monthKey} title={tooltipContent} placement="top">
                  <div
                    className="year-grid-cell"
                    style={cellStyle}
                    onClick={() => onSelectMonth(m)}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{m} 月</span>
                    {hasData && (
                      <span style={{ fontSize: getDynamicFontSize(mainText, isMobile, 2), fontFamily: 'var(--font-mono)', fontWeight: 700, color: textColor, marginTop: 4 }}>
                        {mainText}
                      </span>
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* 年视图：多年年度网格（当前年前后各 3 年，共 7 年） */}
          {/* 多年网格 3 列 */}
          <div className="year-grid-view" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {years.map((y) => {
              const yKey = String(y);
              const yData = yearlyMap.get(yKey);
              const hasRecord = !!yData;
              const hasData = hasRecord && yData!.return_rate !== 0;
              const isZero = hasRecord && yData!.return_rate === 0;
              const tierInfo = hasData ? getTier(yData!.return_rate) : null;
              const isThisYear = y === today.getFullYear();

              const cellStyle: React.CSSProperties = {
                background: tierInfo ? getCellBg(tierInfo.tier, tierInfo.isGain) : (isZero ? getZeroCellBg() : 'var(--bg-card)'),
                boxShadow: isThisYear ? 'inset 0 0 0 2px var(--accent-gold)' : 'none',
                outline: selectedYear === y ? '2px solid var(--accent-gold)' : 'none',
                outlineOffset: selectedYear === y ? 1 : 0,
              };

              const textColor = tierInfo
                ? (tierInfo.tier === 1 ? (tierInfo.isGain ? 'var(--gain)' : 'var(--loss)') : '#fff')
                : 'var(--text-secondary)';

              const tooltipContent = (
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{y} 年</div>
                  {yData ? (
                    <>
                      <div>收益: {formatTooltipProfit(yData.profit)}</div>
                      <div>收益率: {yData.return_rate >= 0 ? '+' : ''}{yData.return_rate.toFixed(2)}%</div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>无数据</div>
                  )}
                </div>
              );

              // 只显示金额或收益率（根据 showReturnRate 切换），不同时显示
              const mainText = !hasData
                ? ''
                : showReturnRate
                  ? `${yData!.return_rate >= 0 ? '+' : ''}${yData!.return_rate.toFixed(2)}%`
                  : formatProfitShort(yData!.profit);

              return (
                <Tooltip key={yKey} title={tooltipContent} placement="top">
                  <div
                    className="year-grid-cell"
                    style={cellStyle}
                    onClick={() => onSelectYear(y)}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: textColor }}>{y} 年</span>
                    {hasData && (
                      <span style={{ fontSize: getDynamicFontSize(mainText, isMobile, 3), fontFamily: 'var(--font-mono)', fontWeight: 700, color: textColor, marginTop: 4 }}>
                        {mainText}
                      </span>
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}

      {/* 图例 */}
      <div className="date-table-legend">
        <span>亏损</span>
        <div className="date-table-legend-group">
          {legendLossColors.map((c, i) => (
            <div key={`l-${i}`} className="date-table-legend-block" style={{ background: c }} />
          ))}
        </div>
        <span>无收益</span>
        <div className="date-table-legend-block" style={{ background: getZeroCellBg() }} />
        <span>无</span>
        <div className="date-table-legend-block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }} />
        <span>盈利</span>
        <div className="date-table-legend-group">
          {legendGainColors.map((c, i) => (
            <div key={`g-${i}`} className="date-table-legend-block" style={{ background: c }} />
          ))}
        </div>
      </div>

      {/* 基金收益明细 */}
      <div className="fund-breakdown-section" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--border-subtle)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
          基金收益明细
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            {granularity === 'day'
              ? selectedDay || ''
              : granularity === 'month'
                ? `${currentYear} 年 ${selectedMonth || ''} 月`
                : `${selectedYear || ''} 年`}
          </span>
        </div>
        {fundBreakdownLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : fundBreakdown.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            该周期暂无基金明细数据
          </div>
        ) : (
          <div className="fund-breakdown-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...fundBreakdown]
              .sort((a, b) => showReturnRate ? b.return_rate - a.return_rate : b.profit - a.profit)
              .map((fund) => {
                const isUp = showReturnRate ? fund.return_rate >= 0 : fund.profit >= 0;
                const displayValue = showReturnRate
                  ? `${isUp ? '+' : ''}${fund.return_rate.toFixed(2)}%`
                  : hideAmount
                    ? '****'
                    : `${isUp ? '+' : ''}¥${Math.abs(fund.profit).toFixed(2)}`;
                return (
                  <div
                    key={fund.fund_code}
                    className="fund-breakdown-item"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--bg-card)',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fund.fund_name || fund.fund_code}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {fund.fund_code}
                      </span>
                    </div>
                    <span
                      className="number-tabular"
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                        color: isUp ? 'var(--gain)' : 'var(--loss)',
                        whiteSpace: 'nowrap',
                        marginLeft: 12,
                      }}
                    >
                      {displayValue}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('daily');
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);

  // 视图模式：chart（图表明细）/ date_table（日期表格）
  const [viewMode, setViewMode] = useState<ViewMode>('date_table');
  // 日历粒度：day（日历网格）/ month（12 月网格）/ year（多年年度网格）
  const [calendarGranularity, setCalendarGranularity] = useState<CalendarGranularity>('day');
  // 日历当前月份
  const [currentMonth, setCurrentMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  // 日历当前年份（月/年视图用）
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  // 日历数据（日维度，日视图用）
  const [calendarData, setCalendarData] = useState<{ date: string; profit: number; return_rate: number }[]>([]);
  // 日历数据（月维度，月视图用）
  const [calendarMonthlyData, setCalendarMonthlyData] = useState<{ month: string; profit: number; return_rate: number; accumulated_profit?: number }[]>([]);
  // 日历数据（年维度，年视图用）
  const [calendarYearlyData, setCalendarYearlyData] = useState<{ year: string; profit: number; return_rate: number; accumulated_profit?: number }[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  // 日历视图联动概览卡片的统计数据（date_table 模式专用）
  const [calendarSummary, setCalendarSummary] = useState<any>({});
  // 收益率显示切换：false=显示金额，true=显示收益率（date_table 模式用，提升到主组件以便第一行控件统一控制）
  const [showReturnRate, setShowReturnRate] = useState(false);
  // 日历单元格选中状态
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // 基金明细数据
  const [fundBreakdown, setFundBreakdown] = useState<any[]>([]);
  const [fundBreakdownLoading, setFundBreakdownLoading] = useState(false);

  const formatLargeNumber = (value: number): { text: string; fontSize: number } => {
    const absValue = Math.abs(value);
    let text: string;
    let fontSize: number;

    if (absValue >= 1000000) {
      text = `${(value / 10000).toFixed(2)}万`;
      fontSize = 24;
    } else if (absValue >= 100000) {
      text = `¥${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      fontSize = 20;
    } else if (absValue >= 10000) {
      text = `¥${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      fontSize = 22;
    } else {
      text = `¥${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      fontSize = 24;
    }

    return { text: value >= 0 ? `+${text}` : text.replace('+', ''), fontSize };
  };

  useEffect(() => {
    setLoading(true);
    let promise;
    if (period === 'daily') promise = statsService.getDailyStats();
    else if (period === 'monthly') promise = statsService.getMonthlyStats();
    else promise = statsService.getYearlyStats();

    promise?.then((res) => {
      const list = res.data || res.stats || res || [];
      if (list.length > 0) {
        setData(list);
        calculateSummary(list);
      } else {
        // 无真实数据时显示空状态（不使用mock数据）
        setData([]);
        setSummary({ total_profit: 0, avg_return: 0, max_profit: 0, min_profit: 0, win_rate: 0, data_count: 0 });
      }
    }).catch((err) => {
      console.error('[StatsPage] 加载统计数据失败:', err);
      // 出错时也显示空状态
      setData([]);
      setSummary({ total_profit: 0, avg_return: 0, max_profit: 0, min_profit: 0, win_rate: 0, data_count: 0 });
    }).finally(() => setLoading(false));
  }, [period]);

  // 日期表格数据加载：当 viewMode === 'date_table' 或切换月份/年份/粒度时触发
  useEffect(() => {
    if (viewMode !== 'date_table') return;
    setCalendarLoading(true);
    if (calendarGranularity === 'day') {
      // 日视图：加载当月每日数据
      statsService.getDailyStats({ year: currentMonth.year, month: currentMonth.month })
        .then((res) => {
          const list = res.data || res.stats || res || [];
          const safeList = Array.isArray(list) ? list : [];
          setCalendarData(safeList);
          setCalendarSummary(calculateCalendarSummary(safeList, 'day'));
        })
        .catch((err) => {
          console.error('[StatsPage] 加载日历数据失败:', err);
          setCalendarData([]);
          setCalendarSummary(calculateCalendarSummary([], 'day'));
        })
        .finally(() => setCalendarLoading(false));
    } else if (calendarGranularity === 'month') {
      // 月视图：加载当年月度数据
      statsService.getMonthlyStats({ year: currentYear })
        .then((res) => {
          const list = res.data || res.stats || res || [];
          const safeList = Array.isArray(list) ? list : [];
          setCalendarMonthlyData(safeList);
          setCalendarSummary(calculateCalendarSummary(safeList, 'month'));
        })
        .catch((err) => {
          console.error('[StatsPage] 加载月度数据失败:', err);
          setCalendarMonthlyData([]);
          setCalendarSummary(calculateCalendarSummary([], 'month'));
        })
        .finally(() => setCalendarLoading(false));
    } else {
      // 年视图：加载全部年度数据
      statsService.getYearlyStats()
        .then((res) => {
          const list = res.data || res.stats || res || [];
          const safeList = Array.isArray(list) ? list : [];
          setCalendarYearlyData(safeList);
          setCalendarSummary(calculateCalendarSummary(safeList, 'year'));
        })
        .catch((err) => {
          console.error('[StatsPage] 加载年度数据失败:', err);
          setCalendarYearlyData([]);
          setCalendarSummary(calculateCalendarSummary([], 'year'));
        })
        .finally(() => setCalendarLoading(false));
    }
  }, [viewMode, currentMonth, currentYear, calendarGranularity]);

  // 进入 date_table 模式时初始化选中默认值
  useEffect(() => {
    if (viewMode !== 'date_table') return;
    const now = new Date();
    if (calendarGranularity === 'day' && !selectedDay) {
      setSelectedDay(now.toISOString().slice(0, 10));
    } else if (calendarGranularity === 'month' && !selectedMonth) {
      setSelectedMonth(now.getMonth() + 1);
    } else if (calendarGranularity === 'year' && !selectedYear) {
      setSelectedYear(now.getFullYear());
    }
  }, [viewMode, calendarGranularity]);

  // 加载基金明细数据
  useEffect(() => {
    if (viewMode !== 'date_table') return;

    let params: { date?: string; year?: number; month?: number } | null = null;

    if (calendarGranularity === 'day') {
      if (!selectedDay) return;
      params = { date: selectedDay };
    } else if (calendarGranularity === 'month') {
      if (!selectedMonth) return;
      params = { year: currentYear, month: selectedMonth };
    } else {
      if (!selectedYear) return;
      params = { year: selectedYear };
    }

    setFundBreakdownLoading(true);
    statsService.getFundBreakdown(params)
      .then((data) => {
        setFundBreakdown(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('[StatsPage] 加载基金明细失败:', err);
        setFundBreakdown([]);
      })
      .finally(() => setFundBreakdownLoading(false));
  }, [viewMode, calendarGranularity, selectedDay, selectedMonth, selectedYear, currentYear]);

  // 月份切换回调
  const handleMonthChange = (year: number, month: number) => {
    setCurrentMonth({ year, month });
    // 同步年份，保证年视图与月视图年份一致
    if (year !== currentYear) setCurrentYear(year);
  };

  // 年份切换回调
  const handleYearChange = (year: number) => {
    setCurrentYear(year);
  };

  // 粒度切换回调
  const handleGranularityChange = (g: CalendarGranularity) => {
    setCalendarGranularity(g);
    // 切到月视图时同步 currentYear 与 currentMonth.year
    if (g === 'month') {
      setCurrentYear(currentMonth.year);
    }
    // 重置选中状态为默认值
    const now = new Date();
    if (g === 'day') {
      setSelectedDay(now.toISOString().slice(0, 10));
    } else if (g === 'month') {
      setSelectedMonth(now.getMonth() + 1);
    } else if (g === 'year') {
      setSelectedYear(now.getFullYear());
    }
  };

  const handleSelectDay = (date: string) => setSelectedDay(date);
  const handleSelectMonth = (month: number) => setSelectedMonth(month);
  const handleSelectYear = (year: number) => setSelectedYear(year);

  const useMockData = () => {
    if (period === 'daily') {
      setData(MOCK_DAILY_DATA);
      calculateSummary(MOCK_DAILY_DATA);
    } else if (period === 'monthly') {
      setData(MOCK_MONTHLY_DATA);
      calculateSummary(MOCK_MONTHLY_DATA);
    } else {
      setData(MOCK_YEARLY_DATA);
      calculateSummary(MOCK_YEARLY_DATA);
    }
  };

  const calculateSummary = (list: any[]) => {
    if (list.length === 0) {
      setSummary({ total_profit: 0, avg_return: 0, max_profit: 0, min_profit: 0 });
      return;
    }

    const profits = list.map((d) => d.profit ?? 0);
    const returns = list.map((d) => d.return_rate ?? 0);

    let totalProfit;
    if (period === 'daily') {
      totalProfit = profits.reduce((a, b) => a + b, 0);
    } else {
      totalProfit = list[list.length - 1]?.accumulated_profit ?? profits.reduce((a, b) => a + b, 0);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    const positiveProfits = profits.filter(p => p > 0);
    const negativeProfits = profits.filter(p => p < 0);

    const maxProfit = positiveProfits.length > 0 ? Math.max(...positiveProfits) : 0;
    const minProfit = negativeProfits.length > 0 ? Math.min(...negativeProfits) : 0;

    setSummary({
      total_profit: totalProfit,
      avg_return: avgReturn,
      max_profit: maxProfit,
      min_profit: minProfit,
      win_rate: (profits.filter(p => p >= 0).length / profits.length * 100),
      data_count: list.length,
    });
  };

  // 根据日历视图数据和粒度计算概览卡片所需指标（date_table 模式专用）
  const calculateCalendarSummary = (
    data: any[],
    granularity: CalendarGranularity
  ) => {
    if (!data || data.length === 0) {
      return { total_profit: 0, avg_return: 0, max_profit: 0, min_profit: 0, win_rate: 0, data_count: 0 };
    }
    const profits = data.map(d => d.profit ?? 0);
    const returns = data.map(d => d.return_rate ?? 0);
    const totalProfit = profits.reduce((a, b) => a + b, 0);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const positiveCount = profits.filter(p => p > 0).length;
    const winRate = (positiveCount / profits.length) * 100;
    const maxProfit = Math.max(...profits);
    const minProfit = Math.min(...profits);
    return {
      total_profit: totalProfit,
      avg_return: avgReturn,
      max_profit: maxProfit,
      min_profit: minProfit,
      win_rate: winRate,
      data_count: data.length,
    };
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const themeMode = useThemeStore((s) => s.mode);
  const isLight = themeMode === 'light';
  const hideAmount = useHideAmountStore((s) => s.hidden);

  // 视图模式选项：移动端用图标，桌面端用图标+文字
  const viewModeOptions = isMobile
    ? [{ value: 'chart', label: <BarChartOutlined /> }, { value: 'date_table', label: <CalendarOutlined /> }]
    : [{ value: 'chart', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BarChartOutlined />图表</span> }, { value: 'date_table', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CalendarOutlined />表格</span> }];

  // 统一粒度选项 value（使用 chart 模式的 daily/monthly/yearly）
  const granularityOptions = isMobile
    ? [{ value: 'daily', label: '日' }, { value: 'monthly', label: '月' }, { value: 'yearly', label: '年' }]
    : [{ value: 'daily', label: '日' }, { value: 'monthly', label: '月' }, { value: 'yearly', label: '年' }];

  // 金额/收益率切换选项：移动端用图标，桌面端用图标+文字
  const amountRateOptions = isMobile
    ? [{ value: 'amount', label: <DollarOutlined /> }, { value: 'rate', label: <PercentageOutlined /> }]
    : [{ value: 'amount', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><DollarOutlined />金额</span> }, { value: 'rate', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PercentageOutlined />收益率</span> }];

  // 当前粒度值（统一为 daily/monthly/yearly）
  const currentGranularity = viewMode === 'chart'
    ? period
    : (calendarGranularity === 'day' ? 'daily' : calendarGranularity === 'month' ? 'monthly' : 'yearly');

  // 统一粒度切换处理：根据当前视图模式转换 value
  const handleGranularityChangeUnified = (v: string) => {
    if (viewMode === 'chart') {
      setPeriod(v as Period);
    } else {
      const g = v === 'daily' ? 'day' : v === 'monthly' ? 'month' : 'year';
      handleGranularityChange(g as CalendarGranularity);
    }
  };

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(17, 24,39, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      textStyle: { color: isLight ? '#1E293B' : '#F1F5F9', fontSize: isMobile ? 11 : 13, fontWeight: 500 },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148, 163, 184, 0.05)' } },
      formatter: (params: any) => {
        const p = params[0];
        const value = Number(p.value);
        const isPositive = value >= 0;
        const label = period === 'daily' ? '日期' : period === 'monthly' ? '月份' : '年份';
        if (showReturnRate) {
          return `
            <div style="font-weight: 600; margin-bottom: ${isMobile ? '4px' : '6px'}; color: ${isLight ? '#64748B' : '#94A3B8'}; font-size: ${isMobile ? '12px' : '13px'};">${p.name}</div>
            <div style="color: ${isPositive ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E')}; font-weight: 700; font-size: ${isMobile ? '13px' : '14px'};">
              收益率: ${isPositive ? '+' : ''}${value.toFixed(2)}%
            </div>
          `;
        }
        const unit = period === 'daily' || period === 'monthly' ? '元' : '万元';
        const displayValue = period === 'yearly' ? (value / 10000).toFixed(2) : value.toFixed(2);
        return `
          <div style="font-weight: 600; margin-bottom: ${isMobile ? '4px' : '6px'}; color: ${isLight ? '#64748B' : '#94A3B8'}; font-size: ${isMobile ? '12px' : '13px'};">${p.name}</div>
          <div style="color: ${isPositive ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E')}; font-weight: 700; font-size: ${isMobile ? '13px' : '14px'};">
            收益: ${isPositive ? '+' : ''}${unit === '万元' ? '' : '¥'}${displayValue}${unit}
          </div>
          ${params[1] ? `<div style="color: ${isLight ? '#B8860B' : '#D4A84B'}; margin-top: ${isMobile ? '2px' : '4px'}; font-size: ${isMobile ? '11px' : '12px'};">收益率: ${Number(params[1].value).toFixed(2)}%</div>` : ''}
        `;
      },
    },
    legend: {
      show: !showReturnRate,
      data: ['收益金额', '收益率'],
      top: 0,
      right: isMobile ? 10 : 20,
      textStyle: { color: isLight ? '#64748B' : '#94A3B8', fontSize: isMobile ? 10 : 11 },
      itemWidth: isMobile ? 14 : 16,
      itemHeight: isMobile ? 6 : 8,
      itemGap: isMobile ? 15 : 20,
    },
    xAxis: {
      type: 'category',
      data: data.map((d) =>
        period === 'daily'
          ? d.date?.slice(5)
          : period === 'monthly'
          ? d.month?.slice(5)
          : d.year
      ),
      axisLabel: {
        fontSize: isMobile ? 9 : 11,
        color: isLight ? '#64748B' : '#94A3B8',
        rotate: 0,  // ✅ 不旋转
        interval: isMobile && data.length > 10
          ? Math.floor(data.length / 6)  // ✅ 平均分布，显示约6个标签
          : data.length > 15
            ? Math.floor(data.length / 8)
            : 0,
      },
      axisLine: { lineStyle: { color: isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)' } },
      axisTick: { show: false },
    },
    yAxis: showReturnRate ? [
      {
        type: 'value',
        name: '%',
        position: 'left',
        axisLabel: {
          fontSize: isMobile ? 10 : 11,
          color: isLight ? '#64748B' : '#94A3B8',
          formatter: '{value}%',
        },
        splitLine: { lineStyle: { color: isLight ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)', type: 'dashed' } },
        axisLine: { show: false },
        nameTextStyle: { color: '#64748B', fontSize: isMobile ? 9 : 10, padding: [0, 0, 0, -35] },
      },
    ] : [
      {
        type: 'value',
        name: '收益',
        position: 'left',
        axisLabel: {
          fontSize: isMobile ? 10 : 11,
          color: isLight ? '#64748B' : '#94A3B8',
          formatter: (v: number) => {
            if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}万`;
            return v.toFixed(0);
          },
        },
        splitLine: { lineStyle: { color: isLight ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)', type: 'dashed' } },
        axisLine: { show: false },
        nameTextStyle: { color: '#64748B', fontSize: isMobile ? 9 : 10, padding: [0, 0, 0, -35] },
      },
      {
        type: 'value',
        name: '%',
        position: 'right',
        axisLabel: {
          fontSize: isMobile ? 10 : 11,
          color: isLight ? '#64748B' : '#94A3B8',
          formatter: '{value}%',
        },
        splitLine: { show: false },
        axisLine: { show: false },
        nameTextStyle: { color: '#64748B', fontSize: isMobile ? 9 : 10, padding: [0, -15, 0, 0] },
      },
    ],
    series: showReturnRate ? [
      {
        name: '收益率',
        type: 'bar',
        data: data.map((d) => d.return_rate ?? 0),
        barWidth: isMobile
          ? (period === 'yearly' ? 30 : period === 'monthly' ? 16 : 10)
          : (period === 'yearly' ? 50 : period === 'monthly' ? 24 : 15),
        barGap: isMobile ? '10%' : '5%',
        barCategoryGap: isMobile ? '20%' : '15%',
        itemStyle: {
          borderRadius: [isMobile ? 2 : 3, isMobile ? 2 : 3, 0, 0],
          color: (params: any) => {
            const value = params.value;
            if (value > 0) return {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: isLight ? 'rgba(220, 38, 38, 0.85)' : 'rgba(239, 68, 68, 0.9)' },
                { offset: 1, color: isLight ? 'rgba(220, 38, 38, 0.35)' : 'rgba(239, 68, 68, 0.4)' },
              ],
            };
            if (value < 0) return {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: isLight ? 'rgba(22, 163, 74, 0.35)' : 'rgba(34, 197, 94, 0.4)' },
                { offset: 1, color: isLight ? 'rgba(22, 163, 74, 0.85)' : 'rgba(34, 197, 94, 0.9)' },
              ],
            };
            return 'rgba(148, 163, 184, 0.3)';
          },
        },
      },
    ] : [
      {
        name: '收益金额',
        type: 'bar',
        data: data.map((d) => d.profit ?? 0),
        barWidth: isMobile
          ? (period === 'yearly' ? 30 : period === 'monthly' ? 16 : 10)
          : (period === 'yearly' ? 50 : period === 'monthly' ? 24 : 15),
        barGap: isMobile ? '10%' : '5%',
        barCategoryGap: isMobile ? '20%' : '15%',
        itemStyle: {
          borderRadius: [isMobile ? 2 : 3, isMobile ? 2 : 3, 0, 0],
          color: (params: any) => {
            const value = params.value;
            if (value > 0) return {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: isLight ? 'rgba(220, 38, 38, 0.85)' : 'rgba(239, 68, 68, 0.9)' },
                { offset: 1, color: isLight ? 'rgba(220, 38, 38, 0.35)' : 'rgba(239, 68, 68, 0.4)' },
              ],
            };
            if (value < 0) return {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: isLight ? 'rgba(22, 163, 74, 0.35)' : 'rgba(34, 197, 94, 0.4)' },
                { offset: 1, color: isLight ? 'rgba(22, 163, 74, 0.85)' : 'rgba(34, 197, 94, 0.9)' },
              ],
            };
            return 'rgba(148, 163, 184, 0.3)';
          },
        },
      },
      {
        name: '收益率',
        type: 'line',
        yAxisIndex: 1,
        data: data.map((d) => d.return_rate ?? 0),
        smooth: true,
        symbol: 'circle',
        symbolSize: isMobile ? 4 : 6,
        lineStyle: {
          color: isLight ? '#B8860B' : '#D4A84B',
          width: isMobile ? 1.5 : 2,
        },
        itemStyle: {
          color: isLight ? '#B8860B' : '#D4A84B',
          borderWidth: isMobile ? 1.5 : 2,
          borderColor: '#fff',
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: isLight ? 'rgba(184, 134, 11, 0.2)' : 'rgba(212, 168, 75, 0.25)' },
              { offset: 1, color: isLight ? 'rgba(184, 134, 11, 0.02)' : 'rgba(212, 168, 75, 0.02)' },
            ],
          },
        },
      },
    ],
    grid: {
      top: isMobile ? 25 : 35,
      bottom: isMobile ? (data.length > 20 ? 40 : 30) : 35,
      left: isMobile ? 42 : 55,
      right: isMobile ? 38 : 48,
    },
  };

  const columns = [
    {
      title: period === 'daily' ? '日期' : period === 'monthly' ? '月份' : '年份',
      dataIndex: period === 'daily' ? 'date' : period === 'monthly' ? 'month' : 'year',
      key: 'date',
      width: 110,
      render: (v: string) => (
        <span className="number-tabular" style={{ fontWeight: 500, fontSize: 13 }}>{v}</span>
      ),
    },
    ...(showReturnRate ? [] : [{
      title: '收益金额',
      dataIndex: 'profit',
      key: 'profit',
      width: 130,
      sorter: (a: any, b: any) => (a.profit ?? 0) - (b.profit ?? 0),
      render: (v: number) => {
        const isUp = (v ?? 0) >= 0;
        return (
          <span
            className="number-tabular"
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: isUp ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {isUp ? '+' : ''}{hideAmount ? '****' : `¥${(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        );
      },
    }]),
    ...(showReturnRate ? [{
      title: '收益率',
      dataIndex: 'return_rate',
      key: 'return_rate',
      width: 110,
      sorter: (a: any, b: any) => (a.return_rate ?? 0) - (b.return_rate ?? 0),
      render: (v: number) => {
        const isUp = (v ?? 0) >= 0;
        return (
          <span
            className="number-tabular"
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: isUp ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {isUp ? '+' : ''}{(v ?? 0).toFixed(2)}%
          </span>
        );
      },
    }] : []),
    ...(period !== 'daily' && !showReturnRate ? [{
      title: '累计收益',
      dataIndex: 'accumulated_profit',
      key: 'accumulated_profit',
      width: 140,
      render: (v: number) => {
        const isUp = (v ?? 0) >= 0;
        return (
          <span
            className="number-tabular"
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: isUp ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {isUp ? '+' : ''}{hideAmount ? '****' : `¥${(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        );
      },
    }] : []),
  ];

  // 概览卡片数据源：date_table 模式使用日历视图联动统计，chart 模式使用全局 summary
  const activeSummary = viewMode === 'date_table' ? calendarSummary : summary;
  const activePeriod: Period = viewMode === 'date_table'
    ? (calendarGranularity === 'day' ? 'daily' : calendarGranularity === 'month' ? 'monthly' : 'yearly')
    : period;
  // 粒度对应的中文单位字符（日/月/年）
  const periodUnitChar = activePeriod === 'daily' ? '日' : activePeriod === 'monthly' ? '月' : '年';

  // 概览卡片指标项配置
  const overviewItems = [
    {
      label: `总${periodUnitChar}收益`,
      value: hideAmount ? '****' : formatLargeNumber(activeSummary.total_profit ?? 0).text,
      fontSize: formatLargeNumber(activeSummary.total_profit ?? 0).fontSize,
      color: (activeSummary.total_profit ?? 0) >= 0 ? 'gain' : 'loss',
    },
    {
      label: '平均收益率',
      value: `${(activeSummary.avg_return ?? 0) >= 0 ? '+' : ''}${(activeSummary.avg_return ?? 0).toFixed(2)}%`,
      fontSize: 24,
      color: 'gold',
    },
    {
      label: '盈利概率',
      value: `${(activeSummary.win_rate ?? 0).toFixed(1)}%`,
      fontSize: 20,
      color: (activeSummary.win_rate ?? 0) >= 50 ? 'gain' : 'loss',
    },
    {
      label: `最大单${periodUnitChar}盈利`,
      value: `${(activeSummary.max_profit ?? 0) > 0 ? '+' : ''}${hideAmount ? '****' : `¥${Math.abs(activeSummary.max_profit ?? 0).toFixed(2)}`}`,
      fontSize: 20,
      color: 'gain',
    },
    {
      label: `最大单${periodUnitChar}亏损`,
      value: `${(activeSummary.min_profit ?? 0) < 0 ? '-' : ''}${hideAmount ? '****' : `¥${Math.abs(activeSummary.min_profit ?? 0).toFixed(2)}`}`,
      fontSize: 20,
      color: 'loss',
    },
    {
      label: '数据条数',
      value: `${activeSummary.data_count ?? 0}`,
      fontSize: 20,
      color: 'neutral',
      unit: activePeriod === 'daily' ? '天' : activePeriod === 'monthly' ? '月' : '年',
    },
  ];

  const colorMap: Record<string, string> = {
    gain: 'var(--gain)',
    loss: 'var(--loss)',
    gold: 'var(--accent-gold)',
    neutral: 'var(--text-primary)',
  };

  return (
    <div className="stats-page-container" style={{ padding: '20px 16px', paddingBottom: 100 }}>
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          .stats-page-container {
            padding-left: 0 !important;
            padding-right: 0 !important;
          }

          .stats-page-title {
            font-size: clamp(18px, 5vw, 22px) !important;
            margin-bottom: 16px !important;
            padding: 0 4px !important;
          }

          .stats-summary-card > .ant-card-body {
            padding: 12px 10px !important;
          }

          .stats-overview-grid {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 6px !important;
          }

          .stats-overview-item {
            min-height: 58px !important;
            padding: 8px 6px 6px !important;
            border-radius: 8px !important;
          }

          .stats-overview-item .stats-item-label {
            font-size: 9px !important;
            margin-bottom: 2px !important;
            letter-spacing: 0.02em !important;
          }

          .stats-overview-item .stats-item-value {
            font-size: clamp(11px, 3vw, 14px) !important;
            white-space: normal !important;
            word-break: break-all !important;
            line-height: 1.2 !important;
          }

          /* 单位字号在移动端缩小 */
          .stats-overview-item .stats-item-value .stats-item-unit {
            font-size: 9px !important;
          }

          .stats-segmented-wrapper {
            margin-bottom: 12px !important;
            padding: 0 4px !important;
          }

          .stats-segmented-wrapper .ant-segmented {
            height: 36px !important;
          }

          .stats-segmented-wrapper .ant-segmented-item {
            font-size: clamp(11px, 2.8vw, 13px) !important;
            padding: 0 8px !important;
          }

          /* 第一行控件并排容器：移动端紧凑显示（缩宽不降高） */
          .stats-controls-row .ant-segmented {
            font-size: 12px;
          }

          .stats-controls-row .ant-segmented-item {
            padding: 0 4px !important;
            min-height: 28px !important;
            line-height: 28px !important;
            border-radius: 8px !important;
            min-width: 32px !important;
          }

          .stats-controls-row .ant-segmented-item .anticon {
            font-size: 14px !important;
          }

          .stats-controls-row .ant-segmented-item-selected {
            font-weight: 500;
          }

          .stats-controls-row .ant-segmented-thumb {
            border-radius: 8px !important;
          }

          .stats-chart-card {
            margin-bottom: 16px !important;
          }

          .stats-chart-card > .ant-card-body {
            padding: 16px 8px !important;
          }

          .stats-chart-container {
            height: clamp(260px, 45vw, 320px) !important;
            width: 100% !important;
            overflow: hidden !important;
          }

          .stats-chart-container canvas,
          .stats-chart-container div[data-zr-dom-id] {
            max-width: 100% !important;
            touch-action: pan-y !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          .stats-table-card {
            margin-bottom: 16px !important;
          }

          .stats-table-card > .ant-card-header {
            padding: 12px 16px !important;
          }

          .stats-table-card .ant-card-head-title {
            font-size: clamp(14px, 3.5vw, 16px) !important;
          }

          .stats-table-card .ant-table {
            font-size: clamp(11px, 2.8vw, 13px) !important;
          }

          .stats-table-card .ant-table-thead > tr > th {
            padding: 10px 8px !important;
            font-size: clamp(11px, 2.5vw, 12px) !important;
            background: var(--bg-elevated) !important;
          }

          .stats-table-card .ant-table-tbody > tr > td {
            padding: 8px 6px !important;
            font-size: clamp(11px, 2.8vw, 13px) !important;
          }

          .stats-table-card .number-tabular {
            font-size: clamp(10px, 2.5vw, 12px) !important;
            white-space: nowrap !important;
          }

          .stats-page-container {
            padding: 12px 8px !important;
            padding-bottom: 80px !important;
          }

          /* 日期表格移动端样式 */
          .date-table-view {
            padding: 0 4px;
          }

          .date-table-header {
            flex-wrap: wrap;
            gap: 8px;
          }

          .date-table-grid {
            grid-template-columns: repeat(7, minmax(36px, 1fr));
            overflow-x: auto;
          }

          .date-table-cell {
            min-width: 36px;
          }

          .year-grid-view {
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
          }

          .year-grid-cell {
            min-height: 70px;
            padding: 10px 6px;
          }

          .date-table-legend {
            flex-wrap: wrap;
            gap: 6px;
            font-size: 10px;
          }

          .fund-breakdown-item {
            padding: 6px 8px !important;
          }

          .fund-breakdown-item span:first-child {
            font-size: 12px !important;
          }
        }
      `}</style>

      {/* 页面标题 */}
      <div className="stats-page-title" style={{
        fontSize: 22,
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: 20,
        letterSpacing: '-0.01em',
      }}>
        收益统计
      </div>

      {/* 美化后的统计概览卡片 */}
      <Card
        className="stats-summary-card"
        style={{
          marginBottom: 20,
          background: isLight
            ? 'linear-gradient(135deg, rgba(46, 139, 123, 0.04), rgba(255, 255, 255, 0.9))'
            : 'linear-gradient(135deg, rgba(212, 168, 75, 0.05), rgba(17, 24, 39, 0.8))',
          borderColor: isLight ? 'rgba(46, 139, 123, 0.12)' : 'rgba(212, 168, 75, 0.15)',
          boxShadow: 'var(--shadow-lg)',
        }}
        styles={{ body: { padding: '20px' } }}
      >
        {viewMode === 'date_table' && calendarLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
        <div className="stats-overview-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}>
          {overviewItems.map((item, idx) => (
            <div key={idx} className="stats-overview-item" style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 10,
              padding: '12px',
              minHeight: 84,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}>
              <div className="stats-item-label" style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                {item.label}
              </div>
              <div className="stats-item-value number-tabular" style={{
                fontSize: isMobile ? Math.min(item.fontSize, 16) : item.fontSize,
                fontWeight: 800,
                color: colorMap[item.color],
                fontFamily: 'var(--font-mono)',
                letterSpacing: '-0.02em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.value}
                {item.unit && (
                  <span className="stats-item-unit" style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>
                    {item.unit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        )}
      </Card>

      {/* 第一行：控件并排（组合背景容器，左/中/右分布） */}
      <div className="stats-controls-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: isMobile ? 6 : 24, flexWrap: 'nowrap', marginBottom: 16, padding: isMobile ? '5px 7px' : '10px 18px', background: isLight ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.1)', borderRadius: 16, maxWidth: '680px', margin: '0 auto 16px' }}>
        {/* 柱状图/表格切换（两种模式都显示） */}
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          size={isMobile ? 'small' : 'large'}
          options={viewModeOptions}
        />
        {/* 粒度/周期选择器（两种模式都显示，value 统一为 daily/monthly/yearly） */}
        <Segmented
          value={currentGranularity}
          onChange={(v) => handleGranularityChangeUnified(v as string)}
          size={isMobile ? 'small' : 'large'}
          options={granularityOptions}
        />
        {/* 金额/收益率切换（两种模式都显示） */}
        <Segmented
          value={showReturnRate ? 'rate' : 'amount'}
          onChange={(v) => setShowReturnRate(v === 'rate')}
          size={isMobile ? 'small' : 'large'}
          options={amountRateOptions}
        />
      </div>

      {/* 内容区域：根据视图模式渲染 */}
      {viewMode === 'chart' ? (
        <>
          {/* 图表和表格区域 */}
          {loading ? (
            <Skeleton active paragraph={{ rows: 10 }} />
          ) : data.length === 0 ? (
            <Empty
              description={
                <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                  暂无收益数据
                </span>
              }
              style={{ marginTop: 80 }}
            />
          ) : (
            <>
              {/* 图表卡片 */}
              <Card
                className="stats-chart-card"
                style={{
                  marginBottom: 20,
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
                styles={{
                  body: { padding: '20px 16px' },
                }}
              >
                <ReactECharts option={chartOption} style={{ height: 'clamp(280px, 50vw, 380px)' }} className="stats-chart-container" opts={{ renderer: 'canvas' }} />
              </Card>

              {/* 数据表格 */}
              <Card
                className="stats-table-card"
                title={
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                    明细数据
                  </span>
                }
                style={{
                  background: 'var(--bg-elevated)',
                  borderColor: 'var(--border-subtle)',
                }}
                styles={{
                  header: {
                    borderBottom: '1px solid var(--border-subtle)',
                    padding: '16px 20px',
                  },
                  body: { padding: '0' },
                }}
              >
                <Table
                  dataSource={[...data].reverse()}
                  columns={columns}
                  rowKey={(record) => {
                    const keyValue = record.date || record.month || record.year;
                    if (keyValue) return String(keyValue);
                    const fallbackKey = `row-${Math.random().toString(36).substr(2, 9)}`;
                    Object.defineProperty(record, '_fallbackKey', { value: fallbackKey, enumerable: false });
                    return fallbackKey;
                  }}
                  pagination={false}
                  size="middle"
                  scroll={{ x: period === 'daily' ? 400 : 550 }}
                  locale={{
                    emptyText: (
                      <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                        暂无数据
                      </div>
                    ),
                  }}
                />
              </Card>
            </>
          )}
        </>
      ) : (
          /* 日期表格模式 */
          <Card
            className="stats-date-table-card"
            style={{
              background: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              maxWidth: '720px',
              margin: '0 auto',
            }}
            styles={{ body: { padding: '20px' } }}
          >
            {calendarLoading ? (
              <Skeleton active paragraph={{ rows: 8 }} />
            ) : (
              <DateTableView
                data={calendarData}
                monthlyData={calendarMonthlyData}
                yearlyData={calendarYearlyData}
                currentMonth={currentMonth}
                currentYear={currentYear}
                granularity={calendarGranularity}
                onMonthChange={handleMonthChange}
                onYearChange={handleYearChange}
                onGranularityChange={handleGranularityChange}
                hideAmount={hideAmount}
                isLight={isLight}
                isMobile={isMobile}
                showReturnRate={showReturnRate}
                onShowReturnRateChange={setShowReturnRate}
                selectedDay={selectedDay}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                fundBreakdown={fundBreakdown}
                fundBreakdownLoading={fundBreakdownLoading}
                onSelectDay={handleSelectDay}
                onSelectMonth={handleSelectMonth}
                onSelectYear={handleSelectYear}
              />
            )}
          </Card>
        )}

      {/* 日期表格组件样式 */}
      <style>{`
        .date-table-view {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
        }
        /* 第一行控件现代简约样式：组合背景容器 */
        .stats-controls-row {
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
        }
        .stats-controls-row .ant-segmented {
          background: var(--bg-elevated);
          border-radius: 12px;
          padding: 2px;
        }
        .stats-controls-row .ant-segmented-item {
          border-radius: 10px;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .stats-controls-row .ant-segmented-item-selected {
          background: var(--accent-gold);
          color: #fff;
          box-shadow: 0 2px 6px rgba(212, 160, 23, 0.25);
          font-weight: 500;
        }
        .stats-controls-row .ant-segmented-thumb {
          border-radius: 10px;
          background: var(--accent-gold);
          box-shadow: 0 2px 6px rgba(212, 160, 23, 0.25);
        }
        .stats-controls-row .ant-segmented-item .anticon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .date-table-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .date-table-nav-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .date-table-nav-btn:hover {
          background: var(--bg-input);
          border-color: var(--accent-gold);
          color: var(--accent-gold);
        }
        .date-table-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }
        .date-table-back-btn {
          font-size: 11px;
          color: var(--accent-gold);
          padding: 4px 12px;
          border-radius: 999px;
          background: var(--accent-gold-dim);
          border: 0;
          cursor: pointer;
          font-family: inherit;
          font-weight: 500;
          transition: all 0.15s ease;
        }
        .date-table-back-btn:hover {
          background: var(--accent-gold);
          color: #fff;
        }
        .date-table-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .date-table-weekday {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          padding: 6px 0 8px;
          font-weight: 500;
          letter-spacing: 0.04em;
        }
        .date-table-cell {
          aspect-ratio: 1 / 1;
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          cursor: pointer;
          transition: transform 0.12s ease, border-color 0.12s ease;
          border: 1px solid transparent;
          position: relative;
        }
        .date-table-cell:hover {
          transform: scale(1.08);
          border-color: var(--border-default);
          z-index: 2;
          box-shadow: var(--shadow-soft);
        }
        .date-table-cell.empty {
          background: transparent;
          cursor: default;
        }
        .date-table-cell.empty:hover {
          transform: none;
          border-color: transparent;
          box-shadow: none;
        }
        /* 年视图 12 月网格 */
        .year-grid-view {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .year-grid-cell {
          border-radius: 8px;
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.12s ease, border-color 0.12s ease;
          border: 1px solid transparent;
          min-height: 80px;
        }
        .year-grid-cell:hover {
          transform: scale(1.04);
          border-color: var(--border-default);
          z-index: 2;
          box-shadow: var(--shadow-soft);
        }
        .date-table-legend {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px dashed var(--border-subtle);
          font-size: 11px;
          color: var(--text-tertiary);
        }
        .date-table-legend-group {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .date-table-legend-block {
          width: 14px;
          height: 14px;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}