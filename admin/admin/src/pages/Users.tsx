import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Input, Tag, Select, App, Modal, Form } from 'antd';
import { SearchOutlined, DeleteOutlined, UserOutlined, PlusOutlined, KeyOutlined, TeamOutlined } from '@ant-design/icons';
import { adminApi } from '../api';
import dayjs from 'dayjs';

interface UserItem {
  id: number;
  username: string;
  role: string;
  created_at: string;
  holding_count: number;
}

export default function Users() {
  const { modal, message } = App.useApp();
  const [data, setData] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdUser, setPwdUser] = useState<UserItem | null>(null);
  const [addForm] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers({ page, pageSize, keyword: keyword || undefined });
      setData(res.list);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddUser = async (values: { username: string; password: string; role: string }) => {
    setAddLoading(true);
    try {
      await adminApi.createUser(values);
      message.success('用户创建成功');
      setAddModalOpen(false);
      addForm.resetFields();
      loadData();
    } finally {
      setAddLoading(false);
    }
  };

  const handleResetPassword = async (values: { password: string }) => {
    if (!pwdUser) return;
    setPwdLoading(true);
    try {
      await adminApi.resetPassword(pwdUser.id, values.password);
      message.success(`用户 "${pwdUser.username}" 密码重置成功`);
      setPwdModalOpen(false);
      pwdForm.resetFields();
      setPwdUser(null);
    } finally {
      setPwdLoading(false);
    }
  };

  const openPwdModal = (record: UserItem) => {
    setPwdUser(record);
    setPwdModalOpen(true);
  };

  const handleUpdateRole = (record: UserItem) => {
    const newRole = record.role === 'admin' ? 'user' : 'admin';
    modal.confirm({
      title: '确认修改角色',
      content: `确定将用户 "${record.username}" 的角色从 ${record.role === 'admin' ? '管理员' : '普通用户'} 修改为 ${newRole === 'admin' ? '管理员' : '普通用户'} 吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        await adminApi.updateUserRole(record.id, newRole);
        message.success('角色更新成功');
        loadData();
      },
    });
  };

  const handleDelete = (record: UserItem) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除用户 "${record.username}" 吗？该操作将删除该用户的所有数据，且不可恢复。`,
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        await adminApi.deleteUser(record.id);
        message.success('用户删除成功');
        loadData();
      },
    });
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 80,
      render: (v: number) => <span className="num" style={{ color: '#8B949E' }}>{v}</span>,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      render: (v: string) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
          <UserOutlined style={{ color: '#D4A84B' }} />
          {v}
        </span>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 120,
      render: (v: string) => (
        <Tag color={v === 'admin' ? 'gold' : 'default'} style={{ borderRadius: 4 }}>
          {v === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '持仓基金数',
      dataIndex: 'holding_count',
      width: 120,
      render: (v: number) => <span className="num">{v}</span>,
    },
    {
      title: '注册时间',
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
      width: 240,
      render: (_: unknown, record: UserItem) => (
        <div className="table-actions">
          <Button type="text" size="small" icon={<KeyOutlined />} onClick={() => openPwdModal(record)} style={{ color: '#8B949E' }}>
            改密
          </Button>
          <Button type="text" size="small" onClick={() => handleUpdateRole(record)} style={{ color: '#D4A84B' }}>
            {record.role === 'admin' ? '设为普通用户' : '设为管理员'}
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
            <span className="title-icon"><TeamOutlined /></span>
            用户管理
          </h2>
          <div className="page-desc">管理注册用户账号、角色权限与密码</div>
        </div>
        <div className="page-actions">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            新增用户
          </Button>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <Input
            placeholder="搜索用户名"
            prefix={<SearchOutlined style={{ color: '#6E7681' }} />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            onPressEnter={loadData}
            style={{ width: 280 }}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>
            搜索
          </Button>
          <div className="spacer" />
          <span className="num" style={{ fontSize: 12, color: '#8B949E' }}>
            共 {total} 位用户
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

      <Modal
        title="新增用户"
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }}
        onOk={() => addForm.submit()}
        confirmLoading={addLoading}
        okText="创建"
        cancelText="取消"
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddUser} style={{ marginTop: 16 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined style={{ color: '#6E7681' }} />} placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6位' },
            ]}
          >
            <Input.Password placeholder="请输入密码（至少6位）" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="user" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              options={[
                { label: '普通用户', value: 'user' },
                { label: '管理员', value: 'admin' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`重置密码 - ${pwdUser?.username || ''}`}
        open={pwdModalOpen}
        onCancel={() => { setPwdModalOpen(false); pwdForm.resetFields(); setPwdUser(null); }}
        onOk={() => pwdForm.submit()}
        confirmLoading={pwdLoading}
        okText="确认重置"
        cancelText="取消"
      >
        <Form form={pwdForm} layout="vertical" onFinish={handleResetPassword} style={{ marginTop: 16 }}>
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6位' },
            ]}
          >
            <Input.Password prefix={<KeyOutlined style={{ color: '#6E7681' }} />} placeholder="请输入新密码（至少6位）" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<KeyOutlined style={{ color: '#6E7681' }} />} placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
