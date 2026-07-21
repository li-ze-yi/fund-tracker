import { useEffect, useState } from 'react';
import { BellOutlined, CloseOutlined } from '@ant-design/icons';
import { announcementService, Announcement } from '../services/announcementService';

function getDismissKey(ann: { id: number; publish_version: number }): string {
  return `${ann.id}_v${ann.publish_version}`;
}

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('dismissed_banners');
    if (stored) {
      try {
        setDismissedKeys(JSON.parse(stored));
      } catch {}
    }

    announcementService.getActiveBanner()
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
      localStorage.setItem('dismissed_banners', JSON.stringify(updated));
    }
    setVisible(false);
  };

  if (!announcement || dismissedKeys.includes(getDismissKey(announcement)) || !visible) {
    return null;
  }

  return (
    <div
      className="announcement-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 44px 10px 16px',
        background: 'var(--accent-gold-dim)',
        borderBottom: '1px solid var(--accent-gold-light)',
        position: 'relative',
        flexShrink: 0,
        animation: 'bannerSlideIn 0.35s ease-out',
      }}
    >
      <BellOutlined
        style={{
          color: 'var(--accent-gold)',
          fontSize: 14,
          flexShrink: 0,
          marginRight: 10,
        }}
      />
      <span style={{
        fontSize: 13,
        color: 'var(--text-primary)',
        lineHeight: 1.5,
        flex: 1,
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>
        {announcement.content}
      </span>
      <div
        onClick={handleClose}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          transition: 'all var(--transition-fast)',
          flexShrink: 0,
        }}
      >
        <CloseOutlined style={{ fontSize: 12 }} />
      </div>
    </div>
  );
}