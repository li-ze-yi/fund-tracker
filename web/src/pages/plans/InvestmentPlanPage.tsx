import { useState, useEffect } from 'react';
import { Button, Tag, Empty, List, Popconfirm, App, Space } from 'antd';
import { PlusOutlined, PauseCircleOutlined, PlayCircleOutlined, DeleteOutlined, CalendarOutlined, DollarOutlined, SyncOutlined, EditOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { planService } from '@/services/planService';
import { useHideAmountStore } from '@/store/hideAmountStore';
import CreatePlanModal from '@/components/modals/CreatePlanModal';
import EditPlanModal from '@/components/modals/EditPlanModal';

const statusMap: Record<string, { color: string; text: string }> = {
  active: { color: 'green', text: '进行中' },
  paused: { color: 'gold', text: '已暂停' },
  cancelled: { color: 'default', text: '已取消' },
};

const freqMap: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  biweekly: '每两周',
  monthly: '每月',
};

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return dateStr;
  }
}

export default function InvestmentPlanPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const { message } = App.useApp();
  const hideAmount = useHideAmountStore((s) => s.hidden);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await planService.getPlans();
      setPlans(data.plans || data || []);
    } catch {
      message.error('获取定投计划失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPlans(); }, []);

  const toggleStatus = async (plan: any) => {
    try {
      const newStatus = plan.status === 'active' ? 'paused' : 'active';
      await planService.updatePlanStatus(plan.id, newStatus);
      message.success(newStatus === 'active' ? '已恢复' : '已暂停');
      loadPlans();
    } catch {
      message.error('操作失败');
    }
  };

  const deletePlan = async (id: number) => {
    try {
      await planService.deletePlan(id);
      message.success('已删除');
      loadPlans();
    } catch {
      message.error('删除失败');
    }
  };

  if (loading) {
    return (
      <div className="investment-plan-page" style={{ padding: 16 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="plan-skeleton-card" style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            padding: 20,
            marginBottom: 12,
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ width: 160, height: 20, background: 'var(--border-default)', borderRadius: 6 }} />
              <div style={{ width: 60, height: 22, background: 'var(--border-default)', borderRadius: 4 }} />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ width: 100, height: 16, background: 'var(--border-subtle)', borderRadius: 4 }} />
              <div style={{ width: 80, height: 16, background: 'var(--border-subtle)', borderRadius: 4 }} />
              <div style={{ width: 120, height: 16, background: 'var(--border-subtle)', borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="investment-plan-page" style={{ padding: 16 }}>
      <div className="plan-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span className="plan-page-title" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>定投计划</span>
        <Button className="plan-create-btn" type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新建定投</Button>
      </div>

      {plans.length === 0 ? (
        <div className="plan-empty-wrap">
          <SyncOutlined className="plan-empty-icon" />
          <div className="plan-empty-text">暂无定投计划</div>
          <div className="plan-empty-sub">点击右上角「新建定投」开始创建</div>
        </div>
      ) : (
        plans.map((plan: any) => {
          const status = statusMap[plan.status] || { color: 'default', text: plan.status };
          const freqText = freqMap[plan.frequency] || plan.frequency;
          return (
            <div className="plan-card" key={plan.id}>
              <div className="plan-card-header">
                <span className="plan-card-fund-name">{plan.fund_name || plan.fund_code}</span>
                <Tag
                  color={status.color}
                  style={{
                    margin: 0,
                    fontSize: 12,
                    padding: '2px 10px',
                    borderRadius: 'var(--radius-full)',
                    lineHeight: '20px',
                  }}
                >
                  {status.text}
                </Tag>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
                <div className="plan-card-info">
                  <span className="plan-info-item">
                    <DollarOutlined />
                    <span className="plan-info-value amount">{hideAmount ? '****' : `¥${Number(plan.amount).toLocaleString()}`}</span>
                  </span>
                  <span className="plan-info-item">
                    <SyncOutlined />
                    <span className="plan-info-value">{freqText}</span>
                  </span>
                  {plan.next_run_date && (
                    <span className="plan-info-item">
                      <CalendarOutlined />
                      <span className="plan-info-value">{formatDate(plan.next_run_date)}</span>
                    </span>
                  )}
                  {plan.pending_count > 0 && (
                    <span className="plan-info-item">
                      <ClockCircleOutlined />
                      <span className="plan-info-value" style={{ color: '#d48806' }}>{plan.pending_count}笔待确认</span>
                    </span>
                  )}
                </div>
                <div className="plan-card-actions">
                  <button
                    className="plan-action-edit"
                    onClick={() => { setEditingPlan(plan); setEditModalOpen(true); }}
                  >
                    <EditOutlined />
                  </button>
                  <button
                    className={`plan-action-toggle ${plan.status === 'active' ? 'pause' : ''}`}
                    onClick={() => toggleStatus(plan)}
                  >
                    {plan.status === 'active' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    {plan.status === 'active' ? '暂停' : '恢复'}
                  </button>
                  <Popconfirm title="确定删除此定投计划？" onConfirm={() => deletePlan(plan.id)} okText="删除" cancelText="取消">
                    <button className="plan-action-delete">
                      <DeleteOutlined />
                    </button>
                  </Popconfirm>
                </div>
              </div>
            </div>
          );
        })
      )}

      <CreatePlanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadPlans}
      />
      <EditPlanModal
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingPlan(null); }}
        onSuccess={loadPlans}
        plan={editingPlan}
      />
    </div>
  );
}
