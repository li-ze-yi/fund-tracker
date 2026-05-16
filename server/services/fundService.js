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

  // 接口1: fundgz.1234567.com.cn (天天基金实时估值, JSONP)
  try {
    const { data } = await axios.get(`https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${Date.now()}`, {
      timeout: TIMEOUT,
      headers: defaultHeaders('https://fund.eastmoney.com/'),
      responseType: 'text',
    });
    const jsonpMatch = data.match(/jsonpgz\(([\s\S]*)\)/);
    if (jsonpMatch) {
      const parsed = safeJsonParse(jsonpMatch[1]);
      if (parsed && parsed.gsz != null) {
        return {
          netValue: parseFloat(parsed.gsz),
          gainPercent: parseFloat(parsed.gszzl),
          updateTime: parsed.gztime || '',
        };
      }
    }
  } catch (e) { errors.push(`fundgz: ${e.message}`); }

  // 接口2: 天天基金其他接口重试 (使用gztime字段)
  try {
    const { data } = await axios.get(`https://fundgz.1234567.com.cn/js/${fundCode}.js`, {
      timeout: TIMEOUT,
      headers: defaultHeaders('https://fund.eastmoney.com/fund/${fundCode}.html'),
      responseType: 'text',
    });
    const jsonpMatch = data.match(/jsonpgz\(([\s\S]*)\)/);
    if (jsonpMatch) {
      const parsed = safeJsonParse(jsonpMatch[1]);
      if (parsed && parsed.gsz != null) {
        return {
          netValue: parseFloat(parsed.gsz),
          gainPercent: parseFloat(parsed.gszzl),
          updateTime: parsed.gztime || '',
        };
      }
    }
  } catch (e) { errors.push(`fundgz2: ${e.message}`); }

  // 接口3: 东方财富push2接口 (股票行情接口)
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

module.exports = {
  getRealTimeValue,
  getHistoryNetValues,
  getFundInfo,
  getAllFunds,
};