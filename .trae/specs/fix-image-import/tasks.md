# Tasks

## Task 0: 新建分支
- [x] 0.1 基于当前 `dev` 新建分支 `fix/image-import` 并检出；确认 `server/k8s/service.yaml` 等无关改动不被纳入本分支提交。

## Task 1: 编写 OCR 解析单元测试
为 `server/services/ocrService.js` 编写 `server/tests/ocrService.test.js`，使用 Node 内置 `node:test` + `assert`：
- [x] 1.1 `parseAmount` / `extractFundCodes` / `extractAmounts`：金额与代码提取、6 位代码过滤、千分位/符号处理。
- [x] 1.2 `detectFormat`：支付宝 / 天天基金 / 通用 判定。
- [x] 1.3 `parseAlipayByNamePattern`：按文档注释模式（名称前半 | 持仓金额 | 昨日收益 | 名称续行 | 累计收益 | 收益率）断言 `amount` 与 `totalReturn`（累计收益）。
- [x] 1.4 `parseByFundCodes`：带代码模式正确提取名称/持仓金额/累计收益，且 6 位基金代码不被误当金额。
- [x] 1.5 `parseHoldingsFromText`：覆盖分流、去重合并、宽松回退。

## Task 2: 编写图片导入流程集成测试
编写 `server/tests/imageImportController.test.js`，mock `Fund`/`Holding`/`Transaction`/`fundService`/`globalCache`/`ocrService` 与上传文件：
- [x] 2.1 `recognize`：有效图片返回 `items`（valid 标记、名称/代码反查补全）；反查失败 → `valid=false` + 错误信息。
- [x] 2.2 `recognize`：mimetype 与扩展名白名单校验，非法文件报错。
- [x] 2.3 `confirmImport`：有效导入创建持仓与买入手交易，份额/成本正确，`success` 累计正确。
- [x] 2.4 `confirmImport`：重复持仓 / 代码不存在 / 金额非法 → 跳过写入且 `failed` 累计并带错误。

## Task 3: 运行测试并修复缺陷
- [x] 3.1 运行 `cd server && npm test`，记录所有失败用例。
- [x] 3.2 依据失败暴露的问题修复 `ocrService.js` 与 `imageImportController.js`（仅修复测试暴露的缺陷，不做无关重构）。
- [x] 3.3 重新运行测试，确保新增测试与既有 `settlementService.test.js` 全部通过。

## Task 4: 复验清单项
- [x] 4.1 核对 `checklist.md` 各检查点通过。

# Task Dependencies
- Task 0 依赖：无（最先执行）。
- Task 1 与 Task 2 相互独立，可并行编写。
- Task 3 依赖 Task 1、Task 2（先在测试中复现，再修复）。
- Task 4 依赖 Task 3。