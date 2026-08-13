// ============================================================================
// 展示组件（纯函数，不依赖任何数据源）
// 全部接收 DashboardData 或其子结构作为 props；颜色遵循 A股 涨红跌绿。
// ============================================================================
import React, { useState } from "react";
import type {
  IndexQuote,
  SectorCell,
  StyleCell,
  NorthboundPoint,
  NorthboundStock,
  Breadth,
  Thesis,
  DashboardData,
} from "../types";

// ---------- 工具函数 ----------
export const pctClass = (p: number) => (p > 0 ? "ird-up" : p < 0 ? "ird-down" : "ird-flat");
export const pctColor = (p: number) =>
  p > 0 ? "var(--ird-red)" : p < 0 ? "var(--ird-green)" : "var(--ird-text-dim)";
export const fmtPct = (p: number) => `${p > 0 ? "+" : ""}${p.toFixed(2)}%`;
export const fmtYi = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)} 亿`;

/** 热力单元格背景：色相按涨跌，透明度按强度（|pct| 越大越深） */
function heatBg(p: number, maxAbs: number): string {
  const a = Math.min(0.85, (Math.abs(p) / (maxAbs || 1)) * 0.85 + 0.06);
  return p >= 0 ? `rgba(255,77,79,${a.toFixed(3)})` : `rgba(38,166,154,${a.toFixed(3)})`;
}

// 默认展示的 16 个核心行业（可一键展开到全部 31 个）
const CORE16 = [
  "电子", "医药生物", "计算机", "机械设备", "电力设备", "汽车", "通信",
  "有色金属", "基础化工", "国防军工", "食品饮料", "银行", "非银金融",
  "公用事业", "煤炭", "石油石化",
];

// ---------- 大盘概览 ----------
export function MarketOverview({ data }: { data: DashboardData }) {
  const { indices, breadth, mainFlowTotal } = data;
  return (
    <section className="ird-section">
      <h3 className="ird-section-title">大盘概览 · 今日资金主线</h3>
      <div className="ird-indices">
        {indices.map((x: IndexQuote) => (
          <div className="ird-idx-card" key={x.code}>
            <div className="ird-idx-name">{x.name}</div>
            <div className="ird-idx-val" style={{ color: pctColor(x.pct) }}>
              {x.value != null ? x.value.toFixed(2) : "—"}
            </div>
            <div className={"ird-idx-pct " + pctClass(x.pct)}>{fmtPct(x.pct)}</div>
          </div>
        ))}
      </div>
      <div className="ird-breadth">
        <span>两市成交 <b>{breadth.amount.toFixed(0)} 亿</b></span>
        <span className="ird-up">涨 <b>{breadth.up}</b></span>
        <span className="ird-down">跌 <b>{breadth.down}</b></span>
        <span className="ird-flat">平 <b>{breadth.flat}</b></span>
        <span>
          全市场主力 <b className={mainFlowTotal >= 0 ? "ird-up" : "ird-down"}>
            {fmtYi(mainFlowTotal)}
          </b>
        </span>
      </div>
    </section>
  );
}

// ---------- 行业热力网格 ----------
export function HeatGrid({ sectors }: { sectors: SectorCell[] }) {
  const [showAll, setShowAll] = useState(false);
  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.pct)), 0.01);
  const list = showAll ? sectors : sectors.filter((s) => CORE16.includes(s.name)).slice(0, 16);
  const grid = list.length ? list : sectors.slice(0, 16);
  return (
    <section className="ird-section">
      <h3 className="ird-section-title">一级行业涨跌热力网格</h3>
      <div className="ird-toggle-row">
        <button className={"ird-toggle" + (!showAll ? " active" : "")} onClick={() => setShowAll(false)}>
          核心 16
        </button>
        <button className={"ird-toggle" + (showAll ? " active" : "")} onClick={() => setShowAll(true)}>
          全部 {sectors.length}
        </button>
      </div>
      <div className="ird-heat-grid">
        {grid.map((s) => (
          <div
            className="ird-heat-cell"
            key={s.name}
            style={{ background: heatBg(s.pct, maxAbs) }}
          >
            <div className="ird-heat-name">{s.name}</div>
            <div className="ird-heat-pct">{fmtPct(s.pct)}</div>
            <div className="ird-heat-flow">{fmtYi(s.mainflow)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- 主力资金双向条形 ----------
export function MainFlowBars({ sectors, total }: { sectors: SectorCell[]; total: number }) {
  const [sqrt, setSqrt] = useState(false);
  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.mainflow)), 0.01);
  const scale = (v: number) => {
    const r = sqrt ? Math.sqrt(Math.abs(v)) / Math.sqrt(maxAbs) : Math.abs(v) / maxAbs;
    return Math.min(50, r * 50); // 半幅最大 50%
  };
  const sorted = [...sectors].sort((a, b) => b.mainflow - a.mainflow);
  return (
    <section className="ird-section">
      <h3 className="ird-section-title">
        主力资金行业净流入排行（亿元）· 合计 {fmtYi(total)}
      </h3>
      <div className="ird-toggle-row">
        <button className={"ird-toggle" + (!sqrt ? " active" : "")} onClick={() => setSqrt(false)}>
          线性
        </button>
        <button className={"ird-toggle" + (sqrt ? " active" : "")} onClick={() => setSqrt(true)}>
          √ 缩放
        </button>
      </div>
      <div className="ird-bars">
        {sorted.map((s) => {
          const w = scale(s.mainflow);
          const pos = s.mainflow >= 0;
          return (
            <div className="ird-bar-row" key={s.name}>
              <div className="ird-bar-name">{s.name}</div>
              <div className="ird-bar-track">
                <div className="ird-bar-axis" />
                <div
                  className="ird-bar-fill"
                  style={{
                    background: pos ? "var(--ird-red)" : "var(--ird-green)",
                    width: `${w}%`,
                    left: pos ? "50%" : `${50 - w}%`,
                  }}
                />
              </div>
              <div className={"ird-bar-val " + (pos ? "pos" : "neg")}>
                {fmtYi(s.mainflow)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- 风格轮动矩阵 ----------
export function StyleMatrix({ cells }: { cells: StyleCell[] }) {
  const byName = (n: string) => cells.find((c) => c.name.includes(n))?.pct ?? 0;
  const scissors: { label: string; v: number }[] = [
    { label: "大盘成长 − 大盘价值", v: byName("大盘成长") - byName("大盘价值") },
    { label: "中盘成长 − 中盘价值", v: byName("中盘成长") - byName("中盘价值") },
    { label: "小盘成长 − 小盘价值", v: byName("小盘成长") - byName("小盘价值") },
    { label: "小盘成长 − 大盘成长", v: byName("小盘成长") - byName("大盘成长") },
    { label: "小盘价值 − 大盘价值", v: byName("小盘价值") - byName("大盘价值") },
    { label: "中盘成长 − 大盘价值", v: byName("中盘成长") - byName("大盘价值") },
  ];
  const maxAbs = Math.max(...scissors.map((s) => Math.abs(s.v)), 0.01);
  return (
    <section className="ird-section">
      <h3 className="ird-section-title">风格轮动强弱（巨潮 6 风格）</h3>
      <div className="ird-style-grid">
        {cells.map((c) => (
          <div className="ird-style-cell" key={c.name}>
            <div className="ird-style-name">{c.name}</div>
            <div className="ird-style-pct" style={{ color: pctColor(c.pct) }}>
              {fmtPct(c.pct)}
            </div>
          </div>
        ))}
      </div>
      <div className="ird-scissor">
        {scissors.map((s) => (
          <div className="ird-scissor-row" key={s.label}>
            <span>{s.label}</span>
            <div className="ird-scissor-track">
              <div
                className="ird-scissor-fill"
                style={{
                  background: s.v >= 0 ? "var(--ird-red)" : "var(--ird-green)",
                  width: `${(Math.abs(s.v) / maxAbs) * 50}%`,
                  left: s.v >= 0 ? "50%" : `${50 - (Math.abs(s.v) / maxAbs) * 50}%`,
                }}
              />
            </div>
            <span className={pctClass(s.v)}>{s.v > 0 ? "+" : ""}{s.v.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- 北向资金 ----------
export function Northbound({ nb }: { nb: DashboardData["northbound"] }) {
  const { series, top10, note } = nb;
  const W = 680, H = 220, padL = 36, padR = 36, padT = 16, padB = 24;
  const maxAmt = Math.max(...series.map((p) => p.amount), 1);
  const maxPct = Math.max(...series.map((p) => p.pctOfMarket), 0.1);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const bw = innerW / series.length;
  return (
    <section className="ird-section">
      <h3 className="ird-section-title">北向资金动向与趋势</h3>
      <div className="ird-nb">
        <div className="ird-nb-chart">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%">
            {series.map((p: NorthboundPoint, i) => {
              const h = (p.amount / maxAmt) * innerH;
              const x = padL + i * bw + bw * 0.15;
              const y = padT + innerH - h;
              const cx = padL + i * bw + bw / 2;
              const ly = padT + innerH - (p.pctOfMarket / maxPct) * innerH;
              return (
                <g key={p.date}>
                  <rect x={x} y={y} width={bw * 0.7} height={h} fill="rgba(77,159,255,.55)" rx={2} />
                  <circle cx={cx} cy={ly} r={2.5} fill="var(--ird-accent)" />
                  <text x={cx} y={H - 8} fontSize={9} fill="var(--ird-text-faint)" textAnchor="middle">
                    {p.date}
                  </text>
                </g>
              );
            })}
            {/* 占比折线 */}
            <polyline
              points={series
                .map((p, i) => {
                  const cx = padL + i * bw + bw / 2;
                  const ly = padT + innerH - (p.pctOfMarket / maxPct) * innerH;
                  return `${cx},${ly}`;
                })
                .join(" ")}
              fill="none" stroke="var(--ird-accent)" strokeWidth={1.5}
            />
          </svg>
          <div style={{ fontSize: 11, color: "var(--ird-text-faint)", marginTop: 4 }}>
            柱：北向成交额（亿） · 线：占两市成交 %
          </div>
        </div>
        <div className="ird-nb-list">
          <div style={{ fontSize: 12, color: "var(--ird-text-dim)", marginBottom: 6 }}>
            沪深股通成交活跃股（沪 + 深）
          </div>
          {top10.map((s: NorthboundStock) => (
            <div className="ird-nb-row" key={s.code}>
              <span>{s.name}</span>
              <span style={{ color: "var(--ird-text-faint)" }}>{s.code}</span>
              <span className={"ird-nb-net " + (s.net != null && s.net >= 0 ? "pos" : "neg")}>
                {s.net != null ? fmtYi(s.net) : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
      {note && (
        <div style={{ fontSize: 11, color: "var(--ird-text-faint)", marginTop: 8 }}>{note}</div>
      )}
    </section>
  );
}

// ---------- 配置研判 ----------
export function ThesisPanel({ thesis }: { thesis: Thesis[] }) {
  return (
    <section className="ird-section">
      <h3 className="ird-section-title">行业配置研判</h3>
      <div className="ird-thesis">
        {thesis.map((t, i) => (
          <div className="ird-thesis-card" key={i}>
            <h4>{t.title}</h4>
            <span className="ird-thesis-rating">{t.rating}</span>
            <div className="ird-thesis-body">{t.body}</div>
            {t.invalid && <div className="ird-thesis-meta">证伪：{t.invalid}</div>}
            {t.next && <div className="ird-thesis-meta">观测：{t.next}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
