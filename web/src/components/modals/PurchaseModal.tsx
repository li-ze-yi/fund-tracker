import { useState } from 'react';
import { Modal, Form, InputNumber, DatePicker, Radio, Select, App } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import locale from 'antd/es/date-picker/locale/zh_CN';
import { holdingService } from '@/services/holdingService';

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
  const { message } = App.useApp();

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
      <style>{`
        @media screen and (max-width: 768px) {
          .purchase-modal .ant-modal {
            max-width: 95vw !important;
            margin: 8px auto !important;
          }
          .purchase-modal .ant-modal-header {
            padding: 14px 18px !important;
          }
          .purchase-modal .ant-modal-title {
            font-size: clamp(15px, 4vw, 17px) !important;
          }
          .purchase-modal .ant-modal-body {
            padding: 16px !important;
          }
          .purchase-modal .ant-form-item {
            margin-bottom: 16px !important;
          }
          .purchase-modal .ant-radio-wrapper {
            font-size: clamp(12px, 3vw, 13px) !important;
            margin-right: 12px !important;
            white-space: normal !important;
          }
          .purchase-modal .ant-radio-group {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
          }
          .purchase-modal .ant-btn-primary,
          .purchase-modal .ant-btn-default {
            height: 42px !important;
            font-size: clamp(13px, 3.2vw, 14px) !important;
            border-radius: var(--radius-md) !important;
          }
        }
      `}</style>

      <Form form={form} layout="vertical" initialValues={{ purchaseDate: dayjs(), after3pm: false, feeRate: 0 }}>
        <Form.Item name="amount" label="购买金额" rules={[{ required: true, message: '请输入购买金额' }]}>
          <InputNumber prefix="¥" min={0.01} step={100} style={{ width: '100%' }} placeholder="输入购买金额" />
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
      </Form>
    </Modal>
  );
}
