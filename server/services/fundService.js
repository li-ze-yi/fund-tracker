const axios = require('axios');
const globalCache = require('./globalCache');
const { createLogger } = require('../utils/logger');
const { getLocalToday, normalizeDateStr } = require('../utils/date');

const logger = createLogger('FundService');

// 惰性 TTL 缓存：存取时检查过期条目并删除，超出 maxSize 时删除最旧（Map 迭代顺序即插入顺序）
function createTtlCache({ ttl, maxSize = 200 }) {
  const map = new Map();
  return {
    get(key) {
      const item = map.get(key);
      if (item) {
        if (Date.now() - item.ts < ttl) return item;
        map.delete(key); // 过期惰性删除
      }
      return null;
    },
    set(key, value) {
      if (map.size >= maxSize) {
        const oldestKey = map.keys().next().value;
        if (oldestKey !== undefined) map.delete(oldestKey);
      }
      map.set(key, value);
    },
    has(key) { return map.has(key); },
    clear() { map.clear(); },
  };
}

const TIMEOUT = 3000; // 3秒超时（原8秒太长，失败时串行等待浪费大量时间）

// 新浪接口可用性缓存：某些服务器IP会被新浪403封禁，检测到后跳过所有新浪请求
let sinaAvailable = null;        // null=未检测, true=可用, false=不可用
let sinaCheckTime = 0;           // 上次检测时间
const SINA_CHECK_INTERVAL = 300000; // 每5分钟重新检测一次（避免临时故障后一直跳过）

/**
 * 检测新浪接口是否可用（返回403则标记为不可用）
 * 如果不可用，后续所有新浪请求直接跳过，避免浪费5秒超时
 */
async function checkSinaAvailability() {
  const now = Date.now();
  // 缓存5分钟内有效
  if (sinaAvailable !== null && (now - sinaCheckTime) < SINA_CHECK_INTERVAL) {
    return sinaAvailable;
  }
  try {
    const { status } = await axios.get('http://hq.sinajs.cn/list=fu_000001', {
      timeout: 3000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
      },
      validateStatus: () => true, // 不抛异常，让我们自己判断状态码
    });
    sinaAvailable = status === 200;
    sinaCheckTime = now;
    if (!sinaAvailable) {
      logger.warn(`新浪接口不可用(HTTP ${status})，已跳过所有新浪请求`);
    }
    return sinaAvailable;
  } catch (e) {
    sinaAvailable = false;
    sinaCheckTime = now;
    logger.warn(`新浪接口不可用(${e.message})，已跳过所有新浪请求`);
    return false;
  }
}

function defaultHeaders(referer) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': referer || 'https://fund.eastmoney.com/',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
}

const getTimestamp = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
};

// 天天基金移动端API请求头（模拟天天基金APP）
const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://fund.eastmoney.com/',
};

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

async function getRealTimeValue(fundCode) {
  const errors = [];

  // 接口1: api.fund.eastmoney.com/f10/lsjz (东方财富最新确认净值, JSON)
  // 注：fundgz.1234567.com.cn 实时估值接口已于2026年因监管要求下线
  try {
    const refererUrl = `http://fundf10.eastmoney.com/jjjz_${fundCode}.html`;
    const today = getLocalToday();
    const threeDaysAgo = normalizeDateStr(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
    const { data } = await axios.get(
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=1&pageSize=2&startDate=${threeDaysAgo}&endDate=${today}`,
      { timeout: TIMEOUT, headers: defaultHeaders(refererUrl) }
    );
    if (data && data.Data && data.Data.LSJZList && data.Data.LSJZList.length) {
      const list = data.Data.LSJZList;
      // 取最新一条记录（最新确认净值）
      const latest = list[0];
      const nav = parseFloat(latest.DWJZ);
      if (!isNaN(nav) && nav > 0) {
        // 计算涨跌幅：如果有前一日净值，则计算
        let gainPercent = null;
        if (list.length >= 2) {
          const prevNav = parseFloat(list[1].DWJZ);
          if (!isNaN(prevNav) && prevNav > 0) {
            gainPercent = parseFloat(((nav - prevNav) / prevNav * 100).toFixed(2));
          }
        }
        // 如果 API 返回了 JZZZL（净值增长率），优先使用
        if (latest.JZZZL != null && latest.JZZZL !== '') {
          gainPercent = parseFloat(latest.JZZZL);
        }
        return {
          netValue: nav,
          gainPercent: gainPercent,
          updateTime: latest.FSRQ || '',
        };
      }
    }
  } catch (e) { errors.push(`lsjz: ${e.message}`); }

  // 接口2: fund.eastmoney.com/pingzhongdata (基金品种数据, JS变量)
  try {
    const { data: jsData } = await axios.get(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`, {
      timeout: TIMEOUT,
      headers: defaultHeaders(`https://fund.eastmoney.com/${fundCode}.html`),
      responseType: 'text',
    });
    // 从 Data_netWorthTrend 中取最新净值
    const trendMatch = jsData.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
    if (trendMatch) {
      const trend = safeJsonParse(trendMatch[1]);
      if (trend && trend.length > 0) {
        const latest = trend[trend.length - 1];
        const prev = trend.length >= 2 ? trend[trend.length - 2] : null;
        const nav = parseFloat(latest.y);
        let gainPercent = null;
        if (prev && prev.y > 0) {
          gainPercent = parseFloat(((nav - prev.y) / prev.y * 100).toFixed(2));
        }
        if (!isNaN(nav) && nav > 0) {
          return {
            netValue: nav,
            gainPercent: gainPercent,
            updateTime: latest.x ? normalizeDateStr(new Date(latest.x)) : '',
          };
        }
      }
    }
  } catch (e) { errors.push(`pingzhong: ${e.message}`); }

  // 接口3: 东方财富push2接口 (场内ETF/LOF行情, 仅对上市基金有效)
  try {
    const secId = `1.${fundCode}`;
    const { data } = await axios.get(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=${secId}&fields=f43,f44,f45,f46,f47,f48,f50,f52,f58,f170,f171,f57`,
      { timeout: TIMEOUT, headers: defaultHeaders('https://quote.eastmoney.com/') }
    );
    if (data && data.data && data.data.f43 != null) {
      return {
        netValue: data.data.f43 / 1000 || 0,
        gainPercent: data.data.f170 != null ? data.data.f170 / 100 : 0,
        updateTime: '',
      };
    }
  } catch (e) { errors.push(`push2: ${e.message}`); }

  return null;
}

async function getHistoryNetValues(fundCode, startDate, endDate) {
  const errors = [];
  const allRecords = [];
  let pageIndex = 1;
  const pageSize = 20; // 东方财富API限制每次最多返回约20-30条
  let hasMore = true;

  // 接口1: api.fund.eastmoney.com/f10/lsjz (东方财富JSON, 需Referer) - 支持分页
  try {
    while (hasMore) {
      const refererUrl = `http://fundf10.eastmoney.com/jjjz_${fundCode}.html`;
      const { data } = await axios.get(
        `https://api.fund.eastmoney.com/f10/lsjz?callback=jQuery&fundCode=${fundCode}&pageIndex=${pageIndex}&pageSize=${pageSize}&startDate=${startDate}&endDate=${endDate}`,
        { timeout: TIMEOUT, headers: defaultHeaders(refererUrl) }
      );

      if (typeof data === 'string') {
        const jsonpMatch = data.match(/jQuery\(([\s\S]*)\)/);
        if (jsonpMatch) {
          const parsed = safeJsonParse(jsonpMatch[1]);
          if (parsed && parsed.Data && parsed.Data.LSJZList && parsed.Data.LSJZList.length) {
            const pageRecords = parsed.Data.LSJZList.map(item => ({
              date: item.FSRQ,
              nav: parseFloat(item.DWJZ),
              accumulatedNav: parseFloat(item.LJJZ),
              growthRate: item.JZZZL ? parseFloat(item.JZZZL) : null,
            }));
            allRecords.push(...pageRecords);

            // 检查是否还有更多数据（如果返回的记录数小于pageSize说明已经到底了）
            hasMore = parsed.Data.LSJZList.length >= pageSize;
            pageIndex++;
            continue; // 继续下一页
          }
        }
      }

      if (data && data.Data && data.Data.LSJZList && data.Data.LSJZList.length) {
        const pageRecords = data.Data.LSJZList.map(item => ({
          date: item.FSRQ,
          nav: parseFloat(item.DWJZ),
          accumulatedNav: parseFloat(item.LJJZ),
          growthRate: item.JZZZL ? parseFloat(item.JZZZL) : null,
        }));
        allRecords.push(...pageRecords);
        hasMore = data.Data.LSJZList.length >= pageSize;
        pageIndex++;
        continue;
      }

      hasMore = false; // 没有数据了，停止循环
    }

    if (allRecords.length > 0) return allRecords;

  } catch (e) { errors.push(`lsjz_json: ${e.message}`); }

  // 接口2: fundf10.eastmoney.com/F10DataApi.aspx (HTML表格接口)
  try {
    const sdate = startDate || '2000-01-01';
    const edate = endDate || getLocalToday();
    const { data: html } = await axios.get(
      `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${fundCode}&page=1&per=100&sdate=${sdate}&edate=${edate}`,
      { timeout: TIMEOUT, headers: defaultHeaders(`http://fundf10.eastmoney.com/jjjz_${fundCode}.html`) }
    );
    const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
    const results = [];
    for (const row of rows) {
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
      if (!cells || cells.length < 4) continue;
      const date = cells[0].replace(/<[^>]+>/g, '').trim();
      const nav = parseFloat(cells[1].replace(/<[^>]+>/g, '').trim());
      if (date && !isNaN(nav) && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        results.push({ date, nav, accumulatedNav: 0, growthRate: null });
      }
      if (cells.length >= 3) {
        results[results.length - 1].accumulatedNav = parseFloat(cells[2].replace(/<[^>]+>/g, '').trim()) || 0;
      }
    }
    if (results.length) return results;
  } catch (e) { errors.push(`F10DataApi: ${e.message}`); }

  // 接口3: api.fund.eastmoney.com (直接JSON请求, 无callback)
  try {
    const { data } = await axios.get(
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=1&pageSize=500&startDate=${startDate || ''}&endDate=${endDate || ''}`,
      {
        timeout: TIMEOUT,
        headers: defaultHeaders(`http://fundf10.eastmoney.com/jjjz_${fundCode}.html`),
      }
    );
    if (data && data.Data && data.Data.LSJZList && data.Data.LSJZList.length) {
      return data.Data.LSJZList.map(item => ({
        date: item.FSRQ,
        nav: parseFloat(item.DWJZ),
        accumulatedNav: parseFloat(item.LJJZ),
        growthRate: item.JZZZL ? parseFloat(item.JZZZL) : null,
      }));
    }
  } catch (e) { errors.push(`lsjz_direct: ${e.message}`); }

  // 接口4: push2.eastmoney.com 基金日线行情
  try {
    const secId = `1.${fundCode}`;
    const { data } = await axios.get(
      `https://push2.eastmoney.com/api/qt/stock/kline/get?secid=${secId}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55&klt=101&fqt=1&end=20500101&lmt=365`,
      { timeout: TIMEOUT, headers: defaultHeaders('https://quote.eastmoney.com/') }
    );
    if (data && data.data && data.data.klines && data.data.klines.length) {
      return data.data.klines.map(line => {
        const parts = line.split(',');
        return {
          date: parts[0],
          nav: parseFloat(parts[2]) || 0,
          accumulatedNav: 0,
          growthRate: null,
        };
      });
    }
  } catch (e) { errors.push(`kline: ${e.message}`); }

  return [];
}

