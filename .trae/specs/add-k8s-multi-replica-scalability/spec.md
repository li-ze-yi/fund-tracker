# 后端多实例水平扩展（nginx / K8s 双部署 + Redis 共享缓存 + BullMQ 作业）Spec

## Why
当前后端通过 `node app.js` 单进程运行，无法利用多核与多实例，高并发下吞吐受限。希望**同时支持** nginx + 多进程 与 K8s 副本 两种部署、共用**同一份代码**，且无需手工指定调度进程。通过 Redis 共享缓存降低外部行情 API 压力、跨实例聚合外部请求，并用 **BullMQ 任务队列**承载定时作业，使执行者中途崩溃时作业被**自动重投**（分钟级恢复），而非等到下一触发点。

## What Changes
- **进程完全同构，零手工角色**：所有实例运行同一份 `app.js`，无 `SCHEDULER_ENABLED` 之类角色标识。每个实例既服务 HTTP，也运行 node-cron（仅入队）和 BullMQ worker（消费作业）。
- **Redis 共享缓存**：`globalCache` 存储后端在配置 `REDIS_URL` 时改为 Redis，多实例共享命中、TTL 复用 `getTTL(type)`、Redis 自动过期；未配置时回退内存 Map + 文件兜底；Redis 模式下跳过文件落盘。
- **跨实例外部请求聚合（分布式 singleflight）**：同一缓存 key 并发未命中时，基于 Redis 分布式锁仅一个实例调用外部行情 API，其余等待复用；含限定等待与有界降级。
- **定时作业 —— BullMQ 队列（ACK + 崩溃自动重投）**：定投（10:00/20:00）、日收益（23:55）、pending 结算（23:50）由各实例 node-cron 到点时**入队**（以确定性 `jobId`，如 `dailyProfit:2026-09-08`）；BullMQ worker（全部实例共用队列）领走执行，**完成后 ACK**。作业 id 去重保证入队唯一；worker 中途崩溃时，BullMQ **stalled-job 看门狗**检测到未确认作业，在 lockDuration/stalledInterval 后**自动重投**给其他 worker——作业被捞回，而非等下一触发点。
- **启动漏跑补录**：Redis 记录各作业最近成功运行水位；任一实例启动时若检出漏跑发生（如停机覆盖了 23:55），以确定性 jobId **补入队**，由 worker 处理（含幂等去重）。
- **作业幂等**：每个发生带幂等键，Worker 执行前校验"已处理则跳过"，重投/重复入队不产生重复下单/入账/结算。
- 健康检查 `GET /health` 返回 200。
- **部署适配 A（nginx）**：PM2 fork 运行 N 个相同实例（各监听不同端口）+ nginx `upstream`（`least_conn`）负载均衡 + TLS 终止 + 被动/主动健康检查。
- **部署适配 B（K8s）**：仅一份 `deployment-web.yaml`（stateless 多副本，全部相同，含探针）+ Redis 接入，无独立 scheduler 部署。
- **Redis 可选、优雅降级**：`REDIS_URL` 未配置时软件与当前完全一致（内存+文件缓存、cron 进程内直接执行、HTTP 正常），无需安装 Redis 即正常运行；配置后启用共享缓存 / 聚合 / BullMQ，运行中 Redis 不可用则缓存降为内存并记录日志，HTTP 不崩溃，恢复后自动回归。
- **BREAKING**：部署方式从单进程改为多实例；缓存由文件改为 Redis（配置时）。

## Impact
- 受影响能力:
  - 全局缓存（存储后端、TTL、文件落盘）
  - 定时作业（定投/日收益/pending）的可靠执行与崩溃重投
  - 部署与负载均衡（nginx 适配 A 与 K8s 适配 B）
- 受影响代码:
  - `server/services/globalCache.js`（Redis 后端 + 跨实例 singleflight）
  - 新增 `server/services/coordinator.js`（Redis 分布式锁，供外部请求聚合与 BullMQ 共享）
  - 新增 `server/services/jobs/`（BullMQ 队列 + worker + 作业处理器 + 水位）
  - 新增 `server/services/scheduler/`（node-cron 入队触发）
  - `server/app.js`（初始化 BullMQ、注册 node-cron 入队、启动 worker）
  - `server/package.json`（新增 `ioredis`、`bullmq`）
  - 新增 `server/ecosystem.config.js` 与 `server/deploy/nginx.conf.example`（适配 A）
  - 新增 `server/k8s/deployment-web.yaml` 与 `server/k8s/README.md`（适配 B）
  - `server/.env.example`（新增 `REDIS_URL` 说明）

