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
        // 注意：antd 5 为 ESM，手动拆 vendor-antd 会导致其被 modulepreload 全量预载（反优化），
        // 交给 Rollup 自动按需提升公共 chunk
        manualChunks(id: string) {
          // echarts 已按需引入（line/bar），统一归到 vendor-echarts
          if (id.includes('node_modules/echarts')) return 'vendor-echarts';
          // React 核心库
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler') || id.includes('node_modules/use-sync-external-store')) return 'vendor-react';
          // 其他工具库
          if (id.includes('node_modules/dayjs') || id.includes('node_modules/axios') || id.includes('node_modules/zustand')) return 'vendor-utils';
        },
      },
    },
    // 启用 gzip 压缩提示
    reportCompressedSize: true,
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
        },
      },
    },
  },
});