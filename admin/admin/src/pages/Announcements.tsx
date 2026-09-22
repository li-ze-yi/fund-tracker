import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Input, Tag, App, Modal, Form, Select, DatePicker } from 'antd';
import { SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, BellOutlined, SendOutlined } from '@ant-design/icons';
import { adminApi } from '../api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

interface AnnouncementItem {
  id: number;
  title: string;
  content: string;
  type: 'popup' | 'banner';
  status: 'active' | 'inactive';
  publish_version: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export default function Announcements() {
  const { modal, message } = App.useApp();
  const [data, setData] = useState<AnnouncementItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editRecord, setEditRecord] = useState<AnnouncementItem | null>(null);
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listAnnouncements({
        page,
        pageSize,
        keyword: keyword || undefined,
        status: statusFilter || undefined,
      });
      setData(res.list);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditRecord(null);
    form.resetFields();
    setEditModalOpen(true);
  };

  const openEditModal = (record: AnnouncementItem) => {
    setEditRecord(record);
    form.setFieldsValue({
      title: record.title,
      content: record.content,
      type: record.type,
      status: record.status,
      dateRange: record.start_date && record.end_date
        ? [dayjs(record.start_date), dayjs(record.end_date)]
        : undefined,
    });
    setEditModalOpen(true);
  };

  const handleSubmit = async (values: {
    title: string;
    content: string;
    type: string;
    status: string;
    dateRange?: [dayjs.Dayjs, dayjs.Dayjs];
  }) => {
    setEditLoading(true);
    try {
      const payload = {
        title: values.title,
        content: values.content,
        type: values.type,
        status: values.status,
        startDate: values.dateRange?.[0]?.format('YYYY-MM-DD HH:mm:ss') || null,
        endDate: values.dateRange?.[1]?.format('YYYY-MM-DD HH:mm:ss') || null,
      };
      if (editRecord) {
        await adminApi.updateAnnouncement(editRecord.id, payload);
        message.success('公告更新成功');
      } else {
        await adminApi.createAnnouncement(payload);
        message.success('公告创建成功');
      }
      setEditModalOpen(false);
      form.resetFields();
      loadData();
    } finally {
      setEditLoading(false);
    }
  };

  const handleRepublish = (record: AnnouncementItem) => {
    modal.confirm({
      title: '确认重新发布',
      content: `重新发布后，所有已关闭此公告的用户将再次看到公告 "${record.title}"，确定继续？`,
      okText: '重新发布',
      cancelText: '取消',
      onOk: async () => {
        await adminApi.republishAnnouncement(record.id);
        message.success('公告已重新发布');
        loadData();
      },
    });
  };

  const handleDelete = (record: AnnouncementItem) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除公告 "${record.title}" 吗？`,
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        await adminApi.deleteAnnouncement(record.id);
        message.success('公告删除成功');
        loadData();
      },
    });
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
      render: (v: number) => <span className="num" style={{ color: '#8B949E' }}>{v}</span>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (v: string) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
          <BellOutlined style={{ color: '#D4A84B' }} />
          {v}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      render: (v: string) => (
        <Tag color={v === 'popup' ? 'purple' : 'blue'} style={{ borderRadius: 4 }}>
          {v === 'popup' ? '弹窗' : '横幅'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v: string) => (
        <Tag color={v === 'active' ? 'green' : 'default'} style={{ borderRadius: 4 }}>
          {v === 'active' ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '版本',
      dataIndex: 'publish_version',
      width: 70,
      render: (v: number) => (
        <span className="num" style={{ color: '#8B949E' }}>v{v}</span>
      ),
    },
    {
      title: '生效时间',
      width: 200,
      render: (_: unknown, record: AnnouncementItem) => {
        if (!record.start_date && !record.end_date) return <span style={{ color: '#8B949E' }}>长期有效</span>;
        return (
          <span className="num" style={{ fontSize: 12, color: '#8B949E' }}>
            {record.start_date ? dayjs(record.start_date).format('MM-DD HH:mm') : '不限'}
            {' ~ '}
            {record.end_date ? dayjs(record.end_date).format('MM-DD HH:mm') : '不限'}
          </span>
        );
      },
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
      width: 200,
      render: (_: unknown, record: AnnouncementItem) => (
        <div className="table-actions">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} style={{ color: '#D4A84B' }}>
            编辑
          </Button>
          <Button type="text" size="small" icon={<SendOutlined />} onClick={() => handleRepublish(record)} style={{ color: '#60A5FA' }}>
            重发
          </Button>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="title-icon"><BellOutlined /></span>
            公告管理
          </h2>
          <div className="page-desc">发布与维护 App 内弹窗、横幅公告</div>
        </div>
        <div className="page-actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新增公告
          </Button>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <Input
            placeholder="搜索公告标题"
            prefix={<SearchOutlined style={{ color: '#6E7681' }} />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            onPressEnter={loadData}
            style={{ width: 240 }}
            allowClear
          />
          <Select
            placeholder="筛选状态"
            value={statusFilter || undefined}
            onChange={(v) => { setStatusFilter(v || ''); setPage(1); }}
            allowClear
            style={{ width: 130 }}
            options={[
              { label: '全部', value: '' },
              { label: '启用', value: 'active' },
              { label: '停用', value: 'inactive' },
            ]}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>
            搜索
          </Button>
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

      <Modal
        title={editRecord ? '编辑公告' : '新增公告'}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); form.resetFields(); setEditRecord(null); }}
        onOk={() => form.submit()}
        confirmLoading={editLoading}
        okText={editRecord ? '保存' : '创建'}
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
          <Form.Item name="title" label="公告标题" rules={[{ required: true, message: '请输入公告标题' }]}>
            <Input placeholder="请输入公告标题" />
          </Form.Item>
          <Form.Item name="content" label="公告内容" rules={[{ required: true, message: '请输入公告内容' }]}>
            <TextArea rows={6} placeholder="请输入公告内容" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item
              name="type"
              label="公告类型"
              initialValue="popup"
              rules={[{ required: true, message: '请选择类型' }]}
              style={{ flex: 1 }}
            >
              <Select
                options={[
                  { label: '弹窗 (popup)', value: 'popup' },
                  { label: '横幅 (banner)', value: 'banner' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="status"
              label="状态"
              initialValue="active"
              rules={[{ required: true, message: '请选择状态' }]}
              style={{ flex: 1 }}
            >
              <Select
                options={[
                  { label: '启用', value: 'active' },
                  { label: '停用', value: 'inactive' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="dateRange" label="生效时间范围（不填则为长期有效）">
            <RangePicker showTime style={{ width: '100%' }} placeholder={['开始时间', '结束时间']} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
