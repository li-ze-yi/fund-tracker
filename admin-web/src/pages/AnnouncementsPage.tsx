import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { adminService, AnnouncementRow } from '../services/adminService';
import type { ColumnsType } from 'antd/es/table';

interface AnnouncementFormValues {
  title: string;
  content: string;
  type: 'popup' | 'banner';
  status: 'active' | 'inactive';
  range?: [Dayjs | null, Dayjs | null] | null;
}

export default function AnnouncementsPage() {
  const { message } = App.useApp();
  const [data, setData] = useState<AnnouncementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');

  const [editTarget, setEditTarget] = useState<AnnouncementRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminService.listAnnouncements({ page, pageSize, keyword, status });
      setData(result.list);
      setTotal(result.total);
    } catch {
      message.error('公告列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, status, message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const buildBody = (values: AnnouncementFormValues) => ({
    title: values.title,
    content: values.content,
    type: values.type,
    status: values.status,
    startDate: values.range?.[0] ? values.range[0].format('YYYY-MM-DD HH:mm:ss') : null,
    endDate: values.range?.[1] ? values.range[1].format('YYYY-MM-DD HH:mm:ss') : null,
  });

  const handleCreate = async (values: AnnouncementFormValues) => {
    setSaving(true);
    try {
      await adminService.createAnnouncement(buildBody(values));
      message.success('公告创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (record: AnnouncementRow) => {
    setEditTarget(record);
    editForm.setFieldsValue({
      title: record.title,
      content: record.content,
      type: record.type,
      status: record.status,
      range:
        record.start_date || record.end_date
          ? [record.start_date ? dayjs(record.start_date) : null, record.end_date ? dayjs(record.end_date) : null]
          : null,
    });
  };

  const handleEdit = async (values: AnnouncementFormValues) => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await adminService.updateAnnouncement(editTarget.id, buildBody(values));
      message.success('公告更新成功');
      setEditTarget(null);
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRepublish = async (record: AnnouncementRow) => {
    try {
      await adminService.republishAnnouncement(record.id);
      message.success('已重新发布，所有用户将再次看到此公告');
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '重新发布失败');
    }
  };

  const handleDelete = async (record: AnnouncementRow) => {
    try {
      await adminService.deleteAnnouncement(record.id);
      message.success('公告删除成功');
      fetchList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败');
    }
  };

  const columns: ColumnsType<AnnouncementRow> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 64 },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (v: string, r) => (
        <Space size={6}>
          <span>{v}</span>
          <Tag color={r.type === 'popup' ? 'purple' : 'geekblue'}>
            {r.type === 'popup' ? '弹窗' : '横幅'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: string) =>
        v === 'active' ? <Tag color="green">生效中</Tag> : <Tag>已停用</Tag>,
    },
    {
      title: '生效时间',
      key: 'range',
      width: 300,
      render: (_v, r) => (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {r.start_date ? dayjs(r.start_date).format('MM-DD HH:mm') : '不限'} ~{' '}
          {r.end_date ? dayjs(r.end_date).format('MM-DD HH:mm') : '不限'}
        </Typography.Text>
      ),
    },
    { title: '版本', dataIndex: 'publish_version', key: 'publish_version', width: 70 },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      key: 'action',
      width: 210,
      render: (_v, record) => (
        <Space size={4}>
          <Button size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="重新发布公告？"
            description="版本号 +1，所有用户将再次看到此公告。"
            onConfirm={() => handleRepublish(record)}
          >
            <Button size="small" icon={<ThunderboltOutlined />}>
              重发
            </Button>
          </Popconfirm>
          <Popconfirm
            title="确认删除该公告？"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const formItems = (
    <>
      <Form.Item
        name="title"
        label="标题"
        rules={[{ required: true, message: '请输入公告标题' }]}
      >
        <Input placeholder="公告标题" maxLength={100} showCount />
      </Form.Item>
      <Form.Item
        name="content"
        label="内容"
        rules={[{ required: true, message: '请输入公告内容' }]}
      >
        <Input.TextArea placeholder="公告内容" rows={5} maxLength={2000} showCount />
      </Form.Item>
      <Form.Item name="type" label="展示形式" initialValue="popup">
        <Radio.Group>
          <Radio value="popup">弹窗（用户进入时弹出）</Radio>
          <Radio value="banner">横幅（页面顶部展示）</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="status" label="状态" initialValue="active">
        <Radio.Group>
          <Radio value="active">生效</Radio>
          <Radio value="inactive">停用</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="range" label="生效时间范围（留空表示长期有效）">
        <DatePicker.RangePicker showTime style={{ width: '100%' }} />
      </Form.Item>
    </>
  );

  return (
    <div className="admin-page">
      <Card className="rise-in">
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Space wrap>
            <Input
              placeholder="搜索标题 / 内容"
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
              placeholder="状态筛选"
              value={status || undefined}
              onChange={(v) => {
                setPage(1);
                setStatus(v ?? '');
              }}
              allowClear
              options={[
                { value: 'active', label: '生效中' },
                { value: 'inactive', label: '已停用' },
              ]}
              style={{ width: 130 }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>
              刷新
            </Button>
          </Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields();
              setCreateOpen(true);
            }}
          >
            新建公告
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
            showTotal: (t) => `共 ${t} 条公告`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      <Modal
        title="新建公告"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={saving}
        destroyOnClose
        width={560}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          {formItems}
        </Form>
      </Modal>

      <Modal
        title={`编辑公告 #${editTarget?.id ?? ''}`}
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        onOk={() => editForm.submit()}
        confirmLoading={saving}
        destroyOnClose
        width={560}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          {formItems}
        </Form>
      </Modal>
    </div>
  );
}
