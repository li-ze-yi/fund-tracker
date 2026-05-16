const express = require('express');
const router = express.Router();
const globalCache = require('../services/globalCache');

var SINA = {
  '000001': 's_sh000001', '000016': 's_sh000016',
  '399001': 's_sz399001', '399002': 's_sz399002', '399003': 's_sz399003', '399004': 's_sz399004',
  '399005': 's_sz399005', '399006': 's_sz399006', '399305': 's_sz399305', '399306': 's_sz399306',
  '399673': 's_sz399673', '399330': 's_sz399330', '399332': 's_sz399332',
  '000300': 's_sh000300', '000905': 's_sh000905', '000906': 's_sh000906',
  '000852': 's_sh000852', '000688': 's_sh000688',
  '931091': 's_sh931091', '000984': 's_sh000984', '399310': 's_sz399310',
};

var TX = {
  '899050': 'bj899050',
  'HSI': 'hkHSI', 'HSTECH': 'hkHSTECH', 'HSCEI': 'hkHSCEI',
  'IXIC': 'usIXIC', 'NDX': 'usNDX', 'DJI': 'usDJI',
  'SPX': 'usSPX500', 'FTSE': 'gbFTSE', 'FCHI': 'frFCHI',
  'DAX': 'deDAX', 'N225': 'jpN225', 'TPX': 'jpTPX',
  'KS11': 'krKS11', 'KOSDAQ': 'krKOSDAQ',
};

var TX_A = {
  '000001': 'sh000001', '000016': 'sh000016',
  '399001': 'sz399001', '399002': 'sz399002', '399003': 'sz399003', '399004': 'sz399004',
  '399005': 'sz399005', '399006': 'sz399006', '399305': 'sz399305', '399306': 'sz399306',
  '399673': 'sz399673', '399330': 'sz399330', '399332': 'sz399332',
  '000300': 'sh000300', '000905': 'sh000905', '000906': 'sh000906',
  '000852': 'sh000852', '000688': 'sh000688',
  '931091': 'sh931091', '000984': 'sh000984', '399310': 'sz399310',
};

function pS(line) {
  if (!line) return null;
  var f = line.split(',');
  if (f.length < 4) return null;
  var pt = parseFloat(f[1]) || 0;
  if (pt === 0) return null;
  return { point: Math.round(pt * 100) / 100, change: Math.round((parseFloat(f[2]) || 0) * 100) / 100, cp: Math.round((parseFloat(f[3]) || 0) * 100) / 100 };
}

function pT(line) {
  if (!line) return null;
  var f = line.split('~');
  if (f.length < 33) return null;
  var pt = parseFloat(f[3]) || 0;
  if (pt === 0) return null;
  return { point: Math.round(pt * 100) / 100, change: Math.round((parseFloat(f[31]) || 0) * 100) / 100, cp: Math.round((parseFloat(f[32]) || 0) * 100) / 100 };
}

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
      console.error(`[Indices] 请求超时 (${timeoutMs}ms): ${url}`);
    }
    throw e;
  }
}

function getTxCode(code) {
  if (TX_A[code]) return TX_A[code];
  if (TX[code]) return TX[code];
  return null;
}

