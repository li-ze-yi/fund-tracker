# 全面修复代码审查发现项 Spec

## Why
对 server（Node/Express）与 web（React/TS）全量审查后，发现若干实锤 Bug、稳定性/性能隐患、界面一致性及安全加固问题。本 spec 一次性修复全部已确认问题，提升正确性、稳定性与一致性。

## What Changes
按优先级分四批，覆盖后端逻辑、前端逻辑、界面美化、安全加固：

### 第一批：后端实锤 Bug 与账务一致性
- 修复删除分组改错持仓记录（`Holding.update(id,...)` 误用分组 ID）
- 统一 pending 结算对 `updateToConfirmed` 返回值的检查，避免并发重复结算
- 统一"今天"日期取本地时区（新增 `getLocalToday`），替换 `toISOString().slice(0,10)` 的 UTC 用法，覆盖后端多处与前端统计/详情页

### 第二批：稳定性与性能
- `globalCache.getOrFetch` 加在途 Promise 去重（缓存击穿）
- 后端三个独立 Map 缓存（holdingsCache/etfLinkageCache/assetAllocCache）并入 globalCache 或加 TTL 惰性清理与容量上限
- 批量穿透估值对基准指数（沪深300/国债）请求改为外层算一次传入
- 修复前端 Header 定时器内 `setTimeout` 泄漏
- 数据页面（FundDetail/MarketDetail/Stats）加竞态保护与去重复请求
- `batchGetInfo` N+1 查询改批量 IN 查询
- `quotes.js` 聚合外部请求改并行
- 抽 `useIsMobile` hook 响应视口变化
- `useMarketData` 删除 `alive` 死代码并防轮询重叠
- 清理死代码（indices.js 内 return null 的遗留函数、前端 MOCK 数据、[DEBUG] console.log）

### 第三批：界面美化与一致性
- 确定浅色主题品牌色为金色（保留现状），同步更新 DESIGN_SYSTEM 文档消除文档与实现分歧
- 统一默认主题为深色（保留现状，同步 DESIGN_SYSTEM 文档）
- 修复未定义 CSS 变量 `--accent-green`
- 移动端"取消自选"交互可达（Watchlist 删除按钮）
- 底部导航高亮改前缀匹配（详情页/子路由）
- 状态标签重复渲染、硬编码色值收敛为 CSS 变量、内联 `<style>` 收敛到 App.css

### 第四批：安全与加固
- 登录/注册限流、启用 helmet、限制 CORS、隐藏 x-powered-by、启动校验 JWT_SECRET
- 导入接口 multer 加大小/类型限制，处理完毕后删除临时文件
- `hideAmountStore` 顶层读 localStorage 加 try/catch

## Impact
- Affected code（后端）：
  - server/controllers/groupController.js、holdingController.js、transactionController.js、fundController.js、authController.js、importExportController.js、planController.js
  - server/services/fundService.js、globalCache.js、quotes.js、dailyProfitService.js、planService.js、pendingSettleService.js
  - server/utils/date.js（新增）、server/app.js、server/middlewares/auth.js、server/routes/indices.js
- Affected code（前端）：
  - web/src/store/hideAmountStore.ts、themeStore.ts
  - web/src/components/Header.tsx、BottomTabBar.tsx、FundListItem.tsx、modals/ImportPreviewModal.tsx、modals/AnnouncementModal.tsx
  - web/src/hooks/useIsMobile.ts（新增）、web/src/pages/fund/FundDetailPage.tsx、market/MarketDetailPage.tsx、watchlist/WatchlistPage.tsx、stats/StatsPage.tsx、portfolio/PortfolioPage.tsx
  - web/src/App.tsx、App.css、index.html、web/src/services/api.ts
  - web/src/features/industry-rotation/useMarketData.ts

## ADDED Requirements
### Requirement: 本地日期统一
系统 SHALL 使用本地时区日期作为"今天"，后端提供 `getLocalToday()` 统一封装，前端用 dayjs/本地字段格式化，替换所有 UTC 日期推导。

### Requirement: 缓存击穿防护
`globalCache.getOrFetch` SHALL 对同一 key 的在途 Promise 去重，并发请求共享同一 Promise。

### Requirement: 移动端响应式 hook
前端 SHALL 提供 `useIsMobile()` hook（监听 resize），替换各页面一次性 `window.innerWidth` 计算。

## MODIFIED Requirements
### Requirement: 删除分组
删除分组时 SHALL 将该分组下所有持仓 `group_id` 置空后再删除分组，而非按分组 ID 更新单条持仓。

### Requirement: pending 结算一致性
所有 pending 结算路径（自动/手动/兜底）SHALL 检查 `updateToConfirmed` 返回值，返回 false 时跳过后续持仓更新。

### Requirement: 导入预览
导入预览弹窗 SHALL 展示真实解析后的数据，或明确提示"预览暂未实现"，不得硬编码空数组展示表头。

### Requirement: 默认主题与品牌色
系统 SHALL 默认加载深色主题（保留现状）；浅色主色保留当前金色实现；并同步更新 DESIGN_SYSTEM 文档，使"默认主题 + 品牌色"与实现一致。

## REMOVED Requirements
### Requirement: UTC 日期推导
**Reason**: UTC 与本地时区混用导致跨天边界（凌晨 0-8 点）计算错误。
**Migration**: 统一替换为 `getLocalToday()` / dayjs 本地格式化。

### Requirement: 死代码
**Reason**: 遗留的 return null 函数、未使用导出、MOCK 数据、[DEBUG] 日志无价值且干扰排障。
**Migration**: 直接从代码库删除。