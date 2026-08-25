import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Form, Input, Button, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const { message } = App.useApp();

  const onSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const data = await authService.login(values.username, values.password);
      login(data.token, data.user);
      message.success('登录成功');
      navigate('/portfolio');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className="login-card"
      title="登录 养基发财"
      style={{
        width: 420,
        maxWidth: '100%',
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-default)',
        boxShadow: 'var(--shadow-lg)',
      }}
      styles={{
        title: {
          textAlign: 'center',
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        },
      }}
    >
      <Form onFinish={onSubmit} layout="vertical" size="large">
        <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
          <Input prefix={<UserOutlined style={{ color: 'var(--text-muted)' }} />} placeholder="用户名" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password
            prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />}
            placeholder="密码"
            iconRender={(visible) => (visible
              ? <span style={{ color: 'var(--text-secondary)' }}>👁</span>
              : <span style={{ color: 'var(--text-secondary)' }}>🙈</span>
            )}
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, fontSize: 15, fontWeight: 600 }}>
            登录
          </Button>
        </Form.Item>
        <div className="login-register-link" style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
          还没有账号？<Link to="/register" style={{ color: 'var(--accent-gold-light)', fontWeight: 500 }}>去注册</Link>
        </div>
      </Form>
    </Card>
  );
}