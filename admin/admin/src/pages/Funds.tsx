import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Input, Tag, Select, Space, App } from 'antd';
import { SearchOutlined, DeleteOutlined, SyncOutlined, FundOutlined } from '@ant-design/icons';
import { adminApi } from '../api';
import dayjs from 'dayjs';

interface FundItem {
  id: number;
  code: string;
  name: string;
  type: string;
  created_at: string;
}

export default function Funds() {
  const { modal, message } = App.useApp();
  const [data, setData] = useState<FundItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [syncing, setSyncing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listFunds({
        page,
        pageSize,
        keyword: keyword || undefined,
        type: type || undefined,
      });
      setData(res.list);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, type]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    modal.confirm({
      title: '同步基金数据',
      content: '将从东方财富拉取全市场基金数据并更新到数据库，该操作可能需要较长时间，确认执行？',
      okText: '确认同步',
      cancelText: '取消',
      onOk: async () => {
        setSyncing(true);
        try {
          const res = await adminApi.syncFunds();
          message.success(`同步完成：共 ${res.total} 只基金，新增 ${res.inserted} 只`);
          loadData();
        } finally {
          setSyncing(false);
        }
      },
    });
  };

  const handleDelete = (record: FundItem) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除基金 "${record.name}"（${record.code}）吗？`,
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        await adminApi.deleteFund(record.code);
        message.success('基金删除成功');
        loadData();
      },
    });
  };

  const typeColorMap: Record<string, string> = {
    '股票型': 'red',
    '混合型': 'orange',
    '债券型': 'green',
    '货币型': 'cyan',
    '指数型': 'blue',
    'ETF': 'purple',
    'QDII': 'geekblue',
    'FOF': 'magenta',
  };

  const columns = [
    {
      title: '基金代码',
      dataIndex: 'code',
      width: 120,
      render: (v: string) => (
        <span className="mono" style={{ fontWeight: 600, color: '#F0D78C' }}>{v}</span>
      ),
    },
    {
      title: '基金名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (v: string) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
          <FundOutlined style={{ color: '#D4A84B' }} />
          {v}
        </span>
      ),
    },
    {
      title: '基金类型',
      dataIndex: 'type',
      width: 120,
      render: (v: string) => (
        <Tag color={typeColorMap[v] || 'default'} style={{ borderRadius: 4 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v: string) => (
        <span className="num" style={{ fontSize: 12, color: '#8B949E' }}>
          {dayjs(v).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: FundItem) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
          删除
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="title-icon"><FundOutlined /></span>
            基金管理
          </h2>
          <div className="page-desc">维护基金库数据，支持按代码/名称检索与全市场同步</div>
        </div>
        <div className="page-actions">
          <Button icon={<SyncOutlined spin={syncing} />} onClick={handleSync} loading={syncing} style={{ color: '#D4A84B', borderColor: '#D4A84B' }}>
            同步基金数据
          </Button>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <Input
            placeholder="搜索基金代码或名称"
            prefix={<SearchOutlined style={{ color: '#6E7681' }} />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            onPressEnter={loadData}
            style={{ width: 280 }}
            allowClear
          />
          <Select
            placeholder="基金类型"
            value={type || undefined}
            onChange={(v) => { setType(v || ''); setPage(1); }}
            allowClear
            style={{ width: 160 }}
            options={[
              { label: '股票型', value: '股票型' },
              { label: '混合型', value: '混合型' },
              { label: '债券型', value: '债券型' },
              { label: '货币型', value: '货币型' },
              { label: '指数型', value: '指数型' },
              { label: 'ETF', value: 'ETF' },
              { label: 'QDII', value: 'QDII' },
              { label: 'FOF', value: 'FOF' },
            ]}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>
            搜索
          </Button>
          <div className="spacer" />
          <span className="num" style={{ fontSize: 12, color: '#8B949E' }}>
            共 {total} 只基金
          </span>
        </div>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
        />
      </div>
    </div>
  );
}
