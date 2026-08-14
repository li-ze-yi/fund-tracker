const express = require('express');
const router = express.Router();
const globalCache = require('../services/globalCache');
const { fetchWithTimeout } = require('../utils/http');
const { createLogger } = require('../utils/logger');

const logger = createLogger('Indices');

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
            logger.warn('腾讯返回空数据，可能被服务器IP限制');
          }
        } catch(e) {
          logger.error(`腾讯实时指数请求失败: ${e.message}`);
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
          logger.error(`新浪实时指数请求失败(备用): ${e.message}`);
        }
      }

      var result = codes.map(function(c) {
        var v = r[c];
        return v ? {code:c, point:v.point, change:v.change, changePercent:v.cp} : {code:c, point:0, change:0, changePercent:0};
      });

      var hitCount = result.filter(function(item) { return item.point > 0; }).length;
      logger.info(`实时快照: ${hitCount}/${codes.length} 个指数获取成功`);

      return result;
    }, { type: 'realtime' });

    res.json({ indices: cachedData });
  } catch(e) {
    logger.error(`获取指数数据异常: ${e.message}`);
    res.json({ indices: codes.map(function(c) { return {code:c, point:0, change:0, changePercent:0}; }) });
  }
});

router.get('/:code/intraday', async (req, res) => {
  const code = req.params.code;
  const date = req.query.date || getLocalToday().replace(/-/g, '');
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
          if (result) logger.info(`腾讯分时 ${code}: ${result.times.length} 个数据点`);
        } catch(e) {
          logger.error(`腾讯分时失败: ${e.message}`);
        }

        if (!result) {
          try {
            const txc = TX_A[code];
            const txKlineUrl = `http://ifq.gtimg.cn/appstock/app/kline/kline?param=${txc},m1,,,240,qfq`;
            const txRes = await fetchWithTimeout(txKlineUrl, { headers: { Referer: 'http://finance.qq.com' } }, 10000);
            const txText = await txRes.text();
            result = parseTencentMinuteKline(txText, code);
            if (result) logger.info(`腾讯分钟K线 ${code}: ${result.times.length} 个数据点`);
          } catch(e) {
            logger.error(`腾讯分钟K线失败: ${e.message}`);
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
            if (result) logger.info(`东方财富分时 ${code}: ${result.times.length} 个数据点`);
          }
        } catch(e) {
          logger.error(`东方财富分时失败: ${e.message}`);
        }

        if (!result) {
          try {
            const sinaMinUrl = `http://finance.sina.com.cn/realstock/company/${SINA[code]}/nc.shtml`;
            const sinaResponse = await fetchWithTimeout(sinaMinUrl, { headers: { Referer: 'http://finance.sina.com.cn' } }, 10000);
            const sinaText = await sinaResponse.text();
            const klineMatch = sinaText.match(/var Data_MarketKLine=\[([\s\S]*?)\];/);
            if (klineMatch && klineMatch[1]) {
              result = parseSinaKlineData(klineMatch[1], code);
              if (result) logger.info(`新浪K线 ${code}: ${result.times.length} 个数据点`);
            }
          } catch(e) {
            logger.error(`新浪K线失败: ${e.message}`);
          }
        }

        if (!result) {
          try {
            const tushareUrl = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${SINA[code]}&scale=1&ma=no&datalen=240`;
            const tushareRes = await fetchWithTimeout(tushareUrl, { headers: { Referer: 'http://finance.sina.com.cn' } }, 10000);
            const tushareJson = await tushareRes.json();
            if (Array.isArray(tushareJson) && tushareJson.length > 0) {
              result = parseSinaMinuteData(tushareJson);
              if (result) logger.info(`新浪分钟API ${code}: ${result.times.length} 个数据点`);
            }
          } catch(e) {
            logger.error(`新浪分钟API失败: ${e.message}`);
          }
        }
      }

      if (!result && TX[code]) {
        const txSecid = TX[code];
        // 港股(hk)/美股(us)腾讯提供真实分时接口,仅接受真实逐分钟数据;
        // 点数过少(<30)或无数据时不再生成模拟曲线,直接返回无数据(前端显示"暂无分时数据")
        if (txSecid.startsWith('hk') || txSecid.startsWith('us')) {
          const market = txSecid.startsWith('hk') ? '港股' : '美股';
          try {
            const txMinUrl = `http://web.ifzq.gtimg.cn/appstock/app/minute/query?_var=min_data_${txSecid}&code=${txSecid}`;
            const txMinRes = await fetchWithTimeout(txMinUrl, { headers: { Referer: 'http://finance.qq.com' } }, 10000);
            const txMinText = await txMinRes.text();
            const minResult = parseTencentMinuteData(txMinText, code);
            if (minResult && minResult.times.length >= 30) {
              result = minResult;
              logger.info(`腾讯${market}分时 ${code}: ${result.times.length} 个数据点`);
            } else if (minResult) {
              logger.warn(`腾讯${market}分时 ${code} 点数过少(${minResult.times.length}),无真实分时数据`);
            } else {
              logger.warn(`腾讯${market}分时 ${code} 未返回数据`);
            }
          } catch(e) {
            logger.error(`腾讯${market}分时失败: ${e.message}`);
          }
        }
      }

      return result;
    }, { type: 'realtime' }); // 盘中实时数据缓存，28s 刷新

    if (!data) {
      // 无真实分时数据:返回空数据而非报错,前端据此显示"暂无分时数据"
      return res.json({ code, date, data: null, source: 'none', pointCount: 0 });
    }

    // 仅当解析到真实成交量时才返回 volumes 字段，避免前端显示伪造量能
    const hasRealVolume = Array.isArray(data.volumes) && data.volumes.length === data.times.length && data.volumes.some((v) => v > 0);
    res.json({
      code,
      date,
      data: {
        times: data.times,
        prices: data.prices,
        ...(hasRealVolume ? { volumes: data.volumes } : {}),
      },
      source: data.source || 'unknown',
      pointCount: data.times?.length || 0
    });
  } catch(e) {
    logger.error(`分时数据异常: ${e.message}`);
    res.status(500).json({ error: 'Failed to generate intraday data', code });
  }
});

