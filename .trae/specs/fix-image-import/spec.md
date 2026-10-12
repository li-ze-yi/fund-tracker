# 修复图片导入基金功能 Spec

## Why
图片导入基金（OCR 识别持仓截图 → 确认导入持仓）是用户高频使用的功能，但当前**完全没有测试覆盖**，
解析逻辑（`ocrService.js`）与导入流程（`imageImportController.js`）缺少回归保护，且存在累计收益取值歧义等潜在缺陷。
需要通过系统化测试找出并修复问题，保证识别结果与导入行为符合预期。

## What Changes
- **分支策略**：所有代码修改在新建分支 `fix/image-import`（基于当前 `dev`）上进行，避免直接污染 `dev`；工作区中与本次无关的未提交改动（如 `server/k8s/service.yaml`）不作改动、不随本分支提交。
- 为 `server/services/ocrService.js` 的纯解析函数新增单元测试（支付宝无代码模式、天天基金带代码模式、通用模式、宽松回退）。
- 为 `server/controllers/imageImportController.js` 的 `recognize` / `confirmImport` 新增集成测试（mock DB 与外部服务）。
- 依据测试暴露的问题修复 `ocrService.js` 与 `imageImportController.js` 中的解析/导入缺陷。
- 前置确认：测试运行环境不需要百度 OCR 与网络；Tesseract 不参与单元/集成测试。

## Impact
- Affected specs: 图片导入能力（识别 + 确认导入）
- Affected code:
  - `server/services/ocrService.js`
  - `server/controllers/imageImportController.js`
  - `server/tests/`（新增测试文件）
  - `server/routes/imageImport.js`（如测试需要，保持只读不改）

## ADDED Requirements

### Requirement: OCR 解析单元测试
系统应提供针对 `ocrService.js` 纯解析函数的测试，覆盖：
- `parseAlipayByNamePattern`：支付宝持仓截图模式（名称前半/续行 + 金额/昨日收益/累计收益/收益率），正确得出 `amount` 与 `totalReturn`（累计收益）。
- `parseByFundCodes`：带 6 位基金代码的持仓表格，正确提取名称、持仓金额、累计收益。
- `parseHoldingsFromText`：按 `detectFormat` 分流、含去重合并与宽松回退。
- `detectFormat`、`extractFundCodes`、`extractAmounts`、`parseAmount` 边界与格式处理。

#### Scenario: 支付宝模式累计收益取值
- **WHEN** 输入符合文档注释模式（持仓金额在名称续行前、累计收益在名称续行后）的 OCR 文本
- **THEN** `totalReturn` 应等于累计收益，`amount` 应等于持仓金额

#### Scenario: 带基金代码模式
- **WHEN** OCR 文本中同时包含基金代码、名称、金额
- **THEN** 解析出的记录 `fundCode` / `fundName` / `amount` / `totalReturn` 均准确，且不把 6 位基金代码误当金额

### Requirement: 图片导入流程集成测试
系统应提供针对 `imageImportController` 的集成测试（mock `Fund` / `Holding` / `Transaction` / `fundService` / `globalCache` / 上传文件）：
- `recognize`：上传有效图片文件时正确返回 `items`（含 `valid` 标记与反查补全名称/代码）；无基金代码且名称反查失败时 `valid=false` 并给出错误信息。
- `recognize`：校验 mimetype 与扩展名白名单，非法文件返回错误。
- `confirmImport`：导入成功创建持仓与买入手交易（份额/成本计算正确）；重复持仓、资金代码不存在、金额非法等返回失败且不写入。

#### Scenario: 确认导入成功写入
- **WHEN** 提交有效的 `{ fundCode, amount, totalReturn }`
- **THEN** 创建持仓记录与买入手交易，`results.success` 增加，失败计数不变

#### Scenario: 校验失败不写入
- **WHEN** 基金已存在/代码不存在/金额非法
- **THEN** 写入操作被跳过，`results.failed` 增加并带明确错误信息

### Requirement: 缺陷修复
系统应修复由上述测试暴露的所有解析/导入缺陷，并保证：
- 修复后全部新增测试通过，且不影响既有 `settlementService.test.js`。
- 修复范围仅限测试暴露的问题，不做无关重构。