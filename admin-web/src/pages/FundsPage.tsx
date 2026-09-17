import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from 'antd';
import { CloudSyncOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { adminService, FundRow } from '../services/adminService';
import type { ColumnsType } from 'antd/es/table';

export default function FundsPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<FundRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<string>('');
  const [typeOptions, setTypeOptions] = useState<{ value: string; label: string }[]>([]);
  const [syncing, setSyncing] = useState(false);

  const fetchFunds = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminService.listFunds({ page, pageSize, keyword, type });
      setData(result.list);
      setTotal(result.total);
    } catch {
      message.error('基金列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, type, message]);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  // 类型筛选选项：复用仪表盘接口的 byType
  useEffect(() => {
    adminService
      .getDashboard()
      .then((d) =>
        setTypeOptions(
          d.fundStats.byType.map((x) => ({ value: x.type, label: `${x.type}（${x.count}）` }))
        )
      )
      .catch(() => {});
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await adminService.syncFunds();
      message.success(`同步完成：共 ${result.total} 只，写入 ${result.inserted} 条`);
      fetchFunds();
    } catch {
      message.error('同步失败，请稍后重试');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (code: string) => {
    try {
      await adminService.deleteFund(code);
      message.success(`基金 ${code} 删除成功`);
      fetchFunds();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败');
    }
  };

  const columns: ColumnsType<FundRow> = [
    { title: '代码', dataIndex: 'code', key: 'code', width: 100 },
    { title: '基金名称', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 140,
      render: (v: string) => <Tag color={v === '未知' ? 'default' : 'gold'}>{v}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_v, record) => (
        <Popconfirm
          title={`确认删除基金 ${record.code}？`}
          description="仅删除基金库基础信息，用户持仓不受影响。"
          okText="删除"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete(record.code)}
        >
          <Button size="small" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <Card className="rise-in">
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Space wrap>
            <Input
              placeholder="搜索代码 / 名称"
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={keyword}
              onChange={(e) => {
                setPage(1);
                setKeyword(e.target.value);
              }}
              allowClear
              style={{ width: 220 }}
            />
            <Select
              placeholder="类型筛选"
              value={type || undefined}
              onChange={(v) => {
                setPage(1);
                setType(v ?? '');
              }}
              allowClear
              options={typeOptions}
              style={{ minWidth: 150 }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => fetchFunds()}>
              刷新
            </Button>
          </Space>
          <Popconfirm
            title="同步全部基金列表？"
            description="从数据源全量拉取基金基础信息，数据量较大时耗时较长。"
            onConfirm={handleSync}
          >
            <Button type="primary" icon={<CloudSyncOutlined />} loading={syncing}>
              同步基金库
            </Button>
          </Popconfirm>
        </Space>
        <Table
          rowKey="code"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 只基金`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>
    </div>
  );
}