function parseTencentMinuteData(text, code) {
  try {
    const varMatch = text.match(/min_data_\w+\s*=\s*(\{[\s\S]*\})/);
    if (!varMatch) return null;
    const json = JSON.parse(varMatch[1]);
    const txc = TX_A[code] || TX[code];
    const data = json.data && json.data[txc];
    if (!data || !data.data) return null;

    const minuteData = data.data;
    const times = [];
    const prices = [];
    const volumes = [];
    let prevCumVol = 0; // 腾讯分钟量为当日累计值，需转逐分钟增量用于副图

    // 兼容腾讯分钟接口的多种返回结构：
    // 1) 字符串："0930 3896.49;0931 ..."（旧版）
    // 2) 数组：[{ t, p }, ...]（部分接口）
    // 3) 对象：{ data: ["0930 3896.49 ...", ...] }（最新版，data 字段为数组）★ 此前漏处理导致主源静默失效
    let points = [];
    if (typeof minuteData === 'string') {
      points = minuteData.split(';');
    } else if (Array.isArray(minuteData)) {
      points = minuteData;
    } else if (minuteData && Array.isArray(minuteData.data)) {
      points = minuteData.data;
    } else {
      return null;
    }

    points.forEach(p => {
      if (typeof p === 'string') {
        const parts = p.trim().split(/\s+/);
        if (parts.length >= 2) {
          const time = parts[0];
          const price = parseFloat(parts[1]);
          if (time && price > 0) {
            times.push(time.substring(0, 5));
            prices.push(Number(price.toFixed(2)));
            // 腾讯分钟行格式: 时间 价格 成交量(手,当日累计) 成交额(元)
            // 取第3段为累计成交量，转逐分钟增量，使副图呈真实量能分布
            let cumVol = parts.length >= 3 ? (parseFloat(parts[2]) || 0) : 0;
            const vol = cumVol - prevCumVol;
            prevCumVol = cumVol;
            volumes.push(vol > 0 ? Math.round(vol) : 0);
          }
        }
      } else if (p && p.t && p.p) {
        times.push(p.t.substring(0, 5));
        prices.push(Number(parseFloat(p.p).toFixed(2)));
        const v = p.v || p.volume || p.vol;
        volumes.push(v ? Number(parseFloat(v)) : 0);
      }
    });

    return times.length > 0 ? { times, prices, volumes, source: 'tencent_minute' } : null;
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
    const volumes = [];

    klines.forEach(kline => {
      if (Array.isArray(kline) && kline.length >= 2) {
        const datetime = String(kline[0]);
        const timePart = datetime.includes(' ') ? datetime.split(' ')[1] : datetime;
        const price = parseFloat(kline[1]);
        if (timePart && price > 0) {
          times.push(timePart.substring(0, 5));
          prices.push(Number(price.toFixed(2)));
          // 腾讯日K数组: [日期,开,收,高,低,成交量,...]，kline[5] 为成交量
          volumes.push(kline.length >= 6 ? (parseFloat(kline[5]) || 0) : 0);
        }
      }
    });

    return times.length > 0 ? { times, prices, volumes, source: 'tencent_minute_kline' } : null;
  } catch(e) {
    return null;
  }
}