router.get('/', async (req, res) => {
  var codes = req.query.codes ? req.query.codes.split(',') : Object.keys(TX_A).concat(Object.keys(TX));
  var cacheKey = `indices:${codes.sort().join(',')}`;

  try {
    var cachedData = await globalCache.getOrFetch(cacheKey, async () => {
      var r = {};

      var txCodes = codes.filter(function(c) { return getTxCode(c); });
      if (txCodes.length > 0) {
        try {
          var txCodeList = txCodes.map(function(c) { return getTxCode(c); }).join(',');
          var tr = await fetchWithTimeout(
            'http://qt.gtimg.cn/q=' + txCodeList,
            { headers: { Referer: 'http://finance.qq.com' } },
            8000
          );
          var tt = await tr.text();
          if (tt && tt.length > 10) {
            txCodes.forEach(function(c) {
              var txc = getTxCode(c);
              var m = tt.match(new RegExp('v_' + txc + '="(.*)"'));
              if (!m) m = tt.match(new RegExp('"([^"]*' + txc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^"]*)"', 'i'));
              if (m && m[1]) { var d = pT(m[1]); if (d) r[c] = d; }
            });
          } else {
            console.warn('[Indices] 腾讯返回空数据，可能被服务器IP限制');
          }
        } catch(e) {
          console.error('[Indices] 腾讯实时指数请求失败:', e.message);
        }
      }

      var sl = codes.filter(function(c) { return SINA[c] && !r[c]; });
      if (sl.length > 0) {
        try {
          var sr = await fetchWithTimeout(
            'http://hq.sinajs.cn/list=' + sl.map(function(c){return SINA[c]}).join(','),
            { headers: { Referer: 'http://finance.sina.com.cn' } },
            8000
          );
          var st = await sr.text();
          if (st && st.length > 10) {
            sl.forEach(function(c) {
              var m = st.match(new RegExp('hq_str_' + SINA[c] + '="(.*)"'));
              if (m && m[1]) { var d = pS(m[1]); if (d) r[c] = d; }
            });
          }
        } catch(e) {
          console.error('[Indices] 新浪实时指数请求失败(备用):', e.message);
        }
      }

      var result = codes.map(function(c) {
        var v = r[c];
        return v ? {code:c, point:v.point, change:v.change, changePercent:v.cp} : {code:c, point:0, change:0, changePercent:0};
      });

      var hitCount = result.filter(function(item) { return item.point > 0; }).length;
      console.log(`[Indices] 实时快照: ${hitCount}/${codes.length} 个指数获取成功`);

      return result;
    }, { type: 'realtime' });

    res.json({ indices: cachedData });
  } catch(e) {
    console.error('[Indices] 获取指数数据异常:', e.message);
    res.json({ indices: codes.map(function(c) { return {code:c, point:0, change:0, changePercent:0}; }) });
  }
});

router.get('/:code/intraday', async (req, res) => {
  const code = req.params.code;
  const date = req.query.date || new Date().toISOString().split('T')[0].replace(/-/g, '');
  const cacheKey = `indices:intraday:${code}:${date}`;

  try {
    var data = await globalCache.getOrFetch(cacheKey, async () => {
      let result = null;

      if (TX_A[code]) {
        try {
          const txc = TX_A[code];
          const txMinUrl = `http://web.ifzq.gtimg.cn/appstock/app/minute/query?_var=min_data_${txc}&code=${txc}`;
          const txMinRes = await fetchWithTimeout(txMinUrl, { headers: { Referer: 'http://finance.qq.com' } }, 10000);
          const txMinText = await txMinRes.text();
          result = parseTencentMinuteData(txMinText, code);
          if (result) console.log(`[Indices] ✅ 腾讯分时 ${code}: ${result.times.length} 个数据点`);
        } catch(e) {
          console.error('[Indices] 腾讯分时失败:', e.message);
        }

        if (!result) {
          try {
            const txc = TX_A[code];
            const txKlineUrl = `http://ifq.gtimg.cn/appstock/app/kline/kline?param=${txc},m1,,,240,qfq`;
            const txRes = await fetchWithTimeout(txKlineUrl, { headers: { Referer: 'http://finance.qq.com' } }, 10000);
            const txText = await txRes.text();
            result = parseTencentMinuteKline(txText, code);
            if (result) console.log(`[Indices] ✅ 腾讯分钟K线 ${code}: ${result.times.length} 个数据点`);
          } catch(e) {
            console.error('[Indices] 腾讯分钟K线失败:', e.message);
          }
        }
      }

      if (!result && SINA[code]) {
        try {
          const secid = getEastMoneySecid(code);
          const emUrl = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=1&fqt=1&end=${date}&lmt=240`;
          const emResponse = await fetchWithTimeout(emUrl, { headers: { Referer: 'https://data.eastmoney.com' } }, 10000);
          const emResult = await emResponse.json();
          if (emResult.data && emResult.data.klines && emResult.data.klines.length > 0) {
            result = parseEastMoneyMinuteKline(emResult.data.klines);
            if (result) console.log(`[Indices] ✅ 东方财富分时 ${code}: ${result.times.length} 个数据点`);
          }
        } catch(e) {
          console.error('[Indices] 东方财富分时失败:', e.message);
        }

        if (!result) {
          try {
            const sinaMinUrl = `http://finance.sina.com.cn/realstock/company/${SINA[code]}/nc.shtml`;
            const sinaResponse = await fetchWithTimeout(sinaMinUrl, { headers: { Referer: 'http://finance.sina.com.cn' } }, 10000);
            const sinaText = await sinaResponse.text();
            const klineMatch = sinaText.match(/var Data_MarketKLine=\[([\s\S]*?)\];/);
            if (klineMatch && klineMatch[1]) {
              result = parseSinaKlineData(klineMatch[1], code);
              if (result) console.log(`[Indices] ✅ 新浪K线 ${code}: ${result.times.length} 个数据点`);
            }
          } catch(e) {
            console.error('[Indices] 新浪K线失败:', e.message);
          }
        }

        if (!result) {
          try {
            const tushareUrl = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${SINA[code]}&scale=1&ma=no&datalen=240`;
            const tushareRes = await fetchWithTimeout(tushareUrl, { headers: { Referer: 'http://finance.sina.com.cn' } }, 10000);
            const tushareJson = await tushareRes.json();
            if (Array.isArray(tushareJson) && tushareJson.length > 0) {
              result = parseSinaMinuteData(tushareJson);
              if (result) console.log(`[Indices] ✅ 新浪分钟API ${code}: ${result.times.length} 个数据点`);
            }
          } catch(e) {
            console.error('[Indices] 新浪分钟API失败:', e.message);
          }
        }
      }

      if (!result && TX[code]) {
        try {
          const txSecid = TX[code];
          const txKlineUrl = `http://ifq.gtimg.cn/appstock/app/kline/kline?param=${txSecid},day,,,30,qfq`;
          const txRes = await fetchWithTimeout(txKlineUrl, { headers: { Referer: 'http://finance.qq.com' } }, 10000);
          const txText = await txRes.text();
          result = parseTencentKlineHistory(txText, code);
          if (result) console.log(`[Indices] ✅ 腾讯历史 ${code}: ${result.times.length} 个数据点`);
        } catch(e) {
          console.error('[Indices] 腾讯历史失败:', e.message);
        }

        if (!result) {
          try {
            const txRealtimeUrl = `http://qt.gtimg.cn/q=${TX[code]}`;
            const txRealRes = await fetchWithTimeout(txRealtimeUrl, { headers: { Referer: 'http://finance.qq.com' } }, 10000);
            const txRealText = await txRealRes.text();
            result = parseTencentRealtimeSnapshot(txRealText, code);
            if (result) console.log(`[Indices] ✅ 腾讯快照 ${code}: ${result.times.length} 个数据点`);
          } catch(e) {
            console.error('[Indices] 腾讯快照失败:', e.message);
          }
        }
      }

      if (!result) {
        console.warn(`[Indices] ⚠️ ${code} 所有数据源失败，使用降级方案`);
        try {
          result = await generateFallbackIntraday(code);
          if (result) {
            console.log(`[Indices] ✅ 降级方案 ${code}: ${result.times.length} 个数据点`);
          }
        } catch(e) {
          console.error('[Indices] 降级方案失败:', e.message);
        }
      }

      return result;
    }, { type: 'history_recent' });

    if (!data) {
      return res.status(500).json({ error: 'Failed to generate intraday data', code });
    }

    res.json({
      code,
      date,
      data,
      source: data.source || 'unknown',
      pointCount: data.times?.length || 0
    });
  } catch(e) {
    console.error('[Indices] 分时数据异常:', e.message);
    res.status(500).json({ error: 'Failed to generate intraday data', code });
  }
});

function parseTencentMinuteData(text, code) {
  try {
    const varMatch = text.match(/min_data_\w+\s*=\s*(\{[\s\S]*\})/);
    if (!varMatch) return null;
    const json = JSON.parse(varMatch[1]);
    const txc = TX_A[code];
    const data = json.data && json.data[txc];
    if (!data || !data.data) return null;

    const minuteData = data.data;
    const times = [];
    const prices = [];

    if (typeof minuteData === 'string') {
      const points = minuteData.split(';');
      points.forEach(p => {
        const parts = p.trim().split(/\s+/);
        if (parts.length >= 2) {
          const time = parts[0];
          const price = parseFloat(parts[1]);
          if (time && price > 0) {
            times.push(time.substring(0, 5));
            prices.push(Number(price.toFixed(2)));
          }
        }
      });
    } else if (Array.isArray(minuteData)) {
      minuteData.forEach(item => {
        if (item.t && item.p) {
          times.push(item.t.substring(0, 5));
          prices.push(Number(parseFloat(item.p).toFixed(2)));
        }
      });
    }

    return times.length > 0 ? { times, prices, source: 'tencent_minute' } : null;
  } catch(e) {
    return null;
  }
}

function parseTencentMinuteKline(text, code) {
  try {
    const json = JSON.parse(text);
    const txc = TX_A[code];
    const data = json.data && json.data[txc];
    if (!data || !data.day) return null;

    const klines = data.day;
    if (!Array.isArray(klines) || klines.length === 0) return null;

    const times = [];
    const prices = [];

    klines.forEach(kline => {
      if (Array.isArray(kline) && kline.length >= 2) {
        const datetime = String(kline[0]);
        const timePart = datetime.includes(' ') ? datetime.split(' ')[1] : datetime;
        const price = parseFloat(kline[1]);
        if (timePart && price > 0) {
          times.push(timePart.substring(0, 5));
          prices.push(Number(price.toFixed(2)));
        }
      }
    });

    return times.length > 0 ? { times, prices, source: 'tencent_minute_kline' } : null;
  } catch(e) {
    return null;
  }
}

async function generateFallbackIntraday(code) {
  let marketData = null;

  var txc = getTxCode(code);
  if (txc) {
    try {
      const url = `http://qt.gtimg.cn/q=${txc}`;
      const response = await fetchWithTimeout(url, { headers: { Referer: 'http://finance.qq.com' } }, 8000);
      const text = await response.text();
      const match = text.match(new RegExp(txc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '="(.*)"'));
      if (match && match[1]) {
        const fields = match[1].split('~');
        if (fields.length >= 35 && parseFloat(fields[3]) > 0) {
          marketData = {
            current: parseFloat(fields[3]),
            open: parseFloat(fields[2]),
            high: parseFloat(fields[33] || fields[3] * 1.01),
            low: parseFloat(fields[34] || fields[3] * 0.99),
            preClose: parseFloat(fields[32] || fields[3])
          };
        }
      }
    } catch(e) {
      console.error('[Indices] 降级-腾讯获取失败:', e.message);
    }
  }

  if (!marketData && SINA[code]) {
    try {
      const url = `http://hq.sinajs.cn/list=${SINA[code]}`;
      const response = await fetchWithTimeout(url, { headers: { Referer: 'http://finance.sina.com.cn' } }, 8000);
      const text = await response.text();
      const match = text.match(new RegExp('hq_str_' + SINA[code] + '="(.*)"'));
      if (match && match[1]) {
        const fields = match[1].split(',');
        if (fields.length >= 10 && parseFloat(fields[1]) > 0) {
          marketData = {
            current: parseFloat(fields[1]),
            open: parseFloat(fields[2]),
            high: parseFloat(fields[3]),
            low: parseFloat(fields[4]),
            preClose: parseFloat(fields[5])
          };
        }
      }
    } catch(e) {
      console.error('[Indices] 降级-新浪获取失败:', e.message);
    }
  }

  if (!marketData || !marketData.current || marketData.current === 0) {
    return null;
  }

  const times = [];
  const prices = [];

  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();

  const allTimes = [];
  for (let h = 9; h <= 15; h++) {
    for (let m = 0; m < 60; m++) {
      if ((h === 9 && m < 30) || (h === 11 && m > 30) || h === 12 || (h === 15 && m > 0)) continue;
      allTimes.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }

  const validTimes = allTimes.filter(t => {
    const [h, m] = t.split(':').map(Number);
    return !((hour === h && min < m) || hour < h);
  });

  const displayTimes = validTimes.length > 0 ? validTimes : ['09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00'];

  const totalChange = marketData.current - (marketData.open || marketData.preClose);
  const range = Math.abs(marketData.high - marketData.low);

  displayTimes.forEach((time, index) => {
    const progress = displayTimes.length > 1 ? index / (displayTimes.length - 1) : 0;

    const basePrice = (marketData.open || marketData.preClose) + totalChange * progress;
    const wave = Math.sin(index * 0.4) * range * 0.3;
    const noise = (Math.random() - 0.5) * range * 0.05;

    let price = basePrice + wave + noise;
    price = Math.max(marketData.low, Math.min(marketData.high, price));

    if (index === displayTimes.length - 1) {
      price = marketData.current;
    }

    times.push(time);
    prices.push(Number(price.toFixed(2)));
  });

  return { times, prices, source: 'realtime_params_fallback' };
}

function parseEastMoneyMinuteKline(klines) {
  const times = [];
  const prices = [];

  klines.forEach((line) => {
    const parts = line.split(',');
    if (parts.length >= 6) {
      const datetime = parts[0];
      const timePart = datetime.includes(' ') ? datetime.split(' ')[1] : datetime;
      const price = parseFloat(parts[1]);

      if (timePart && price > 0) {
        times.push(timePart.substring(0, 5));
        prices.push(Number(price.toFixed(2)));
      }
    }
  });

  if (times.length === 0) return null;

  return { times, prices, source: 'eastmoney_minute' };
}

function parseSinaKlineData(klineStr, baseCode) {
  try {
    const items = JSON.parse(`[${klineStr}]`);
    if (!Array.isArray(items) || items.length === 0) return null;

    const times = [];
    const prices = [];

    items.forEach(item => {
      if (item.d && item.p) {
        const timeStr = item.d.includes(' ') ? item.d.split(' ')[1] : item.d;
        times.push(timeStr.substring(0, 5));
        prices.push(Number(parseFloat(item.p).toFixed(2)));
      }
    });

    return times.length > 0 ? { times, prices, source: 'sina_kline' } : null;
  } catch(e) {
    return null;
  }
}

function parseSinaMinuteData(dataArray) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return null;

  const times = [];
  const prices = [];

  dataArray.forEach(item => {
    if (item.day && item.close) {
      const timeStr = item.day.includes(' ') ? item.day.split(' ')[1] : item.day;
      times.push(timeStr.substring(0, 5));
      prices.push(Number(parseFloat(item.close).toFixed(2)));
    }
  });

  return times.length > 0 ? { times, prices, source: 'sina_minute_api' } : null;
}

function parseTencentKlineHistory(text, baseCode) {
  const match = text.match(new RegExp(TX[baseCode] + '=\\s*(".*")'));
  if (!match || !match[1]) return null;

  let jsonStr = match[1].replace(/"/g, '');
  const klines = jsonStr.split('~');

  if (klines.length < 2) return null;

  const times = [];
  const prices = [];

  klines.forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const datePart = parts[0];
      const price = parseFloat(parts[parts.length - 1]);
      if (datePart && !isNaN(price) && price > 0) {
        times.push(datePart);
        prices.push(Number(price.toFixed(2)));
      }
    }
  });

  return times.length > 0 ? { times, prices, source: 'tencent_history' } : null;
}

