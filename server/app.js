require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { executeDuePlans } = require('./services/planService');

const app = express();

app.use(cors());
app.use(express.json());

// 路由挂载
app.use('/api/auth', require('./routes/auth'));
app.use('/api/funds', require('./routes/funds'));
app.use('/api/holdings', require('./routes/holdings'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/import-export', require('./routes/importExport'));
app.use('/api/image-import', require('./routes/imageImport'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/indices', require('./routes/indices'));
app.use('/api/admin', require('./routes/admin'));

// 全局错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);

  // 定投计划定时调度
  // 净值确认时间说明：A股基金净值通常在收盘后18:00-20:00间由基金公司确认发布
  // 调度策略：20:00首次执行 → 如有净值未确认的计划，21:00自动重试
  const planCronTimes = [
    { time: '0 20 * * *', label: '20:00 首次执行' },
    { time: '0 21 * * *', label: '21:00 重试（处理净值延迟确认）' },
  ];

  for (const { time, label } of planCronTimes) {
    cron.schedule(time, async () => {
      console.log(`[Cron] ⏰ 定投计划调度触发 (${label}) | 时间: ${new Date().toLocaleString('zh-CN')}`);
      try {
        const result = await executeDuePlans();
        if (result.pending > 0) {
          console.log(`[Cron] ⏳ ${result.pending}个计划因净值未确认而跳过，将在下次调度时重试`);
        }
        console.log(`[Cron] ✅ 定投调度完成 (${label}) | 成功=${result.success} 待确认=${result.pending}`);
      } catch (err) {
        console.error(`[Cron] ❌ 定投计划调度异常: ${err.message}`);
      }
    });
  }
  console.log('[Cron] 🕐 定投计划调度器已启动 (20:00首次执行, 21:00重试)');

  // 启动时也检查一次（防止服务器重启期间遗漏）
  console.log('[Startup] 🔍 启动时检查一次到期定投计划...');
  executeDuePlans()
    .then(result => console.log(`[Startup] ✅ 启动时定投检查完成 | 成功=${result.success} 待确认=${result.pending}`))
    .catch(err => console.error('[Startup] ❌ 启动时执行定投计划异常:', err.message));
});