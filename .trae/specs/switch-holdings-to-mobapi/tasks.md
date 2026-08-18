# Tasks

- [x] Task 1: 重写 getFundHoldings 使用 fundmobapi JSON 接口
  - 数据源改为 `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?FCODE=${fundCode}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0`
  - 使用 MOBILE_HEADERS（已存在）
  - 解析 `data.Datas.fundStocks` 数组：每条记录 { GPDM → code, GPJC → name, JZBL → ratio }
  - 过滤 code 不匹配 `/^\d{5,6}$/` 的记录（美股字母代码如 SNDK/MU）
  - 过滤 ratio 为 NaN 或 <= 0 的记录
  - 计算 totalStockRatio = Σ ratio
  - 提取 etfCode = data.Datas.ETFCODE（非空字符串时保留，否则 null）
  - 返回 { holdings, totalStockRatio, reportDate: null, etfCode }
  - 保持缓存逻辑（4小时 TTL）
  - 验证：020900 返回 10 只持仓，总占比约 69.67%

- [x] Task 2: 移除 fundf10 HTML 兜底（实测无效）
  - 实测发现 fundf10 对所有基金（含 161725/005827 正常基金）均返回空 tbody
  - 天天基金已改版，fundf10 不再通过 HTML 表格提供持仓数据
  - 移除 fundf10 兜底逻辑，fundmobapi 失败时直接返回空持仓 + warn 日志
  - 验证：161725 fundf10 响应 content 内只有 2 个表头 tr，0 个 td（无持仓数据）

- [x] Task 3: getUnderlyingETFCode 复用 getFundHoldings 缓存
  - 改为先调用 getFundHoldings(fundCode)
  - 如果结果中 etfCode 非空，直接返回 etfCode（复用缓存，不重复调 API）
  - 如果 etfCode 为空，返回 null（不再单独调 fundmobapi）
  - 保留 etfLinkageCache 24小时缓存作为二级缓存
  - 验证：013309（ETF联接）getUnderlyingETFCode 返回 513010，不重复调 API

- [x] Task 4: getHoldingsEstimatedOverlay 空持仓时复用 etfCode
  - getFundHoldings 返回结果解构时取出 etfCode
  - 空持仓分支：调用 getETFBasedEstimatedValue(fundCode)，其内部 getUnderlyingETFCode 复用 getFundHoldings 缓存
  - 日志含 etfCode 信息：`持仓为空 (fundStocks=0, etfCode=...)`
  - 验证：013309 空持仓走 ETF 联接估值，不重复调 fundmobapi

- [x] Task 5: 清理 fundf10 专属日志，调整诊断日志
  - 移除 fundf10 的 "响应无 tbody" / "持仓解析为空" / "fundf10 API 失败" 日志
  - fundmobapi 失败时输出 warn：`fundmobapi 持仓接口失败: {error}`
  - 持仓为空时输出 warn（含 etfCode 信息）
  - 保留 getHoldingsEstimatedOverlay 的过程日志
  - 验证：013309 日志显示"持仓为空 (fundStocks=0, etfCode=513010)"

- [x] Task 6: 端到端验证 + 语法检查
  - **原失败基金**：020900, 006503, 025793, 015790, 018957, 025209, 021528 → fundmobapi 返回完整持仓（覆盖率 50%-72%）
  - **ETF联接基金**：013309 → ETFCODE=513010，fundStocks 空，走 etf_linkage 估值
  - **美股QDII基金**：024239 → 8 只美股被过滤，2 只 A 股有效占比 2.75%
  - **港股基金**：005827 → fundmobapi 返回 10 只持仓含 00700（hk 前缀）
  - **纯A股高覆盖**：161725 → fundmobapi 返回 10 只持仓，覆盖率 85.95%
  - 后端 Node.js 语法检查通过（`node -c server/services/fundService.js`）

# Task Dependencies
- Task 2 依赖 Task 1（先实现主数据源，再处理兜底）
- Task 3 依赖 Task 1（复用 getFundHoldings 缓存）
- Task 4 依赖 Task 1、3（复用 etfCode）
- Task 5 依赖 Task 1-4（清理日志）
- Task 6 依赖 Task 1-5 全部完成
