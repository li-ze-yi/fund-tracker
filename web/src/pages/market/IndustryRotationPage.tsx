// ============================================================================
// IndustryRotationPage —— A股行业轮动与资金流向监控终端
// 数据走后端聚合接口 /api/market/rotation（服务端抓取，绕开浏览器直连东财 CORS）。
// 刷新节奏由后端共享基金缓存 TTL（盘中 28s）决定；前端每 30s 轮询一次。
// ============================================================================
import api from '@/services/api';
import { useMarketData } from "../../features/industry-rotation";
import RotationTerminal from "../../features/industry-rotation/RotationTerminal";

export default function IndustryRotationPage() {
  const { data, error, lastUpdate, loading, refreshing, refresh } = useMarketData({
    primary: async () => {
      const r = await api.get('/market/rotation');
      return r.data;
    },
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
