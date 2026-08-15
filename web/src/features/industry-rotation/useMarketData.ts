// ============================================================================
// useMarketData —— 实时数据订阅 hook
// ----------------------------------------------------------------------------
// 策略：每个轮询周期先试 primary（你的接口），失败/缺失则试 fallback（东方财富）。
// 任一路成功即用新数据；两者都失败则保留上一次的好数据（不闪空），
// 仅当从未拿到过任何数据时把 error 暴露出去。
//
// 秒级刷新：默认 pollIntervalMs=1000。注意公开接口频率限制，建议 2000~3000ms；
// 若你的接口是 WebSocket 推送，把本 hook 换成 onMessage 回调即可（结构不变）。
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardData } from "./types";

export interface MarketDataFetcher {
  (): Promise<DashboardData>;
}

export interface UseMarketDataOpts {
  primary?: MarketDataFetcher; // 优先：你的软件行情接口
  fallback?: MarketDataFetcher; // 回退：第三方（如东方财富）
  pollIntervalMs?: number; // 轮询间隔，默认 1000（秒级）
}

export interface MarketDataState {
  data: DashboardData | null;
  error: Error | null;
  lastUpdate: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
}

export function useMarketData(opts: UseMarketDataOpts): MarketDataState {
  const { primary, fallback, pollIntervalMs = 1000 } = opts;
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const hasData = useRef(false); // 跟踪是否曾成功拿到数据，避免 stale-closure 误置 error
  const inFlight = useRef(false); // 防止轮询重叠：上一次 tick 未完成时跳过本次

  const tick = useCallback(async () => {
    // 上一次轮询尚未完成则跳过本次，避免 async 请求重叠堆积
    if (inFlight.current) return;
    inFlight.current = true;
    const fetchers = [primary, fallback].filter(Boolean) as MarketDataFetcher[];
    let ok = false;
    try {
      for (const f of fetchers) {
        try {
          const d = await f();
          if (d && (d.indices?.length || d.sectors?.length)) {
            setData(d);
            hasData.current = true;
            setLastUpdate(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
            setError(null);
            ok = true;
            break;
          }
        } catch (e) {
          // 试下一个数据源
        }
      }
      if (!ok && !hasData.current) setError(new Error("所有数据源均不可用"));
      setLoading(false);
    } finally {
      inFlight.current = false;
    }
  }, [primary, fallback]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    tick();
    timer = setInterval(tick, pollIntervalMs);
    return () => {
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, pollIntervalMs]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    tick().finally(() => setRefreshing(false));
  }, [tick]);

  return { data, error, lastUpdate, loading, refreshing, refresh };
}
