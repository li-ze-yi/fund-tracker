// ============================================================================
// 数据源 B（回退）：东方财富 push2 公开接口 —— 仅当「你的接口」不可用或缺失时启用
// ----------------------------------------------------------------------------
// ⚠️ 注意：
//  1) 这是第三方公开接口，生产环境请用你自己的授权行情源（Wind / 同花顺 / 恒生 /
//     聚源 / Tushare 等），公开接口有频率限制且可能变动。
//  2) 浏览器直连可能存在 CORS；如遇跨域，请在你的后端做一层代理转发。
//  3) 北向「日净买入」自 2024-08-19 起官方不再披露，这里只能用「成交额 + 十大成交
//     股 + 占两市比重」做趋势指标。下方 9 日序列为静态基线，仅今日点会尝试实时更新。
// ============================================================================
import type { DashboardData, NorthboundPoint, NorthboundStock, Thesis } from "../types";

const EM_BASE = "https://push2.eastmoney.com";

async function emGet(path: string): Promise<any> {
  const url = `${EM_BASE}${path}`;
  const r = await fetch(url, {
    headers: {
      Referer: "https://quote.eastmoney.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!r.ok) throw new Error(`eastmoney ${r.status}`);
  return r.json();
}

// 宽基指数 secid（前缀 1=上交所 / 0=深交所）
const INDEX_SECIds = [
  "1.000001", // 上证指数
  "0.399001", // 深证成指
  "0.399006", // 创业板指
  "1.000300", // 沪深300
  "1.000016", // 上证50
  "1.000905", // 中证500
  "1.000852", // 中证1000
  "1.932000", // 中证2000
  "1.000688", // 科创50
  "0.899050", // 北证50
  "1.000680", // 科创综指
];

async function fetchIndices(): Promise<DashboardData["indices"]> {
  const path =
    `/api/qt/ulist.np/get?fltt=2&invt=2&fields=f12,f13,f14,f2,f3,f6&secids=` +
    INDEX_SECIds.join(",");
  const j = await emGet(path);
  const diff: any[] = j?.data?.diff ?? [];
  return diff.map((d) => ({
    name: d.f14,
    code: String(d.f12),
    pct: Number(d.f3),
    value: d.f2 != null ? Number(d.f2) : undefined,
    amount: d.f6 != null ? Number(d.f6) / 1e8 : undefined, // 元 → 亿元
  }));
}

async function fetchSectors(): Promise<DashboardData["sectors"]> {
  // m:90+t:2 = 东财行业板块（与申万一级高度接近，作为回退够用）
  const path =
    `/api/qt/clist/get?pn=1&pz=60&po=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=f12,f14,f2,f3,f62`;
  const j = await emGet(path);
  const diff: any[] = j?.data?.diff ?? [];
  return diff.map((d) => ({
    name: d.f14,
    pct: Number(d.f3),
    mainflow: d.f62 != null ? Number(d.f62) / 1e8 : 0, // 元 → 亿元
  }));
}

// ---- 北向：今日成交额（最佳努力，失败则保持静态基线） ----
const NB_BASELINE: NorthboundPoint[] = [
  // ⚠️ 静态基线（示例日期/量级），生产请接入你的接口或东方财富 kamt 历史序列替换
  { date: "07-28", amount: 1180, pctOfMarket: 4.8 },
  { date: "07-29", amount: 1240, pctOfMarket: 5.0 },
  { date: "07-30", amount: 1090, pctOfMarket: 4.5 },
  { date: "07-31", amount: 1320, pctOfMarket: 5.2 },
  { date: "08-03", amount: 1410, pctOfMarket: 5.6 },
  { date: "08-04", amount: 1360, pctOfMarket: 5.4 },
  { date: "08-05", amount: 1280, pctOfMarket: 5.1 },
  { date: "08-06", amount: 1460, pctOfMarket: 5.7 },
  { date: "08-07", amount: 1500, pctOfMarket: 5.6 },
];

const NB_TOP10_BASELINE: NorthboundStock[] = [
  // ⚠️ 局部上榜口径示例，真实请接入沪深港通十大成交股接口
  { name: "贵州茅台", code: "600519", net: 11.82 },
  { name: "宁德时代", code: "300750", net: 6.4 },
  { name: "中际旭创", code: "300308", net: 5.1 },
  { name: "比亚迪", code: "002594", net: 4.2 },
  { name: "立讯精密", code: "002475", net: 3.0 },
  { name: "北方华创", code: "002371", net: 2.6 },
  { name: "美的集团", code: "000333", net: 1.8 },
  { name: "长江电力", code: "600900", net: -1.2 },
  { name: "招商银行", code: "600036", net: 0.9 },
  { name: "中国平安", code: "601318", net: 0.6 },
];

async function fetchNorthbound(): Promise<DashboardData["northbound"]> {
  // 尝试实时更新「今日」成交额；失败则保留静态基线
  let series = NB_BASELINE.slice();
  const top10 = NB_TOP10_BASELINE.slice();
  try {
    // 东方财富北向资金整体页接口（字段以官方为准，可能变动）
    const j = await emGet(
      `/api/qt/kamt/get?fields=f51,f52,f54,f164,f165,f166,f167`
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
          pctOfMarket: series[series.length - 1].pctOfMarket, // 占比仍需成交额分母，由你的接口补全
        });
      }
    }
  } catch {
    /* 保留静态基线 */
  }
  return {
    series,
    top10,
    note: "北向日净买入自 2024-08-19 起不再披露，此处用「成交额+占两市比重+十大成交股」做趋势指标。9日序列为静态基线，今日点尝试实时更新。",
  };
}

