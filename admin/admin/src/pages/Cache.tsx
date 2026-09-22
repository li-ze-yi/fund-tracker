import { useEffect, useState, useCallback, useMemo } from 'react';
import { Table, Button, Input, Tag, Row, Col, Progress, App, Space, Statistic, Tooltip, Switch, Empty } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  CloudOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { adminApi } from '../api';

interface CacheEntry {
  key: string;
  type: string;
  ageSeconds: number;
  ttlSeconds: number;
  remainingSeconds: number;
  expired: boolean;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  hitRate: string;
  size: number;
  maxSize: number;
  tradingStatus: string;
  realtimeTTL: string;
}

interface RecentMiss {
  key: string;
  type: string;
  at: string;
}

interface CacheData {
  stats: CacheStats;
  entries: CacheEntry[];
  recentMisses: RecentMiss[];
}

interface CheckResult {
  hit: boolean;
  key: string;
  type?: string;
  ageSeconds?: number;
  ttlSeconds?: number;
  remainingSeconds?: number;
  expired?: boolean;
}

const statusMap: Record<string, { label: string; color: string }> = {
  trading: { label: '交易中', color: '#43A047' },
  after_hours: { label: '盘后', color: '#FB8C00' },
  pre_market: { label: '盘前', color: '#1E88E5' },
  weekend: { label: '周末', color: '#8E24AA' },
};

const typeColorMap: Record<string, string> = {
  realtime: '#E53935',
  history_recent: '#FB8C00',
  history_older: '#43A047',
  fund_info: '#1E88E5',
  fund_list: '#8E24AA',
  market_status: '#00ACC1',
};

