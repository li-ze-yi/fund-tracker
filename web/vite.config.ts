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
        // 拆分大型依赖为独立 chunk，利用浏览器缓存
        manualChunks: {
          // React 核心库
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Ant Design UI 库
          'vendor-antd': ['antd', '@ant-design/icons'],
          // 图表库
          'vendor-echarts': ['echarts', 'echarts-for-react'],
          // 其他工具库
          'vendor-utils': ['dayjs', 'axios', 'zustand'],
        },
      },
    },
    // 启用 gzip 压缩提示
    reportCompressedSize: true,
    // chunk 大小警告阈值
    chunkSizeWarningLimit: 500,
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