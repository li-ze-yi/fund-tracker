# Checklist

- [x] checkMarketStatus 以 `isTradingDay(今天)` 为权威信号判定全局开市/休市，工作日开市、周末/节假日休市（独立脚本验证 2026-08-26 交易日 + 纳斯达克基金返回 `isMarketOpen:true`）
- [x] checkMarketStatus 不再因抽样基金的 date-only 确认净值日期陈旧而判定全局休市（新购纳斯达克基金后所有基金不短暂变「休市」；实测 `/api/funds/006479` 确认净值日期 2026-08-24 但 update_status=estimating）
- [x] 单只基金（如纳斯达克基金）的真实休市/陈旧仍由 `getFundMarketStatus` 按单只判定，不影响其他基金（date-only 陈旧回退全局开市）
- [x] `isTradingDay` 抛错时抽样兜底分支不因 date-only 确认净值陈旧判定全局休市（date-only 分支已移除，仅保留含时间戳陈旧/数据全空兜底）
- [x] `dailyProfitService.isTradingDay` 与 `batchGetInfo`（自选页）行为不受影响（交易日开市、周末/节假日休市语义不变）
- [x] `getByCode` 有持仓分支复用 `holdingService.calculateHoldingMetrics`，入参（确认净值/yesterdayNav/今日交易份额/isPendingPurchase/effectiveMarketStatus）与持仓列表一致
- [x] 同一基金在持仓列表与基金详情页的 `daily_profit`/`accumulated_profit`/`market_value` 完全一致（共用同一计算函数与入参）
- [x] 详情页估算涨幅（`estimated_change`）与当日收益计算口径一致（均基于 `estimatedChange`），不再用 `gainPercent` 算收益（脚本验证 daily_profit=3.14 基于 estimatedChange=2.0%）
- [x] 无持仓/未登录分支的 `getByCode` 原逻辑保持不变（实测无鉴权接口返回正常）
- [x] `getConfirmedNavByDate` 增加 `options.skipCacheWrite`（默认 false）；三个「用户任选日期」入口（新购 `purchase`、加仓 `buy`、卖出 `sell`）均传 `{ skipCacheWrite: true }`，解析到历史买入/卖出日净值后不写回 `confirmed_nav` 缓存
- [x] pending 结算调用点（settlePendingAsync / pendingSettleService / 日收益 / transactionController L246）不传该选项，写回逻辑与修复前一致
- [x] 新购 006479 日期 2026-08-21（最新确认净值 08-24 7.9007）后，累计收益基于最新确认净值显示 `-96.27` 而非 0，`net` 对应最新净值，持仓列表与详情页一致
- [x] `tsc --noEmit`（前端）无错误；后端 `node --check` + `npm run lint`（0 errors）通过、`npm test`（7/7）通过、服务启动无报错
