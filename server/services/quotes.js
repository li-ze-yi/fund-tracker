/**
 * quotes.js —— 行业轮动仪表盘聚合服务
 * --------------------------------------------------------------------------
 * 数据契约严格对齐 web/src/features/industry-rotation/types.ts 的 DashboardData。
 * 金额单位统一「亿元」，涨跌幅为「百分比数值」(如 +1.02 表示 +1.02%)。
 *
 * 数据来源：东方财富 push2 公开接口（服务端抓取，浏览器不再直连，无 CORS）。
 *   1) 宽基指数：push2 ulist（含点位/涨跌幅/成交额）
 *   2) 行业板块：push2 clist m:90+t:2（东财行业板块 + 主力净流入 f62）
 *   3) 涨跌家数/两市成交：push2 clist 全 A 聚合
 *   4) 北向：kamt 最佳努力（失败保留静态基线；日净买入自 2024-08-19 起已停披）
 *
 * 缓存：复用 globalCache.getOrFetch(type:'realtime')，与基金实时数据（持仓 / 指数）
 * 共用同一个 getRealtimeTTL()（盘中 28s，盘后/深夜/周末自动延长），单一数据源，
 * 轮动仪表盘刷新节奏与基金缓存完全一致。
 */
const globalCache = require('./globalCache');
const { fetchWithTimeout } = require('../utils/http');
const { createLogger } = require('../utils/logger');
const { getLocalToday, normalizeDateStr } = require('../utils/date');

const logger = createLogger('Quotes');

const EM_BASE = 'https://push2.eastmoney.com';

async function emGet(path, timeoutMs = 8000) {
  const url = `${EM_BASE}${path}`;
  const r = await fetchWithTimeout(url, {
    headers: {
      Referer: 'https://quote.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0',
    },
  }, timeoutMs);
  if (!r.ok) throw new Error(`eastmoney ${r.status}`);
  return r.json();
}

// 宽基指数定义（name 来自静态表，value/pct 来自腾讯/新浪实时快照）
const INDEX_DEFS = [
  { code: '000001', name: '上证指数', tx: 'sh000001' },
  { code: '399001', name: '深证成指', tx: 'sz399001' },
  { code: '399006', name: '创业板指', tx: 'sz399006' },
  { code: '000300', name: '沪深300', tx: 'sh000300' },
  { code: '000016', name: '上证50', tx: 'sh000016' },
  { code: '000905', name: '中证500', tx: 'sh000905' },
  { code: '000852', name: '中证1000', tx: 'sh000852' },
  { code: '932000', name: '中证2000', tx: 'sh932000' },
  { code: '000688', name: '科创50', tx: 'sh000688' },
  { code: '899050', name: '北证50', tx: 'bj899050' },
  { code: '000680', name: '科创综指', tx: 'sh000680' },
];

function emSecid(code) {
  if (code.startsWith('6')) return `1.${code}`;
  if (code.startsWith('8') || code.startsWith('4')) return `0.${code}`;
  return `1.${code}`;
}

// 指数：腾讯/新浪优先（稳定），东方财富兜底补齐缺失项。任一路失败不抛出，保证指数尽量有数。
async function fetchIndices() {
  const out = [];
  try {
    const txCodes = INDEX_DEFS.map((d) => d.tx).join(',');
    const r = await fetchWithTimeout(
      'http://qt.gtimg.cn/q=' + txCodes,
      { headers: { Referer: 'http://finance.qq.com' } },
      9000
    );
    const text = await r.text();
    if (text && text.length > 10) {
      for (const def of INDEX_DEFS) {
        const m = text.match(new RegExp('v_' + def.tx + '="([^"]*)"'));
        if (!m || !m[1]) continue;
        const f = m[1].split('~');
        if (f.length < 33) continue;
        const point = parseFloat(f[3]);
        if (!point) continue;
        const cp = parseFloat(f[32]);
        out.push({
          name: def.name,
          code: def.code,
          pct: isNaN(cp) ? 0 : cp,
          value: point,
          amount: undefined, // 成交额由东方财富兜底补全（腾讯指数额字段口径不稳）
        });
      }
    }
  } catch (e) {
    logger.warn(`腾讯指数获取失败: ${e.message}`);
  }

  // 东方财富兜底：补齐腾讯缺失的指数
  if (out.length < INDEX_DEFS.length) {
    try {
      const j = await emGet(
        '/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f3,f6&secids=' +
          INDEX_DEFS.map((d) => emSecid(d.code)).join(',')
      );
      const diff = j?.data?.diff ?? [];
      const have = new Set(out.map((o) => o.code));
      diff.forEach((d) => {
        const code = String(d.f12);
        if (d.f14 && code && !have.has(code)) {
          out.push({
            name: d.f14,
            code,
            pct: Number(d.f3) || 0,
            value: d.f2 != null ? Number(d.f2) : undefined,
            amount: d.f6 != null ? Number(d.f6) / 1e8 : undefined,
          });
        }
      });
    } catch (e) {
      logger.warn(`东财指数兜底失败: ${e.message}`);
    }
  }
  return out;
}

