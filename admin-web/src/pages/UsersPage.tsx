import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
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
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { adminService, UserRow } from '../services/adminService';
import type { ColumnsType } from 'antd/es/table';

export default function UsersPage() {
  const { message, modal } = App.useApp();
  const [data, setData] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [createForm] = Form.useForm();
  const [resetForm] = Form.useForm();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminService.listUsers({ page, pageSize, keyword });
      setData(result.list);
      setTotal(result.total);
    } catch {
      message.error('用户列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, message]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (values: { username: string; password: string; role: 'user' | 'admin' }) => {
    try {
      await adminService.createUser(values);
      message.success('用户创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      fetchUsers();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '创建失败');
    }
  };

  const handleRoleChange = async (user: UserRow, role: 'user' | 'admin') => {
    modal.confirm({
      title: '确认变更角色',
      content: `将用户「${user.username}」的角色变更为 ${role === 'admin' ? '管理员' : '普通用户'}？`,
      okButtonProps: { danger: role === 'user' },
      onOk: async () => {
        try {
          await adminService.updateUserRole(user.id, role);
          message.success('角色更新成功');
          fetchUsers();
        } catch (err: any) {
          message.error(err?.response?.data?.message || '角色更新失败');
        }
      },
    });
  };

  const handleResetPassword = async (values: { password: string }) => {
    if (!resetTarget) return;
    try {
      await adminService.resetPassword(resetTarget.id, values.password);
      message.success('密码重置成功');
      setResetTarget(null);
      resetForm.resetFields();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '密码重置失败');
    }
  };

  const handleDelete = async (user: UserRow) => {
    try {
      await adminService.deleteUser(user.id);
      message.success('用户删除成功');
      fetchUsers();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '删除失败');
    }
  };

  const columns: ColumnsType<UserRow> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (v: string, r) => (
        <Space>
          <span>{v}</span>
          {r.role === 'admin' && <Tag color="gold">管理员</Tag>}
        </Space>
      ),
    },
    { title: '持仓数', dataIndex: 'holding_count', key: 'holding_count', width: 90 },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_v, record) => (
        <Space size={4}>
          <Select
            size="small"
            value={record.role}
            style={{ width: 110 }}
            onChange={(role) => handleRoleChange(record, role)}
            options={[
              { value: 'user', label: '普通用户' },
              { value: 'admin', label: '管理员' },
            ]}
          />
          <Button size="small" onClick={() => setResetTarget(record)}>
            重置密码
          </Button>
          <Popconfirm
            title="确认删除该用户？"
            description="删除后其持仓、交易等数据将一并清除，不可恢复。"
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

  return (
    <div className="admin-page">
      <Card className="rise-in">
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <Input
              placeholder="搜索用户名"
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={keyword}
              onChange={(e) => {
                setPage(1);
                setKeyword(e.target.value);
              }}
              allowClear
              style={{ width: 240 }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => fetchUsers()}>
              刷新
            </Button>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建用户
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
            showTotal: (t) => `共 ${t} 个用户`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* 创建用户 */}
      <Modal
        title="创建用户"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="user">
            <Radio.Group>
              <Radio value="user">普通用户</Radio>
              <Radio value="admin">管理员</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码 */}
      <Modal
        title={`重置密码：${resetTarget?.username ?? ''}`}
        open={!!resetTarget}
        onCancel={() => {
          setResetTarget(null);
          resetForm.resetFields();
        }}
        onOk={() => resetForm.submit()}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          重置后请将新密码告知用户，原密码立即失效。
        </Typography.Paragraph>
        <Form form={resetForm} layout="vertical" onFinish={handleResetPassword}>
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
