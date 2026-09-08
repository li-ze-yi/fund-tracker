# Tasks

- [x] Task 1: Redis 基础设施（缓存 + 协调器）
  - [x] SubTask 1.1: 新增 `ioredis`、`bullmq` 依赖；读取 `REDIS_URL` 配置，未配置时禁用 Redis/BullMQ
  - [x] SubTask 1.2: Redis 后端接入 globalCache（set/get 复用 `getTTL(type)`，`EX`/`PEXPIRE`，命中刷新 TTL），保持内存+文件兜底，Redis 模式下跳过 loadFromFile/startPersistence/startCleanup；连接失败降级内存后端不崩溃
  - [x] SubTask 1.3: 新增 `services/coordinator.js`（Redis `SET NX PX` 分布式锁 + 释放 + 降级）
  - [x] SubTask 1.4: checkCache/peekCache 在 Redis 模式下走 Redis 查询

- [x] Task 2: 跨实例外部请求聚合（singleflight）
  - [x] SubTask 2.1: getOrFetch 未命中路径接入 coordinator 锁：仅锁持有者调用外部 API 并写缓存，其余等待复用；限定等待 + 有界降级（HTTP 不失败不无界阻塞）
  - [x] SubTask 2.2: 保留同实例内存 in-flight 去重；无 Redis 时锁为空操作直接拉取

- [x] Task 3: 作业模块抽取
  - [x] SubTask 3.1: 将定投（10:00/20:00）、日收益（23:55）、pending（23:50）逻辑抽取为作业处理器函数（`services/jobs/processors.js`）
  - [x] SubTask 3.2: 启动到期检查逻辑抽取为作业/启动流程可调用函数

- [x] Task 4: BullMQ 队列与 worker 框架
  - [x] SubTask 4.1: 定义各作业队列（plans/dailyProfit/pendingSettle），连接 Redis
  - [x] SubTask 4.2: worker 消费：执行处理器 → 成功 ACK / 失败记日志
  - [x] SubTask 4.3: 配置 `lockDuration`（≥作业最长时长）、`stalledInterval`、`attempts`/`backoff`，支持崩溃后看门狗自动重投
  - [x] SubTask 4.4: 优雅退出：SIGTERM 时完成在跑作业再关 worker（close 均等停止）

- [x] Task 5: node-cron 入队触发（全部实例同构）
  - [x] SubTask 5.1: 各实例注册 node-cron，定投（10:00/20:00）、日收益（23:55）、pending（23:50）按确定性 jobId（含作业名+发生键）入队
  - [x] SubTask 5.2: 入队去重：jobId 唯一，多次入队不重复创建
  - [x] SubTask 5.3: 无 Redis 时回退为进程内直接执行（单进程兼容）

- [x] Task 6: 启动漏跑补录（水位）
  - [x] SubTask 6.1: Redis 记录各作业最近成功运行水位（`job:lastrun:<name>`），worker 成功后更新
  - [x] SubTask 6.2: 实例启动时检出漏跑发生并以确定性 jobId 补入队（日收益、pending 重点；定投由启动到期检查+下次调度兜底）
  - [x] SubTask 6.3: 无 Redis 时跳过补录，仅执行既有启动到期检查，不崩溃

- [x] Task 7: 作业幂等
  - [x] SubTask 7.1: 每个发生以幂等键标记；执行前校验"已处理则跳过"，重投/重复入队无重复下单/入账/结算

- [x] Task 8: 健康检查端点
  - [x] SubTask 8.1: 新增 `GET /health` 返回 200，不依赖定时作业即可响应

- [x] Task 9: package.json 与配置
  - [x] SubTask 9.1: `ioredis`、`bullmq` 加入 dependencies；保留 `start`/`dev`
  - [x] SubTask 9.2: `.env.example` 增加 `REDIS_URL` 与 BullMQ 相关说明

- [x] Task 10: 部署适配 A —— nginx
  - [x] SubTask 10.1: `ecosystem.config.js`（PM2 fork，N 个相同实例，各独立 PORT，自动重启）
  - [x] SubTask 10.2: `deploy/nginx.conf.example`（upstream least_conn + proxy_pass + TLS + /health 健康检查）

- [x] Task 11: 部署适配 B —— K8s
  - [x] SubTask 11.1: `k8s/deployment-web.yaml`（stateless，N 个相同副本，readiness/liveness 探针，REDIS_URL）
  - [x] SubTask 11.2: `k8s/README.md` 说明 Redis 接入方式

- [x] Task 12: 验证
  - [x] SubTask 12.1: `npm run lint` 通过
  - [x] SubTask 12.2: 无 REDIS_URL 时 `npm start` 走内存+文件兜底并直接执行定时作业（向后兼容）
  - [x] SubTask 12.3: 配置 REDIS_URL，缓存读写 Redis、多实例共享命中
  - [x] SubTask 12.4: 多实例同时到点，jobId 去重后同一发生只入队一次、仅一次执行
  - [x] SubTask 12.5: worker 中途崩溃（未 ACK），stalled 看门狗在 lockDuration/stalledInterval 后重投，其他 worker 幂等重跑（分钟级）
  - [x] SubTask 12.6: 模拟停机错过定时点后任一实例启动，Redis 水位补入队日收益/pending
  - [x] SubTask 12.7: 同一发生重复入队/重投，幂等校验跳过，无重复副作用
  - [x] SubTask 12.8: `GET /health` 返回 200
  - [x] SubTask 12.9: Redis 不可用时服务不崩溃，降级为内存后端
  - [x] SubTask 12.10: 未配置 REDIS_URL（未安装 Redis）时，整套软件单进程/单实例正常运行（缓存+直接执行定时作业+HTTP）

# Task Dependencies
- Task 1、Task 3、Task 8 相互独立可并行。
- Task 2 依赖 Task 1（coordinator/Redis）。
- Task 4 依赖 Task 1（Redis）与 Task 3（作业处理器）。
- Task 5 依赖 Task 4（入队）。
- Task 6 依赖 Task 1/4（水位+BullMQ）。
- Task 7 依赖 Task 3。
- Task 9 依赖 Task 1（依赖）与 Task 8。
- Task 10、Task 11 相互独立可并行，依赖 Task 8/9。
- Task 12 依赖 Task 1-11 完成。