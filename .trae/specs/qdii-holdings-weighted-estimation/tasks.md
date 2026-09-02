# Tasks

## Task 0: A 股基金零改动约束（硬约束，贯穿所有 Task）

- [x] SubTask 0.1: 所有新增分支以「`isQdiiFundType(type)` || 持仓含字母/5位数字」为 gate；纯 A 股持仓（全 6 位数字）永不进入新分支
- [x] SubTask 0.2: A 股 ETF 联接不递归、不走成分加权，维持母ETF场内价路径
- [x] SubTask 0.3: 非 QDII（含港股通）缺失填充保持沪深300/国债
- [x] SubTask 0.4: 回归集合全程对照：A 股股票/混合/指数基金、A 股 ETF 联接、港股通基金各 ≥1 只，估算结果与改动前逐项一致（缺失填充指数、场内价路径、估算方法标识）

## Task 1: 美股字母代码进入行情链路

- [x] SubTask 1.1: `getStockPrefix` 支持字母代码 → `'us'`（腾讯 us 前缀）
- [x] SubTask 1.2: `getFundHoldings` 过滤正则放宽为 `/^(?:\d{5,6}|[A-Z]{1,6})$/`（日/韩混合代码如 285A 不匹配，保持过滤）
- [x] SubTask 1.3: `getStocksRealtimeBatch` 解析正则支持 us 前缀（`/v_(?:sh|sz|hk|us)([0-9A-Z.]+)="(.+)"/`）
- [x] SubTask 1.4: 验证腾讯批量美股行情（012753 十只持仓全部取到，字段[32]涨跌幅解析正确）

## Task 2: QDII ETF 联接基金递归母ETF成分

- [x] SubTask 2.1: `getFundHoldings`：仅 QDII/海外类型（`isQdiiFundType`）且 `fundStocks` 空且有 `ETFCODE` 时递归 `getFundHoldings(ETFCODE)`（深度≤1）
- [x] SubTask 2.2: 缓存键复用（递归结果写回 holdingsCache，避免重复请求）
- [x] SubTask 2.3: 验证 012870→159696→10 只纳指成分，加权路径可用
- [x] SubTask 2.4: 验证非 QDII 的 A 股 ETF 联接（110020）不递归（维持原 getETFRealtimeQuote 场内价路径）

## Task 3: 板块指数缺失填充（仅 QDII）

- [x] SubTask 3.1: 新增 `getIndexChange(indexCode)`（腾讯，时间戳+[32] 解析），复用 usNDX/usINX/usDJI/hkHSI/hkHSTECH
- [x] SubTask 3.2: 新增日经指数获取（新浪 `int_nikkei`，当日数据）
- [x] SubTask 3.3: `getHoldingsEstimatedOverlay` 板块识别（仅 QDII）：含字母→美股、5位数字→港股、否则 A 股；缺失填充分别用映射指数 / hkHSI / 沪深300（原逻辑）
- [x] SubTask 3.4: 新增 `getFundUsIndexCode(fundName)` 名称关键词映射（纳指→usNDX、标普/500→usINX、道琼斯→usDJI、默认 usNDX），且 `getBenchmarks` 预取三指数按 `usIndexMap` 复用
- [x] SubTask 3.5: 指数获取失败回退原沪深300/国债（fail-safe）
- [ ] SubTask 3.6: 韩国 KOSPI 缺失：确认无可用源，缺失填充指数写入 spec 待定项（默认不填充新指数）
- [x] SubTask 3.7: 验证非 QDII（A 股、港股通）缺失填充维持沪深300/国债；017641 标普500 命中 usINX

## Task 4: 美股增量白天保持恒定

- [x] SubTask 4.1: 解析 us 指数时间戳 → 最新美股交易日 T
- [x] SubTask 4.2: 获取基金最新确认净值日 D（复用确认净值链路）
- [x] SubTask 4.3: 增量规则：`D==T`→0；`D==T 的前一美股交易日`（跳过周末/美股节假日，非自然日减一）→指数涨跌；`D 更早`→不叠加回退确认净值
- [x] SubTask 4.4: 新增 `isUsMarketHoliday`（周末+美股9大节假日）与 `getPrevUsTradingDay`，修复跨周末场景误置 0（自然日 T-1=周日；生产日志 09-01 D=08-28/T=08-31 应启用增量）
- [x] SubTask 4.5: 验证 012753（D=08-28/T=08-31 前一交易日）：估算非零（实测 0.18%）
- [x] SubTask 4.6: 验证 012870（D==T）：白天估算≈0，不随场内折溢价波动
- [x] SubTask 4.7: 验证 D 更早（滞后≥2 交易日，如 08-27）：置 0 保守

## Task 5: QDII ETF 联接估值切到成分加权

- [x] SubTask 5.1: 仅 QDII 的 ETF 联接分支主导改为"成分加权+板块指数补缺"
- [x] SubTask 5.2: `getETFRealtimeQuote` 降级兜底（成分/指数缺失时触发）
- [x] SubTask 5.3: 验证 012870 白天估算与盘后确认口径一致（对比新浪估算/确认净值）
- [x] SubTask 5.4: 验证 A 股 ETF 联接（110020）仍走 `getETFRealtimeQuote` 原路径

## Task 6: 批量基准预取扩展（按需）

- [x] SubTask 6.1: `getBenchmarks()` 预取沪深300、国债；仅当批量含 QDII/跨市场基金时预取 usNDX、hkHSI（日经可选）
- [x] SubTask 6.2: 批量覆盖按板块复用 `benchmarks` 值，单只基金不重复请求
- [x] SubTask 6.3: 验证纯 A 股批量不请求 us/hk 指数（网络开销与改动前一致）

## Task 7: 回归与验证

- [x] SubTask 7.1: A 股基金（161725、110022、A 股 ETF 联接、港股通）行为不变（无回归）
- [x] SubTask 7.2: QDII 港股基金缺失走恒生指数
- [x] SubTask 7.3: 日/韩混合代码仍被过滤，归入缺失，无新增源（保留原逻辑）
- [x] SubTask 7.4: `node --check` 全改动文件通过；服务启动无报错；`npm test` 7/7 通过

# Task Dependencies

- Task 0（A 股零改动约束）贯穿所有 Task，是全局硬约束，先行评审通过后再实施其余任务
- Task 1（us 前缀）是 Task 3/4/5 的前置（行情链路）
- Task 2（递归母ETF成分）是 Task 5 的前置（成分加权来源）
- Task 3（板块识别）是 Task 4/5 的前置（缺失填充与板块基准）
- Task 4 依赖 Task 1（us 指数行情）与既有确认净值链路（D 判定）
- Task 5 依赖 Task 2/3（成分+缺失）
- Task 6 独立（批量基准预取），Task 7 收尾回归
- 实施前需产品确认：韩国缺失填充指数、QDII ETF 场内价兜底是否保留（兜底已保留作 fail-safe）