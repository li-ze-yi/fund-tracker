# A股行业轮动与资金流向监控 · React 集成包

把原单文件 HTML 仪表盘拆成了 **可嵌入的 React 18 组件 + 数据层**。视图层是纯展示组件（喂 `DashboardData` 即可），数据层优先调你的行情接口、失败自动回退到东方财富公开接口，秒级轮询。

## 文件清单
```
fund-integration/
├─ types.ts                 # 数据契约 DashboardData（视图层唯一依赖的结构）
├─ theme.css                # 深色金融终端主题（CSS 变量，便于统一改色）
├─ components/index.tsx     # 6 个展示组件（大盘/热力/资金条/风格/北向/研判）
├─ Dashboard.tsx            # 编排：IndustryRotationDashboard(纯) + Live(实时)
├─ useMarketData.ts         # 实时订阅 hook（primary→fallback 轮询）
├─ sources/
│  ├─ yourApiSource.ts      # 你的接口适配层（按字段映射填即可）
│  └─ eastmoneySource.ts    # 东方财富 push2 回退（仅兜底）
├─ sampleData.ts            # 2026-08-07 真实快照，本地测试用
└─ index.ts                 # 统一导出
```

## 三步接入

### 1. 放进项目
零运行时依赖，只需要 React 18。直接把 `fund-integration/` 整目录拷进你的 `src/` 下任意位置。

### 2. 先跑起来（静态，验证样式）
```tsx
import { IndustryRotationDashboard, sampleData } from "@/fund-integration";
export default () => <IndustryRotationDashboard data={sampleData} />;
```

### 3. 接实时数据
```tsx
import { LiveIndustryRotationDashboard } from "@/fund-integration";

<LiveIndustryRotationDashboard
  config={{
    primaryUrl: "/api/market/rotation",   // ← 你的聚合接口
    fallback: "eastmoney",                // 你的接口挂了才用，生产建议设 null
    pollIntervalMs: 1000,                 // 秒级；公开接口建议 2000~3000
  }}
/>
```

## 接入你自己的行情接口（最推荐）
在 `sources/yourApiSource.ts` 的 `adaptFromYourApi(raw)` 里，把 `raw` 换成你后端返回的字段即可。建议后端新增一个聚合接口一次性吐出 `DashboardData` 所需的全部字段（指数/行业/风格/北向/涨跌家数/研判）。**只要返回结构符合 `types.ts` 的 `DashboardData`，视图层零改动。**

> 关键口径提醒（务必和你的数据源对齐）：
> - **主力资金**有多套口径（数据宝日报 / 数据宝盘后 / Wind），差异来自「主力单」金额阈值与新股剔除。31 个行业要内部可比，必须统一用同一口径。
> - **北向日净买入**自 2024-08-19 起官方不再披露，只能用「成交额 + 占两市比重 + 十大成交股」做趋势指标。
> - 金额单位统一「亿元」，涨跌幅为「百分比数值」(+1.02 = +1.02%)。

## 关于东方财富回退源（fallback）
- 仅用于你的接口缺失/故障时的兜底；生产请用你的授权行情源（Wind/同花顺/恒生/聚源/Tushare 等），公开接口有频率限制且字段可能变动。
- 浏览器直连东方财富可能遇到 **CORS**，遇到就在你的后端做一层代理转发。
- 回退源**不覆盖巨潮 6 风格**（`styleMatrix` 会为空），请通过你的接口或中证指数公司接口补全。
- 北向 9 日序列在回退源里是静态基线，仅「今日」点尝试实时更新。

## 换成 WebSocket（真·秒级推送）
`useMarketData` 现在是轮询。若你的行情是 WebSocket 推送，把 hook 内部 `setInterval(tick)` 换成 `ws.onmessage = (e) => setData(adapt(e.data))` 即可，组件层无需改动。

## 自定义
- 改色：编辑 `theme.css` 里的 `--ird-*` 变量（涨红 `--ird-red` / 跌绿 `--ird-green` 已按 A股惯例）。
- 研判：分析性内容（`thesis`）不在实时数据里，按你的研究更新 `sampleData` 或由后端返回。
- 热力网格默认显示核心 16 行业，可一键展开 31 个；主力资金条提供「线性 / √缩放」切换（不改标尺，避免误导）。

> 本组件仅供研究参考，不构成个人投资建议。
