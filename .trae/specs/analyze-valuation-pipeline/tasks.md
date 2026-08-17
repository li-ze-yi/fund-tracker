# Tasks

- [x] Task 1: 注释掉不可用的接口（fundService.js）
  - 注释 `getFundgzEstimatedValue`（实测总返回 null，天天基金已不提供盘中估值）
  - 注释 `getTencentValue`（死代码，未导出）
  - 注释 `getHoldingsEstimatedValue`（死代码，被新版替代）
  - 注释 `batchGetFundgzEstimatedValues`（依赖 getFundgzEstimatedValue）
  - 每处注释标明原因
  - 验证：require fundService 不报错

- [x] Task 2: 重构 getHoldingsEstimatedOverlay（整合ETF联接，去掉新浪回退）
  - 无持仓时：调用 `getETFBasedEstimatedValue` 而非 `getSinaEstimatedValue`
  - 覆盖率不足时：返回 null 而非回退新浪
  - 验证：019633 返回 etf_linkage 估值；005827（无持仓非ETF联接）返回 null

- [x] Task 3: 简化 getRealTimeValueWithMethod（两个数据源不互相回退）
  - 去掉 fundgz 调用
  - sina 模式：仅调用 `getSinaEstimatedValue`，失败返回 null
  - holdings 模式：仅调用 `getHoldingsEstimatedOverlay`，失败返回 null
  - 验证：sina 模式失败时不回退到 holdings

- [x] Task 4: 简化 batchGetRealTimeValuesWithMethod（两个数据源不互相回退）
  - fundmobapi 仅用于确认净值（去掉 GSZ 优先逻辑）
  - sina 模式：`batchGetSinaEstimatedValues`，失败返回 null
  - holdings 模式：并行 `getHoldingsEstimatedOverlay`，失败返回 null
  - 去掉所有相互回退逻辑
  - 验证：批量接口不互相回退

- [x] Task 5: 修改 fundController.js（估算失败时显示前一天数据并标注日期）
  - 单基金接口 getByCode：estimatedChange 为 null 时，net_value=confirmed.netValue，estimated_change=confirmed.gainPercent，标注 update_time
  - 批量接口 batchGetInfo：同样处理
  - update_status 标记为 'no_estimate' 或保持 'pending_confirm'
  - 验证：估算失败时返回前一天数据+日期

- [x] Task 6: 修改 holdingService.js（估算失败时显示前一天数据）
  - calculateHoldingMetrics：estValue 为 null 时用 confirmed netValue
  - 验证：持仓页估算失败时显示前一天数据

# Task Dependencies
- Task 2 依赖 Task 1（先注释旧代码，再重构）
- Task 3 依赖 Task 2（getHoldingsEstimatedOverlay 重构后再简化入口）
- Task 4 依赖 Task 2
- Task 5 依赖 Task 3、Task 4
- Task 6 依赖 Task 5