// 行业板块：东方财富多 host 兜底；全部失败返回 []（不抛出，避免拖垮整页）
async function fetchSectors() {
  const path =
    '/api/qt/clist/get?pn=1&pz=80&po=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=f12,f14,f2,f3,f62';
  const hosts = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com'];
  for (const h of hosts) {
    try {
      const r = await fetchWithTimeout(
        h + path,
        { headers: { Referer: 'https://quote.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' } },
        9000
      );
      const j = await r.json();
      const diff = j?.data?.diff ?? [];
      if (diff.length) {
        return diff
          .filter((d) => d.f14)
          .map((d) => ({
            name: d.f14,
            pct: Number(d.f3),
            mainflow: d.f62 != null ? Number(d.f62) / 1e8 : 0, // 元 → 亿元，正=净流入
          }));
      }
    } catch (e) {
      logger.warn(`东财行业板块获取失败(${h}): ${e.message}`);
    }
  }
  return [];
}

// 两市成交额 + 涨跌家数（最佳努力）
//   成交额：直接复用已抓取的「上证 + 深证」指数成交额（亿元）求和，≈ 沪深两市
//   涨跌家数：东方财富指数 stock/get 的 f104/f105/f106（上证 + 深证成分股家数求和）
async function fetchBreadth(indices) {
  const amount = (indices || []).reduce((s, x) => s + (x.amount || 0), 0);
  let up = 0;
  let down = 0;
  let flat = 0;
  try {
    const secids = ['1.000001', '0.399001']; // 上证指数 / 深证成指
    const rows = await Promise.all(
      secids.map((sid) =>
        emGet('/api/qt/stock/get?secid=' + sid + '&fields=f104,f105,f106', 6000).then(
          (j) => j?.data || {},
          () => ({})
        )
      )
    );
    rows.forEach((d) => {
      up += Number(d.f104) || 0;
      down += Number(d.f105) || 0;
      flat += Number(d.f106) || 0;
    });
  } catch (e) {
    logger.warn(`涨跌家数获取失败: ${e.message}`);
  }
  return { up, down, flat, amount };
}

// ---- 北向：静态基线 + 今日成交额最佳努力 ----
const NB_BASELINE = [
  { date: '07-28', amount: 2810.78, pctOfMarket: 13.88 },
  { date: '07-29', amount: 3414.08, pctOfMarket: 14.87 },
  { date: '07-30', amount: 3634.6, pctOfMarket: 15.51 },
  { date: '07-31', amount: 3541.02, pctOfMarket: 13.93 },
  { date: '08-03', amount: 2977.2, pctOfMarket: 14.91 },
  { date: '08-04', amount: 2963.58, pctOfMarket: 13.39 },
  { date: '08-05', amount: 3517.41, pctOfMarket: 13.23 },
  { date: '08-06', amount: 3262.18, pctOfMarket: 12.9 },
  { date: '08-07', amount: 3451.5, pctOfMarket: 12.95 },
];

// 北向十大成交股基线（按 channel 拆分；真实数据缺失时回退）
const NB_SH_BASELINE = [
  { name: '贵州茅台', code: '600519', market: 'sh', net: 11.82, amount: 39.14, pct: 2.1 },
  { name: '中国巨石', code: '600176', market: 'sh', net: 8.83, amount: 39.14, pct: 8.83 },
  { name: '兆易创新', code: '603986', market: 'sh', net: 8.32, amount: 28.16, pct: 8.32 },
  { name: '寒武纪', code: '688256', market: 'sh', net: 2.72, amount: 27.96, pct: 2.72 },
  { name: '药明康德', code: '603259', market: 'sh', net: 8.49, amount: 27.1, pct: 8.49 },
];
const NB_SZ_BASELINE = [
  { name: '中际旭创', code: '300308', market: 'sz', net: -56.49, amount: 85.25, pct: -3.68 },
  { name: '新易盛', code: '300502', market: 'sz', net: 0, amount: 42.32, pct: -0.22 },
  { name: '东山精密', code: '002384', market: 'sz', net: 0, amount: 34.48, pct: 4.04 },
  { name: '宁德时代', code: '300750', market: 'sz', net: 6.4, amount: 30.29, pct: 0.02 },
  { name: '天孚通信', code: '300394', market: 'sz', net: 0, amount: 21.9, pct: 2.4 },
];
const NB_TOP10_BASELINE = NB_SH_BASELINE.concat(NB_SZ_BASELINE);

