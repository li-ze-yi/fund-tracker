# 修复 ETF 实时行情数据源时效性 Spec

## Why
`getETFRealtimeQuote` 以腾讯 qt.gtimg.cn 为主数据源，但该接口返回缓存数据（如 159516 在 10:20 的快照到午后仍未更新），导致 ETF 联接基金估值偏差。实测东方财富 push2 接口返回实时数据（0.40% vs 腾讯 2.02%），且此前标记为"不可用"的 socket hang up 问题已不存在。

## What Changes
- `getETFRealtimeQuote` 数据源优先级调整为：东方财富 push2 → 腾讯 qt.gtimg.cn → 新浪 hq.sinajs.cn
- 东方财富 push2 的 `secid` 需按市场区分：深市 ETF（15/16 开头）→ `0.${code}`，沪市 ETF（51/56 开头）→ `1.${code}`
- 解析 push2 返回的 `f43`（当前价 / 1000）和 `f170`（涨跌幅 / 100）
- 保留腾讯和新浪作为降级回退
- **非 BREAKING**：返回值格式不变（`{ estimatedValue, estimatedChange, estimationMethod }`）

## Impact
- Affected specs: `fix-etf-linkage-low-coverage`（ETF 联接基金估值依赖此接口）
- Affected code: `server/services/fundService.js` — `getETFRealtimeQuote` 函数；`server/routes/funds.js` — 新增测试路由

---

## ADDED Requirements

### Requirement: ETF 行情数据源测试接口
系统 SHALL 提供 `GET /api/funds/etf-quote-test/:code` 接口，用于在生产环境中验证各数据源可用性。

**请求示例**：`GET /api/funds/etf-quote-test/159516`

**响应格式**：
```json
{
  "code": "159516",
  "testTime": "2026-07-27T14:30:00.000Z",
  "results": {
    "push2": {
      "success": true,
      "latencyMs": 156,
      "data": { "price": 0.745, "changePercent": 0.40 },
      "error": null
    },
    "tencent": {
      "success": true,
      "latencyMs": 89,
      "data": { "price": 0.757, "changePercent": 2.02 },
      "error": null
    },
    "sina": {
      "success": false,
      "latencyMs": 3021,
      "data": null,
      "error": "timeout"
    }
  }
}
```

#### Scenario: 正常测试
- **WHEN** 请求 `GET /api/funds/etf-quote-test/159516`
- **THEN** 并行调用 push2、腾讯、新浪三个数据源
- **AND** 每个数据源返回 success、latencyMs、data/error
- **AND** 单个数据源失败不影响其他数据源的结果

#### Scenario: 无效代码
- **WHEN** 请求 `GET /api/funds/etf-quote-test/000000`
- **THEN** 返回 400，提示无效 ETF 代码

---

## MODIFIED Requirements

### Requirement: getETFRealtimeQuote 数据源优先级
系统 SHALL 按以下优先级获取 ETF 场内实时行情：

1. **东方财富 push2**（主）：`https://push2.eastmoney.com/api/qt/stock/get?secid={market}.{code}&fields=f43,f44,f170`
2. **腾讯 qt.gtimg.cn**（备1）：`http://qt.gtimg.cn/q={prefix}{code}`
3. **新浪 hq.sinajs.cn**（备2）：`http://hq.sinajs.cn/list={prefix}{code}`

#### Scenario: 159516（深市ETF）获取实时行情
- **WHEN** 调用 `getETFRealtimeQuote("159516")`
- **THEN** push2 secid = `0.159516`
- **AND** 解析 `f43 / 1000` 为当前价，`f170 / 100` 为涨跌幅
- **AND** 返回 `{ estimatedValue: 0.745, estimatedChange: 0.40, estimationMethod: 'etf_quote' }`

#### Scenario: 510050（沪市ETF）获取实时行情
- **WHEN** 调用 `getETFRealtimeQuote("510050")`
- **THEN** push2 secid = `1.510050`
- **AND** 解析逻辑同上

#### Scenario: push2 接口失败 → 回退腾讯
- **WHEN** push2 接口超时或返回空数据
- **THEN** 回退到腾讯 qt.gtimg.cn 接口
- **AND** 腾讯也失败时回退到新浪 hq.sinajs.cn
- **AND** 所有接口均失败时返回 null

#### Scenario: push2 返回无效数据
- **WHEN** push2 返回 `data.data.f43` 为 null/undefined/0
- **THEN** 视为失败，回退到腾讯接口
- **AND** 不抛出异常

---

## 技术细节

### push2 接口字段映射
| push2 字段 | 含义 | 转换 |
|-----------|------|------|
| `f43` | 当前价（原始值 × 1000） | `f43 / 1000` |
| `f170` | 涨跌幅（原始值 × 100） | `f170 / 100` |

### push2 请求头要求
push2 接口需要必要的请求头，复用现有 `defaultHeaders` 工具函数：
```javascript
headers: defaultHeaders('https://quote.eastmoney.com/')
// 展开为:
//   User-Agent: Mozilla/5.0 ... Chrome/120.0.0.0 Safari/537.36
//   Referer: https://quote.eastmoney.com/
//   Accept: */*
//   Accept-Language: zh-CN,zh;q=0.9
```
缺少 Referer 或 User-Agent 会导致请求被拒。

### secid 市场前缀
| ETF 代码特征 | 市场 | secid |
|-------------|------|-------|
| 159xxx, 16xxxx | 深市 | `0.${code}` |
| 510xxx, 56xxxx, 588xxx | 沪市 | `1.${code}` |

### 日志增强
- 每个数据源尝试和结果均输出带时间戳日志
- 回退时输出 warn 级别日志标明原因