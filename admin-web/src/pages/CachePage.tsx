import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { ClearOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { adminService, CacheStats, CacheEntry } from '../services/adminService';
import type { ColumnsType } from 'antd/es/table';

const TYPE_COLORS: Record<string, string> = {
  realtime_: 'gold',
  confirmed_nav_: 'green',
  history_: 'geekblue',
  fund_list: 'purple',
};

function typeColor(type: string): string {
  for (const prefix of Object.keys(TYPE_COLORS)) {
    if (type.startsWith(prefix)) return TYPE_COLORS[prefix];
  }
  return 'default';
}

export default function CachePage() {
  const { message } = App.useApp();
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [checkKey, setCheckKey] = useState('');
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminService.getCacheStats({ limit: 200, keyword });
      setCache(result);
    } catch {
      message.error('缓存统计加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, message]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleCheck = async () => {
    if (!checkKey.trim()) {
      message.warning('请输入要查询的缓存 key');
      return;
    }
    setChecking(true);
    try {
      const result = await adminService.checkCacheKey(checkKey.trim());
      setCheckResult(result);
      setCheckOpen(true);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '查询失败');
    } finally {
      setChecking(false);
    }
  };

  const handleClear = async (key?: string) => {
    try {
      const result = await adminService.clearCache(key);
      message.success(result.message);
      fetchStats();
    } catch {
      message.error('清除失败');
    }
  };

  const s = cache?.stats;

  const entryColumns: ColumnsType<CacheEntry> = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      ellipsis: true,
      render: (v: string, r) => (
        <Space size={6}>
          <Typography.Text code copyable={{ text: v }} style={{ fontSize: 12 }}>
            {v}
          </Typography.Text>
          {r.expired && <Tag color="red">已过期</Tag>}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 130,
      render: (v: string) => <Tag color={typeColor(v)}>{v}</Tag>,
    },
    {
      title: '剩余 TTL',
      dataIndex: 'remainingSeconds',
      key: 'remainingSeconds',
      width: 220,
      sorter: (a, b) => a.remainingSeconds - b.remainingSeconds,
      render: (v: number, r) => (
        <Progress
          percent={Math.min(100, r.ttlSeconds > 0 ? Math.round((v / r.ttlSeconds) * 100) : 0)}
          size="small"
          strokeColor={v < 60 ? '#cf1322' : '#D4A84B'}
          format={() => `${v}s`}
        />
      ),
    },
    { title: '年龄', dataIndex: 'ageSeconds', key: 'ageSeconds', width: 90, render: (v: number) => `${v}s` },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_v, r) => (
        <Popconfirm title={`清除缓存 key "${r.key}"？`} onConfirm={() => handleClear(r.key)}>
          <Button size="small" danger>
            清除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const breakdownEntries = Object.entries(cache?.typeBreakdown ?? {}).sort((a, b) => b[1] - a[1]);
  const maxCount = breakdownEntries.length > 0 ? breakdownEntries[0][1] : 1;

  return (
    <div className="admin-page">
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in" loading={loading}>
            <Statistic title="缓存命中率" value={s?.hitRate ?? '0%'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in rise-in-delay-1" loading={loading}>
            <Statistic title="缓存条目数" value={s?.size ?? 0} suffix={`/ ${s?.maxSize ?? 0}`} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in rise-in-delay-2" loading={loading}>
            <Statistic title="累计命中" value={s?.hits ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="stat-card-gold rise-in rise-in-delay-3" loading={loading}>
            <Statistic title="累计未命中" value={s?.misses ?? 0} />
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card className="rise-in" title="类型分布" size="small" loading={loading}>
            {breakdownEntries.map(([type, count]) => (
              <div key={type} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Tag color={typeColor(type)}>{type}</Tag>
                  <Typography.Text type="secondary">{count}</Typography.Text>
                </div>
                <Progress
                  percent={Math.max(2, Math.round((count / maxCount) * 100))}
                  showInfo={false}
                  size="small"
                  strokeColor="#D4A84B"
                />
              </div>
            ))}
            {breakdownEntries.length === 0 && !loading && (
              <Typography.Text type="secondary">暂无缓存条目</Typography.Text>
            )}
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card
            className="rise-in rise-in-delay-1"
            size="small"
            title="缓存条目"
            extra={
              <Space>
                <Input
                  placeholder="按 key 过滤"
                  prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                  size="small"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  allowClear
                  style={{ width: 200 }}
                />
                <Input
                  placeholder="精确查询 key"
                  prefix={<EyeOutlined style={{ color: '#94a3b8' }} />}
                  size="small"
                  value={checkKey}
                  onChange={(e) => setCheckKey(e.target.value)}
                  style={{ width: 240 }}
                />
                <Button size="small" loading={checking} onClick={handleCheck}>
                  查询
                </Button>
                <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchStats()} />
                <Popconfirm
                  title="清除全部缓存条目？"
                  description="统计信息保留，条目清除后下次请求将回源重建。"
                  okText="全部清除"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleClear()}
                >
                  <Button size="small" danger icon={<ClearOutlined />}>
                    全部清除
                  </Button>
                </Popconfirm>
              </Space>
            }
          >
            <Table
              rowKey="key"
              size="small"
              columns={entryColumns}
              dataSource={cache?.entries ?? []}
              loading={loading}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              locale={{ emptyText: '暂无缓存条目' }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="缓存条目详情"
        open={checkOpen}
        onCancel={() => setCheckOpen(false)}
        footer={null}
        width={620}
      >
        {checkResult && (
          <div>
            <Typography.Paragraph>
              <Typography.Text type="secondary">Key：</Typography.Text>
              <Typography.Text code copyable>
                {checkResult.key}
              </Typography.Text>
            </Typography.Paragraph>
            {checkResult.hit ? (
              <>
                <Typography.Paragraph>
                  <Typography.Text type="secondary">类型：</Typography.Text>
                  <Tag color={typeColor(checkResult.type)}>{checkResult.type}</Tag>
                </Typography.Paragraph>
                <Typography.Paragraph>
                  <Typography.Text type="secondary">剩余 TTL：</Typography.Text>
                  {checkResult.remainingSeconds}s（TTL {checkResult.ttlSeconds}s）
                </Typography.Paragraph>
                <Typography.Paragraph type="secondary">缓存值：</Typography.Paragraph>
                <pre
                  style={{
                    maxHeight: 300,
                    overflow: 'auto',
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(148, 163, 184, 0.1)',
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(checkResult.data ?? checkResult.value ?? '(无数据)', null, 2)}
                </pre>
              </>
            ) : (
              <Typography.Paragraph type="secondary">该 key 未命中（不存在或已过期）。</Typography.Paragraph>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