// 巨潮 6 风格指数（secid 与名称严格对应：偶数=成长 / 奇数=价值）
const STYLE_DEFS = [
  { k: '大盘成长', secid: '1.399372' },
  { k: '大盘价值', secid: '1.399373' },
  { k: '中盘成长', secid: '1.399374' },
  { k: '中盘价值', secid: '1.399375' },
  { k: '小盘成长', secid: '1.399376' },
  { k: '小盘价值', secid: '1.399377' },
];

// 巨潮 6 风格指数：腾讯/新浪优先（稳定），东方财富 ulist 兜底
const STYLE_TX = [
  { k: '大盘成长', tx: 'sz399372' },
  { k: '大盘价值', tx: 'sz399373' },
  { k: '中盘成长', tx: 'sz399374' },
  { k: '中盘价值', tx: 'sz399375' },
  { k: '小盘成长', tx: 'sz399376' },
  { k: '小盘价值', tx: 'sz399377' },
];

async function fetchStyleMatrix() {
  // 1) 腾讯/新浪优先
  try {
    const txCodes = STYLE_TX.map((d) => d.tx).join(',');
    const r = await fetchWithTimeout(
      'http://qt.gtimg.cn/q=' + txCodes,
      { headers: { Referer: 'http://finance.qq.com' } },
      9000
    );
    const text = await r.text();
    if (text && text.length > 10) {
      const cells = STYLE_TX.map((d) => {
        const m = text.match(new RegExp('v_' + d.tx + '="([^"]*)"'));
        if (!m || !m[1]) return null;
        const f = m[1].split('~');
        if (f.length < 33) return null;
        const cp = parseFloat(f[32]);
        return { name: d.k, pct: isNaN(cp) ? 0 : cp };
      }).filter(Boolean);
      if (cells.length) return cells;
    }
  } catch (e) {
    logger.warn(`腾讯巨潮风格获取失败: ${e.message}`);
  }

  // 2) 东方财富兜底
  try {
    const j = await emGet(
      '/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f3&secids=' +
        STYLE_DEFS.map((s) => s.secid).join(',')
    );
    const diff = j?.data?.diff ?? [];
    if (diff.length) {
      const byCode = {};
      diff.forEach((d) => {
        byCode[String(d.f12)] = d;
      });
      const cells = STYLE_DEFS.map((s) => {
        const d = byCode[s.secid.split('.')[1]];
        if (!d || !d.f14) return null;
        return { name: s.k, pct: Number(d.f3) || 0 };
      }).filter(Boolean);
      if (cells.length) return cells;
    }
  } catch (e) {
    logger.warn(`巨潮风格指数获取失败(东财兜底): ${e.message}`);
  }
  return [];
}

async function fetchNorthbound() {
  let series = NB_BASELINE.slice();
  try {
    const j = await emGet(
      '/api/qt/kamt/get?fields=f51,f52,f54,f164,f165,f166,f167',
      6000
    );
    const d = j?.data;
    if (d && d.f51) {
      const hgt = Number(d.f52) || 0; // 沪股通成交额（元）
      const sgt = Number(d.f54) || 0; // 深股通成交额（元）
      const todayAmt = (hgt + sgt) / 1e8; // 亿元
      if (todayAmt > 0) {
        series = series.slice(0, -1).concat({
          date: d.f51.slice(5), // YYYY-MM-DD → MM-DD
          amount: Number(todayAmt.toFixed(0)),
          pctOfMarket: series[series.length - 1].pctOfMarket,
        });
      }
    }
  } catch (e) {
    logger.warn(`北向实时更新失败，保留静态基线: ${e.message}`);
  }
  return {
    series,
    note:
      '北向日净买入自 2024-08-19 起不再披露，此处用「成交额+占两市比重+十大成交股」做趋势指标。序列为近期走势，今日点尝试实时更新。',
  };
}

// 沪深股通十大成交股（东财实时拉取，失败回退基线）
async function fetchNorthboundTop() {
  try {
    const chans = [
      { market: 'sh', fs: 'm:1+t:23' },
      { market: 'sz', fs: 'm:0+t:23' },
    ];
    const out = [];
    for (const c of chans) {
      try {
        const j = await emGet(
          '/api/qt/clist/get?pn=1&pz=10&po=1&np=1&fltt=2&invt=2&fs=' +
            c.fs +
            '&fields=f12,f14,f3,f6',
          6000
        );
        const diff = j?.data?.diff ?? [];
        diff.forEach((d) => {
          if (d.f14) {
            out.push({
              name: d.f14,
              code: String(d.f12),
              market: c.market,
              amount: d.f6 != null ? Number(d.f6) / 1e8 : undefined,
              pct: Number(d.f3) || 0,
            });
          }
        });
      } catch (e) {
        logger.warn(`北向${c.market}十大成交获取失败: ${e.message}`);
      }
    }
    if (out.length >= 6) return out;
  } catch (e) {
    logger.warn(`北向十大成交获取失败，回退基线: ${e.message}`);
  }
  return NB_TOP10_BASELINE.slice();
}

