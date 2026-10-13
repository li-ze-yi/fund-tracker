const axios = require('axios');
const globalCache = require('./globalCache');
const { createLogger } = require('../utils/logger');

const logger = createLogger('HolidayService');

// timor.tech 节假日查询 API（cn 日历数据通道）
const HOLIDAY_API_BASE = 'https://timor.tech/api/holiday/info';
// timor.tech 年度节假日接口（一次返回整年，路径末尾需带 /{year}/）
const HOLIDAY_YEAR_API_BASE = 'https://timor.tech/api/holiday/year';
// 年度节假日表缓存 type（30 天 TTL：全年固定不变）
const HOLIDAY_YEAR_CACHE_TYPE = 'holiday_year';
// 单日节假日判定结果缓存 type（24h TTL：仅 cn 回退逐日路径时使用）
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

// ★ 港股年度休市静态表（周末以外的休市日，MM-DD）
// 来源（已人工核实）：
//   2026: HKEX 通告 CT/075/25《2026年香港证券市场假期》+ 政府宪报 2026 公众假期（14 天）
//   2027: 政府宪报 2027 公众假期（2026-05 修订版，13 天）
// 注意：
//   - 落在周六的公众假期不补放到周一（2026-12-26 周六、2027-05-01 周六，HKEX 通告均未列入补假）
//   - 2027 农历年初二为周日 → 年初四（02-09）为补假；12-25 周六，"圣诞节后第一个周日"为 12-27 周一
//   - 缺数据年份（如 2028 未公布时）降级为仅周末休市并告警一次
const HK_MARKET_HOLIDAYS = {
  2026: ['01-01', '02-17', '02-18', '02-19', '04-03', '04-06', '04-07', '05-01', '05-25', '06-19', '07-01', '10-01', '10-19', '12-25'],
  2027: ['01-01', '02-08', '02-09', '03-26', '03-29', '04-05', '05-13', '06-09', '07-01', '09-16', '10-01', '10-08', '12-27'],
};

// ★ hk 远程自动通道：HKEX 官方 iCal 日历订阅源（含 "Hong Kong Market is closed" 全年休市事件）
// 已验证：本地与阿里云生产环境均可直连（HTTP 200，约 280KB），覆盖当年+次年，
// 休市日与上方静态表 2026/2027 逐日一致；HKEX 每年 Q4 发布次年假期，
// 30 天缓存到期自动拉取带出 → 零人工维护，静态表退为首次访问时的即时兜底
const HKEX_ICAL_URL = 'https://www.hkex.com.hk/News/HKEX-Calendar/Subscribe-Calendar?sc_lang=en';
// hk 远程年度休市表缓存键（type holiday_year，30 天 TTL，跨进程/实例共享）
const HK_REMOTE_CACHE_KEY = 'hk_remote_sessions';
// hk 远程通道失败退避：10 分钟内不再重试，避免反复请求 HKEX（静态表兜底，失败零影响）
const HK_REMOTE_BACKOFF_MS = 10 * 60 * 1000;

// ==================================================================
// 年度交易日历表（三市场查表核心）
// 每市场 × 每年一张表：tradingSet 判定开市 O(1)，sortedDates 二分查前/后交易日
//   cn: timor.tech 年度节假日接口 + 周末规则（调休补班周六仍按周末休市，与原口径一致）
//   us: 本地规则生成（元旦/六月节/独立日/圣诞 + 5 个浮动假日），无需外部数据
//   hk: 上方静态表 + 周末规则
// ★ 构建成功才缓存；cn 构建失败不缓存（避免把降级结果固化），调用方回退逐日判定路径
// ==================================================================
const calendars = new Map();       // `${market}_${year}` -> { tradingSet, sortedDates }
const inflightBuilds = new Map();  // cn 年度表构建并发去重
const warnedHkYears = new Set();   // hk 缺数据年份只告警一次
// ★ hk 远程通道状态：成功后本进程不再触发；inflight 并发去重；失败退避时间戳
let hkRemoteRefreshed = false;
let hkRemoteInflight = null;
let hkRemoteFailedAt = 0;

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
 * 校验 YYYY-MM-DD 格式
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDateStr(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''));
}

/**
 * 生成某年全部自然日（YYYY-MM-DD，升序）
 * @param {number} year
 * @returns {string[]}
 */
