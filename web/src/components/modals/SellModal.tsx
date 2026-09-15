import { useState, useEffect, useRef } from 'react';
import { Modal, Form, InputNumber, Select, DatePicker, Radio, Button, Space, Spin, App } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import locale from 'antd/es/date-picker/locale/zh_CN';
import { transactionService } from '@/services/transactionService';
import { fundService } from '@/services/fundService';

interface Props {
  open: boolean;
  fundCode: string;
  fundName: string;
  /** 可卖出份额上限（= 持仓份额 - 挂起卖出订单份额），作为实时查询失败时的回退值 */
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
  // 可卖出份额三态：查询中（显示 loading，禁用输入）/ 实时值 / 查询失败回退 props（标注缓存）
  // 任何时序（pending 卖单、已确认卖出、快速连点、网络慢）都不会显示过期数字
  const [availableShares, setAvailableShares] = useState<number | null>(null);
  const [sharesSource, setSharesSource] = useState<'loading' | 'live' | 'fallback'>('loading');
  // InputNumber 重挂载 key：rc-input-number 处于 focus 编辑态时保留内部输入文本，
  // setFieldsValue 更新受控值不会反映到显示（须 blur/Enter 才 commit）。
  // 超额截断时递增 key 强制重建组件，以截断后的受控值立即渲染，再恢复焦点。
  const [sharesKey, setSharesKey] = useState(0);
  const sharesInputRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    // 每次打开进入查询中状态：不显示任何可能过期的旧值
    setAvailableShares(null);
    setSharesSource('loading');
    let cancelled = false;
    // _t 时间戳强制绕过网络中间层缓存（与 getHistoryNav 同款方案）
    fundService
      .getFundInfo(fundCode, Date.now())
      .then((data: any) => {
        if (cancelled) return;
        const shares = data?.available_shares ?? data?.shares ?? 0;
        if (typeof shares === 'number' && shares >= 0) {
          setAvailableShares(shares);
          setSharesSource('live');
          // 查询后若已填写的份额超出最新上限，同步截断输入框
          const current = form.getFieldValue('shares');
          if (current != null && current > shares) {
            form.setFieldsValue({ shares });
          }
        } else {
          // 响应异常字段 → 回退 props
          setAvailableShares(maxShares);
          setSharesSource('fallback');
        }
      })
      .catch(() => {
        if (cancelled) return;
        // 查询失败回退页面数据兜底，不阻断操作
        setAvailableShares(maxShares);
        setSharesSource('fallback');
      });
    return () => { cancelled = true; };
  }, [open, fundCode]);

  const onSharesChange = (v: number | null) => {
    // 输入超过可卖出份额 → 输入过程即时截断（无需回车/失焦）
    if (availableShares != null && v != null && v > availableShares) {
      form.setFieldsValue({ shares: availableShares });
      message.warning(`最多可卖出 ${availableShares.toLocaleString()} 份，已自动调整`);
      // 递增 key 强制 InputNumber 重挂载，以截断后的受控值立即显示，再恢复焦点
      setSharesKey((k) => k + 1);
      requestAnimationFrame(() => {
        try { sharesInputRef.current?.focus?.(); } catch { /* ref 未就绪时忽略 */ }
      });
    }
  };

  const quickFill = (ratio: number) => {
    if (availableShares == null) return;
    const sharesValue = Math.floor(availableShares * ratio * 10000) / 10000;
    form.setFieldsValue({ shares: sharesValue });
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (availableShares == null || values.shares > availableShares) {
        message.error('卖出份额不能超过可卖出份额');
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

  const sharesKnown = availableShares != null;

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
      <div className="sell-holdings-info" style={{ marginBottom: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>
        可卖出:{' '}
        {sharesKnown ? (
          <>
            {availableShares!.toLocaleString()} 份
            {sharesSource === 'fallback' && <span style={{ marginLeft: 6 }}>（缓存数据）</span>}
          </>
        ) : (
          <Spin size="small" style={{ marginLeft: 4 }} />
        )}
      </div>
      <Form form={form} layout="vertical">
        <Form.Item name="shares" label="卖出份额" rules={[{ required: true, message: '请输入卖出份额' }]}>
          <InputNumber
            key={sharesKey}
            ref={sharesInputRef}
            min={0}
            max={sharesKnown ? availableShares! : undefined}
            step={1}
            style={{ width: '100%' }}
            placeholder="输入卖出份额"
            disabled={!sharesKnown}
            onChange={onSharesChange}
          />
        </Form.Item>
        <div className="sell-quick-buttons" style={{ marginBottom: 16 }}>
          <Space>
            <Button size="small" disabled={!sharesKnown} onClick={() => quickFill(1 / 4)}>1/4</Button>
            <Button size="small" disabled={!sharesKnown} onClick={() => quickFill(1 / 3)}>1/3</Button>
            <Button size="small" disabled={!sharesKnown} onClick={() => quickFill(1 / 2)}>1/2</Button>
            <Button size="small" disabled={!sharesKnown} onClick={() => quickFill(1)}>全部</Button>
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
