import { useState } from 'react';
import { Modal, Form, InputNumber, Select, Input, App } from 'antd';
import { planService } from '@/services/planService';
import { fundService } from '@/services/fundService';
import type { FundInfo } from '@/services/fundService';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreatePlanModal({ open, onClose, onSuccess }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fundOptions, setFundOptions] = useState<{ value: string; label: string }[]>([]);
  const { message } = App.useApp();

  const searchFund = (keyword: string) => {
    if (!keyword.trim()) return;
    fundService.searchFunds(keyword).then((data) => {
      const funds: FundInfo[] = data.funds || data || [];
      setFundOptions(funds.map((f) => ({ value: f.code, label: `${f.code} - ${f.name}` })));
    }).catch(() => {});
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await planService.createPlan({
        fundCode: values.fundCode,
        amount: values.amount,
        frequency: values.frequency,
        dayOfWeek: values.frequency === 'weekly' ? values.dayOfWeek : undefined,
        dayOfMonth: values.frequency === 'monthly' ? values.dayOfMonth : undefined,
      });
      message.success('定投计划创建成功');
      onSuccess();
      onClose();
      form.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      className="create-plan-modal"
      title="新建定投计划"
      open={open}
      onCancel={onClose}
      onOk={onSubmit}
      confirmLoading={loading}
      destroyOnHidden
    >
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          .create-plan-modal .ant-modal {
            max-width: 95vw !important;
            margin: 8px auto !important;
          }

          .create-plan-modal .ant-modal-header {
            padding: 14px 18px !important;
          }

          .create-plan-modal .ant-modal-title {
            font-size: clamp(15px, 4vw, 17px) !important;
          }

          .create-plan-modal .ant-modal-body {
            padding: 16px !important;
          }

          /* 表单项 */
          .create-plan-modal .ant-form-item {
            margin-bottom: 14px !important;
          }

          .create-plan-modal .ant-form-item-label > label {
            font-size: clamp(13px, 3.2vw, 14px) !important;
            height: auto !important;
          }

          /* 输入框和选择器 */
          .create-plan-modal .ant-input-number,
          .create-plan-modal .ant-select {
            height: 42px !important;
            font-size: clamp(14px, 3.5vw, 15px) !important;
            border-radius: var(--radius-md) !important;
          }

          /* 下拉选项 */
          .create-plan-modal .ant-select-dropdown .ant-select-item {
            padding: 6px 12px !important;
            font-size: clamp(13px, 3.2vw, 14px) !important;
          }

          /* 底部按钮 */
          .create-plan-modal .ant-btn-primary,
          .create-plan-modal .ant-btn-default {
            height: 42px !important;
            font-size: clamp(13px, 3.2vw, 14px) !important;
            border-radius: var(--radius-md) !important;
          }
        }
      `}</style>

      <Form form={form} layout="vertical">
        <Form.Item name="fundCode" label="选择基金" rules={[{ required: true, message: '请选择基金' }]}>
          <Select showSearch onSearch={searchFund} filterOption={false} placeholder="搜索基金代码或名称" options={fundOptions} />
        </Form.Item>
        <Form.Item name="amount" label="定投金额" rules={[{ required: true, message: '请输入金额' }]}>
          <InputNumber prefix="¥" min={1} step={100} style={{ width: '100%' }} placeholder="输入定投金额" />
        </Form.Item>
        <Form.Item name="frequency" label="定投频率" rules={[{ required: true, message: '请选择频率' }]} initialValue="monthly">
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