async function getFundInfo(fundCode) {
  try {
    const { data } = await axios.get(`https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`, {
      timeout: TIMEOUT,
      headers: defaultHeaders(`https://fund.eastmoney.com/${fundCode}.html`),
      responseType: 'text',
    });
    const nameMatch = data.match(/fS_name\s*=\s*"(.+?)"/);
    const codeMatch = data.match(/fS_code\s*=\s*"(.+?)"/);
    return {
      code: codeMatch ? codeMatch[1] : fundCode,
      name: nameMatch ? nameMatch[1] : '',
    };
  } catch {
    return null;
  }
}

async function getAllFunds() {
  const { data } = await axios.get('https://fund.eastmoney.com/js/fundcode_search.js', {
    timeout: 15000,
    headers: defaultHeaders('https://fund.eastmoney.com/'),
    responseType: 'text',
  });
  const match = data.match(/var\s+r\s*=\s*([\s\S]*?);/);
  if (!match) return [];
  return safeJsonParse(match[1]) || [];
}

// ═══════════════════════════════════════════
// 方案一：腾讯基金接口（qt.gtimg.cn）
// ═══════════════════════════════════════════
/* 【已废弃】死代码，仅被 getHoldingsEstimatedValue 调用，未导出。腾讯基金接口不提供盘中实时估值，仅返回前一日确认净值。
async function getTencentValue(fundCode) {
  try {
    const { data } = await axios.get(`http://qt.gtimg.cn/q=jj${fundCode}`, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      responseType: 'text',
    });
    const line = data.split('\n').find(l => l.includes('v_jj'));
    if (!line) return null;
    const content = line.split('="')[1]?.replace(/";$/, '');
    if (!content) return null;
    const fields = content.split('~');
    // fields: [0]code, [1]name, [2-4]?, [5]unit_nav, [6]acc_nav, [7]change%, [8]date
    const nav = parseFloat(fields[5]);
    if (!isNaN(nav) && nav > 0) {
      return {
        netValue: nav,
        gainPercent: parseFloat(fields[7]) || null,
        updateTime: fields[8] || '',
        source: 'tencent',
      };
    }
  } catch (e) { // fall through }
  return null;
}
*/

// ═══════════════════════════════════════════
// 方案二：持仓穿透法 - 自行计算基金估值
// ═══════════════════════════════════════════

// 持仓数据缓存（按基金代码，TTL 4小时）
const holdingsCache = createTtlCache({ ttl: 4 * 60 * 60 * 1000 });

function getStockPrefix(code) {
  if (/^[A-Z]/.test(code)) return 'us'; // 美股（字母代码，如 NVDA）
  if (code.length === 5) return 'hk'; // 港股
  return code.startsWith('6') ? 'sh' : 'sz'; // A股
}

async function getFundHoldings(fundCode, isQDII = false) {
  const now = Date.now();
  const cached = holdingsCache.get(fundCode);
  if (cached && (now - cached.ts) < 4 * 60 * 60 * 1000) {
    logger.debug(`${fundCode} 持仓命中缓存`);
    return cached.data;
  }

  logger.info(`${fundCode} 获取持仓数据`);

  // 数据源：fundmobapi JSON 接口（FundMNInverstPosition）
  // 注：fundf10 HTML 接口（FundArchivesDatas.aspx?type=jjcc）已不再返回持仓数据，
  // 所有基金的 <tbody> 均为空，持仓数据仅通过 fundmobapi 的 fundStocks 字段提供
  try {
    const { data } = await axios.get(
      `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?FCODE=${fundCode}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0`,
      { timeout: TIMEOUT, headers: MOBILE_HEADERS }
    );

    const fundStocks = data?.Datas?.fundStocks || [];
    const etfCode = data?.Datas?.ETFCODE || null;

    const holdings = [];
    let totalStockRatio = 0;

    for (const s of fundStocks) {
      const stockCode = s.GPDM;
      const stockName = s.GPJC;
      const ratio = parseFloat(s.JZBL);

      // 过滤空代码和无效占比；只接受 5-6 位数字（A股/港股）或 1-6 位大写字母（美股）
      if (!stockCode || isNaN(ratio) || ratio <= 0) continue;
      if (!/^(?:\d{5,6}|[A-Z]{1,6})$/.test(stockCode.trim())) continue;

      holdings.push({ code: stockCode, name: stockName, ratio });
      totalStockRatio += ratio;
    }

    // QDII ETF联接基金：fundStocks 为空但披露了母ETF（ETFCODE）时，递归拉取母ETF成分参与加权
    // 仅 QDII/海外类型触发（A 股 ETF 联接保持原"母ETF场内价"路径，不递归）
    if (!holdings.length && etfCode && isQDII) {
      logger.info(`${fundCode} 持仓为空但为QDII联接(母ETF=${etfCode})，递归拉取母ETF成分`);
      const etfRes = await getFundHoldings(etfCode, false);
      if (etfRes.holdings.length) {
        holdings.push(...etfRes.holdings);
        totalStockRatio = etfRes.totalStockRatio;
      }
    }

    const result = {
      holdings,
      totalStockRatio: parseFloat(totalStockRatio.toFixed(1)),
      reportDate: null,
      etfCode,
    };
    holdingsCache.set(fundCode, { data: result, ts: now });
    logger.info(`${fundCode} 持仓数据: ${holdings.length}只, etfCode=${etfCode || 'null'}`);
    return result;
  } catch (e) {
    logger.warn(`${fundCode} fundmobapi 持仓接口失败: ${e.message}`);
    return { holdings: [], totalStockRatio: 0, reportDate: null, etfCode: null };
  }
}

