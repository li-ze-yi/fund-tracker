# Checklist

- [x] `holdingService.enrichHoldingsWithRealTimeData` 返回的持仓对象中包含 `isConfirmed` 字段（boolean）
- [x] `dailyProfitService.calculateAndSaveDailyProfit` 不再调用 `this.checkConfirmedFunds`
- [x] `dailyProfitService.calculateAndSaveDailyProfit` 通过 `holdingsWithRealTimeData.filter(h => h.isConfirmed)` 分类确认基金
- [x] `isConfirmed` 为 `undefined/null` 时按未确认处理，并打印警告日志
- [x] `dailyProfitService.checkConfirmedFunds` 方法已被删除
- [x] `dailyProfitService` 中不再存在 `history_{code}_1d_${today}` 缓存键的写入或读取（在用户查看持仓路径下）
- [x] `dailyProfitService.backfillDailyProfit` 兜底任务通过 `enrichHoldingsWithRealTimeData` 复用 `isConfirmed`，不调用已删除的 `checkConfirmedFunds`
- [x] `planService` 中 `history_{code}_1d_${today}` 查询逻辑保持不变，未受影响
- [x] `planService` 不引用 `dailyProfitService.checkConfirmedFunds`
- [x] 日志输出 `已确认: X/Y` 格式与修改前一致
- [x] 日志输出 `待确认: {codes} (不参与计算)` 格式与修改前一致
- [ ] TypeScript 编译无新增错误
- [ ] 启动服务后触发持仓查询，日志中不再出现 `checkConfirmedFunds` 调用相关输出
- [ ] 启动服务后触发持仓查询，`dailyProfitService` 正常完成日收益计算并写入 `daily_profits` 表