function parseEastMoneyMinuteKline(klines) {
  const times = [];
  const prices = [];
  const volumes = [];

  klines.forEach((line) => {
    const parts = line.split(',');
    if (parts.length >= 6) {
      const datetime = parts[0];
      const timePart = datetime.includes(' ') ? datetime.split(' ')[1] : datetime;
      const price = parseFloat(parts[1]);

      if (timePart && price > 0) {
        times.push(timePart.substring(0, 5));
        prices.push(Number(price.toFixed(2)));
        // 东财K线字段: [时间,开,收,高,低,成交量,成交额,...]，parts[5] 为成交量(手)
        volumes.push(parseFloat(parts[5]) || 0);
      }
    }
  });

  if (times.length === 0) return null;

  return { times, prices, volumes, source: 'eastmoney_minute' };
}

function parseSinaKlineData(klineStr, baseCode) {
  try {
    const items = JSON.parse(`[${klineStr}]`);
    if (!Array.isArray(items) || items.length === 0) return null;

    const times = [];
    const prices = [];
    const volumes = [];

    items.forEach(item => {
      if (item.d && item.p) {
        const timeStr = item.d.includes(' ') ? item.d.split(' ')[1] : item.d;
        times.push(timeStr.substring(0, 5));
        prices.push(Number(parseFloat(item.p).toFixed(2)));
        const v = item.v || item.volume || item.vol;
        volumes.push(v ? Number(parseFloat(v)) : 0);
      }
    });

    return times.length > 0 ? { times, prices, volumes, source: 'sina_kline' } : null;
  } catch(e) {
    return null;
  }
}

function parseSinaMinuteData(dataArray) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return null;

  const times = [];
  const prices = [];
  const volumes = [];

  dataArray.forEach(item => {
    if (item.day && item.close) {
      const timeStr = item.day.includes(' ') ? item.day.split(' ')[1] : item.day;
      times.push(timeStr.substring(0, 5));
      prices.push(Number(parseFloat(item.close).toFixed(2)));
      const v = item.volume || item.vol || item.v;
      volumes.push(v ? Number(parseFloat(v)) : 0);
    }
  });

  return times.length > 0 ? { times, prices, volumes, source: 'sina_minute_api' } : null;
}

function getEastMoneySecid(code) {
  if (code.startsWith('6')) {
    return `1.${code}`;
  }
  return `0.${code}`;
}

module.exports = router;
