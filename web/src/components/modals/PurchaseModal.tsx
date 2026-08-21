import { useState, useEffect } from 'react';
import { Modal, Form, InputNumber, DatePicker, Radio, Select, App } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import locale from 'antd/es/date-picker/locale/zh_CN';
import { holdingService } from '@/services/holdingService';
import { groupService } from '@/services/groupService';

const FEE_OPTIONS = [
  { value: 0, label: '0.00%' },
  { value: 0.005, label: '0.50%' },
  { value: 0.01, label: '1.00%' },
  { value: 0.015, label: '1.50%' },
];

interface Props {
  open: boolean;
  fundCode: string;
  fundName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PurchaseModal({ open, fundCode, fundName, onClose, onSuccess }: Props) {
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
      const result = await holdingService.purchaseFund({
        fundCode,
        amount: values.amount,
        purchaseDate: values.purchaseDate.startOf('day').format('YYYY-MM-DD'),
        after3pm: values.after3pm,
        feeRate: values.feeRate ?? 0,
        groupId: values.groupId ?? undefined,
      });
      if (result.status === 'pending') {
        message.warning('购买订单已提交，等待净值确认后自动结算');
      } else {
        message.success('新购成功');
      }
      onSuccess();
      onClose();
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '新购失败');
    } finally {
      setLoading(false);
    }
  };

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.name }));

  return (
    <Modal
      className="purchase-modal"
      title={`新购 - ${fundName}`}
      open={open}
      onCancel={onClose}
      onOk={onSubmit}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ purchaseDate: dayjs(), after3pm: false, feeRate: 0 }}>
        <Form.Item name="amount" label="购买金额" rules={[{ required: true, message: '请输入购买金额' }]}>
          <InputNumber prefix="¥" min={0.01} step={100} style={{ width: '100%' }} placeholder="补录已有持仓请走添加" />
        </Form.Item>
        <Form.Item name="purchaseDate" label="购买日期" rules={[{ required: true, message: '请选择日期' }]}>
          <DatePicker style={{ width: '100%' }} locale={locale} placeholder="请选择日期" />
        </Form.Item>
        <Form.Item name="after3pm" label="申购时间">
          <Radio.Group>
            <Radio value={false}>15:00 前（今日净值）</Radio>
            <Radio value={true}>15:00 后（次日确认）</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="feeRate" label="买入费率">
          <Select options={FEE_OPTIONS} />
        </Form.Item>
        <Form.Item name="groupId" label="选择分组（可选）">
          <Select allowClear placeholder="不选择则放入全部分组" options={groupOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}