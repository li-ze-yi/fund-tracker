import { useState, useEffect } from 'react';
import { Card, Upload, Button, App, Modal, Divider, Switch, Segmented } from 'antd';
import { UploadOutlined, DownloadOutlined, ThunderboltOutlined, FundOutlined } from '@ant-design/icons';
import { settingService, type ValuationMethod } from '@/services/settingService';
import { importExportService } from '@/services/importExportService';
import { useThemeStore } from '@/store/themeStore';
import { useHideAmountStore } from '@/store/hideAmountStore';
import FrequencySetting from '@/components/modals/FrequencySetting';
import ImportPreviewModal from '@/components/modals/ImportPreviewModal';
import ExportSettingModal from '@/components/modals/ExportSettingModal';
import type { UploadFile } from 'antd';

export default function SettingsPage() {
  const [frequency, setFrequency] = useState(30);
  const [valuationMethod, setValuationMethod] = useState<ValuationMethod>('tencent');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const { message } = App.useApp();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const hideAmount = useHideAmountStore((s) => s.hidden);
  const setHideAmount = useHideAmountStore((s) => s.setHidden);

  useEffect(() => {
    settingService.getSettings().then((data) => {
      if (data?.refresh_frequency != null) setFrequency(data.refresh_frequency);
      if (data?.valuation_method) setValuationMethod(data.valuation_method as ValuationMethod);
    }).catch(() => {});
  }, []);

  const handleValuationChange = async (method: ValuationMethod) => {
    setValuationMethod(method);
    try {
      await settingService.updateValuationMethod(method);
      message.success('估值数据源切换成功');
      // 通知持仓页面刷新
      window.dispatchEvent(new CustomEvent('valuation-method-changed', { detail: method }));
    } catch {
      message.error('设置保存失败');
    }
  };

  const handleUpload = (file: File) => {
    setImportFile(file);
    setImportModalOpen(true);
    return false; // prevent auto upload
  };

  const downloadTemplate = async () => {
    try {
      const blob = await importExportService.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'import_template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      message.success('模板下载成功');
    } catch {
      message.error('下载失败');
    }
  };

  return (
    <div className="settings-page" style={{ padding: 20 }}>
      {/* 移动端响应式优化样式 */}
      <style>{`
        @media screen and (max-width: 768px) {
          /* 页面容器 */
          .settings-page {
            padding: 12px 8px !important;
          }

          /* 页面标题 */
          .settings-title {
            font-size: clamp(18px, 5vw, 22px) !important;
            margin-bottom: 16px !important;
            padding: 0 4px !important;
          }

          /* 设置卡片 */
          .settings-card {
            margin-bottom: 14px !important;
          }

          .settings-card > .ant-card-head {
            padding: 12px 16px !important;
            min-height: auto !important;
          }

          .settings-card .ant-card-head-title {
            font-size: clamp(14px, 3.5vw, 16px) !important;
            padding: 4px 0 !important;
          }

          .settings-card > .ant-card-body {
            padding: 16px 12px !important;
          }

          /* 按钮和交互元素 */
          .settings-card .ant-btn {
            min-height: 40px !important;
            font-size: clamp(13px, 3.2vw, 15px) !important;
            border-radius: var(--radius-md) !important;
          }

          /* 分割线 */
          .settings-card .ant-divider {
            margin: 14px 0 !important;
          }

          /* 关于卡片文本 */
          .settings-about-text {
            font-size: clamp(13px, 3.2vw, 14px) !important;
            line-height: 1.9 !important;
          }

          .settings-about-links {
            margin-top: 6px !important;
          }

          .settings-about-links a {
            font-size: clamp(13px, 3.2vw, 14px) !important;
          }
        }
      `}</style>

      <h2 className="settings-title" style={{ marginBottom: 20, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>设置</h2>

      <Card
        className="settings-card"
        title="外观主题" style={{ marginBottom: 20, background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }} styles={{ title: { color: 'var(--text-primary)', fontWeight: 600 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>深色模式</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>切换界面为暗黑风格</div>
          </div>
          <Switch
            checked={themeMode === 'dark'}
            onChange={(checked) => setThemeMode(checked ? 'dark' : 'light')}
            checkedChildren="🌙"
            unCheckedChildren="☀"
          />
        </div>
      </Card>

      <Card
        className="settings-card"
        title="隐私设置" style={{ marginBottom: 20, background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }} styles={{ title: { color: 'var(--text-primary)', fontWeight: 600 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>隐藏金额</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>隐藏所有基金金额和收益数据</div>
          </div>
          <Switch
            checked={hideAmount}
            onChange={(checked) => setHideAmount(checked)}
            checkedChildren="隐藏"
            unCheckedChildren="显示"
          />
        </div>
      </Card>

      <Card
        className="settings-card"
        title="盘中估算数据源" style={{ marginBottom: 20, background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }} styles={{ title: { color: 'var(--text-primary)', fontWeight: 600 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>选择盘中估算方式</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              确认净值始终使用东方财富盘后数据。盘中估值可选：
              {valuationMethod === 'tencent' && '腾讯基金接口（快速，覆盖全市场）'}
              {valuationMethod === 'holdings' && '持仓穿透法（基于持仓股票实时行情加权计算，数据更透明）'}
            </div>
          </div>
          <Segmented
            value={valuationMethod}
            onChange={(val) => handleValuationChange(val as ValuationMethod)}
            options={[
              { label: '腾讯基金', value: 'tencent', icon: <ThunderboltOutlined /> },
              { label: '持仓穿透', value: 'holdings', icon: <FundOutlined /> },
            ]}
          />
        </div>
      </Card>

      <Card
        className="settings-card"
        title="刷新频率" style={{ marginBottom: 20, background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }} styles={{ title: { color: 'var(--text-primary)', fontWeight: 600 } }}>
        <FrequencySetting value={frequency} onChange={setFrequency} />
      </Card>

      <Card
        className="settings-card"
        title="导入持仓" style={{ marginBottom: 20, background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }} styles={{ title: { color: 'var(--text-primary)', fontWeight: 600 } }}>
        <Upload accept=".xlsx,.xls,.csv" beforeUpload={handleUpload} maxCount={1} showUploadList={false}>
          <Button icon={<UploadOutlined />} style={{ height: 40 }}>上传文件导入</Button>
        </Upload>
        <Divider />
        <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>下载导入模板</Button>
      </Card>

      <Card
        className="settings-card"
        title="导出持仓" style={{ marginBottom: 20, background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }} styles={{ title: { color: 'var(--text-primary)', fontWeight: 600 } }}>
        <Button icon={<DownloadOutlined />} onClick={() => setExportModalOpen(true)} style={{ height: 40 }}>导出持仓</Button>
      </Card>

      <Card
        className="settings-card"
        title="关于" style={{ marginBottom: 20, background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }} styles={{ title: { color: 'var(--text-primary)', fontWeight: 600 } }}>
        <div className="settings-about-text" style={{ color: 'var(--text-secondary)', lineHeight: 2.2, fontSize: 14 }}>
          <div><strong>养基发财 v1.0.0</strong></div>
          <div>基金实时估值管理系统</div>
          <div>数据来源: 天天基金 / 东方财富</div>
          <div style={{ marginTop: 8 }} className="settings-about-links">
            <a href="#" style={{ color: 'var(--accent-gold-light)' }}>用户协议</a>
            {' | '}
            <a href="#" style={{ color: 'var(--accent-gold-light)' }}>隐私政策</a>
          </div>
        </div>
      </Card>

      <ImportPreviewModal
        open={importModalOpen}
        file={importFile}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => message.success('导入成功')}
      />

      <ExportSettingModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  );
}