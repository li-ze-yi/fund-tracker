import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Form, Input, Button, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const { message } = App.useApp();

  const onSubmit = async (values: { username: string; password: string; confirmPassword: string }) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
    if (values.password.length < 6) {
      message.error('密码至少6位');
      return;
    }
    setLoading(true);
    try {
      const data = await authService.register(values.username, values.password, values.confirmPassword);
      login(data.token, data.user);
      message.success('注册成功');
      navigate('/portfolio');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className="register-card"
      title="注册 养基发财"
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
          .register-card {
            margin: 8px !important;
            border-radius: var(--radius-lg) !important;
          }

          .register-card > .ant-card-head {
            padding: 16px 20px !important;
            min-height: auto !important;
          }

          .register-card .ant-card-head-title {
            font-size: clamp(18px, 5vw, 22px) !important;
          }

          .register-card > .ant-card-body {
            padding: 20px 16px !important;
          }

          /* 表单项 */
          .register-card .ant-form-item {
            margin-bottom: 14px !important;
          }

          .register-card .ant-input,
          .register-card .ant-input-password {
            height: 44px !important;
            font-size: clamp(14px, 3.5vw, 15px) !important;
            border-radius: var(--radius-md) !important;
          }

          /* 注册按钮 */
          .register-card .ant-btn-primary {
            height: 46px !important;
            font-size: clamp(14px, 3.5vw, 15px) !important;
            font-weight: 600 !important;
            border-radius: var(--radius-md) !important;
          }

          /* 登录链接 */
          .register-login-link {
            font-size: clamp(13px, 3.2vw, 14px) !important;
            padding-top: 4px !important;
          }
        }
      `}</style>

      <Form onFinish={onSubmit} layout="vertical" size="large">
        <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
          <Input prefix={<UserOutlined style={{ color: 'var(--text-muted)' }} />} placeholder="用户名" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}>
          <Input.Password
            prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />}
            placeholder="密码（至少6位）"
            iconRender={(visible) => (visible
              ? <span style={{ color: 'var(--text-secondary)' }}>👁</span>
              : <span style={{ color: 'var(--text-secondary)' }}>🙈</span>
            )}
          />
        </Form.Item>
        <Form.Item name="confirmPassword" rules={[{ required: true, message: '请确认密码' }]}>
          <Input.Password
            prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />}
            placeholder="确认密码"
            iconRender={(visible) => (visible
              ? <span style={{ color: 'var(--text-secondary)' }}>👁</span>
              : <span style={{ color: 'var(--text-secondary)' }}>🙈</span>
            )}
          />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, fontSize: 15, fontWeight: 600 }}>
            注册
          </Button>
        </Form.Item>
        <div className="register-login-link" style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
          已有账号？<Link to="/login" style={{ color: 'var(--accent-gold-light)', fontWeight: 500 }}>去登录</Link>
        </div>
      </Form>
    </Card>
  );
}
