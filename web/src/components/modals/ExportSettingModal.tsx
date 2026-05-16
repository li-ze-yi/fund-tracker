import { useState } from 'react';
import { Modal, Radio, Space, Button, App } from 'antd';
import { importExportService } from '@/services/importExportService';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ExportSettingModal({ open, onClose }: Props) {
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const onExport = async () => {
    setLoading(true);
    try {
      const blob = await importExportService.exportHoldings({ scope, format });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `holdings.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
      onClose();
    } catch (e: any) {
      message.error('导出失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="导出设置" open={open} onCancel={onClose} onOk={onExport} confirmLoading={loading} destroyOnHidden>
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>导出范围</div>
        <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)}>
          <Space direction="vertical">
            <Radio value="all">全部持仓</Radio>
            <Radio value="current">当前分组</Radio>
          </Space>
        </Radio.Group>
      </div>
      <div>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>导出格式</div>
        <Radio.Group value={format} onChange={(e) => setFormat(e.target.value)}>
          <Space direction="vertical">
            <Radio value="xlsx">Excel (.xlsx)</Radio>
            <Radio value="csv">CSV (.csv)</Radio>
          </Space>
        </Radio.Group>
      </div>
    </Modal>
  );
}