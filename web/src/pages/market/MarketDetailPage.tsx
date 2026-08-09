import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Skeleton, Segmented } from 'antd';
import { ArrowLeftOutlined, RiseOutlined, FallOutlined, LineChartOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fetchIndexData, fetchIntradayData, ALL_INDEX_META, type IntradayData } from '@/services/indexService';
import { useThemeStore } from '@/store/themeStore';

interface IndexItem {
  code: string;
  name: string;
  nameShort: string;
  point: number;
  change: number;
  changePercent: number;
}

type IndexCode = string;

// 将后端返回的 '0930' / '09:30' 统一格式化为 'HH:MM'，并只在交易关键时点显示，
// 避免 240+ 个分钟标签全部堆叠导致重叠。
const xAxisTimeFormatter = (value: string): string => {
  if (!value) return value;
  const norm = value.includes(':') ? value.replace(':', '') : value;
  if (norm.length < 4) return value;
  const hh = norm.slice(0, 2);
  const mm = norm.slice(2, 4);
  const minutes = parseInt(mm, 10);
  if (Number.isNaN(minutes)) return value;
  // 关键时点：开盘 09:30 / 上午收盘 11:30 / 下午开盘 13:00 / 收盘 15:00
  const isKey = norm === '0930' || norm === '1130' || norm === '1300' || norm === '1500';
  if (isKey || minutes === 0 || minutes === 30) return `${hh}:${mm}`;
  return '';
};

// A 股完整交易时段刻度（含午休缺口），用于盘中固定显示 09:30–15:00 全刻度。
// 返回 'HHMM' 格式数组（与主源 tencent_minute 一致；xAxisTimeFormatter 兼容带冒号的降级数据）。
const buildFullTradingGrid = (code: string): string[] | null => {
  const aShare = ['000001', '000016', '399001', '399006', '000300', '000688', '399673', '000905', '000852'];
  if (!aShare.includes(code)) return null; // 港股/美股跨午休或跨午夜，沿用后端原始数据
  const sessions: [string, string][] = [['0930', '1130'], ['1300', '1500']];
  const grid: string[] = [];
  for (const [start, end] of sessions) {
    let t = start;
    while (t <= end) {
      grid.push(t);
      const hh = parseInt(t.slice(0, 2), 10);
      const mm = parseInt(t.slice(2, 4), 10);
      const total = hh * 60 + mm + 1;
      t = `${String(Math.floor(total / 60)).padStart(2, '0')}${String(total % 60).padStart(2, '0')}`;
    }
  }
  return grid;
};

// 午间休市分隔线位置：A股 11:30 午休，港股 12:00 午休，美股等无午休返回 null
const getLunchBreak = (code: string): string | null => {
  const hk = ['HSI', 'HSTECH', 'HSCEI'];
  const aShare = ['000001', '000016', '399001', '399006', '000300', '000688', '399673', '000905', '000852'];
  if (hk.includes(code)) return '1200';
  if (aShare.includes(code)) return '1130';
  return null;
};

