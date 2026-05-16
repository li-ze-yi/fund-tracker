import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Skeleton, Segmented } from 'antd';
import { ArrowLeftOutlined, RiseOutlined, FallOutlined, LineChartOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fetchIndexData, fetchIntradayData, ALL_INDEX_META } from '@/services/indexService';

interface IndexItem {
  code: string;
  name: string;
  nameShort: string;
  point: number;
  change: number;
  changePercent: number;
}

type IndexCode = string;

export default function MarketDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') || '000001';

  const [selectedIndex, setSelectedIndex] = useState<IndexCode>(initialCode);
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [intradayData, setIntradayData] = useState<{ times: string[]; prices: number[]; source?: string; pointCount?: number } | null>(null);
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

  const getSourceLabel = (source?: string) => {
    const sourceMap: Record<string, string> = {
      'eastmoney_minute': '📊 东方财富·分钟K线',
      'sina_kline': '📈 新浪财经·K线',
      'sina_minute_api': '⏱️ 新浪财经·分钟数据',
      'tencent_history': '📉 腾讯财经·历史K线',
      'tencent_snapshot_realparams': '🎯 腾讯财经·实时参数',
      'realtime_params_fallback': '🔄 实时参数生成',
      'unknown': '❓ 数据源未知'
    };
    return sourceMap[source || ''] || sourceMap['unknown'];
  };

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(17, 24, 39, 0.95)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      padding: [isMobile ? 8 : 10, isMobile ? 12 : 14],
      textStyle: { color: '#F1F5F9', fontSize: isMobile ? 11 : 13 },
      axisPointer: {
        type: 'cross',
        crossStyle: {
          color: 'rgba(148, 163, 184, 0.2)',
        },
        lineStyle: {
          color: 'rgba(148, 163, 184, 0.3)',
          type: 'dashed',
        }
      },
      formatter: (params: any) => {
        const p = params[0];
        if (!intradayData || !intradayData.prices || intradayData.prices.length === 0) {
          return `<div style="color: #94A3B8;">暂无分时数据</div>`;
        }

        const currentPrice = p.value;
        const basePrice = intradayData.prices[0];
        const changePercent = ((currentPrice - basePrice) / basePrice * 100).toFixed(2);
        const changeAmount = (currentPrice - basePrice).toFixed(2);

        return `<div style="min-width: ${isMobile ? '140px' : '160px'};">
          <div style="font-weight: 600; margin-bottom: ${isMobile ? '4px' : '6px'}; font-size: ${isMobile ? '12px' : '13px'}; color: #94A3B8;">${p.name}</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: #94A3B8;">指数点位</span>
            <span style="color: ${isUp ? '#EF4444' : '#22C55E'}; font-weight: 700; font-size: ${isMobile ? '13px' : '14px'};">${currentPrice}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span style="color: #94A3B8;">涨跌额</span>
            <span style="color: ${Number(changeAmount) >= 0 ? '#EF4444' : '#22C55E'}; font-weight: 600;">${Number(changeAmount) >= 0 ? '+' : ''}${changeAmount}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #94A3B8;">涨跌幅</span>
            <span style="color: ${Number(changePercent) >= 0 ? '#EF4444' : '#22C55E'}; font-weight: 600;">${Number(changePercent) >= 0 ? '+' : ''}${changePercent}%</span>
          </div>
        </div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: intradayData?.times?.length ? intradayData!.times : ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00'],
      axisLabel: {
        fontSize: isMobile ? 10 : 11,
        color: '#94A3B8',
        interval: isMobile ? 2 : 0,
        rotate: isMobile ? 45 : 0,
      },
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.15)' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        fontSize: isMobile ? 10 : 11,
        color: '#94A3B8',
        formatter: (v: number) => v.toFixed(2),
      },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.08)' } },
      axisLine: { show: false },
    },
    series: [{
      type: 'line',
      data: intradayData?.prices?.length ? intradayData!.prices : [],
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
          shadowColor: isUp ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.5)',
        }
      },
      markPoint: intradayData?.prices?.length ? {
        symbol: 'circle',
        symbolSize: isMobile ? 6 : 8,
        data: [
          {
            type: 'max',
            name: '最高',
            itemStyle: {
              color: isUp ? '#EF4444' : '#22C55E',
              borderColor: '#fff',
              borderWidth: 2,
            },
            label: {
              show: true,
              fontSize: isMobile ? 9 : 11,
              color: isUp ? '#EF4444' : '#22C55E',
              fontWeight: 600,
              formatter: '{b}\n{c}',
            }
          },
          {
            type: 'min',
            name: '最低',
            itemStyle: {
              color: isUp ? '#EF4444' : '#22C55E',
              borderColor: '#fff',
              borderWidth: 2,
            },
            label: {
              show: true,
              fontSize: isMobile ? 9 : 11,
              color: isUp ? '#EF4444' : '#22C55E',
              fontWeight: 600,
              formatter: '{b}\n{c}',
            }
          },
        ],
      } : undefined,
      lineStyle: {
        color: isUp ? '#EF4444' : '#22C55E',
        width: isMobile ? 2 : 2.5,
        shadowColor: isUp ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)',
        shadowBlur: isMobile ? 6 : 10,
        shadowOffsetY: isMobile ? 3 : 5,
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: isUp ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 197, 94, 0.25)' },
            { offset: 0.5, color: isUp ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)' },
            { offset: 1, color: isUp ? 'rgba(239, 68, 68, 0.01)' : 'rgba(34, 197, 94, 0.01)' },
          ],
        },
      },
    }],
    grid: {
      top: isMobile ? 20 : 25,
      bottom: isMobile ? (intradayData?.times?.length && intradayData!.times.length > 10 ? 55 : 35) : 45,
      left: isMobile ? 50 : 65,
      right: isMobile ? 15 : 25
    },
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
          background: `linear-gradient(135deg, ${isUp ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.05)'}, rgba(17, 24, 39, 0.8))`,
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
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
        styles={{
          body: { padding: '20px 16px' },
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
                {intradayData.pointCount || intradayData.prices.length} 个数据点
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
          <ReactECharts option={chartOption} style={{ height: 'clamp(240px, 42vw, 360px)' }} opts={{ renderer: 'canvas' }} />
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
