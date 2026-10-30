// ============================================================================
// IndustryRotationPage —— A股行业轮动与资金流向监控终端
// 数据走后端聚合接口 /api/market/rotation（服务端抓取，绕开浏览器直连东财 CORS）。
// 刷新节奏由后端共享基金缓存 TTL（盘中 28s）决定；前端每 30s 轮询一次。
//
// 兜底：生产服务器（机房 IP）被东财 push2 族域名连接级封锁，服务端 sectors / breadth
// 会取空。仅当服务端确实取不到数时，才回退到浏览器 JSONP 直连（浏览器不在封锁范围）。
// ============================================================================
import { useCallback } from "react";
import api from '@/services/api';
import { useMarketData } from "../../features/industry-rotation";
import {
  fetchSectorsJsonp,
  fetchBreadthJsonp,
} from "../../features/industry-rotation/sources/eastmoneyJsonp";
import RotationTerminal from "../../features/industry-rotation/RotationTerminal";

export default function IndustryRotationPage() {
  // useCallback 固化 fetcher 引用（双保险，hook 内部亦已 ref 化）
  const fetchRotation = useCallback(async () => {
      const r = await api.get('/market/rotation');
      const server = r.data;

      // 服务端能拿到就不走浏览器；仅当字段缺失（无行业数据 / 涨跌家数全 0）时才回退
      const needSectors = !server?.sectors?.length;
      const needBreadth = !server?.breadth || (!server.breadth.up && !server.breadth.down);
      if (!needSectors && !needBreadth) return server;

      // 客户端 JSONP 直连东财兜底；任一失败都不覆盖服务端结果
      const [sectors, breadth] = await Promise.all([
        needSectors ? fetchSectorsJsonp().catch(() => []) : Promise.resolve([]),
        needBreadth ? fetchBreadthJsonp().catch(() => null) : Promise.resolve(null),
      ]);
      if (sectors.length) {
        server.sectors = sectors;
        server.mainFlowTotal = sectors.reduce((s, x) => s + (x.mainflow || 0), 0);
      }
      if (breadth && (breadth.up || breadth.down)) server.breadth = breadth;
      return server;
  }, []);

  const { data, error, lastUpdate, loading, refreshing, refresh } = useMarketData({
    primary: fetchRotation,
    pollIntervalMs: 30000,
  });

  if (loading && !data)
    return <div style={{ padding: 24, color: "var(--txt2)" }}>行情加载中…</div>;
  if (error && !data)
    return (
      <div style={{ padding: 24, color: "var(--up2)" }}>
        数据加载失败：{error.message}
      </div>
    );
  if (!data) return <div style={{ padding: 24, color: "var(--txt2)" }}>无数据</div>;

  return (
    <div style={{ minHeight: "100%" }}>
      <RotationTerminal
        data={data}
        lastUpdate={lastUpdate ?? undefined}
        refreshing={refreshing}
        onRefresh={refresh}
      />
    </div>
  );
}
