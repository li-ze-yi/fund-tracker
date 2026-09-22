import { useEffect, useState, useMemo } from 'react';
import { Row, Col, Spin, Table, Tag, Progress, Empty } from 'antd';
import {
  UserOutlined,
  FundOutlined,
  SwapOutlined,
  PieChartOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { adminApi } from '../api';

interface HoldingUserItem {
  fund_code: string;
  fund_name: string;
  user_count: number;
}

interface DashboardData {
  userStats: { total: number; todayNew: number; activeCount: number };
  fundStats: { total: number; byType: { type: string; count: number }[] };
  transactionStats: { total: number; buyCount: number; sellCount: number; totalAmount: number };
  holdingStats: { total: number; avgPerUser: number };
  holdingUserStats: HoldingUserItem[];
}

interface TrendItem {
  date: string;
  totalAmount: number;
  buyCount: number;
  sellCount: number;
}

interface GrowthItem {
  date: string;
  newUsers: number;
  cumulative: number;
}

// 暗色主题通用图表配置
const darkChartTheme = {
  textStyle: { color: '#8B949E' },
  legend: { textStyle: { color: '#8B949E' } },
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [growth, setGrowth] = useState<GrowthItem[]>([]);
  const [dau, setDau] = useState<{ date: string; activeUsers: number }[]>([]);

  useEffect(() => {
    Promise.all([
      adminApi.dashboard(),
      adminApi.transactionTrend(30),
      adminApi.userGrowth(30),
      adminApi.dailyActive(30),
    ]).then(([dash, trendRes, growthRes, dauRes]) => {
      setData(dash);
      setTrend(trendRes.list || []);
      setGrowth(growthRes.list || []);
      setDau(dauRes.list || []);
    }).finally(() => setLoading(false));
  }, []);

  // 基金类型分布环形图
  const typePieOption = useMemo(() => {
    if (!data) return {};
    const topTypes = data.fundStats.byType.slice(0, 8);
    const otherCount = data.fundStats.byType.slice(8).reduce((s, t) => s + t.count, 0);
    const pieData = [
      ...topTypes.map((t) => ({ name: t.type, value: t.count })),
      ...(otherCount > 0 ? [{ name: '其他', value: otherCount }] : []),
    ];
    return {
      ...darkChartTheme,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { color: '#8B949E', fontSize: 11 }, type: 'scroll' },
      series: [{
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#161B22', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, color: '#E6EDF3', fontWeight: 600 } },
        data: pieData,
      }],
      color: ['#D4A84B', '#E53935', '#43A047', '#1E88E5', '#8E24AA', '#FB8C00', '#00ACC1', '#EC407A', '#6E7681'],
    };
  }, [data]);

  // 近30天交易趋势（双 Y 轴：金额折线 + 笔数柱状）
  const trendOption = useMemo(() => {
    const dates = trend.map((t) => t.date.slice(5));
    return {
      ...darkChartTheme,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1C2128',
        borderColor: '#30363D',
        textStyle: { color: '#E6EDF3' },
      },
      legend: { data: ['交易金额', '买入笔数', '卖出笔数'], top: 0, textStyle: { color: '#8B949E', fontSize: 11 } },
      grid: { left: 50, right: 50, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#30363D' } },
        axisLabel: { color: '#6E7681', fontSize: 10 },
      },
      yAxis: [
        {
          type: 'value',
          name: '金额(元)',
          nameTextStyle: { color: '#6E7681', fontSize: 10 },
          axisLine: { lineStyle: { color: '#30363D' } },
          axisLabel: { color: '#6E7681', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(48,54,61,0.5)' } },
        },
        {
          type: 'value',
          name: '笔数',
          nameTextStyle: { color: '#6E7681', fontSize: 10 },
          axisLine: { lineStyle: { color: '#30363D' } },
          axisLabel: { color: '#6E7681', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '交易金额',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          data: trend.map((t) => t.totalAmount),
          itemStyle: { color: '#D4A84B' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(212,168,75,0.25)' }, { offset: 1, color: 'rgba(212,168,75,0)' }] } },
          lineStyle: { width: 2 },
        },
        {
          name: '买入笔数',
          type: 'bar',
          yAxisIndex: 1,
          data: trend.map((t) => t.buyCount),
          itemStyle: { color: 'rgba(229,57,53,0.65)', borderRadius: [2, 2, 0, 0] },
          barGap: '20%',
        },
        {
          name: '卖出笔数',
          type: 'bar',
          yAxisIndex: 1,
          data: trend.map((t) => t.sellCount),
          itemStyle: { color: 'rgba(67,160,71,0.65)', borderRadius: [2, 2, 0, 0] },
        },
      ],
    };
  }, [trend]);

  // 近30天用户活跃与增长（双轴：DAU折线 + 新增用户柱状）
  const growthOption = useMemo(() => {
    const dates = growth.map((g) => g.date.slice(5));
    const dauMap = new Map(dau.map((d) => [d.date, d.activeUsers]));
    return {
      ...darkChartTheme,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1C2128',
        borderColor: '#30363D',
        textStyle: { color: '#E6EDF3' },
      },
      legend: { data: ['日活(DAU)', '新增用户'], top: 0, textStyle: { color: '#8B949E', fontSize: 11 } },
      grid: { left: 45, right: 20, top: 35, bottom: 30 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#30363D' } },
        axisLabel: { color: '#6E7681', fontSize: 10 },
      },
      yAxis: [
        {
          type: 'value',
          name: '人数',
          nameTextStyle: { color: '#6E7681', fontSize: 10 },
          axisLine: { lineStyle: { color: '#30363D' } },
          axisLabel: { color: '#6E7681', fontSize: 10 },
          splitLine: { lineStyle: { color: 'rgba(48,54,61,0.5)' } },
        },
      ],
      series: [
        {
          name: '日活(DAU)',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          data: growth.map((g) => dauMap.get(g.date) || 0),
          itemStyle: { color: '#D4A84B' },
          lineStyle: { width: 2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(212,168,75,0.2)' }, { offset: 1, color: 'rgba(212,168,75,0)' }] } },
        },
        {
          name: '新增用户',
          type: 'bar',
          data: growth.map((g) => g.newUsers),
          itemStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#43A047' }, { offset: 1, color: '#2E7D32' }] },
            borderRadius: [3, 3, 0, 0],
          },
          barWidth: '45%',
        },
      ],
    };
  }, [growth, dau]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) return null;

  const holdingUserStats = data.holdingUserStats || [];
  const maxUserCount = holdingUserStats.length > 0 ? holdingUserStats[0].user_count : 1;

  const fundTypes = data.fundStats.byType.slice(0, 3);
  const remainingTypeCount = data.fundStats.byType.length - fundTypes.length;

  const cards = [
    {
      label: '用户总数',
      value: data.userStats.total,
      sub: <span>今日新增 <strong>{data.userStats.todayNew}</strong> · 7日活跃 <strong>{data.userStats.activeCount}</strong></span>,
      icon: <UserOutlined />,
    },
    {
      label: '基金总数',
      value: data.fundStats.total,
      sub: (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {fundTypes.map((t) => (
            <Tag key={t.type} style={{ background: 'rgba(212,168,75,0.1)', borderColor: 'rgba(212,168,75,0.3)', color: '#F0D78C', borderRadius: 4, margin: 0 }}>
              {t.type} <span className="num" style={{ color: '#D4A84B' }}>{t.count}</span>
            </Tag>
          ))}
          {remainingTypeCount > 0 && (
            <span style={{ fontSize: 12, color: '#6E7681' }}>等 {data.fundStats.byType.length} 类</span>
          )}
        </span>
      ),
      icon: <FundOutlined />,
    },
    {
      label: '交易总数',
      value: data.transactionStats.total,
      sub: <span>买入 <strong style={{ color: '#E53935' }}>{data.transactionStats.buyCount}</strong> · 卖出 <strong style={{ color: '#43A047' }}>{data.transactionStats.sellCount}</strong></span>,
      icon: <SwapOutlined />,
    },
    {
      label: '持仓记录',
      value: data.holdingStats.total,
      sub: <span>人均持仓 <strong>{data.holdingStats.avgPerUser.toFixed(1)}</strong> 只基金</span>,
      icon: <PieChartOutlined />,
    },
  ];

  const holdingColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => (
        <span
          className="num"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            background: index < 3 ? 'linear-gradient(135deg, #D4A84B, #B8922E)' : 'rgba(139,148,158,0.15)',
            color: index < 3 ? '#0D1117' : '#8B949E',
          }}
        >
          {index + 1}
        </span>
      ),
    },
    {
      title: '基金代码',
      dataIndex: 'fund_code',
      width: 110,
      render: (v: string) => (
        <Tag
          className="mono"
          style={{ background: 'rgba(212,168,75,0.1)', borderColor: 'rgba(212,168,75,0.3)', color: '#F0D78C', borderRadius: 4 }}
        >
          {v}
        </Tag>
      ),
    },
    {
      title: '基金名称',
      dataIndex: 'fund_name',
      ellipsis: true,
    },
    {
      title: '持仓用户数',
      dataIndex: 'user_count',
      width: 120,
      sorter: (a: HoldingUserItem, b: HoldingUserItem) => a.user_count - b.user_count,
      render: (v: number) => (
        <span className="num" style={{ fontWeight: 600, color: '#D4A84B' }}>{v}</span>
      ),
    },
    {
      title: '占比',
      key: 'bar',
      width: 200,
      render: (_: unknown, record: HoldingUserItem) => (
        <Progress
          percent={Math.round((record.user_count / maxUserCount) * 100)}
          showInfo={false}
          strokeColor="#D4A84B"
          trailColor="rgba(212,168,75,0.1)"
          size="small"
        />
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="title-icon"><DashboardOutlined /></span>
            仪表盘
          </h2>
          <div className="page-desc">系统整体数据概览，帮助快速掌握运营状况</div>
        </div>
      </div>

      <Row gutter={[16, 16]} align="stretch">
        {cards.map((card, i) => (
          <Col xs={24} sm={12} lg={6} key={card.label} style={{ display: 'flex' }}>
            <div className="stat-card stat-card-full animate-in" style={{ animationDelay: `${i * 0.06}s`, width: '100%' }}>
              <div className="stat-body">
                <div className="stat-text">
                  <div className="stat-label">{card.label}</div>
                  <div className="stat-value">{card.value.toLocaleString()}</div>
                  <div className="stat-sub">{card.sub}</div>
                </div>
                <div className="stat-icon-box">{card.icon}</div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* 图表区 */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={8}>
          <div className="panel" style={{ height: '100%' }}>
            <div className="panel-head">
              <h3 className="panel-title">基金类型分布</h3>
            </div>
            <ReactECharts option={typePieOption} style={{ height: 280 }} />
          </div>
        </Col>
        <Col xs={24} lg={16}>
          <div className="panel" style={{ height: '100%' }}>
            <div className="panel-head">
              <h3 className="panel-title">近 30 天交易趋势</h3>
            </div>
            <ReactECharts option={trendOption} style={{ height: 280 }} />
          </div>
        </Col>
      </Row>

      <div style={{ marginTop: 24 }}>
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">近 30 天用户活跃与增长</h3>
          </div>
          <ReactECharts option={growthOption} style={{ height: 240 }} />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">基金持仓用户统计 TOP 20</h3>
          </div>
          <Table
            columns={holdingColumns}
            dataSource={holdingUserStats}
            rowKey="fund_code"
            pagination={false}
            size="small"
            locale={{
              emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无持仓统计数据" />,
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">交易金额统计</h3>
          </div>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <div className="stat-label">总交易金额</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 700, color: '#E6EDF3', marginTop: 4 }}>
                ¥{data.transactionStats.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div className="stat-label">买入笔数</div>
              <div className="num" style={{ fontSize: 24, fontWeight: 600, color: '#E53935', marginTop: 4 }}>
                {data.transactionStats.buyCount}
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div className="stat-label">卖出笔数</div>
              <div className="num" style={{ fontSize: 24, fontWeight: 600, color: '#43A047', marginTop: 4 }}>
                {data.transactionStats.sellCount}
              </div>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
}
