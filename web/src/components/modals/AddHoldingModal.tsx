import { useState, useEffect } from 'react';
import { Modal, Form, InputNumber, Select, App } from 'antd';
import { holdingService } from '@/services/holdingService';
import { groupService } from '@/services/groupService';

interface Props {
  open: boolean;
  fundCode: string;
  fundName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddHoldingModal({ open, fundCode, fundName, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const { message } = App.useApp();

  useEffect(() => {
    if (open) {
      groupService.getGroups().then((data) => {
        setGroups(data.groups || data || []);
      }).catch(() => {});
    }
  }, [open]);

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await holdingService.addHolding({
        fundCode: fundCode,
        amount: values.amount,
        totalReturn: values.totalReturn ?? 0,
        groupId: values.groupId ?? undefined,
      });
      message.success('添加成功');
      onSuccess();
      onClose();
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="添加持仓" open={open} onCancel={onClose} onOk={onSubmit} confirmLoading={loading} destroyOnHidden>
      <Form form={form} layout="vertical">
        <div style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
          基金: {fundName} ({fundCode})
        </div>
        <Form.Item name="amount" label="持仓金额（当前市值）" rules={[{ required: true, message: '请输入持仓金额' }]}>
          <InputNumber prefix="¥" min={0.01} step={100} style={{ width: '100%' }} placeholder="输入当前持仓金额" />
        </Form.Item>
        <Form.Item name="totalReturn" label="累计收益" rules={[{ required: true, message: '请输入累计收益' }]}>
          <InputNumber prefix="¥" step={100} style={{ width: '100%' }} placeholder="首次添加填0" />
        </Form.Item>
        <Form.Item name="groupId" label="选择分组（可选）">
          <Select allowClear placeholder="不选择则放入全部分组" options={groups.map((g) => ({ value: g.id, label: g.name }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}