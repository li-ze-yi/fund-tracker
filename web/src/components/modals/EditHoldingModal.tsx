import { useState, useEffect, useRef } from 'react';
import { Modal, InputNumber, App, Alert } from 'antd';
import { holdingService } from '@/services/holdingService';
import { transactionService } from '@/services/transactionService';

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
  // 挂起订单提示：修改持仓与待结算订单冲突（手动改份额/成本会影响结算基数）
  const [pendingInfo, setPendingInfo] = useState<{ buy: number; sell: number } | null>(null);

  // 只在 open 从 false 变为 true 时初始化值，并检测该基金的挂起订单
  useEffect(() => {
    if (open && !prevOpen.current) {
      setAmount(currentMarketValue != null && !isNaN(Number(currentMarketValue)) ? Number(currentMarketValue) : 0);
      setTotalReturn(currentTotalReturn != null && !isNaN(Number(currentTotalReturn)) ? Number(currentTotalReturn) : 0);
      setPendingInfo(null);
      if (fundCode) {
        transactionService
          .getTransactions(fundCode)
          .then((data: any) => {
            const txs = Array.isArray(data) ? data : data?.transactions || [];
            const pending = { buy: 0, sell: 0 };
            for (const tx of txs) {
              if (tx?.status !== 'pending') continue;
              if (tx?.type === 'buy') pending.buy++;
              else if (tx?.type === 'sell') pending.sell++;
            }
            if (pending.buy > 0 || pending.sell > 0) setPendingInfo(pending);
          })
          .catch(() => { /* 检测失败不阻断修改流程 */ });
      }
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
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {pendingInfo && (
          <Alert
            type="warning"
            showIcon
            message={
              pendingInfo.buy > 0 && pendingInfo.sell > 0
                ? `该基金有 ${pendingInfo.buy} 笔待确认买入、${pendingInfo.sell} 笔待确认卖出订单，修改持仓金额会与其结算冲突，建议等待订单结算后再修改`
                : pendingInfo.buy > 0
                  ? `该基金有 ${pendingInfo.buy} 笔待确认买入订单，修改持仓金额会与其加仓结算冲突，建议等待订单结算后再修改`
                  : `该基金有 ${pendingInfo.sell} 笔待确认卖出订单，修改持仓金额会影响卖出结算的份额与成本，请谨慎操作`
            }
          />
        )}
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