## ADDED Requirements

### Requirement: Redis 共享缓存后端
系统 SHALL 在配置 `REDIS_URL` 时使用 Redis 作为 globalCache 存储后端，多实例共享同一缓存；缓存条目以现有 `getTTL(type)` 计算 TTL，由 Redis 自动过期。

#### Scenario: 配置 Redis
- **WHEN** `REDIS_URL` 已配置且 Redis 可连接
- **THEN** globalCache 读写 Redis，多实例共享命中率一致，无文件落盘、无并发写竞争

#### Scenario: 未配置 Redis（向后兼容）
- **WHEN** `REDIS_URL` 未配置
- **THEN** 回退为内存 Map + `data/globalCache.json` 文件持久化，本地单进程与测试行为不变

#### Scenario: Redis 不可用
- **WHEN** `REDIS_URL` 已配置但连接失败
- **THEN** 记录错误并回退为内存后端，HTTP 服务不崩溃（缓存降级可用）

### Requirement: 跨实例外部 API 请求聚合（分布式 singleflight）
系统 SHALL 在启用 Redis 时，对同一缓存 key 的并发未命中请求做跨实例聚合：同一时间仅一个实例（锁持有者）调用外部行情 API，其余等待复用。基于 Redis 分布式锁实现，含限定等待与有界降级。

#### Scenario: 多实例并发未命中同一 key
- **WHEN** 多个实例同时 miss 同一实时行情/净值 key
- **THEN** 仅一个实例调用外部 API，其余等待复用，最终仅产生一次外部请求

#### Scenario: 等待超时或 Redis 退化
- **WHEN** 等待超过限定时间或 Redis 不可用
- **THEN** 该实例降级为有界直接拉取，HTTP 请求不失败、不无界阻塞

### Requirement: BullMQ 作业队列（入队 + 消费 + ACK）
系统 SHALL 使用 BullMQ（底层 Redis）承载定时作业：node-cron 到点时以**确定性 jobId**（含作业名与发生键，如 `dailyProfit:2026-09-08`）入队，BullMQ worker（全部实例共用一个队列）领走执行，成功后 ACK。同一发生的多次入队因 jobId 去重只保留一个。

#### Scenario: cron 到点入队
- **WHEN** 定投/日收益/pending 定时点到达
- **THEN** 各实例 node-cron 尝试以同一 jobId 入队，BullMQ 去重后仅存在一个该发生的作业

#### Scenario: worker 消费确认
- **WHEN** worker 领走作业并正常完成
- **THEN** 作业标记为完成/移除，幂等键落账，其他 worker 不会再次消费该发生

### Requirement: 执行者崩溃自动重投
系统 SHALL 使 BullMQ 的 stalled-job 看门狗在 worker 中途崩溃时，将未 ACK 的作业在 lockDuration/stalledInterval 后**自动重投**（重新入队）供其他 worker 领取，使崩溃导致的半途作业在**分钟级**内被重跑，而非等到下一触发点。作业幂等保证重投安全。

#### Scenario: worker 中途崩溃
- **WHEN** worker 在执行中崩溃，未 ACK
- **THEN** 看门狗在 lockDuration/stalledInterval 后判定该作业停滞并重投，其他 worker 领取后幂等重跑，分钟级恢复

### Requirement: 启动漏跑补录
系统 SHALL 在 Redis 记录各作业最近成功运行水位；任一实例启动时检出漏跑发生（如停机覆盖调度点）并以确定性 jobId 补入队，交 worker 处理。补入队与正常入队同样经 jobId 去重与幂等。

#### Scenario: 停机错过定时点
- **WHEN** 全部实例在某定时点不可用，恢复后任一实例启动
- **THEN** 依据水位检出漏跑发生（日收益、pending 重点）并补入队，worker 处理（幂等）

