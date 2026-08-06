/**
 * 轻量级日志器 - 基于 console 封装
 *
 * 特性：
 * - 统一加时间戳、级别、模块标签，便于排查问题
 * - info/warn/error 始终输出；debug 受 LOG_LEVEL 环境变量控制
 * - 零依赖，直接复用 console（stdout/stderr），不引入额外日志库
 *
 * 使用方式：
 *   const { createLogger } = require('../utils/logger');
 *   const logger = createLogger('HolidayService');
 *   logger.info('查询节假日 API...');
 *   logger.error('结算失败', err.message);
 */

const LEVELS = { info: 30, warn: 40, error: 50, debug: 20 };
const ENV_LEVEL = process.env.LOG_LEVEL ? (LEVELS[process.env.LOG_LEVEL.toLowerCase()] || 30) : 30;

function pad(n) { return String(n).padStart(2, '0'); }

/**
 * 格式化本地时间戳：YYYY-MM-DD HH:mm:ss.SSS
 */
function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

class Logger {
  constructor(module) {
    this.module = module;
  }

  _format(level, msg) {
    return `${timestamp()} [${level}] [${this.module}] ${msg}`;
  }

  info(msg, ...args) {
    console.log(this._format('INFO', msg), ...args);
  }

  warn(msg, ...args) {
    console.warn(this._format('WARN', msg), ...args);
  }

  error(msg, ...args) {
    console.error(this._format('ERROR', msg), ...args);
  }

  debug(msg, ...args) {
    if (LEVELS.debug >= ENV_LEVEL) {
      console.log(this._format('DEBUG', msg), ...args);
    }
  }
}

/**
 * 创建带模块标签的 logger 实例
 * @param {string} module 模块名称，如 'HolidayService'、'PendingSettle'
 * @returns {Logger}
 */
function createLogger(module) {
  return new Logger(module);
}

module.exports = { createLogger, Logger };
