import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Progress, Typography, App } from 'antd';
import {
  UserOutlined,
  UserAddOutlined,
  RiseOutlined,
  FundOutlined,
  SwapOutlined,
  WalletOutlined,
  PieChartOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { adminService, DashboardData, DbHealthData } from '../services/adminService';
import type { ColumnsType } from 'antd/es/table';

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(false);
  const { message } = App.useApp();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [d, h] = await Promise.allSettled([
        adminService.getDashboard(),
        adminService.getDbHealth(),
      ]);
      if (d.status === 'fulfilled') setDashboard(d.value);
      else message.error('仪表盘数据加载失败');
      if (h.status === 'fulfilled') setDbHealth(h.value);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHealth = async () => {
    setHealthLoading(true);
    try {
      setDbHealth(await adminService.getDbHealth());
    } catch {
      message.error('健康检查失败');
    } finally {
      setHealthLoading(false);
    }
  };

  const topColumns: ColumnsType<DashboardData['holdingUserStats'][number]> = [
    { title: '#', width: 44, render: (_v, _r, i) => i + 1 },
    { title: '代码', dataIndex: 'fund_code', key: 'fund_code', width: 90 },
    { title: '基金名称', dataIndex: 'fund_name', key: 'fund_name', ellipsis: true },
    { title: '持有用户数', dataIndex: 'user_count', key: 'user_count', width: 110, sorter: (a, b) => a.user_count - b.user_count, defaultSortOrder: 'descend' },
  ];

  const u = dashboard?.userStats;
  const t = dashboard?.transactionStats;
  const h = dashboard?.holdingStats;

  return (
    <div className="admin-page">
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in" loading={loading}>
            <Statistic
              title="用户总数"
              value={u?.total ?? 0}
              prefix={<UserOutlined style={{ marginRight: 6 }} />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in rise-in-delay-1" loading={loading}>
            <Statistic
              title="今日新增用户"
              value={u?.todayNew ?? 0}
              prefix={<UserAddOutlined style={{ marginRight: 6 }} />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in rise-in-delay-2" loading={loading}>
            <Statistic
              title="7 日活跃用户"
              value={u?.activeCount ?? 0}
              prefix={<RiseOutlined style={{ marginRight: 6 }} />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in rise-in-delay-3" loading={loading}>
            <Statistic
              title="基金库总数"
              value={dashboard?.fundStats.total ?? 0}
              prefix={<FundOutlined style={{ marginRight: 6 }} />}
            />
          </Card>
        </Col>

        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in" loading={loading}>
            <Statistic
              title="交易总笔数"
              value={t?.total ?? 0}
              prefix={<SwapOutlined style={{ marginRight: 6 }} />}
              suffix={t ? <span style={{ fontSize: 13 }}>（买 {t.buyCount} / 卖 {t.sellCount}）</span> : null}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in rise-in-delay-1" loading={loading}>
            <Statistic
              title="累计交易金额"
              value={t?.totalAmount ?? 0}
              precision={2}
              prefix={<WalletOutlined style={{ marginRight: 6 }} />}
              suffix="元"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in rise-in-delay-2" loading={loading}>
            <Statistic
              title="持仓记录总数"
              value={h?.total ?? 0}
              prefix={<PieChartOutlined style={{ marginRight: 6 }} />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in rise-in-delay-3" loading={loading}>
            <Statistic
              title="人均持仓数"
              value={h?.avgPerUser ?? 0}
              precision={1}
              prefix={<PieChartOutlined style={{ marginRight: 6 }} />}
              suffix="只/人"
            />
          </Card>
        </Col>

        {/* 基金类型分布 */}
        <Col xs={24} lg={8}>
          <Card
            className="rise-in"
            title="基金类型分布"
            size="small"
            loading={loading}
            style={{ height: '100%' }}
          >
            {(dashboard?.fundStats.byType ?? []).map((item) => {
              const max = Math.max(...(dashboard?.fundStats.byType ?? [{ count: 1 }]).map((x) => x.count));
              return (
                <div key={item.type} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>{item.type}</span>
                    <Typography.Text type="secondary">{item.count}</Typography.Text>
                  </div>
                  <Progress
                    percent={Math.max(2, Math.round((item.count / max) * 100))}
                    showInfo={false}
                    strokeColor="#D4A84B"
                    size="small"
                  />
                </div>
              );
            })}
            {!loading && (dashboard?.fundStats.byType?.length ?? 0) === 0 && (
              <Typography.Text type="secondary">暂无数据</Typography.Text>
            )}
          </Card>
        </Col>

        {/* 数据库连接池健康 */}
        <Col xs={24} lg={8}>
          <Card
            className="rise-in rise-in-delay-1"
            title="数据库连接池"
            size="small"
            extra={
              <a onClick={refreshHealth}>
                <ReloadOutlined spin={healthLoading} /> 刷新
              </a>
            }
            loading={loading && !dbHealth}
            style={{ height: '100%' }}
          >
            {dbHealth && (
              <>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span>连接池水位（活跃 / 上限）</span>
                  <Typography.Text
                    type={dbHealth.connectionPool.utilizationPercent > 80 ? 'danger' : undefined}
                    strong
                  >
                    {dbHealth.connectionPool.utilizationPercent}%
                  </Typography.Text>
                </div>
                <Progress
                  percent={dbHealth.connectionPool.utilizationPercent}
                  status={dbHealth.connectionPool.utilizationPercent > 80 ? 'exception' : 'normal'}
                  strokeColor={dbHealth.connectionPool.utilizationPercent > 80 ? '#cf1322' : '#D4A84B'}
                />
                <Row gutter={8} style={{ marginTop: 12 }}>
                  <Col span={12}>
                    <Statistic title="活跃连接" value={dbHealth.connectionPool.activeConnections} valueStyle={{ fontSize: 18 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="空闲连接" value={dbHealth.connectionPool.freeConnections} valueStyle={{ fontSize: 18 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="排队请求" value={dbHealth.connectionPool.queuedRequests} valueStyle={{ fontSize: 18 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="MySQL 线程"
                      value={dbHealth.mysqlThreadsConnected ?? '-'}
                      valueStyle={{ fontSize: 18 }}
                    />
                  </Col>
                </Row>
              </>
            )}
          </Card>
        </Col>

        {/* 热门基金 Top20 */}
        <Col xs={24} lg={8}>
          <Card
            className="rise-in rise-in-delay-2"
            title="热门基金 Top 20（按持有用户数）"
            size="small"
            loading={loading}
          >
            <Table
              rowKey="fund_code"
              size="small"
              columns={topColumns}
              dataSource={dashboard?.holdingUserStats ?? []}
              pagination={false}
              scroll={{ y: 360 }}
              locale={{ emptyText: '暂无持仓数据' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
