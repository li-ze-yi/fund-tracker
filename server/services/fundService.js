const axios = require('axios');

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
      console.log(`[fundService] 新浪接口不可用(HTTP ${status})，已跳过所有新浪请求`);
    }
    return sinaAvailable;
  } catch (e) {
    sinaAvailable = false;
    sinaCheckTime = now;
    console.log(`[fundService] 新浪接口不可用(${e.message})，已跳过所有新浪请求`);
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
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
            updateTime: latest.x ? new Date(latest.x).toISOString().slice(0, 10) : '',
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
    const edate = endDate || new Date().toISOString().slice(0, 10);
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
const holdingsCache = new Map();

function getStockPrefix(code) {
  return code.startsWith('6') ? 'sh' : 'sz';
}

async function getFundHoldings(fundCode) {
  const now = Date.now();
  const cached = holdingsCache.get(fundCode);
  if (cached && (now - cached.ts) < 4 * 60 * 60 * 1000) {
    return cached.data;
  }

  try {
    const { data } = await axios.get(
      `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${fundCode}&topline=10`,
      {
        timeout: TIMEOUT,
        headers: defaultHeaders(`http://fundf10.eastmoney.com/ccmx_${fundCode}.html`),
      }
    );
    // 解析 HTML table 中的持仓数据
    const tbodyMatch = data.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) return [];

    const rows = tbodyMatch[1].match(/<tr>[\s\S]*?<\/tr>/g) || [];
    const holdings = [];

    for (const row of rows) {
      const tdMatch = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
      if (!tdMatch || tdMatch.length < 8) continue;

      const stockCode = tdMatch[1].replace(/<[^>]+>/g, '').trim();
      const stockName = tdMatch[2].replace(/<[^>]+>/g, '').trim();
      const ratioStr = tdMatch[6].replace(/<[^>]+>/g, '').trim().replace('%', '');

      if (!stockCode || stockCode.length !== 6 || !/^\d+$/.test(stockCode)) continue;

      const ratio = parseFloat(ratioStr);
      if (isNaN(ratio) || ratio <= 0) continue;

      holdings.push({ code: stockCode, name: stockName, ratio });
    }

    holdingsCache.set(fundCode, { data: holdings, ts: now });
    return holdings;
  } catch (e) {
    return [];
  }
}

async function getStocksRealtime(stockCodes) {
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
      const codeMatch = line.match(/v_(?:sh|sz)(\d+)="(.+)"/);
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
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
  // 腾讯接口获取场内ETF实时行情（push2.eastmoney.com 已不可用，socket hang up）
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
}

// ═══════════════════════════════════════════
// ETF联接基金估值（通过母ETF实时行情估算）
// ETF联接基金持仓是母ETF而非个股，持仓穿透法不适用
// 方案：通过天天基金持仓接口获取母ETF代码 → 获取母ETF实时涨跌幅 → 估算净值
// ═══════════════════════════════════════════
const etfLinkageCache = new Map(); // 母ETF代码缓存（TTL 24小时）

/**
 * 通过基金代码获取母ETF场内代码
 * 使用天天基金APP持仓接口 FundMNInverstPosition，返回 ETFCODE 字段
 */
async function getUnderlyingETFCode(fundCode) {
  const now = Date.now();
  const cached = etfLinkageCache.get(fundCode);
  if (cached && (now - cached.ts) < 24 * 60 * 60 * 1000) {
    return cached.code;
  }

  try {
    const { data } = await axios.get(
      `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?FCODE=${fundCode}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0`,
      { timeout: TIMEOUT, headers: MOBILE_HEADERS }
    );
    if (data?.Datas?.ETFCODE) {
      const etfCode = data.Datas.ETFCODE;
      etfLinkageCache.set(fundCode, { code: etfCode, ts: now });
      return etfCode;
    }
  } catch (e) { /* fall through */ }

  return null;
}

/**
 * ETF联接基金盘中估值：通过母ETF实时涨跌幅估算
 * 1. 获取母ETF代码（天天基金持仓接口，缓存24小时）
 * 2. 获取母ETF实时行情（东方财富push2接口）
 * 3. 用母ETF涨跌幅 + 昨日确认净值 计算估算净值
 */
async function getETFBasedEstimatedValue(fundCode) {
  const etfCode = await getUnderlyingETFCode(fundCode);
  if (!etfCode) return null;

  // 获取母ETF实时行情（复用getETFRealtimeQuote）
  const etfQuote = await getETFRealtimeQuote(etfCode).catch(() => null);
  if (!etfQuote || etfQuote.estimatedChange == null) return null;

  const changePercent = etfQuote.estimatedChange;

  // 获取昨日确认净值，计算估算净值
  let estimatedValue = null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data } = await axios.get(
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=1&pageSize=1&startDate=${threeDaysAgo}&endDate=${today}`,
      { timeout: TIMEOUT, headers: defaultHeaders(`http://fundf10.eastmoney.com/jjjz_${fundCode}.html`) }
    );
    if (data?.Data?.LSJZList?.length) {
      const yesterdayNav = parseFloat(data.Data.LSJZList[0].DWJZ);
      if (!isNaN(yesterdayNav) && yesterdayNav > 0) {
        estimatedValue = parseFloat((yesterdayNav * (1 + changePercent / 100)).toFixed(4));
      }
    }
  } catch (e) { /* fall through */ }

  return {
    estimatedValue,
    estimatedChange: changePercent,
    estimationMethod: 'etf_linkage',
    estimationCoverage: 100,
  };
}

