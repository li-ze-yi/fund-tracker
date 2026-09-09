// ★ 固化进程时区为北京时间（Asia/Shanghai, UTC+8）
// 必须在任何日期逻辑之前设置：确保 Node 的 Date 计算、mysql2 日期解析均按北京时间，
// 避免部署服务器系统时区被运维改为 UTC 后，前端（北京时区）整体错位 8 小时。
process.env.TZ = 'Asia/Shanghai';

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const globalCache = require('./services/globalCache');
const scheduler = require('./services/jobs/scheduler');
const jobsQueue = require('./services/jobs/queue');
const jobProcessors = require('./services/jobs/processors');
const { createLogger } = require('./utils/logger');

const logger = createLogger('App');

// 全局异常兜底：防止单个请求/任务的未处理异常导致整个进程崩溃（服务不可用）
// 记录日志后继续运行；若处理函数已损坏则优雅退出（由进程管理器重启）
process.on('uncaughtException', (err) => {
  logger.error(`[uncaughtException] ${err.message}`, err.stack);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? `${reason.message} | ${reason.stack}` : String(reason);
  logger.error(`[unhandledRejection] ${msg}`);
});

// 启动时校验必需环境变量，缺失时明确报错退出，避免用 undefined 静默签名
const REQUIRED_ENV = ['JWT_SECRET', 'MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  logger.error(`缺少必需的环境变量: ${missingEnv.join(', ')}，请检查 .env 文件配置`);
  process.exit(1);
}

// JWT_SECRET 强度提示：长度不足时警告（不阻断启动），引导使用强随机密钥
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  logger.warn('JWT_SECRET 长度不足 32 字符，建议使用强随机值生成：node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
}

const app = express();

// 信任一层反向代理（nginx），使 req.ip 使用 X-Forwarded-For 中的真实客户端 IP。
// 缺少此配置时 express-rate-limit 会报 ERR_ERL_UNEXPECTED_X_FORWARDED_FOR，
// 且所有经 nginx 的用户被识别为同一 IP，登录/注册限流变为全站共享计数。
app.set('trust proxy', 1); // 生产部署为 nginx 直接反代本服务；如有多层代理需相应调大

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
  } : true, // 未配置 CORS_ORIGIN 时回退为不限制
  // 让浏览器 JS 能读取"滑动续期"下发的自定义响应头
  exposedHeaders: ['X-Auth-Token']
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

// 健康检查：无论 Redis / 定时任务状态如何都返回 200，供负载均衡 / 监控探活
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  logger.error(`全局错误处理: ${err.message}`, err.stack);
  res.status(err.status || 500).json({ message: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 3001;

let shuttingDown = false;

/**
 * 优雅停机：停止 BullMQ workers + 定时调度器，再退出进程。
 */
function registerGracefulShutdown() {
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('收到退出信号，正在优雅关闭...');
    try {
      await scheduler.shutdownScheduledJobs();
    } catch (err) {
      logger.error(`优雅关闭调度失败: ${err.message}`, err.stack);
    }
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

/**
 * 启动时检查一次到期定投计划（防止服务器重启期间遗漏）。
 * - Redis 模式：以确定性 jobId 入队，跨实例去重，只消费一次。
 * - 无 Redis 模式：直接进程内执行，行为与旧的单进程实现一致。
 */
function handleStartupCheck() {
  if (jobsQueue.isRedisEnabled()) {
    const key = `startup:${scheduler.ymd()}`;
    jobsQueue.enqueue('invest', key)
      .then(() => logger.info(`启动时定投检查已入队 | invest:${key}`))
      .catch((err) => logger.error(`启动时定投检查入队失败: ${err.message}`));
  } else {
    jobProcessors.startupCheck()
      .catch((err) => logger.error(`启动时执行定投计划异常: ${err.message}`, err.stack));
  }
}

app.listen(PORT, async () => {
  logger.info(`服务器运行在端口 ${PORT}`);

  // 全局缓存：启动时加载磁盘缓存与统计，并启动持久化（重启后可找回）
  // 注意：Redis 模式下 globalCache 自动跳过文件持久化，数据以 Redis 为准
  try {
    await globalCache.loadFromFile();
  } catch (err) {
    logger.error(`加载全局缓存失败: ${err.message}`);
  }
  globalCache.startPersistence();
  globalCache.startCleanup();

  // 定时任务接入：
  // - Redis 多实例：启动 BullMQ workers + node-cron 入队 + 启动回填
  // - 无 Redis 单进程：仅 node-cron 直连执行（与旧行为一致）
  try {
    await scheduler.initScheduledJobs();
  } catch (err) {
    logger.error(`初始化定时任务失败: ${err.message}`, err.stack);
  }

  // 启动时检查一次（防重启错过到期计划）
  handleStartupCheck();

  // 优雅停机
  registerGracefulShutdown();
});