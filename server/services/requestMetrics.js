// API 请求统计中间件：内存计数 + Redis 跨实例聚合（多实例合并），进程重启后（无 Redis 时）重置
// 用于管理后台系统监控页面展示 API 调用量、错误数、平均响应时间
// - Redis 可用（REDIS_URL 已配置且连接就绪）时：通过 INCR/INCRBY 累加到 Redis，
//   供多实例（cluster/多副本）跨实例聚合统计全量真实值；
// - Redis 未配置/不可用时：回退本实例内存计数（单实例兜底）。
// 排除项：系统监控页自身按固定间隔轮询的 /api/admin/system/metrics 请求不计入，
// 避免"调用总数"被监控页自动刷新无限拉高。

const coordinator = require('./coordinator');

// Redis key 前缀（与 globalCache 的 gc:stats:* 区分开）
const API_KEY = (field) => `api_metrics:${field}`;
const API_STATUS_KEY = 'api_metrics:status';     // Hash: code -> count（跨实例状态码分布）
const API_START_KEY = 'api_metrics:startTime';   // 全局启动时间（ms，首实例 SETNX 决定）

// 本实例内存计数（最新于：无 Redis，或作为精确的 per-instance 参考）
const metrics = {
  startTime: Date.now(),
  totalRequests: 0,
  errorRequests: 0,
  totalResponseTime: 0, // 累计响应时间（ms）
  statusCodeCounts: {}, // { 200: n, 404: n, 500: n, ... }
};

// 需要排除计数的请求路径：系统监控页自身的轮询拉取
const EXCLUDED_PATHS = new Set(['/api/admin/system/metrics']);

// 待 flush 的增量计数：每请求只累加内存，每 10s 批量 INCRBY/HINCRBY 到 Redis
// （替代逐请求 3-4 条 Redis 写，削减高频路径开销；flush 失败保留增量下轮重试）
const pending = {
  total: 0,
  error: 0,
  respTime: 0,
  status: {}, // { code: n }
};

/**
 * Express 中间件：记录每个请求的耗时与状态（跳过监控页自身轮询请求）。
 */
function metricsMiddleware(req, res, next) {
  const path = (req.path || req.url || '').split('?')[0];
  if (EXCLUDED_PATHS.has(path)) {
    return next();
  }

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1e6;

    // 本地内存恒更新（单实例兜底 + 本进程精确计数）
    metrics.totalRequests += 1;
    metrics.totalResponseTime += durationMs;
    const code = res.statusCode;
    metrics.statusCodeCounts[code] = (metrics.statusCodeCounts[code] || 0) + 1;
    if (code >= 400) {
      metrics.errorRequests += 1;
    }

    // Redis 跨实例聚合：仅累加本地增量，由 10s 定时器批量 flush（见 flushMetricsToRedis）
    pending.total += 1;
    pending.respTime += Math.round(durationMs);
    pending.status[code] = (pending.status[code] || 0) + 1;
    if (code >= 400) {
      pending.error += 1;
    }
  });
  next();
}

/**
 * 把本实例增量计数批量合并到 Redis（pipeline 一次往返）。
 * key 结构与原逐请求写入完全一致（api_metrics:total/error/respTime + api_metrics:status Hash），
 * admin 查询侧无感知；best-effort 不抛错，失败时增量保留到下一轮重试（Redis 恢复后自动补同步）。
 */
async function flushMetricsToRedis() {
  if (!coordinator.isEnabled()) return;
  const hasStatus = Object.keys(pending.status).length > 0;
  if (pending.total === 0 && pending.error === 0 && pending.respTime === 0 && !hasStatus) return;

  const c = coordinator.getClient();
  const pipe = c.pipeline();
  if (pending.total > 0) pipe.incrby(API_KEY('total'), pending.total);
  if (pending.error > 0) pipe.incrby(API_KEY('error'), pending.error);
  if (pending.respTime > 0) pipe.incrby(API_KEY('respTime'), pending.respTime);
  for (const [code, n] of Object.entries(pending.status)) {
    if (n > 0) pipe.hincrby(API_STATUS_KEY, code, n);
  }
  try {
    await pipe.exec();
    pending.total = 0;
    pending.error = 0;
    pending.respTime = 0;
    pending.status = {};
  } catch { /* 保留增量，下一轮 flush 重试 */ }
}

// 每 10s 批量 flush（unref 不阻止进程退出）；进程退出前尽力 flush 一次
setInterval(() => { flushMetricsToRedis().catch(() => {}); }, 10 * 1000).unref?.();
process.once('SIGINT', () => { flushMetricsToRedis().catch(() => {}); });
process.once('SIGTERM', () => { flushMetricsToRedis().catch(() => {}); });

// 全局启动时间：进程启动时写一次（NX 保证多副本下首个实例的值生效，供跨实例展示统一"运行时长"）
// 模块加载时 Redis 可能尚未就绪 → 挂 ready 事件补写一次
(function initStartTimeKey() {
  const client = coordinator.getClient();
  if (!client) return; // 未配置 REDIS_URL：仅本实例内存统计
  const write = () => client.set(API_START_KEY, String(metrics.startTime), 'NX').catch(() => {});
  if (client.status === 'ready') {
    write();
  } else {
    client.once('ready', write);
  }
})();

/**
 * 读取当前激活统计值。Redis 可用时返回跨实例聚合值；否则返回本实例内存值。
 * @returns {Promise<object>}
 */
async function getMetrics() {
  if (coordinator.isEnabled()) {
    try {
      const c = coordinator.getClient();
      const [total, error, respTime, statusHash, startRaw] = await Promise.all([
        c.get(API_KEY('total')),
        c.get(API_KEY('error')),
        c.get(API_KEY('respTime')),
        c.hgetall(API_STATUS_KEY),
        c.get(API_START_KEY),
      ]);
      const totalN = parseInt(total, 10) || 0;
      const errorN = parseInt(error, 10) || 0;
      const respTimeN = parseInt(respTime, 10) || 0;
      const startN = parseInt(startRaw, 10) || metrics.startTime;

      const statusCodeCounts = Object.entries(statusHash || {})
        .map(([code, count]) => ({ code: parseInt(code, 10), count: parseInt(count, 10) || 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        uptimeSeconds: Math.max(0, Math.floor((Date.now() - startN) / 1000)),
        totalRequests: totalN,
        errorRequests: errorN,
        errorRate: totalN > 0 ? Math.round((errorN / totalN) * 10000) / 100 : 0,
        avgResponseTime: totalN > 0 ? Math.round((respTimeN / totalN) * 100) / 100 : 0,
        statusCodeCounts,
      };
    } catch (err) {
      // Redis 读取失败 → 回退本实例内存统计，保证接口可用
    }
  }

  const avgResponseTime = metrics.totalRequests > 0
    ? Math.round((metrics.totalResponseTime / metrics.totalRequests) * 100) / 100
    : 0;
  const errorRate = metrics.totalRequests > 0
    ? Math.round((metrics.errorRequests / metrics.totalRequests) * 10000) / 100
    : 0;
  const uptimeSeconds = Math.floor((Date.now() - metrics.startTime) / 1000);
  const topStatusCodes = Object.entries(metrics.statusCodeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code: parseInt(code, 10), count }));

  return {
    uptimeSeconds,
    totalRequests: metrics.totalRequests,
    errorRequests: metrics.errorRequests,
    errorRate,
    avgResponseTime,
    statusCodeCounts: topStatusCodes,
  };
}

module.exports = { metricsMiddleware, getMetrics };