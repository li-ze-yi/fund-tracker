# QDII/跨境基金盘中估算统一持仓加权 Spec

## Why

QDII/跨境基金（含 ETF 联接、纯美股 QDII、主动型 QDII）的盘中估算与盘后确认净值存在系统性口径错位，具体问题：

1. **母ETF场内价折溢价噪声**：ETF 联接基金（012870/母ETF=159696）盘中估算用母ETF场内交易价（今天 -0.20%），而确认净值跟踪母ETF官方净值（+1.38%）。实测 159696 场内价较净值长期溢价近 9.5%，两者温差动辄 1~1.6pp（实测 156bp/93bp）。场内价含折溢价与 A 股情绪，不构成真实净值信息。

2. **纯美股 QDII 持仓为空不可估**：12xxx 类直投美股 QDII（012753/162411）持仓为字母代码（NVDA 等），被 `^\d{5,6}$` 过滤后 holdings 为空且无母ETF → 命中 "持仓为空 (非ETF联接基金)" 警告，白白不可估。

3. **缺失持仓用沪深300 填充失真**：美股 QDII 的披露缺口（40%~80%）用沪深300/国债指数填充，与纳指/标普/油气走势无关，估算结果偏离。

4. **白天美股重复计入**：白天（北京 9:30-15:00）美股未开盘，若直接取 us 行情"最近收盘涨跌"叠加在最新确认净值上，会重复计入已包含在确认净值中的涨跌（012753 曾因此虚高至 +1.61% vs 新浪口径 +0.05%）。

5. **确认净值滞后 1 天口径未被利用**：QDII 确认净值合法滞后 1 天，即"最新确认净值日 D"与"美股最新交易日 T"存在 D==T 或 D==T-1 两种关系，可据此推导白天正确估算增量，而不是按场内价。

## What Changes

- `server/services/fundService.js`：
  - `getStockPrefix`：字母开头代码 → `'us'`（腾讯 us 前缀，实测 `usNVDA` 等批量可用，字段布局与 A 股一致 `[32]`=涨跌幅）。
  - `getFundHoldings`：过滤正则放宽为 `^(?:\d{5,6}|[A-Z]{1,6})$`（允许美股字母）；**仅 QDII/海外类型（`isQdiiFundType`）**且 `fundStocks` 为空但有 `ETFCODE` 时**递归拉母ETF成分**（012870→159696→10 只纳指成分，实测可行）；非 QDII 的 A 股 ETF 联接不递归，维持原路径。
  - 新增 `getIndexChange(indexCode)`：通用指数行情（腾讯 `qt.gtimg.cn/q=`，解析 `[32]` 涨跌幅），复用 `usNDX / usINX / usDJI / hkHSI / hkHSTECH`；新增 `getNikkeiIndexChange()`（新浪 `int_nikkei`，当日数据）。
  - `getHoldingsEstimatedOverlay`（**仅 QDII 类进入新分支，A 股基金零改动**）：
    - 板块识别（仅 QDII）：持仓含字母→美股基金（缺失用 usNDX）；持仓含 5 位数字→港股基金（缺失用 hkHSI）；**非 QDII 基金（含港股通）维持原缺失填充（沪深300/国债）**。**日/韩不特判**（保留原逻辑）。
    - **美股增量规则**：解析 us 指数时间戳得到最新美股交易日 T；比较基金确认净值日 D：
      - `D == T` → 美股部分增量 = 0（美股涨跌已计入确认净值，白天恒定）
      - `D == T-1` → 增量 = 美股指数 changePercent（确认净值未含最近美股交易日）
      - `D < T-1` → 不叠加，估算兜底为"展示最新确认净值"
    - 缺失填充（仅 QDII）改用板块指数（usNDX/hkHSI）替代沪深300/国债。
    - **仅 QDII 的 ETF 联接分支**主导从母ETF场内价（`getETFRealtimeQuote`）切换为"成分加权+板块指数补缺"；A 股 ETF 联接维持场内价路径；`getETFRealtimeQuote` 保留作兜底。
  - `getBenchmarks()`：**按需**预取 usNDX、hkHSI（日经可选）——仅当批量含 QDII/跨市场基金时，随 `benchmarks` 传入批量覆盖；纯 A 股批量不请求。

