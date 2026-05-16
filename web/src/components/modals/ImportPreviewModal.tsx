import { useState } from 'react';
import { Modal, Table, Tag, Button, App } from 'antd';
import { importExportService } from '@/services/importExportService';

interface Props {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportPreviewModal({ open, file, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const confirmImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      await importExportService.importHoldings(file);
      message.success('导入成功');
      onSuccess();
      onClose();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '导入失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="导入预览"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="import" type="primary" loading={loading} onClick={confirmImport}>确认导入</Button>,
      ]}
      destroyOnHidden
    >
      <div style={{ marginBottom: 12 }}>
        文件: {file?.name} | 大小: {file ? `${(file.size / 1024).toFixed(1)}KB` : '-'}
      </div>
      <Table
        dataSource={[]}
        columns={[
          { title: '基金代码', dataIndex: 'fund_code', key: 'fund_code' },
          { title: '基金名称', dataIndex: 'fund_name', key: 'fund_name' },
          { title: '持仓金额', dataIndex: 'investment_amount', key: 'investment_amount' },
          { title: '累计收益', dataIndex: 'accumulated_profit', key: 'accumulated_profit' },
          { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'valid' ? 'green' : 'red'}>{s === 'valid' ? '有效' : '异常'}</Tag> },
        ]}
        pagination={false}
        size="small"
      />
    </Modal>
  );
}