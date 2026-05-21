import { useState, useEffect, useRef } from 'react';
import { Modal, Upload, Button, Table, Input, InputNumber, Tag, Select, App, Spin } from 'antd';
import { InboxOutlined, DeleteOutlined, CameraOutlined, CloseOutlined, CheckOutlined, SearchOutlined } from '@ant-design/icons';
import { imageImportService } from '@/services/imageImportService';
import { groupService } from '@/services/groupService';
import { fundService } from '@/services/fundService';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface RecognizedItem {
  key: string;
  fundCode: string;
  fundName: string;
  amount: number | null;
  totalReturn: number | null;
  valid: boolean;
  reason?: string;
}

type Step = 'upload' | 'recognizing' | 'result';

export default function ImageImportModal({ open, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [items, setItems] = useState<RecognizedItem[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(undefined);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [rawText, setRawText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [searchDropdownKey, setSearchDropdownKey] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { message } = App.useApp();

  // 响应式检测
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (open) {
      groupService.getGroups().then((data) => {
        setGroups(data.groups || data || []);
      }).catch(() => {});
    }
  }, [open]);

  // 弹窗关闭时重置状态
  const handleClose = () => {
    setStep('upload');
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setItems([]);
    setSelectedGroupId(undefined);
    setConfirmLoading(false);
    setRawText('');
    setShowRawText(false);
    setExpandedKey(null);
    onClose();
  };

  // 处理文件选择
  const handleFileSelect = (f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  };

  // 识别
  const handleRecognize = async () => {
    if (!file) return;
    setStep('recognizing');
    try {
      const data = await imageImportService.recognize(file);
      const recognized: RecognizedItem[] = (data.items || []).map(
        (item: any, index: number) => ({
          key: `row-${index}-${Date.now()}`,
          fundCode: item.fundCode || item.fund_code || '',
          fundName: item.fundName || item.fund_name || '',
          amount: item.amount ?? item.investment_amount ?? null,
          totalReturn: item.totalReturn ?? item.accumulated_profit ?? null,
          valid: item.valid !== false && !!(item.fundCode || item.fund_code),
          reason: item.error || item.reason || '',
        })
      );
      setItems(recognized);
      setRawText(data.rawText || '');
      setStep('result');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '识别失败，请重试');
      setStep('upload');
    }
  };

  // 更新行数据
  const updateItem = (key: string, field: keyof RecognizedItem, value: any) => {
    setItems(prev =>
      prev.map(item => {
        if (item.key !== key) return item;
        const updated = { ...item, [field]: value };
        // 基金代码变更时重新校验有效性
        if (field === 'fundCode') {
          updated.valid = !!value && value.length >= 6;
          updated.reason = !value ? '基金代码为空' : value.length < 6 ? '基金代码格式不正确' : '';
        }
        return updated;
      })
    );
  };

  // 删除行
  const removeItem = (key: string) => {
    setItems(prev => prev.filter(item => item.key !== key));
  };

  // 基金名称搜索（防抖）
  const handleFundNameSearch = (key: string, name: string) => {
    updateItem(key, 'fundName', name);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!name || name.length < 2) {
      setSearchDropdownKey(null);
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await fundService.searchFunds(name);
        const results = data.funds || data || [];
        if (results.length > 0) {
          setSearchDropdownKey(key);
          setSearchResults(results.slice(0, 10));
        } else {
          setSearchDropdownKey(null);
          setSearchResults([]);
        }
      } catch {
        setSearchDropdownKey(null);
        setSearchResults([]);
      }
    }, 300);
  };

  // 选择搜索结果中的基金
  const selectFund = (key: string, fund: any) => {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      return {
        ...item,
        fundCode: fund.code,
        fundName: fund.name,
        valid: true,
        reason: '',
      };
    }));
    setSearchDropdownKey(null);
    setSearchResults([]);
  };

  // 确认导入
  const handleConfirm = async () => {
    const validItems = items.filter(item => item.valid);
    if (validItems.length === 0) {
      message.warning('没有可导入的有效数据');
      return;
    }
    setConfirmLoading(true);
    try {
      await imageImportService.confirmImport(
        validItems.map(item => ({
          fundCode: item.fundCode,
          amount: item.amount ?? 0,
          totalReturn: item.totalReturn ?? 0,
          groupId: selectedGroupId,
        }))
      );
      message.success(`成功导入 ${validItems.length} 条持仓`);
      onSuccess();
      handleClose();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '导入失败');
    } finally {
      setConfirmLoading(false);
    }
  };

  const validCount = items.filter(i => i.valid).length;
  const invalidCount = items.filter(i => !i.valid).length;

  // 表格列定义
  const columns = [
    {
      title: '基金代码',
      dataIndex: 'fundCode',
      width: 110,
      render: (_: string, record: RecognizedItem) => (
        <span style={{ fontSize: 13, color: record.fundCode ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
          {record.fundCode || '-'}
        </span>
      ),
    },
    {
      title: '基金名称',
      dataIndex: 'fundName',
      width: 180,
      render: (_: string, record: RecognizedItem) => (
        <div style={{ position: 'relative' }}>
          <Input
            value={record.fundName}
            onChange={e => handleFundNameSearch(record.key, e.target.value)}
            size="small"
            placeholder="输入名称搜索"
            suffix={<SearchOutlined style={{ color: 'var(--text-muted)', fontSize: 11 }} />}
            style={{ fontSize: 13 }}
          />
          {searchDropdownKey === record.key && searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1000,
              background: 'var(--bg-card, #fff)',
              border: '1px solid var(--border-subtle, #e8e8e8)',
              borderRadius: 6,
              maxHeight: 180,
              overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            }}>
              {searchResults.map((fund: any) => (
                <div
                  key={fund.code}
                  onClick={() => selectFund(record.key, fund)}
                  style={{
                    padding: '6px 10px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-subtle, #f0f0f0)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated, #f5f5f5)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ color: 'var(--text-primary)' }}>{fund.name}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{fund.code}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '持仓金额',
      dataIndex: 'amount',
      width: 120,
      render: (_: any, record: RecognizedItem) => (
        <InputNumber
          value={record.amount}
          onChange={val => updateItem(record.key, 'amount', val)}
          size="small"
          min={0}
          step={100}
          prefix="¥"
          style={{ width: '100%', fontSize: 13 }}
          placeholder="金额"
        />
      ),
    },
    {
      title: '累计收益',
      dataIndex: 'totalReturn',
      width: 120,
      render: (_: any, record: RecognizedItem) => (
        <InputNumber
          value={record.totalReturn}
          onChange={val => updateItem(record.key, 'totalReturn', val)}
          size="small"
          step={100}
          prefix="¥"
          style={{ width: '100%', fontSize: 13 }}
          placeholder="收益"
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'valid',
      width: 90,
      render: (valid: boolean, record: RecognizedItem) =>
        valid ? (
          <Tag color="success" style={{ margin: 0 }}>有效</Tag>
        ) : (
          <Tag color="error" style={{ margin: 0 }} title={record.reason}>
            无效
          </Tag>
        ),
    },
    {
      title: '操作',
      width: 50,
      render: (_: any, record: RecognizedItem) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeItem(record.key)}
        />
      ),
    },
  ];

  // 上传区域
  const renderUploadStep = () => (
    <div>
      <div style={{
        padding: '8px 12px',
        marginBottom: 12,
        background: 'rgba(250, 173, 20, 0.1)',
        border: '1px solid rgba(250, 173, 20, 0.3)',
        borderRadius: 'var(--radius-md, 6px)',
        fontSize: 12,
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
      }}>
        功能测试中，识别可能不准确，主要支持支付宝持仓截图
      </div>
      {!previewUrl ? (
        <Upload.Dragger
          accept=".jpg,.jpeg,.png"
          showUploadList={false}
          beforeUpload={(f) => {
            const isImage = f.type === 'image/jpeg' || f.type === 'image/png';
            if (!isImage) {
              message.error('仅支持 JPG/PNG 格式图片');
              return Upload.LIST_IGNORE;
            }
            const isLt10M = f.size / 1024 / 1024 < 10;
            if (!isLt10M) {
              message.error('图片大小不能超过 10MB');
              return Upload.LIST_IGNORE;
            }
            handleFileSelect(f);
            return false;
          }}
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            minHeight: isMobile ? 180 : undefined,
          }}
        >
          <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
            <InboxOutlined style={{ fontSize: isMobile ? 32 : 40, color: 'var(--accent-gold)' }} />
          </p>
          <p style={{ fontSize: isMobile ? 14 : 14, color: 'var(--text-primary)', fontWeight: 500 }}>
            点击或拖拽上传持仓截图
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, opacity: 0.8 }}>
            支持 JPG / PNG 格式，最大 10MB
          </p>
        </Upload.Dragger>
      ) : (
        <div>
          <div style={{
            position: 'relative',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
          }}>
            <img
              src={previewUrl}
              alt="预览"
              style={{
                width: '100%',
                maxHeight: isMobile ? 240 : 300,
                objectFit: 'contain',
                display: 'block',
              }}
            />
            <Button
              size="small"
              type="text"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
                setFile(null);
              }}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: 'rgba(0,0,0,0.5)',
                color: '#fff',
                borderRadius: 6,
                border: 'none',
                minHeight: 32,
                minWidth: 32,
              }}
            >
              重新选择
            </Button>
          </div>
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Button
              type="primary"
              icon={<CameraOutlined />}
              onClick={handleRecognize}
              block={isMobile}
              style={{ borderRadius: 'var(--radius-md)', minHeight: isMobile ? 44 : undefined }}
            >
              开始识别
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // 识别中
  const renderRecognizing = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: isMobile ? '36px 16px' : '48px 0',
      gap: 16,
    }}>
      <Spin size="large" />
      <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'center' }}>
        正在识别图片中的持仓信息...
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
        OCR 识别可能需要 10-30 秒，请耐心等待
      </div>
    </div>
  );

  // 手机端单张基金卡片
  const renderMobileCard = (item: RecognizedItem) => {
    const isExpanded = expandedKey === item.key;
    const amountDisplay = item.amount != null && item.amount !== 0
      ? `¥${item.amount.toLocaleString()}`
      : '待补充';
    const returnColor = item.totalReturn != null
      ? (item.totalReturn > 0 ? 'var(--gain)' : item.totalReturn < 0 ? 'var(--loss)' : 'var(--text-secondary)')
      : 'var(--text-muted)';
    const returnDisplay = item.totalReturn != null
      ? `${item.totalReturn > 0 ? '+' : ''}¥${item.totalReturn.toLocaleString()}`
      : '待补充';

    return (
      <div
        key={item.key}
        onClick={() => { if (!isExpanded) setExpandedKey(item.key); }}
        style={{
          background: 'var(--bg-card, var(--bg-elevated))',
          borderRadius: 'var(--radius-lg, 12px)',
          border: `1px solid ${!item.valid ? 'var(--loss)' : 'var(--border-subtle)'}`,
          borderWidth: !item.valid ? 2 : 1,
          padding: '14px 16px',
          marginBottom: 10,
          position: 'relative',
          cursor: isExpanded ? 'default' : 'pointer',
          touchAction: 'manipulation',
          transition: 'border-color 0.2s',
        }}
      >
        {/* 删除按钮 */}
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={(e) => { e.stopPropagation(); removeItem(item.key); }}
          style={{
            position: 'absolute',
            top: 8,
            right: 4,
            minWidth: 36,
            minHeight: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        />

        {/* 卡片主体 - 非展开态 */}
        {!isExpanded && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: 28 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.fundName || '未知基金'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {item.fundCode || '-'}
                {!item.valid && item.reason && (
                  <span style={{ color: 'var(--loss)', marginLeft: 8 }}>{item.reason}</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                {amountDisplay}
              </div>
              <div style={{ fontSize: 13, color: returnColor, marginTop: 2 }}>
                {returnDisplay}
              </div>
            </div>
          </div>
        )}

        {/* 卡片主体 - 展开编辑态 */}
        {isExpanded && (
          <div style={{ paddingRight: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>编辑基金</span>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={(e) => { e.stopPropagation(); setExpandedKey(null); }}
                style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              />
            </div>

            {/* 基金代码（只读） */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>基金代码</label>
              <Input
                value={item.fundCode}
                size="middle"
                readOnly
                style={{ fontSize: 14, minHeight: 40, color: item.fundCode ? 'var(--text-primary)' : 'var(--text-muted)', background: 'var(--bg-elevated, #f5f5f5)' }}
                onClick={e => e.stopPropagation()}
              />
              {!item.valid && item.reason && (
                <div style={{ fontSize: 11, color: 'var(--loss)', marginTop: 2 }}>{item.reason}</div>
              )}
            </div>

            {/* 基金名称（可编辑 + 联动搜索） */}
            <div style={{ marginBottom: 10, position: 'relative' }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>基金名称</label>
              <Input
                value={item.fundName}
                onChange={e => handleFundNameSearch(item.key, e.target.value)}
                size="middle"
                placeholder="输入基金名称搜索"
                suffix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
                style={{ fontSize: 14, minHeight: 40 }}
                onClick={e => e.stopPropagation()}
              />
              {/* 搜索结果下拉 */}
              {searchDropdownKey === item.key && searchResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                  background: 'var(--bg-card, #fff)',
                  border: '1px solid var(--border-subtle, #e8e8e8)',
                  borderRadius: 6,
                  maxHeight: 200,
                  overflowY: 'auto',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                }}>
                  {searchResults.map((fund: any) => (
                    <div
                      key={fund.code}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectFund(item.key, fund);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-subtle, #f0f0f0)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated, #f5f5f5)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{fund.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{fund.code}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 持仓金额 + 累计收益 */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>持仓金额</label>
                <InputNumber
                  value={item.amount}
                  onChange={val => updateItem(item.key, 'amount', val)}
                  size="middle"
                  min={0}
                  step={100}
                  prefix="¥"
                  style={{ width: '100%', fontSize: 14, minHeight: 40 }}
                  placeholder="金额"
                  onClick={e => e.stopPropagation()}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>累计收益</label>
                <InputNumber
                  value={item.totalReturn}
                  onChange={val => updateItem(item.key, 'totalReturn', val)}
                  size="middle"
                  step={100}
                  prefix="¥"
                  style={{ width: '100%', fontSize: 14, minHeight: 40 }}
                  placeholder="收益"
                  onClick={e => e.stopPropagation()}
                />
              </div>
            </div>

            {/* 确认按钮 */}
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={(e) => { e.stopPropagation(); setExpandedKey(null); }}
                style={{ borderRadius: 'var(--radius-md, 6px)' }}
              >
                完成
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 识别结果
  const renderResult = () => (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          识别结果（有效 <span style={{ color: 'var(--gain)', fontWeight: 600 }}>{validCount}</span> 条，
          无效 <span style={{ color: 'var(--loss)', fontWeight: 600 }}>{invalidCount}</span> 条）
        </div>
        <Select
          allowClear
          placeholder="选择导入分组"
          size="small"
          value={selectedGroupId}
          onChange={setSelectedGroupId}
          style={{ width: isMobile ? '100%' : 160, minWidth: isMobile ? '100%' : 160 }}
          options={groups.map(g => ({ value: g.id, label: g.name }))}
        />
      </div>

      {/* 手机端：卡片列表 */}
      {isMobile && (
        <div style={{ maxHeight: '50vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {items.map(item => renderMobileCard(item))}
          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 14 }}>
              暂无识别结果
            </div>
          )}
        </div>
      )}

      {/* 桌面端：表格 */}
      {!isMobile && (
        <Table
          dataSource={items}
          columns={columns}
          pagination={false}
          size="small"
          scroll={{ x: 640 }}
          rowClassName={(record) =>
            !record.valid ? 'image-import-invalid-row' : ''
          }
          style={{ fontSize: 13 }}
        />
      )}

      {rawText && (
        <div style={{ marginTop: 12 }}>
          <Button
            type="link"
            size="small"
            onClick={() => setShowRawText(!showRawText)}
            style={{ padding: 0, fontSize: 12, color: 'var(--text-muted)' }}
          >
            {showRawText ? '隐藏原始识别文本' : '查看原始识别文本'}
          </Button>
          {showRawText && (
            <pre style={{
              marginTop: 8,
              maxHeight: 200,
              overflow: 'auto',
              padding: 10,
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {rawText}
            </pre>
          )}
        </div>
      )}
      <style>{`
        .image-import-invalid-row {
          background: rgba(255, 77, 79, 0.06) !important;
        }
        .image-import-invalid-row:hover > td {
          background: rgba(255, 77, 79, 0.1) !important;
        }
        @media (max-width: 768px) {
          .image-import-modal .ant-modal {
            max-width: 95vw !important;
          }
        }
      `}</style>
    </div>
  );

  return (
    <Modal
      title="拍照导入持仓"
      open={open}
      onCancel={handleClose}
      destroyOnHidden
      width={step === 'result' ? 780 : 480}
      style={{ maxWidth: '95vw' }}
      className="image-import-modal"
      footer={
        step === 'result'
          ? [
              <Button key="back" onClick={() => { setStep('upload'); setItems([]); setExpandedKey(null); }}>
                重新上传
              </Button>,
              <Button
                key="confirm"
                type="primary"
                loading={confirmLoading}
                onClick={handleConfirm}
                disabled={validCount === 0}
              >
                确认导入（{validCount} 条）
              </Button>,
            ]
          : null
      }
    >
      {step === 'upload' && renderUploadStep()}
      {step === 'recognizing' && renderRecognizing()}
      {step === 'result' && renderResult()}
    </Modal>
  );
}
