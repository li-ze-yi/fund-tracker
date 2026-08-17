# 持仓穿透法稳定性修复 Spec

## Why
持仓穿透法在部分基金上不稳定，根因有两个：1) 港股持仓代码（5位数字，如00700腾讯）被 `stockCode.length !== 6` 过滤掉，导致含港股持仓的基金（如005827易方达蓝筹精选，10只持仓中5只是港股）覆盖率从39%降至18%，低于30%阈值返回null；2) ETF联接基金的持仓接口返回的是指数成分股而非实际持仓，覆盖率极低返回null，但由于 `getFundHoldings` 返回非空数组，不会回退到ETF联接估值（实测ETF联接估值能成功获取母ETF行情）。

## 业界做法参考

经搜索学习业界基金实时估值实现方案：

1. **核心算法（业界通用）**：利用基金最新季报披露的前10大重仓股的持仓占比，结合当日二级市场股价实时涨跌幅，按持仓比例加权计算。公式：`基金估算涨跌 = Σ(重仓股占比 × 当日涨跌幅) + 剩余仓位估算影响`。我们的实现与业界做法一致。

2. **ETF联接基金估值数据源选择（母ETF净值 vs 二级市场交易价格）**：
   - **理论基准**：ETF联接基金的净值确认依据母ETF的**净值涨跌幅**（IOPV，基金份额参考净值），而非ETF二级市场交易价格的涨跌。IOPV 是交易所每15秒根据ETF持仓成分股实时市值计算的净值，与ETF联接基金净值确认逻辑一致。
   - **实际限制**：IOPV 的公开免费API数据源极少，新浪/腾讯接口返回的都是ETF**二级市场交易价格**（可能带折溢价）。push2.eastmoney.com 接口（可能提供IOPV字段）已不可用（socket hang up）。
   - **折溢价影响程度**：
     - 宽基ETF（如510300沪深300ETF）：折溢价通常<0.5%，影响可忽略，用交易价格替代IOPV足够准确。
     - 跨境QDII ETF（如513050中概互联ETF）：折溢价可能较大（A股交易时间底层资产休市，交易价格反映市场预期），用交易价格估算可能有偏差。
   - **本次方案**：继续使用腾讯接口获取ETF交易价格涨跌幅作为估算基准。对于宽基ETF联接基金准确度足够；对于跨境QDII ETF联接基金，估算结果反映的是A股市场预期（含折溢价），需在UI上让用户知晓这是估算值。

3. **港股行情获取**：腾讯接口 `qt.gtimg.cn/q=hk{code}` 支持港股实时行情，返回字段格式与A股完全一致（fields[3]当前价、fields[32]涨跌幅）。实测 `http://qt.gtimg.cn/q=hk00700` 成功返回腾讯控股实时行情。腾讯接口支持混合查询：`q=sh600519,hk00700,sz000858`。

4. **美股代码限制**：腾讯接口美股前缀为 `us`（如 `usAAPL`），代码为字母+数字混合，非纯数字。东方财富持仓接口对QDII基金的美股持仓返回的代码格式不统一，本次修复暂不支持美股行情（QDII基金如006282主要持仓为港股，美股占比较低，影响有限）。

5. **纳斯达克QDII基金估算可行性**：
   - **ETF联接型QDII（如040048华安纳斯达克100ETF联接、006327易方达中概互联50ETF联接）**：可以估算。通过 `getETFBasedEstimatedValue` 获取母ETF代码（如159941、513050），再用腾讯接口获取母ETF实时交易价格涨跌幅。已实测腾讯接口 `sh513050`（中概互联ETF）和 `usNDX`（纳斯达克100指数）均可访问。
   - **限制说明**：母ETF在A股交易时间交易，其价格涨跌反映的是A股市场对美股的预期（含折溢价），而非美股实际涨跌。美股实际涨跌需等当晚美股开盘后才能知道。
   - **纯美股QDII基金（非ETF联接）**：持仓穿透法不适用（美股代码非纯数字），ETF联接估值法也不适用（无母ETF）。无法估算，将进入 `no_estimate` 状态。
   - **纳斯达克100指数期货**：腾讯接口不支持 `hf_NQ`，无法获取期货实时行情。

