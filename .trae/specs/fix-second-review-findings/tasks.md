# Tasks

## 工作流准备
- [x] Task 0: 从 dev 新建功能分支
  - [x] `git checkout dev && git pull && git checkout -b fix/second-review-findings`
  - [x] 确认后续所有提交均在 `fix/second-review-findings` 分支，不直接提交 dev/main

## 第一阶段：阻断性 Bug（低风险）
- [x] Task 1: 修复 importExportController 未导入 getLocalToday
  - [x] 在 server/controllers/importExportController.js 顶部 `require('../utils/date')` 并解构 `getLocalToday`
  - [x] 保留第 85 行 `(realTime?.updateTime?.split(' ')[0]) || getLocalToday()` 逻辑
- [x] Task 2: 修复 PUT /settings 清空单基金覆盖
  - [x] 在 server/models/userSetting.js `upsert` 中当 `valuationOverrides === undefined` 时先读库中已有值（`findByUserId`），保留旧值而非写 null
  - [x] 确认 settingController.update 未传 `valuationOverrides` 时不影响覆盖；`setFundOverride` 路径仍显式写入不回归
- [x] Task 3: 新增 /import-export/template 路由
  - [x] 在 server/controllers/importExportController.js 新增 `exportTemplate`（仅表头 xlsx）
  - [x] 在 server/routes/importExport.js 注册 `GET /template`
  - [x] 核对前端 importExportService.downloadTemplate 无需改动
- [x] Task 4: 修复批量估值下单基金覆盖未生效
  - [x] 在 server/controllers/fundController.js 将 `needFetch` 按 `effectiveMethod` 分组
  - [x] 对每组分别调 `fundService.batchGetRealTimeValuesWithMethod(group, method)`
  - [x] 写回缓存仍按 `realtime_{code}_{effectiveMethod}` 键，保证键与数据方法一致
  - [x] 核对 single fund getByCode 路径的覆盖处理保持一致

## 第二阶段：DRY 重构（中高险）
- [ ] Task 5: 抽取买卖结算公共函数
  - [ ] 在 server/services 建立结算公共函数（如 `settleBuy`/`settleSell` 或统一 `settleTransaction`，含费用/份额/成本反算 + 乐观锁 + 新建/占位替换/加仓三分支）
  - [ ] holdingController.settlePendingAsync 改为调用公共函数
  - [ ] transactionController.settlePending 改为调用公共函数
  - [ ] transactionController.buy/sell 即时结算与 holdingController.purchase confirmed 分支改为调用公共函数
  - [ ] 分基金口径逐条比对，确保份额/成本/收益与改造前一致
- [ ] Task 6: 抽取更新状态判定公共函数
  - [ ] 在 holdingService（或 fundService）新增唯一 `resolveUpdateStatus(...)`，收敛 pre_market/confirmed/estimating/no_estimate/pending_confirm/market_closed 定义
  - [ ] fundController.getByCode 改为调用
  - [ ] fundController.batchGetInfo 改为调用
  - [ ] holdingService.calculateHoldingMetrics 改为调用
- [ ] Task 7: 统一确认净值链
  - [ ] 确认 `resolveConfirmedNav` 为唯一实现，fundController.getByCode / batchGetInfo / holdingController.getSettleConfirmedNav 复用
  - [ ] 消除重复的「confirmed_nav 缓存 → history_3d → DB → API 兜底」实现
- [ ] Task 8: 抽取金额→份额→成本反算
  - [ ] 建立 `computeSharesAndCost(amount, totalReturn, netValue)` 公共函数
  - [ ] holdingController.create 与 update 改为调用

## 第三阶段：接口瘦身与数据正确性
- [ ] Task 9: 精简 /api/holdings 返回字段
  - [ ] 在 holdingService 组装阶段白名单挑选前端所需字段，移除 DB 全字段与整包 realTimeData 冗余
  - [ ] 前端 holdingService.ts / PortfolioPage 等同步移除对已删字段引用
- [ ] Task 10: 统一涨跌幅字段命名
  - [ ] 消除 estimated_change 与 estimated_change_pct 语义重叠，后端与前端取同一命名
- [ ] Task 11: 交易来源字段处理
  - [ ] 排查 Transaction.create 调用点的 `metadata`/`netValueSource` 传参；确需则加列/字段，否则移除无用传参
- [ ] Task 12: holdingController.update 用 id 定位
  - [ ] 将 `req.body.fundCode` 改为 `req.params.id`（并核对前端 updateHolding 传递 id）

## 第四阶段：构建链路与质量
- [ ] Task 13: 构建补类型检查
  - [ ] web/package.json 将 build 改为 `tsc -b --noEmit && vite build`（或等价）
  - [ ] 验证存在类型错误时构建失败
- [ ] Task 14: 前后端 ESLint
  - [ ] 为 server 与 web 分别配置 ESLint 与 lint 脚本，覆盖未使用变量/未导入符号等
- [ ] Task 15: 结算公共函数单元测试
  - [ ] 为 Task 5 抽出的结算函数补单测（费用/份额/成本/乐观锁失败/三分支）

## 第五阶段：文档 / 依赖 / 安全 / 精度
- [ ] Task 16: 修正 README 文档漂移
  - [ ] 更新 /api/holdings/buy|sell 为实际 /api/transactions/buy|sell、/api/holdings/purchase
  - [ ] 补充 announcements 表清单
- [ ] Task 17: 对齐 capacitor 主版本
  - [ ] 统一 @capacitor/cli / @capacitor/core / @capacitor/android 主版本并锁依赖
- [ ] Task 18: JWT/SECRET 安全加固
  - [ ] 确保 JWT_SECRET 使用强随机值、走环境变量注入，确认 .gitignore 覆盖 .env 等敏感文件
- [ ] Task 19: MarketDetailPage 图表精度
  - [ ] tooltip 涨跌幅基准统一为昨收；午休分隔线改用 selectedIndex
- [ ] Task 20: statsController 收益率分母
  - [ ] 月/年收益率分母由 AVG(total_investment) 改为期初投入或加权口径

## 收尾验证
- [ ] Task 21: 全量验证
  - [ ] 后端全部 JS `node --check` 通过
  - [ ] 前端 `tsc -b --noEmit` 零错误
  - [ ] 分阶段手工回归关键链路（设置更新不清空覆盖 / 导入模板下载 / 单基金估值覆盖 / 持仓金额份额 / 月年收益率）
  - [ ] 在 `fix/second-review-findings` 分支确认无遗漏后，按需发起合并到 dev

# Task Dependencies
- Task 0 为前置：所有实现/提交均在 `fix/second-review-findings` 分支
- Task 4 依赖 Task 5/6 结束后统一验证估值一致性
- Task 5 完成后 Task 15（单测）方可落地
- Task 6/7/8 聚焦后端服务层，与 Task 1–3、Task 13–14 无直接依赖，可并行
- Task 9 需与前端调用点（PortfolioPage 等）联动，避免字段移除后前端读取 undefined
- Task 11 依赖对 transaction 表/模型的确认结果
- Task 21 依赖其余任务完成后执行
- 其余任务相互独立，可并行推进