function datesOfYear(year) {
  const dates = [];
  const d = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  while (d < end) {
    dates.push(formatDate(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ---------- 美股休市规则（本地规则，覆盖固定 + 浮动假日） ----------
/**
 * 判断是否为美股休市日（周末 + 美股固定/浮动节假日）。
 * 覆盖：元旦/六月节/独立日/圣诞 + 马丁路德金(1月第3周一)/总统日(2月第3周一)/
 * 阵亡将士纪念日(5月最后周一)/劳动节(9月第1周一)/感恩节(11月第4周四)。
 * 耶稣受难日未纳入：按保守处理（估算为 0，避免重复计入）。
 */
function isUsHolidayRule(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  if (dow === 0 || dow === 6) return true; // 周末
  if ((m === 1 && d === 1) || (m === 6 && d === 19) || (m === 7 && d === 4) || (m === 12 && d === 25)) return true;
  if (m === 1 && dow === 1 && d >= 15 && d <= 21) return true;  // 马丁路德金日（1月第3周一）
  if (m === 2 && dow === 1 && d >= 15 && d <= 21) return true;  // 总统日（2月第3周一）
  if (m === 5 && dow === 1 && d >= 25) return true;             // 阵亡将士纪念日（5月最后周一）
  if (m === 9 && dow === 1 && d <= 7) return true;              // 劳动节（9月第1周一）
  if (m === 11 && dow === 4 && d >= 22 && d <= 28) return true; // 感恩节（11月第4周四）
  return false;
}

// ---------- 三市场年度表构建 ----------
function buildUsCalendar(year) {
  const tradingSet = new Set();
  const sortedDates = [];
  for (const date of datesOfYear(year)) {
    if (!isUsHolidayRule(date)) {
      tradingSet.add(date);
      sortedDates.push(date);
    }
  }
  return { tradingSet, sortedDates };
}

/**
 * 按休市日（MM-DD 数组）构建 hk 年度表（静态表与远程通道共用的构建内核）
 * @param {number} year
 * @param {string[]|undefined} holidays - MM-DD 休市日数组；undefined 时降级为仅周末休市
 * @returns {{tradingSet: Set<string>, sortedDates: string[]}}
 */
function buildHkCalendarFromHolidays(year, holidays) {
  const holidaySet = new Set(holidays || []);
  const tradingSet = new Set();
  const sortedDates = [];
  for (const date of datesOfYear(year)) {
    // 静态表/远程表键均为 MM-DD，与完整日期比对前需切片
    if (!isWeekend(date) && !holidaySet.has(date.slice(5))) {
      tradingSet.add(date);
      sortedDates.push(date);
    }
  }
  return { tradingSet, sortedDates };
}

function buildHkCalendar(year) {
  const holidays = HK_MARKET_HOLIDAYS[year];
  if (!holidays && !warnedHkYears.has(year)) {
    warnedHkYears.add(year);
    logger.warn(`港股年度休市表缺 ${year} 年数据，先用仅周末休市兜底（等待远程通道刷新或人工补充静态表）`);
  }
  // 首次构建时触发远程刷新（fire-and-forget：成功后以远程数据替换/补充 calendars 条目）
  triggerHkRemoteRefresh();
  return buildHkCalendarFromHolidays(year, holidays);
}

// ---------- hk 远程自动通道（HKEX 官方 iCal → 年度休市表） ----------
/**
 * 解析 HKEX iCal 文本为 { 'YYYY': ['MM-DD', ...] } 休市日表
 * 仅保留 SUMMARY 以 "Hong Kong Public Holidays" 开头且 DESCRIPTION 含
 * "Hong Kong Market is closed" 的全日事件（Stock Connect 南北向等其它事件忽略）；
 * 落在周六的假期条目保留（构建表时周末规则自动过滤）
 * @param {string} text - iCal 原始文本
 * @returns {object|null} 无有效数据返回 null
 */
function parseHkexIcal(text) {
  if (!text || typeof text !== 'string' || !text.includes('BEGIN:VEVENT')) return null;
  const unfolded = text.replace(/\r?\n[ \t]/g, ''); // RFC5545 折行还原
  const sessions = {};
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const dateM = block.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/);
    if (!dateM) continue;
    const sumM = block.match(/SUMMARY:([^\r\n]+)/);
    const descM = block.match(/DESCRIPTION:([^\r\n]+)/);
    if (!sumM || !sumM[1].startsWith('Hong Kong Public Holidays')) continue;
    if (!descM || !/Hong Kong Market is closed/i.test(descM[1])) continue;
    const year = dateM[1];
    (sessions[year] = sessions[year] || []).push(`${dateM[2]}-${dateM[3]}`);
  }
  // 去重排序（Redis 模式下会 JSON 序列化，须为可序列化普通对象）
  for (const y of Object.keys(sessions)) {
    sessions[y] = [...new Set(sessions[y])].sort();
  }
  return Object.keys(sessions).length > 0 ? sessions : null;
}

/**
 * 将远程休市表应用到 calendars（替换/新增对应 hk_YYYY 条目）
 * @param {object} sessions - { 'YYYY': ['MM-DD', ...] }（来自远程解析或缓存）
 * @returns {number} 实际应用的年份数
 */
function applyHkRemoteSessions(sessions) {
  if (!sessions || typeof sessions !== 'object') return 0;
  let applied = 0;
  for (const [yearStr, holidays] of Object.entries(sessions)) {
    const year = Number(yearStr);
    // 合理性校验：年份合法且休市日数量在合理区间（防错误页/脏数据混入）
    if (!Number.isInteger(year) || year < 2000 || year > 2100) continue;
    if (!Array.isArray(holidays) || holidays.length === 0 || holidays.length > 40) continue;
    const cal = buildHkCalendarFromHolidays(year, holidays);
    calendars.set(`hk_${year}`, cal);
    applied++;
    logger.info(`港股日历远程更新: year=${year}, 休市日=${holidays.length}天, 交易日=${cal.sortedDates.length}天`);
  }
  return applied;
}

/**
 * 从 HKEX 官方 iCal 订阅源刷新 hk 年度休市表（自动通道主入口，导出供测试）
 * - 结果经 globalCache 缓存 30 天（type holiday_year），跨年自动刷新，静态表退为兜底
 * - 拉取/解析/应用失败静默返回 false（保留静态表/既有条目，不影响任何调用方）
 * @returns {Promise<boolean>} 是否成功应用远程数据
 */
async function refreshHkCalendarRemote() {
  try {
    // 1. 退避期内不再请求（失败后 10 分钟静默）
    if (Date.now() - hkRemoteFailedAt < HK_REMOTE_BACKOFF_MS) return false;

    // 2. 缓存命中 → 直接应用（不重新拉取）
    const cached = await globalCache.checkCache(HK_REMOTE_CACHE_KEY, HOLIDAY_YEAR_CACHE_TYPE);
    let sessions = cached.hit ? cached.data : null;

    // 3. 未命中 → 拉取 iCal 并解析
    if (!sessions) {
      const response = await axios.get(HKEX_ICAL_URL, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        // iCal 为文本响应，显式声明避免 axios 按内容嗅探
        responseType: 'text',
      });
      sessions = parseHkexIcal(typeof response.data === 'string' ? response.data : String(response.data || ''));
      // 合理性校验：至少覆盖当前年（防错误页混入；次年数据 HKEX Q4 发布，无也不算失败）
      const currentYear = String(new Date().getFullYear());
      const currentList = sessions && sessions[currentYear];
      if (!currentList || !currentList.length || currentList.length > 40) {
        throw new Error(`远程数据未覆盖当前年 ${currentYear}`);
      }
      globalCache.set(HK_REMOTE_CACHE_KEY, sessions, HOLIDAY_YEAR_CACHE_TYPE);
    }

    // 4. 应用到 calendars（替换/新增 hk_YYYY 条目）
    const applied = applyHkRemoteSessions(sessions);
    if (applied === 0) throw new Error('远程数据无有效年份');
    hkRemoteRefreshed = true;
    hkRemoteFailedAt = 0;
    return true;
  } catch (e) {
    hkRemoteFailedAt = Date.now();
    logger.warn(`港股日历远程刷新失败（静态表兜底，${Math.round(HK_REMOTE_BACKOFF_MS / 60000)} 分钟后可重试）: ${e.message}`);
    return false;
  }
}

/**
 * 触发 hk 远程日历刷新（fire-and-forget，同步返回不阻塞构建路径）
 * 首次成功后本进程不再触发；失败退避 10 分钟（下次 hk 年表构建时再试）
 */
function triggerHkRemoteRefresh() {
  if (hkRemoteRefreshed || hkRemoteInflight) return;
  if (Date.now() - hkRemoteFailedAt < HK_REMOTE_BACKOFF_MS) return;
  hkRemoteInflight = refreshHkCalendarRemote()
    .catch((e) => logger.warn(`港股日历远程刷新异常: ${e.message}`))
    .finally(() => { hkRemoteInflight = null; });
}

/**
 * cn 年度表构建：依赖 timor 年度接口，失败返回 null（不缓存失败结果）
 */
async function buildCnCalendar(year) {
  const yearMap = await getHolidayYearData(year);
  if (!yearMap) return null;
  const tradingSet = new Set();
  const sortedDates = [];
  for (const date of datesOfYear(year)) {
    // 年度表 holiday=true 为法定节假日；holiday=false 为调休补班（周六补班仍按周末休市，口径不变）
    if (!isWeekend(date) && yearMap[date.slice(5)] !== true) {
      tradingSet.add(date);
      sortedDates.push(date);
    }
  }
  return { tradingSet, sortedDates };
}

/**
 * 获取（或异步构建）某市场某年的交易日历表；cn 构建失败返回 null
 * @param {string} market - 'cn' | 'us' | 'hk'
 * @param {number} year
 * @returns {Promise<{tradingSet: Set<string>, sortedDates: string[]}|null>}
 */
async function ensureCalendar(market, year) {
  const key = `${market}_${year}`;
  if (calendars.has(key)) return calendars.get(key);
  if (market !== 'cn') {
    const cal = market === 'us' ? buildUsCalendar(year) : buildHkCalendar(year);
    calendars.set(key, cal);
    logger.info(`交易日历构建完成: market=${market}, year=${year}, 交易日=${cal.sortedDates.length}天`);
    return cal;
  }
  if (inflightBuilds.has(key)) return inflightBuilds.get(key);
  const promise = (async () => {
    try {
      const cal = await buildCnCalendar(year);
      if (cal) {
        calendars.set(key, cal);
        logger.info(`交易日历构建完成: market=cn, year=${year}, 交易日=${cal.sortedDates.length}天`);
      } else {
        logger.warn(`交易日历构建失败（年度节假日接口不可用），回退逐日判定: year=${year}`);
      }
      return cal;
    } finally {
      inflightBuilds.delete(key);
    }
  })();
  inflightBuilds.set(key, promise);
  return promise;
}

/**
 * 同步获取本地可构建市场的年表（us/hk）；cn 依赖外部接口，仅支持异步路径
 * @param {string} market
 * @param {number} year
 * @returns {{tradingSet: Set<string>, sortedDates: string[]}|null}
 */
function getCalendarSync(market, year) {
  if (market === 'cn') return null;
  const key = `${market}_${year}`;
  let cal = calendars.get(key);
  if (!cal) {
    cal = market === 'us' ? buildUsCalendar(year) : buildHkCalendar(year);
    calendars.set(key, cal);
    logger.info(`交易日历构建完成: market=${market}, year=${year}, 交易日=${cal.sortedDates.length}天`);
  }
  return cal;
}

// ---------- 有序数组二分查找 ----------
/**
 * cal 中严格小于 dateStr 的最大交易日
 */
function prevTradingDayInCalendar(cal, dateStr) {
  const arr = cal.sortedDates;
  let lo = 0;
  let hi = arr.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < dateStr) {
      ans = arr[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * cal 中严格大于 dateStr 的最小交易日
 */
function nextTradingDayInCalendar(cal, dateStr) {
  const arr = cal.sortedDates;
  let lo = 0;
  let hi = arr.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] > dateStr) {
      ans = arr[mid];
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

// ==================================================================
// 对外 API（保持既有函数签名；新增 market 参数默认 'cn'，既有调用点零改动）
// ==================================================================

/**
 * 调用 timor.tech API 查询指定日期是否为法定节假日（cn 回退逐日路径专用）
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
  logger.debug(`节假日 API 响应: date=${dateStr}, 耗时=${elapsed}ms, httpStatus=${response.status}`);

  // 校验响应结构：合法响应必须包含 holiday 字段（工作日时 holiday 为 null）
  if (!response.data || typeof response.data !== 'object' || !('holiday' in response.data)) {
    logger.warn(`节假日 API 响应格式异常: date=${dateStr}, body=${String(response.data).slice(0, 200)}`);
    throw new Error(`响应格式异常: ${String(response.data).slice(0, 200)}`);
  }

  const holidayInfo = response.data.holiday;
  // holiday.holiday === true 表示该日为法定节假日；其余情况（含 holiday 为 null 的正常工作日）视为非节假日
  const isHoliday = !!(holidayInfo && holidayInfo.holiday === true);
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
 * 获取指定年份的节假日查询表（一次请求拿整年，带 30 天缓存）
 * 解决长假回溯最近交易日时逐日请求 timor 单日接口触发 429 限流的问题。
 * @param {string} year - YYYY
 * @returns {Promise<object|null>} { 'MM-DD': boolean }；失败返回 null（调用方回退单日接口）
 */
async function getHolidayYearData(year) {
  const cacheKey = `holiday_year_${year}`;

  // 1. 正常缓存命中（30 天 TTL）
  const cached = await globalCache.checkCache(cacheKey, HOLIDAY_YEAR_CACHE_TYPE);
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
 * 判断指定日期是否为法定节假日（仅 cn 数据；优先年度表，未命中/失败回退单日接口，再失败降级为非节假日）
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<boolean>}
 */
async function isHoliday(dateStr) {
  const cacheKey = `holiday_${dateStr}`;

  // 1. 正常缓存命中 → 直接返回（fast path，不走并发合并）
  const cached = await globalCache.checkCache(cacheKey, HOLIDAY_DAY_CACHE_TYPE);
  if (cached.hit) {
    logger.debug(`缓存命中: date=${dateStr}, isHoliday=${cached.data.isHoliday}`);
    return cached.data.isHoliday;
  }

  // 2. 并发去重：同一 dateStr 已有请求在飞 → 合并
  if (inflightHolidayPromises.has(dateStr)) {
    logger.debug(`isHoliday(${dateStr}) 请求已在飞，合并并发调用`);
    return inflightHolidayPromises.get(dateStr);
  }

  // 3. 发起请求并记录 inflight
  const promise = (async () => {
    const year = dateStr.slice(0, 4);
    const mmdd = dateStr.slice(5);
    try {
      const yearMap = await getHolidayYearData(year);
      if (yearMap) {
        const isHolidayVal = yearMap[mmdd] === true;
        logger.debug(`年度节假日判定: date=${dateStr}, isHoliday=${isHolidayVal}`);
        globalCache.set(cacheKey, { isHoliday: isHolidayVal }, HOLIDAY_DAY_CACHE_TYPE);
        return isHolidayVal;
      }
      // 年度不可用 → 回退单日接口
      logger.debug(`年度节假日不可用，查询单日 API: date=${dateStr}`);
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
 * 判断指定日期是否为交易日（年度日历查表，O(1)；cn 表构建失败回退逐日判定路径）
 * 口径不变：isTradingDay = !isWeekend && !isHoliday，调休补班周六仍按周末休市
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} market - 'cn'(默认) | 'us' | 'hk'
 * @returns {Promise<boolean>}
 */
async function isTradingDay(dateStr, market = 'cn') {
  if (!isValidDateStr(dateStr)) return false;
  const year = Number(dateStr.slice(0, 4));
  try {
    const cal = await ensureCalendar(market, year);
    if (cal) return cal.tradingSet.has(dateStr);
  } catch (e) {
    logger.warn(`交易日历查询异常，回退逐日判定: market=${market}, date=${dateStr}, err=${e.message}`);
  }
  // 回退路径（仅 cn）：周末短路 + 节假日判定
  if (isWeekend(dateStr)) return false;
  return market === 'cn' ? !(await isHoliday(dateStr)) : false;
}

/**
 * 同步判定交易日（仅本地可构建市场 us/hk；cn 请用异步 isTradingDay）
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} market - 'us' | 'hk'
 * @returns {boolean}
 */
function isTradingDaySync(dateStr, market) {
  if (!isValidDateStr(dateStr) || market === 'cn') return false;
  const cal = getCalendarSync(market, Number(dateStr.slice(0, 4)));
  return cal ? cal.tradingSet.has(dateStr) : false;
}

/**
 * 获取指定日期的上一个交易日（严格小于该日期；跨年时自动构建相邻年表）
 * cn 表不可用时回退逐日判定（与原 holdingService.getLatestTradingDayAnchor 行为一致）
 * @param {string} dateStr - YYYY-MM-DD（调用方可能传 null，直接返回 null）
 * @param {string} market - 'cn'(默认) | 'us' | 'hk'
 * @returns {Promise<string|null>}
 */
async function getLatestTradingDayAnchor(dateStr, market = 'cn') {
  // 入参必须为 'YYYY-MM-DD'：调用方在"窗口内无净值"等场景会传 null，
  // 若不拦截会一路 addDays(null,1) 生成 'NaN-NaN-NaN' 并白跑一次节假日查询（日志噪音）
  if (!isValidDateStr(dateStr)) return null;

  const year = Number(dateStr.slice(0, 4));
  if (market !== 'cn') return getPrevTradingDaySync(dateStr, market);

  const cal = await ensureCalendar('cn', year).catch(() => null);
  if (cal) {
    let prev = prevTradingDayInCalendar(cal, dateStr);
    // 跨年（如 1 月 1~3 日回溯）：构建上一年表取最后交易日
    for (let y = year - 1; !prev && y >= year - 2; y--) {
      const prevCal = await ensureCalendar('cn', y).catch(() => null);
      if (!prevCal) break;
      prev = prevCal.sortedDates[prevCal.sortedDates.length - 1] || null;
    }
    if (prev) return prev;
    logger.warn('cn 年度表异常为空，回退逐日判定');
  }
  // 回退路径：cn 年度接口不可用时逐日判定（失败即返回 null，不固化降级结果）
  let current = addDays(dateStr, -1);
  for (let i = 0; i < MAX_LOOP; i++) {
    try {
      if (await isTradingDay(current)) return current;
    } catch (e) {
      logger.warn(`回溯最近交易日失败: date=${current}, err=${e.message}`);
      return null;
    }
    current = addDays(current, -1);
  }
  logger.warn(`回溯最近交易日超过最大次数: dateStr=${dateStr}, maxLoop=${MAX_LOOP}`);
  return null;
}

/**
 * 同步获取上一个交易日（仅本地可构建市场 us/hk）
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} market - 'us' | 'hk'
 * @returns {string|null}
 */
function getPrevTradingDaySync(dateStr, market) {
  if (!isValidDateStr(dateStr) || market === 'cn') return null;
  const year = Number(dateStr.slice(0, 4));
  const cal = getCalendarSync(market, year);
  let prev = prevTradingDayInCalendar(cal, dateStr);
  for (let y = year - 1; !prev && y >= year - 2; y--) {
    const prevCal = getCalendarSync(market, y);
    prev = prevCal.sortedDates[prevCal.sortedDates.length - 1] || null;
  }
  return prev;
}

/**
 * 获取指定日期的下一个交易日（日期 +1 后开始跳过非交易日；跨年自动构建相邻年表）
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} market - 'cn'(默认) | 'us' | 'hk'
 * @returns {Promise<string>} YYYY-MM-DD
 */
async function nextTradingDay(dateStr, market = 'cn') {
  if (!isValidDateStr(dateStr)) {
    throw new Error(`[HolidayService] nextTradingDay 非法日期: ${dateStr}`);
  }
  const year = Number(dateStr.slice(0, 4));
  const cal = await ensureCalendar(market, year).catch(() => null);
  if (cal) {
    let next = nextTradingDayInCalendar(cal, dateStr);
    for (let y = year + 1; !next && y <= year + 2; y++) {
      const nextCal = await ensureCalendar(market, y).catch(() => null);
      if (!nextCal) break;
      next = nextCal.sortedDates[0] || null;
    }
    if (next) return next;
  }
  // 回退路径：逐日判定
  let current = addDays(dateStr, 1);
  for (let i = 0; i < MAX_LOOP; i++) {
    if (await isTradingDay(current, market)) return current;
    current = addDays(current, 1);
  }
  logger.error(`nextTradingDay 超过最大循环次数: dateStr=${dateStr}, maxLoop=${MAX_LOOP}`);
  throw new Error(`[HolidayService] nextTradingDay 超过最大循环次数 ${MAX_LOOP}, dateStr=${dateStr}`);
}

/**
 * 确保日期为交易日，若当前日期非交易日则顺延到下一个交易日
 * 与 nextTradingDay 的区别：从当前日期开始检查（不 +1），若当前已是交易日则直接返回
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} market - 'cn'(默认) | 'us' | 'hk'
 * @returns {Promise<string>} YYYY-MM-DD
 */
async function ensureTradingDay(dateStr, market = 'cn') {
  if (await isTradingDay(dateStr, market)) return dateStr;
  return nextTradingDay(dateStr, market);
}

module.exports = {
  isHoliday,
  isTradingDay,
  isTradingDaySync,
  nextTradingDay,
  ensureTradingDay,
  isWeekend,
  getLatestTradingDayAnchor,
  getPrevTradingDaySync,
  // hk 远程自动通道（导出供测试与运维手动触发）
  refreshHkCalendarRemote,
  applyHkRemoteSessions,
};