// 静态研判（分析性内容，非实时数据；可按研究替换）
const THESIS = [
  {
    title: '电子内部换挡 > 板块 β',
    rating: '超配',
    body:
      '电子单日主力净流入与计算机净流出同日发生，光模块龙头单票大额流出、而 PCB/覆铜板/铜箔链吸筹。这是切换不是普涨，光模块宜从超配降至标配。',
    invalid: '若光模块龙头重新获得主力净流入且 PCB 链退潮，则切换逻辑证伪。',
    next: '观察下一日 PCB 链与光模块资金是否延续分化。',
  },
  {
    title: '医药是仓位回补不是拐点',
    rating: '超配（分批）',
    body:
      'H1 License-out 大额交易 + 龙头上调指引 + 学术会议临近，但公募 Q2 医药配置仍在低位。属于补涨逻辑，宜分批而非追高。',
    invalid: '若配置比例快速拉升至历史高位仍无业绩兑现，则补涨转泡沫。',
    next: '跟踪 Q3 公募持仓披露与核心管线数据读出。',
  },
  {
    title: '红利被分流不是被证伪',
    rating: '标配（留 15–20% 底仓）',
    body:
      '同日煤炭/钢铁/石油石化/公用事业主力小幅净流入，无基本面利空。微盘股涨幅远小于中证1000，说明增量只买有产业逻辑的成长——防御底仓的对冲价值反而在上升。',
    invalid: '若红利板块出现主力持续大幅净流出或利率环境逆转，则底仓逻辑削弱。',
    next: '观察红利板块主力净流入是否转正及长端利率走向。',
  },
];

const NOTES = [
  '数据来自东方财富 push2 公开接口（服务端聚合），仅供参考；生产环境请使用授权行情源（Wind/同花顺/恒生/聚源/Tushare 等），公开接口有频率限制且可能变动。',
  '主力资金存在多套口径（数据宝日报 / 数据宝盘后 / Wind），差异来自主力单金额阈值与新股剔除，跨口径请勿混用。',
  '北向日净买入自 2024-08-19 起官方不再披露，仅保留成交额 / 十大成交股 / 季度持股口径。',
  '指数行情：腾讯/新浪优先 + 东方财富兜底；巨潮 6 风格指数经东方财富实时抓取。',
];

/**
 * 聚合行业轮动仪表盘数据，经 globalCache 的 realtime 类型缓存（与基金实时缓存同源同 TTL）。
 */
async function getRotationData() {
  return globalCache.getOrFetch('market:rotation', async () => {
    let indices = [];
    let sectors = [];
    let breadth = { up: 0, down: 0, flat: 0, amount: 0 };
    let styleMatrix = [];
    let northbound = { series: NB_BASELINE.slice(), top10: NB_TOP10_BASELINE.slice(), note: NOTES[2] };

    // 并行聚合（各 fetch 内部已 try/catch，互不影响；均带兜底，单路失败不影响整页）
    const [indicesRes, sectorsRes, styleMatrixRes, northboundRes, northboundTopRes] = await Promise.all([
      fetchIndices().catch(() => []),
      fetchSectors().catch(() => []),
      fetchStyleMatrix().catch(() => []),
      fetchNorthbound().catch(() => ({ series: NB_BASELINE.slice(), note: NOTES[2] })),
      fetchNorthboundTop().catch(() => NB_TOP10_BASELINE.slice()),
    ]);
    indices = indicesRes;
    sectors = sectorsRes;
    styleMatrix = styleMatrixRes;
    northbound = northboundRes;
    northbound.top10 = northboundTopRes;

    // breadth 依赖 indices（成交额），拿到 indices 后再取
    breadth = await fetchBreadth(indices).catch(() => ({ up: 0, down: 0, flat: 0, amount: 0 }));

    const mainFlowTotal = sectors.reduce((s, x) => s + (x.mainflow || 0), 0);

    return {
      date: getLocalToday(),
      asOf: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      indices: indices || [],
      sectors: sectors || [],
      styleMatrix: styleMatrix || [],
      northbound,
      breadth: breadth || { up: 0, down: 0, flat: 0, amount: 0 },
      mainFlowTotal,
      thesis: THESIS,
      notes: NOTES,
    };
  }, { type: 'realtime' });
}

module.exports = { getRotationData };
