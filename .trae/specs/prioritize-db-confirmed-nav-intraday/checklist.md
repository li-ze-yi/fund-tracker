# Checklist

- [ ] 23:55 日收益兜底在确认净值可获取且比库中更新时，回写 `holdings.confirmed_nav` 与 `confirmed_nav_date`
- [ ] 日收益回写为幂等：净值未公布（`todayNav <= 0`）或日期不更新时不写库，重复运行不覆盖更新的值
- [ ] 确认净值解析按"缓存 → 数据库 → API"优先级执行：缓存命中时不再访问数据库或 API
- [ ] 缓存未命中且数据库确认净值新鲜（`confirmed_nav > 0` 且 `confirmed_nav_date === historyData[0].date`）时，使用数据库值并写入缓存
- [ ] 缓存未命中且数据库值缺失/不新鲜（占位持仓 `confirmed_nav <= 0`）时，回退 API 获取并写入缓存
- [ ] 盘中交易时段且解析确认净值可用时，估算净值以该基准计算（`baseNav × (1 + estimatedChange / 100)`）
- [ ] 解析确认净值不可用时，盘中估算回退原逻辑（API 的 `estimatedValue`/`netValue`）
- [ ] 非盘中行为不被改变（估值/收益计算与现有逻辑一致）
- [ ] 写库失败不中断整体收益计算（`.catch` 保护）
