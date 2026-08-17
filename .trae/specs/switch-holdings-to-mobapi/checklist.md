# Checklist

## fundmobapi 数据源验证
- [x] getFundHoldings 调用 fundmobapi FundMNInverstPosition 接口
- [x] 解析 fundStocks 数组：GPDM→code, GPJC→name, JZBL→ratio
- [x] 过滤非数字代码（美股 SNDK/MU 等字母代码）
- [x] 过滤 ratio 为 NaN 或 <= 0 的记录
- [x] 返回结果包含 etfCode 字段（来自 Datas.ETFCODE）
- [x] 保持 4 小时缓存 TTL

## fundf10 兜底移除验证
- [x] 实测 fundf10 对 161725（正常基金）返回空 tbody（content 内 0 个 td）
- [x] 实测 fundf10 对 005827 返回空 tbody
- [x] 移除 fundf10 HTML 兜底逻辑
- [x] fundmobapi 失败时返回空持仓 + etfCode=null + warn 日志

## ETFCODE 复用验证
- [x] getUnderlyingETFCode 优先复用 getFundHoldings 缓存的 etfCode
- [x] 013309（ETF联接）getUnderlyingETFCode 返回 513010，不重复调 API
- [x] getHoldingsEstimatedOverlay 空持仓分支利用 etfCode 走 ETF 估值

## 诊断日志验证
- [x] fundmobapi 失败时输出 warn 日志
- [x] 持仓为空时输出 warn：`[holdings][warn] {fundCode} 估算失败: 持仓为空 (fundStocks=0, etfCode=...)`
- [x] getHoldingsEstimatedOverlay 过程日志保持（持仓数量、覆盖率、行情成功数、估值结果）

## 回归验证
- [x] 020900（原失败）→ fundmobapi 返回 10 只持仓，总占比 69.67%（覆盖率≥30%走 holdings 估值）
- [x] 006503（原失败）→ fundmobapi 返回 10 只持仓，总占比 69.46%
- [x] 025793（原失败）→ fundmobapi 返回 10 只持仓，总占比 65.82%
- [x] 015790（原失败）→ fundmobapi 返回 10 只持仓，总占比 51.01%
- [x] 018957（原失败）→ fundmobapi 返回 10 只持仓，总占比 67.98%
- [x] 025209（原失败）→ fundmobapi 返回 10 只持仓，总占比 60.05%
- [x] 021528（原失败）→ fundmobapi 返回 10 只持仓，总占比 72.31%
- [x] 013309（ETF联接）→ etf_linkage 估值（ETFCODE=513010，fundStocks 空）
- [x] 024239（美股QDII）→ 8 只美股被过滤，2 只 A 股有效占比 2.75%（低覆盖率加权）
- [x] 005827（含港股）→ fundmobapi 返回 10 只持仓含 00700（hk 前缀，保持现有行为）
- [x] 161725（纯A股高覆盖）→ fundmobapi 返回 10 只持仓，总占比 85.95%

## 编译验证
- [x] 后端 Node.js 语法检查通过（`node -c server/services/fundService.js`，exit code 0）
