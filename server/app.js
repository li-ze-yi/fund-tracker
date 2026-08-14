require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cron = require('node-cron');
const { executeDuePlans } = require('./services/planService');
const dailyProfitService = require('./services/dailyProfitService');
const pendingSettleService = require('./services/pendingSettleService');
const globalCache = require('./services/globalCache');
const { createLogger } = require('./utils/logger');

const logger = createLogger('App');

// 启动时校验必需环境变量，缺失时明确报错退出，避免用 undefined 静默签名
const REQUIRED_ENV = ['JWT_SECRET', 'MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  logger.error(`缺少必需的环境变量: ${missingEnv.join(', ')}，请检查 .env 文件配置`);
  process.exit(1);
}

const app = express();

app.use(helmet()); // 设置安全相关的 HTTP 响应头（默认隐藏 x-powered-by）
app.disable('x-powered-by'); // 显式隐藏 x-powered-by，防止泄露框架信息

// CORS 配置：从环境变量读取允许来源（CORS_ORIGIN，逗号分隔）
// 未配置时回退为不限制（保持兼容，避免破坏现有使用）
const corsWhitelist = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: corsWhitelist.length > 0 ? (origin, callback) => {
    // 无 origin 的请求（如同源/curl）直接放行
    if (!origin) return callback(null, true);
    if (corsWhitelist.includes('*') || corsWhitelist.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('不允许的跨域来源'));
  } : true // 未配置 CORS_ORIGIN 时回退为不限制
}));
app.use(compression()); // 启用 gzip 压缩，API 响应体积可减少 60-80%
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
app.use('/api/market', require('./routes/market'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/announcements', require('./routes/announcements'));

// 全局错误处理
app.use((err, req, res, next) => {
  logger.error(`全局错误处理: ${err.message}`, err.stack);
  res.status(err.status || 500).json({ message: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  logger.info(`服务器运行在端口 ${PORT}`);

  // 全局缓存：启动时加载磁盘缓存与统计，并启动持久化（重启后可找回）
  try {
    await globalCache.loadFromFile();
  } catch (err) {
    logger.error(`加载全局缓存失败: ${err.message}`);
  }
  globalCache.startPersistence();
  globalCache.startCleanup();

  // 定投计划定时调度
  // 净值确认时间说明：A股基金净值通常在收盘后18:00-20:00间由基金公司确认发布
  // 调度策略：10:00 创建 pending 订单（用估值预估） → 20:00 结算 pending + 处理新到期计划
  const planCronTimes = [
    { time: '0 10 * * *', label: '10:00 上午执行（创建 pending 订单）' },
    { time: '0 20 * * *', label: '20:00 晚间执行（结算 pending + 处理到期计划）' },
  ];

  for (const { time, label } of planCronTimes) {
    cron.schedule(time, async () => {
      logger.info(`定投计划调度触发 (${label}) | 时间: ${new Date().toLocaleString('zh-CN')}`);
      try {
        const result = await executeDuePlans();
        if (result.pending > 0) {
          logger.info(`${result.pending}个计划因净值未确认而跳过，将在下次调度时重试`);
        }
        logger.info(`定投调度完成 (${label}) | 成功=${result.success} 待确认=${result.pending}`);
      } catch (err) {
        logger.error(`定投计划调度异常: ${err.message}`, err.stack);
      }
    });
  }
  logger.info('定投计划调度器已启动 (10:00 上午执行, 20:00 晚间执行)');

  // 日收益兜底任务：每天 23:55 为当天未打开 App 的用户补算日收益
  cron.schedule('55 23 * * *', async () => {
    logger.info(`日收益兜底任务触发 | 时间: ${new Date().toLocaleString('zh-CN')}`);
    try {
      const result = await dailyProfitService.backfillDailyProfit();
      logger.info(`日收益兜底完成 | 持仓用户=${result.total} 已记录=${result.skipped} 补算成功=${result.success} 失败=${result.failed}`);
    } catch (err) {
      logger.error(`日收益兜底任务异常: ${err.message}`, err.stack);
    }
  });
  logger.info('日收益兜底调度器已启动 (23:55)');

  // 独立 pending 订单结算兜底任务：每天 23:50 扫描所有用户的 pending 订单并尝试结算
  // 与日收益兜底任务（23:55）解耦，略早 5 分钟触发，避免并发
  // 流程：先结算所有 pending 订单（净值已发布的会被结算）→ 再清除超过 30 天的异常 pending 订单
  // 解决场景：用户当天打开过 App（已记录日收益）但 pending 订单因净值未发布未结算时，
  // 23:55 兜底任务会跳过该用户，独立结算任务可覆盖该场景
  cron.schedule('50 23 * * *', async () => {
    logger.info(`pending 订单独立结算兜底任务触发 | 时间: ${new Date().toLocaleString('zh-CN')}`);
    try {
      const result = await pendingSettleService.cleanupStalePendingOrders(30);
      const s = result.settle;
      logger.info(`pending 订单结算兜底完成 | 扫描用户数=${s.scannedUsers} pending订单数=${s.totalPending} 成功结算=${s.settled} 跳过=${s.skipped} 清除数=${result.cleanedCount}`);
    } catch (err) {
      logger.error(`pending 订单独立结算兜底任务异常: ${err.message}`, err.stack);
    }
  });
  logger.info('pending 订单独立结算兜底调度器已启动 (23:50)');

  // 启动时也检查一次（防止服务器重启期间遗漏）
  logger.info('启动时检查一次到期定投计划...');
  executeDuePlans()
    .then(result => logger.info(`启动时定投检查完成 | 成功=${result.success} 待确认=${result.pending}`))
    .catch(err => logger.error(`启动时执行定投计划异常: ${err.message}`, err.stack));
});