import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Input, Popconfirm, Space, Table, Tooltip } from 'antd';
import { PictureOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { adminService, FeedbackRow } from '../services/adminService';
import type { ColumnsType } from 'antd/es/table';

export default function FeedbacksPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<FeedbackRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminService.listFeedbacks({ page, pageSize, keyword });
      setData(result.list);
      setTotal(result.total);
    } catch {
      message.error('反馈列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleDelete = async (record: FeedbackRow) => {
    try {
      await adminService.deleteFeedback(record.id);
      message.success('反馈已删除');
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败');
    }
  };

  const columns: ColumnsType<FeedbackRow> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 64 },
    { title: '用户', dataIndex: 'username', key: 'username', width: 130 },
    {
      title: '反馈内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: { showTitle: false },
      render: (v: string) => (
        <Tooltip title={v} placement="topLeft">
          <span style={{ whiteSpace: 'pre-wrap' }}>{v}</span>
        </Tooltip>
      ),
    },
    {
      title: '截图',
      dataIndex: 'screenshot_url',
      key: 'screenshot_url',
      width: 70,
      render: (v: string | null) =>
        v ? (
          <a href={v} target="_blank" rel="noreferrer">
            <PictureOutlined /> 查看
          </a>
        ) : (
          '-'
        ),
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_v, record) => (
        <Popconfirm
          title="确认删除该反馈？"
          okText="删除"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete(record)}
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
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索内容 / 用户名"
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={keyword}
            onChange={(e) => {
              setPage(1);
              setKeyword(e.target.value);
            }}
            allowClear
            style={{ width: 240 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>
            刷新
          </Button>
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条反馈`,
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
