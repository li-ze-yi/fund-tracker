import { useState, useEffect, useRef } from 'react';
import { Modal, InputNumber, App } from 'antd';
import { holdingService } from '@/services/holdingService';

interface Props {
  open: boolean;
  holdingId: number;
  fundCode: string;
  fundName: string;
  currentMarketValue?: number;
  currentTotalReturn?: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditHoldingModal({
  open,
  holdingId,
  fundCode,
  fundName,
  currentMarketValue,
  currentTotalReturn,
  onClose,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const [amount, setAmount] = useState<number | null>(null);
  const [totalReturn, setTotalReturn] = useState<number | null>(null);
  const prevOpen = useRef(false);

  // 只在 open 从 false 变为 true 时初始化值
  useEffect(() => {
    if (open && !prevOpen.current) {
      setAmount(currentMarketValue != null && !isNaN(Number(currentMarketValue)) ? Number(currentMarketValue) : 0);
      setTotalReturn(currentTotalReturn != null && !isNaN(Number(currentTotalReturn)) ? Number(currentTotalReturn) : 0);
    }
    prevOpen.current = open;
  }, [open]);

  const onSubmit = async () => {
    if (amount == null || totalReturn == null) {
      message.error('请填写完整');
      return;
    }
    try {
      setLoading(true);
      await holdingService.updateHolding(holdingId, {
        fundCode,
        amount,
        totalReturn,
      });
      message.success('修改成功');
      onSuccess();
      onClose();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      className="edit-holding-modal"
      title={`修改持仓 - ${fundName}`}
      open={open}
      onCancel={onClose}
      onOk={onSubmit}
      confirmLoading={loading}
      destroyOnClose
    >
      <style>{`
        @media screen and (max-width: 768px) {
          .edit-holding-modal .ant-modal {
            max-width: 95vw !important;
            margin: 8px auto !important;
          }
          .edit-holding-modal .ant-modal-header {
            padding: 14px 18px !important;
          }
          .edit-holding-modal .ant-modal-title {
            font-size: clamp(15px, 4vw, 17px) !important;
          }
          .edit-holding-modal .ant-modal-body {
            padding: 16px !important;
          }
          .edit-holding-modal .ant-input-number {
            height: 42px !important;
            font-size: clamp(14px, 3.5vw, 15px) !important;
            border-radius: var(--radius-md) !important;
          }
          .edit-holding-modal .ant-btn-primary,
          .edit-holding-modal .ant-btn-default {
            height: 42px !important;
            font-size: clamp(13px, 3.2vw, 14px) !important;
            border-radius: var(--radius-md) !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
            持仓金额（当前市值）
          </div>
          <InputNumber
            value={amount}
            onChange={(v) => setAmount(v)}
            prefix="¥"
            min={0.01}
            step={100}
            style={{ width: '100%' }}
            placeholder="输入当前持仓金额"
          />
        </div>
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
            累计收益
          </div>
          <InputNumber
            value={totalReturn}
            onChange={(v) => setTotalReturn(v)}
            prefix="¥"
            step={100}
            style={{ width: '100%' }}
            placeholder="盈利为正，亏损为负"
          />
        </div>
      </div>
    </Modal>
  );
}