export default function MarketDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') || '000001';

  const [selectedIndex, setSelectedIndex] = useState<IndexCode>(initialCode);
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [intradayData, setIntradayData] = useState<IntradayData | null>(null);
  const [intradayLoading, setIntradayLoading] = useState(false);

  useEffect(() => {
    loadIndexData();
    const timer = setInterval(loadIndexData, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedIndex) {
      loadIntradayData(selectedIndex);
    }
  }, [selectedIndex]);

  const loadIndexData = async () => {
    try {
      const data = await fetchIndexData(ALL_INDEX_META.map(m => m.code));
      setIndices(data);
    } catch (e) {
      console.error('Failed to fetch index data:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadIntradayData = async (code: string) => {
    setIntradayLoading(true);
    try {
      console.log(`📡 Fetching intraday data for: ${code}`);
      const data = await fetchIntradayData(code);
      console.log(`📊 Intraday data received:`, data);
      if (data && data.prices && data.prices.length > 0) {
        setIntradayData(data);
        console.log(`✅ Intraday data set: ${data.prices.length} points from ${data.source}`);
      } else {
        console.warn(`⚠️ Invalid intraday data received:`, data);
        setIntradayData(null);
      }
    } catch (e) {
      console.error('❌ Failed to fetch intraday data:', e);
      setIntradayData(null);
    } finally {
      setIntradayLoading(false);
    }
  };

  const currentIndex = indices.find(i => i.code === selectedIndex) || indices[0];
  const isUp = currentIndex ? (currentIndex.change ?? 0) >= 0 : true;

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const themeMode = useThemeStore((s) => s.mode);
  const isLight = themeMode === 'light';

  const getSourceLabel = (source?: string) => {
    const sourceMap: Record<string, string> = {
      'tencent_minute': '📊 腾讯财经·分时数据',
      'eastmoney_minute': '📊 东方财富·分钟K线',
      'sina_kline': '📈 新浪财经·K线',
      'sina_minute_api': '⏱️ 新浪财经·分钟数据',
      'tencent_history': '📉 腾讯财经·历史K线',
      'tencent_snapshot_realparams': '⚠️ 模拟数据(非真实行情)',
      'realtime_params_fallback': '⚠️ 模拟数据(降级生成)',
      'unknown': '❓ 数据源未知'
    };
    return sourceMap[source || ''] || sourceMap['unknown'];
  };

  // 将收到的（盘中可能截断的）分时数据映射到固定全天刻度网格，未来时段留空，
  // 实现「盘中固定显示 09:30–15:00 全刻度、曲线只填到当前、右侧留白」。
  const isIntradayAvailable = !!(intradayData && intradayData.prices && intradayData.prices.length > 0);
  const fullGrid = buildFullTradingGrid(selectedIndex);
  let displayTimes: string[] = [];
  let displayPrices: (number | null)[] = [];
  let realPointCount = 0;
  if (isIntradayAvailable) {
    if (fullGrid) {
      const priceByTime = new Map<string, number>();
      intradayData!.times.forEach((t, i) => priceByTime.set(t.replace(':', ''), intradayData!.prices[i]));
      displayTimes = fullGrid;
      displayPrices = fullGrid.map((t) => {
        const v = priceByTime.get(t);
        return v === undefined ? null : v;
      });
      realPointCount = priceByTime.size;
    } else {
      displayTimes = intradayData!.times;
      displayPrices = intradayData!.prices;
      realPointCount = intradayData!.prices.length;
    }
  }

  // —— 派生量价坐标：昨收基准、成交量副图数据、曲线末端最新价 ——
  const prevClose = currentIndex
    ? Number((currentIndex.point - currentIndex.change).toFixed(2))
    : (displayPrices[0] ?? 0);
  const hasVolume = !!(
    intradayData &&
    Array.isArray(intradayData.volumes) &&
    intradayData.volumes.length === displayTimes.length &&
    intradayData.volumes.some((v) => v > 0)
  );
  // 成交量跟随价格按同一 fullGrid 映射，保证午休缺口对齐
  let displayVolumes: (number | null)[] = [];
  if (isIntradayAvailable && intradayData && intradayData.volumes) {
    if (fullGrid) {
      const volByTime = new Map<string, number>();
      intradayData.volumes.forEach((v, i) => volByTime.set(intradayData!.times[i].replace(':', ''), v));
      displayVolumes = fullGrid.map((t) => {
        const v = volByTime.get(t);
        return v === undefined ? 0 : v;
      });
    } else {
      displayVolumes = intradayData.volumes;
    }
  }
  // 曲线末端最后一个有效点，用于"最新价"标签坐标（避免未来空时段拖到图最右）
  let lastValidIndex = -1;
  let lastValidPrice = 0;
  displayPrices.forEach((p, i) => {
    if (p != null && !Number.isNaN(p)) {
      lastValidIndex = i;
      lastValidPrice = p;
    }
  });

  const chartOption = {
    backgroundColor: 'transparent',
    // 多 grid 时同步 x 轴十字光标（主图与副图联动）
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      // 移动端用 touchstart 触发，十字跟手
      triggerOn: isMobile ? 'mousemove|touchstart|click' : 'mousemove',
      backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(17, 24, 39, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      padding: [isMobile ? 8 : 10, isMobile ? 12 : 14],
      textStyle: { color: isLight ? '#1E293B' : '#F1F5F9', fontSize: isMobile ? 11 : 13 },
      axisPointer: {
        type: 'cross',
        snap: true,
        crossStyle: { color: isLight ? 'rgba(100,116,139,0.45)' : 'rgba(148,163,184,0.45)', type: 'dashed', width: 1 },
        lineStyle: { color: isLight ? 'rgba(100,116,139,0.45)' : 'rgba(148,163,184,0.45)', type: 'dashed', width: 1 },
        label: { backgroundColor: isLight ? '#475569' : '#334155', color: '#fff', fontSize: isMobile ? 10 : 12, borderColor: 'transparent' },
        z: 100,
      },
      formatter: (params: any) => {
        const p = params[0];
        if (!intradayData || !intradayData.prices || intradayData.prices.length === 0) {
          return `<div style="color: #94A3B8;">暂无分时数据</div>`;
        }

        const currentPrice = p.value;
        if (currentPrice == null || Number.isNaN(currentPrice)) {
          return `<div style="color: #94A3B8;">尚未走到的时段</div>`;
        }
        const basePrice = intradayData.prices[0];
        const changePercent = ((currentPrice - basePrice) / basePrice * 100).toFixed(2);
        const changeAmount = (currentPrice - basePrice).toFixed(2);

        return `<div style="min-width: ${isMobile ? '140px' : '160px'};">
          <div style="font-weight: 600; margin-bottom: ${isMobile ? '4px' : '6px'}; font-size: ${isMobile ? '12px' : '13px'}; color: ${isLight ? '#64748B' : '#94A3B8'};">${p.name}</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: ${isLight ? '#64748B' : '#94A3B8'};">指数点位</span>
            <span style="color: ${isUp ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E')}; font-weight: 700; font-size: ${isMobile ? '13px' : '14px'};">${currentPrice}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: ${isLight ? '#64748B' : '#94A3B8'};">涨跌额</span>
            <span style="color: ${Number(changeAmount) >= 0 ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E')}; font-weight: 600;">${Number(changeAmount) >= 0 ? '+' : ''}${changeAmount}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: ${isLight ? '#64748B' : '#94A3B8'};">涨跌幅</span>
            <span style="color: ${Number(changePercent) >= 0 ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E')}; font-weight: 600;">${Number(changePercent) >= 0 ? '+' : ''}${changePercent}%</span>
          </div>
        </div>`;
      },
    },
    xAxis: [
      {
        type: 'category',
        boundaryGap: false,
        gridIndex: 0,
        data: displayTimes.length ? displayTimes : ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00'],
        // 有副图时主图隐藏时间标签，避免与下方副图重复
        axisLabel: hasVolume ? { show: false } : {
          fontSize: isMobile ? 10 : 11,
          color: isLight ? '#64748B' : '#94A3B8',
          hideOverlap: true,
          showMinLabel: true,
          showMaxLabel: true,
          interval: 0,
          formatter: xAxisTimeFormatter,
        },
        axisLine: { lineStyle: { color: isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)' } },
        axisTick: { show: false },
      },
      ...(hasVolume ? [{
        type: 'category',
        boundaryGap: false,
        gridIndex: 1,
        data: displayTimes.length ? displayTimes : ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00'],
        axisLabel: { fontSize: isMobile ? 10 : 11, color: isLight ? '#64748B' : '#94A3B8', hideOverlap: true, showMinLabel: true, showMaxLabel: true, interval: 0, formatter: xAxisTimeFormatter },
        axisLine: { lineStyle: { color: isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)' } },
        axisTick: { show: false },
      }] : []),
    ],
    yAxis: [
      {
        type: 'value',
        scale: true,
        gridIndex: 0,
        // 方案二：y 轴刻度移回绘图区外侧(硬隔离)，左侧留出窄槽，折线永远不碰刻度
        splitNumber: isMobile ? 4 : 5,
        axisLabel: {
          inside: false,
          fontSize: isMobile ? 9 : 11,
          color: isLight ? (isMobile ? '#475569' : '#64748B') : (isMobile ? '#CBD5E1' : '#94A3B8'),
          margin: isMobile ? 6 : 8,
          // y 轴刻度不显示小数位(去掉 .00 噪声)，整数更清爽
          formatter: (v: number) => v.toFixed(0),
        },
        // 整列淡色刻度带（替代每个值独立气泡），移动端成片更整洁
        splitArea: {
          show: isMobile,
          areaStyle: { color: ['transparent', isLight ? 'rgba(148,163,184,0.05)' : 'rgba(148,163,184,0.045)'] },
        },
        splitLine: { lineStyle: { color: isLight ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)' } },
        axisLine: { show: false },
      },
      ...(hasVolume ? [{
        type: 'value',
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      }] : []),
    ],
    series: [
      {
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: displayPrices.length ? displayPrices : [],
        smooth: false,
        step: false,
        symbol: 'circle',
        symbolSize: isMobile ? 4 : 6,
        showSymbol: false,
        hoverAnimation: true,
        emphasis: {
          focus: 'series',
          scale: true,
          itemStyle: {
            shadowBlur: 10,
            shadowColor: isUp ? (isLight ? 'rgba(220, 38, 38, 0.4)' : 'rgba(239, 68, 68, 0.5)') : (isLight ? 'rgba(22, 163, 74, 0.4)' : 'rgba(34, 197, 94, 0.5)'),
          }
        },
        markPoint: displayPrices.length ? {
          symbol: 'circle',
          symbolSize: isMobile ? 6 : 8,
          data: [
            {
              type: 'max',
              name: '最高',
              itemStyle: { color: isUp ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E'), borderColor: '#fff', borderWidth: 2 },
              label: { show: true, fontSize: isMobile ? 9 : 11, color: isUp ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E'), fontWeight: 600, formatter: '{b}\n{c}' },
            },
            {
              type: 'min',
              name: '最低',
              itemStyle: { color: isUp ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E'), borderColor: '#fff', borderWidth: 2 },
              label: { show: true, fontSize: isMobile ? 9 : 11, color: isUp ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E'), fontWeight: 600, formatter: '{b}\n{c}' },
            },
            // 曲线末端"最新价"标签：贴在最后一个有效点，带涨跌色背景
            ...(lastValidIndex >= 0 ? [{
              coord: [lastValidIndex, lastValidPrice],
              value: lastValidPrice.toFixed(2),
              symbol: 'circle',
              symbolSize: 0,
              label: {
                show: true,
                // 手机端改为图内浮标(insideTop)，并左移避免标签在右缘被裁切；桌面端仍贴右外侧
                position: isMobile ? 'insideTop' : 'right',
                offset: isMobile ? [-24, 0] : [0, 0],
                formatter: '{c}',
                backgroundColor: isUp ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E'),
                color: '#fff', fontSize: isMobile ? 10 : 11, padding: [2, 5], borderRadius: 3, fontWeight: 600,
              },
            }] : []),
          ],
        } : undefined,
        // 昨收基准线（虚线 + "昨收"标注）+ 午休分隔线
        markLine: displayPrices.length ? {
          symbol: 'none',
          silent: true,
          lineStyle: { color: isLight ? 'rgba(100,116,139,0.55)' : 'rgba(148,163,184,0.5)', type: 'dashed', width: 1 },
          data: [
            ...(getLunchBreak(initialCode) ? [{ xAxis: getLunchBreak(initialCode), label: { show: false } }] : []),
            {
              yAxis: prevClose,
              label: { show: true, position: isMobile ? 'insideStartTop' : 'insideEndTop', formatter: `昨收 ${prevClose.toFixed(2)}`, fontSize: isMobile ? 9 : 10, color: isLight ? '#64748B' : '#94A3B8' },
            },
          ],
        } : undefined,
        // 以昨收为界：上方淡红、下方淡绿，直观区分高于/低于昨收
        markArea: displayPrices.length ? {
          silent: true,
          data: [
            [{ yAxis: prevClose, itemStyle: { color: isLight ? 'rgba(220,38,38,0.04)' : 'rgba(239,68,68,0.05)' } }, { yAxis: 'max' }],
            [{ yAxis: 'min', itemStyle: { color: isLight ? 'rgba(22,163,74,0.04)' : 'rgba(34,197,94,0.05)' } }, { yAxis: prevClose }],
          ],
        } : undefined,
        lineStyle: {
          color: isUp ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E'),
          width: isMobile ? 2 : 2.5,
          shadowColor: isUp ? (isLight ? 'rgba(220, 38, 38, 0.2)' : 'rgba(239, 68, 68, 0.3)') : (isLight ? 'rgba(22, 163, 74, 0.2)' : 'rgba(34, 197, 94, 0.3)'),
          shadowBlur: isMobile ? 6 : 10,
          shadowOffsetY: isMobile ? 3 : 5,
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: isUp ? (isLight ? 'rgba(220, 38, 38, 0.2)' : 'rgba(239, 68, 68, 0.25)') : (isLight ? 'rgba(22, 163, 74, 0.2)' : 'rgba(34, 197, 94, 0.25)') },
              { offset: 0.5, color: isUp ? (isLight ? 'rgba(220, 38, 38, 0.06)' : 'rgba(239, 68, 68, 0.08)') : (isLight ? 'rgba(22, 163, 74, 0.06)' : 'rgba(34, 197, 94, 0.08)') },
              { offset: 1, color: isUp ? (isLight ? 'rgba(220, 38, 38, 0.01)' : 'rgba(239, 68, 68, 0.01)') : (isLight ? 'rgba(22, 163, 74, 0.01)' : 'rgba(34, 197, 94, 0.01)') },
            ],
          },
        },
      },
      ...(hasVolume ? [{
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: displayVolumes.map((v, i) => {
          const p = displayPrices[i];
          const up = p == null ? isUp : p >= prevClose;
          return {
            value: v ?? 0,
            itemStyle: { color: up ? (isLight ? 'rgba(220,38,38,0.45)' : 'rgba(239,68,68,0.5)') : (isLight ? 'rgba(22,163,74,0.45)' : 'rgba(34,197,94,0.5)') },
          };
        }),
        barWidth: '55%',
        large: true,
      }] : []),
    ],
    grid: [
      {
        top: isMobile ? 16 : 25,
        // 有副图时主图底部用百分比锚定(32%)，与下方副图恒留 2% 分隔缝，
        // 避免不同机型高度下主图底边压到副图时间轴导致折线/x轴相交
        bottom: isMobile ? (hasVolume ? '32%' : (displayTimes.length > 10 ? 52 : 32)) : (hasVolume ? 95 : 45),
        // 手机端 y 轴左槽收窄到 36px：刻度已改为整数显示(如3900)更短，留出更少左留白但仍不裁切
        left: isMobile ? 36 : 65,
        // 手机端 right 压到 8px：末端"最新价"标签改为图内浮标(insideTop+左移)，不再占用右侧整列
        right: isMobile ? 8 : 25,
        containLabel: false,
      },
      ...(hasVolume ? [{
        // 手机端 y 轴左槽收窄到 36px：刻度已改为整数显示(如3900)更短，留出更少左留白但仍不裁切
        left: isMobile ? 36 : 65,
        right: isMobile ? 8 : 25,
        // 副图顶边 70% 低于主图底边 68%，天然分隔；bottom 28px 稳定容纳时间轴标签
        top: isMobile ? '70%' : '72%',
        bottom: isMobile ? 28 : 34,
        containLabel: false,
      }] : []),
    ],
  };

  if (loading) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 16px', paddingBottom: 100 }}>
      {/* 顶部导航栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 24,
        padding: '12px 4px',
      }}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => navigate(-1)}
          style={{
            fontSize: 18,
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-md)',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-card)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        />
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text-primary)',
          flex: 1,
          letterSpacing: '-0.01em',
        }}>
          大盘走势
        </h1>
      </div>

      {/* 指数选择器 */}
      <div style={{ marginBottom: 20 }}>
        <Segmented
          value={selectedIndex}
          onChange={(v) => setSelectedIndex(v as IndexCode)}
          size="middle"
          style={{ width: '100%', overflowX: 'auto' }}
          options={ALL_INDEX_META.map(meta => ({
            value: meta.code,
            label: meta.nameShort,
          }))}
        />
      </div>

      {/* 核心数据卡片 */}
      <Card
        style={{
          marginBottom: 20,
          background: `linear-gradient(135deg, ${isUp ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.05)'}, ${isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(17, 24, 39, 0.8)'})`,
          borderColor: isUp ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
          boxShadow: 'var(--shadow-lg)',
        }}
        styles={{ body: { padding: '24px' } }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <LineChartOutlined />
              {currentIndex?.name || '指数'}
            </div>
            <div className="number-tabular" style={{
              fontSize: 32,
              fontWeight: 800,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.02em',
            }}>
              {currentIndex?.point?.toFixed(2) || '--'}
            </div>
          </div>
          <div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {isUp ? <RiseOutlined /> : <FallOutlined />}
              涨跌幅
            </div>
            <div className="number-tabular" style={{
              fontSize: 32,
              fontWeight: 800,
              color: isUp ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.02em',
            }}>
              {isUp ? '+' : ''}{(currentIndex?.changePercent ?? 0).toFixed(2)}%
            </div>
          </div>

          {/* 额外指标 */}
          <div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              涨跌点数
            </div>
            <div className="number-tabular" style={{
              fontSize: 18,
              fontWeight: 700,
              color: isUp ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
            }}>
              {isUp ? '+' : ''}{(currentIndex?.change ?? 0).toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              更新时间
            </div>
            <div className="number-tabular" style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </Card>

      {/* 走势图 */}
      <Card
        style={{
          marginBottom: 20,
          // 手机端让走势图卡片破出页面左右 padding，整屏通栏，消除图表到屏幕边缘的多重留白
          marginLeft: isMobile ? -16 : undefined,
          marginRight: isMobile ? -16 : undefined,
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
        styles={{
          body: { padding: isMobile ? '16px 0' : '20px 16px' },
        }}
      >
        <div style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          分时走势
          {intradayLoading && (
            <span style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              fontWeight: 400,
            }}>
              更新中...
            </span>
          )}
          {intradayData && !intradayLoading && intradayData.prices && intradayData.prices.length > 0 && (
            <>
              <span style={{
                fontSize: 11,
                color: '#22C55E',
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'var(--loss-bg)',
                border: '1px solid var(--loss-border)',
              }}>
                {realPointCount} 个数据点
              </span>
              <span style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                fontWeight: 400,
                padding: '2px 6px',
                borderRadius: '8px',
                background: 'rgba(148, 163, 184, 0.08)',
              }}>
                {getSourceLabel(intradayData.source)}
              </span>
            </>
          )}
        </div>
        {intradayLoading && !intradayData ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : intradayData && intradayData.prices && intradayData.prices.length > 0 ? (
          <ReactECharts option={chartOption} style={{ height: hasVolume ? 'clamp(300px, 60vw, 480px)' : 'clamp(260px, 46vw, 380px)' }} opts={{ renderer: 'canvas' }} />
        ) : (
          <div style={{
            height: 'clamp(240px, 42vw, 360px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 14,
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--border-default)',
          }}>
            暂无分时数据
          </div>
        )}
      </Card>

      {/* 其他指数概览 */}
      <Card
        title={
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            其他指数
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
          body: { padding: '12px 16px' },
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {indices.filter(i => i.code !== selectedIndex).map((item) => {
            const itemIsUp = (item.change ?? 0) >= 0;
            return (
              <div
                key={item.code}
                onClick={() => setSelectedIndex(item.code)}
                style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: itemIsUp ? 'var(--gain-bg)' : 'var(--loss-bg)',
                  border: `1px solid ${itemIsUp ? 'var(--gain-border)' : 'var(--loss-border)'}`,
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6 }}>
                  {item.name}
                </div>
                <div className="number-tabular" style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  marginBottom: 4,
                }}>
                  {item.point?.toFixed(2) || '--'}
                </div>
                <div className="number-tabular" style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: itemIsUp ? 'var(--gain)' : 'var(--loss)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {itemIsUp ? '+' : ''}{item.changePercent?.toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
