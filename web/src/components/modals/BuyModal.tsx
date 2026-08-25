import { useState } from 'react';
import { Modal, Form, InputNumber, DatePicker, Radio, App } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import locale from 'antd/es/date-picker/locale/zh_CN';
import { transactionService } from '@/services/transactionService';

interface Props {
  open: boolean;
  fundCode: string;
  fundName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BuyModal({ open, fundCode, fundName, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const result = await transactionService.buy({
        fundCode: fundCode,
        amount: values.amount,
        date: values.date.startOf('day').format('YYYY-MM-DD'),
        after3pm: values.after3pm,
      });
      if (result.status === 'pending') {
        message.warning('加仓订单已提交，等待净值确认后自动结算');
      } else {
        message.success('加仓成功');
      }
      onSuccess();
      onClose();
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '加仓失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      className="buy-modal"
      title={`加仓 - ${fundName}`}
      open={open}
      onCancel={onClose}
      onOk={onSubmit}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="amount" label="买入金额" rules={[{ required: true, message: '请输入买入金额' }]}>
          <InputNumber prefix="¥" min={0.01} step={100} style={{ width: '100%' }} placeholder="输入买入金额" />
        </Form.Item>
        <Form.Item name="date" label="买入日期" rules={[{ required: true, message: '请选择日期' }]} initialValue={dayjs()}>
          <DatePicker style={{ width: '100%' }} locale={locale} placeholder="请选择日期" />
        </Form.Item>
        <Form.Item name="after3pm" label="申购时间" initialValue={false}>
          <Radio.Group id="after3pm">
            <Radio value={false}>15:00 前（今日净值）</Radio>
            <Radio value={true}>15:00 后（次日确认）</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
}