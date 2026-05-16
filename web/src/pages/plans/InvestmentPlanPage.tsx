import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tag, Empty, List, Popconfirm, App, Space, Skeleton } from 'antd';
import { PlusOutlined, PauseCircleOutlined, PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { planService } from '@/services/planService';
import CreatePlanModal from '@/components/modals/CreatePlanModal';

const statusMap: Record<string, { color: string; text: string }> = {
  active: { color: 'green', text: '进行中' },
  paused: { color: 'gold', text: '已暂停' },
  cancelled: { color: 'default', text: '已取消' },
};

export default function InvestmentPlanPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
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
    return <Skeleton active paragraph={{ rows: 4 }} style={{ padding: 16 }} />;
  }

  return (
    <div className="investment-plan-page" style={{ padding: 16 }}>
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          .investment-plan-page {
            padding: 12px 8px !important;
          }

          /* 页面标题栏 */
          .plan-page-header {
            margin-bottom: 14px !important;
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

          /* 空状态 */
          .plan-empty-state {
            margin-top: 50px !important;
          }

          /* 列表项 */
          .ant-list-item {
            padding: 12px 8px !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
          }

          .plan-item-title {
            font-size: clamp(14px, 3.5vw, 16px) !important;
          }

          .plan-item-tag {
            font-size: clamp(11px, 2.8vw, 12px) !important;
            padding: 2px 6px !important;
          }

          .plan-item-description {
            font-size: clamp(12px, 3vw, 13px) !important;
            line-height: 1.5 !important;
          }

          /* 操作按钮 */
          .plan-action-btn {
            height: 32px !important;
            font-size: clamp(11px, 2.8vw, 12px) !important;
            min-width: auto !important;
            border-radius: var(--radius-sm) !important;
          }
        }
      `}</style>

      <div className="plan-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span className="plan-page-title" style={{ fontSize: 18, fontWeight: 600 }}>定投计划</span>
        <Button className="plan-create-btn" type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新建定投</Button>
      </div>

      {plans.length === 0 ? (
        <Empty className="plan-empty-state" description="暂无定投计划" style={{ marginTop: 60 }} />
      ) : (
        <List
          dataSource={plans}
          renderItem={(plan: any) => {
            const status = statusMap[plan.status] || { color: 'default', text: plan.status };
            const freqText = plan.frequency === 'daily' ? '每日' : plan.frequency === 'weekly' ? '每周' : '每月';
            return (
              <List.Item
                actions={[
                  <Button
                    key="toggle"
                    size="small"
                    icon={plan.status === 'active' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    onClick={() => toggleStatus(plan)}
                  >
                    {plan.status === 'active' ? '暂停' : '恢复'}
                  </Button>,
                  <Popconfirm key="delete" title="确定删除？" onConfirm={() => deletePlan(plan.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <span>{plan.fund_name || plan.fund_code}</span>
                      <Tag color={status.color}>{status.text}</Tag>
                    </Space>
                  }
                  description={
                    <span>
                      ¥{Number(plan.amount).toLocaleString()} / {freqText}
                      {plan.next_run_date ? ` | 下次: ${plan.next_run_date}` : ''}
                    </span>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}

      <CreatePlanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadPlans}
      />
    </div>
  );
}