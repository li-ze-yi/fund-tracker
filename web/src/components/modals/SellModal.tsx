import { useState } from 'react';
import { Modal, Form, InputNumber, Select, DatePicker, Radio, Button, Space, App } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import locale from 'antd/es/date-picker/locale/zh_CN';
import { transactionService } from '@/services/transactionService';

interface Props {
  open: boolean;
  fundCode: string;
  fundName: string;
  maxShares: number;
  onClose: () => void;
  onSuccess: () => void;
}

const FEE_OPTIONS = [
  { value: 0, label: '0.00%' },
  { value: 0.005, label: '0.50%' },
  { value: 0.01, label: '1.00%' },
  { value: 0.015, label: '1.50%' },
];

export default function SellModal({ open, fundCode, fundName, maxShares, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const quickFill = (ratio: number) => {
    const sharesValue = Math.floor(maxShares * ratio * 10000) / 10000;
    form.setFieldsValue({ shares: sharesValue });
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.shares > maxShares) {
        message.error('卖出份额不能超过持有份额');
        return;
      }
      setLoading(true);
      const result = await transactionService.sell({
        fundCode: fundCode,
        shares: values.shares,
        fee: values.fee ?? 0,
        date: values.date.startOf('day').format('YYYY-MM-DD'),
        after3pm: values.after3pm,
      });
      if (result.status === 'pending') {
        message.warning('卖出订单已提交，等待净值确认后自动结算');
      } else {
        message.success('减仓成功');
      }
      onSuccess();
      onClose();
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '减仓失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      className="sell-modal"
      title={`减仓 - ${fundName}`}
      open={open}
      onCancel={onClose}
      onOk={onSubmit}
      confirmLoading={loading}
      destroyOnHidden
    >
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          .sell-modal .ant-modal {
            max-width: 95vw !important;
            margin: 8px auto !important;
          }

          .sell-modal .ant-modal-header {
            padding: 14px 18px !important;
          }

          .sell-modal .ant-modal-title {
            font-size: clamp(15px, 4vw, 17px) !important;
          }

          .sell-modal .ant-modal-body {
            padding: 16px !important;
          }

          /* 持有份额提示 */
          .sell-holdings-info {
            font-size: clamp(12px, 3vw, 13px) !important;
            margin-bottom: 10px !important;
          }

          /* 表单项 */
          .sell-modal .ant-form-item {
            margin-bottom: 14px !important;
          }

          .sell-modal .ant-form-item-label > label {
            font-size: clamp(13px, 3.2vw, 14px) !important;
          }

          /* 输入框和选择器 */
          .sell-modal .ant-input-number,
          .sell-modal .ant-select,
          .sell-modal .ant-picker {
            height: 42px !important;
            font-size: clamp(14px, 3.5vw, 15px) !important;
            border-radius: var(--radius-md) !important;
          }

          /* 快捷按钮组 */
          .sell-quick-buttons {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
            margin-bottom: 12px !important;
          }

          .sell-quick-buttons .ant-btn {
            min-width: auto !important;
            padding: 4px 10px !important;
            height: 32px !important;
            font-size: clamp(11px, 2.8vw, 12px) !important;
            border-radius: var(--radius-sm) !important;
          }

          /* Radio 组 */
          .sell-modal .ant-radio-wrapper {
            font-size: clamp(12px, 3vw, 13px) !important;
            white-space: normal !important;
          }

          .sell-modal .ant-radio-group {
            display: flex !important;
            flex-direction: column !important;
            gap: 8px !important;
          }

          /* 底部按钮 */
          .sell-modal .ant-btn-primary,
          .sell-modal .ant-btn-default {
            height: 42px !important;
            font-size: clamp(13px, 3.2vw, 14px) !important;
            border-radius: var(--radius-md) !important;
          }
        }
      `}</style>

      <div className="sell-holdings-info" style={{ marginBottom: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>
        当前持有: {maxShares.toLocaleString()} 份
      </div>
      <Form form={form} layout="vertical">
        <Form.Item name="shares" label="卖出份额" rules={[{ required: true, message: '请输入卖出份额' }]}>
          <InputNumber min={0} max={maxShares} step={1} style={{ width: '100%' }} placeholder="输入卖出份额" />
        </Form.Item>
        <div className="sell-quick-buttons" style={{ marginBottom: 16 }}>
          <Space>
            <Button size="small" onClick={() => quickFill(1 / 4)}>1/4</Button>
            <Button size="small" onClick={() => quickFill(1 / 3)}>1/3</Button>
            <Button size="small" onClick={() => quickFill(1 / 2)}>1/2</Button>
            <Button size="small" onClick={() => quickFill(1)}>全部</Button>
          </Space>
        </div>
        <Form.Item name="fee" label="赎回费率" initialValue={0.005}>
          <Select options={FEE_OPTIONS} />
        </Form.Item>
        <Form.Item name="date" label="卖出日期" rules={[{ required: true, message: '请选择日期' }]} initialValue={dayjs()}>
          <DatePicker style={{ width: '100%' }} locale={locale} placeholder="请选择日期" />
        </Form.Item>
        <Form.Item name="after3pm" label="赎回时间" initialValue={false}>
          <Radio.Group id="after3pm">
            <Radio value={false}>15:00 前（今日净值）</Radio>
            <Radio value={true}>15:00 后（次日确认）</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
}