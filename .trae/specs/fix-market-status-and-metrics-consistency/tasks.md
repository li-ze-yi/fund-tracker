# Tasks

## Task 1: 修复 checkMarketStatus 全局休市误判（新购纳斯达克基金后所有基金短暂休市）

- [x] SubTask 1.1: 在 `server/services/holdingService.js` 的 `checkMarketStatus`（L63-L195）中，周末检查之后、抽样检测之前，新增以 `holidayService.isTradingDay(getLocalToday())` 为权威信号的全局判定：
  - `isTradingDay=true` → 直接返回 `{ isMarketOpen: true, reason: 'normal' }`（工作日开市，不再进入抽样陈旧判定）
  - `isTradingDay=false` → 返回 `{ isMarketOpen: false, reason: 'holiday', dayOfWeek, message: '非交易日' }`
  - 保持现有 `market_status` 缓存（15s TTL）包裹，不改变缓存机制
- [x] SubTask 1.2: 将原有抽样检测逻辑保留为 `isTradingDay` 抛错时的兜底分支（try/catch 包裹），并移除兜底分支中「date-only 确认净值陈旧（`dayDiff > maxNormalDiff`）→ 全局 `market_closed`」的判定（保留「含时间戳实时估值陈旧」与「抽样数据全部为空且非交易时段」的兜底判断）；同时将权威判定移到抽样拉取之前，避免正常路径冗余外部调用
- [x] SubTask 1.3: 确认 `isWeekend` 早返回、`getFundMarketStatus` 单只基金判定、`dailyProfitService.isTradingDay`、`batchGetInfo` 的行为不受影响（工作日开市、周末/节假日休市语义不变）
- [x] SubTask 1.4: 启动后端，工作日模拟持仓中包含确认净值日期陈旧（date-only，1-2 天前）的纳斯达克基金，验证：
  - 持仓列表所有基金不显示「休市」，纳斯达克基金按 `getFundMarketStatus` 单只判定（估算中/待确认等正常状态）
  - 周末/节假日时所有基金仍显示「休市」
  - `GET /api/funds/batch`（自选页）与日收益计算（dailyProfitService）行为正常

## Task 2: 修复基金详情与持仓列表收益不一致（getByCode 复用 calculateHoldingMetrics）

- [x] SubTask 2.1: 在 `server/controllers/fundController.js` 的 `getByCode`（L42-L266）持仓分支（`if (req.user)` 且 `holding` 存在）中，替换原有手写 `currentValue`/`dailyGain`/`accumulated_profit` 计算（L207-L256），改为调用 `holdingService.calculateHoldingMetrics` 并合并指标字段
- [x] SubTask 2.2: 构造与持仓列表一致的计算入参：
  - `confirmedNav`：复用 `holdingService.resolveConfirmedNav(code, holding, null, realTime)` 解析（缓存→DB→API），取 `resolved.nav > 0 ? resolved.nav : parseFloat(holding.confirmed_nav) || 0`
  - `yesterdayNav`：沿用 `getByCode` 作用域内的 `yesterdayNav`（已确认时从 3d 历史 `history[1].nav` 获取，盘中为 null，仅确认分支使用，与持仓列表一致）
  - `todayTxShares`：查询 `transaction_date = 今天 AND status='confirmed'` 的该基金 buy/sell 份额（保留原查询）
  - `isPendingPurchase`：该基金存在 `status='pending' AND type='buy'` 交易且 `holding.confirmed_nav === null`
  - `marketStatus`：沿用 `effectiveMarketStatus`（`getFundMarketStatus(realTime, marketStatus)`）
- [x] SubTask 2.3: 将 `calculateHoldingMetrics` 返回的 `market_value`/`daily_profit`/`accumulated_profit`/`estimated_change`/`net_value`/`update_status`/`data_source`/`is_fresh`/`day_of_week`/`is_confirmed` 等字段合并进 `result`，保证详情页展示字段（FundDetailPage 使用 `net_value`/`estimated_change`/`daily_profit`/`accumulated_profit`/`update_status`）与持仓列表一致
- [x] SubTask 2.4: 保留无持仓/未登录分支原逻辑（`estimated_change`/`update_status` 等仍按原路径返回），仅重构有持仓分支
- [x] SubTask 2.5: 启动前后端，盘中验证：
  - 同一基金在持仓列表与详情页的 `daily_profit`/`accumulated_profit`/`market_value` 完全一致（均走 `calculateHoldingMetrics`，独立脚本验证 daily_profit=3.14 基于 estimatedChange=2.0% 而非 gainPercent=1.2%）
  - 详情页估算涨幅与当日收益口径一致（均基于 `estimatedChange`）
  - 未持仓基金（自选/搜索）详情页显示不受影响（实测 `/api/funds/006479` 无鉴权返回正常）

## Task 3: 修复用户任选日期入口累计收益为 0（三个入口跳过缓存写回）

- [x] SubTask 3.1: 在 `server/services/settlementService.js` 的 `getConfirmedNavByDate` 增加 `options = {}` 参数与 `options.skipCacheWrite` 开关（默认 false）；③ 兜底写回处保留原逻辑，仅当 `!options.skipCacheWrite` 时才 `globalCache.set(confirmed_nav_...)`，并补充 JSDoc
- [x] SubTask 3.2: 在三个「用户任选日期」入口传 `{ skipCacheWrite: true }`：新购基金（`holdingController.purchase`）、加仓（`transactionController.buy`）、卖出（`transactionController.sell`），解析到的历史买入/卖出日净值不写回「最新确认净值」缓存
- [x] SubTask 3.3: 确认 pending 结算调用点（settlePendingAsync / pendingSettleService / 日收益 / transactionController L246）不传该选项，写回行为与修复前一致（navDate ≥ 今天，风险低）
- [x] SubTask 3.4: 复现验证：新购 006479 日期 2026-08-21（最新确认净值 08-24 7.9007），修复后持仓列表 `ap=-96.27`（基于最新净值）而非 0，`net` 对应最新净值；`npm run lint` + `npm test`（7/7）通过，清理临时测试数据

# Task Dependencies

- Task 1 与 Task 2 无依赖，可并行实施
- Task 1 的 SubTask 1.4 与 Task 2 的 SubTask 2.5 为各自独立验证，可在实施完成后分别执行
- Task 3 独立于 Task 1/2，在验证阶段发现后补充实施（方案演进：读取侧守卫 → 条件写回 → 移除写回 → 最终定稿为三个用户任选日期入口跳过写回）
