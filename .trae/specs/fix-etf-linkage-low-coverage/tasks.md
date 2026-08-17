# Tasks

- [x] Task 0: 新增 getTimestamp 工具函数
  - 在 fundService.js 顶部添加了 `getTimestamp`，返回 `HH:MM:SS`
  - 所有新增/修改日志使用 `[${getTimestamp()}]` 前缀

- [x] Task 1: 新增 getFundAssetAllocation 函数
  - 从 `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js` 获取 JS
  - 提取 `Data_assetAllocation` 中股票/债券/现金占比的最新一期
  - 24 小时缓存
  - 验证：008021 返回 stockRatio=0.13, bondRatio=2.48, cashRatio=4.84

- [x] Task 2: 移除 getHoldingsEstimatedOverlay 中的 ETF 联接特判分支
  - 移除了"持仓为空→ETF估值"和"仅1只持仓>90%→ETF估值"分支
  - 替换为统一的空持仓检查（含 etfCode 判断）

- [x] Task 3: 加权计算中引入资产配置
  - ETF联接基金：母ETF贡献 = (100 - stockRatio - bondRatio - cashRatio) × 母ETF涨跌幅
  - 债券贡献 = bondRatio × 国债涨跌幅
  - 普通基金保持现有逻辑
  - estimationCoverage：ETF联接基金设为 100（母ETF+个股全覆盖）
  - 验证：008021 estimatedChange ≈ -1.4%

- [x] Task 4: 全链路日志增强（带时间戳）
  - getRealTimeValueWithMethod → method、确认净值、回退决策
  - batchGetRealTimeValuesWithMethod → method、各基金结果
  - getSinaEstimatedValue → 进入函数、成功
  - getFundHoldings → 命中缓存、调API、失败
  - getUnderlyingETFCode → 命中缓存、结果
  - getETFBasedEstimatedValue → 进入、ETF行情、lsjz
  - getHoldingsEstimatedOverlay → 进入、持仓、覆盖率、母ETF行情、贡献值、final结果

- [x] Task 5: 端到端验证 + 语法检查
  - `node -c d:\fundtracker\server\services\fundService.js` exit code 0
  - 代码审查确认所有改动符合 spec

# Task Dependencies
- Task 0 作为前置（其他日志需要 getTimestamp）
- Task 2 依赖 Task 1
- Task 3 依赖 Task 1、2
- Task 4 可并行于 Task 1-3
- Task 5 依赖 Task 1-4 全部完成