export default function Cache() {
  const { modal } = App.useApp();
  const [data, setData] = useState<CacheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkKey, setCheckKey] = useState('');
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminApi.cacheStats();
      setData(res);
      setLastUpdated(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      if (autoRefresh) loadData(true);
    }, 6000);
    return () => clearInterval(timer);
  }, [loadData, autoRefresh]);

  // 模糊匹配：基于已加载的缓存条目按 key 包含关键词过滤（大小写不敏感）
  const matchResults = useMemo(() => {
    if (!data || !checkKey.trim()) return [];
    const q = checkKey.trim().toLowerCase();
    return data.entries
      .filter((e) => e.key.toLowerCase().includes(q))
      .slice(0, 30);
  }, [data, checkKey]);

  const handleCheck = async (key?: string) => {
    const target = (key ?? checkKey).trim();
    if (!target) return;
    setCheckLoading(true);
    try {
      const res = await adminApi.cacheCheck(target);
      setCheckResult(res);
    } finally {
      setCheckLoading(false);
    }
  };

  const handleClearAll = () => {
    modal.confirm({
      title: '确认清空缓存条目',
      content: '将清除下方列表中的所有缓存条目，命中率等统计信息会保留。清空后用户请求将重新访问外部API，可能导致短暂响应变慢。确定要清空吗？',
      okText: '确认清空',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        await adminApi.cacheClear();
        setCheckResult(null);
        loadData();
      },
    });
  };

  const handleClearOne = (key: string) => {
    modal.confirm({
      title: '确认清除缓存',
      content: `确定要清除缓存 "${key}" 吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        await adminApi.cacheClear(key);
        loadData();
      },
    });
  };

  if (!data) return null;

  const stats = data.stats;
  const hitRateNum = parseFloat(stats.hitRate);
  const statusInfo = statusMap[stats.tradingStatus] || { label: stats.tradingStatus, color: '#8B949E' };

  const columns = [
    {
      title: '缓存Key',
      dataIndex: 'key',
      ellipsis: { showTitle: false },
      render: (v: string) => (
        <Tooltip placement="topLeft" title={v}>
          <span className="mono" style={{ fontSize: 12, color: '#E6EDF3' }}>{v}</span>
        </Tooltip>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (v: string) => (
        <Tag color={typeColorMap[v] || '#8B949E'} style={{ borderRadius: 4, fontSize: 11 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: '已存活',
      dataIndex: 'ageSeconds',
      width: 80,
      render: (v: number) => <span className="num">{v}s</span>,
    },
    {
      title: 'TTL',
      dataIndex: 'ttlSeconds',
      width: 80,
      render: (v: number) => <span className="num">{v}s</span>,
    },
    {
      title: '剩余时间',
      key: 'remaining',
      width: 160,
      render: (_: unknown, record: CacheEntry) => (
        <Progress
          percent={Math.round((record.remainingSeconds / record.ttlSeconds) * 100)}
          format={() => `${record.remainingSeconds}s`}
          strokeColor={record.remainingSeconds < record.ttlSeconds * 0.2 ? '#E53935' : '#D4A84B'}
          trailColor="rgba(212,168,75,0.1)"
          size="small"
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'expired',
      width: 70,
      render: (v: boolean) => v
        ? <Tag color="error" style={{ borderRadius: 4 }}>过期</Tag>
        : <Tag color="success" style={{ borderRadius: 4 }}>有效</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: CacheEntry) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => handleClearOne(record.key)}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="title-icon"><CloudServerOutlined /></span>
            缓存命中检测
          </h2>
          <div className="page-desc">监控全局缓存命中率、条目状态与交易时段，支持单条/全量清理</div>
        </div>
      </div>

      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
          <div className="stat-card stat-card-full" style={{ width: '100%' }}>
            <Statistic
              title={<span style={{ color: '#8B949E' }}>命中率</span>}
              value={hitRateNum}
              suffix="%"
              valueStyle={{ color: hitRateNum >= 80 ? '#43A047' : hitRateNum >= 50 ? '#FB8C00' : '#E53935', fontWeight: 700 }}
              prefix={<ThunderboltOutlined />}
            />
            <Progress
              percent={hitRateNum}
              showInfo={false}
              strokeColor={hitRateNum >= 80 ? '#43A047' : hitRateNum >= 50 ? '#FB8C00' : '#E53935'}
              trailColor="rgba(212,168,75,0.1)"
              size="small"
              style={{ marginTop: 'auto' }}
            />
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
          <div className="stat-card stat-card-full" style={{ width: '100%' }}>
            <Statistic
              title={<span style={{ color: '#8B949E' }}>命中 / 未命中</span>}
              value={stats.hits}
              suffix={` / ${stats.misses}`}
              valueStyle={{ color: '#E6EDF3', fontWeight: 700 }}
              prefix={<CheckCircleOutlined style={{ color: '#43A047' }} />}
            />
            <div className="num" style={{ marginTop: 'auto', fontSize: 12, color: '#8B949E' }}>
              总请求: {stats.totalRequests.toLocaleString()}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
          <div className="stat-card stat-card-full" style={{ width: '100%' }}>
            <Statistic
              title={<span style={{ color: '#8B949E' }}>缓存条目</span>}
              value={stats.size}
              suffix={`/ ${stats.maxSize}`}
              valueStyle={{ color: '#D4A84B', fontWeight: 700 }}
              prefix={<CloudOutlined />}
            />
            <div className="num" style={{ marginTop: 'auto', fontSize: 12, color: '#8B949E' }}>
              过期清理: {stats.evictions}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
          <div className="stat-card stat-card-full" style={{ width: '100%' }}>
            <Statistic
              title={<span style={{ color: '#8B949E' }}>交易状态</span>}
              value={statusInfo.label}
              valueStyle={{ color: statusInfo.color, fontWeight: 700 }}
            />
            <div className="num" style={{ marginTop: 'auto', fontSize: 12, color: '#8B949E' }}>
              实时估值TTL: {stats.realtimeTTL}
            </div>
          </div>
        </Col>
      </Row>

      {/* 最近未命中明细 */}
      {data.recentMisses && data.recentMisses.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title" style={{ color: '#E53935' }}>
                最近未命中明细 ({data.recentMisses.length})
              </h3>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {[...data.recentMisses].reverse().map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderBottom: '1px solid rgba(48,54,61,0.5)',
                    fontSize: 12,
                  }}
                >
                  <span className="mono" style={{ color: '#E53935', flex: 1, wordBreak: 'break-all' }}>
                    {m.key}
                  </span>
                  <Tag color={typeColorMap[m.type] || '#8B949E'} style={{ borderRadius: 4, fontSize: 11 }}>
                    {m.type}
                  </Tag>
                  <span className="num" style={{ color: '#8B949E', whiteSpace: 'nowrap' }}>
                    {new Date(m.at).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">缓存Key检测</h3>
          </div>
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <Input
              placeholder="输入缓存Key进行检测，如 realtime_110011"
              prefix={<SearchOutlined style={{ color: '#6E7681' }} />}
              value={checkKey}
              onChange={(e) => setCheckKey(e.target.value)}
              onPressEnter={() => handleCheck()}
              style={{ flex: 1 }}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={() => handleCheck()} loading={checkLoading}>
              检测
            </Button>
          </div>
          {checkKey.trim() && (
            <div
              style={{
                background: '#21262D',
                border: '1px solid #30363D',
                borderRadius: 8,
                marginBottom: 16,
                maxHeight: 280,
                overflowY: 'auto',
              }}
            >
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #30363D', fontSize: 12, color: '#8B949E' }}>
                模糊匹配结果 ({matchResults.length})
              </div>
              {matchResults.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: '#8B949E' }}>
                  没有匹配到包含 "{checkKey.trim()}" 的缓存条目
                </div>
              ) : (
                matchResults.map((m) => (
                  <div
                    key={m.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderBottom: '1px solid rgba(48,54,61,0.5)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onClick={() => { setCheckKey(m.key); handleCheck(m.key); }}
                  >
                    <span className="mono" style={{ fontSize: 12, color: '#E6EDF3', flex: 1, wordBreak: 'break-all' }}>
                      {m.key}
                    </span>
                    <Tag color={typeColorMap[m.type] || '#8B949E'} style={{ borderRadius: 4, fontSize: 11 }}>
                      {m.type}
                    </Tag>
                    <span className="num" style={{ fontSize: 12, color: '#8B949E', whiteSpace: 'nowrap' }}>
                      剩余 {m.remainingSeconds}s
                    </span>
                    {m.expired ? (
                      <Tag color="error" style={{ borderRadius: 4 }}>过期</Tag>
                    ) : (
                      <Tag color="success" style={{ borderRadius: 4 }}>有效</Tag>
                    )}
                    <Button type="text" size="small" icon={<SearchOutlined />} />
                  </div>
                ))
              )}
            </div>
          )}
          {checkResult && (
            <div
              style={{
                background: checkResult.hit ? 'rgba(67,160,71,0.08)' : 'rgba(229,57,53,0.08)',
                border: `1px solid ${checkResult.hit ? 'rgba(67,160,71,0.3)' : 'rgba(229,57,53,0.3)'}`,
                borderRadius: 8,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {checkResult.hit
                  ? <CheckCircleOutlined style={{ color: '#43A047', fontSize: 18 }} />
                  : <CloseCircleOutlined style={{ color: '#E53935', fontSize: 18 }} />
                }
                <span style={{ fontWeight: 600, color: checkResult.hit ? '#43A047' : '#E53935' }}>
                  {checkResult.hit ? '缓存命中' : '缓存未命中'}
                </span>
                <Tag className="mono" style={{ fontSize: 11, background: 'rgba(212,168,75,0.1)', borderColor: 'rgba(212,168,75,0.3)', color: '#F0D78C', borderRadius: 4 }}>
                  {checkResult.key}
                </Tag>
              </div>
              {checkResult.hit && (
                <Row gutter={16}>
                  <Col xs={12} md={6}>
                    <div style={{ fontSize: 12, color: '#8B949E' }}>类型</div>
                    <Tag color={typeColorMap[checkResult.type || ''] || '#8B949E'} style={{ borderRadius: 4, marginTop: 4 }}>
                      {checkResult.type}
                    </Tag>
                  </Col>
                  <Col xs={12} md={6}>
                    <div style={{ fontSize: 12, color: '#8B949E' }}>已存活</div>
                    <div className="num" style={{ fontWeight: 600, color: '#E6EDF3', marginTop: 4 }}>{checkResult.ageSeconds}s</div>
                  </Col>
                  <Col xs={12} md={6}>
                    <div style={{ fontSize: 12, color: '#8B949E' }}>TTL</div>
                    <div className="num" style={{ fontWeight: 600, color: '#E6EDF3', marginTop: 4 }}>{checkResult.ttlSeconds}s</div>
                  </Col>
                  <Col xs={12} md={6}>
                    <div style={{ fontSize: 12, color: '#8B949E' }}>剩余</div>
                    <div className="num" style={{ fontWeight: 600, color: checkResult.expired ? '#E53935' : '#43A047', marginTop: 4 }}>
                      {checkResult.remainingSeconds}s {checkResult.expired ? '(已过期)' : ''}
                    </div>
                  </Col>
                </Row>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">缓存条目列表 ({data.entries.length})</h3>
            <Space wrap>
              <span style={{ fontSize: 12, color: '#8B949E' }}>自动刷新</span>
              <Switch size="small" checked={autoRefresh} onChange={setAutoRefresh} />
              {lastUpdated && (
                <span className="num" style={{ fontSize: 12, color: '#8B949E' }}>
                  更新于 {lastUpdated}
                </span>
              )}
              <Button icon={<ReloadOutlined />} onClick={() => loadData(true)}>
                刷新
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={handleClearAll}>
                清空条目
              </Button>
            </Space>
          </div>
          <Table
            columns={columns}
            dataSource={data.entries}
            rowKey="key"
            loading={loading}
            pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
            size="small"
            locale={{
              emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无缓存条目" />,
            }}
          />
        </div>
      </div>
    </div>
  );
}
