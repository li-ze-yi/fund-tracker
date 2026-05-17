import { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Form, Input, Button, List, Popconfirm, App, Tabs, Select, Empty, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, FolderOpenOutlined, FundOutlined, SwapOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { groupService } from '@/services/groupService';
import { holdingService } from '@/services/holdingService';

interface Group {
  id: number;
  name: string;
}

interface FundItem {
  id: number;
  fund_code: string;
  fund_name: string;
  group_id?: number;
  market_value?: number;
  shares?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDataChange?: () => void;
}

export default function GroupManageModal({ open, onClose, onDataChange }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const { message: msg } = App.useApp();
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'groups' | 'funds'>('groups');
  const [selectedGroupId, setSelectedGroupId] = useState<number>(-1);
  const [groupFunds, setGroupFunds] = useState<FundItem[]>([]);
  const [fundsLoading, setFundsLoading] = useState(false);
  const [movingFundId, setMovingFundId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const loadGroups = useCallback(() => {
    groupService.getGroups().then((data) => {
      let g = data.groups || data || [];
      g = g.filter((group: Group) =>
        group &&
        group.id != null &&
        group.name &&
        group.name.trim() !== ''
      );
      setGroups(g);
      if (g.length > 0 && selectedGroupId === 0) {
        setSelectedGroupId(g[0].id);
      }
    }).catch((error) => {
      console.error('[GroupManageModal] 加载分组失败:', error);
      msg.error('加载分组失败，请稍后重试');
    });
  }, [selectedGroupId, msg]);

  const loadGroupFunds = useCallback((groupId: number) => {
    setFundsLoading(true);
    holdingService.getHoldings().then((data) => {
      const funds = data.holdings || data || [];
      if (groupId <= 0) {
        setGroupFunds(funds);
      } else {
        setGroupFunds(funds.filter((f: FundItem) => f.group_id === groupId));
      }
    }).catch((error) => {
      console.error('[GroupManageModal] 加载基金失败:', error);
      msg.error('加载基金数据失败，请稍后重试');
    }).finally(() => setFundsLoading(false));
  }, [msg]);

  useEffect(() => {
    if (open) {
      loadGroups();
      setEditingId(null);
      setEditName('');
    }
  }, [open, loadGroups]);

  useEffect(() => {
    if (open && activeTab === 'funds') {
      loadGroupFunds(selectedGroupId);
    }
  }, [open, activeTab, selectedGroupId, loadGroupFunds]);

  const create = async () => {
    if (!newName || !newName.trim()) {
      msg.warning('请输入分组名称，不能为空');
      return;
    }
    setLoading(true);
    try {
      await groupService.createGroup(newName.trim());
      if (mounted) {
        msg.success('创建成功');
        setNewName('');
        loadGroups();
        onDataChange?.();
      }
    } catch (e: any) {
      if (mounted) {
        msg.error(e?.response?.data?.message || '创建失败');
      }
    } finally {
      if (mounted) {
        setLoading(false);
      }
    }
  };

  const update = async (id: number) => {
    if (!editName || !editName.trim()) {
      if (mounted) {
        msg.warning('分组名称不能为空');
        setEditingId(null);
      }
      return;
    }
    try {
      await groupService.updateGroup(id, editName.trim());
      if (mounted) {
        msg.success('修改成功');
        setEditingId(null);
        loadGroups();
        onDataChange?.();
      }
    } catch (e: any) {
      if (mounted) {
        msg.error(e?.response?.data?.message || '修改失败');
      }
    }
  };

  const remove = async (id: number) => {
    try {
      await groupService.deleteGroup(id);
      if (mounted) {
        msg.success('删除成功');
        if (selectedGroupId === id) setSelectedGroupId(-1);
        loadGroups();
        onDataChange?.();
      }
    } catch (e: any) {
      if (mounted) {
        msg.error(e?.response?.data?.message || '删除失败');
      }
    }
  };

  const moveFundToGroup = async (fundId: number, targetGroupId: number) => {
    setMovingFundId(fundId);
    try {
      await holdingService.updateHoldingGroup(fundId, targetGroupId);
      if (mounted) {
        msg.success('移动成功');
        loadGroupFunds(selectedGroupId);
        onDataChange?.();
      }
    } catch (e: any) {
      if (mounted) {
        msg.error(e?.response?.data?.message || '移动失败');
      }
    } finally {
      if (mounted) {
        setMovingFundId(null);
      }
    }
  };

  const deleteFund = async (fundId: number) => {
    try {
      await holdingService.deleteHolding(fundId);
      if (mounted) {
        msg.success('删除成功');
        loadGroupFunds(selectedGroupId);
        onDataChange?.();
      }
    } catch (e: any) {
      if (mounted) {
        msg.error(e?.response?.data?.message || '删除失败');
      }
    }
  };

  const availableGroupsForMove = useMemo(() =>
    groups.filter(g => g.id !== selectedGroupId)
  , [groups, selectedGroupId]);

  return (
    <Modal
      className="group-manage-modal"
      title={
        <span className="group-modal-title" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
          分组设置
        </span>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={680}
      styles={{
        body: {
          padding: '12px 28px',
          maxHeight: '72vh',
          overflowY: 'auto'
        },
        header: {
          padding: '1px 24px',
          borderBottom: '2px solid var(--border-color)'
        }
      }}
    >
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          /* 全局盒模型设置 */
          .group-manage-modal *,
          .group-manage-modal *::before,
          .group-manage-modal *::after {
            box-sizing: border-box !important;
          }

          /* 模态框本身 */
          .group-manage-modal .ant-modal {
            max-width: 98vw !important;
            margin: 4px auto !important;
            top: 4px !important;
            max-height: 96vh !important;
          }

          .group-manage-modal .ant-modal-content {
            max-height: 96vh !important;
            border-radius: 12px !important;
            overflow: hidden !important;
          }

          .group-manage-modal .ant-modal-header {
            padding: 10px 12px !important;
            border-radius: 12px 12px 0 0 !important;
            min-height: 44px !important;
          }

          .group-manage-modal .ant-modal-body {
            padding: 8px 10px !important;
            max-height: calc(96vh - 56px) !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            -webkit-overflow-scrolling: touch !important;
          }

          .group-manage-modal .ant-modal-close {
            top: 6px !important;
            right: 6px !important;
            width: 32px !important;
            height: 32px !important;
            font-size: 16px !important;
          }

          .group-modal-title {
            font-size: clamp(15px, 4vw, 18px) !important;
            letter-spacing: -0.2px !important;
          }

          /* Tabs 标签页 - 紧凑模式 */
          .group-manage-modal .ant-tabs {
            margin-bottom: 6px !important;
          }

          .group-manage-modal .ant-tabs-nav {
            margin-bottom: 8px !important;
            padding: 0 2px !important;
          }

          .group-manage-modal .ant-tabs-tab {
            font-size: clamp(12px, 2.8vw, 14px) !important;
            padding: 6px 10px !important;
            gap: 4px !important;
          }

          .group-manage-modal .ant-tabs-tab-btn span {
            padding: 6px 10px !important;
            border-radius: 5px !important;
            gap: 4px !important;
          }

          .group-manage-modal .ant-tabs-tab-btn span .anticon {
            font-size: 14px !important;
          }

          .group-manage-modal .ant-tabs-nav-list {
            gap: 4px !important;
          }

          .group-manage-modal .ant-tabs-ink-bar {
            height: 2px !important;
          }

          .group-manage-modal .ant-tabs-nav-operations {
            display: none !important;
          }

          /* 创建分组输入区域 - 超紧凑 */
          .group-create-section {
            padding: 10px !important;
            margin-bottom: 12px !important;
            flex-direction: column !important;
            gap: 8px !important;
            border-radius: 8px !important;
          }

          .group-create-section .ant-input {
            font-size: clamp(13px, 3vw, 14px) !important;
            height: 38px !important;
            border-radius: 6px !important;
          }

          .group-create-section .ant-input-lg {
            height: 38px !important;
            padding: 6px 10px !important;
          }

          .group-create-section .ant-btn-primary {
            width: 100% !important;
            height: 38px !important;
            font-size: clamp(13px, 3vw, 14px) !important;
            font-weight: 600 !important;
            border-radius: 6px !important;
            min-width: unset !important;
          }

          .group-create-section .ant-btn-primary .anticon {
            font-size: 14px !important;
          }

          /* 分组列表项 - 紧凑显示 */
          .group-list-item {
            margin-bottom: 6px !important;
            border-radius: 8px !important;
            overflow: hidden !important;
          }

          .group-list-item .ant-list-item {
            padding: 10px 12px !important;
            min-height: 48px !important;
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
          }

          .group-list-item .ant-list-item-meta {
            flex: 1 !important;
            min-width: 0 !important;
            overflow: hidden !important;
          }

          .group-item-name {
            font-size: clamp(13px, 3.2vw, 15px) !important;
            word-break: break-word !important;
            line-height: 1.3 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 2 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
          }

          .group-item-icon {
            font-size: clamp(16px, 4vw, 18px) !important;
            width: 20px !important;
            height: 20px !important;
            flex-shrink: 0 !important;
          }

          /* 操作按钮 - 紧凑型 */
          .group-list-item .ant-list-item-action {
            margin-left: 6px !important;
            gap: 4px !important;
            flex-wrap: nowrap !important;
            flex-shrink: 0 !important;
          }

          .group-list-item .ant-list-item-action > li {
            padding-inline-start: 0 !important;
          }

          .group-list-item .ant-list-item-action-split {
            display: none !important;
          }

          .group-list-item .ant-btn {
            font-size: clamp(10px, 2.5vw, 12px) !important;
            padding: 3px 8px !important;
            height: 30px !important;
            line-height: 1 !important;
            border-radius: 5px !important;
            white-space: nowrap !important;
            min-width: 50px !important;
          }

          .group-list-item .ant-btn-icon-only {
            width: 30px !important;
            min-width: 30px !important;
          }

          .group-list-item .ant-btn .anticon {
            font-size: 12px !important;
          }

          /* 编辑输入框 */
          .group-list-item .ant-input-lg {
            width: 100% !important;
            max-width: none !important;
            font-size: clamp(13px, 3.2vw, 14px) !important;
            height: 36px !important;
            padding: 6px 10px !important;
          }

          /* 基金管理选择器 */
          .fund-selector-section {
            padding: 10px 12px !important;
            margin-bottom: 10px !important;
            flex-direction: column !important;
            gap: 8px !important;
            align-items: stretch !important;
            border-radius: 8px !important;
          }

          .fund-selector-label {
            font-size: clamp(12px, 3vw, 14px) !important;
            font-weight: 600 !important;
          }

          .fund-selector-select {
            width: 100% !important;
            max-width: none !important;
            min-width: unset !important;
          }

          .fund-selector-select .ant-select-selector {
            height: 36px !important;
            font-size: clamp(12px, 3vw, 13px) !important;
          }

          /* 基金卡片 - 紧凑布局 */
          .fund-card-item {
            padding: 8px 10px !important;
            border-radius: 8px !important;
            margin-bottom: 5px !important;
            overflow: hidden !important;
          }

          .fund-card-code {
            display: none !important;
          }

          .fund-card-detail {
            display: none !important;
          }

          .fund-card-name {
            font-size: clamp(13px, 3.2vw, 15px) !important;
            word-break: break-word !important;
            line-height: 1.25 !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 1 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
          }

          .fund-card-data {
            font-size: clamp(11px, 2.7vw, 13px) !important;
            gap: 8px !important;
            flex-wrap: wrap !important;
          }

          .fund-card-data > div:last-child {
            gap: 8px !important;
            font-size: clamp(10px, 2.5vw, 12px) !important;
            flex-wrap: wrap !important;
          }

          /* 移动按钮组和删除按钮容器 - 垂直排列 */
          .fund-card-item > div > div:last-child {
            flex-direction: row !important;
            gap: 6px !important;
            width: auto !important;
            flex-shrink: 0 !important;
          }

          .fund-move-btn-group {
            flex-direction: column !important;
            gap: 3px !important;
            width: 100% !important;
            min-width: 60px !important;
          }

          .fund-move-btn,
          .fund-card-item .ant-select {
            width: 100% !important;
            max-width: none !important;
            min-width: unset !important;
          }

          .fund-move-btn,
          .fund-card-item .ant-btn-dangerous {
            font-size: clamp(10px, 2.5vw, 11px) !important;
            padding: 3px 6px !important;
            height: 28px !important;
            min-height: 28px !important;
            border-radius: 5px !important;
          }

          .fund-card-item .ant-select {
            min-height: 28px !important;
          }

          .fund-card-item .ant-select-selector {
            height: 28px !important;
            min-height: 28px !important;
            font-size: clamp(10px, 2.5vw, 11px) !important;
            padding: 0 6px !important;
          }

          /* Popconfirm 弹窗 - 紧凑型 */
          .group-manage-modal .ant-popconfirm {
            max-width: 90vw !important;
          }

          .group-manage-modal .ant-popconfirm-message-title {
            font-size: clamp(12px, 3vw, 13px) !important;
          }

          .group-manage-modal .ant-popconfirm-message {
            font-size: clamp(11px, 2.7vw, 12px) !important;
          }

          .group-manage-modal .ant-popconfirm-buttons {
            gap: 4px !important;
          }

          .group-manage-modal .ant-popconfirm-buttons button {
            font-size: clamp(10px, 2.5vw, 12px) !important;
            height: 30px !important;
            padding: 0 10px !important;
            border-radius: 5px !important;
          }

          /* Empty 状态 */
          .group-manage-modal .ant-empty {
            padding: 28px 12px !important;
          }

          .group-manage-modal .ant-empty-description {
            font-size: clamp(11px, 2.7vw, 13px) !important;
          }

          /* Spin 加载状态 */
          .group-manage-modal .ant-spin-nested-loading {
            min-height: 100px !important;
          }
        }

        @media screen and (max-width: 480px) {
          /* 超小屏幕极限优化 */
          .group-manage-modal .ant-modal-body {
            padding: 6px 8px !important;
          }

          .group-manage-modal .ant-modal-header {
            padding: 8px 10px !important;
          }

          .group-create-section {
            padding: 8px !important;
            gap: 6px !important;
            margin-bottom: 10px !important;
          }

          .group-create-section .ant-input,
          .group-create-section .ant-btn-primary {
            height: 34px !important;
            font-size: clamp(12px, 3vw, 13px) !important;
          }

          .group-list-item .ant-list-item {
            padding: 8px 10px !important;
            min-height: 44px !important;
          }

          .group-list-item .ant-btn {
            font-size: 10px !important;
            padding: 3px 6px !important;
            height: 28px !important;
            min-width: 44px !important;
          }

          .group-list-item .ant-input-lg {
            height: 32px !important;
            font-size: clamp(12px, 3vw, 13px) !important;
          }

          .fund-card-item {
            padding: 6px 8px !important;
          }

          .fund-card-item > div {
            gap: 6px !important;
          }

          .fund-card-item > div > div:last-child {
            width: auto !important;
            flex-direction: row !important;
            justify-content: flex-end !important;
            gap: 4px !important;
          }

          .fund-move-btn,
          .fund-card-item .ant-btn-dangerous {
            height: 26px !important;
            min-height: 26px !important;
            font-size: 9px !important;
          }

          .fund-card-item .ant-select {
            width: auto !important;
            min-width: 64px !important;
            min-height: 26px !important;
          }

          .fund-card-item .ant-select-selector {
            height: 26px !important;
            min-height: 26px !important;
          }

          .fund-selector-section {
            padding: 8px 10px !important;
            gap: 6px !important;
          }

          .fund-selector-select .ant-select-selector {
            height: 34px !important;
          }

          .group-item-name {
            font-size: clamp(12px, 3vw, 14px) !important;
            -webkit-line-clamp: 1 !important;
          }

          .fund-card-name {
            font-size: clamp(12px, 3vw, 14px) !important;
          }

          .group-manage-modal .ant-tabs-tab {
            padding: 5px 8px !important;
            font-size: clamp(11px, 2.7vw, 13px) !important;
          }

          .group-manage-modal .ant-tabs-tab-btn span {
            padding: 5px 8px !important;
          }
        }

        @media screen and (max-width: 360px) {
          /* 极小屏幕（iPhone SE 等）*/
          .group-manage-modal .ant-modal {
            max-width: 99vw !important;
            margin: 2px auto !important;
          }

          .group-manage-modal .ant-modal-body {
            padding: 5px 6px !important;
          }

          .group-create-section {
            padding: 6px !important;
            gap: 5px !important;
          }

          .group-list-item .ant-list-item {
            padding: 6px 8px !important;
          }

          .group-list-item .ant-btn {
            font-size: 9px !important;
            padding: 2px 5px !important;
            height: 26px !important;
            min-width: 40px !important;
          }

          .fund-card-item {
            padding: 5px 6px !important;
          }
        }
      `}</style>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'groups' | 'funds')}
        size="large"
        style={{
          marginBottom: 12,
        }}
        tabBarStyle={{
          marginBottom: 12,
          borderBottom: '2px solid rgba(128, 128, 128, 0.15)',
        }}
        tabBarGutter={24}
        items={[
          {
            key: 'groups',
            label: (
              <span style={{
                fontSize: 16,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                borderRadius: 8,
                transition: 'all 0.3s ease',
                color: activeTab === 'groups' ? 'var(--text-primary)' : '#f5f0f0',
                background: activeTab === 'groups' ? 'linear-gradient(135deg, rgba(212, 168, 75, 0.12), rgba(212, 168, 75, 0.06))' : 'transparent',
              }}>
                <FolderOpenOutlined style={{ fontSize: 18 }} />
                分组管理
              </span>
            ),
            children: (
              <div>
                <div className="group-create-section" style={{
                  display: 'flex',
                  gap: 12,
                  marginBottom: 20,
                  padding: '16px',
                  background: 'linear-gradient(135deg, rgba(212, 168, 75, 0.06), rgba(212, 168, 75, 0.02))',
                  borderRadius: 12,
                  border: '1px solid rgba(212, 168, 75, 0.15)'
                }}>
                  <Input
                    placeholder="输入新分组名称..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={20}
                    size="large"
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: 500,
                      borderRadius: 8,
                    }}
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={create}
                    loading={loading}
                    size="large"
                    style={{
                      fontWeight: 600,
                      borderRadius: 8,
                      minWidth: 90,
                      height: 40,
                    }}
                  >
                    创建
                  </Button>
                </div>

                <List
                  dataSource={groups}
                  split={false}
                  renderItem={(item, index) => {
                    if (!item.name || item.name.trim() === '') {
                      return null;
                    }
                    return (
                      <div
                      key={item.id}
                      className="group-list-item"
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(212, 168, 75, 0.25)';
                        (e.currentTarget as HTMLElement).style.background = 'rgba(212, 168, 75, 0.04)';
                        (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                        (e.currentTarget as HTMLElement).style.background = index % 2 === 0 ? 'transparent' : 'rgba(128, 128, 128, 0.04)';
                        (e.currentTarget as HTMLElement).style.transform = 'none';
                      }}
                      style={{
                        background: index % 2 === 0 ? 'transparent' : 'rgba(128, 128, 128, 0.04)',
                        borderRadius: 10,
                        marginBottom: 8,
                        transition: 'all 0.25s ease',
                        border: '1px solid transparent',
                      }}
                    >
                      <List.Item
                        style={{
                          padding: '14px 16px',
                          borderRadius: 10,
                          border: 'none'
                        }}
                        actions={[
                          editingId === item.id ? (
                            <>
                              <Button
                                size="middle"
                                type="primary"
                                onClick={() => update(item.id)}
                                style={{ fontWeight: 600, borderRadius: 6 }}
                              >
                                保存
                              </Button>
                              <Button
                                size="middle"
                                onClick={() => setEditingId(null)}
                                style={{ fontWeight: 500, borderRadius: 6 }}
                              >
                                取消
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="middle"
                              icon={<EditOutlined />}
                              onClick={() => { setEditingId(item.id); setEditName(item.name); }}
                              style={{
                                fontWeight: 500,
                                borderRadius: 6,
                                color: 'var(--accent-gold)',
                                borderColor: 'rgba(212, 168, 75, 0.3)'
                              }}
                            >
                              编辑
                            </Button>
                          ),
                          <Popconfirm
                            title="确定删除该分组？"
                            description="分组下的基金将自动移入默认分组"
                            okText="确定删除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => remove(item.id)}
                          >
                            <Button
                              size="middle"
                              danger
                              icon={<DeleteOutlined />}
                              style={{ fontWeight: 500, borderRadius: 6 }}
                            >
                              删除
                            </Button>
                          </Popconfirm>,
                        ]}
                      >
                        {editingId === item.id ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={20}
                            size="large"
                            autoFocus
                            style={{
                              width: 240,
                              fontSize: 15,
                              fontWeight: 600,
                              borderRadius: 8,
                            }}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FolderOpenOutlined className="group-item-icon" style={{
                              fontSize: 18,
                              color: 'var(--accent-gold)',
                              opacity: 0.85
                            }} />
                            <span className="group-item-name" style={{
                              fontSize: 15,
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              letterSpacing: '-0.2px'
                            }}>
                              {item.name}
                            </span>
                          </div>
                        )}
                      </List.Item>
                    </div>
                    );
                  }}
                  locale={{
                    emptyText: (
                      <Empty
                        description={
                          <span className="fund-selector-label" style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                暂无分组，点击上方创建
                              </span>
                        }
                        style={{ padding: '48px 0' }}
                      />
                    )
                  }}
                />
              </div>
            )
          },
          {
            key: 'funds',
            label: (
              <span style={{
                fontSize: 16,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                borderRadius: 8,
                transition: 'all 0.3s ease',
                color: activeTab === 'funds' ? 'var(--text-primary)' : '#f9f5f5',
                background: activeTab === 'funds' ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(59, 130, 246, 0.06))' : 'transparent',
              }}>
                <FundOutlined style={{ fontSize: 18 }} />
                基金管理
              </span>
            ),
            children: (
              <div>
                <div className="fund-selector-section" style={{
                  marginBottom: 16,
                  padding: '14px 18px',
                  background: 'linear-gradient(135deg, rgba(212, 168, 75, 0.1), rgba(212, 168, 75, 0.05))',
                  borderRadius: 12,
                  borderLeft: '4px solid var(--accent-gold)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: '0 2px 8px rgba(212, 168, 75, 0.12)'
                }}>
                  <span className="fund-selector-label" style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}>
                    选择分组：
                  </span>
                  <Select
                    className="fund-selector-select"
                    value={selectedGroupId}
                    onChange={(val) => setSelectedGroupId(val)}
                    size="middle"
                    style={{ width: 220 }}
                    placeholder="请选择"
                    options={[
                      { value: -1, label: '📋 全部基金' },
                      ...groups.map(g => ({ value: g.id, label: `📁 ${g.name}` }))
                    ]}
                  />
                </div>

                <Spin spinning={fundsLoading} size="large">
                  {groupFunds.length === 0 ? (
                    <Empty
                      description={
                        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                          {selectedGroupId <= 0 ? "请先选择一个分组" : "该分组下暂无基金"}
                        </span>
                      }
                      style={{ padding: '56px 0' }}
                    />
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3
                    }}>
                      {groupFunds.map((fund) => (
                        <div
                          key={fund.id}
                          className="fund-card-item"
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(212, 168, 75, 0.5)';
                            (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(212, 168, 75, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.8) inset';
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(128, 128, 128, 0.18)';
                            (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.5) inset';
                            (e.currentTarget as HTMLElement).style.transform = 'none';
                          }}
                          style={{
                            background: 'linear-gradient(135deg, #ffffff 0%, #fafafa 100%)',
                            borderRadius: 12,
                            border: '1.5px solid rgba(128, 128, 128, 0.18)',
                            padding: '7px 16px',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.5) inset',
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 16
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="fund-card-data" style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: 12,
                                marginBottom: 2
                              }}>
                                <span className="fund-card-name" style={{
                                  fontSize: 17,
                                  fontWeight: 800,
                                  color: '#1a1a1a',
                                  letterSpacing: '-0.4px',
                                  lineHeight: 1.3
                                }}>
                                  {fund.fund_name}
                                </span>
                                <span className="fund-card-code" style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: '#4a5568',
                                  fontFamily: '"SF Mono", "Consolas", monospace',
                                  background: 'linear-gradient(135deg, #edf2f7, #e2e8f0)',
                                  padding: '3px 10px',
                                  borderRadius: 6,
                                  letterSpacing: '0.5px',
                                  border: '1px solid rgba(128, 128, 128, 0.15)'
                                }}>
                                  {fund.fund_code}
                                </span>
                              </div>

                              <div className="fund-card-detail" style={{
                                display: 'flex',
                                gap: 24,
                                fontSize: 14,
                                fontWeight: 600,
                                color: '#2d3748'
                              }}>
                                <span>
                                  <span style={{ color: '#718096', marginRight: 6, fontWeight: 500 }}>持仓</span>
                                  <span style={{
                                    fontWeight: 800,
                                    color: '#1a202c',
                                    fontFamily: '"SF Mono", "Consolas", monospace',
                                    fontSize: 15
                                  }}>
                                    ¥{fund.market_value?.toLocaleString() ?? '0.00'}
                                  </span>
                                </span>
                                {fund.shares && (
                                  <span>
                                    <span style={{ color: '#718096', marginRight: 6, fontWeight: 500 }}>份额</span>
                                    <span style={{
                                      fontWeight: 700,
                                      color: '#2d3748',
                                      fontFamily: '"SF Mono", "Consolas", monospace'
                                    }}>
                                      {fund.shares.toFixed(2)}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={{
                              display: 'flex',
                              gap: 8,
                              flexShrink: 0,
                              alignItems: 'center'
                            }}>
                              <Select
                                value={undefined}
                                placeholder={
                                  <span style={{
                                    color: 'var(--accent-gold)',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}>
                                    <SwapOutlined /> 移动
                                  </span>
                                }
                                size="middle"
                                style={{ width: 130, height: 32 }}
                                popupMatchSelectWidth={false}
                                dropdownStyle={{ minWidth: 140 }}
                                loading={movingFundId === fund.id}
                                onChange={(targetGroupId) => targetGroupId !== undefined && moveFundToGroup(fund.id, targetGroupId)}
                                options={availableGroupsForMove.map(g => ({
                                  value: g.id,
                                  label: (
                                    <span style={{
                                      fontWeight: 500,
                                      display: 'flex',
                                      alignItems: 'center',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}>
                                      <ArrowRightOutlined style={{ marginRight: 4, color: 'var(--accent-gold)', flexShrink: 0 }} />
                                      {g.name}
                                    </span>
                                  )
                                }))}
                                notFoundContent={
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    暂无其他分组
                                  </span>
                                }
                              />

                              <Popconfirm
                                title="确定要删除该持有记录？"
                                description="⚠️ 删除后将无法恢复收益数据"
                                okText="确定删除"
                                cancelText="取消"
                                okButtonProps={{ danger: true, shape: 'round' }}
                                cancelButtonProps={{ shape: 'round' }}
                                onConfirm={() => deleteFund(fund.id)}
                              >
                                <Button
                                  danger
                                  size="middle"
                                  icon={<DeleteOutlined />}
                                  style={{
                                    fontWeight: 600,
                                    borderRadius: 8,
                                    borderWidth: 1.5,
                                    height: 32
                                  }}
                                >
                                  删除
                                </Button>
                              </Popconfirm>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Spin>
              </div>
            )
          }
        ]}
      />
    </Modal>
  );
}
