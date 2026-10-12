# Checklist

## 分支约束
- [x] 已基于 `dev` 新建分支 `fix/image-import` 并检出
- [x] 无关的未提交改动（如 `server/k8s/service.yaml`）未纳入本分支提交

## OCR 解析单元测试
- [x] `ocrService.test.js` 覆盖 `parseAmount` / `extractFundCodes` / `extractAmounts` 边界与格式处理
- [x] `detectFormat` 能正确识别支付宝 / 天天基金 / 通用格式
- [x] `parseAlipayByNamePattern` 对文档注释模式的持仓金额与累计收益取值正确（`totalReturn`=累计收益）
- [x] `parseByFundCodes` 正确提取名称/持仓金额/累计收益，且 6 位基金代码不被误当金额
- [x] `parseHoldingsFromText` 覆盖分流、去重合并、宽松回退

## 图片导入流程集成测试
- [x] `recognize` 有效图片返回 items，且名称/代码反查补全与 valid 标记正确
- [x] `recognize` mimetype 与扩展名白名单校验生效
- [x] `confirmImport` 有效导入创建持仓与买入手交易，份额/成本计算正确
- [x] `confirmImport` 重复持仓 / 代码不存在 / 金额非法时跳过写入并返回明确错误

## 缺陷修复与回归
- [x] 测试暴露的 `ocrService.js` / `imageImportController.js` 缺陷已修复
- [x] 修复仅限测试暴露问题，未做无关重构
- [x] 全部新增测试通过
- [x] 既有 `settlementService.test.js` 未受影响仍通过