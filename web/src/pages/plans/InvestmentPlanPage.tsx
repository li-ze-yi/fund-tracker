import { useState, useEffect } from 'react';
import { Button, Tag, Empty, List, Popconfirm, App, Space } from 'antd';
import { PlusOutlined, PauseCircleOutlined, PlayCircleOutlined, DeleteOutlined, CalendarOutlined, DollarOutlined, SyncOutlined, EditOutlined } from '@ant-design/icons';
import { planService } from '@/services/planService';
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
      <style>{`
        .plan-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 18px 20px;
          margin-bottom: 12px;
          transition: all var(--transition-fast);
        }
        .plan-card:hover {
          background: var(--bg-card-hover);
          border-color: var(--border-default);
          box-shadow: var(--shadow-sm);
        }
        .plan-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .plan-card-fund-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 280px;
        }
        .plan-card-info {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
        }
        .plan-info-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .plan-info-item .anticon {
          font-size: 13px;
          color: var(--text-muted);
        }
        .plan-info-value {
          color: var(--text-primary);
          font-weight: 500;
          font-family: var(--font-mono);
        }
        .plan-info-value.amount {
          color: var(--accent-gold);
        }
        .plan-card-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .plan-action-edit {
          height: 32px;
          width: 32px;
          font-size: 14px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-default);
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .plan-action-edit:hover {
          border-color: var(--accent-gold);
          color: var(--accent-gold);
          background: var(--accent-gold-dim);
        }
        .plan-action-toggle {
          height: 32px;
          font-size: 13px;
          border-radius: var(--radius-sm);
          padding: 0 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          border: 1px solid var(--border-default);
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .plan-action-toggle:hover {
          border-color: var(--accent-gold);
          color: var(--accent-gold);
          background: var(--accent-gold-dim);
        }
        .plan-action-toggle.pause:hover {
          border-color: var(--gain);
          color: var(--gain);
          background: var(--gain-bg);
        }
        .plan-action-delete {
          height: 32px;
          width: 32px;
          font-size: 14px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-default);
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .plan-action-delete:hover {
          border-color: var(--gain);
          color: var(--gain);
          background: var(--gain-bg);
        }
        .plan-empty-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: var(--text-muted);
        }
        .plan-empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.3;
        }
        .plan-empty-text {
          font-size: 15px;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .plan-empty-sub {
          font-size: 13px;
          color: var(--text-dim);
        }

        @media screen and (max-width: 768px) {
          .investment-plan-page {
            padding: 12px 8px !important;
          }
          .plan-page-header {
            margin-bottom: 12px !important;
            padding: 0 4px !important;
          }
          .plan-page-title {
            font-size: clamp(18px, 5vw, 20px) !important;
          }
          .plan-create-btn {
            height: 36px !important;
            font-size: clamp(13px, 3.2vw, 14px) !important;
            padding: 0 12px !important;
            border-radius: var(--radius-md) !important;
          }
          .plan-card {
            padding: 14px 12px !important;
            margin-bottom: 10px !important;
            border-radius: var(--radius-md) !important;
          }
          .plan-card-header {
            margin-bottom: 10px !important;
          }
          .plan-card-fund-name {
            font-size: clamp(14px, 3.5vw, 15px) !important;
            max-width: 180px !important;
          }
          .plan-card-info {
            gap: 12px !important;
          }
          .plan-info-item {
            font-size: clamp(12px, 3vw, 13px) !important;
          }
          .plan-card-actions {
            gap: 6px !important;
          }
          .plan-action-toggle {
            height: 30px !important;
            font-size: clamp(12px, 3vw, 13px) !important;
            padding: 0 8px !important;
          }
          .plan-action-edit {
            height: 30px !important;
            width: 30px !important;
            font-size: 13px !important;
          }
          .plan-action-delete {
            height: 30px !important;
            width: 30px !important;
            font-size: 13px !important;
          }
        }
      `}</style>

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
                    <span className="plan-info-value amount">¥{Number(plan.amount).toLocaleString()}</span>
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
