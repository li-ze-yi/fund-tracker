import { Form, Input, Button, App } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { loginAdmin, useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const user = await loginAdmin(values.username, values.password);
      message.success(`欢迎回来，${user.username}`);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        '登录失败，请检查网络';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-stage">
      <div>
        <div className="login-brand rise-in">
          <div className="brand-kicker">FundTracker</div>
          <div className="brand-title">
            管理控制<em>台</em>
          </div>
          <div className="brand-sub">ADMIN · CONSOLE</div>
        </div>
        <div className="login-panel rise-in rise-in-delay-1">
          <Form name="admin-login" onFinish={onFinish} size="large" autoComplete="off">
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入管理员用户名' }]}
            >
              <Input prefix={<UserOutlined style={{ color: '#64748b' }} />} placeholder="管理员用户名" />
            </Form.Item>
            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#64748b' }} />}
                placeholder="密码"
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{ height: 44, fontWeight: 600, letterSpacing: '0.08em' }}
              >
                登 录
              </Button>
            </Form.Item>
          </Form>
        </div>
        <div
          className="login-footer-note rise-in rise-in-delay-2"
          style={{ textAlign: 'center' }}
        >
          仅限管理员账号访问 · 登录即视为接受操作审计约束
        </div>
      </div>
    </div>
  );
}
