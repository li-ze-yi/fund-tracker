import { Spin } from 'antd';

export default function LoadingScreen({ text = '加载中…' }: { text?: string }) {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <Spin size="large" />
      <span style={{ color: '#94A3B8', fontSize: 13, letterSpacing: '0.1em' }}>{text}</span>
    </div>
  );
}
