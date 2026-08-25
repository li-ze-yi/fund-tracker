# 019633 持仓穿透估值计算分析 Spec

## Why
019633（国泰半导体设备ETF联接C）是 ETF 联接基金，其估值完全依赖持仓穿透法。用户需要了解其精确计算链路和数值。

## What Changes
- 本文档为分析型 spec，仅记录 019633 的估值计算链路、数据来源、公式和示例数值
- 不涉及代码变更

## Impact
- Affected specs: `fix-etf-linkage-low-coverage`（此 spec 实现了 019633 的估值修复）
- Affected code: `server/services/fundService.js` — `getHoldingsEstimatedOverlay`、`getFundAssetAllocation`、`getUnderlyingETFCode`

---

## 计算链路总览

019633 的估值完全走 `getHoldingsEstimatedOverlay` 持仓穿透法，共 8 个步骤：

```
getHoldingsEstimatedOverlay("019633", confirmedNav)
  ├── Step 1: getFundHoldings("019633") → 持仓 + ETFCODE
  ├── Step 2: 空持仓检查（有 etfCode 则继续）
  ├── Step 3: getStocksRealtime([...]) → 个股行情（019633 持仓为空，跳过）
  ├── Step 4: 计算 coveredContribution / missingStockWeight
  ├── Step 5: getBenchmarkChange() + getBondBenchmarkChange()
  ├── Step 6: getFundAssetAllocation("019633") → 资产配置
  ├── Step 7: getETFRealtimeQuote("159516") → 母ETF行情
  └── Step 8: 加权求和 → estimatedChange
```

---

## 各步骤详细说明

### Step 1: 获取持仓数据

调用 `getFundHoldings("019633")`，底层走 fundmobapi 的 `FundMNInverstPosition` 接口。

**019633 fundmobapi 持仓数据（2026-06-30 报告期）**：
```
holdings: []                           // 无个股持仓
totalStockRatio: 0                     // 股票占净比 0%
fundboods: [
  { ZQDM: "019827", ZQMC: "26国债01", ZJZBL: "0.48" },  // 债券占净值比 0.48%
  { ZQDM: "019792", ZQMC: "25国债19", ZJZBL: "0.38" }   // 债券占净值比 0.38%
]
etfCode: "159516"                      // 母ETF代码：半导体设备ETF国泰
```

**019633 pingzhongdata 资产配置（最新一期示例）**：
```
stockRatio: 0       // 股票占净比 0%
bondRatio: 0.86     // 债券占净比 0.86%（与 fundmobapi 债券合计 0.48+0.38 一致）
cashRatio: 5.21     // 现金占净比 5.21%（来自 pingzhongdata Data_assetAllocation）
reportDate: "2026-06-30"
```

### Step 2: 空持仓检查

代码逻辑：
```javascript
if (!holdings.length && !etfCode) {
  return null;  // 无持仓且非ETF联接 → 放弃
}
```

019633 有 `etfCode = "159516"`，通过检查，继续计算。

### Step 3: 获取个股行情

由于 `holdings` 为空数组，`stockCodes = []`，`getStocksRealtime([])` 返回空对象 `{}`。

### Step 4: 计算已覆盖贡献 & 缺失股票权重

```javascript
coveredContribution = 0;     // 无持仓，0
missingStockWeight = 0;      // 无持仓，0
```

### Step 5: 获取基准指数涨跌幅

- `missingStockWeight = 0`，所以跳过 `getBenchmarkChange()`（沪深300），`benchmarkReturn = 0`
- `getBondBenchmarkChange()` 获取国债指数涨跌幅，用于债券部分

### Step 6: 获取资产配置（核心）

调用 `getFundAssetAllocation("019633")`，从 `pingzhongdata/019633.js` 提取 `Data_assetAllocation` 最新一期。

**019633 最新一期资产配置（示例）**：
```
stockRatio: 0       // 股票占净比 0%
bondRatio: 0.86     // 债券占净比 0.86%
cashRatio: 5.21     // 现金占净比 5.21%
reportDate: "2026-06-30"
```

**母ETF占比计算**：
```
etfWeight = 100 - stockRatio - bondRatio - cashRatio
          = 100 - 0 - 0.86 - 5.21
          = 93.93%
```

