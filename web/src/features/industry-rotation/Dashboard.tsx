// ============================================================================
// Dashboard.tsx —— 编排组件
//   · IndustryRotationDashboard  纯展示组件（喂 DashboardData 即可，便于测试/静态嵌入）
//   · LiveIndustryRotationDashboard 实时版（接数据源，秒级轮询）
// ============================================================================
import React from "react";
import {
  MarketOverview,
  HeatGrid,
  MainFlowBars,
  StyleMatrix,
  Northbound,
  ThesisPanel,
} from "./components";
import { useMarketData } from "./useMarketData";
import { fetchYourApi } from "./sources/yourApiSource";
import { fetchEastmoney } from "./sources/eastmoneySource";
import type { DashboardData } from "./types";
import "./theme.css";

export interface DataSourceConfig {
  /** 你的软件行情接口地址；不填则只用回退源 */
  primaryUrl?: string;
  /** 回退数据源，默认 'eastmoney'；设为 null 关闭回退 */
  fallback?: "eastmoney" | null;
  /** 轮询间隔(ms)，默认 1000（秒级） */
  pollIntervalMs?: number;
}

/** 纯展示组件：传入任意符合 DashboardData 的数据即可渲染（静态/测试用） */
export function IndustryRotationDashboard({
  data,
  lastUpdate,
}: {
  data: DashboardData;
  lastUpdate?: string;
}) {
  return (
    <div className="ird-root">
      <header className="ird-header">
        <h1>A股行业轮动与资金流向监控</h1>
        <div className="ird-meta">
          数据日期 {data.date}
          {lastUpdate ? " · 更新 " + lastUpdate : ""}
        </div>
      </header>

      <MarketOverview data={data} />
      <HeatGrid sectors={data.sectors} />
      <MainFlowBars sectors={data.sectors} total={data.mainFlowTotal} />
      <StyleMatrix cells={data.styleMatrix} />
      <Northbound nb={data.northbound} />
      <ThesisPanel thesis={data.thesis} />

      {data.notes && data.notes.length > 0 && (
        <footer className="ird-notes">
          <ul>
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </footer>
      )}
    </div>
  );
}

/** 实时组件：接数据源，默认秒级轮询 */
export function LiveIndustryRotationDashboard({ config }: { config: DataSourceConfig }) {
  const { data, error, lastUpdate, loading } = useMarketData({
    primary: config.primaryUrl ? () => fetchYourApi(config.primaryUrl!) : undefined,
    fallback: config.fallback === "eastmoney" ? fetchEastmoney : undefined,
    pollIntervalMs: config.pollIntervalMs ?? 1000,
  });

  if (loading && !data) return <div className="ird-root ird-loading">行情加载中…</div>;
  if (error && !data)
    return <div className="ird-root ird-error">数据加载失败：{error.message}</div>;
  if (!data) return <div className="ird-root ird-loading">无数据</div>;

  return <IndustryRotationDashboard data={data} lastUpdate={lastUpdate ?? undefined} />;
}

export default LiveIndustryRotationDashboard;
