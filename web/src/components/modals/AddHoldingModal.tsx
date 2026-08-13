import { useState, useEffect } from 'react';
import { Modal, Form, InputNumber, Select, App, Tabs, DatePicker, Radio } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { holdingService } from '@/services/holdingService';
import { groupService } from '@/services/groupService';

// 买入费率选项（与 SellModal 赎回费率一致）
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

export default function AddHoldingModal({ open, fundCode, fundName, onClose, onSuccess }: Props) {
  // 两个独立 Form 实例，避免导入/新购字段互相冲突
  const [importForm] = Form.useForm();
  const [purchaseForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [mode, setMode] = useState<'import' | 'purchase'>('import');
  const { message } = App.useApp();

  useEffect(() => {
    if (open) {
      groupService.getGroups().then((data) => {
        setGroups(data.groups || data || []);
      }).catch(() => {});
    }
  }, [open]);

  // 关闭弹窗：重置模式为导入并清空两个表单
  const handleClose = () => {
    setMode('import');
    importForm.resetFields();
    purchaseForm.resetFields();
    onClose();
  };

  const onSubmit = async () => {
    try {
      if (mode === 'import') {
        // 导入持仓模式：沿用原有逻辑
        const values = await importForm.validateFields();
        setLoading(true);
        await holdingService.addHolding({
          fundCode: fundCode,
          amount: values.amount,
          totalReturn: values.totalReturn ?? 0,
          groupId: values.groupId ?? undefined,
        });
        message.success('添加成功');
        onSuccess();
        handleClose();
      } else {
        // 新购基金模式
        const values = await purchaseForm.validateFields();
        setLoading(true);
        const res = await holdingService.purchaseFund({
          fundCode: fundCode,
          amount: values.amount,
          purchaseDate: values.purchaseDate.format('YYYY-MM-DD'),
          after3pm: values.after3pm,
          feeRate: values.feeRate ?? 0,
          groupId: values.groupId ?? undefined,
        });
        // 后端可能返回 confirmed（已入库）或 pending（待处理）
        if (res && res.status === 'pending') {
          message.info(res.message || '处理中');
        } else {
          message.success('购买成功，已入库');
        }
        onSuccess();
        handleClose();
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '添加失败');
    } finally {
      setLoading(false);
    }
  };

  // 禁止选择未来日期
  const disabledDate = (current?: Dayjs) => {
    if (!current) return false;
    return current.isAfter(dayjs().endOf('day'));
  };

  const groupOptions = groups.map((g) => ({ value: g.id, label: g.name }));

  return (
    <Modal title="添加持仓" open={open} onCancel={handleClose} onOk={onSubmit} confirmLoading={loading} destroyOnHidden>
      <div style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
        基金: {fundName} ({fundCode})
      </div>
      <Tabs
        activeKey={mode}
        onChange={(key) => setMode(key as 'import' | 'purchase')}
        items={[
          {
            key: 'import',
            label: '导入持仓',
            children: (
              <Form form={importForm} layout="vertical">
                <Form.Item name="amount" label="持仓金额（当前市值）" rules={[{ required: true, message: '请输入持仓金额' }]}>
                  <InputNumber prefix="¥" min={0.01} step={100} style={{ width: '100%' }} placeholder="输入当前持仓金额" />
                </Form.Item>
                <Form.Item name="totalReturn" label="累计收益" rules={[{ required: true, message: '请输入累计收益' }]}>
                  <InputNumber prefix="¥" step={100} style={{ width: '100%' }} placeholder="首次添加填0" />
                </Form.Item>
                <Form.Item name="groupId" label="选择分组（可选）">
                  <Select allowClear placeholder="不选择则放入全部分组" options={groupOptions} />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'purchase',
            label: '新购基金',
            children: (
              <Form
                form={purchaseForm}
                layout="vertical"
                initialValues={{ purchaseDate: dayjs(), after3pm: false, feeRate: 0 }}
              >
                <Form.Item name="purchaseDate" label="购买日期" rules={[{ required: true, message: '请选择购买日期' }]}>
                  <DatePicker format="YYYY-MM-DD" disabledDate={disabledDate} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="after3pm" label="申购时间">
                  <Radio.Group>
                    <Radio value={false}>15:00 前（今日净值）</Radio>
                    <Radio value={true}>15:00 后（次日确认）</Radio>
                  </Radio.Group>
                </Form.Item>
                <Form.Item name="amount" label="购买金额" rules={[{ required: true, message: '请输入购买金额' }]}>
                  <InputNumber prefix="¥" min={0.01} step={100} style={{ width: '100%' }} placeholder="输入购买金额" />
                </Form.Item>
                <Form.Item name="feeRate" label="买入费率">
                  <Select options={FEE_OPTIONS} />
                </Form.Item>
                <Form.Item name="groupId" label="选择分组（可选）">
                  <Select allowClear placeholder="不选择则放入全部分组" options={groupOptions} />
                </Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}
