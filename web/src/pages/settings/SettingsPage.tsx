import { useState, useEffect } from 'react';
import { Card, Upload, Button, App, Modal, Divider } from 'antd';
import { UploadOutlined, DownloadOutlined, SettingOutlined } from '@ant-design/icons';
import { settingService } from '@/services/settingService';
import { importExportService } from '@/services/importExportService';
import FrequencySetting from '@/components/modals/FrequencySetting';
import ImportPreviewModal from '@/components/modals/ImportPreviewModal';
import ExportSettingModal from '@/components/modals/ExportSettingModal';
import type { UploadFile } from 'antd';

export default function SettingsPage() {
  const [frequency, setFrequency] = useState(30);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const { message } = App.useApp();

  useEffect(() => {
    settingService.getSettings().then((data) => {
      const d = data.settings || data;
      if (d?.refresh_frequency != null) setFrequency(d.refresh_frequency);
    }).catch(() => {});
  }, []);

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