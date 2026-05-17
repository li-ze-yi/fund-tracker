import { useState, useEffect } from 'react';
import { Modal, Form, InputNumber, Select, Input, App } from 'antd';
import { planService } from '@/services/planService';

interface PlanData {
  id: number;
  fund_code: string;
  fund_name?: string;
  amount: number;
  frequency: string;
  day_of_week?: number | null;
  day_of_month?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  plan: PlanData | null;
}

export default function EditPlanModal({ open, onClose, onSuccess, plan }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    if (open && plan) {
      form.setFieldsValue({
        amount: plan.amount,
        frequency: plan.frequency,
        dayOfWeek: plan.day_of_week,
        dayOfMonth: plan.day_of_month,
      });
    }
  }, [open, plan, form]);

  const onSubmit = async () => {
    if (!plan) return;
    try {
      const values = await form.validateFields();
      setLoading(true);
      await planService.updatePlan(plan.id, {
        amount: values.amount,
        frequency: values.frequency,
        dayOfWeek: values.frequency === 'weekly' ? values.dayOfWeek : undefined,
        dayOfMonth: values.frequency === 'monthly' ? values.dayOfMonth : undefined,
      });
      message.success('定投计划更新成功');
      onSuccess();
      onClose();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      className="edit-plan-modal"
      title="修改定投计划"
      open={open}
      onCancel={onClose}
      onOk={onSubmit}
      confirmLoading={loading}
      destroyOnHidden
    >
      <style>{`
        @media screen and (max-width: 768px) {
          .edit-plan-modal .ant-modal {
            max-width: 95vw !important;
            margin: 8px auto !important;
          }

          .edit-plan-modal .ant-modal-header {
            padding: 14px 18px !important;
          }

          .edit-plan-modal .ant-modal-title {
            font-size: clamp(15px, 4vw, 17px) !important;
          }

          .edit-plan-modal .ant-modal-body {
            padding: 16px !important;
          }

          .edit-plan-modal .ant-form-item {
            margin-bottom: 14px !important;
          }

          .edit-plan-modal .ant-form-item-label > label {
            font-size: clamp(13px, 3.2vw, 14px) !important;
            height: auto !important;
          }

          .edit-plan-modal .ant-input-number,
          .edit-plan-modal .ant-select {
            height: 42px !important;
            font-size: clamp(14px, 3.5vw, 15px) !important;
            border-radius: var(--radius-md) !important;
          }

          .edit-plan-modal .ant-btn-primary,
          .edit-plan-modal .ant-btn-default {
            height: 42px !important;
            font-size: clamp(13px, 3.2vw, 14px) !important;
            border-radius: var(--radius-md) !important;
          }
        }
      `}</style>

      <Form form={form} layout="vertical">
        <Form.Item label="基金">
          <Input
            value={plan ? `${plan.fund_code} - ${plan.fund_name || ''}` : ''}
            disabled
          />
        </Form.Item>
        <Form.Item name="amount" label="定投金额" rules={[{ required: true, message: '请输入金额' }]}>
          <InputNumber prefix="¥" min={1} step={100} style={{ width: '100%' }} placeholder="输入定投金额" />
        </Form.Item>
        <Form.Item name="frequency" label="定投频率" rules={[{ required: true, message: '请选择频率' }]}>
          <Select
            options={[
              { value: 'daily', label: '每日' },
              { value: 'weekly', label: '每周' },
              { value: 'monthly', label: '每月' },
            ]}
          />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.frequency !== cur.frequency}>
          {({ getFieldValue }) => {
            const freq = getFieldValue('frequency');
            if (freq === 'weekly') {
              return (
                <Form.Item name="dayOfWeek" label="选择周几" rules={[{ required: true, message: '请选择' }]}>
                  <Select
                    options={[
                      { value: 1, label: '周一' }, { value: 2, label: '周二' },
                      { value: 3, label: '周三' }, { value: 4, label: '周四' },
                      { value: 5, label: '周五' }, { value: 6, label: '周六' },
                      { value: 7, label: '周日' },
                    ]}
                  />
                </Form.Item>
              );
            }
            if (freq === 'monthly') {
              return (
                <Form.Item name="dayOfMonth" label="选择几号" rules={[{ required: true, message: '请选择' }]}>
                  <Select options={Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}号` }))} />
                </Form.Item>
              );
            }
            return null;
          }}
        </Form.Item>
      </Form>
    </Modal>
  );
}
