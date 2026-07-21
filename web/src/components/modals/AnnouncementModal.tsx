import { useEffect, useState } from 'react';
import { Modal } from 'antd';
import { BellOutlined, CloseOutlined } from '@ant-design/icons';
import { announcementService, Announcement } from '../../services/announcementService';

function getDismissKey(ann: { id: number; publish_version: number }): string {
  return `${ann.id}_v${ann.publish_version}`;
}

export default function AnnouncementModal() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('dismissed_announcements');
    if (stored) {
      try {
        setDismissedKeys(JSON.parse(stored));
      } catch {}
    }

    announcementService.getActivePopup()
      .then((data) => {
        if (data && !dismissedKeys.includes(getDismissKey(data))) {
          setAnnouncement(data);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleClose = () => {
    if (announcement) {
      const key = getDismissKey(announcement);
      const updated = [...dismissedKeys, key];
      setDismissedKeys(updated);
      localStorage.setItem('dismissed_announcements', JSON.stringify(updated));
    }
    setVisible(false);
  };

  if (!announcement || dismissedKeys.includes(getDismissKey(announcement))) {
    return null;
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={isMobile ? 'calc(100vw - 40px)' : 440}
      closable={false}
      maskClosable={true}
      destroyOnClose
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
              <BellOutlined style={{ fontSize: 20, color: 'var(--accent-gold)' }} />
            </div>
            <h3 style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              lineHeight: 1.4,
            }}>
              {announcement.title}
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

        {/* 内容 */}
        <div style={{
          whiteSpace: 'pre-wrap',
          lineHeight: 1.8,
          fontSize: 14,
          color: 'var(--text-secondary)',
        }}>
          {announcement.content}
        </div>

        {/* 底部 */}
        <div style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={handleClose}
            style={{
              border: 'none',
              outline: 'none',
              padding: '10px 28px',
              borderRadius: 'var(--radius-full)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-gold-light))',
              color: '#111827',
              transition: 'all var(--transition-fast)',
              boxShadow: 'var(--shadow-sm)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
            }}
          >
            我知道了
          </button>
        </div>
      </div>
    </Modal>
  );
}