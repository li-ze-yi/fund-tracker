// ============================================================================
// 客户端 JSONP 数据源（东方财富 push2）
// ----------------------------------------------------------------------------
// 背景：生产服务器（机房 IP）被东财 push2 族 CDN 做了连接级封锁，服务端聚合接口
//   /api/market/rotation 的 sectors / breadth 会返回空（接口本身不报错，只是无数据）。
//   浏览器自身不在封锁范围内，且 push2 支持 cb= 回调，因此这里用 JSONP 直连补齐
//   行业板块与涨跌家数；服务端结果保留作为兜底。
//   JSONP 实现与 Referer 规避见 services/jsonp。
// ============================================================================
import type { SectorCell, Breadth } from "../types";
import { jsonp } from "@/services/jsonp";

const EM = "https://push2.eastmoney.com/api/qt";

/** 行业板块（东财行业板块涨跌 + 主力净流入 f62），返回 SectorCell[]。 */
export async function fetchSectorsJsonp(): Promise<SectorCell[]> {
  const j = await jsonp(
    `${EM}/clist/get?pn=1&pz=80&po=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=f12,f14,f2,f3,f62`
  );
  const diff: any[] = j?.data?.diff ?? [];
  return diff
    .filter((d) => d && d.f14)
    .map((d) => ({
      name: String(d.f14),
      pct: Number(d.f3),
      mainflow: d.f62 != null ? Number(d.f62) / 1e8 : 0, // 元 → 亿元，正=净流入
    }));
}

/** 涨跌家数 + 两市成交额（沪/深指数聚合；成交额由 f6 求和，元 → 亿元）。 */
export async function fetchBreadthJsonp(): Promise<Breadth> {
  const j = await jsonp(
    `${EM}/ulist.np/get?fltt=2&invt=2&fields=f12,f14,f104,f105,f106,f6&secids=1.000001,0.399001`
  );
  const diff: any[] = j?.data?.diff ?? [];
  let up = 0;
  let down = 0;
  let flat = 0;
  let amount = 0;
  diff.forEach((d) => {
    up += Number(d.f104) || 0;
    down += Number(d.f105) || 0;
    flat += Number(d.f106) || 0;
    amount += (Number(d.f6) || 0) / 1e8;
  });
  return { up, down, flat, amount };
}