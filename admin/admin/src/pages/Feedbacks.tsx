import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Input, App, Image } from 'antd';
import { SearchOutlined, DeleteOutlined, MessageOutlined, PictureOutlined } from '@ant-design/icons';
import { adminApi } from '../api';
import dayjs from 'dayjs';

interface FeedbackItem {
  id: number;
  user_id: number;
  content: string;
  screenshot_url: string | null;
  username: string;
  created_at: string;
}

export default function Feedbacks() {
  const { modal, message } = App.useApp();
  const [data, setData] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listFeedbacks({
        page,
        pageSize,
        keyword: keyword || undefined,
      });
      setData(res.list);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = (record: FeedbackItem) => {
    modal.confirm({
      title: '确认删除',
      content: (
        <div>
          确定要删除该反馈吗？
          <div
            style={{
              marginTop: 8,
              padding: '8px 12px',
              background: '#21262D',
              borderRadius: 6,
              fontSize: 13,
              color: '#8B949E',
              maxHeight: 100,
              overflow: 'auto',
            }}
          >
            {record.content}
          </div>
        </div>
      ),
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        await adminApi.deleteFeedback(record.id);
        message.success('反馈删除成功');
        loadData();
      },
    });
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
      render: (v: number) => <span className="num" style={{ color: '#8B949E' }}>{v}</span>,
    },
    {
      title: '用户',
      dataIndex: 'username',
      width: 130,
      render: (v: string, record: FeedbackItem) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #D4A84B, #F0D78C)',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: '#111827',
              flexShrink: 0,
            }}
          >
            {v?.charAt(0).toUpperCase() || '?'}
          </span>
          <span style={{ fontWeight: 500 }}>{v || `用户${record.user_id}`}</span>
        </span>
      ),
    },
    {
      title: '反馈内容',
      dataIndex: 'content',
      render: (v: string) => (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <MessageOutlined style={{ color: '#D4A84B', marginTop: 3, flexShrink: 0 }} />
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{v}</span>
        </div>
      ),
    },
    {
      title: '截图',
      key: 'screenshot',
      width: 110,
      render: (_: unknown, record: FeedbackItem) =>
        record.screenshot_url ? (
          <Image
            src={record.screenshot_url}
            width={56}
            height={56}
            style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #30363D' }}
            preview={{ mask: <PictureOutlined style={{ color: '#fff', fontSize: 16 }} /> }}
          />
        ) : (
          <span style={{ color: '#6E7681', fontSize: 12 }}>无</span>
        ),
    },
    {
      title: '提交时间',
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
      width: 90,
      render: (_: unknown, record: FeedbackItem) => (
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
            <span className="title-icon"><MessageOutlined /></span>
            意见反馈
          </h2>
          <div className="page-desc">查看用户提交的意见反馈与截图</div>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <Input
            placeholder="搜索反馈内容或用户名"
            prefix={<SearchOutlined style={{ color: '#6E7681' }} />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            onPressEnter={loadData}
            style={{ width: 300 }}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>
            搜索
          </Button>
          <div className="spacer" />
          <span className="num" style={{ fontSize: 12, color: '#8B949E' }}>
            共 {total} 条反馈
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
