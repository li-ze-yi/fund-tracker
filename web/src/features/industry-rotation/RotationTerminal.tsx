// ============================================================================
// RotationTerminal.tsx —— A股行业轮动与资金流向监控终端（数据驱动 · 标签式工作台）
// ----------------------------------------------------------------------------
// 交互架构：顶部常驻标签栏（概览 / 行业 / 风格 / 北向 / 研判 / 说明），
// 手机端单视图聚焦（消灭长滚动），桌面端标签内双栏保持密度。
// 全部数值来自后端 /api/market/rotation 返回的实时 DashboardData。
// 「今日资金主线」与「3 条行业配置研判」由当前数据动态生成。
// 主题跟随 App 全局 data-theme（dark / light），涨红跌绿为 A股惯例。
// ============================================================================
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeStore } from "../../store/themeStore";
import type { DashboardData, SectorCell, StyleCell, NorthboundStock } from "./types";
import "./rotationTerminal.css";

/* ---------------- helpers ---------------- */
const sgn = (x: number) => (x > 0 ? "+" : "");
const cls = (x: number) => (x > 0 ? "up" : x < 0 ? "dn" : "flat");
const fx = (x: number, d = 2) => (x ?? 0).toFixed(d);
const fmtInt = (x: number) =>
  (x ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function heatColor(p: number, isLight: boolean) {
  const t = Math.min(Math.abs(p) / 5, 1);
  if (isLight) {
    const a = 0.1 + t * 0.45;
    return {
      bg: p >= 0 ? `rgba(220,38,38,${a})` : `rgba(22,163,74,${a})`,
      fg: p >= 0 ? "#9b1c1c" : "#15803d",
    };
  }
  const a = 0.18 + t * 0.82;
  return {
    bg: p >= 0 ? `rgba(214,48,49,${a})` : `rgba(16,163,90,${a})`,
    fg: "#ffffff",
  };
}

function styleBg(p: number, isLight: boolean) {
  const t = Math.min(Math.abs(p) / 2.2, 1);
  if (isLight) {
    const a = 0.06 + t * 0.3;
    return p >= 0 ? `rgba(220,38,38,${a})` : `rgba(22,163,74,${a})`;
  }
  return p >= 0 ? `rgba(214,48,49,${0.06 + t * 0.2})` : `rgba(16,163,90,${0.06 + t * 0.2})`;
}

/* ---------------- 动态：今日资金主线 ---------------- */
function buildNarrative(sectors: SectorCell[], breadth: DashboardData["breadth"]) {
  if (!sectors || sectors.length === 0)
    return "暂无行业资金流数据，无法生成当日资金主线。";
  const sorted = [...sectors].sort((a, b) => b.mainflow - a.mainflow);
  const topIn = sorted.filter((s) => s.mainflow > 0).slice(0, 3);
  const outSorted = [...sectors]
    .filter((s) => s.mainflow < 0)
    .sort((a, b) => a.mainflow - b.mainflow)
    .slice(0, 2);
  const parts: string[] = [];
  if (topIn.length) {
    const names = topIn
      .map((s) => `${s.name}(${sgn(s.mainflow)}${fx(s.mainflow)}亿)`)
      .join("、");
    parts.push(`资金主线：${names} 主力净流入居前`);
  }
  if (outSorted.length) {
    const names = outSorted
      .map((s) => `${s.name}(${fx(s.mainflow)}亿)`)
      .join("、");
    parts.push(`失血端：${names} 净流出`);
  }
  if (breadth && (breadth.up || breadth.down)) {
    const total = breadth.up + breadth.down + breadth.flat;
    const ratio = total ? ((breadth.up / total) * 100).toFixed(1) : "--";
    parts.push(`涨跌家数 ${fmtInt(breadth.up)} / ${fmtInt(breadth.down)}，上涨占比 ${ratio}%`);
  }
  return parts.join("；") + "。";
}

/* ---------------- 动态：3 条行业配置研判 ---------------- */
interface DynThesis {
  title: string;
  rating: string;
  body: string;
  chips: string[];
  invalid: string;
}
function buildThesis(data: DashboardData): DynThesis[] {
  const cards: DynThesis[] = [];
  const sectors = data.sectors || [];
  if (sectors.length) {
    const sorted = [...sectors].sort((a, b) => b.mainflow - a.mainflow);
    const topIn = sorted[0];
    const outSorted = [...sectors]
      .filter((s) => s.mainflow < 0)
      .sort((a, b) => a.mainflow - b.mainflow)[0];
    if (topIn)
      cards.push({
        title: `${topIn.name} 主力净流入居首`,
        rating: "超配(观察)",
        body: `${topIn.name} 当日主力净流入 ${sgn(topIn.mainflow)}${fx(
          topIn.mainflow
        )} 亿、涨跌幅 ${sgn(topIn.pct)}${fx(topIn.pct)}%，为全市场资金最强聚集地。建议作为本期核心超配方向，但需观察次日资金是否延续。`,
        chips: [
          `${topIn.name} ${sgn(topIn.pct)}${fx(topIn.pct)}%`,
          `主力 ${sgn(topIn.mainflow)}${fx(topIn.mainflow)}亿`,
        ],
        invalid: `若 ${topIn.name} 主力净流入连续 2 日回落且转负，则资金主线逻辑证伪。`,
      });
    if (outSorted)
      cards.push({
        title: `${outSorted.name} 资金净流出居首`,
        rating: "标配 / 低配",
        body: `${outSorted.name} 当日主力净流出 ${fx(
          outSorted.mainflow
        )} 亿、涨跌幅 ${sgn(outSorted.pct)}${fx(
          outSorted.pct
        )}%，为失血最严重方向。建议维持标配或适度低配，警惕继续走弱。`,
        chips: [
          `${outSorted.name} ${sgn(outSorted.pct)}${fx(outSorted.pct)}%`,
          `主力 ${fx(outSorted.mainflow)}亿`,
        ],
        invalid: `若 ${outSorted.name} 重新获得主力净流入，则失血逻辑缓解。`,
      });
  }
  const sm = data.styleMatrix || [];
  if (sm.length) {
    const maxC = [...sm].sort((a, b) => b.pct - a.pct)[0];
    const minC = [...sm].sort((a, b) => a.pct - b.pct)[0];
    cards.push({
      title: `风格：${maxC.name} 占优`,
      rating: "关注",
      body: `当前巨潮风格中 ${maxC.name} 最强（${sgn(maxC.pct)}${fx(
        maxC.pct
      )}%）、${minC.name} 最弱（${sgn(minC.pct)}${fx(
        minC.pct
      )}%）。风格剪刀差指向${
        maxC.name.includes("成长") ? "成长" : "价值"
      }占优，建议敞口向该风格倾斜。`,
      chips: [
        `${maxC.name} ${sgn(maxC.pct)}${fx(maxC.pct)}%`,
        `${minC.name} ${sgn(minC.pct)}${fx(minC.pct)}%`,
      ],
      invalid: `若风格强弱反转（${minC.name} 反超），则本轮风格判断失效。`,
    });
  }
  return cards.slice(0, 3);
}

/* ---------------- 北向 SVG 图 ---------------- */
interface NbColors {
  grid: string;
  axis: string;
  amber: string;
  cyan: string;
  dot: string;
}
function NorthboundChart({
  series,
  colors,
}: {
  series: DashboardData["northbound"]["series"];
  colors: NbColors;
}) {
  if (!series || series.length === 0) return null;
  const W = 560,
    H = 210,
    ml = 44,
    mr = 42,
    mt = 16,
    mb = 28;
  const iw = W - ml - mr,
    ih = H - mt - mb;
  const amts = series.map((d) => d.amount);
  const rats = series.map((d) => d.pctOfMarket);
  const aMax = Math.max(...amts) * 1.05;
  const aMin = Math.min(...amts) * 0.95;
  const rMax = Math.max(...rats) * 1.1;
  const rMin = Math.min(...rats) * 0.9;
  const bw = (iw / series.length) * 0.56;
  const xc = (i: number) => ml + (iw / series.length) * (i + 0.5);
  const yA = (v: number) => mt + ih - ((v - aMin) / (aMax - aMin)) * ih;
  const yR = (v: number) => mt + ih - ((v - rMin) / (rMax - rMin)) * ih;

  const grid = [];
  for (let v = Math.ceil(aMin / 350) * 350; v <= aMax; v += 350) {
    grid.push(
      <g key={"g" + v}>
        <line x1={ml} y1={yA(v)} x2={W - mr} y2={yA(v)} stroke={colors.grid} strokeWidth={1} />
        <text x={ml - 7} y={yA(v) + 3.5} fill={colors.axis} fontSize={9} textAnchor="end" fontFamily="monospace">
          {v}
        </text>
      </g>
    );
  }
  const rTicks = [12, 13, 14, 15, 16].filter((v) => v >= rMin && v <= rMax);
  const rAxis = rTicks.map((v) => (
    <text key={"r" + v} x={W - mr + 7} y={yR(v) + 3.5} fill={colors.amber} fontSize={9} fontFamily="monospace">
      {v}%
    </text>
  ));

  const bars = series.map((d, i) => {
    const y = yA(d.amount);
    const h = mt + ih - y;
    const last = i === series.length - 1;
    return (
      <g key={"b" + i}>
        <rect x={xc(i) - bw / 2} y={y} width={bw} height={h} rx={2} fill="url(#rt-gb)" opacity={last ? 1 : 0.72} />
        {last && (
          <rect x={xc(i) - bw / 2} y={y} width={bw} height={h} rx={2} fill="none" stroke={colors.cyan} strokeWidth={1.2} />
        )}
        <text x={xc(i)} y={H - 9} fill={last ? colors.cyan : colors.axis} fontSize={9} textAnchor="middle" fontFamily="monospace">
          {d.date}
        </text>
      </g>
    );
  });

  const pts = series.map((d, i) => `${xc(i)},${yR(d.pctOfMarket)}`).join(" ");
  const dots = series.map((d, i) => (
    <circle key={"c" + i} cx={xc(i)} cy={yR(d.pctOfMarket)} r={2.8} fill={colors.dot} stroke={colors.amber} strokeWidth={1.6} />
  ));
  const last = series[series.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="rt-gb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#14607a" />
        </linearGradient>
      </defs>
      {grid}
      {rAxis}
      {bars}
      <polyline points={pts} fill="none" stroke={colors.amber} strokeWidth={1.8} strokeLinejoin="round" />
      {dots}
      <text x={xc(series.length - 1)} y={yR(last.pctOfMarket) - 9} fill={colors.amber} fontSize={9} textAnchor="middle" fontFamily="monospace">
        {last.pctOfMarket}%
      </text>
      <text x={xc(series.length - 1)} y={yA(last.amount) - 6} fill={colors.cyan} fontSize={9.5} textAnchor="middle" fontFamily="monospace">
        {last.amount}
      </text>
    </svg>
  );
}

/* ---------------- 主组件 ---------------- */
const TABS = [
  { id: "overview", label: "概览" },
  { id: "sector", label: "行业" },
  { id: "style", label: "风格" },
  { id: "north", label: "北向" },
  { id: "thesis", label: "研判" },
  { id: "source", label: "说明" },
] as const;

export default function RotationTerminal({
  data,
  lastUpdate,
  refreshing = false,
  onRefresh,
}: {
  data: DashboardData;
  lastUpdate?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const isLight = useThemeStore((s) => s.mode === "light");
  const navigate = useNavigate();
  const [tab, setTab] = useState<string>("overview");
  const [heatAll, setHeatAll] = useState(false);
  const [flowSqrt, setFlowSqrt] = useState(false);

  const sectors = data.sectors || [];
  const indices = data.indices || [];
  const breadth = data.breadth || { up: 0, down: 0, flat: 0, amount: 0 };
  const styleMatrix = data.styleMatrix || [];
  const nb = data.northbound || { series: [], top10: [] };

  const narrative = useMemo(() => buildNarrative(sectors, breadth), [sectors, breadth]);
  const thesis = useMemo(() => buildThesis(data), [data]);

  // 市场温度（启发式：涨跌家数占比 60% + 上涨行业占比 40%）
  const breadthTotal = breadth.up + breadth.down + breadth.flat;
  const breadthPct = breadthTotal ? (breadth.up / breadthTotal) * 100 : null;
  const risingSectors = sectors.filter((s) => s.pct > 0).length;
  const sectorPct = sectors.length ? (risingSectors / sectors.length) * 100 : null;
  const temp = useMemo(() => {
    if (breadthPct != null && sectorPct != null) return Math.round(breadthPct * 0.6 + sectorPct * 0.4);
    if (breadthPct != null) return Math.round(breadthPct);
    if (sectorPct != null) return Math.round(sectorPct);
    return null;
  }, [breadthPct, sectorPct]);
  const tempLabel = temp == null ? "--" : temp >= 60 ? "偏热" : temp <= 40 ? "偏冷" : "中性";
  const tempColor = temp == null ? "var(--txt3)" : temp >= 60 ? "var(--up)" : temp <= 40 ? "var(--dn)" : "var(--am)";

  // 热力网格：核心=主力净流入绝对值前 16；全部=所有行业（按净额排序）
  const heatList = useMemo(() => {
    if (heatAll) return [...sectors].sort((a, b) => b.mainflow - a.mainflow);
    return [...sectors]
      .sort((a, b) => Math.abs(b.mainflow) - Math.abs(a.mainflow))
      .slice(0, 16);
  }, [sectors, heatAll]);

  // 资金排行
  const flowSorted = useMemo(() => [...sectors].sort((a, b) => b.mainflow - a.mainflow), [sectors]);
  const MAXF = useMemo(() => (sectors.length ? Math.max(...sectors.map((s) => Math.abs(s.mainflow))) : 1), [sectors]);
  const inCount = sectors.filter((s) => s.mainflow > 0).length;
  const outCount = sectors.filter((s) => s.mainflow < 0).length;

  // 风格矩阵 + 剪刀差
  const styleByName = (n: string) => styleMatrix.find((s: StyleCell) => s.name === n);
  const spreads = useMemo(() => {
    const out: { l: string; v: number }[] = [];
    const growth = ["大盘成长", "中盘成长", "小盘成长"].map((n) => styleByName(n)?.pct).filter((x): x is number => x != null);
    const value = ["大盘价值", "中盘价值", "小盘价值"].map((n) => styleByName(n)?.pct).filter((x): x is number => x != null);
    if (growth.length && value.length)
      out.push({ l: "成长 − 价值（全规模）", v: avg(growth) - avg(value) });
    const sg = styleByName("小盘成长")?.pct,
      lg = styleByName("大盘成长")?.pct;
    if (sg != null && lg != null) out.push({ l: "小盘 − 大盘（成长内）", v: sg - lg });
    const mc = styleByName("中盘成长")?.pct,
      lv = styleByName("大盘价值")?.pct;
    if (mc != null && lv != null) out.push({ l: "中盘成长 − 大盘价值", v: mc - lv });
    const z1000 = indices.find((i) => i.name === "中证1000")?.pct;
    const hs300 = indices.find((i) => i.name === "沪深300")?.pct;
    if (z1000 != null && hs300 != null) out.push({ l: "中证1000 − 沪深300", v: z1000 - hs300 });
    return out;
  }, [styleMatrix, indices]);
  const maxP = styleMatrix.length ? Math.max(...styleMatrix.map((s) => s.pct)) : 0;
  const minP = styleMatrix.length ? Math.min(...styleMatrix.map((s) => s.pct)) : 0;

  // 北向十大成交股按 channel 分
  const shTop = (nb.top10 || []).filter((s: NorthboundStock) => s.market === "sh");
  const szTop = (nb.top10 || []).filter((s: NorthboundStock) => s.market === "sz");
  const nbLast = nb.series && nb.series.length ? nb.series[nb.series.length - 1] : null;

  const nbColors: NbColors = isLight
    ? { grid: "rgba(148,163,184,.28)", axis: "#64748B", amber: "#B8860B", cyan: "#0E9BB0", dot: "#FFFFFF" }
    : { grid: "#1c2635", axis: "#5c6b80", amber: "#fbbf24", cyan: "#22d3ee", dot: "#0d1219" };

  // 图例色条
  const legendBars = Array.from({ length: 22 }, (_, i) => {
    const p = -5 + (i * 10) / 21;
    return <i key={i} style={{ background: Math.abs(p) < 0.24 ? "var(--rt-grid)" : heatColor(p, isLight).bg }} />;
  });

  return (
    <div className="rt-root">
      {/* 顶部品牌 + 数据日期/时间 */}
      <header className="rt-head">
        <div className="rt-brand">
          <span className="rt-dot" />
          <span className="full">A股行业轮动与资金流向</span>
          <span className="mini">行情 · 行业轮动</span>
        </div>
        <div className="rt-head-meta">
          <span className="tag k">数据日期 {data.date}</span>
          <span className="tag live">
            <i className="blip" />
            {lastUpdate || data.asOf || "--"}
          </span>
        </div>
      </header>

      {/* 常驻标签栏（吸顶）：切换聚焦视图 + 刷新 */}
      <nav className="rt-tabs" role="tablist" aria-label="行情板块">
        <div className="rt-tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={"rt-tab" + (tab === t.id ? " on" : "")}
              type="button"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {onRefresh && (
          <button
            className={"rt-rf" + (refreshing ? " spin" : "")}
            type="button"
            onClick={onRefresh}
            aria-label="刷新行情"
            disabled={refreshing}
          >
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.67" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M13.2 2.2v2.7h-2.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </nav>

      {/* ============ 概览 ============ */}
      <section className={"rt-sec" + (tab === "overview" ? " active" : "")} data-tab="overview">
        {/* 市场温度仪表 + 指数横滑 */}
        <div className="rt-hero">
          <div className="rt-gauge">
            <div className="rt-gauge-l">市场温度</div>
            <div className="rt-gauge-v num" style={{ color: tempColor }}>
              {temp == null ? "--" : temp + "°"}
            </div>
            <div className="rt-gauge-s" style={{ color: tempColor }}>
              {tempLabel}
            </div>
            <div className="rt-gauge-bar">
              <i style={{ width: (temp ?? 0) + "%", background: tempColor }} />
            </div>
          </div>
          <div className="rt-idxcol">
            <div className="rt-idxhead">
              <span>主流指数</span>
              <span className="rt-idxhint">点击查看分时 ›</span>
            </div>
            <div className="rt-idxscroll">
              {indices.map((i) => (
                <button
                  type="button"
                  key={i.code}
                  className={"rt-idxchip " + (i.pct >= 0 ? "u" : "d")}
                  onClick={() => navigate(`/market?code=${i.code}`)}
                  aria-label={`查看 ${i.name} 分时走势`}
                >
                  <span className="n">{i.name}</span>
                  <span className="v num">{i.value != null ? fmtInt(i.value) : "--"}</span>
                  <span className={"c num " + cls(i.pct)}>
                    {sgn(i.pct)}
                    {fx(i.pct)}%
                  </span>
                  <span className="go" aria-hidden="true">
                    分时
                    <svg viewBox="0 0 12 12" width="10" height="10">
                      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              ))}
              {indices.length === 0 && <div className="rt-idxchip">指数加载中…</div>}
            </div>
          </div>
        </div>

        {/* 关键统计条 */}
        <div className="strip">
          <div className="st">
            <div className="l">两市成交额</div>
            <div className="v num">{breadth.amount ? fmtInt(breadth.amount) + " 亿" : "--"}</div>
            <div className="x">沪深两市合计</div>
          </div>
          <div className="st">
            <div className="l">涨 / 跌 家数</div>
            <div className="v num">
              <span className="up">{fmtInt(breadth.up)}</span> / <span className="dn">{fmtInt(breadth.down)}</span>
            </div>
            <div className="x">
              上涨占比{" "}
              {breadthTotal ? ((breadth.up / breadthTotal) * 100).toFixed(1) : "--"}%
            </div>
          </div>
          <div className="st">
            <div className="l">全市场主力净流入</div>
            <div className={`v num ${cls(data.mainFlowTotal)}`}>
              {sgn(data.mainFlowTotal)}
              {fx(data.mainFlowTotal)} 亿
            </div>
            <div className="x">申万行业合计</div>
          </div>
          <div className="st">
            <div className="l">行业净流入 / 净流出</div>
            <div className="v num">
              <span className="up">{inCount}</span> / <span className="dn">{outCount}</span>
            </div>
            <div className="x">共 {sectors.length} 个行业</div>
          </div>
          <div className="st">
            <div className="l">北向最新成交</div>
            <div className="v num" style={{ color: "var(--cy)" }}>
              {nbLast ? fmtInt(nbLast.amount) + " 亿" : "--"}
            </div>
            <div className="x">占两市 {nbLast ? nbLast.pctOfMarket + "%" : "--"}</div>
          </div>
        </div>

        {/* 今日资金主线（动态） */}
        <div className="mainline">
          <div className="h">▍今日资金主线（动态生成）</div>
          <div className="b">{narrative}</div>
        </div>
      </section>

      {/* ============ 行业 ============ */}
      <section className={"rt-sec" + (tab === "sector" ? " active" : "")} data-tab="sector">
        <div className="grid g-main">
          <div className="panel">
            <div className="ph">
              <div className="pt r">一级行业涨跌热力网格</div>
              <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <span className="phint">深浅表强度</span>
                <div className="seg">
                  <button className={!heatAll ? "on" : ""} onClick={() => setHeatAll(false)}>
                    核心 16
                  </button>
                  <button className={heatAll ? "on" : ""} onClick={() => setHeatAll(true)}>
                    全部 {sectors.length}
                  </button>
                </div>
              </div>
            </div>
            <div className="pb">
              <div id="heat" className={heatAll ? "all" : ""}>
                {heatList.map((s, i) => {
                  const hc = heatColor(s.pct, isLight);
                  return (
                    <div
                      key={s.name}
                      className="hc"
                      style={{ background: hc.bg, color: hc.fg }}
                      title={`${s.name}｜涨跌 ${sgn(s.pct)}${fx(s.pct)}%｜主力净流入 ${sgn(s.mainflow)}${fx(s.mainflow)}亿`}
                    >
                      <div>
                        <div className="rk">#{i + 1}</div>
                        <div className="nm">{s.name}</div>
                      </div>
                      <div>
                        <div className="pc">
                          {sgn(s.pct)}
                          {fx(s.pct)}%
                        </div>
                        <div className="fl">主力 {sgn(s.mainflow)}{fx(s.mainflow, 2)} 亿</div>
                      </div>
                    </div>
                  );
                })}
                {heatList.length === 0 && <div style={{ color: "var(--txt3)" }}>行业数据加载中…</div>}
              </div>
              <div className="legend">
                <span>−5%</span>
                <div className="lbar">{legendBars}</div>
                <span>+5%</span>
                <span className="legend-note">格内第二行为当日主力净流入（亿元）</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="ph">
              <div className="pt a">主力资金行业净流入排行</div>
              <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <span className="phint">单位：亿元</span>
                <div className="seg">
                  <button className={!flowSqrt ? "on" : ""} onClick={() => setFlowSqrt(false)}>
                    线性
                  </button>
                  <button className={flowSqrt ? "on" : ""} onClick={() => setFlowSqrt(true)}>
                    √ 缩放
                  </button>
                </div>
              </div>
            </div>
            <div className="pb">
              <div className="flowhdr">
                <span>行业</span>
                <span style={{ textAlign: "center" }}>← 净流出　│　净流入 →</span>
                <span style={{ textAlign: "right" }}>净额(亿)</span>
              </div>
              <div id="flow">
                {flowSorted.map((s) => {
                  const raw = Math.abs(s.mainflow) / (MAXF || 1);
                  const w = (flowSqrt ? Math.sqrt(raw) : raw) * 49.5;
                  const hot = Math.abs(s.mainflow) >= 20 ? " hot" : "";
                  return (
                    <div
                      key={s.name}
                      className="fr"
                      title={`${s.name}｜涨跌 ${sgn(s.pct)}${fx(s.pct)}%｜净额 ${sgn(s.mainflow)}${fx(s.mainflow)}亿`}
                    >
                      <div className={"nm" + hot}>{s.name}</div>
                      <div className="axis">
                        <div className={`bar ${s.mainflow >= 0 ? "i" : "o"}`} style={{ width: Math.max(w, 0.35) + "%" }} />
                      </div>
                      <div className={`vl num ${cls(s.mainflow)}`}>
                        {sgn(s.mainflow)}
                        {fx(s.mainflow)}
                      </div>
                    </div>
                  );
                })}
                {flowSorted.length === 0 && <div style={{ color: "var(--txt3)" }}>资金流数据加载中…</div>}
              </div>
              <div className="fnote">
                <span>
                  {inCount} 个行业净流入 · {outCount} 个行业净流出
                </span>
                <span>合计 {sgn(data.mainFlowTotal)}{fx(data.mainFlowTotal)} 亿</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 风格 ============ */}
      <section className={"rt-sec" + (tab === "style" ? " active" : "")} data-tab="style">
        <div className="panel">
          <div className="ph">
            <div className="pt v">风格轮动强弱矩阵</div>
            <div className="phint">巨潮风格指数（399372–399377）· 实时</div>
          </div>
          <div className="pb">
            {styleMatrix.length === 0 ? (
              <div style={{ color: "var(--txt3)", fontSize: 12 }}>巨潮风格指数暂不可用，请检查行情源。</div>
            ) : (
              <>
                <div className="sbox">
                  <div className="hd" />
                  <div className="hd">价值 VALUE</div>
                  <div className="hd">成长 GROWTH</div>
                  {["大盘", "中盘", "小盘"].map((r) => (
                    <React.Fragment key={r}>
                      <div className="rl">{r}</div>
                      {["价值", "成长"].map((c) => {
                        const k = r + c;
                        const s = styleByName(k);
                        if (!s) return <div key={k} className="sc" />;
                        const crown =
                          s.pct === maxP ? (
                            <span className="crown s">最强</span>
                          ) : s.pct === minP ? (
                            <span className="crown w">最弱</span>
                          ) : null;
                        const bg = styleBg(s.pct, isLight);
                        return (
                          <div key={k} className="sc" style={{ background: bg }}>
                            {crown}
                            <div className={`p num ${cls(s.pct)}`}>
                              {sgn(s.pct)}
                              {fx(s.pct)}%
                            </div>
                            <div className="n">{s.pct >= 0 ? "+" : ""}{fx(s.pct)}</div>
                            <div
                              className="b"
                              style={{
                                width: Math.min((Math.abs(s.pct) / 2.2) * 100, 100) + "%",
                                background: s.pct >= 0 ? "var(--up)" : "var(--dn)",
                              }}
                            />
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
                <div className="spread">
                  <div className="spread-h">风格剪刀差（当日超额，pct）</div>
                  {spreads.map((s) => {
                    const w = (Math.abs(s.v) / (Math.max(...spreads.map((x) => Math.abs(x.v))) || 1)) * 49;
                    return (
                      <div key={s.l} className="spr">
                        <div className="lb">{s.l}</div>
                        <div className="tr">
                          <div
                            className="fi"
                            style={{
                              [s.v >= 0 ? "left" : "right"]: "50%",
                              width: w + "%",
                              background:
                                s.v >= 0
                                  ? "linear-gradient(90deg,rgba(255,77,79,.45),var(--up))"
                                  : "linear-gradient(270deg,rgba(18,196,108,.45),var(--dn))",
                            }}
                          />
                        </div>
                        <div className={`vv num ${cls(s.v)}`}>
                          {sgn(s.v)}
                          {fx(s.v)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ============ 北向 ============ */}
      <section className={"rt-sec" + (tab === "north" ? " active" : "")} data-tab="north">
        <div className="panel">
          <div className="ph">
            <div className="pt">北向资金动向与趋势</div>
            <div className="phint">沪深港通官方披露口径</div>
          </div>
          <div className="pb">
            <div className="warn">
              <b>⚠ 口径必读：</b>自 2024-08-19 起，沪深港通已<b>停止实时披露北向资金每日净买入额</b>，
              官方仅提供<b>每日总成交额</b>、十大活跃成交股与<b>季度持股数据</b>。
              因此本模块以「成交额 + 成交占比」为核心趋势指标；日度「净买入」仅在龙虎榜个股层面可得，样本有偏，不代表全口径。
            </div>
            <div className="nbstat">
              <div className="nb">
                <div className="l">最新北向总成交</div>
                <div className="v num">{nbLast ? fmtInt(nbLast.amount) + " 亿" : "--"}</div>
                <div className="x">{nbLast ? nbLast.date : "--"}</div>
              </div>
              <div className="nb">
                <div className="l">占两市总成交</div>
                <div className="v num" style={{ color: "var(--am)" }}>
                  {nbLast ? nbLast.pctOfMarket + "%" : "--"}
                </div>
                <div className="x">趋势指标</div>
              </div>
              <div className="nb">
                <div className="l">沪股通十大成交</div>
                <div className="v num" style={{ fontSize: 14 }}>
                  {shTop.length} 只
                </div>
                <div className="x">按成交额</div>
              </div>
              <div className="nb">
                <div className="l">深股通十大成交</div>
                <div className="v num" style={{ fontSize: 14 }}>
                  {szTop.length} 只
                </div>
                <div className="x">按成交额</div>
              </div>
            </div>
            <div className="chartbox">
              <NorthboundChart series={nb.series} colors={nbColors} />
              <div className="clg">
                <span>
                  <i style={{ background: "linear-gradient(180deg,#22d3ee,#1a7f96)" }} />
                  北向总成交额（亿元）
                </span>
                <span>
                  <i style={{ background: "var(--am)" }} />
                  占两市成交额比重（%）
                </span>
              </div>
            </div>
            <div className="split" style={{ marginTop: 13 }}>
              <div>
                <div className="split-h">沪股通十大成交股</div>
                <TopStockTable rows={shTop} />
              </div>
              <div>
                <div className="split-h">深股通十大成交股</div>
                <TopStockTable rows={szTop} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 研判 ============ */}
      <section className={"rt-sec" + (tab === "thesis" ? " active" : "")} data-tab="thesis">
        <div className="calls">
          {thesis.map((t, i) => (
            <div className="call" key={i}>
              <div className="ch">
                <div
                  className="no"
                  style={{
                    background:
                      i === 0
                        ? "var(--upBg)"
                        : i === 1
                        ? "var(--am-dim)"
                        : "var(--dnBg)",
                    color: i === 0 ? "var(--up)" : i === 1 ? "var(--am)" : "var(--dn)",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="ti">{t.title}</div>
                <div
                  className={
                    "rate " + (t.rating.includes("超配") ? "ow" : t.rating.includes("低配") ? "nw" : "uw")
                  }
                >
                  {t.rating}
                </div>
              </div>
              <div className="cb">{t.body}</div>
              <div className="rowk">
                {t.chips.map((c, j) => (
                  <span className="chip" key={j}>
                    {c}
                  </span>
                ))}
              </div>
              <div className="evi">
                <b>证伪条件：</b>
                {t.invalid}
              </div>
            </div>
          ))}
          {thesis.length === 0 && (
            <div style={{ color: "var(--txt3)" }}>数据不足，暂无法生成研判。</div>
          )}
        </div>
      </section>

      {/* ============ 说明 ============ */}
      <section className={"rt-sec" + (tab === "source" ? " active" : "")} data-tab="source">
        <div className="panel">
          <div className="ph">
            <div className="pt">数据来源、口径与缺口说明</div>
            <div className="phint">所有数字可追溯 · 未采集项已标注</div>
          </div>
          <div className="pb">
            <div className="src">
              <div className="split">
                <div>
                  <b>数据来源</b>
                  <ul>
                    <li><b>指数行情：</b>腾讯/新浪实时快照 + 东方财富兜底</li>
                    <li><b>行业涨跌与主力资金：</b>东方财富 push2 行业板块接口（服务端聚合）</li>
                    <li><b>涨跌家数 / 两市成交：</b>东方财富指数成分股聚合</li>
                    <li><b>巨潮 6 风格指数：</b>东方财富 ulist（399372–399377）</li>
                    <li><b>北向成交额与十大成交股：</b>东方财富沪深港通接口</li>
                  </ul>
                </div>
                <div>
                  <b>口径差异与数据缺口</b>
                  <ul>
                    {(data.notes || []).map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                    <li><b>北向净买入不可得：</b>2024-08-19 起停止实时披露，本仪表盘以成交额与占比替代。</li>
                    <li><b>研判性质：</b>3 条配置研判由模型基于实时数据自动汇总，非事实陈述，亦非投资建议。</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer>
        研股股 · 股票研究终端 &nbsp;|&nbsp; 数据日期 {data.date} &nbsp;|&nbsp; 实时聚合 &nbsp;|&nbsp; 涨红跌绿（A股惯例）
        <br />
        <span className="dis">本报告仅供研究参考，不构成个人投资建议。市场有风险，决策需独立判断。</span>
      </footer>
    </div>
  );
}

function TopStockTable({ rows }: { rows: NorthboundStock[] }) {
  if (!rows || rows.length === 0)
    return <div style={{ fontSize: 11, color: "var(--txt3)" }}>暂无数据</div>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>证券</th>
          <th className="r">{rows[0].amount != null ? "成交额(亿)" : "净买入(亿)"}</th>
          <th className="r">涨跌幅</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.code}>
            <td>
              <span className={"mkt " + (s.market || "sh")}>{s.market ? s.market.toUpperCase() : "SH"}</span>
              {s.name}
            </td>
            <td className="r">
              {s.amount != null ? s.amount.toFixed(2) : s.net != null ? s.net.toFixed(2) : "--"}
            </td>
            <td className={`r ${cls(s.pct ?? 0)}`}>
              {s.pct != null ? `${sgn(s.pct)}${s.pct.toFixed(2)}%` : "--"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
