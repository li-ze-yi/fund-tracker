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

    // Redis 跨实例聚合（best-effort，不阻塞响应、不抛错）
    if (coordinator.isEnabled()) {
      const c = coordinator.getClient();
      c.incr(API_KEY('total')).catch(() => {});
      if (code >= 400) c.incr(API_KEY('error')).catch(() => {});
      c.incrby(API_KEY('respTime'), Math.round(durationMs)).catch(() => {});
      c.hincrby(API_STATUS_KEY, String(code), 1).catch(() => {});
      // 全局启动时间：首个实例写入后保持不变，供跨实例展示统一"运行时长"
      c.set(API_START_KEY, String(metrics.startTime), 'NX').catch(() => {});
    }
  });
  next();
}

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