- 不涉及前端代码改动，不涉及数据库 schema 变更。

## Impact

- Affected code:
  - `server/services/fundService.js` — `getStockPrefix`、`getFundHoldings`（过滤+递归）、`getIndexChange`/`getNikkeiIndexChange`（新增）、`getHoldingsEstimatedOverlay`（板块识别/美股增量/缺失填充/ETF分支）、`getBenchmarks`
- 行为边界（fail-safe）：
  - **A 股基金零改动（硬约束）**：所有新逻辑必须以「`isQdiiFundType(type)` 或 持仓含字母/5位数字」为 gate；纯 A 股持仓（全 6 位数字）永不进入新分支。A 股 ETF 联接、A 股指数型、港股通基金维持现有路径（母ETF场内价 `getETFRealtimeQuote`、沪深300/国债缺失填充）。
  - us/hk 指数行情获取失败 → 对应缺失填充回退 沪深300/国债（原逻辑），估算不崩溃。
  - 确认净值日 D 无法获取 → 美股增量规则默认按 0 处理（保守，白天恒定）。
  - 日/韩代码（混合形态如 285A/02513）不匹配放开后的过滤 → 归入"缺失"，按板块识别结果用指数补（未加个股/指数源，保持原逻辑）。
  - 韩国暂无可用指数源（腾讯/新浪实测均缺失）→ 韩股缺失部分的填充指数待产品确认（默认并入"其他宽基"近似或不填充）。
- 与既有 spec 的关系：依赖 `fix-confirmed-nav-freshness-qdii` 的确认净值基准（D 的判定）、`switch-holdings-to-mobapi` 的持仓来源（fundmobapi）。
- 实现注意：`isQdiiFundType` 定义在 `holdingService.js`，而 `holdingService` 依赖 `fundService`——fundService **不得反向 require holdingService**（循环依赖）。方案二选一：①在 fundService 内置同正则（`/QDII|海外/`）的轻量实现（两处保持一致）；②由调用方（fundController/holdingController）查询 `funds.type` 后以函数参数传入 `isQDII` 标记。推荐 ①（改动点收敛在 fundService 内部）。

---

## ADDED Requirements

### Requirement: 美股字母代码进入常规行情链路

持仓过滤正则 SHALL 从 `^\d{5,6}$` 放宽为 `^(?:\d{5,6}|[A-Z]{1,6})$`；`getStockPrefix` SHALL 对字母开头代码返回 `'us'`。使美股成分进入腾讯 `qt.gtimg.cn/q=usXXX` 批量行情（字段布局与 A 股一致）。日/韩及混合形态代码（285A/02513 等）不匹配正则，维持被过滤（归入缺失填充）。

#### Scenario: 纯美股 QDII 持仓可获取

- **WHEN** 012753（建信纳指100 C）fundmobapi 返回 10 只美股字母代码且无 ETFCODE
- **THEN** holdings=10 只全数进入，不再触发"持仓为空"警告

#### Scenario: 日/韩混合代码仍过滤

- **WHEN** 270023（广发全球精选）持仓含 285A（KIOXIA）、02513（智谱）等混合/非标准代码
- **THEN** 这些代码不匹配过滤正则，被排除，仅字母/数字标准代码进入加权

### Requirement: ETF 联接基金递归母ETF成分（仅 QDII/海外）

`getFundHoldings(fundCode)` 在 `fundStocks` 为空、`ETFCODE` 非空**且基金为 QDII/海外类型**（`isQdiiFundType(type)`）时 SHALL 递归调用 `getFundHoldings(ETFCODE)`，将母ETF成分作为该联接基金的持仓参与加权。递归深度限制为 1 层。**非 QDII 的 A 股 ETF 联接不递归**——其估值维持现有"母ETF场内价（`getETFRealtimeQuote`）"路径，不受影响。