// ---- 静态研判（分析性内容，非实时数据；可按你的研究替换） ----
const THESIS: Thesis[] = [
  {
    title: "电子内部换挡 > 板块 β",
    rating: "超配",
    body:
      "电子单日主力净流入与计算机净流出同日发生，光模块龙头单票大额流出、而 PCB/覆铜板/铜箔链吸筹。这是切换不是普涨，光模块宜从超配降至标配。",
    invalid: "若光模块龙头重新获得主力净流入且 PCB 链退潮，则切换逻辑证伪。",
    next: "观察下一日 PCB 链与光模块资金是否延续分化。",
  },
  {
    title: "医药是仓位回补不是拐点",
    rating: "超配（分批）",
    body:
      "H1 License-out 大额交易 + 龙头上调指引 + 学术会议临近，但公募 Q2 医药配置仍在低位。属于补涨逻辑，宜分批而非追高。",
    invalid: "若配置比例快速拉升至历史高位仍无业绩兑现，则补涨转泡沫。",
    next: "跟踪 Q3 公募持仓披露与核心管线数据读出。",
  },
  {
    title: "红利被分流不是被证伪",
    rating: "标配（留 15–20% 底仓）",
    body:
      "同日煤炭/钢铁/石油石化/公用事业主力小幅净流入，无基本面利空。微盘股涨幅远小于中证1000，说明增量只买有产业逻辑的成长——防御底仓的对冲价值反而在上升。",
    invalid: "若红利板块出现主力持续大幅净流出或利率环境逆转，则底仓逻辑削弱。",
    next: "观察红利板块主力净流入是否转正及长端利率走向。",
  },
];

/** 聚合：东方财富回退数据源 */
export async function fetchEastmoney(): Promise<DashboardData> {
  let indices: DashboardData["indices"] = [];
  let sectors: DashboardData["sectors"] = [];
  try {
    [indices, sectors] = await Promise.all([fetchIndices(), fetchSectors()]);
  } catch (e) {
    // 单点失败不应让整页崩溃；至少把能拿到的部分渲染出来
    if (!indices.length) indices = [];
    if (!sectors.length) sectors = [];
  }
  const northbound = await fetchNorthbound();

  const up = 0,
    down = 0,
    flat = 0;
  const breadthAmt = indices.reduce((s, x) => s + (x.amount ?? 0), 0);
  const mainFlowTotal = sectors.reduce((s, x) => s + x.mainflow, 0);

  return {
    date: new Date().toISOString().slice(0, 10),
    asOf: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    indices,
    sectors,
    styleMatrix: [], // 东财回退暂不覆盖巨潮风格，请由你的接口补全（或接入中证指数公司接口）
    northbound,
    breadth: { up, down, flat, amount: breadthAmt },
    mainFlowTotal,
    thesis: THESIS,
    notes: [
      "回退数据来自东方财富 push2 公开接口，仅供参考；生产环境请使用你的授权行情源（Wind/同花顺/恒生/聚源/Tushare 等），公开接口有频率限制且可能变动。",
      "主力资金存在多套口径（数据宝日报 / 数据宝盘后 / Wind），差异来自主力单金额阈值与新股剔除，跨口径请勿混用。",
      "北向日净买入自 2024-08-19 起官方不再披露，仅保留成交额 / 十大成交股 / 季度持股口径。",
      "巨潮 6 风格指数在回退源中为空，请通过你的接口或中证指数公司接口补全 styleMatrix。",
    ],
  };
}
