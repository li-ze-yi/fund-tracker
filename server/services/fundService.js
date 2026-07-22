const axios = require('axios');

const TIMEOUT = 8000;

function defaultHeaders(referer) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': referer || 'https://fund.eastmoney.com/',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
}

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
  } catch (e) { /* fall through */ }
  return null;
}

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

// ═══════════════════════════════════════════
// 盘中实时估算（新浪财经接口）
// 新浪提供基金盘中实时估值数据（含估算净值和估算涨幅）
// ═══════════════════════════════════════════
async function getSinaEstimatedValue(fundCode) {
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
// 盘中实时估算（持仓穿透法）
// ═══════════════════════════════════════════
async function getHoldingsEstimatedOverlay(fundCode) {
  const holdings = await getFundHoldings(fundCode);
  if (!holdings.length) {
    // 无持仓数据 → 回退到新浪估算
    return getSinaEstimatedValue(fundCode);
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
    // 覆盖率不足 → 回退到新浪估算
    return getSinaEstimatedValue(fundCode);
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
          ? parseFloat((weightedChange / totalRatio * totalRatio / 100).toFixed(2))
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
// method: 'sina' | 'holdings'（仅控制盘中估算方式）
// ═══════════════════════════════════════════
async function getRealTimeValueWithMethod(fundCode, method = 'sina') {
  // 始终获取东方财富确认净值作为基准
  const confirmed = await getRealTimeValue(fundCode).catch(() => null);

  // 获取盘中实时估算（根据选定方法）
  let estimated = null;
  if (method === 'holdings') {
    estimated = await getHoldingsEstimatedOverlay(fundCode).catch(() => null);
  } else {
    // 新浪财经接口提供盘中实时估值
    estimated = await getSinaEstimatedValue(fundCode).catch(() => null);
    // 新浪接口未返回数据 → 回退到持仓穿透法
    if (!estimated) {
      estimated = await getHoldingsEstimatedOverlay(fundCode).catch(() => null);
    }
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

module.exports = {
  getRealTimeValue,
  getRealTimeValueWithMethod,
  getSinaEstimatedValue,
  getHoldingsEstimatedOverlay,
  getHistoryNetValues,
  getFundInfo,
  getAllFunds,
};