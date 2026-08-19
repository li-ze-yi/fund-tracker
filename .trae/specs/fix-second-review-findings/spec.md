# 第二次代码审查全量修复 Spec

## Why
对 server（Node/Express）与 web（React/TS）进行新一轮审查后，确认存在 3 个 P1 运行时/数据丢失 Bug、1 个 P2 估值逻辑 Bug，以及结算逻辑/状态判定/确认净值链的 3–4 份重复实现、接口返回冗余字段、构建链路缺失类型检查、文档漂移、安全与统计精度问题。本 spec 一次性覆盖全部已确认项，按风险从低到高推进。

## 开发工作流约束
- 所有改动 SHALL 在从 `dev` 检出的独立功能分支上进行，不得直接提交到 `dev`/`main`。
- 每个阶段合入前 SHALL 通过验证：后端 `node --check`、前端 `tsc` 类型检查，以及针对本阶段改动的手工/单测回归。

## What Changes

### 第一阶段：阻断性 Bug（低风险，优先）
- 修复 [importExportController.js](file:///d:/fundtracker/server/controllers/importExportController.js#L85) 使用 `getLocalToday()` 但未导入，导致休市/待开市时导入抛 `ReferenceError`
- 修复「修改刷新频率会清空单基金估值覆盖」：`PUT /settings` 在未传 `valuationOverrides` 时保留库中已有值
- 新增 `GET /import-export/template` 路由，使前端「下载导入模板」可用
- 修复批量估值路径下「单基金估值覆盖未生效」：按 `effectiveMethod` 分组拉取

### 第二阶段：DRY 重构（中高险，消除重复）
- 抽取统一「买卖结算」公共函数（费用/份额/成本反算 + 乐观锁 + 新建/占位替换/加仓三分支）
- 抽取统一「更新状态判定」（pre_market/confirmed/estimating/no_estimate/pending_confirm/market_closed）
- 统一「确认净值链」（confirmed_nav 缓存 → history_3d → DB → API 兜底）
- 抽取统一「金额 → 份额 → 成本反算」

### 第三阶段：接口瘦身与数据正确性
- 精简 `/api/holdings` 返回字段（去掉 DB 全字段与整包 `realTimeData` 冗余）
- 消除 `estimated_change` 与 `estimated_change_pct` 语义重叠
- 修复 `Transaction.create` 静默丢弃 `netValueSource` 的字段/记录意图
- `holdingController.update` 统一用 `req.params.id` 定位持仓

### 第四阶段：构建链路与质量
- `web build` 改为 `tsc -b && vite build`（类型错误阻断发布）
- 补 ESLint 于前后端
- 为抽取后的结算公共函数补单元测试

### 第五阶段：文档 / 依赖 / 安全 / 精度
- 修正 README 接口文档漂移（`/api/holdings/buy|sell` → 实际端点，补充 `announcements` 表）
- 对齐 capacitor 依赖主版本
- JWT_SECRET 改强随机、密钥走环境注入、确保 `.env` 不入库
- 修正 MarketDetailPage tooltip 涨跌幅基准（统一昨收）与午休分隔线索引跟随
- 修正 statsController 月/年收益率分母口径

## Impact
- Affected specs: 无（本次为新增，与 `fix-all-review-findings` 相互独立）
- Affected code（后端）：
  - server/controllers/importExportController.js、settingController.js、fundController.js、holdingController.js、transactionController.js、statsController.js
  - server/models/userSetting.js、server/models/transaction.js
  - server/services/fundService.js、holdingService.js、pendingSettleService.js（可能新增 settlementService/valuationService）
  - server/routes/importExport.js
- Affected code（前端）：
  - web/src/services/importExportService.ts、holdingService.ts、fundService.ts
  - web/src/pages/market/MarketDetailPage.tsx
  - web/package.json、web/.eslintrc（或 eslint.config）、server/package.json
- Affected docs：README.md

## ADDED Requirements

### Requirement: 独立分支开发
本次修复 SHALL 在从 `dev` 检出的独立功能分支上进行，提交不得直接落在 `dev`/`main`。

#### Scenario: 改动落在功能分支
- **WHEN** 实施任意阶段改动并提交
- **THEN** 提交记录存在于功能分支（如 `fix/second-review-findings`），`dev`/`main` 不受影响

### Requirement: 改动后验证测试
每个阶段 SHALL 完成验证：后端全部 JS `node --check` 通过、前端 `tsc --noEmit` 零错误，且针对改动点执行手工/单测回归确认无回归。

#### Scenario: 合成前验证通过
- **WHEN** 一个阶段完成后准备合入
- **THEN** `node --check` 与 `tsc` 均通过，相关回归测试通过，才视为完成

### Requirement: 导入模板下载接口
系统 SHALL 提供 `GET /import-export/template`，返回与导入格式一致的表头 Excel（仅表头、无数据）。

#### Scenario: 下载模板成功
- **WHEN** 已登录用户在「导入」界面点击「下载导入模板」
- **THEN** 服务端返回 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` 的 xlsx，含 `fund_code/code/amount/total_cost/total_return` 等约定的表头列

### Requirement: 构建类型检查
`web` 的构建命令 SHALL 先执行类型检查（`tsc -b --noEmit`），类型错误时构建失败，再进行 `vite build`。

#### Scenario: 类型错误阻断发布
- **WHEN** 前端 TS 存在类型错误并执行构建
- **THEN** 构建在 tsc 阶段失败，不产出产物

### Requirement: 前后端静态检查
前后端 SHALL 具备 ESLint 配置（或等价）与可执行的 lint 脚本，用于捕获未使用变量/未导入符号等静态问题。

#### Scenario: 未导入符号被捕获
- **WHEN** 代码引用了未导入的标识符（如历史 `getLocalToday` 缺失）
- **THEN** lint 阶段报错，避免同类运行时 `ReferenceError` 复发

### Requirement: 结算公共函数单元测试
抽取后的「买卖结算」公共函数 SHALL 具备单元测试，覆盖费用计算、份额/成本反算、乐观锁失败跳过、新建/占位替换/加仓三分支。

#### Scenario: 加仓正确合并份额成本
- **WHEN** 对已存在持仓发起加仓结算
- **THEN** 份额与成本单价按加权合并，不产生重复持仓记录

## MODIFIED Requirements

### Requirement: 导入日期兜底
导入用户在旧 Excel 时，`transactionDate` 的兜底日期 SHALL 使用本地时区「今天」，并在文件顶部正确导入 `getLocalToday`。

#### Scenario: 数据源无 updateTime
- **WHEN** 导入行对应基金的实时数据缺少 `updateTime`
- **THEN** 交易日期回退为本地今天，不抛 `ReferenceError`

### Requirement: 设置更新不丢失单基金覆盖
`PUT /settings` 在请求体未携带 `valuationOverrides` 时 SHALL 保留数据库中已有的 `valuation_overrides`；仅当显式传入时才覆盖。

#### Scenario: 仅改刷新频率
- **WHEN** 前端仅发送 `{ refreshFrequency }` 更新设置
- **THEN** `valuation_overrides` 保持不变，单基金估值覆盖不被清空

### Requirement: 单基金估值覆盖真实生效
批量实时估值 SHALL 按每只基金的 `effectiveMethod`（覆盖优先于全局方法）分组拉取，并按对应方法写入缓存键。

#### Scenario: 覆盖为 sina 的基金用 sina 估算
- **WHEN** 全局方法为 `holdings`，某基金覆盖为 `sina`，进行批量估值
- **THEN** 该基金使用 `sina` 方法估算，数据写入 `realtime_{code}_sina` 缓存键，而非用全局方法的数据污染覆盖键

### Requirement: 更新状态判定统一
系统 SHALL 提供唯一的状态判定公共函数，`fundController.getByCode`、`fundController.batchGetInfo`、`holdingService.calculateHoldingMetrics` 均调用它，输出 `update_status`（pre_market/confirmed/estimating/no_estimate/pending_confirm/market_closed）保持定义一致。

#### Scenario: 三处状态一致
- **WHEN** 同一基金同一时刻的盘中数据被单查、批查、持仓聚合三条路径处理
- **THEN** 三者返回的 `update_status` 一致

### Requirement: 确认净值链统一
所有需要「最近确认净值」的路径 SHALL 复用同一 `resolveConfirmedNav`（confirmed_nav 缓存 → history_3d → DB → API 兜底），而非各自实现。

#### Scenario: 兜底链命中缓存
- **WHEN** `confirmed_nav_{code}` 缓存命中且净值 > 0
- **THEN** 各路径直接复用缓存值，不重复外部请求

### Requirement: 结算逻辑统一
「买卖结算」的金额/份额/成本反算及三分支（新建持仓、占位替换、加仓合并）SHALL 收敛为唯一公共函数，供 pending 自动结算、即时买卖、新购确认分支复用。

#### Scenario: pending 结算与即时买入口径一致
- **WHEN** 同一买入在 pending 结算路径与即时买入路径分别结算
- **THEN** 两者计算出的份额与成本单价一致

### Requirement: holdings 响应字段精简
`GET /api/holdings` SHALL 仅返回前端所需字段（`market_value`/`estimated_change`/`daily_profit`/`accumulated_profit`/`net_value`/`update_status` 等），不再透传 DB 全字段与整包 `realTimeData` 中与原始字段重复的部分。

#### Scenario: 响应不含冗余字段
- **WHEN** 前端请求持仓列表
- **THEN** 每项不含 `user_id`/`created_at`/`updated_at`/`sold_date`/`total_return` 等未使用字段，也不含与 `shares/cost_price/fund_code` 重复的冗余对象

### Requirement: 涨跌幅字段语义单一
系统 SHALL 消除 `estimated_change`（涨跌幅）与 `estimated_change_pct`（估算涨跌幅）的语义重叠，统一命名，前端与后端一致。

#### Scenario: 字段名唯一
- **WHEN** 接口返回估算涨跌幅
- **THEN** 同一含义只使用一个字段名，前端引用不歧义

### Requirement: 持仓更新定位一致
`holdingController.update` SHALL 使用 `req.params.id` 定位持仓记录，而非 `req.body.fundCode`。

#### Scenario: 仅传 id 即可更新
- **WHEN** 前端按 id 更新持仓金额/收益
- **THEN** 后端按 id 定位，无需额外以 `fundCode` 兜底

### Requirement: 交易记录保留来源
`Transaction.create` SHALL 显式接收并持久化「净值来源」（如有需要），或在模型/表增加对应列；不得静默丢弃传入但模型不接受的字段。

#### Scenario: 来源字段被保留
- **WHEN** 结算时传入 `netValueSource`
- **THEN** 该值被写入对应字段，若表无列则明确舍弃并记录日志，而非静默丢弃

### Requirement: 月/年收益率统计口径
`statsController` 月/年收益率 SHALL 使用期初投入（或更为合理的加权分母）计算，而非 `AVG(total_investment)`。

#### Scenario: 分母口径正确
- **WHEN** 统计某月收益率
- **THEN** 分母反映该周期实际投入成本口径，结果不被期初/期末均值扭曲

### Requirement: 图表涨跌幅基准一致
`MarketDetailPage` tooltip 的涨跌幅 SHALL 与卡片一致，均以昨收为基准；午休分隔线 SHALL 跟随当前选中指数（`selectedIndex`）而非 `initialCode`。

#### Scenario: 切换指数后分隔线跟随
- **WHEN** 用户在 A 股与港股指数间切换
- **THEN** 午休分隔线位置与 tooltip 涨跌幅基准随之正确更新

### Requirement: 依赖主版本一致
`@capacitor/cli` 与 `@capacitor/core`/`@capacitor/android` 的主版本 SHALL 保持一致。

#### Scenario: 版本对齐
- **WHEN** 安装依赖
- **THEN** capacitor 相关包主版本相同，无 peer 依赖警告

## REMOVED Requirements

### Requirement: holdings 冗余返回字段
**Reason**: `enrichHoldingsWithRealTimeData` 以 `...holding` + 整包 `realTimeData` 返回，造成响应臃肿且字段语义重复。
**Migration**: 在 assemble 阶段白名单挑选前端所需字段，前端同步移除对已删字段的引用后再上线。

### Requirement: Transaction.create 无结构校验
**Reason**: `create` 仅解构固定字段，传入的 `metadata`/`netValueSource` 等被静默丢弃。
**Migration**: 若确需记录来源，新增对应列/字段并持久化；否则在调用处移除无用传参。