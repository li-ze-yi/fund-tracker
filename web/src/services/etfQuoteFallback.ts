// ============================================================================
// 前端兜底：场内 ETF/LOF（含 ETF 联接基金的"母ETF"）实时行情
// ----------------------------------------------------------------------------
// 服务端 getETFRealtimeQuote 的数据源顺序是 push2 → 腾讯 → 新浪；其中 push2 会被
// 生产机房 IP 连接级封锁。当服务端最终取不到行情（update_status = 'no_estimate'）时，
// 由浏览器 JSONP 直连东财补齐（浏览器不在封锁范围）。
// 服务端已通过响应里的 etf_code 字段告知"母ETF代码"。
//
// 注意：东财 push2 的 `stock/get` 接口已不可用（返回连接被断），改用批量接口
//      `ulist.np/get`（f2=最新价、f3=涨跌幅，一次可带多个 secid）。
// ============================================================================
import { jsonp } from "./jsonp";

const EM = "https://push2.eastmoney.com/api/qt";

export interface EtfQuote {
  price: number | null;
  changePercent: number | null;
}

/** 场内代码市场前缀：深市 15/16 → 0，其余（沪市 51/56/58 等）→ 1（与后端一致） */
function emSecid(code: string): string {
  return `${code.startsWith("15") || code.startsWith("16") ? "0" : "1"}.${code}`;
}

interface UlistRow {
  f12?: string; // 代码
  f2?: number | null; // 最新价（fltt=2 → 已为小数）
  f3?: number | null; // 涨跌幅 %
}

/** 批量拉取场内 ETF/LOF 实时行情；返回 code → quote 映射，失败的 code 直接跳过。 */
export async function fetchEtfQuotes(
  codes: string[]
): Promise<Record<string, EtfQuote>> {
  const uniq = Array.from(new Set(codes.filter((c) => /^\d{6}$/.test(c || ""))));
  if (!uniq.length) return {};

  const j = await jsonp(
    `${EM}/ulist.np/get?fltt=2&invt=2&fields=f12,f14,f2,f3&secids=${uniq
      .map(emSecid)
      .join(",")}`
  );
  const diff: UlistRow[] = j?.data?.diff ?? [];
  const out: Record<string, EtfQuote> = {};
  diff.forEach((d) => {
    if (!d || !d.f12 || d.f2 == null) return;
    out[String(d.f12)] = {
      price: Number(d.f2),
      changePercent: d.f3 != null ? Number(d.f3) : null,
    };
  });
  return out;
}

/** 单只兜底（内部走批量接口）。 */
export async function fetchEtfQuote(code: string): Promise<EtfQuote | null> {
  const m = await fetchEtfQuotes([code]);
  return m[code] ?? null;
}