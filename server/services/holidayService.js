const axios = require('axios');
const globalCache = require('./globalCache');
const { createLogger } = require('../utils/logger');

const logger = createLogger('HolidayService');

// timor.tech 节假日查询 API
const HOLIDAY_API_BASE = 'https://timor.tech/api/holiday/info';
// timor.tech 年度节假日接口（一次返回整年，路径末尾需带 /{year}/）
const HOLIDAY_YEAR_API_BASE = 'https://timor.tech/api/holiday/year';
// 年度节假日表缓存 type（30 天 TTL：全年固定不变）
const HOLIDAY_YEAR_CACHE_TYPE = 'holiday_year';
// 单日节假日判定结果缓存 type（24h TTL：单日判定一旦确定全年不变）
const HOLIDAY_DAY_CACHE_TYPE = 'holiday_day';
// 防死循环最大次数（最长的节假日连休也不会超过 30 天）
const MAX_LOOP = 30;

// ★ 并发去重：同一个 year 的请求合并为一次（cache stampede 防御）
const inflightYearPromises = new Map();
// ★ 并发去重：同一个 dateStr 的 isHoliday 请求合并为一次（年度失败后回退单日也可能并发击穿）
const inflightHolidayPromises = new Map();
// ★ 失败时间戳：429/网络临时失败时，5 分钟内不再请求同一 year（避免反复炸 API）
const failedYearTimestamps = new Map();
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000;

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
 * 解析年度节假日接口响应为 { 'MM-DD': boolean } 查询表
 * 年度接口返回的日期键为 MM-DD（不含年份），holiday=true 放假、holiday=false 调休补班（工作日）
 * @param {object} data 年度接口响应 { code, holiday: { 'MM-DD': { holiday, name, wage } } }
 * @returns {object|null}
 */
function parseHolidayYear(data) {
  if (!data || typeof data !== 'object' || !data.holiday || typeof data.holiday !== 'object') return null;
  const map = {};
  for (const [mmdd, info] of Object.entries(data.holiday)) {
    if (info && typeof info.holiday === 'boolean') map[mmdd] = info.holiday;
  }
  return map;
}

/**
 * 获取指定年份的节假日查询表（一次请求拿整年，带 24h 缓存）
 * 解决长假回溯最近交易日时逐日请求 timor 单日接口触发 429 限流的问题。
 * @param {string} year - YYYY
 * @returns {Promise<object|null>} { 'MM-DD': boolean }；失败返回 null（调用方回退单日接口）
 */
async function getHolidayYearData(year) {
  const cacheKey = `holiday_year_${year}`;

  // 1. 正常缓存命中（30 天 TTL）
  const cached = globalCache.checkCache(cacheKey, HOLIDAY_YEAR_CACHE_TYPE);
  if (cached.hit && cached.data) return cached.data;

  // 2. 最近失败（429/网络异常），5 分钟内不再请求同一 year
  const failedAt = failedYearTimestamps.get(year);
  if (failedAt && (Date.now() - failedAt) < FAILURE_CACHE_TTL_MS) {
    logger.debug(`年度节假日 ${year} 最近请求失败，跳过 (${Math.ceil((FAILURE_CACHE_TTL_MS - (Date.now() - failedAt)) / 1000)}s 后重试)`);
    return null;
  }

  // 3. 并发去重：同一 year 已有请求在飞，直接合并到那个 promise
  if (inflightYearPromises.has(year)) {
    logger.debug(`年度节假日 ${year} 请求已在飞，合并并发调用`);
    return inflightYearPromises.get(year);
  }

  // 4. 发起请求（自执行 async，存入 inflightMap 防止并发击穿）
  const promise = (async () => {
    const url = `${HOLIDAY_YEAR_API_BASE}/${year}/`;
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (response.data && response.data.code === 0) {
        const map = parseHolidayYear(response.data);
        if (map && Object.keys(map).length > 0) {
          globalCache.set(cacheKey, map, HOLIDAY_YEAR_CACHE_TYPE);
          logger.info(`年度节假日缓存完成: year=${year}, 条目=${Object.keys(map).length}`);
          failedYearTimestamps.delete(year); // 成功了，清掉失败标记
          return map;
        }
      }
      logger.warn(`年度节假日接口响应异常: year=${year}, body=${String(response.data).slice(0, 200)}`);
    } catch (e) {
      logger.warn(`年度节假日接口调用失败: year=${year}, err=${e.message}`);
    } finally {
      inflightYearPromises.delete(year); // 无论成功失败，都从 inflight 中移除（允许下次请求）
    }
    // 走到这里 = 失败，记录失败时间戳（5min TTL 内不再请求）
    failedYearTimestamps.set(year, Date.now());
    return null;
  })();

  inflightYearPromises.set(year, promise);
  return promise;
}

/**
 * 判断指定日期是否为法定节假日（带 24 小时缓存）
 * 优先年度节假日缓存（一次拉整年），未命中/失败回退单日接口；单日接口也失败时降级为非节假日
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<boolean>}
 */
async function isHoliday(dateStr) {
  const cacheKey = `holiday_${dateStr}`;

  // 1. 正常缓存命中 → 直接返回（fast path，不走并发合并）
  const cached = globalCache.checkCache(cacheKey, HOLIDAY_DAY_CACHE_TYPE);
  if (cached.hit) {
    logger.info(`缓存命中: date=${dateStr}, isHoliday=${cached.data.isHoliday}`);
    return cached.data.isHoliday;
  }

  // 2. 并发去重：同一 dateStr 已有请求在飞 → 合并
  if (inflightHolidayPromises.has(dateStr)) {
    logger.debug(`isHoliday(${dateStr}) 请求已在飞，合并并发调用`);
    return inflightHolidayPromises.get(dateStr);
  }

  // 3. 发起请求并记录 inflight
  const promise = (async () => {
    // ★ 优先年度节假日缓存：一次拉整年，长假回溯不再逐日请求单日接口（免疫 timor 429 限流）
    const year = dateStr.slice(0, 4);
    const mmdd = dateStr.slice(5);
    try {
      const yearMap = await getHolidayYearData(year);
      if (yearMap) {
        const isHolidayVal = yearMap[mmdd] === true;
        logger.info(`年度节假日判定: date=${dateStr}, isHoliday=${isHolidayVal}`);
        globalCache.set(cacheKey, { isHoliday: isHolidayVal }, HOLIDAY_DAY_CACHE_TYPE);
        return isHolidayVal;
      }
      // 年度不可用 → 回退单日接口
      logger.info(`年度节假日不可用，查询单日 API: date=${dateStr}`);
      const result = await fetchHolidayFromApi(dateStr);
      globalCache.set(cacheKey, result, HOLIDAY_DAY_CACHE_TYPE);
      return result.isHoliday;
    } catch (error) {
      logger.warn(`API 调用失败，回退周末判断: date=${dateStr}, error=${error.message}`);
      return false; // 降级
    } finally {
      inflightHolidayPromises.delete(dateStr);
    }
  })();

  inflightHolidayPromises.set(dateStr, promise);
  return promise;
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
