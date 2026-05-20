import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Table, Tag, Segmented, Skeleton, App, Space } from 'antd';
import { ArrowLeftOutlined, StarOutlined, StarFilled, PlusOutlined, MinusOutlined, ScheduleOutlined, DeleteOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fundService } from '@/services/fundService';
import { transactionService } from '@/services/transactionService';
import { favoriteService } from '@/services/favoriteService';
import { useThemeStore } from '@/store/themeStore';
import BuyModal from '@/components/modals/BuyModal';
import SellModal from '@/components/modals/SellModal';
import CreatePlanModal from '@/components/modals/CreatePlanModal';

type Period = '1w' | '1m' | '3m' | '6m' | '1y' | 'all';

export default function FundDetailPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [fund, setFund] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [navHistory, setNavHistory] = useState<any[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [period, setPeriod] = useState<Period>('3m');
  const [loading, setLoading] = useState(true);
  const [dataUpdateTime, setDataUpdateTime] = useState<string>('');

  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);

  const loadNavHistory = async (p: Period, fundCode: string) => {
    const now = new Date();
    let start = new Date();
    switch (p) {
      case '1w': start.setDate(now.getDate() - 7); break;
      case '1m': start.setMonth(now.getMonth() - 1); break;
      case '3m': start.setMonth(now.getMonth() - 3); break;
      case '6m': start.setMonth(now.getMonth() - 6); break;
      case '1y': start.setFullYear(now.getFullYear() - 1); break;
      case 'all': start = new Date('2000-01-01'); break;
    }
    const s = start.toISOString().slice(0, 10);
    const e = now.toISOString().slice(0, 10);
    try {
      const timestamp = Date.now();
      const data = await fundService.getHistoryNav(fundCode, s, e, timestamp);
      setNavHistory(data.records || data || []);
      setDataUpdateTime(now.toLocaleString('zh-CN'));
    } catch (error) {
      console.error('获取历史净值失败:', error);
      setNavHistory([]);
    }
  };

  const loadData = async () => {
    if (!code) return;
    setLoading(true);
    try {
      const fundData = await fundService.getFundInfo(code);
      setFund(fundData);
      setIsFavorite(!!fundData.is_favorite);

      try {
        const txData = await transactionService.getTransactions(code);
        console.log('[DEBUG] 原始交易数据:', JSON.stringify(txData, null, 2));
        if (txData.transactions && txData.transactions.length > 0) {
          console.log('[DEBUG] 第一条交易的日期:', txData.transactions[0].transaction_date);
        }
        setTransactions(txData.transactions || txData || []);
      } catch {}

      await loadNavHistory(period, code);
    } catch {
      message.error('获取基金信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [code]);

  useEffect(() => {
    if (code) loadNavHistory(period, code);
  }, [period, code]);

  const toggleFavorite = async () => {
    if (!code) return;
    try {
      if (isFavorite) {
        await favoriteService.removeFavorite(code);
        message.success('已取消自选');
      } else {
        await favoriteService.addFavorite(code);
        message.success('已加入自选');
      }
      setIsFavorite(!isFavorite);
    } catch {
      message.error('操作失败');
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    try {
      await transactionService.deleteTransaction(id);
      message.success('删除成功');
      loadData(); // 刷新数据
    } catch (error: any) {
      message.error(error?.response?.data?.message || '删除失败');
    }
  };

  /**
   * 将净值数据转换为累计收益率百分比
   * @param navHistory 净值历史数据数组（注意：API返回的是从新到旧的降序）
   * @returns 转换后的百分比数据、起始净值、排序后的日期数组和排序后的原始数据
   */
  const convertToPercentage = (history: any[]) => {
    if (!history || history.length === 0) return { percentageData: [], baseNav: 0, sortedDates: [], sortedHistory: [] };

    const sortedHistory = [...history].reverse(); // 反转为从旧到新的升序
    const firstNav = sortedHistory[0]?.nav || sortedHistory[0]?.net_value || sortedHistory[0]?.净值 || 1;
    const baseNav = Number(firstNav) || 1;

    const percentageData = sortedHistory.map((d: any) => {
      const currentNav = d.nav || d.net_value || d.净值 || baseNav;
      const percentage = ((Number(currentNav) - baseNav) / baseNav) * 100;
      return parseFloat(percentage.toFixed(2));
    });

    const sortedDates = sortedHistory.map((d: any) => d.date || d.日期);

    return { percentageData, baseNav, sortedDates, sortedHistory };
  };

  // 获取转换后的百分比数据
  const { percentageData, baseNav, sortedDates, sortedHistory } = convertToPercentage(navHistory);

  /**
   * 根据时间周期获取X轴标签配置
   * @returns X轴配置对象（interval和formatter）
   */
  const getXAxisConfig = () => {
    const lastIndex = sortedDates.length - 1;
    const lastDate = sortedDates[lastIndex] || '';

    switch (period) {
      case '1w':
        // 近1周：每天显示日期
        return {
          interval: 0,
          formatter: (value: string) => {
            if (value === lastDate) { // 最后一天特殊标记
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}今天`;
            }
            const date = new Date(value);
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            return `${date.getMonth() + 1}/${date.getDate()}周${weekdays[date.getDay()]}`;
          },
        };
      case '1m':
        // 近1月：每隔3天显示，末尾必显示
        return {
          interval: 3,
          formatter: (value: string) => {
            if (value === lastDate) {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}今天`;
            }
            const date = new Date(value);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          },
        };
      case '3m':
        // 近3月：每周或每两周显示，末尾必显示
        return {
          interval: 5,
          formatter: (value: string) => {
            if (value === lastDate) {
              const date = new Date(value);
              return `${date.getMonth() + 1}/${date.getDate()}今天`;
            }
            const date = new Date(value);
            if (date.getDate() <= 5) { // 月初
              return `${date.getMonth() + 1}月`;
            }
            return `${date.getMonth() + 1}/${date.getDate()}`;
          },
        };
      case '6m':
        // 近6月：每两周或每月初显示，末尾必显示
        return {
          interval: 5,
          formatter: (value: string) => {
            if (value === lastDate) {
              const date = new Date(value);
              return `${date.getMonth() + 1}月今天`;
            }
            const date = new Date(value);
            if (date.getDate() <= 7) { // 月初显示月份
              return `${date.getMonth() + 1}月`;
            }
            return `${date.getMonth() + 1}/${date.getDate()}`;
          },
        };
      case '1y':
        // 近1年：智能去重月份，末尾必显示，格式统一
        return {
          interval: 8,
          formatter: ((lastMonth: number | null = null) => {
            return (value: string) => {
              if (value === lastDate) { // 强制显示最后日期
                const date = new Date(value);
                return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
              }
              const date = new Date(value);
              const currentMonth = date.getMonth();
              if (currentMonth !== lastMonth) { // 如果是新的月份就显示
                lastMonth = currentMonth;
                // 统一使用 YYYY-MM 格式
                return `${date.getFullYear()}-${(currentMonth + 1).toString().padStart(2, '0')}`;
              }
              return ''; // 同一月份不再重复显示
            };
          })(),
        };
      case 'all':
        // 全部：均等分布显示标签
        return {
          interval: 'auto', // 使用auto让ECharts自动计算
          formatter: ((lastIndex: number = -1, step: number = 0) => {
            // 计算均等分布的步长：总数据量 / 目标标签数（约8-10个）
            const targetLabels = 8;
            step = Math.max(1, Math.floor(sortedDates.length / targetLabels));
            lastIndex = -1;
            return (value: string, index: number) => {
              // 均等分布：每隔step个显示一个
              const shouldShow = index === 0 || index === sortedDates.length - 1 || 
                               (lastIndex === -1 || index - lastIndex >= step);
              if (shouldShow) {
                lastIndex = index;
                const date = new Date(value);
                return `${date.getFullYear()}年`;
              }
              return '';
            };
          })(),
        };
      default:
        return { interval: 'auto' as const, formatter: undefined };
    }
  };

  const xAxisConfig = getXAxisConfig();

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const themeMode = useThemeStore((s) => s.mode);
  const isLight = themeMode === 'light';

  const txColumns = [
    {
      title: '日期',
      dataIndex: 'transaction_date',
      key: 'date',
      width: isMobile ? 80 : 100,
      render: (v: string | Date) => {
        let dateStr = '';
        
        // 处理JavaScript Date对象
        if (v instanceof Date) {
          const year = v.getFullYear();
          const month = String(v.getMonth() + 1).padStart(2, '0');
          const day = String(v.getDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        } 
        // 处理字符串格式
        else if (typeof v === 'string' && v) {
          // 移除时间部分和T分隔符
          dateStr = v.split('T')[0].split(' ')[0];
        }
        
        return <span className="number-tabular" style={{ fontSize: isMobile ? 11 : 13 }}>{dateStr || ''}</span>;
      },
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: isMobile ? 50 : 70,
      render: (t: string) => (
        <Tag
          style={{
            fontWeight: 600,
            borderRadius: 6,
            padding: isMobile ? '1px 6px' : '2px 10px',
            fontSize: isMobile ? 9 : 12,
            background: t === 'buy' ? 'var(--gain-bg)' : 'var(--loss-bg)',
            color: t === 'buy' ? 'var(--gain)' : 'var(--loss)',
            border: `1px solid ${t === 'buy' ? 'var(--gain-border)' : 'var(--loss-border)'}`,
          }}
        >
          {t === 'buy' ? '买入' : '卖出'}
        </Tag>
      ),
    },
    {
      title: '份额',
      dataIndex: 'shares',
      key: 'shares',
      width: isMobile ? undefined : 120,
      render: (v: any) => {
        const num = Number(v || 0);
        let displayNum: string;
        let fontSize: number;
        
        if (num >= 1000000) {
          displayNum = (num / 1000000).toFixed(2) + '百万';
          fontSize = isMobile ? 10 : 12;
        } else if (num >= 100000) {
          displayNum = num.toLocaleString(undefined, { maximumFractionDigits: 0 });
          fontSize = isMobile ? 10 : 12;
        } else if (num >= 10000) {
          displayNum = num.toLocaleString(undefined, { maximumFractionDigits: 1 });
          fontSize = isMobile ? 11 : 12;
        } else {
          displayNum = num.toLocaleString(undefined, { maximumFractionDigits: 2 });
          fontSize = isMobile ? 11 : 13;
        }
        
        return (
          <span 
            className="number-tabular" 
            style={{ 
              fontSize: fontSize,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              display: 'inline-block'
            }}
            title={num.toLocaleString()}
          >
            {displayNum}
          </span>
        );
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: isMobile ? undefined : 120,
      render: (v: any) => {
        const num = Number(v || 0);
        let displayNum: string;
        let fontSize: number;
        
        if (num >= 1000000) {
          displayNum = '¥' + (num / 1000000).toFixed(2) + '百万';
          fontSize = isMobile ? 10 : 12;
        } else if (num >= 100000) {
          displayNum = '¥' + num.toLocaleString(undefined, { maximumFractionDigits: 0 });
          fontSize = isMobile ? 10 : 12;
        } else if (num >= 10000) {
          displayNum = '¥' + num.toLocaleString(undefined, { maximumFractionDigits: 1 });
          fontSize = isMobile ? 11 : 12;
        } else {
          displayNum = '¥' + num.toLocaleString();
          fontSize = isMobile ? 11 : 13;
        }
        
        return (
          <span 
            className="number-tabular" 
            style={{ 
              fontSize: fontSize, 
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
              display: 'inline-block'
            }}
            title={'¥' + num.toLocaleString()}
          >
            {displayNum}
          </span>
        );
      },
    },
    // 手机端隐藏净值列
    ...(isMobile ? [] : [{
      title: '净值',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (v: any) => <span className="number-tabular" style={{ fontSize: 13 }}>{Number(v || 0).toFixed(4)}</span>,
    }]),
    {
      title: '操作',
      key: 'action',
      width: isMobile ? 45 : 70,
      align: 'center',
      render: (_: any, record: any) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          size={isMobile ? 'small' : 'small'}
          onClick={() => {
            modal.confirm({
              title: '确认删除',
              content: `确定要删除这条${record.type === 'buy' ? '买入' : '卖出'}记录吗？`,
              okText: '删除',
              cancelText: '取消',
              okType: 'danger',
              onOk: () => handleDeleteTransaction(record.id),
            });
          }}
          style={{
            fontSize: isMobile ? 10 : 12,
            padding: isMobile ? '4px 8px' : '4px 12px',
          }}
        >
          {isMobile ? '' : '删除'}
        </Button>
      ),
    },
  ];

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(17, 24, 39, 0.95)',
      borderColor: isLight ? 'rgba(148, 163, 184, 0.2)' : '#D4A84B',
      borderWidth: 1,
      textStyle: { color: isLight ? '#1E293B' : '#F1F5F9', fontSize: isMobile ? 11 : 13 },
      formatter: (params: any) => {
        const p = params[0];
        if (!p || p.value == null) return '';
        const value = Number(p.value) || 0;
        const sign = value >= 0 ? '+' : '';
        // 查找排序后的原始净值用于tooltip显示
        const originalNav = sortedHistory[p.dataIndex]?.nav || sortedHistory[p.dataIndex]?.net_value || sortedHistory[p.dataIndex]?.净值 || '-';
        return `<div style="font-weight: 600; margin-bottom: ${isMobile ? '3px' : '4px'}; font-size: ${isMobile ? '12px' : '13px'};">${p.name}</div>
                <div style="color: ${value >= 0 ? (isLight ? '#DC2626' : '#E53935') : (isLight ? '#16A34A' : '#43A047')}; font-weight: 600; font-size: ${isMobile ? '13px' : '14px'};">
                  收益率: ${sign}${value.toFixed(2)}%
                </div>
                <div style="color: ${isLight ? '#64748B' : '#94A3B8'}; font-size: ${isMobile ? '11px' : '12px'}; margin-top: ${isMobile ? '2px' : '4px'};">
                  净值: ${originalNav}
                </div>`;
      },
    },
    xAxis: {
      type: 'category',
      data: sortedDates,
      axisLabel: {
        fontSize: isMobile ? 9 : 11,
        color: isLight ? '#64748B' : '#94A3B8',
        rotate: 0,  // ✅ 不旋转
        interval: isMobile && sortedDates.length > 15
          ? Math.floor(sortedDates.length / 6)  // ✅ 平均分布，显示约6个标签
          : xAxisConfig.interval,
        formatter: xAxisConfig.formatter,
      },
      axisLine: { lineStyle: { color: isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        fontSize: isMobile ? 10 : 11,
        color: isLight ? '#64748B' : '#94A3B8',
        formatter: (v: number) => {
          const sign = v >= 0 ? '+' : '';
          return `${sign}${v.toFixed(1)}%`;
        },
      },
      splitLine: {
        lineStyle: {
          color: isLight ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
          type: 'dashed',
        },
      },
      axisLine: { show: false },
    },
    series: [{
      type: 'line',
      data: percentageData,
      smooth: false,
      symbol: isMobile ? 'none' : 'none',
      lineStyle: {
        color: isLight ? '#B8860B' : '#D4A84B',
        width: isMobile ? 1.5 : 2,  // ✅ 折线变细
        shadowColor: isLight ? 'rgba(184, 134, 11, 0.15)' : 'rgba(212, 168, 75, 0.25)',
        shadowBlur: isMobile ? 4 : 8,
        shadowOffsetY: isMobile ? 2 : 4,
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: isLight ? 'rgba(184, 134, 11, 0.2)' : 'rgba(212, 168, 75, 0.25)' },
            { offset: 0.5, color: isLight ? 'rgba(184, 134, 11, 0.06)' : 'rgba(212, 168, 75, 0.08)' },
            { offset: 1, color: isLight ? 'rgba(184, 134, 11, 0.01)' : 'rgba(212, 168, 75, 0.01)' },
          ],
        },
      },
      // 添加0%基准线
      markLine: {
        silent: true, // 不触发鼠标事件
        symbol: 'none', // 不显示箭头
        data: [
          {
            yAxis: 0, // 0%位置
            lineStyle: {
              color: isLight ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.35)', // 灰色虚线
              width: 1,
              type: 'dashed',
            },
            label: {
              show: true,
              position: 'insideEndTop',
              formatter: '0%',
              fontSize: isMobile ? 10 : 11,
              color: isLight ? '#64748B' : '#94A3B8',
              fontWeight: 500,
            },
          },
        ],
      },
      markPoint: {
        data: transactions
          .filter((t: any) => t && t.transaction_date)
          .map((t: any) => {
            // 标准化交易日期格式
            const txDateStr = (t.transaction_date || '').toString().split('T')[0].split(' ')[0];
            
            // 1. 先尝试精确匹配
            let index = sortedHistory.findIndex((h: any) => {
              const historyDateStr = (h.date || h.日期 || '').toString().split('T')[0].split(' ')[0];
              return historyDateStr === txDateStr;
            });

            // 2. 如果精确匹配失败，尝试模糊匹配（找最近的交易日）
            if (index < 0) {
              const txDate = new Date(txDateStr);
              let minDiff = Infinity;
              
              sortedHistory.forEach((h: any, i: number) => {
                const historyDateStr = (h.date || h.日期 || '').toString().split('T')[0].split(' ')[0];
                const historyDate = new Date(historyDateStr);
                const diff = Math.abs(historyDate.getTime() - txDate.getTime());
                
                // 只查找前后3天内的最近交易日（避免匹配到太远的数据）
                if (diff < minDiff && diff <= 3 * 24 * 60 * 60 * 1000) {
                  minDiff = diff;
                  index = i;
                }
              });
            }

            // 如果还是找不到，跳过该标记
            if (index < 0 || index >= percentageData.length) return null;

            const coordValue = percentageData[index];

            return {
              name: t.type === 'buy' ? '买入' : '卖出',
              coord: [index, coordValue],
              symbol: 'circle',
              symbolSize: isMobile ? 6 : 8,
              itemStyle: {
                color: t.type === 'buy' ? (isLight ? '#DC2626' : '#EF4444') : (isLight ? '#16A34A' : '#22C55E'),
                borderColor: isLight ? '#fff' : 'transparent',  // ✅ 去掉白边
                borderWidth: 0,               // ✅ 无边框
              },
            };
          })
          .filter((point: any) => point !== null),
      },
    }],
    grid: {
      top: isMobile ? 30 : 40,
      bottom: isMobile ? 25 : 30,
      left: isMobile ? 42 : 58,   // ✅ 左边距微调，避免遮挡百分比
      right: isMobile ? 8 : 15
    },
    dataZoom: [
      {
        type: 'inside',
        backgroundColor: isLight ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)',
        fillerColor: isLight ? 'rgba(184, 134, 11, 0.12)' : 'rgba(212, 168, 75, 0.15)',
        borderColor: 'transparent',
      },
    ],
  };

  if (loading) {
    return (
      <div style={{ padding: '20px 16px' }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (!fund) {
    return (
      <div style={{
        padding: 80,
        textAlign: 'center',
        color: 'var(--text-secondary)',
        fontSize: 15,
      }}>
        基金信息不存在
      </div>
    );
  }

  const isUp = (fund.estimated_change ?? 0) >= 0;

  return (
    <div className="fund-detail-page" style={{ paddingTop: 20, paddingLeft: 16, paddingRight: 16, paddingBottom: 100 }}>
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          /* 页面容器 */
          .fund-detail-page {
            padding: 12px 8px !important;
            padding-bottom: 80px !important;
          }

          /* 顶部导航栏 */
          .fund-detail-header {
            margin-bottom: 16px !important;
            padding: 8px 4px !important;
            gap: 10px !important;
          }

          .fund-detail-title {
            font-size: clamp(18px, 5vw, 22px) !important;
            margin-bottom: 2px !important;
          }

          .fund-detail-meta {
            font-size: clamp(11px, 2.8vw, 13px) !important;
            gap: 6px !important;
            flex-wrap: wrap !important;
          }

          /* 核心数据卡片 */
          .fund-detail-summary-card > .ant-card-body {
            padding: 16px 12px !important;
          }

          .fund-detail-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }

          .fund-detail-data-label {
            font-size: clamp(10px, 2.5vw, 12px) !important;
            margin-bottom: 3px !important;
          }

          .fund-detail-data-value {
            font-size: clamp(18px, 4.5vw, 28px) !important;
          }

          .fund-detail-data-value-small {
            font-size: clamp(14px, 3.5vw, 18px) !important;
          }

          /* 走势图卡片 */
          .fund-detail-chart-card {
            margin-bottom: 10px !important;  // ✅ 移动端间距更小
          }

          .fund-detail-chart-card > .ant-card-body {
            padding: 12px 8px !important;
          }

          .fund-detail-chart-container {
            height: clamp(240px, 42vw, 300px) !important;
            width: 100% !important;
            overflow: hidden !important;
          }

          /* Canvas 元素优化 */
          .fund-detail-chart-container canvas,
          .fund-detail-chart-container div[data-zr-dom-id] {
            max-width: 100% !important;
            touch-action: pan-y !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          .fund-detail-chart-header {
            margin-bottom: 12px !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
          }

          .fund-detail-chart-title {
            font-size: clamp(14px, 3.5vw, 16px) !important;
          }

          .fund-detail-period-selector {
            width: 100% !important;
            justify-content: flex-start !important;
          }

          .fund-detail-period-selector .ant-segmented {
            width: 100% !important;
          }

          .fund-detail-period-selector .ant-segmented-item {
            font-size: clamp(10px, 2.5vw, 12px) !important;
            padding: 0 6px !important;
          }

          .fund-detail-data-info {
            flex-direction: row !important;    // ✅ 保持横向排列
            flex-wrap: nowrap !important;     // ✅ 不换行
            gap: 10px !important;              // ✅ 间距
            font-size: clamp(10px, 2.5vw, 11px) !important;
            padding: 8px 10px !important;
          }

          .fund-detail-data-info span {
            white-space: nowrap !important;   // ✅ 单行显示
          }

          /* 操作按钮组 */
          .fund-detail-actions {
            display: flex !important;
            grid-template-columns: unset !important;
            gap: 6px !important;
            margin-bottom: 16px !important;
          }

          .fund-detail-action-btn {
            flex: 1 !important;
            height: 40px !important;
            font-size: clamp(12px, 3vw, 14px) !important;
            padding: 0 4px !important;
            border-radius: var(--radius-sm) !important;
          }
          
          /* 确保减仓按钮在移动端也有红色背景 */
          .fund-detail-actions button:nth-child(2) {
            background-color: #e3787d !important;
            color: white !important;
            border-color: #e3787d !important;
          }

          /* 交易记录卡片 */
          .fund-detail-transactions-card > .ant-card-header {
            padding: 12px 16px !important;
          }

          .fund-detail-transactions-card .ant-table {
            font-size: clamp(11px, 2.8vw, 13px) !important;
          }

          .fund-detail-transactions-card .ant-table-thead > tr > th,
          .fund-detail-transactions-card .ant-table-tbody > tr > td {
            padding: 8px 6px !important;
            font-size: clamp(11px, 2.8vw, 13px) !important;
          }

          /* 防止表格超出 */
          .fund-detail-transactions-card .ant-table-wrapper {
            overflow-x: auto !important;
          }

          .fund-detail-transactions-card .ant-table-container {
            width: 100% !important;
          }

          .fund-detail-transactions-card table {
            table-layout: fixed !important;
            width: 100% !important;
          }
          
          /* 优化表格单元格间距 */
          .fund-detail-transactions-card .ant-table-thead > tr > th,
          .fund-detail-transactions-card .ant-table-tbody > tr > td {
            padding: 8px 4px !important;
          }
          
          /* 确保列宽正确应用 */
          .fund-detail-transactions-card .ant-table-cell {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          /* 返回按钮和收藏按钮 */
          .fund-detail-back-btn {
            width: 36px !important;
            height: 36px !important;
            font-size: 16px !important;
          }

          .fund-detail-favorite-btn {
            width: 40px !important;
            height: 40px !important;
            font-size: 20px !important;
          }
        }
      `}</style>

      {/* 顶部导航栏 */}
      <div className="fund-detail-header" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 24,
        padding: '12px 4px',
      }}>
        <Button
          className="fund-detail-back-btn"
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
        <div style={{ flex: 1 }}>
          <h1 className="fund-detail-title" style={{
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 4,
            letterSpacing: '-0.01em',
          }}>
            {fund.name || code}
          </h1>
          <div className="fund-detail-meta" style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <span className="number-tabular" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {fund.code || code}
            </span>
            {fund.type && (
              <Tag
                style={{
                  fontSize: 11,
                  lineHeight: '18px',
                  padding: '0 8px',
                  background: 'var(--accent-gold-dim)',
                  color: 'var(--accent-gold-light)',
                  border: 'none',
                  borderRadius: 4,
                }}
              >
                {fund.type}
              </Tag>
            )}
            {fund.created_at && (
              <span style={{ color: 'var(--text-muted)' }}>成立: {fund.created_at}</span>
            )}
          </div>
        </div>
        <Button
          className="fund-detail-favorite-btn"
          type="text"
          icon={isFavorite ? <StarFilled /> : <StarOutlined />}
          onClick={toggleFavorite}
          style={{
            fontSize: 22,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            color: isFavorite ? 'var(--accent-gold)' : 'var(--text-muted)',
            background: isFavorite ? 'var(--accent-gold-dim)' : 'transparent',
            transition: 'all var(--transition-fast)',
            border: isFavorite ? '1px solid var(--accent-gold)' : '1px solid transparent',
          }}
          onMouseEnter={(e) => {
            if (!isFavorite) {
              e.currentTarget.style.color = 'var(--accent-gold)';
              e.currentTarget.style.background = 'var(--bg-card)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isFavorite) {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'transparent';
            }
          }}
        />
      </div>

      {/* 核心数据卡片 */}
      <Card
        className="fund-detail-summary-card"
        style={{
          marginBottom: 12,  // ✅ 减小与上方模块的间距
          background: isLight ? 'linear-gradient(135deg, rgba(184, 134, 11, 0.04), rgba(255, 255, 255, 0.9))' : 'linear-gradient(135deg, rgba(212, 168, 75, 0.05), rgba(17, 24, 39, 0.8))',
          borderColor: isLight ? 'rgba(184, 134, 11, 0.12)' : 'rgba(212, 168, 75, 0.15)',
          boxShadow: 'var(--shadow-lg)',
        }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="fund-detail-grid">
          <div>
            <div className="fund-detail-data-label" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              最新净值
            </div>
            <div className="fund-detail-data-value number-tabular" style={{
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.02em',
            }}>
              ¥{fund.net_value?.toFixed(4) || '-'}
            </div>
          </div>
          <div>
            <div className="fund-detail-data-label" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              估算涨幅
            </div>
            <div className="fund-detail-data-value number-tabular" style={{
              fontSize: 28,
              fontWeight: 800,
              color: isUp ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.02em',
            }}>
              {isUp ? '+' : ''}{fund.estimated_change?.toFixed(2) || '0.00'}%
            </div>
          </div>
          <div>
            <div className="fund-detail-data-label" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              当日收益
            </div>
            <div className="fund-detail-data-value-small number-tabular" style={{
              fontSize: 18,
              fontWeight: 700,
              color: (fund.daily_profit ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
            }}>
              {(fund.daily_profit ?? 0) >= 0 ? '+' : ''}¥{Math.abs(fund.daily_profit ?? 0).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="fund-detail-data-label" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              累计收益
            </div>
            <div className="fund-detail-data-value-small number-tabular" style={{
              fontSize: 18,
              fontWeight: 700,
              color: (fund.accumulated_profit ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)',
              fontFamily: 'var(--font-mono)',
            }}>
              {(fund.accumulated_profit ?? 0) >= 0 ? '+' : ''}¥{Math.abs(fund.accumulated_profit ?? 0).toFixed(2)}
            </div>
          </div>
        </div>
      </Card>

      {/* 走势图卡片 */}
      <Card
        className="fund-detail-chart-card"
        style={{
          marginBottom: 12,  // ✅ 减小与上方模块的间距
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
        styles={{
          body: { padding: '20px 16px' },
        }}
      >
        <div className="fund-detail-chart-header" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="fund-detail-chart-title" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>走势图</span>
          </div>
          <Space className="fund-detail-period-selector" size={8}>
            <Segmented
              value={period}
              onChange={(v) => setPeriod(v as Period)}
              size="middle"
              options={[
                { value: '1w', label: '1周' },
                { value: '1m', label: '1月' },
                { value: '3m', label: '3月' },
                { value: '6m', label: '6月' },
                { value: '1y', label: '1年' },
                { value: 'all', label: '全部' },
              ]}
            />
          </Space>
        </div>
        <ReactECharts option={chartOption} style={{ height: 'clamp(260px, 45vw, 340px)' }} className="fund-detail-chart-container" opts={{ renderer: 'canvas' }} />
        {navHistory.length > 0 && (
          <div className="fund-detail-data-info" style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'var(--bg-secondary)',
            borderRadius: 6,
            display: 'flex',
            flexWrap: 'nowrap',        // ✅ 不换行
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',               // ✅ 增加间距
            fontSize: 11,
            color: 'var(--text-muted)',
          }}>
            <span style={{ whiteSpace: 'nowrap' }}>  {/* ✅ 单行显示 */}
              📈 数据点: <strong style={{ color: 'var(--text-secondary)' }}>{navHistory.length}</strong> 个交易日
            </span>
            {percentageData.length > 0 && (
              <span style={{ whiteSpace: 'nowrap' }}>  {/* ✅ 单行显示 */}
                区间涨跌:
                <strong style={{
                  color: (percentageData[percentageData.length - 1] || 0) >= 0 ? 'var(--gain)' : 'var(--loss)'
                }}>
                  {(percentageData[percentageData.length - 1] || 0) >= 0 ? '+' : ''}
                  {(percentageData[percentageData.length - 1] || 0).toFixed(2)}%
                </strong>
              </span>
            )}
          </div>
        )}
      </Card>

      {/* 操作按钮组 */}
      <div className="fund-detail-actions" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 12,
        marginBottom: 12,  // ✅ 减小与下方模块的间距
      }}>
        <Button
          className="fund-detail-action-btn"
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setBuyModalOpen(true)}
          style={{
            height: 48,
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 14px rgba(212, 168, 75, 0.25)',
          }}
        >
          加仓
        </Button>
        <Button
          className="fund-detail-action-btn"
          icon={<MinusOutlined />}
          onClick={() => setSellModalOpen(true)}
          style={{
            height: 48,
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 'var(--radius-md)',
            backgroundColor: '#e3787d',
            color: 'white',
            border: '1px solid #e3787d',
          }}
        >
          减仓
        </Button>
        <Button
          className="fund-detail-action-btn"
          icon={<ScheduleOutlined />}
          onClick={() => setPlanModalOpen(true)}
          style={{
            height: 48,
            fontSize: 15,
            fontWeight: 600,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
          }}
        >
          定投
        </Button>
      </div>

      {/* 交易记录 */}
      <Card
        className="fund-detail-transactions-card"
        title={
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            交易记录
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
          dataSource={transactions}
          columns={txColumns as any}
          rowKey="id"
          size="middle"
          pagination={false}
          locale={{ emptyText: <div style={{ padding: 40, color: 'var(--text-muted)' }}>暂无交易记录</div> }}
        />
      </Card>

      {/* 模态框 */}
      <BuyModal
        open={buyModalOpen}
        fundCode={code || ''}
        fundName={fund.name || code || ''}
        onClose={() => setBuyModalOpen(false)}
        onSuccess={loadData}
      />
      <SellModal
        open={sellModalOpen}
        fundCode={code || ''}
        fundName={fund.name || fund.fund_name || code || ''}
        maxShares={fund.shares ?? 0}
        onClose={() => setSellModalOpen(false)}
        onSuccess={loadData}
      />
      <CreatePlanModal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        onSuccess={loadData}
        fundCode={code || ''}
        fundName={fund.name || code || ''}
      />
    </div>
  );
}
