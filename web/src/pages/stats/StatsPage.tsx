import { useState, useEffect } from 'react';
import { Card, Segmented, Table, Skeleton, Empty } from 'antd';
import ReactECharts from 'echarts-for-react';
import { statsService } from '@/services/statsService';
import { useThemeStore } from '@/store/themeStore';

type Period = 'daily' | 'monthly' | 'yearly';

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

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('daily');
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);

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

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const themeMode = useThemeStore((s) => s.mode);
  const isLight = themeMode === 'light';

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
    yAxis: [
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
    series: [
      {
        name: '收益金额',
        type: 'bar',
        data: data.map((d) => d.profit ?? 0),
        barWidth: isMobile
          ? (period === 'yearly' ? 30 : period === 'monthly' ? 16 : 10)   // ✅ 柱子变窄
          : (period === 'yearly' ? 50 : period === 'monthly' ? 24 : 15), // ✅ 柱子变窄
        barGap: isMobile ? '10%' : '5%',    // ✅ 柱子之间增加间距
        barCategoryGap: isMobile ? '20%' : '15%',  // ✅ 类别之间的间距
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
      left: isMobile ? 42 : 55,   // ✅ 左边距，显示左侧Y轴
      right: isMobile ? 38 : 48,   // ✅ 增加右边距，显示右侧Y轴
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
    {
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
            {isUp ? '+' : ''}¥{(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      },
    },
    {
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
    },
    ...(period !== 'daily' ? [{
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
            {isUp ? '+' : ''}¥{(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      },
    }] : []),
  ];

  return (
    <div className="stats-page-container" style={{ padding: '20px 16px', paddingBottom: 100 }}>
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          /* 页面标题优化 */
          .stats-page-title {
            font-size: clamp(18px, 5vw, 22px) !important;
            margin-bottom: 16px !important;
            padding: 0 4px !important;
          }

          /* 统计概览卡片 - 网格布局优化 */
          .stats-summary-card > .ant-card-body {
            padding: 16px 12px !important;
          }

          .stats-summary-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }

          /* 统计数据项 - 字体和间距优化 */
          .stats-item-label {
            font-size: clamp(10px, 2.5vw, 12px) !important;
            margin-bottom: 4px !important;
          }

          .stats-item-value {
            font-size: clamp(16px, 4.5vw, 24px) !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          /* 时间周期选择器 */
          .stats-segmented-wrapper {
            margin-bottom: 16px !important;
            padding: 0 4px !important;
          }

          .stats-segmented-wrapper .ant-segmented {
            height: 36px !important;
          }

          .stats-segmented-wrapper .ant-segmented-item {
            font-size: clamp(11px, 2.8vw, 13px) !important;
            padding: 0 8px !important;
          }

          /* 图表卡片优化 */
          .stats-chart-card {
            margin-bottom: 16px !important;
          }

          .stats-chart-card > .ant-card-body {
            padding: 16px 8px !important;
          }

          /* 图表容器和 Canvas 优化 */
          .stats-chart-container {
            height: clamp(260px, 45vw, 320px) !important;
            width: 100% !important;
            overflow: hidden !important;
          }

          /* Canvas 元素本身优化 */
          .stats-chart-container canvas,
          .stats-chart-container div[data-zr-dom-id] {
            max-width: 100% !important;
            touch-action: pan-y !important; /* 允许垂直滚动，禁止水平手势 */
            -webkit-tap-highlight-color: transparent !important;
          }

          /* ECharts tooltip 移动端优化 */
          .stats-chart-container .echarts-tooltip {
            font-size: 11px !important;
            padding: 6px 10px !important;
            border-radius: var(--radius-sm) !important;
          }

          /* 数据表格卡片 */
          .stats-table-card {
            margin-bottom: 16px !important;
          }

          .stats-table-card > .ant-card-header {
            padding: 12px 16px !important;
          }

          .stats-table-card .ant-card-head-title {
            font-size: clamp(14px, 3.5vw, 16px) !important;
          }

          /* 表格本身优化 */
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

          /* 表格数字字体优化 */
          .stats-table-card .number-tabular {
            font-size: clamp(10px, 2.5vw, 12px) !important;
            white-space: nowrap !important;
          }

          /* 整体页面间距优化 */
          .stats-page-container {
            padding: 12px 8px !important;
            padding-bottom: 80px !important;
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

      {/* 统计概览卡片 */}
      <Card
        className="stats-summary-card"
        style={{
          marginBottom: 20,
          background: isLight ? 'linear-gradient(135deg, rgba(184, 134, 11, 0.04), rgba(255, 255, 255, 0.9))' : 'linear-gradient(135deg, rgba(212, 168, 75, 0.05), rgba(17, 24, 39, 0.8))',
          borderColor: isLight ? 'rgba(184, 134, 11, 0.12)' : 'rgba(212, 168, 75, 0.15)',
          boxShadow: 'var(--shadow-lg)',
        }}
        styles={{ body: { padding: '24px' } }}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 20,
        }} className="stats-summary-grid">
          <div>
            <div className="stats-item-label" style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              总{period === 'daily' ? '日' : period === 'monthly' ? '月' : '年'}收益
            </div>
            <div className="stats-item-value number-tabular" style={{
              fontSize: formatLargeNumber(summary.total_profit ?? 0).fontSize,
              fontWeight: 800,
              color: (summary.total_profit ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {formatLargeNumber(summary.total_profit ?? 0).text}
            </div>
          </div>

          <div>
            <div className="stats-item-label" style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              平均收益率
            </div>
            <div className="stats-item-value number-tabular" style={{
              fontSize: 24,
              fontWeight: 800,
              color: 'var(--accent-gold)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {(summary.avg_return ?? 0) >= 0 ? '+' : ''}{(summary.avg_return ?? 0).toFixed(2)}%
            </div>
          </div>

          <div>
            <div className="stats-item-label" style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              最大单日盈利
            </div>
            <div className="stats-item-value number-tabular" style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--gain)',
              fontFamily: 'var(--font-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {(summary.max_profit ?? 0) > 0 ? '+' : ''}¥{Math.abs(summary.max_profit ?? 0).toFixed(2)}
            </div>
          </div>

          <div>
            <div className="stats-item-label" style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              最大单日亏损
            </div>
            <div className="stats-item-value number-tabular" style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--loss)',
              fontFamily: 'var(--font-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {(summary.min_profit ?? 0) < 0 ? '-' : ''}¥{Math.abs(summary.min_profit ?? 0).toFixed(2)}
            </div>
          </div>

          <div>
            <div className="stats-item-label" style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              盈利概率
            </div>
            <div className="stats-item-value number-tabular" style={{
              fontSize: 20,
              fontWeight: 700,
              color: (summary.win_rate ?? 0) >= 50 ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {(summary.win_rate ?? 0).toFixed(1)}%
            </div>
          </div>

          <div>
            <div className="stats-item-label" style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              数据条数
            </div>
            <div className="stats-item-value number-tabular" style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {summary.data_count ?? 0}
              <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>
                {period === 'daily' ? '天' : period === 'monthly' ? '月' : '年'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* 时间周期选择器 */}
      <div className="stats-segmented-wrapper" style={{ marginBottom: 20 }}>
        <Segmented
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          size="large"
          block
          options={[
            { value: 'daily', label: '📊 日收益' },
            { value: 'monthly', label: '📈 月收益' },
            { value: 'yearly', label: '📉 年收益' },
          ]}
        />
      </div>

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
    </div>
  );
}
