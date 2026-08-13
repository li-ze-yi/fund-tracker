// ============================================================================
// 数据源 A：你的基金软件自有行情接口
// ----------------------------------------------------------------------------
// 你的软件既然已经订阅了行情/资金流，理论上后端已有这些数据。
// 这里只做一件事：把「你的接口返回的原始 JSON」映射成 DashboardData 契约。
//
// 用法：
//   1. 在你后端新增一个聚合接口（或前端直接聚合多个已有接口），
//      返回下面 adaptFromYourApi() 里 raw 对应的结构；
//   2. 填好映射；3. 在 LiveIndustryRotationDashboard 的 config.primary.url 指过去。
//
// 如果你的后端只提供「单只股票/单指数」接口，没有聚合接口，
// 也可以在前端并行 fetch 多个接口再拼成 raw —— 把 fetchYourApi 改写即可。
// ============================================================================
import type { DashboardData } from "../types";

/**
 * 把你的接口原始返回映射成 DashboardData。
 * 下面是一份「示例骨架」——请把字段名换成你真实的字段。
 * 只要保证返回结构符合 DashboardData，视图层就能正确渲染。
 */
export function adaptFromYourApi(raw: any): DashboardData {
  // ===== TODO: 按你的真实接口字段修改下面每一行 =====
  return {
    date: raw.date, // "2026-08-07"
    asOf: raw.asOf, // "15:00:00"（可选）
    indices: (raw.indices ?? []).map((x: any) => ({
      name: x.name,
      code: String(x.code),
      pct: Number(x.pct),
      value: x.value != null ? Number(x.value) : undefined,
      amount: x.amount != null ? Number(x.amount) : undefined, // 亿元
    })),
    sectors: (raw.sectors ?? []).map((x: any) => ({
      name: x.name,
      pct: Number(x.pct),
      mainflow: Number(x.mainflow), // 亿元，正=流入
    })),
    styleMatrix: (raw.styleMatrix ?? []).map((x: any) => ({
      name: x.name,
      pct: Number(x.pct),
    })),
    northbound: {
      series: (raw.northbound?.series ?? []).map((x: any) => ({
        date: x.date,
        amount: Number(x.amount),
        pctOfMarket: Number(x.pctOfMarket),
      })),
      top10: (raw.northbound?.top10 ?? []).map((x: any) => ({
        name: x.name,
        code: String(x.code),
        net: x.net != null ? Number(x.net) : undefined,
      })),
      note: raw.northbound?.note,
    },
    breadth: {
      up: Number(raw.breadth?.up ?? 0),
      down: Number(raw.breadth?.down ?? 0),
      flat: Number(raw.breadth?.flat ?? 0),
      amount: Number(raw.breadth?.amount ?? 0),
    },
    mainFlowTotal: Number(raw.mainFlowTotal ?? 0),
    thesis: (raw.thesis ?? []).map((x: any) => ({
      title: x.title,
      rating: x.rating,
      body: x.body,
      invalid: x.invalid,
      next: x.next,
    })),
    notes: raw.notes,
  };
}

/** 拉取你的接口并映射。失败会抛错，由 useMarketData 决定回退。 */
export async function fetchYourApi(url: string): Promise<DashboardData> {
  const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`your api ${r.status}`);
  return adaptFromYourApi(await r.json());
}