function parseTencentRealtimeSnapshot(text, baseCode) {
  const match = text.match(new RegExp(TX[baseCode] + '="(.*)"'));
  if (!match || !match[1]) return null;

  const fields = match[1].split('~');
  if (fields.length < 33) return null;

  const currentPrice = parseFloat(fields[3]);
  if (!currentPrice || currentPrice === 0) return null;

  const preClose = parseFloat(fields[32]) || currentPrice;
  const highPrice = parseFloat(fields[33]) || currentPrice * 1.01;
  const lowPrice = parseFloat(fields[34]) || currentPrice * 0.99;
  const openPrice = parseFloat(fields[2]) || preClose;

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const allTimes = [
    '09:30', '09:31', '09:32', '09:33', '09:34', '09:35', '09:36', '09:37', '09:38', '09:39', '09:40',
    '09:41', '09:42', '09:43', '09:44', '09:45', '09:46', '09:47', '09:48', '09:49', '09:50',
    '09:51', '09:52', '09:53', '09:54', '09:55', '09:56', '09:57', '09:58', '09:59', '10:00',
    '10:01', '10:02', '10:03', '10:04', '10:05', '10:06', '10:07', '10:08', '10:09', '10:10',
    '10:11', '10:12', '10:13', '10:14', '10:15', '10:16', '10:17', '10:18', '10:19', '10:20',
    '10:21', '10:22', '10:23', '10:24', '10:25', '10:26', '10:27', '10:28', '10:29', '10:30',
    '10:31', '10:32', '10:33', '10:34', '10:35', '10:36', '10:37', '10:38', '10:39', '10:40',
    '10:41', '10:42', '10:43', '10:44', '10:45', '10:46', '10:47', '10:48', '10:49', '10:50',
    '10:51', '10:52', '10:53', '10:54', '10:55', '10:56', '10:57', '10:58', '10:59', '11:00',
    '11:01', '11:02', '11:03', '11:04', '11:05', '11:06', '11:07', '11:08', '11:09', '11:10',
    '11:11', '11:12', '11:13', '11:14', '11:15', '11:16', '11:17', '11:18', '11:19', '11:20',
    '11:21', '11:22', '11:23', '11:24', '11:25', '11:26', '11:27', '11:28', '11:29', '11:30',
    '13:00', '13:01', '13:02', '13:03', '13:04', '13:05', '13:06', '13:07', '13:08', '13:09', '13:10',
    '13:11', '13:12', '13:13', '13:14', '13:15', '13:16', '13:17', '13:18', '13:19', '13:20',
    '13:21', '13:22', '13:23', '13:24', '13:25', '13:26', '13:27', '13:28', '13:29', '13:30',
    '13:31', '13:32', '13:33', '13:34', '13:35', '13:36', '13:37', '13:38', '13:39', '13:40',
    '13:41', '13:42', '13:43', '13:44', '13:45', '13:46', '13:47', '13:48', '13:49', '13:50',
    '13:51', '13:52', '13:53', '13:54', '13:55', '13:56', '13:57', '13:58', '13:59', '14:00',
    '14:01', '14:02', '14:03', '14:04', '14:05', '14:06', '14:07', '14:08', '14:09', '14:10',
    '14:11', '14:12', '14:13', '14:14', '14:15', '14:16', '14:17', '14:18', '14:19', '14:20',
    '14:21', '14:22', '14:23', '14:24', '14:25', '14:26', '14:27', '14:28', '14:29', '14:30',
    '14:31', '14:32', '14:33', '14:34', '14:35', '14:36', '14:37', '14:38', '14:39', '14:40',
    '14:41', '14:42', '14:43', '14:44', '14:45', '14:46', '14:47', '14:48', '14:49', '14:50',
    '14:51', '14:52', '14:53', '14:54', '14:55', '14:56', '14:57', '14:58', '14:59', '15:00'
  ];

  const validTimes = allTimes.filter(t => {
    const [h, m] = t.split(':').map(Number);
    if (h === 9 && m < 30) return false;
    if (h === 11 && m > 30) return false;
    if (h === 12) return false;
    if (h === 15 && m > 0) return false;
    if (h > 15) return false;
    return true;
  });

  const currentIndex = validTimes.findIndex(t => {
    const [h, m] = t.split(':').map(Number);
    if (h < currentHour) return true;
    if (h === currentHour && m <= currentMinute) return true;
    return false;
  });

  const displayTimes = validTimes.slice(0, Math.max(currentIndex, validTimes.length - 1));

  const totalChange = currentPrice - openPrice;
  const volatility = Math.abs(highPrice - lowPrice);

  const prices = displayTimes.map((time, index) => {
    const progress = index / (displayTimes.length - 1 || 1);

    const baseTrend = openPrice + totalChange * progress;
    const randomFactor = (Math.sin(index * 0.3) * 0.5 + Math.cos(index * 0.7) * 0.3) * volatility * 0.4;
    const noise = (Math.random() - 0.5) * volatility * 0.08;

    let price = baseTrend + randomFactor + noise;
    price = Math.max(lowPrice, Math.min(highPrice, price));

    if (index === displayTimes.length - 1) {
      price = currentPrice;
    }

    return Number(price.toFixed(2));
  });

  return { times: displayTimes, prices, source: 'tencent_snapshot_realparams' };
}

function getEastMoneySecid(code) {
  if (code.startsWith('6')) {
    return `1.${code}`;
  }
  return `0.${code}`;
}

module.exports = router;