6. **监管背景**：2026年1月证监会叫停第三方平台的基金实时估值展示功能，天天基金、支付宝等主流平台已下线。本系统为用户自用工具，不受此监管影响。

## What Changes
- `getFundHoldings` 支持港股代码（5位数字），不再将其过滤
- `getStockPrefix` 新增港股前缀判断：5位代码 → `hk`
- `getStocksRealtime` 支持港股行情查询（腾讯接口 `hk{code}`），正则加入 `hk` 前缀
- `getHoldingsEstimatedOverlay` 当持仓覆盖率不足时，增加ETF联接估值回退：覆盖率 < 5% 时尝试 `getETFBasedEstimatedValue`

## Impact
- Affected specs: `analyze-valuation-pipeline`（持仓穿透法覆盖范围扩大）、`auto-data-source-switching`（auto 模式回退成功率提升）
- Affected code: `server/services/fundService.js` — `getFundHoldings`、`getStockPrefix`、`getStocksRealtime`、`getHoldingsEstimatedOverlay`

---

## ADDED Requirements

### Requirement: 港股持仓支持
`getFundHoldings` SHALL 支持港股代码（5位数字，如00700、09988），不再将其过滤。

#### Scenario: 含港股持仓的基金
- **WHEN** 基金持仓中包含港股（5位代码）
- **THEN** 港股持仓被保留并参与加权计算
- **AND** 港股行情通过腾讯接口 `hk{code}` 前缀获取

#### Scenario: 港股行情查询
- **WHEN** getStocksRealtime 查询含港股的持仓
- **THEN** 港股使用 `hk` 前缀（如 `hk00700`）
- **AND** A股保持原有 `sh`/`sz` 前缀
- **AND** 腾讯接口支持混合查询（如 `q=sh600519,hk00700,sz000858`）

### Requirement: ETF联接基金覆盖率回退
`getHoldingsEstimatedOverlay` SHALL 在持仓覆盖率极低（< 5%）时尝试ETF联接估值回退。

#### Scenario: 持仓覆盖率极低时回退ETF估值
- **WHEN** 持仓穿透法计算的 totalRatio < 5%
- **THEN** 尝试调用 `getETFBasedEstimatedValue(fundCode)`
- **AND** 如果ETF联接估值成功，返回其结果
- **AND** 如果ETF联接估值也失败，返回 null

#### Scenario: 覆盖率在 5%-30% 之间不触发ETF回退
- **WHEN** 持仓穿透法计算的 totalRatio 在 [5%, 30%) 区间
- **THEN** 不触发ETF联接回退（避免对非ETF联接基金误判）
- **AND** 返回 null

---

## 多类型基金回归测试

为确保修复不影响其他基金类型，SHALL 覆盖以下基金类型进行端到端验证：

| 类型 | 基金代码 | 预期行为 |
|------|---------|---------|
| 纯A股持仓（消费行业） | 161725 | holdings 估值，覆盖率≥30% |
| 含港股持仓（蓝筹混合） | 005827 | holdings 估值，覆盖率约39% |
| ETF联接基金（有持仓数据） | 005918 | etf_linkage 估值（持仓覆盖率<5%回退） |
| ETF联接基金（无持仓数据） | 019633 | etf_linkage 估值（保持现有行为） |
| ETF联接基金（沪深300） | 110020 | etf_linkage 估值 |
| QDII基金（港股/美股） | 006282 | holdings 估值（含港股用 hk 前缀） |
| 主动管理混合基金 | 005827 | holdings 估值 |
| 债券型基金 | 003838 | 返回 null（无股票持仓，不触发ETF回退） |
| FOF基金（持仓为基金） | 005156 | 返回 null（基金代码非股票代码，被过滤） |

### Requirement: 多类型基金回归
持仓穿透法修复 SHALL 不破坏其他基金类型的估值行为。

#### Scenario: 纯A股持仓基金保持正常估值
- **WHEN** 查询纯A股持仓基金（如161725）
- **THEN** 返回 holdings 估值
- **AND** 覆盖率 ≥ 30%

