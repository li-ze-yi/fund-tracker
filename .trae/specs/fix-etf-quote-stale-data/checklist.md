# Checklist

- [x] `GET /api/funds/etf-quote-test/:code` 路由已注册
- [x] 测试接口并行调用 push2、腾讯、新浪三个数据源
- [x] 每个数据源返回 `success`、`latencyMs`、`data`/`error`
- [x] 单个数据源失败不影响其他数据源
- [x] 无效 ETF 代码返回 400
- [x] push2 作为 `getETFRealtimeQuote` 的第一数据源
- [x] push2 调用使用 `defaultHeaders('https://quote.eastmoney.com/')`（含 User-Agent 和 Referer）
- [x] 深市 ETF（15/16 开头）secid 为 `0.${code}`
- [x] 沪市 ETF（51/56/588 等开头）secid 为 `1.${code}`
- [x] push2 当前价 = `f43 / 1000`，涨跌幅 = `f170 / 100`
- [x] push2 失败时回退到腾讯 qt.gtimg.cn
- [x] 腾讯失败时回退到新浪 hq.sinajs.cn
- [x] 每个数据源尝试均输出带时间戳日志
- [x] 回退时输出 warn 级别日志
- [x] 返回值格式不变（`estimatedValue`, `estimatedChange`, `estimationMethod`）
- [x] `node -c` 语法检查全部通过（fundService.js、fundController.js、funds.js）