// ═══════════════════════════════════════════
// 盘中实时估算（持仓穿透法）
// ═══════════════════════════════════════════
async function getHoldingsEstimatedOverlay(fundCode) {
  const holdings = await getFundHoldings(fundCode);
  if (!holdings.length) {
    // 无股票持仓 → 尝试ETF联接基金估值（通过母ETF行情）
    return getETFBasedEstimatedValue(fundCode);
  }

  // 获取持仓股票实时行情
  const stockCodes = holdings.map(h => h.code);
  const stockQuotes = await getStocksRealtime(stockCodes);

  // 计算加权涨跌幅
  let totalRatio = 0;
  let weightedChange = 0;

  for (const holding of holdings) {
    const quote = stockQuotes[holding.code];
    if (!quote || quote.changePercent == null) continue;
    weightedChange += quote.changePercent * holding.ratio;
    totalRatio += holding.ratio;
  }

  if (totalRatio < 30) {
    // 覆盖率不足 → 返回null，不回退到其他数据源
    return null;
  }

  // 基于加权涨跌幅估算净值
  try {
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data } = await axios.get(
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=1&pageSize=1&startDate=${threeDaysAgo}&endDate=${today}`,
      { timeout: TIMEOUT, headers: defaultHeaders(`http://fundf10.eastmoney.com/jjjz_${fundCode}.html`) }
    );
    if (data?.Data?.LSJZList?.length) {
      const yesterdayNav = parseFloat(data.Data.LSJZList[0].DWJZ);
      if (!isNaN(yesterdayNav) && yesterdayNav > 0) {
        const normalizedChange = totalRatio > 0
          ? parseFloat((weightedChange / totalRatio).toFixed(2))
          : 0;
        const estimatedNav = parseFloat((yesterdayNav * (1 + normalizedChange / 100)).toFixed(4));

        return {
          estimatedValue: estimatedNav,
          estimatedChange: normalizedChange,
          estimationMethod: 'holdings',
          estimationCoverage: parseFloat(totalRatio.toFixed(1)),
          estimationHoldingsCount: holdings.length,
        };
      }
    }
  } catch (e) { /* fall through */ }

  return null;
}

// ═══════════════════════════════════════════
// 统一入口：确认净值（东方财富）+ 盘中估算（新浪/持仓穿透）
// method: 'sina' | 'holdings'（控制盘中估算方式，两个数据源互不回退）
// ═══════════════════════════════════════════
async function getRealTimeValueWithMethod(fundCode, method = 'sina') {
  // 获取东方财富确认净值作为基准
  const confirmed = await getRealTimeValue(fundCode).catch(() => null);

  // 根据用户选择的数据源获取盘中估算
  let estimated = null;
  if (method === 'holdings') {
    // 持仓穿透法：股票持仓加权计算 + ETF联接基金母ETF估值
    estimated = await getHoldingsEstimatedOverlay(fundCode).catch(() => null);
  } else if (method === 'auto') {
    // 自动模式：先尝试新浪，失败回退持仓穿透
    estimated = await getSinaEstimatedValue(fundCode).catch(() => null);
    if (!estimated) {
      estimated = await getHoldingsEstimatedOverlay(fundCode).catch(() => null);
    }
  } else {
    // 新浪财经盘中估值
    estimated = await getSinaEstimatedValue(fundCode).catch(() => null);
  }

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
    console.error(`[fundService] fundmobapi批量获取失败(${fundCodes.length}只):`, e.message);
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
    console.error(`[fundService] 批量新浪估值失败(${fundCodes.length}只):`, e.message);
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
 * 批量统一入口：确认净值 + 盘中估算
 * fundmobapi 仅用于批量获取确认净值（NAV, NAVCHGRT）
 * 盘中估算根据 method 选择数据源，两个数据源互不回退
 * 返回 { fundCode: { netValue, gainPercent, estimatedValue, estimatedChange, ... } }
 */
async function batchGetRealTimeValuesWithMethod(fundCodes, method = 'sina') {
  const result = {};
  if (!fundCodes || !fundCodes.length) return result;

  const startTime = Date.now();

  // 1. fundmobapi 批量获取确认净值
  const mobapiMap = await batchGetFundmobapiInfo(fundCodes);

  // 2. 根据 method 批量获取盘中估算
  let estimatedMap = {};
  if (method === 'holdings') {
    // 持仓穿透法：并行调用
    const promises = fundCodes.map(async (code) => {
      try { return { code, data: await getHoldingsEstimatedOverlay(code) }; }
      catch { return { code, data: null }; }
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
      const fallbackPromises = fallbackCodes.map(async (code) => {
        try { return { code, data: await getHoldingsEstimatedOverlay(code) }; }
        catch { return { code, data: null }; }
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
  console.log(`[fundService] 批量获取${fundCodes.length}只基金数据完成, 耗时${duration}ms (估值:${hasEstimate}/${fundCodes.length})`);

  return result;
}

module.exports = {
  getRealTimeValue,
  getRealTimeValueWithMethod,
  getSinaEstimatedValue,
  getHoldingsEstimatedOverlay,
  getETFBasedEstimatedValue,
  getUnderlyingETFCode,
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