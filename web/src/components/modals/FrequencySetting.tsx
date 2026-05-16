import { useState, useEffect } from 'react';
import { Radio, Space, App, theme } from 'antd';
import { settingService } from '@/services/settingService';

interface Props {
  value: number;
  onChange: (val: number) => void;
}

const options = [
  { value: 15, label: <span><span style={{ 
    fontSize: 18, 
    fontWeight: 700, 
    color: 'var(--accent-gold)', 
    fontFamily: 'var(--font-mono)',
    marginRight: 6,
    display: 'inline-block',
    minWidth: 28,
    textAlign: 'center',
  }}>15</span>秒</span> },
  { value: 30, label: <span><span style={{ 
    fontSize: 18, 
    fontWeight: 700, 
    color: 'var(--accent-gold)', 
    fontFamily: 'var(--font-mono)',
    marginRight: 6,
    display: 'inline-block',
    minWidth: 28,
    textAlign: 'center',
  }}>30</span>秒（默认）</span> },
  { value: 60, label: <span><span style={{ 
    fontSize: 18, 
    fontWeight: 700, 
    color: 'var(--accent-gold)', 
    fontFamily: 'var(--font-mono)',
    marginRight: 6,
    display: 'inline-block',
    minWidth: 28,
    textAlign: 'center',
  }}>60</span>秒</span> },
  { value: 120, label: <span><span style={{ 
    fontSize: 18, 
    fontWeight: 700, 
    color: 'var(--accent-gold)', 
    fontFamily: 'var(--font-mono)',
    marginRight: 6,
    display: 'inline-block',
    minWidth: 28,
    textAlign: 'center',
  }}>120</span>秒</span> },
  { value: 0, label: <span><span style={{ 
    fontSize: 16, 
    fontWeight: 600, 
    color: 'var(--text-muted)', 
    fontFamily: 'var(--font-mono)',
    marginRight: 6,
  }}>⏸</span>手动刷新</span> },
];

export default function FrequencySetting({ value, onChange }: Props) {
  const { message } = App.useApp();
  const { token } = theme.useToken();

  const handleChange = async (val: number) => {
    onChange(val);
    try {
      await settingService.updateSettings({ refreshFrequency: val });
      message.success('刷新频率已更新');
    } catch {
      message.error('保存失败');
    }
  };

  return (
    <Radio.Group 
      value={value} 
      onChange={(e) => handleChange(e.target.value)}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {options.map((opt) => (
          <Radio
            key={opt.value}
            value={opt.value}
            style={{
              color: 'var(--text-primary)',
              fontSize: 15,
              fontWeight: 500,
              padding: '10px 14px',
              borderRadius: 8,
              transition: 'all 0.2s ease',
              background: value === opt.value ? 'rgba(212, 160, 23, 0.08)' : 'transparent',
              border: `1px solid ${value === opt.value ? 'var(--accent-gold)' : 'var(--border-default)'}`,
              display: 'flex',
              alignItems: 'center',
              width: '100%',
            }}
          >
            {opt.label}
          </Radio>
        ))}
      </Space>
    </Radio.Group>
  );
}