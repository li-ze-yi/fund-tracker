# Checklist

- [x] spec.md 中 019633 计算链路（Step 1-8）与 `getHoldingsEstimatedOverlay` 实际代码一致
- [x] spec.md 中资产配置数值（stockRatio=0, bondRatio=0.86, cashRatio=5.21）与 pingzhongdata 实际数据一致
- [x] spec.md 中母ETF占比公式 `etfWeight = 100 - stockRatio - bondRatio - cashRatio` 与代码一致
- [x] spec.md 中母ETF贡献公式 `etfContribution = etfWeight × estimatedChange` 与代码一致
- [x] spec.md 中最终涨跌幅公式 `estimatedChange = (coveredContribution + missingContribution + bondContribution + etfContribution) / 100` 与代码一致
- [x] spec.md 中覆盖率设为 100 的逻辑与代码一致
- [x] spec.md 中日志输出示例格式与代码中实际日志格式一致
- [x] spec.md 中数据来源标注（fundmobapi、pingzhongdata、腾讯 qt.gtimg.cn）与代码实际调用一致