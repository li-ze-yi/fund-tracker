import { useState } from 'react';
import { Modal, App } from 'antd';
import { MessageOutlined, CloseOutlined } from '@ant-design/icons';
import { feedbackService } from '../../services/feedbackService';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const handleSubmit = async () => {
    if (!content.trim()) {
      message.warning('请输入反馈内容');
      return;
    }
    setSubmitting(true);
    try {
      await feedbackService.submit(content.trim());
      message.success('感谢您的反馈，我们会认真对待每一条意见！');
      setContent('');
      onClose();
    } catch {
      message.error('提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setContent('');
    onClose();
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={isMobile ? 'calc(100vw - 40px)' : 440}
      closable={false}
      maskClosable={true}
      destroyOnHidden
      centered
      styles={{
        content: {
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          padding: 0,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
        },
        body: {
          padding: 0,
        },
      }}
    >
      {/* 顶部金色装饰条 */}
      <div style={{
        height: 4,
        background: 'linear-gradient(90deg, var(--accent-gold), var(--accent-gold-light), var(--accent-gold))',
      }} />

      <div style={{ padding: '28px 28px 24px' }}>
        {/* 标题行 */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-gold-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <MessageOutlined style={{ fontSize: 20, color: 'var(--accent-gold)' }} />
            </div>
            <h3 style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              lineHeight: 1.4,
            }}>
              意见反馈
            </h3>
          </div>
          <div
            onClick={handleClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              marginLeft: 12,
              transition: 'all var(--transition-fast)',
              color: 'var(--text-muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-card-hover)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            <CloseOutlined style={{ fontSize: 14 }} />
          </div>
        </div>

        {/* 副标题 */}
        <p style={{
          margin: '0 0 16px',
          fontSize: 13,
          color: 'var(--text-tertiary)',
          lineHeight: 1.6,
        }}>
          您的每一条建议都是我们改进的动力。请详细描述您遇到的问题或想要的功能，我们会尽快处理。
        </p>

        {/* 输入框 */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="请输入您的反馈内容..."
          rows={6}
          maxLength={500}
          style={{
            width: '100%',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            borderRadius: 'var(--radius-md)',
            fontSize: 14,
            fontFamily: 'inherit',
            padding: '10px 12px',
            resize: 'vertical',
            minHeight: 140,
            lineHeight: 1.6,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {content.length}/500
        </div>

        {/* 底部按钮 */}
        <div style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
        }}>
          <button
            onClick={handleClose}
            style={{
              border: '1px solid var(--border-default)',
              outline: 'none',
              padding: '10px 28px',
              borderRadius: 'var(--radius-full)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--text-secondary)',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--text-muted)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !content.trim()}
            style={{
              border: 'none',
              outline: 'none',
              padding: '10px 28px',
              borderRadius: 'var(--radius-full)',
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting || !content.trim() ? 'not-allowed' : 'pointer',
              background: submitting || !content.trim()
                ? 'var(--border-default)'
                : 'linear-gradient(135deg, var(--accent-gold), var(--accent-gold-light))',
              color: submitting || !content.trim() ? 'var(--text-muted)' : '#111827',
              transition: 'all var(--transition-fast)',
              boxShadow: submitting || !content.trim() ? 'none' : 'var(--shadow-sm)',
              opacity: submitting || !content.trim() ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!submitting && content.trim()) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              }
            }}
            onMouseLeave={(e) => {
              if (!submitting && content.trim()) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }
            }}
          >
            {submitting ? '提交中...' : '提交反馈'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