### Step 7: 获取母ETF实时行情

调用 `getETFRealtimeQuote("159516")`，走腾讯 qt.gtimg.cn 接口获取 159516（半导体设备ETF国泰）实时涨跌幅。

**示例行情（2026-07-27 盘中真实数据）**：
```
腾讯 qt.gtimg.cn 返回: v_sz159516="51~半导体设备ETF国泰~159516~0.757~..."
  fields[3]  = 0.757   (当前价)
  fields[32] = 2.02    (涨跌幅%)
  
etfQuote.estimatedChange = 2.02   // 母ETF实时涨跌幅
```

### Step 8: 加权求和

**ETF联接基金公式**（etfCode 非空 且 assetAlloc 非空）：

```
bondWeight = bondRatio = 0.86
missingContribution = missingStockWeight × benchmarkReturn = 0 × 0 = 0
bondContribution = bondWeight × bondBenchmarkChange = 0.86 × 国债涨跌幅
etfContribution = etfWeight × etfQuote.estimatedChange = 93.93 × 2.02 = 189.74

estimatedChange = (coveredContribution + missingContribution + bondContribution + etfContribution) / 100
                = (0 + 0 + 债券贡献 + 189.74) / 100
```

**代入实际数值（假设国债涨跌幅 ≈ 0%）**：
```
estimatedChange ≈ 189.74 / 100 ≈ 1.90%
```

---

## 完整计算示例

以某交易日实际数据为例：

| 项目 | 数值 | 来源 |
|------|------|------|
| 基金代码 | 019633 | - |
| 母ETF代码 | 159516 | fundmobapi FundMNInverstPosition |
| 个股持仓数 | 0 只 | fundmobapi |
| 股票占净比 | 0% | pingzhongdata Data_assetAllocation |
| 债券占净比 | 0.86% | pingzhongdata Data_assetAllocation |
| 现金占净比 | 5.21% | pingzhongdata Data_assetAllocation |
| 母ETF占比 | 93.93% | `100 - 0 - 0.86 - 5.21` |
| 母ETF涨跌幅 | +2.02% | 腾讯 qt.gtimg.cn 实时行情（2026-07-27） |
| 股票已覆盖贡献 | 0 | 无个股持仓 |
| 缺失股票贡献 | 0 | missingStockWeight=0 |
| 债券贡献 | ≈0 | 0.86 × 国债涨跌幅(≈0) |
| 母ETF贡献 | +189.74 | 93.93 × 2.02 |
| 最终涨跌幅 | **≈ +1.90%** | 各贡献求和 / 100 |
| 估值方法 | holdings | - |
| 覆盖率 | 100% | ETF联接基金设为100 |

---

## 日志输出示例

```
[14:35:01] [holdings] 019633 进入持仓穿透估值
[14:35:01] [holdings] 019633 持仓: 0只, 覆盖率=0%, 报告期=2026-06-30, etfCode=159516
[14:35:01] [holdings] 019633 行情: 0/0只成功
[14:35:01] [holdings] 019633 资产配置命中缓存（或：资产配置: 股票=0% 债券=0.86% 现金=5.21%）
[14:35:01] [holdings] 019633 母ETF=159516 涨跌幅=2.02% 占比=93.93%
[14:35:01] [holdings] 019633 贡献: 股票已覆盖=0.00 缺失股票=0.00 债券=0.00 母ETF=189.74
[14:35:01] [holdings] 019633 估值成功: method=holdings, change=1.90%, coverage=0%
```

---

## 关键设计决策

1. **母ETF占比 = 100 - 股票 - 债券 - 现金**：因为 pingzhongdata 不直接提供"基金占净比"字段，ETF联接基金中母ETF就是"基金"类别，所以用减法推算
2. **覆盖率设为 100%**：ETF联接基金中母ETF贡献了绝大部分估值，即便个股持仓为空，仍认为估值可靠
3. **资产配置缓存 24 小时**：该数据按季度更新，不需要高频刷新
4. **资产配置获取失败时回退**：若 `getFundAssetAllocation` 返回 null，则直接用 `母ETF涨跌幅 × 100%` 作为近似估值