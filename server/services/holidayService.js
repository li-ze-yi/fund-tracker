const axios = require('axios');
const globalCache = require('./globalCache');
const { createLogger } = require('../utils/logger');

const logger = createLogger('HolidayService');

// timor.tech 节假日查询 API
const HOLIDAY_API_BASE = 'http://timor.tech/api/holiday/info';
// 复用 history_chart 类型获得固定 24 小时 TTL（节假日信息一旦确定不会变化）
const HOLIDAY_CACHE_TYPE = 'history_chart';
// 防死循环最大次数（最长的节假日连休也不会超过 30 天）
const MAX_LOOP = 30;

/**
 * 格式化 Date 对象为 YYYY-MM-DD 字符串
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 日期加减天数
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} n - 天数（可为负数）
 * @returns {string} YYYY-MM-DD
 */
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00'); // 明确使用本地时间
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/**
 * 判断是否为周末（周六或周日）
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {boolean}
 */
function isWeekend(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return day === 0 || day === 6;
}

/**
 * 调用 timor.tech API 查询指定日期是否为法定节假日
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<{isHoliday: boolean}>}
 * @throws {Error} API 调用失败（超时、非 200、异常 JSON）时抛出错误，由调用方捕获降级
 */
async function fetchHolidayFromApi(dateStr) {
  const url = `${HOLIDAY_API_BASE}/${dateStr}`;
  logger.info(`调用节假日 API: ${url}`);
  const startTime = Date.now();

  const response = await axios.get(url, {
    timeout: 3000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  const elapsed = Date.now() - startTime;
  logger.info(`节假日 API 响应: date=${dateStr}, 耗时=${elapsed}ms, httpStatus=${response.status}`);

  // 校验响应结构：合法响应必须包含 holiday 字段（工作日时 holiday 为 null）
  if (!response.data || typeof response.data !== 'object' || !('holiday' in response.data)) {
    logger.warn(`节假日 API 响应格式异常: date=${dateStr}, body=${String(response.data).slice(0, 200)}`);
    throw new Error(`响应格式异常: ${String(response.data).slice(0, 200)}`);
  }

  const holidayInfo = response.data.holiday;
  // holiday.holiday === true 表示该日为法定节假日；其余情况（含 holiday 为 null 的正常工作日）视为非节假日
  const isHoliday = !!(holidayInfo && holidayInfo.holiday === true);
  const holidayName = holidayInfo && holidayInfo.name ? holidayInfo.name : (isHoliday ? '节假日' : '工作日');
  logger.info(`节假日判定: date=${dateStr}, isHoliday=${isHoliday}, name=${holidayName}`);
  return { isHoliday };
}

/**
 * 判断指定日期是否为法定节假日（带 24 小时缓存）
 * API 失败时（超时、非 200、异常 JSON）降级为非节假日并返回 false，不缓存降级结果
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<boolean>}
 */
async function isHoliday(dateStr) {
  const cacheKey = `holiday_${dateStr}`;

  // 先检查缓存，命中时直接返回（避免 getOrFetch 内部 debug 日志不可见）
  const cached = globalCache.checkCache(cacheKey, HOLIDAY_CACHE_TYPE);
  if (cached.hit) {
    logger.info(`缓存命中: date=${dateStr}, isHoliday=${cached.data.isHoliday}`);
    return cached.data.isHoliday;
  }

  // 缓存未命中 → 调用 API
  logger.info(`缓存未命中，查询 API: date=${dateStr}`);
  try {
    const result = await fetchHolidayFromApi(dateStr);
    globalCache.set(cacheKey, result, HOLIDAY_CACHE_TYPE);
    return result.isHoliday;
  } catch (error) {
    // 降级：API 失败时视为非节假日（退化为周末判断），不缓存降级结果
    logger.warn(`API 调用失败，回退周末判断: date=${dateStr}, error=${error.message}`);
    return false;
  }
}

/**
 * 判断指定日期是否为交易日
 * 核心逻辑：isTradingDay = !isWeekend && !isHoliday
 * 周末直接短路返回 false（不查询 API，调休补班日周六也因此被排除）
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<boolean>}
 */
async function isTradingDay(dateStr) {
  if (isWeekend(dateStr)) {
    logger.info(`交易日判定: date=${dateStr}, isTradingDay=false (周末短路，不查询 API)`);
    return false;
  }
  const holiday = await isHoliday(dateStr);
  const trading = !holiday;
  logger.info(`交易日判定: date=${dateStr}, isWeekend=false, isHoliday=${holiday}, isTradingDay=${trading}`);
  return trading;
}

/**
 * 获取指定日期的下一个交易日（日期 +1 后开始跳过非交易日）
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<string>} YYYY-MM-DD
 */
async function nextTradingDay(dateStr) {
  logger.info(`计算下一交易日: startDate=${dateStr}`);
  let current = addDays(dateStr, 1);
  for (let i = 0; i < MAX_LOOP; i++) {
    if (await isTradingDay(current)) {
      logger.info(`下一交易日计算完成: startDate=${dateStr}, nextTradingDay=${current}, 检查次数=${i + 1}`);
      return current;
    }
    current = addDays(current, 1);
  }
  logger.error(`nextTradingDay 超过最大循环次数: dateStr=${dateStr}, maxLoop=${MAX_LOOP}`);
  throw new Error(`[HolidayService] nextTradingDay 超过最大循环次数 ${MAX_LOOP}, dateStr=${dateStr}`);
}

/**
 * 确保日期为交易日，若当前日期非交易日则顺延到下一个交易日
 * 与 nextTradingDay 的区别：从当前日期开始检查（不 +1），若当前已是交易日则直接返回
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<string>} YYYY-MM-DD
 */
async function ensureTradingDay(dateStr) {
  logger.info(`确保交易日: inputDate=${dateStr}`);
  let current = dateStr;
  for (let i = 0; i < MAX_LOOP; i++) {
    if (await isTradingDay(current)) {
      logger.info(`确保交易日完成: inputDate=${dateStr}, result=${current}, 检查次数=${i + 1}`);
      return current;
    }
    current = addDays(current, 1);
  }
  logger.error(`ensureTradingDay 超过最大循环次数: dateStr=${dateStr}, maxLoop=${MAX_LOOP}`);
  throw new Error(`[HolidayService] ensureTradingDay 超过最大循环次数 ${MAX_LOOP}, dateStr=${dateStr}`);
}

module.exports = { isHoliday, isTradingDay, nextTradingDay, ensureTradingDay, isWeekend };