/**
 * 获取沪深300指数实时涨跌幅，用于填补缺失股票的收益假设
 * 超时2秒，失败返回0
 */
async function getBenchmarkChange() {
  try {
    const { data } = await axios.get('http://qt.gtimg.cn/q=sh000300', {
      timeout: 2000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'text',
    });
    const line = data.split('\n').find(l => l.includes('v_sh000300'));
    if (line) {
      const content = line.split('="')[1]?.replace(/";$/, '');
      const fields = content?.split('~');
      // 腾讯字段: [32]涨跌幅%
      const changePercent = parseFloat(fields?.[32]);
      if (!isNaN(changePercent)) return changePercent;
    }
  } catch (e) { /* fall through */ }
  return 0;
}

/**
 * 获取国债指数（sh000012）实时涨跌幅，用于债券部分的基准收益率
 * 超时2秒，失败返回0
 */
async function getBondBenchmarkChange() {
  try {
    const { data } = await axios.get('http://qt.gtimg.cn/q=sh000012', {
      timeout: 2000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'text',
    });
    const line = data.split('\n').find(l => l.includes('v_sh000012'));
    if (line) {
      const content = line.split('="')[1]?.replace(/";$/, '');
      const fields = content?.split('~');
      // 腾讯字段: [32]涨跌幅%
      const changePercent = parseFloat(fields?.[32]);
      if (!isNaN(changePercent)) return changePercent;
    }
  } catch (e) { /* fall through */ }
  return 0;
}

/**
 * QDII/海外基金类型判定（与 holdingService.isQdiiFundType /QDII|海外/ 保持一致的轻量实现，
 * 避免 fundService 反向 require holdingService 造成循环依赖）
 */
function isQdiiFundType(type) {
  return !!type && /QDII|海外/.test(type);
}

/**
 * 按基金名称关键词映射美股板块指数（用于缺失持仓的板块填充近似）
 * 匹配优先级：纳斯达克/纳指 → usNDX；标普/500 → usINX；道琼斯/道指/工业 → usDJI；默认 usNDX
 */
function getFundUsIndexCode(fundName = '') {
  const n = fundName || '';
  if (/纳斯达克|纳指|NDX/i.test(n)) return 'usNDX';
  if (/标普|SP500|\bS&P\b|500指数/i.test(n)) return 'usINX';
  if (/道琼斯|道指|工业指数|DJI/i.test(n)) return 'usDJI';
  return 'usNDX';
}

/**
 * 日期减法（date-only 字符串）：返回 YYYY-MM-DD，处理跨月/跨年
 */
function subDaysStr(dateStr, days) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d - days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * 判断是否为美股休市日（周末 + 美股固定/浮动节假日）。
 * 覆盖：元旦/六月节/独立日/圣诞 + 马丁路德金(1月第3周一)/总统日(2月第3周一)/
 * 阵亡将士纪念日(5月最后周一)/劳动节(9月第1周一)/感恩节(11月第4周四)。
 * 耶稣受难日未纳入：按保守处理（估算为 0，避免重复计入）。
 */
function isUsMarketHoliday(dateStr) {
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

/**
 * 返回 dateStr 之前的最近一个美股交易日（跳过周末与美股节假日）
 * 用于确认净值滞后判定：D 应等于 T 的前一个美股交易日，而非自然日减一
 */
function getPrevUsTradingDay(dateStr) {
  let cur = dateStr;
  for (let i = 0; i < 10; i++) {
    cur = subDaysStr(cur, 1);
    if (cur && !isUsMarketHoliday(cur)) return cur;
  }
  return null;
}

/**
 * 通用指数实时涨跌幅（腾讯 qt.gtimg.cn/q=indexCode，与A股字段布局一致：[3]现价、[30]时间、[32]涨跌幅）
 * @returns {{changePercent: number, date: string}|null} date=最新交易日（date-only，YYYY-MM-DD）
 */
async function getIndexChange(indexCode) {
  try {
    const { data } = await axios.get(`http://qt.gtimg.cn/q=${indexCode}`, {
      timeout: 2000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'text',
    });
    const line = data.split('\n').find(l => l.includes(`v_${indexCode}`));
    if (line) {
      const content = line.split('="')[1]?.replace(/";$/, '');
      const fields = content?.split('~');
      const changePercent = parseFloat(fields?.[32]);
      const rawTime = fields?.[30] || '';
      // 腾讯时间戳格式：ISO(2026-08-27 17:15:59) 或 斜杠(2026/08/28 17:44:31)，统一归一
      const date = rawTime.replace(/\//g, '-').slice(0, 10) || null;
      if (!isNaN(changePercent)) return { changePercent, date };
    }
  } catch (e) { /* fall through */ }
  return null;
}

/**
 * 获取日经225指数当日涨跌（新浪 int_nikkei），用于日股缺失持仓的近似填充
 * 新浪格式: name,现价,涨跌额,涨跌幅
 * 超时2秒，失败返回 null
 */
async function getNikkeiIndexChange() {
  try {
    const { data } = await axios.get('http://hq.sinajs.cn/list=int_nikkei', {
      timeout: 2000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
      responseType: 'text',
    });
    const match = data.match(/int_nikkei="([^"]*)"/);
    if (match) {
      const fields = match[1].split(',');
      const changePercent = parseFloat(fields[3]);
      if (!isNaN(changePercent)) return changePercent;
    }
  } catch (e) { /* fall through */ }
  return 0;
}

async function getStocksRealtime(stockCodes) {
  if (!stockCodes || stockCodes.length === 0) return {};

  // 缓存策略：单只股票独立缓存（key: stock_quote_{code}）
  // 数据来源：腾讯股票实时行情接口 qt.gtimg.cn
  const result = {};
  const needFetch = [];

  // 1. 逐只检查缓存是否命中（改用 checkCache 统一统计口径）
  for (const code of stockCodes) {
    const cacheKey = `stock_quote_${code}`;
    const cacheResult = globalCache.checkCache(cacheKey, 'stock_quote');
    if (cacheResult.hit) {
      // 缓存命中，直接放入结果对象
      result[code] = cacheResult.data;
      continue;
    }
    // 未命中，加入待请求列表
    needFetch.push(code);
  }

  logger.debug(`共${stockCodes.length}只: 缓存命中${stockCodes.length - needFetch.length}只, 需请求${needFetch.length}只`);

  // 2. 全部命中则直接返回，不请求外部 API
  if (needFetch.length === 0) {
    logger.debug(`全部命中缓存，跳过外部API请求`);
    return result;
  }

  // 3. 对未命中的股票调用 getStocksRealtimeBatch 批量请求（保留原有分批逻辑，BATCH_SIZE=50）
  const BATCH_SIZE = 50;
  const batches = [];
  if (needFetch.length <= BATCH_SIZE) {
    batches.push(needFetch);
  } else {
    for (let i = 0; i < needFetch.length; i += BATCH_SIZE) {
      batches.push(needFetch.slice(i, i + BATCH_SIZE));
    }
  }
  logger.info(`请求腾讯qt.gtimg.cn: ${needFetch.join(',')} (分${batches.length}批)`);

  const batchResults = await Promise.all(
    batches.map(b => getStocksRealtimeBatch(b).catch(() => ({})))
  );
  const fetchedMap = Object.assign({}, ...batchResults);

  // 4. 批量请求返回后，逐只写入缓存并合并到结果对象
  let writeCount = 0;
  for (const code of needFetch) {
    const quote = fetchedMap[code];
    if (quote) {
      // 写入单只股票独立缓存（type: stock_quote）
      globalCache.set(`stock_quote_${code}`, quote, 'stock_quote');
      result[code] = quote;
      writeCount++;
    }
  }

  logger.info(`完成: 请求${needFetch.length}只, 成功获取${writeCount}只, 失败${needFetch.length - writeCount}只`);

  return result;
}

async function getStocksRealtimeBatch(stockCodes) {
  if (!stockCodes || stockCodes.length === 0) return {};

  const qtCodes = stockCodes.map(c => `${getStockPrefix(c)}${c}`).join(',');
  try {
    const { data } = await axios.get(
      `http://qt.gtimg.cn/q=${qtCodes}`,
      { timeout: TIMEOUT, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    const result = {};
    const lines = data.split('\n').filter(l => l.includes('="'));
    for (const line of lines) {
      const codeMatch = line.match(/v_(?:sh|sz|hk|us)([0-9A-Z.]+)="(.+)"/);
      if (!codeMatch) continue;
      const stockCode = codeMatch[1];
      const fields = codeMatch[2].split('~');
      // fields: [1]name, [3]price, [4]yesterday, [31]change_amt, [32]change_pct
      result[stockCode] = {
        name: fields[1] || '',
        price: parseFloat(fields[3]) || 0,
        yesterdayClose: parseFloat(fields[4]) || 0,
        changePercent: parseFloat(fields[32]) || 0,
      };
    }
    return result;
  } catch (e) {
    return {};
  }
}

/* 【已废弃】死代码，被 getHoldingsEstimatedOverlay 替代，未导出。
async function getHoldingsEstimatedValue(fundCode) {
  const errors = [];

  // 获取持仓数据
  let holdings = [];
  try {
    holdings = await getFundHoldings(fundCode);
  } catch (e) { errors.push(`holdings_fetch: ${e.message}`); }

  if (!holdings.length) {
    // 无持仓数据时回退到腾讯接口
    const tencentResult = await getTencentValue(fundCode);
    if (tencentResult) return { ...tencentResult, source: 'holdings_fallback_tencent' };
    return null;
  }

  // 获取持仓股票实时行情
  const stockCodes = holdings.map(h => h.code);
  let stockQuotes = {};
  try {
    stockQuotes = await getStocksRealtime(stockCodes);
  } catch (e) { errors.push(`stocks_realtime: ${e.message}`); }

  // 计算加权涨跌幅
  let totalRatio = 0;
  let weightedChange = 0;

  for (const holding of holdings) {
    const quote = stockQuotes[holding.code];
    if (!quote || quote.changePercent === null || quote.changePercent === undefined) continue;

    weightedChange += quote.changePercent * holding.ratio;
    totalRatio += holding.ratio;
  }

  // 覆盖率太低则不可信
  const coverage = totalRatio; // 总占比即覆盖率
  if (coverage < 30) {
    // 覆盖率不足，回退到腾讯接口
    const tencentResult = await getTencentValue(fundCode);
    if (tencentResult) return { ...tencentResult, source: 'holdings_low_coverage', coverage };
    return null;
  }

  // 基于加权涨跌幅估算净值：需要前一日确认净值
  try {
    const today = getLocalToday();
    const threeDaysAgo = normalizeDateStr(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
    const { data } = await axios.get(
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=1&pageSize=1&startDate=${threeDaysAgo}&endDate=${today}`,
      { timeout: TIMEOUT, headers: defaultHeaders(`http://fundf10.eastmoney.com/jjjz_${fundCode}.html`) }
    );
    if (data && data.Data && data.Data.LSJZList && data.Data.LSJZList.length) {
      const latest = data.Data.LSJZList[0];
      const yesterdayNav = parseFloat(latest.DWJZ);

      if (!isNaN(yesterdayNav) && yesterdayNav > 0) {
        // 归一化加权涨跌幅（按实际覆盖率折算）
        const normalizedChange = totalRatio > 0
          ? parseFloat((weightedChange / totalRatio * coverage / 100).toFixed(2))
          : 0;
        const estimatedNav = parseFloat((yesterdayNav * (1 + normalizedChange / 100)).toFixed(4));

        return {
          netValue: estimatedNav,
          gainPercent: normalizedChange,
          updateTime: latest.FSRQ || '',
          source: 'holdings',
          coverage: parseFloat(coverage.toFixed(1)),
          holdingsCount: holdings.length,
        };
      }
    }
  } catch (e) { errors.push(`yesterday_nav: ${e.message}`); }

  return null;
}
*/

// ═══════════════════════════════════════════
// 盘中实时估算（天天基金移动端估值走势接口 - 新浪替代方案）
// fundmobapi.eastmoney.com 是天天基金APP使用的接口，不会403封禁
// 交易时段返回盘中分时估值数据，非交易时段返回空
// ═══════════════════════════════════════════
/* 【已废弃】实测(2026-07-23交易时段)总返回null，天天基金估值走势接口已不再提供盘中实时估值数据。
async function getFundgzEstimatedValue(fundCode) {
  try {
    const { data } = await axios.get(
      `https://fundmobapi.eastmoney.com/FundMApi/FundVarietieValuationDetail.ashx?FCODE=${fundCode}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_=${Date.now()}`,
      { timeout: TIMEOUT, headers: MOBILE_HEADERS }
    );

    if (!data?.Datas || !data.Datas.length) return null;

    const expansion = data.Expansion || {};
    // 取最后一条分时数据作为当前估值
    const lastItem = data.Datas[data.Datas.length - 1];
    const parts = lastItem.split(',');
    // parts: [0]时间, [1]估算净值, [2]估算涨跌幅
    const estimatedNav = parseFloat(parts[1]);
    const estimatedChange = parseFloat(parts[2]);
    const confirmedNav = parseFloat(expansion.DWJZ);

    if (!isNaN(estimatedNav) && estimatedNav > 0) {
      return {
        estimatedValue: estimatedNav,
        estimatedChange: !isNaN(estimatedChange) ? estimatedChange : null,
        estimationMethod: 'fundmobapi',
        netValue: !isNaN(confirmedNav) ? confirmedNav : null,
        updateTime: parts[0] || null,
      };
    }
  } catch (e) { // fall through }
  return null;
}
*/

// ═══════════════════════════════════════════
// 盘中实时估算（新浪财经接口 - 备用方案）
// 新浪提供基金盘中实时估值数据（含估算净值和估算涨幅）
// 注意：新浪接口对阿里云等服务器IP可能返回403
// ═══════════════════════════════════════════
async function getSinaEstimatedValue(fundCode) {
  logger.info(`${fundCode} 新浪接口估值`);
  // 先检测新浪接口是否可用（服务器IP可能被403封禁）
  if (!(await checkSinaAvailability())) return null;
  try {
    const { data } = await axios.get(`http://hq.sinajs.cn/list=fu_${fundCode}`, {
      timeout: TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
      },
      responseType: 'text',
    });
    const match = data.match(/hq_str_fu_\d+="(.+?)"/);
    if (!match) return null;
    const fields = match[1].split(',');
    // fields: [0]name, [1]time, [2]estimated_nav, [3]prev_nav, [6]change%, [7]date
    const dateStr = fields[7] || '';
    const timeStr = fields[1] || '';

    // 检查数据日期是否为今天
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (dateStr && dateStr !== todayStr) {
      return null;
    }

    const estimatedNav = parseFloat(fields[2]);
    const estimatedChange = parseFloat(fields[6]);

    if (!isNaN(estimatedNav) && estimatedNav > 0) {
      logger.info(`${fundCode} 新浪估值成功: change=${estimatedChange}%`);
      return {
        estimatedValue: estimatedNav,
        estimatedChange: !isNaN(estimatedChange) ? estimatedChange : null,
        estimationMethod: 'sina',
        updateTime: timeStr ? `${dateStr} ${timeStr}` : dateStr,
      };
    }
  } catch (e) { /* fall through */ }
  return null;
}

// ═══════════════════════════════════════════
// ETF/LOF场内实时行情（东方财富push2接口）
// ETF基金像股票一样在场内交易，持仓穿透法拿不到数据
// 但可以通过股票行情接口获取实时价格作为估值
// ═══════════════════════════════════════════
async function getETFRealtimeQuote(fundCode) {
  const cacheKey = `etf_quote_${fundCode}`; // ETF实时行情缓存
  return await globalCache.getOrFetch(cacheKey, async () => {
    // 东方财富push2接口（主要数据源）
  try {
    const market = fundCode.startsWith('15') || fundCode.startsWith('16') ? '0' : '1';
    logger.info(`${fundCode} ETF push2尝试...`);
    const { data } = await axios.get(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=${market}.${fundCode}&fields=f43,f44,f170`,
      { timeout: TIMEOUT, headers: defaultHeaders('https://quote.eastmoney.com/') }
    );
    if (data?.data) {
      const price = data.data.f43 / 1000;
      const changePercent = data.data.f170 / 100;
      if (!isNaN(price) && price > 0) {
        logger.info(`${fundCode} ETF push2成功: price=${price}, change=${changePercent}%`);
        return {
          estimatedValue: price,
          estimatedChange: changePercent,
          estimationMethod: 'etf_quote',
          updateTime: '',
        };
      } else {
        logger.warn(`${fundCode} ETF push2失败: 价格无效(${price}), 回退腾讯`);
      }
    } else {
      logger.warn(`${fundCode} ETF push2失败: 无data字段, 回退腾讯`);
    }
  } catch (e) {
    logger.warn(`${fundCode} ETF push2失败: ${e.message}, 回退腾讯`);
    /* fall through */
  }

  // 腾讯接口获取场内ETF实时行情
  // 沪市ETF: 51/56开头 → sh, 深市ETF: 15/16开头 → sz
  try {
    const prefix = fundCode.startsWith('15') || fundCode.startsWith('16') ? 'sz' : 'sh';
    const { data } = await axios.get(
      `http://qt.gtimg.cn/q=${prefix}${fundCode}`,
      { timeout: TIMEOUT, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, responseType: 'text' }
    );
    const line = data.split('\n').find(l => l.includes(`v_${prefix}`));
    if (line) {
      const content = line.split('="')[1]?.replace(/";$/, '');
      const fields = content?.split('~');
      // 腾讯字段: [1]名称 [3]当前价 [32]涨跌幅%
      const price = parseFloat(fields?.[3]);
      const changePercent = parseFloat(fields?.[32]);
      if (!isNaN(price) && price > 0) {
        return {
          estimatedValue: price,
          estimatedChange: !isNaN(changePercent) ? changePercent : null,
          estimationMethod: 'etf_quote',
          updateTime: '',
        };
      }
    }
  } catch (e) { /* fall through */ }

  // 备用：新浪接口获取场内ETF行情
  try {
    const prefix = fundCode.startsWith('15') || fundCode.startsWith('16') ? 'sz' : 'sh';
    const { data } = await axios.get(
      `http://hq.sinajs.cn/list=${prefix}${fundCode}`,
      { timeout: TIMEOUT, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://finance.sina.com.cn/' }, responseType: 'text' }
    );
    // 新浪格式: var hq_str_sz159516="名称,昨收,今开,当前价,最高,最低,..."
    const match = data.match(/="([^"]*)"/);
    if (match) {
      const fields = match[1].split(',');
      const price = parseFloat(fields[3]); // 当前价
      const prevClose = parseFloat(fields[2]); // 昨收
      if (!isNaN(price) && price > 0 && !isNaN(prevClose) && prevClose > 0) {
        const changePercent = parseFloat(((price - prevClose) / prevClose * 100).toFixed(2));
        return {
          estimatedValue: price,
          estimatedChange: changePercent,
          estimationMethod: 'etf_quote',
          updateTime: '',
        };
      }
    }
  } catch (e) { /* fall through */ }

  return null;
  }, { type: 'etf_quote' }); // ETF实时行情缓存（东方财富 push2 / 腾讯 / 新浪）
}

// 资产配置缓存（24小时）
const assetAllocCache = createTtlCache({ ttl: 24 * 60 * 60 * 1000 });

/**
 * 获取基金资产配置占比（股票/债券/现金/母ETF）
 * @param {string} fundCode 
 * @returns {Promise<{stockRatio: number, bondRatio: number, cashRatio: number, reportDate: string|null}|null>}
 */
async function getFundAssetAllocation(fundCode) {
  const now = Date.now();
  const cached = assetAllocCache.get(fundCode);
  if (cached && (now - cached.ts) < 24 * 60 * 60 * 1000) {
    logger.debug(`${fundCode} 资产配置命中缓存`);
    return cached.data;
  }

  try {
    const { data } = await axios.get(
      `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js`,
      { timeout: 8000, responseType: 'text' }
    );

    const match = data.match(/var\s+Data_assetAllocation\s*=\s*([^;]+);/);
    if (!match) {
      logger.warn(`${fundCode} pingzhongdata 无 Data_assetAllocation`);
      return null;
    }

    const allocData = JSON.parse(match[1]);
    const series = allocData.series || [];
    const categories = allocData.categories || [];
    const latestDate = categories.length > 0 ? categories[categories.length - 1] : null;

    let stockRatio = 0, bondRatio = 0, cashRatio = 0;
    for (const s of series) {
      const dataArr = s.data || [];
      const latestVal = dataArr.length > 0 ? dataArr[dataArr.length - 1] : 0;
      if (s.name === '股票占净比') stockRatio = parseFloat(latestVal) || 0;
      if (s.name === '债券占净比') bondRatio = parseFloat(latestVal) || 0;
      if (s.name === '现金占净比') cashRatio = parseFloat(latestVal) || 0;
    }

    const result = { stockRatio, bondRatio, cashRatio, reportDate: latestDate };
    assetAllocCache.set(fundCode, { data: result, ts: now });
    logger.info(`${fundCode} 资产配置: 股票=${stockRatio}% 债券=${bondRatio}% 现金=${cashRatio}% 报告期=${latestDate}`);
    return result;
  } catch (e) {
    logger.warn(`${fundCode} pingzhongdata 资产配置获取失败: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════
// 盘中实时估算（持仓穿透法）
// ═══════════════════════════════════════════



async function getHoldingsEstimatedOverlay(fundCode, confirmedNav, benchmarks = {}, options = {}) {
  logger.info(`${fundCode} 进入持仓穿透估值`);

  // 0. 仅 QDII/海外类型进入板块化/成分加权新分支；纯 A 股基金永远走原逻辑
  //    options: { isQDII: boolean, confirmedNavDate: string|null (确认净值日期 YYYY-MM-DD) }
  const isQdii = !!options.isQDII;

  // 1. 获取全部持仓 + 总股票仓位比例 + 报告期（QDII联接基金在 getFundHoldings 内递归母ETF成分）
  const { holdings, totalStockRatio, reportDate, etfCode } = await getFundHoldings(fundCode, isQdii);
  logger.info(`${fundCode} 持仓: ${holdings.length}只, 覆盖率=${totalStockRatio}%, 报告期=${reportDate}, etfCode=${etfCode || 'null'}`);

  // 2. 无持仓且非ETF联接基金 → 无法估值
  if (!holdings.length && !etfCode) {
    logger.warn(`${fundCode} 估算失败: 持仓为空 (非ETF联接基金)`);
    return null;
  }

  // 3. 获取所有持仓股票实时行情
  const stockCodes = holdings.length > 0 ? holdings.map(h => h.code) : [];
  const stockQuotes = stockCodes.length > 0 ? await getStocksRealtime(stockCodes) : {};

  // 统计成功的行情数
  let successCount = 0;
  for (const h of holdings) {
    const q = stockQuotes[h.code];
    if (q && q.changePercent != null) successCount++;
  }
  logger.info(`${fundCode} 行情: ${successCount}/${holdings.length}只成功`);

  // 3.5 板块识别（仅 QDII）：
  //     - 持仓含字母代码 → 美股方向（缺失用基金跟踪指数 usNDX/usINX/usDJI，按名称关键词映射）
  //     - 否则持仓含 5 位数字 → 港股方向（缺失用恒生指数 hkHSI）
  //     - 纯 A 股持仓（6 位数字）/ 非 QDII → 维持沪深300原逻辑
  const isUsFund = holdings.some(h => /^[A-Z]/.test(h.code));
  const isHkFund = !isUsFund && holdings.some(h => /^\d{5}$/.test(h.code));
  const usIndexCode = isUsFund ? getFundUsIndexCode(options.fundName) : null;

  // 3.6 美股增量规则（避免重复计入昨晚已计入确认净值的涨跌）：
  //     解析美股指数时间戳得最新美股交易日 T；比较确认净值日 D：
  //       D == T        → 美股部分增量 0（白天美股未开盘，最新变动已计入确认净值，估算恒定）
  //       D == T 的前一美股交易日 → 美股部分增量 = 最近交易日涨跌（确认净值尚未包含）
  //       D 更早         → 不叠加（回退展示最新确认净值）
  let usZeroed = false;
  let usIndexData = null;
  if (isQdii && isUsFund) {
    usIndexData = benchmarks?.usIndexMap?.[usIndexCode] || benchmarks?.usIndex || (await getIndexChange(usIndexCode).catch(() => null));
    const T = usIndexData?.date || null;
    const D = options.confirmedNavDate || null;
    usZeroed = !(D && T && String(D) === getPrevUsTradingDay(T)); // 仅 D==T的前一美股交易日时不禁用美股增量
    if (usIndexData) logger.info(`${fundCode} 板块指数=${usIndexCode} 美股交易日T=${T} 确认净值日D=${D} usZeroed=${usZeroed}`);
  }

  // 4. 计算已覆盖贡献 & 缺失股票权重（usZeroed 时美股个股权重增量置0）
  let coveredContribution = 0;
  let missingStockWeight = 0;

  for (const h of holdings) {
    const q = stockQuotes[h.code];
    if (q && q.changePercent != null) {
      const cp = (usZeroed && /^[A-Z]/.test(h.code)) ? 0 : q.changePercent;
      coveredContribution += h.ratio * cp;
    } else {
      missingStockWeight += h.ratio;
    }
  }

  // 5. 获取基准指数涨跌幅用于填补缺失股票 + 国债指数用于债券部分
  //    批量入口可传入已计算好的基准，避免每只基金重复请求
  //    QDII（仅）：美股方向缺失用纳斯达克100（usZeroed 时为0）、港股方向用恒生指数；非 QDII 维持沪深300
  let benchmarkReturn = 0;
  if (missingStockWeight > 0 || (isQdii && (isUsFund || isHkFund))) {
    if (isQdii && isUsFund) {
      benchmarkReturn = usZeroed ? 0 : (benchmarks?.usIndexMap?.[usIndexCode]?.changePercent ?? usIndexData?.changePercent ?? 0);
      logger.info(`${fundCode} 缺失股票权重=${missingStockWeight.toFixed(2)}%, ${usIndexCode}=${benchmarkReturn}%`);
    } else if (isQdii && isHkFund) {
      const hkIndexData = benchmarks.hkIndex || (await getIndexChange('hkHSI').catch(() => null));
      benchmarkReturn = hkIndexData?.changePercent ?? 0;
      logger.info(`${fundCode} 缺失股票权重=${missingStockWeight.toFixed(2)}%, 恒生指数=${benchmarkReturn}%`);
    } else if (missingStockWeight > 0) {
      benchmarkReturn = benchmarks.benchmarkReturn != null
        ? benchmarks.benchmarkReturn
        : await getBenchmarkChange();
      logger.info(`${fundCode} 缺失股票权重=${missingStockWeight.toFixed(2)}%, 沪深300=${benchmarkReturn}%`);
    }
  }
  const bondBenchmarkChange = benchmarks.bondBenchmarkChange != null
    ? benchmarks.bondBenchmarkChange
    : await getBondBenchmarkChange();

  // 6. 获取资产配置
  const assetAlloc = await getFundAssetAllocation(fundCode);

  let bondWeight = 0;
  let missingContribution = 0;
  let bondContribution = 0;
  let etfContribution = 0;
  // QDII ETF联接（已递归成分）时跳过基础公式，最终涨跌由"母ETF占比 × 母ETF成分加权变动"给出
  let etfConstituentFinal = false;

  // ETF联接基金：用资产配置区分债券/现金/母ETF
  if (etfCode && assetAlloc) {
    const { stockRatio, bondRatio, cashRatio } = assetAlloc;
    const etfWeight = Math.max(0, 100 - stockRatio - bondRatio - cashRatio); // 母ETF占比

    if (isQdii && holdings.length > 0) {
      // QDII ETF联接（已递归母ETF成分）：主导 = 成分加权 + 板块指数补缺
      // 母ETF变动 ≈ (已覆盖成分 + 缺失成分×板块指数 + 母ETF内非披露部分×板块指数) / 100
      // 联接基金变动 = 母ETF占比 × 母ETF变动（替代场内价折溢价口径）
      const etfBondWeight = Math.max(0, 100 - totalStockRatio);
      const etfChange = (coveredContribution + missingStockWeight * benchmarkReturn + etfBondWeight * benchmarkReturn) / 100;
      etfContribution = etfWeight * etfChange;
      etfConstituentFinal = true;
      logger.info(`${fundCode} QDII联接成分加权: 母ETF=${etfCode} 变动=${etfChange.toFixed(2)}% 占比=${etfWeight.toFixed(2)}%`);
    } else {
      // A 股 ETF 联接 / QDII 联接递归失败：维持原"母ETF场内价"逻辑
      bondWeight = bondRatio;
      missingContribution = missingStockWeight * benchmarkReturn;
      bondContribution = bondWeight * bondBenchmarkChange;

      // 母ETF贡献
      if (etfWeight > 0) {
        const etfQuote = await getETFRealtimeQuote(etfCode).catch(() => null);
        if (etfQuote && etfQuote.estimatedChange != null) {
          etfContribution = etfWeight * etfQuote.estimatedChange;
          logger.info(`${fundCode} 母ETF=${etfCode} 涨跌幅=${etfQuote.estimatedChange}% 占比=${etfWeight.toFixed(2)}%`);
        } else {
          logger.warn(`${fundCode} 母ETF行情获取失败: etfCode=${etfCode}`);
        }
      }
    }
  } else if (etfCode && !assetAlloc) {
    // 资产配置获取失败，近似处理：母ETF涨跌幅 × 100%
    logger.warn(`${fundCode} 资产配置获取失败，回退母ETF近似估值`);
    const etfQuote = await getETFRealtimeQuote(etfCode).catch(() => null);
    if (etfQuote && etfQuote.estimatedChange != null) {
      logger.info(`${fundCode} ETF联接近似估值完成: change=${etfQuote.estimatedChange}%`);
      return {
        estimatedValue: null,
        estimatedChange: parseFloat(etfQuote.estimatedChange.toFixed(2)),
        estimationMethod: 'holdings',
        estimationCoverage: 100,
        estimationHoldingsCount: holdings.length,
        dataReportDate: reportDate,
      };
    }
    return null;
  } else {
    // 普通基金
    bondWeight = Math.max(0, 100 - totalStockRatio);
    missingContribution = missingStockWeight * benchmarkReturn;
    // QDII 缺失/非披露部分与板块指数高度相关，用板块指数而非国债指数；非 QDII 维持国债
    bondContribution = isQdii && (isUsFund || isHkFund) ? bondWeight * benchmarkReturn : bondWeight * bondBenchmarkChange;
  }

  logger.info(`${fundCode} 贡献: 股票已覆盖=${coveredContribution.toFixed(2)} 缺失股票=${missingContribution.toFixed(2)} 债券=${bondContribution.toFixed(2)}${etfCode ? ` 母ETF=${etfContribution.toFixed(2)}` : ''}`);
  
  // 7. 新公式：精确计算各组成部分贡献
  const estimatedChange = etfConstituentFinal
    ? etfContribution / 100
    : (coveredContribution + missingContribution + bondContribution + etfContribution) / 100;

  // 8. 计算估算价格
  //    若调用方提供了 confirmedNav（正数），直接使用，跳过 lsjz 调用（避免冗余请求）
  if (typeof confirmedNav === 'number' && confirmedNav > 0) {
    logger.info(`${fundCode} 估值成功: method=holdings, change=${estimatedChange.toFixed(2)}%, coverage=${totalStockRatio}%`);
    return {
      estimatedValue: parseFloat((confirmedNav * (1 + estimatedChange / 100)).toFixed(4)),
      estimatedChange: parseFloat(estimatedChange.toFixed(2)),
      estimationMethod: 'holdings',
      estimationCoverage: etfCode ? 100 : parseFloat(totalStockRatio.toFixed(1)),
      estimationHoldingsCount: holdings.length,
      dataReportDate: reportDate,
    };
  }

  // 9. confirmedNav 不可用 → 回退到 lsjz API 获取昨日净值
  try {
    const today = getLocalToday();
    const threeDaysAgo = normalizeDateStr(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
    const { data } = await axios.get(
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=1&pageSize=1&startDate=${threeDaysAgo}&endDate=${today}`,
      { timeout: TIMEOUT, headers: defaultHeaders(`http://fundf10.eastmoney.com/jjjz_${fundCode}.html`) }
    );
    if (data?.Data?.LSJZList?.length) {
      const yesterdayNav = parseFloat(data.Data.LSJZList[0].DWJZ);
      if (!isNaN(yesterdayNav) && yesterdayNav > 0) {
        logger.info(`${fundCode} 估值成功: method=holdings, change=${estimatedChange.toFixed(2)}%, coverage=${totalStockRatio}%`);
        return {
          estimatedValue: parseFloat((yesterdayNav * (1 + estimatedChange / 100)).toFixed(4)),
          estimatedChange: parseFloat(estimatedChange.toFixed(2)),
          estimationMethod: 'holdings',
          estimationCoverage: etfCode ? 100 : parseFloat(totalStockRatio.toFixed(1)),
          estimationHoldingsCount: holdings.length,
          dataReportDate: reportDate,
        };
      }
    }
  } catch (e) {
    logger.warn(`${fundCode} lsjz调用失败: ${e.message}`);
  }

  // 10. lsjz 失败或返回空，但 estimatedChange 已成功计算 → 返回部分结果（不丢弃 estimatedChange）
  logger.warn(`${fundCode} 估算失败: 无法获取昨日净值，返回部分结果(estimatedChange only)`);
  return {
    estimatedValue: null,
    estimatedChange: parseFloat(estimatedChange.toFixed(2)),
    estimationMethod: 'holdings',
    estimationCoverage: etfCode ? 100 : parseFloat(totalStockRatio.toFixed(1)),
    estimationHoldingsCount: holdings.length,
    dataReportDate: reportDate,
  };
}

// ═══════════════════════════════════════════
// 统一入口：确认净值（东方财富）+ 盘中估算（新浪/持仓穿透）
// method: 'sina' | 'holdings'（控制盘中估算方式，两个数据源互不回退）
// ═══════════════════════════════════════════
async function getRealTimeValueWithMethod(fundCode, method = 'sina', options = {}) {
  logger.info(`${fundCode} 估值入口 method=${method}`);

  // 获取东方财富确认净值作为基准
  const confirmed = await getRealTimeValue(fundCode).catch(() => null);
  logger.info(`${fundCode} 确认净值=${confirmed?.netValue ?? 'null'}`);

  // 根据用户选择的数据源获取盘中估算
  // 透传 QDII 标记、基金名称（指数按名称关键词映射）与确认净值日期（美股增量规则需要 D）
  const overlayOptions = {
    isQDII: !!options.isQDII,
    fundName: options.fundName || '',
    confirmedNavDate: confirmed?.updateTime || null,
  };
  let estimated = null;
  if (method === 'holdings') {
    // 持仓穿透法：股票持仓加权计算 + ETF联接基金母ETF估值
    estimated = await getHoldingsEstimatedOverlay(fundCode, confirmed?.netValue, {}, overlayOptions).catch(() => null);
  } else if (method === 'auto') {
    // 自动模式：先尝试新浪，失败回退持仓穿透
    estimated = await getSinaEstimatedValue(fundCode).catch(() => null);
    if (!estimated) {
      logger.info(`${fundCode} 新浪失败，回退持仓穿透`);
      estimated = await getHoldingsEstimatedOverlay(fundCode, confirmed?.netValue, {}, overlayOptions).catch(() => null);
    }
  } else {
    // 新浪财经盘中估值
    estimated = await getSinaEstimatedValue(fundCode).catch(() => null);
  }

  logger.info(`${fundCode} 结果: method=${estimated?.estimationMethod ?? method}, change=${estimated?.estimatedChange ?? 'null'}`);

  // 合并：确认净值 + 估算值
  const result = {
    netValue: confirmed?.netValue ?? null,
    gainPercent: confirmed?.gainPercent ?? null,
    updateTime: confirmed?.updateTime ?? null,
    // 盘中估算覆盖字段
    estimatedValue: estimated?.estimatedValue ?? null,
    estimatedChange: estimated?.estimatedChange ?? null,
    estimationMethod: estimated?.estimationMethod ?? method,
    estimationCoverage: estimated?.estimationCoverage ?? null,
    estimationHoldingsCount: estimated?.estimationHoldingsCount ?? null,
  };

  return result;
}

// ═══════════════════════════════════════════
// 批量接口 - 一次请求获取多只基金数据，大幅减少外部API调用次数
// ═══════════════════════════════════════════

/**
 * 批量获取基金信息（天天基金移动端API - 1次请求替代N次！）
 * fundmobapi.eastmoney.com 是天天基金APP使用的接口，支持批量查询
 * 返回每只基金的最新净值、涨跌幅等
 */
async function batchGetFundmobapiInfo(fundCodes) {
  const result = {};
  if (!fundCodes || !fundCodes.length) return result;

  try {
    const codesParam = fundCodes.join(',');
    const { data } = await axios.get(
      `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=200&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=Wap&Fcodes=${codesParam}`,
      { timeout: 5000, headers: MOBILE_HEADERS }
    );

    if (data?.Datas) {
      for (const d of data.Datas) {
        const nav = parseFloat(d.NAV);
        const changeRate = parseFloat(d.NAVCHGRT);
        const gsz = parseFloat(d.GSZ);
        const gszzl = parseFloat(d.GSZZL);
        result[d.FCODE] = {
          // 确认净值
          netValue: !isNaN(nav) ? nav : null,
          gainPercent: !isNaN(changeRate) ? changeRate : null,
          updateTime: d.PDATE || null,
          name: d.SHORTNAME || null,
          type: d.FTYPE || null,
          // 盘中实时估值（交易时段有值，非交易时段为空）
          estimatedValue: !isNaN(gsz) && gsz > 0 ? gsz : null,
          estimatedChange: !isNaN(gszzl) ? gszzl : null,
          estimationMethod: (!isNaN(gsz) && gsz > 0) ? 'fundmobapi' : null,
          estimateTime: d.GZTIME || null,
        };
      }
    }
  } catch (e) {
    logger.error(`fundmobapi批量获取失败(${fundCodes.length}只): ${e.message}`);
  }

  // 补 null
  for (const code of fundCodes) {
    if (!(code in result)) {
      result[code] = null;
    }
  }

  return result;
}

/**
 * 批量获取fundgz盘中估值（天天基金官方估值接口）
 * fundgz不支持批量，需逐个请求，但响应极快（~100ms/只）
 */
/* 【已废弃】依赖 getFundgzEstimatedValue，该接口已不可用。
async function batchGetFundgzEstimatedValues(fundCodes) {
  const result = {};
  if (!fundCodes || !fundCodes.length) return result;

  const promises = fundCodes.map(async (code) => {
    try {
      const data = await getFundgzEstimatedValue(code);
      return { code, data };
    } catch (e) {
      return { code, data: null };
    }
  });

  const responses = await Promise.allSettled(promises);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  for (const resp of responses) {
    if (resp.status === 'fulfilled' && resp.value.data) {
      const { code, data } = resp.value;
      // 只保留今天的数据
      if (data.updateTime && data.updateTime.includes(todayStr)) {
        result[code] = data;
      } else {
        result[code] = null;
      }
    } else if (resp.status === 'fulfilled') {
      result[resp.value.code] = null;
    }
  }

  // 补 null
  for (const code of fundCodes) {
    if (!(code in result)) {
      result[code] = null;
    }
  }

  return result;
}
*/

/**
 * 批量获取新浪盘中估值
 * 新浪接口支持一次查询多只基金：hq.sinajs.cn/list=fu_001234,fu_005678
 * 原来N只基金需要N次请求，现在只需1次
 */
async function batchGetSinaEstimatedValues(fundCodes) {
  const result = {};
  if (!fundCodes || !fundCodes.length) return result;

  // 先检测新浪接口是否可用（服务器IP可能被403封禁）
  if (!(await checkSinaAvailability())) {
    for (const code of fundCodes) result[code] = null;
    return result;
  }

  try {
    // 新浪支持逗号分隔的批量查询
    const codesParam = fundCodes.map(c => `fu_${c}`).join(',');
    const { data } = await axios.get(`http://hq.sinajs.cn/list=${codesParam}`, {
      timeout: 4000, // 批量请求稍长一点
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
      },
      responseType: 'text',
    });

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // 解析每行数据
    const lines = data.split('\n').filter(l => l.includes('="'));
    for (const line of lines) {
      const codeMatch = line.match(/hq_str_fu_(\d+)="(.+?)"/);
      if (!codeMatch) continue;
      const fundCode = codeMatch[1];
      const content = codeMatch[2];
      if (!content) continue;

      const fields = content.split(',');
      const dateStr = fields[7] || '';
      const timeStr = fields[1] || '';

      // 检查数据日期是否为今天
      if (dateStr && dateStr !== todayStr) {
        result[fundCode] = null;
        continue;
      }

      const estimatedNav = parseFloat(fields[2]);
      const estimatedChange = parseFloat(fields[6]);

      if (!isNaN(estimatedNav) && estimatedNav > 0) {
        result[fundCode] = {
          estimatedValue: estimatedNav,
          estimatedChange: !isNaN(estimatedChange) ? estimatedChange : null,
          estimationMethod: 'sina',
          updateTime: timeStr ? `${dateStr} ${timeStr}` : dateStr,
        };
      } else {
        result[fundCode] = null;
      }
    }
  } catch (e) {
    logger.error(`批量新浪估值失败(${fundCodes.length}只): ${e.message}`);
  }

  // 对未获取到数据的基金补 null
  for (const code of fundCodes) {
    if (!(code in result)) {
      result[code] = null;
    }
  }

  return result;
}

/**
 * 批量获取确认净值（东方财富API不支持批量，改为并行请求）
 * 相比逐个串行等待8秒超时，并行请求总耗时仅为最慢的那个
 */
async function batchGetRealTimeValues(fundCodes) {
  const result = {};
  if (!fundCodes || !fundCodes.length) return result;

  const promises = fundCodes.map(async (fundCode) => {
    try {
      const data = await getRealTimeValue(fundCode);
      return { fundCode, data };
    } catch (e) {
      return { fundCode, data: null };
    }
  });

  const responses = await Promise.allSettled(promises);
  for (const resp of responses) {
    if (resp.status === 'fulfilled') {
      result[resp.value.fundCode] = resp.value.data;
    }
  }

  // 补 null
  for (const code of fundCodes) {
    if (!(code in result)) {
      result[code] = null;
    }
  }

  return result;
}

/**
 * 批量获取历史净值（并行请求）
 */
async function batchGetHistoryNetValues(fundCodes, startDate, endDate) {
  const result = {};
  if (!fundCodes || !fundCodes.length) return result;

  const promises = fundCodes.map(async (fundCode) => {
    try {
      const data = await getHistoryNetValues(fundCode, startDate, endDate);
      return { fundCode, data: data || [] };
    } catch (e) {
      return { fundCode, data: [] };
    }
  });

  const responses = await Promise.allSettled(promises);
  for (const resp of responses) {
    if (resp.status === 'fulfilled') {
      result[resp.value.fundCode] = resp.value.data;
    }
  }

  // 补空数组
  for (const code of fundCodes) {
    if (!(code in result)) {
      result[code] = [];
    }
  }

  return result;
}

/**
 * 批量获取基准涨跌幅（沪深300 + 国债指数 + 按需 us/hk 指数），供多只基金复用
 * @param {boolean} needsUsHk 批量列表是否含 QDII/跨市场基金——纯 A 股批量不请求 us/hk 指数
 */
async function getBenchmarks(needsUsHk = false) {
  const tasks = [
    getBenchmarkChange().catch(() => 0),
    getBondBenchmarkChange().catch(() => 0),
  ];
  if (needsUsHk) {
    // 美股板块指数全量预取（usNDX/usINX/usDJI + 恒生），单次批量内去向固定
    tasks.push(getIndexChange('usNDX').catch(() => null));
    tasks.push(getIndexChange('usINX').catch(() => null));
    tasks.push(getIndexChange('usDJI').catch(() => null));
    tasks.push(getIndexChange('hkHSI').catch(() => null));
  }
  const [benchmarkReturn, bondBenchmarkChange, usNDX, usINX, usDJI, hkIndex] = await Promise.all(tasks);
  return {
    benchmarkReturn,
    bondBenchmarkChange,
    usIndex: usNDX,
    usIndexMap: { usNDX, usINX, usDJI }, // 供按基金名称映射的指数选择
    hkIndex,
  };
}

/**
 * 批量统一入口：确认净值 + 盘中估算
 * fundmobapi 仅用于批量获取确认净值（NAV, NAVCHGRT）
 * 盘中估算根据 method 选择数据源，两个数据源互不回退
 * 返回 { fundCode: { netValue, gainPercent, estimatedValue, estimatedChange, ... } }
 */
async function batchGetRealTimeValuesWithMethod(fundCodes, method = 'sina', options = {}) {
  logger.info(`批量估值入口 count=${fundCodes.length} method=${method}`);
  const result = {};
  if (!fundCodes || !fundCodes.length) return result;

  // 调用方传入 QDII 标记映射（{ code: boolean }）与基金名称映射（{ code: name }，指数按名称映射）
  const isQdiiMap = options.isQdiiMap || {};
  const fundNameMap = options.fundNameMap || {};
  const needsUsHk = fundCodes.some(c => isQdiiMap[c]);

  const startTime = Date.now();

  // 1. fundmobapi 批量获取确认净值
  const mobapiMap = await batchGetFundmobapiInfo(fundCodes);

  // 2. 根据 method 批量获取盘中估算
  let estimatedMap = {};
  if (method === 'holdings') {
    // 持仓穿透法：并行调用
    // 基准涨跌幅只计算一次，供所有基金复用，避免每只基金重复请求
    const benchmarks = await getBenchmarks(needsUsHk);
    const promises = fundCodes.map(async (code) => {
      try {
        return { code, data: await getHoldingsEstimatedOverlay(code, mobapiMap[code]?.netValue, benchmarks, {
          isQDII: !!isQdiiMap[code],
          fundName: fundNameMap[code] || '',
          confirmedNavDate: mobapiMap[code]?.updateTime || null,
        }) };
      } catch { return { code, data: null }; }
    });
    const responses = await Promise.allSettled(promises);
    for (const resp of responses) {
      if (resp.status === 'fulfilled') estimatedMap[resp.value.code] = resp.value.data;
    }
  } else if (method === 'auto') {
    // 自动模式：先批量新浪，对失败的逐个回退持仓穿透
    estimatedMap = await batchGetSinaEstimatedValues(fundCodes);
    const fallbackCodes = fundCodes.filter(code => !estimatedMap[code]);
    if (fallbackCodes.length) {
      logger.info(`${fallbackCodes.length}只基金回退持仓穿透`);
      const benchmarks = await getBenchmarks(needsUsHk);
      const fallbackPromises = fallbackCodes.map(async (code) => {
        try {
          return { code, data: await getHoldingsEstimatedOverlay(code, mobapiMap[code]?.netValue, benchmarks, {
            isQDII: !!isQdiiMap[code],
            fundName: fundNameMap[code] || '',
            confirmedNavDate: mobapiMap[code]?.updateTime || null,
          }) };
        } catch { return { code, data: null }; }
      });
      const responses = await Promise.allSettled(fallbackPromises);
      for (const resp of responses) {
        if (resp.status === 'fulfilled' && resp.value.data) {
          estimatedMap[resp.value.code] = resp.value.data;
        }
      }
    }
  } else {
    // 新浪批量获取
    estimatedMap = await batchGetSinaEstimatedValues(fundCodes);
  }

  // 3. 合并结果（不互相回退）
  for (const fundCode of fundCodes) {
    const mobapi = mobapiMap[fundCode] || null;
    const estimated = estimatedMap[fundCode] || null;

    result[fundCode] = {
      netValue: mobapi?.netValue ?? null,
      gainPercent: mobapi?.gainPercent ?? null,
      updateTime: mobapi?.updateTime ?? null,
      estimatedValue: estimated?.estimatedValue ?? null,
      estimatedChange: estimated?.estimatedChange ?? null,
      estimationMethod: estimated?.estimationMethod ?? method,
      estimationCoverage: estimated?.estimationCoverage ?? null,
      estimationHoldingsCount: estimated?.estimationHoldingsCount ?? null,
    };
  }

  // 补 null
  for (const code of fundCodes) {
    if (!(code in result)) {
      result[code] = {
        netValue: null, gainPercent: null, updateTime: null,
        estimatedValue: null, estimatedChange: null,
        estimationMethod: method, estimationCoverage: null, estimationHoldingsCount: null,
      };
    }
  }

  const duration = Date.now() - startTime;
  const hasEstimate = Object.values(result).filter(r => r.estimatedValue).length;
  logger.info(`批量获取${fundCodes.length}只基金数据完成, 耗时${duration}ms (估值:${hasEstimate}/${fundCodes.length})`);

  return result;
}

module.exports = {
  getRealTimeValue,
  getRealTimeValueWithMethod,
  getSinaEstimatedValue,
  getHoldingsEstimatedOverlay,
  getHistoryNetValues,
  getFundInfo,
  getAllFunds,
  // 批量接口
  batchGetSinaEstimatedValues,
  batchGetFundmobapiInfo,
  batchGetRealTimeValues,
  batchGetRealTimeValuesWithMethod,
  batchGetHistoryNetValues,
};