#### Scenario: 债券型基金无股票持仓
- **WHEN** 查询债券型基金（如003838）
- **THEN** getFundHoldings 返回空数组或持仓覆盖率 < 5%
- **AND** 不触发ETF联接回退（非ETF联接基金）
- **AND** 返回 null

#### Scenario: QDII基金含海外股票
- **WHEN** 查询QDII基金（如006282）
- **THEN** 若持仓含港股，使用 `hk` 前缀获取行情
- **AND** 若持仓含美股或其他海外股票代码，按既有逻辑过滤或处理

---

## MODIFIED Requirements

### Requirement: getStockPrefix 前缀判断
`getStockPrefix` SHALL 按以下规则判断市场前缀：
- 5位代码 → `hk`（港股）
- 6位代码以6开头 → `sh`（沪市A股）
- 6位代码以其他开头 → `sz`（深市A股）

### Requirement: getFundHoldings 代码过滤
`getFundHoldings` SHALL 接受5位或6位纯数字代码，过滤其他格式：
```javascript
if (!stockCode || !/^\d{5,6}$/.test(stockCode)) continue;
```

---

## 追加修复：低覆盖率持仓加权估值（014558 类基金）

### Why
014558（华商品质慧选混合A，偏股混合型）前十大持仓占比仅 20.90%，低于 30% 阈值，且不是 ETF 联接基金（ETF 回退返回 null），导致持仓穿透彻底失败返回 null。但持仓行情数据本身完整可用（10只A股行情全部获取成功），加权涨跌幅仍有参考价值。偏股混合型基金持仓高度分散、前十大占比 ~20% 属常态，当前逻辑对"非 ETF 联接 + 低覆盖率"基金存在覆盖盲区。

### What Changes
- `getHoldingsEstimatedOverlay` 当 ETF 回退也失败时，若持仓行情有效（totalRatio > 0 且有加权涨跌幅数据），继续走加权计算而非直接返回 null
- 低覆盖率估值结果带 `estimationCoverage` 字段返回，前端可见覆盖率自行判断可信度

### ADDED Requirements

### Requirement: 低覆盖率持仓加权估值
`getHoldingsEstimatedOverlay` SHALL 在 ETF 联接回退失败后，若持仓行情有效（totalRatio > 0 且成功获取到行情的持仓数 > 0），继续走加权计算返回估值结果，而非直接返回 null。

#### Scenario: 非ETF联接基金低覆盖率持仓有效
- **WHEN** 基金不是 ETF 联接基金（getETFBasedEstimatedValue 返回 null）
- **AND** 持仓穿透法 totalRatio < 30 但 > 0
- **AND** 成功获取到行情的持仓数 > 0
- **THEN** 继续走加权计算返回估值结果
- **AND** estimationCoverage 字段标记实际覆盖率（如 20.9%）
- **AND** estimationMethod 为 'holdings'

#### Scenario: 持仓行情完全无效时仍返回 null
- **WHEN** totalRatio = 0 或无任何持仓行情获取成功
- **THEN** 返回 null（避免返回无意义的估值）

### MODIFIED Requirements

### Requirement: getHoldingsEstimatedOverlay 覆盖率回退逻辑
`getHoldingsEstimatedOverlay` SHALL 按以下顺序处理低覆盖率情况：
1. 当 totalRatio < 30 时，先尝试 ETF 联接估值回退
2. ETF 回退成功 → 返回 ETF 估值结果
3. ETF 回退失败但持仓行情有效 → 继续走加权计算（低覆盖率估值）
4. 持仓行情完全无效 → 返回 null

### 追加回归测试

| 类型 | 基金代码 | 预期行为 |
|------|---------|---------|
| 偏股混合（低覆盖非ETF联接） | 014558 | holdings 估值，覆盖率约20.9% |
| 恒生科技ETF联接 | 012348 | etf_linkage 估值（保持修复后行为） |
| 债券型基金 | 005461 | null（持仓行情无效，weightedChange为0） |
| 纯A股高覆盖 | 161725 | holdings 估值（保持现有行为） |