#### Scenario: QDII 联接基金拿到真实成分

- **WHEN** 012870（易方达纳指ETF联接C，QDII）fundStocks 空、ETFCODE=159696
- **THEN** 递归得到 159696 的 10 只纳指成分（NVDA/AAPL/…），估算走成分加权而非母ETF场内价

#### Scenario: A 股 ETF 联接不受影响

- **WHEN** A 股 ETF 联接（如沪深300ETF联接，非 QDII）fundStocks 空且有 ETFCODE
- **THEN** 不递归，维持原路径（母ETF场内价估值），行为与现状完全一致

### Requirement: 板块指数缺失填充（仅 QDII，新增指数基准）

**仅 QDII/海外类型**基金的缺失持仓 SHALL 用对应板块指数涨跌幅填充：美股方向→usNDX（纳斯达克100）、港股方向→hkHSI（恒生指数）或 hkHSTECH（恒生科技）。指数获取复用腾讯 `qt.gtimg.cn`（`[32]` 涨跌幅），日经用新浪 `int_nikkei`。指数行情失败时回退原沪深300/国债。**非 QDII 基金（A 股股基、A 股指数型、A 股 ETF 联接、港股通基金）缺失填充保持原逻辑（沪深300/国债）**。

#### Scenario: QDII 港股基金缺失用恒生指数

- **WHEN** 港股方向 QDII 持仓代码为 5 位数字（hk 前缀），部分股票无行情
- **THEN** 缺失部分按恒生指数（hkHSI）当日涨跌填充，而非沪深300

#### Scenario: QDII 美股基金缺失用纳指

- **WHEN** 美股方向 QDII（持仓含字母）缺失比例为 m
- **THEN** 缺失部分按纳斯达克100（usNDX）涨跌填充

#### Scenario: 港股通基金保持沪深300缺失填充

- **WHEN** 港股通基金（非 QDII，type=指数型-股票）持仓 5 位数字代码部分无行情
- **THEN** 缺失部分维持原沪深300填充，行为与现状一致

### Requirement: 美股增量白天保持恒定（避免重复计入）

美股相关估算 SHALL 以"最新确认净值"为基准，结合最新美股交易日 T（解析自 us 指数时间戳/最新确认净值日期）计算增量：
- `D == T`：美股部分增量=0（白天恒定，等于展示确认净值）
- `D == T-1`：增量=美股指数最近涨跌幅（确认净值未包含的最近交易日）
- `D < T-1`：不叠加，估算回退"展示最新确认净值"

#### Scenario: 010753 确认净值滞后 1 天（D==T-1）

- **WHEN** 012753 最新确认净值 08-26（D），美股最新交易日 08-27（T，纳指 +1.43%）
- **THEN** 白天估算增量 ≈ +1.43% 恒定，直到 08-27 净值确认后更新（不再用场内折溢价）

#### Scenario: 012870 确认净值已含最新美股交易日（D==T）

- **WHEN** 012870 最新确认净值 08-27（D，已含美股 08-27 的 +1.43%），今天美股未开盘（T=08-27）
- **THEN** 白天估算增量 = 0（恒定展示确认净值 +1.38%），不随母ETF场内折溢价波动

#### Scenario: 确认净值滞后更久（D<T-1）

- **WHEN** QDII 最新确认净值日为 08-25，美股最新交易日为 08-27（D<T-1）
- **THEN** 不叠加美股增量，回退展示最新确认净值，避免伪精确

### Requirement: ETF 联接估值切到成分加权（仅 QDII；场内价仅兜底）

`getHoldingsEstimatedOverlay` 的 **QDII 类** ETF 联接分支 SHALL 以成分加权+板块指数补缺为**主导**，母ETF场内价（`getETFRealtimeQuote`）仅在成分/指数数据缺失时作为兜底。**非 QDII 的 A 股 ETF 联接分支不进入该主导切换**，维持现有 `getETFRealtimeQuote` 场内价估值逻辑。

#### Scenario: QDII 联接基金白天估算恒定

