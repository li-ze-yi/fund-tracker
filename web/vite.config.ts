import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 按模块 id 拆分大型依赖为独立 chunk，利于浏览器缓存
        manualChunks(id: string) {
          // echarts 已按需引入（line/bar），统一归到 vendor-echarts
          if (id.includes('node_modules/echarts')) return 'vendor-echarts';
          // Ant Design UI 库（全应用共用，已按需 tree-shake）
          if (id.includes('node_modules/antd') || id.includes('node_modules/@ant-design')) return 'vendor-antd';
          // React 核心库
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler') || id.includes('node_modules/use-sync-external-store')) return 'vendor-react';
          // 其他工具库
          if (id.includes('node_modules/dayjs') || id.includes('node_modules/axios') || id.includes('node_modules/zustand')) return 'vendor-utils';
        },
      },
    },
    // 启用 gzip 压缩提示
    reportCompressedSize: true,
    // antd 为全应用共用且已按需 tree-shake，体积接近最优，阈值调整消除告警
    chunkSizeWarningLimit: 1100,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('[proxy error]', err);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('[proxy]', req.method, req.url);
          });
        },
      },
    },
  },
});