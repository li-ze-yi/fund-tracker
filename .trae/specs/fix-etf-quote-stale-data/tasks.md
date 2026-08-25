# Tasks

- [x] Task 1: 新增 ETF 行情数据源测试接口 `GET /api/funds/etf-quote-test/:code`
  - 在 `server/routes/funds.js` 中添加路由
  - 在 `server/controllers/fundController.js` 中添加处理函数
  - 并行调用 push2、腾讯、新浪三个数据源，记录各自的 latencyMs
  - push2 调用使用 `defaultHeaders('https://quote.eastmoney.com/')` 请求头
  - 每个数据源独立 try/catch，失败不影响其他
  - 校验 ETF 代码格式（5-6 位数字），无效返回 400
  - 返回 `{ code, testTime, results: { push2, tencent, sina } }` 格式

- [x] Task 2: 重构 `getETFRealtimeQuote` 数据源优先级
  - 将 push2 作为第一数据源，腾讯作为第二，新浪作为第三
  - 根据 ETF 代码前缀确定 secid 市场：15/16 → `0.${code}`，其他 → `1.${code}`
  - 解析 push2 返回的 `f43 / 1000`（当前价）和 `f170 / 100`（涨跌幅）
  - 保留腾讯和新浪的降级回退逻辑
  - 每个数据源尝试/失败/成功均输出带时间戳日志

- [x] Task 3: 语法检查
  - `node -c d:\fundtracker\server\services\fundService.js` 通过
  - `node -c d:\fundtracker\server\controllers\fundController.js` 通过
  - `node -c d:\fundtracker\server\routes\funds.js` 通过

# Task Dependencies
- Task 1 无依赖，可独立执行
- Task 2 无依赖，可独立执行
- Task 3 依赖 Task 1、2