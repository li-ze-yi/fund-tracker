# Checklist

- [x] 交易时段（9:00-15:00）持仓刷新时不发起任何 `history_{code}_3d` API 请求
- [x] 盘后行为与原来一致（正常拉取并缓存 3d 历史）
- [x] 盘中无历史数据时，`resolveConfirmedNav` 用日期启发式判定 DB 确认净值新鲜度
- [x] 盘中 DB 值新鲜时以 DB 为确认净值基准并写入 `confirmed_nav_{code}` 缓存
- [x] 盘中 DB 值不新鲜/缺失（非占位持仓）时回退 API，并同时写回缓存与数据库（自愈）
- [x] 盘中占位持仓（`confirmed_nav === null`）只写缓存、不回写数据库，保持占位状态
- [x] 有 `latestHistoryDate` 时保持原有 `dbNavDate === latestHistoryDate` 逻辑不变
- [x] 23:55 回写跳过 `confirmed_nav === null` 的占位持仓，保持占位状态
- [x] 23:55 回写对真实确认持仓仍幂等回写（净值未公布/日期不更新时不写库）
- [x] 未改动 `history_recent` 的 TTL
- [x] 写库失败不中断整体流程（`.catch` 保护）
- [x] 非盘中行为/收益计算与现有逻辑一致，无回归
