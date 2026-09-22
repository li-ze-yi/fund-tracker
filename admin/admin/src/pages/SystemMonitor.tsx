import { useEffect, useState, useCallback, useRef } from 'react';
import { Row, Col, Spin, Tag, Progress, Button, Table, Switch, Badge } from 'antd';
import {
  DashboardOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ApiOutlined,
  WarningOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { adminApi } from '../api';

const REFRESH_INTERVAL = 5; // 自动刷新间隔（秒）

interface SystemMetrics {
  serverInfo: {
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
    cpuCores: number;
    memory: { totalMB: number; freeMB: number; usedPercent: number };
    processMemory: { rssMB: number; heapTotalMB: number; heapUsedMB: number };
  };
  redisStatus: { enabled: boolean; available: boolean; error?: string };
  mysqlStatus: { available: boolean; error?: string };
  apiStats: {
    uptimeSeconds: number;
    totalRequests: number;
    errorRequests: number;
    errorRate: number;
    avgResponseTime: number;
    statusCodeCounts: { code: number; count: number }[];
  };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  if (h > 0) return `${h}时 ${m}分 ${s}秒`;
  if (m > 0) return `${m}分 ${s}秒`;
  return `${s}秒`;
}

function statusColor(code: number): string {
  if (code >= 500) return '#E53935';
  if (code >= 400) return '#FB8C00';
  if (code >= 300) return '#1E88E5';
  if (code >= 200) return '#43A047';
  return '#8B949E';
}

export default function SystemMonitor() {
  const [data, setData] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const fetchingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    // 防重入：避免自动刷新与手动刷新并发导致旧响应覆盖新数据
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (isRefresh) setRefreshing(true);
    try {
      const res = await adminApi.systemMetrics();
      setData(res);
    } finally {
      setLoading(false);
      setRefreshing(false);
      fetchingRef.current = false;
    }
  }, []);

  // 首次加载
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 自动刷新 + 倒计时
  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    setCountdown(REFRESH_INTERVAL);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData(true);
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRefresh, fetchData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) return null;

  const { serverInfo, redisStatus, mysqlStatus, apiStats } = data;

  const cards = [
    {
      label: '运行时长',
      value: formatUptime(apiStats.uptimeSeconds),
      icon: <ClockCircleOutlined />,
    },
    {
      label: 'API 调用总数',
      value: apiStats.totalRequests.toLocaleString(),
      icon: <ApiOutlined />,
    },
    {
      label: '错误率',
      value: `${apiStats.errorRate}%`,
      icon: <WarningOutlined />,
      valueColor: apiStats.errorRate > 1 ? '#E53935' : '#43A047',
    },
    {
      label: '平均响应时间',
      value: `${apiStats.avgResponseTime} ms`,
      icon: <ThunderboltOutlined />,
    },
  ];

  const statusColumns = [
    {
      title: '状态码',
      dataIndex: 'code',
      width: 120,
      render: (code: number) => (
        <Tag className="num" style={{ background: `${statusColor(code)}22`, borderColor: statusColor(code), color: statusColor(code), borderRadius: 4 }}>
          {code}
        </Tag>
      ),
    },
    {
      title: '请求次数',
      dataIndex: 'count',
      render: (v: number) => <span className="num" style={{ fontWeight: 600 }}>{v.toLocaleString()}</span>,
    },
    {
      title: '占比',
      key: 'percent',
      render: (_: unknown, record: { code: number; count: number }) => (
        <Progress
          percent={Math.round((record.count / apiStats.totalRequests) * 1000) / 10}
          showInfo={false}
          strokeColor={statusColor(record.code)}
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
            系统监控
          </h2>
          <div className="page-desc">服务器运行状态、API 调用统计与依赖服务健康度</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Badge
            status={autoRefresh ? 'success' : 'default'}
            text={
              <span style={{ color: '#8B949E', fontSize: 12 }}>
                {autoRefresh ? `自动刷新 · ${countdown}s` : '已暂停'}
              </span>
            }
          />
          <Switch
            checked={autoRefresh}
            onChange={setAutoRefresh}
            checkedChildren="开"
            unCheckedChildren="关"
          />
          <Button
            type="primary"
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={() => fetchData(true)}
            style={{ background: 'linear-gradient(135deg, #D4A84B, #B8922E)', borderColor: '#D4A84B', color: '#0D1117' }}
          >
            刷新
          </Button>
        </div>
      </div>

      <Row gutter={[16, 16]} align="stretch">
        {cards.map((card, i) => (
          <Col xs={12} lg={6} key={card.label} style={{ display: 'flex' }}>
            <div className="stat-card stat-card-full animate-in" style={{ animationDelay: `${i * 0.06}s`, width: '100%' }}>
              <div className="stat-body">
                <div className="stat-text">
                  <div className="stat-label">{card.label}</div>
                  <div className="stat-value" style={card.valueColor ? { color: card.valueColor } : undefined}>
                    {card.value}
                  </div>
                </div>
                <div className="stat-icon-box">{card.icon}</div>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <div className="panel" style={{ height: '100%' }}>
            <div className="panel-head">
              <h3 className="panel-title">服务器信息</h3>
            </div>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div className="stat-label">运行环境</div>
                <div style={{ marginTop: 4, color: '#E6EDF3' }}>{serverInfo.platform}</div>
              </Col>
              <Col span={12}>
                <div className="stat-label">Node 版本</div>
                <div className="mono" style={{ marginTop: 4, color: '#E6EDF3' }}>{serverInfo.nodeVersion}</div>
              </Col>
              <Col span={12}>
                <div className="stat-label">CPU 核心数</div>
                <div className="num" style={{ marginTop: 4, color: '#E6EDF3' }}>{serverInfo.cpuCores} 核</div>
              </Col>
              <Col span={12}>
                <div className="stat-label">进程运行时长</div>
                <div className="num" style={{ marginTop: 4, color: '#E6EDF3' }}>{formatUptime(serverInfo.uptimeSeconds)}</div>
              </Col>
              <Col span={24}>
                <div className="stat-label">系统内存（{serverInfo.memory.usedPercent}% 已用）</div>
                <Progress
                  percent={serverInfo.memory.usedPercent}
                  strokeColor={serverInfo.memory.usedPercent > 80 ? '#E53935' : '#D4A84B'}
                  trailColor="rgba(212,168,75,0.1)"
                  format={(p) => `${serverInfo.memory.totalMB - serverInfo.memory.freeMB} / ${serverInfo.memory.totalMB} MB`}
                />
              </Col>
              <Col span={24}>
                <div className="stat-label">Node 进程内存</div>
                <div style={{ marginTop: 4, fontSize: 13, color: '#8B949E' }}>
                  RSS <span className="num" style={{ color: '#E6EDF3' }}>{serverInfo.processMemory.rssMB}</span> MB ·
                  堆已用 <span className="num" style={{ color: '#D4A84B' }}>{serverInfo.processMemory.heapUsedMB}</span> /
                  堆总量 <span className="num">{serverInfo.processMemory.heapTotalMB}</span> MB
                </div>
              </Col>
            </Row>
          </div>
        </Col>

        <Col xs={24} lg={12}>
          <div className="panel" style={{ height: '100%' }}>
            <div className="panel-head">
              <h3 className="panel-title">依赖服务状态</h3>
            </div>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div className="stat-label">Redis</div>
                <div style={{ marginTop: 8 }}>
                  {redisStatus.available ? (
                    <Tag icon={<CheckCircleOutlined />} style={{ background: 'rgba(67,160,71,0.12)', borderColor: 'rgba(67,160,71,0.4)', color: '#43A047', borderRadius: 4 }}>
                      已连接
                    </Tag>
                  ) : redisStatus.enabled ? (
                    <Tag icon={<WarningOutlined />} style={{ background: 'rgba(251,140,0,0.12)', borderColor: 'rgba(251,140,0,0.4)', color: '#FB8C00', borderRadius: 4 }}>
                      已配置但不可用
                    </Tag>
                  ) : (
                    <Tag icon={<CloseCircleOutlined />} style={{ background: 'rgba(139,148,158,0.12)', borderColor: 'rgba(139,148,158,0.4)', color: '#8B949E', borderRadius: 4 }}>
                      未配置（内存模式）
                    </Tag>
                  )}
                </div>
              </Col>
              <Col span={12}>
                <div className="stat-label">MySQL</div>
                <div style={{ marginTop: 8 }}>
                  {mysqlStatus.available ? (
                    <Tag icon={<CheckCircleOutlined />} style={{ background: 'rgba(67,160,71,0.12)', borderColor: 'rgba(67,160,71,0.4)', color: '#43A047', borderRadius: 4 }}>
                      正常
                    </Tag>
                  ) : (
                    <Tag icon={<CloseCircleOutlined />} style={{ background: 'rgba(229,57,53,0.12)', borderColor: 'rgba(229,57,53,0.4)', color: '#E53935', borderRadius: 4 }}>
                      连接失败
                    </Tag>
                  )}
                </div>
              </Col>
              <Col span={24}>
                <div className="stat-label">错误请求数</div>
                <div className="num" style={{ marginTop: 4, fontSize: 20, fontWeight: 700, color: apiStats.errorRequests > 0 ? '#E53935' : '#43A047' }}>
                  {apiStats.errorRequests.toLocaleString()}
                </div>
              </Col>
            </Row>
          </div>
        </Col>
      </Row>

      <div style={{ marginTop: 24 }}>
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">HTTP 状态码分布</h3>
          </div>
          <Table
            columns={statusColumns}
            dataSource={apiStats.statusCodeCounts}
            rowKey="code"
            pagination={false}
            size="small"
          />
        </div>
      </div>
    </div>
  );
}