#### Scenario: 无 Redis
- **WHEN** `REDIS_URL` 未配置
- **THEN** 漏跑补录与水位跳过，仅执行既有启动到期检查，不崩溃

### Requirement: 作业幂等
系统 SHALL 保证每个作业发生以幂等键标记，Worker 执行前校验"已处理则跳过"，重投或重复入队不产生重复下单/入账/结算副作用。

### Requirement: 无 Redis 也可正常运行（可选 + 优雅降级）
系统 SHALL 使 Redis 为可选组件：`REDIS_URL` 未配置时，软件运行方式与当前一致（内存+文件缓存、cron 进程内直接执行、HTTP 正常），无需安装 Redis；运行中 Redis 不可用时 HTTP 不崩溃、缓存降为内存并记录日志，Redis 恢复后自动回归。仅当配置且 Redis 可用时启用共享缓存、跨实例聚合与 BullMQ 多实例队列。

#### Scenario: 未配置 Redis
- **WHEN** `REDIS_URL` 未配置（未安装 Redis）
- **THEN** 整套软件单进程正常运行：缓存走内存+文件、定时作业进程内直接执行、HTTP 正常；多实例增强特性不启用

#### Scenario: 配置但 Redis 运行中不可用
- **WHEN** `REDIS_URL` 已配置但运行中连接失败/中断
- **THEN** 缓存降为内存并记录错误，HTTP 服务不崩溃；BullMQ 作业按重试策略记录/重试；Redis 恢复后自动回归

### Requirement: 健康检查端点
系统 SHALL 提供 `GET /health` 返回 200 表示进程存活，供 nginx 主动探活与 K8s readiness/liveness 探针使用。

### Requirement: 部署适配 A —— nginx 负载均衡
系统 SHALL 提供 PM2 fork 多实例（各监听不同端口）与 nginx 配置：nginx `upstream`（`least_conn`）负载均衡、TLS 终止、被动（`max_fails`/`fail_timeout`）与主动（`/health`）健康检查；所有实例相同。

#### Scenario: nginx 分发
- **WHEN** nginx 收到请求
- **THEN** 按 `least_conn` 分发到存活实例，单实例故障不影响整体服务

### Requirement: 部署适配 B —— K8s 副本
系统 SHALL 提供 K8s 清单：`deployment-web.yaml`（stateless 多副本，全部相同，readiness/liveness 探针）与 Redis 接入说明；定时作业经 BullMQ 队列分布到各副本消费，无需独立 scheduler 部署。

#### Scenario: 部署到 K8s
- **WHEN** 应用 K8s 清单并配置 `REDIS_URL`
- **THEN** 生成 N 个相同副本，定时作业由 node-cron 入队、BullMQ 分布式消费，实例崩溃由控制器重建且作业自动重投

## MODIFIED Requirements

### Requirement: 服务启动脚本（package.json）
新增 `ioredis`、`bullmq` 依赖；保留 `start`（单进程）/ `dev`；提供兼容 `pm2` 的启动脚本（适配 A 用）。**不引入 `SCHEDULER_ENABLED`。**

## REMOVED Requirements

### Requirement: 角色（SCHEDULER_ENABLED）手工指定
**Reason**: 改为所有实例同构，定时作业经 BullMQ 队列自动分发与重投，无需人工标记调度进程。
**Migration**: 删除角色标识；cron 只做确定性 jobId 入队，worker 消费 + ACK + 看门狗重投。

### Requirement: 采用水位 + reconcile 巡检作为崩溃恢复主体
**Reason**: 采用用户选定的 BullMQ（ACK + stalled-job 自动重投）作为崩溃恢复机制，可靠性更强、语义更清晰；水位仅用于启动漏跑补录，不再承担运行的周期巡检。
**Migration**: 崩溃恢复由 BullMQ 看门狗重投承担；水位保留用于启动时补入队漏跑发生。

### Requirement: 持久化缓存文件（默认路径）
**Reason**: 多实例下各实例独立文件落盘导致重复/竞争且无共享价值；改用 Redis 共享缓存承载。保留为"未配置 Redis 时的内存兜底"，不再作为主持久化路径。
**Migration**: 部署多实例时配置 `REDIS_URL`，缓存由 Redis 接管；本地/单进程不配置走内存+文件兜底。