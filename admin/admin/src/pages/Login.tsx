import { useState } from 'react';
import { Form, Input, Button, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api';
import { useAdminStore } from '../store/adminStore';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { setAuth } = useAdminStore();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await adminApi.login(values);
      if (res.user.role !== 'admin') {
        message.error('该账号不是管理员');
        return;
      }
      setAuth(res.user, res.token);
      message.success('登录成功');
      navigate('/dashboard');
    } catch {
      // 错误提示由 axios 拦截器统一处理
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <h1>养基发财</h1>
          <p>基金记账 · 管理后台</p>
        </div>
        <Form onFinish={onFinish} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input
              prefix={<UserOutlined style={{ color: '#6E7681' }} />}
              placeholder="管理员账号"
              autoFocus
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: '#6E7681' }} />}
              placeholder="密码"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: 44, fontSize: 15, fontWeight: 600 }}
            >
              登 录
            </Button>
          </Form.Item>
        </Form>
        <div className="login-footer">如忘记密码，请联系系统管理员重置</div>
      </div>
    </div>
  );
}
