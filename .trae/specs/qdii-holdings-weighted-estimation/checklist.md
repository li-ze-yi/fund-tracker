# Checklist

## A 股基金零改动（硬约束）

- [x] 所有新分支以「`isQdiiFundType(type)` || 持仓含字母/5位数字」为 gate；纯 A 股持仓（6位数字）永不进入新分支
- [x] A 股 ETF 联接不递归、不走成分加权，维持母ETF场内价路径
- [x] 非 QDII（含港股通）缺失填充保持沪深300/国债
- [x] 回归集合全程对照：A 股股票/混合/指数基金、A 股 ETF 联接、港股通基金各 ≥1 只，估算结果与改动前一致

## 美股字母代码进入行情链路

- [x] `getStockPrefix`：字母开头代码 → `'us'`
- [x] `getFundHoldings` 过滤正则放宽：`/^(?:\d{5,6}|[A-Z]{1,6})$/`
- [x] 腾讯 `qt.gtimg.cn/q=usXXX` 批量行情可用（字段[32]涨跌幅与A股一致）
- [x] 012753 纯美股 QDII 持仓 10 只全进入，不再触发"持仓为空"警告

## QDII ETF 联接基金递归母ETF成分

- [x] 仅 QDII/海外类型（`isQdiiFundType`）且 fundStocks 空且有 ETFCODE 时递归（深度≤1）
- [x] 012870→159696→10 只纳指成分递归成功
- [x] 非 QDII 的 A 股 ETF 联接（110020）验证不递归，走母ETF场内价原路径

## 板块指数缺失填充（仅 QDII）

- [x] 新增 `getIndexChange(indexCode)`（腾讯，解析 [32] 涨跌幅 + 时间戳日期）
- [x] 新增日经指数获取（新浪 `int_nikkei`）
- [x] 新增 `getFundUsIndexCode(fundName)` 名称关键词映射：纳指/纳斯达克→usNDX、标普/500→usINX、道琼斯→usDJI、默认 usNDX
- [x] `getBenchmarks` 批量预取 usNDX+usINX+usDJI+hkHSI，按 `usIndexMap` 复用
- [x] 调用方（fundController/holdingService）传入 `fundName`/`fundNameMap`
- [x] 验证 017641（标普500）→ usINX（-0.27% vs 修复前默认 usNDX 的 -0.01%）；012753/012870（纳指）→ usNDX
- [x] QDII 美股基金缺失 → 映射指数；QDII 港股基金缺失 → hkHSI；非 QDII → 沪深300/国债原逻辑
- [x] 指数获取失败时回退原沪深300/国债（fail-safe）
- [ ] 韩国 KOSPI 不可用：韩股缺失填充指数（待产品确认，默认不新增指数源）

## 美股增量白天保持恒定（避免重复计入）

- [x] 解析 us 指数时间戳得到最新美股交易日 T
- [x] `D == T` → 美股增量 0（白天恒定，等于展示确认净值）
- [x] `D == T 的前一美股交易日`（跳过周末/美股节假日，非自然日减一）→ 增量 = 美股指数最近涨跌幅
- [x] `D < 前一交易日` → 不叠加，回退展示最新确认净值
- [x] 修复跨周末误判：T=08-31(周一) 时用自然日 T-1=08-30(周日) 误置 0 → 改为前一美股交易日 08-28(周五)，D=08-28 正常启用增量（生产日志 09-01 场景）
- [x] 验证 012753（D=08-28/T=08-31 → 前一交易日）估算非零
- [x] 验证 012870（D==T）估算 ≈ 0，不随场内折溢价波动
- [x] 验证 D 更早（滞后≥2 交易日）→ 置 0 保守

## QDII ETF 联接估值切到成分加权

- [x] 仅 QDII 的 ETF 联接分支主导 = 成分加权+板块指数补缺
- [x] `getETFRealtimeQuote` 降级为兜底（成分/指数缺失时）
- [x] A 股 ETF 联接（110020）验证仍走 `getETFRealtimeQuote`（场内价）原路径
- [x] 012870 白天估算与盘后确认口径一致（不再用场内 -0.20%）

## 批量基准预取扩展（按需）

- [x] `getBenchmarks()` 预取：沪深300、国债 + 仅含 QDII 时 usNDX、hkHSI
- [x] 批量场景各指数仅请求 1 次，单只基金复用 `benchmarks`
- [x] 纯 A 股批量不请求 us/hk 指数

## 回归与验证

- [x] A 股基金（161725 等）行为不变（无回归）
- [x] QDII 港股基金缺失走恒生指数
- [x] 日/韩混合代码（285A/02513）仍被过滤，归入缺失，无新增源
- [x] `node --check` 全改动文件通过
- [x] 服务启动无报错；`npm test` 7/7 通过