/**
 * 带超时的 fetch 工具。
 * 全局缓存的实时接口（指数 / 行业轮动 / 分时）都复用它，避免各路由重复实现。
 */
const { createLogger } = require('./logger');
const logger = createLogger('Http');

/**
 * @param {string} url
 * @param {object} [options] fetch options
 * @param {number} [timeoutMs=8000]
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      logger.error(`请求超时 (${timeoutMs}ms): ${url}`);
    }
    throw e;
  }
}

module.exports = { fetchWithTimeout };