- **WHEN** 012870 白天（美股未开盘），母ETF 159696 场内 -0.20%
- **THEN** 估算不跟随场内 -0.20%，而是按"最新确认净值 + 板块指数增量规则"（白天≈0），与盘后确认口径一致

#### Scenario: A 股 ETF 联接维持场内价估值

- **WHEN** A 股 ETF 联接（非 QDII）白天交易时段
- **THEN** 估值仍按母ETF场内价（`getETFRealtimeQuote`），行为与现状完全一致

### Requirement: A 股基金行为零改动（硬约束 + 回归保证）

本次改造 SHALL 保证 A 股全部基金（股票型、混合型、指数型、A 股 ETF 联接、港股通）盘中估算行为与现状完全一致。实现约束：所有新增分支（us 行情、板块指数缺失填充、美股增量规则、QDII 递归）均以「`isQdiiFundType(type)` 为 true 或持仓含字母/5 位数字」为前置 gate；纯 A 股持仓（全 6 位数字 A 股代码）永不进入任何新分支。回归验证集合：A 股股票/混合/指数基金各 ≥1 只 + A 股 ETF 联接 ≥1 只 + 港股通基金 ≥1 只，估算结果与改动前逐项一致（含缺失填充指数、母ETF场内价路径、估算方法标识）。

#### Scenario: A 股股基/指数基金无回归

- **WHEN** 161725（中证白酒）、110022（主动混合）等纯 A 股基金走持仓穿透
- **THEN** 缺失填充维持沪深300/国债、基准与估算方法与改动前完全一致

#### Scenario: A 股 ETF 联接无回归

- **WHEN** A 股 ETF 联接（非 QDII）盘中估值
- **THEN** 不递归、不走成分加权，仍按母ETF场内价估值，结果与改动前一致

#### Scenario: 港股通基金无回归

- **WHEN** 港股通基金（type=指数型-股票，非 QDII）持仓 5 位数字代码部分无行情
- **THEN** 缺失填充维持沪深300，不因"5 位数字→hk"误入 QDII 板块分支

### Requirement: 批量基准预取扩展（按需）

`getBenchmarks()` 在原沪深300、国债基础上 SHALL 按需预取 usNDX、hkHSI（日经可选）——**仅当批量基金列表含 QDII/跨市场基金（QDII 类型或持仓含字母/5位数字）时**请求，随 `benchmarks` 传入批量调用。纯 A 股批量不请求 us/hk 指数（不引入多余网络请求）。

#### Scenario: 批量场景零重复请求

- **WHEN** 一次批量估值含美股/港股基金各若干只
- **THEN** 各指数行情全批量仅请求 1 次，单只基金复用 `benchmarks` 传入值

#### Scenario: 纯 A 股批量不新增请求

- **WHEN** 批量基金全部为 A 股（无 QDII，无字母/5位持仓）
- **THEN** 不请求 us/hk 指数，网络开销与改动前一致

---

## MODIFIED Requirements

### Requirement: 日/韩市场保留原逻辑

不新增日/韩个股行情源、不新增日/韩指数源（韩国 KOSPI 实测腾讯/新浪均无可用接口；日本仅指数可用、个股不可用）。日/韩代码不匹配过滤正则而被排除，其缺失部分按基金板块识别结果走通用缺失填充（非美股非港股时维持沪深300/国债原逻辑）。韩股缺失填充指数待产品确认。

#### Scenario: 日/韩成分缺失按原逻辑兜底

- **WHEN** 主动型 QDII 持仓含韩股/日股代码（无行情源）
- **THEN** 该部分归入缺失权重，不做特殊处理，维持现有缺失填充行为

### Requirement: 主动型 QDII 缺失占比大的精度边界

主动型 QDII 披露仅前十大（覆盖约 30%~60%），缺失部分用板块指数填充后估算仍有偏差（行业共识）。Spec 接受此精度边界，不承诺与确认净值达到 ETF 联接级拟合；白天展示确认净值时不做估算覆盖。

---

## REMOVED Requirements

无