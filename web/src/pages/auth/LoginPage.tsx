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
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          .login-card {
            margin: 8px !important;
            border-radius: var(--radius-lg) !important;
          }

          .login-card > .ant-card-head {
            padding: 16px 20px !important;
            min-height: auto !important;
          }

          .login-card .ant-card-head-title {
            font-size: clamp(18px, 5vw, 22px) !important;
          }

          .login-card > .ant-card-body {
            padding: 20px 16px !important;
          }

          /* 表单项 */
          .login-card .ant-form-item {
            margin-bottom: 16px !important;
          }

          .login-card .ant-input,
          .login-card .ant-input-password {
            height: 44px !important;
            font-size: clamp(14px, 3.5vw, 15px) !important;
            border-radius: var(--radius-md) !important;
          }

          /* 登录按钮 */
          .login-card .ant-btn-primary {
            height: 46px !important;
            font-size: clamp(14px, 3.5vw, 15px) !important;
            font-weight: 600 !important;
            border-radius: var(--radius-md) !important;
          }

          /* 注册链接 */
          .login-register-link {
            font-size: clamp(13px, 3.2vw, 14px) !important;
            padding-top: 4px !important;
          }
        }
      `}</style>

      <Form onFinish={onSubmit} layout="vertical" size="large">
        <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
          <Input prefix={<UserOutlined style={{ color: 'var(--text-muted)' }} />} placeholder="用户名" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password
            prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />}
            placeholder="密码"
            iconRender={(visible) => (visible
              ? <span style={{ color: '#eee8e8' }}>👁</span>
              : <span style={{ color: '#eee8e8' }}>🙈</span>
            )}
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, fontSize: 15, fontWeight: 600 }}>
            登录
          </Button>
        </Form.Item>
        <div className="login-register-link" style={{ textAlign: 'center', fontSize: 14, color: '#f3f1f1' }}>
          还没有账号？<Link to="/register" style={{ color: 'var(--accent-gold-light)', fontWeight: 500 }}>去注册</Link>
        </div>
      </Form>
    </Card>
  );
}