/**
 * GlobalCache - 全局智能缓存系统 v2.4.3
 * 
 * 核心特性：
 * 1. 全局单例 - 所有用户共享同一份缓存
 * 2. 差异化TTL - 不同数据类型使用不同过期时间
 * 3. 场景感知 - 根据交易时段自动调整缓存策略（精细到小时级别）
 * 4. 预热机制 - 支持主动预加载热门数据
 * 5. 内存保护 - 自动清理过期条目防止内存泄漏
 * 6. 监控统计 - 缓存命中率、调用次数等指标
 * 
 * v2.4.3 优化内容：
 * ✨ 历史近期数据TTL：固定3小时 → 动态调整（收盘后5分钟快速刷新）
 *
 * v2.4.2 优化内容：
 * ✨ 盘中TTL：20秒 → 60秒（估值波动较慢）
 * ✨ 盘后分时段：5分钟 → 30分钟/1小时/2小时（根据时段细化）
 * ✨ 周末TTL：1小时 → 12小时（无交易活动）
 * ✨ 盘前分时段：10分钟 → 30分钟/2小时（根据时段细化）
 * ✨ 历史近期数据：1小时 → 3小时（确认后不变）
 * ✨ 历史远期数据：24小时 → 3天（固定不变）
 * ✨ 基金基本信息：7天 → 14天（极少变化）
 * ✨ 基金列表：1小时 → 6小时
 * 
 * 预期效果：
 * 📉 API调用量减少 60-80%（特别是非交易时段）
 * ⚡ 缓存命中率提升至 90%+
 * 🛡️ 有效防止IP被封（请求频率大幅降低）
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { createLogger } = require('../utils/logger');
const coordinator = require('./coordinator');
const logger = createLogger('GlobalCache');

// 跨实例聚合统计的 Redis key：各实例用 INCR 累计，管理后台读取全副本汇总
const STATS_KEY = (field) => `gc:stats:${field}`;
const STATS_FIELDS = ['hits', 'misses', 'evictions', 'totalRequests', 'forcedRefreshes'];
const MISSES_KEY = 'gc:stats:recentMisses'; // 跨实例"最近未命中"明细（LPUSH + LTRIM 定长列表）

class GlobalCache {
  constructor() {
    this.cache = new Map();

    // Redis 后端模式（配置了 REDIS_URL 即启用）。
    // redisEnabled 固定由环境变量决定；运行时是否真正可用由 _redisAvailable() 判断
    // （Redis 连接就绪才生效，未配置或连接故障则降级回退到内存 Map）。
    this.redisEnabled = Boolean(process.env.REDIS_URL);
    this.redis = coordinator.getClient(); // 与 Coordinator 复用一个共享 ioredis client

    // Redis 由不可用翻转为可用（ready）时，清空本实例内存缓存条目，但【保留命中率/调用次数等统计计数】
    // （用 clearEntries：只清 this.cache，不清 this.stats / recentMisses），
    // 避免断连/停机期间累积的内存量数据滞留或污染；ready 只在"从不可用→可用"那一刻触发。
    if (this.redis) {
      this.redis.on('ready', () => {
        this.clearEntries();
      });
    }

    // 缓存统计
    this.stats = {
      hits: 0,           // 命中次数
      misses: 0,         // 未命中次数
      evictions: 0,      // 过期清理次数
      totalRequests: 0,  // 总请求数
      forcedRefreshes: 0 // 强制刷新次数（getOrFetch forceRefresh 路径）
    };

    // 最近未命中明细（记录未命中的缓存 key + 类型 + 时间，用于排查"是哪些缓存未命中"）
    this.recentMisses = [];  // [{ key, type, at }]
    this.maxMissLog = 100;   // 最多保留最近 100 条
    
    // 最大缓存条目数（防止内存溢出）
    this.maxSize = 500;

    // 在途请求去重（缓存击穿防护）：key -> Promise，命中时复用，完成后删除
    this.inFlight = new Map();

    // 定时清理器
    this.cleanupInterval = null;

    // 文件持久化配置（重启后缓存与统计可恢复）
    this.cacheFilePath = process.env.CACHE_FILE_PATH ||
      path.join(__dirname, '..', 'data', 'globalCache.json');
    this.saveInterval = null;   // 周期落盘定时器
    this.saving = false;        // 防并发写标志

    logger.info('初始化完成');
  }

  /**
   * 获取当前交易状态
   */
  getTradingStatus() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=周日, 6=周六
    
    if (day === 0 || day === 6) return 'weekend';
    if (hour >= 9 && hour < 15) return 'trading';
    if (hour >= 15) return 'after_hours';
    return 'pre_market'; // 0-9点
  }

  /**
   * 计算实时估值的动态TTL - 优化版 v2.4.2
   * 
   * 策略说明：
   * - 盘中：适度延长（估值波动相对缓慢）
   * 盘后：显著延长（数据已固定不变）
   * - 深夜/凌晨：最大化缓存（几乎无人访问）
   * - 周末：全天长缓存（无交易活动）
   */
  getRealtimeTTL() {
    const status = this.getTradingStatus();
    
    switch (status) {
      case 'trading':
        return 28 * 1000;  // ✨ 盘中：28秒
        
      case 'after_hours': {
        const now = new Date();
        const hour = now.getHours();
        
        if (hour >= 22 || hour < 6) {
          return 120 * 60 * 1000;  // ✨ 深夜时段(22:00-6:00)：2小时
        } else if (hour >= 18) {
          return 60 * 60 * 1000;   // ✨ 晚上(18:00-22:00)：1小时
        } else {
          return 30 * 60 * 1000;   // ✨ 下午盘后(15:00-18:00)：30分钟
        }
      }
        
      case 'weekend':
        return 12 * 60 * 60 * 1000;  // ✨ 周末：12小时（原1小时）
        
      case 'pre_market': {
        const now = new Date();
        const hour = now.getHours();
        
        if (hour < 6) {
          return 120 * 60 * 1000;  // ✨ 凌晨(0:00-6:00)：2小时
        } else {
          return 30 * 60 * 1000;   // ✨ 早盘前(6:00-9:00)：30分钟（原10分钟）
        }
      }
        
      default:
        return 30 * 60 * 1000;
    }
  }

  /**
   * Redis 是否配置且连接就绪（作为缓存唯一后端的前置条件）。
   * 仅当配置了 REDIS_URL 且 coordinator 确认连接已就绪时返回 true；
   * 未配置、创建未连接、连接故障/关闭时均返回 false。
   */
  _redisAvailable() {
    return this.redisEnabled && coordinator.isEnabled();
  }

  /**
   * Redis 模式是否启用（配置了 REDIS_URL 即视为启用，用于决定是否跳过文件持久化）
   */
  _isRedis() {
    return this.redisEnabled && Boolean(this.redis);
  }

  /**
   * 自增一项统计：总是更新本实例计数（供性能/命中率即时判断与无 Redis 兜底）；
   * Redis 可用时额外用 INCR 累计到全局计数器，供跨实例聚合统计。
   * 异步写 Redis，best-effort 不抛错。
   * @param {'hits'|'misses'|'evictions'|'totalRequests'|'forcedRefreshes'} field
   */
  _bumpStats(field) {
    this.stats[field] = (this.stats[field] || 0) + 1;
    if (this._redisAvailable()) {
      coordinator.getClient().incr(STATS_KEY(field)).catch(() => {});
    }
  }

  /**
   * 睡眠辅助（跨实例 singleflight 轮询用）
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 从 Redis 读取缓存条目（JSON: { data, timestamp, type }）。
   * 命中且未过期则顺手 PEXPIRE 刷新 TTL，避免热键漂移。
   * @returns {Promise<{data:*, timestamp:number, type:string}|null>} 不存在或已过期或出错 → null
   */
  async _redisGetEntry(key) {
    if (!this._isRedis()) return null;
    try {
      const raw = await this.redis.get(key);
      if (raw == null) return null;
      const entry = JSON.parse(raw);
      if (!entry || typeof entry !== 'object' || !('data' in entry)) return null;
      // 刷新 TTL（best-effort，失败不影响读）
      const ttl = this.getTTL(entry.type || 'realtime');
      this.redis.pexpire(key, ttl).catch(() => {});
      return entry;
    } catch (err) {
      logger.error(`Redis 读取缓存失败，回退内存: ${key}, error=${err.message}`);
      return null;
    }
  }

  /**
   * 写缓存条目到 Redis（SET key <json> PX ttl）。best-effort，出错不抛出。
   */
  async _redisSetEntry(key, data, type) {
    if (!this._isRedis()) return;
    try {
      const entry = { data, timestamp: Date.now(), type };
      const ttl = this.getTTL(type);
      await this.redis.set(key, JSON.stringify(entry), 'PX', ttl);
    } catch (err) {
      logger.error(`Redis 写入缓存失败: ${key}, error=${err.message}`);
    }
  }

  /**
   * 纯内存写入（含内存保护淘汰）
   */
  _setMemory(key, data, type) {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest(50);  // 清理最旧的50个条目
    }
    this.cache.set(key, { data, timestamp: Date.now(), type });
  }

  /**
   * 跨实例 singleflight：未抢到锁时轮询 Redis 等待其他实例写入的结果。
   * 仅读取 Redis（Redis 可用模式下唯一的后端），不写内存 Map（避免内存镜像）。
   * @returns {Promise<*|null>} 有界时间内出现条目则返回其 data，否则返回 null
   */
  async _pollForEntry(key, type, timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const entry = await this._redisGetEntry(key);
      if (entry && Date.now() - entry.timestamp < this.getTTL(entry.type || type)) {
        return entry.data;
      }
      await this._sleep(50);
    }
    return null;
  }

  /**
   * 获取或设置缓存（核心方法）
   */
  async getOrFetch(key, fetchFn, options = {}) {
    const {
      type = 'realtime',     // 数据类型: realtime/history/fundInfo
      forceRefresh = false,  // 是否强制刷新
      onMiss = null          // 缺失时的回调
    } = options;

    // 统计
    this._bumpStats('totalRequests');

    // 1️⃣ 强制刷新模式（写向当前激活后端）
    if (forceRefresh) {
      this._bumpStats('forcedRefreshes');
      logger.info(`强制刷新: ${key}`);
      const data = await fetchFn();
      this.set(key, data, type);
      return data;
    }

    // 2️⃣ 检查缓存命中
    //  - Redis 可用：仅读 Redis（唯一后端），不触碰内存 Map
    //  - Redis 不可用：仅读内存 Map（回退单进程行为），不触碰 Redis
    if (this._redisAvailable()) {
      const redisEntry = await this._redisGetEntry(key);
      if (redisEntry) {
        const ttl = this.getTTL(redisEntry.type || type);
        if (Date.now() - redisEntry.timestamp < ttl) {
          // ✅ 命中共享缓存
          this._bumpStats('hits');
          return redisEntry.data;
        }
        // ⏰ Redis 中已过期（Redis 自动过期兜底），计入淘汰
        this._bumpStats('evictions');
      }
    } else {
      const memCached = this.cache.get(key);
      if (memCached) {
        const ttl = this.getTTL(memCached.type);
        const age = Date.now() - memCached.timestamp;

        if (age < ttl) {
          // ✅ 命中缓存
          this._bumpStats('hits');

          // 日志（仅部分输出，避免刷屏）
          if (this.stats.totalRequests % 50 === 0) {
            logger.debug(`命中: ${key} (${(age / 1000).toFixed(1)}s前, TTL=${(ttl / 1000)}s, 命中率=${this.getHitRate()}%)`);
          }

          return memCached.data;
        } else {
          // ⏰ 缓存过期
          this.cache.delete(key);
          this._bumpStats('evictions');
        }
      }
    }

    // 3️⃣ 缓存未命中 → 判断是否已有在途请求（缓存击穿防护）
    this._bumpStats('misses');
    this.recordMiss(key, type);

    // 命中在途请求：直接复用，避免相同 key 并发重复请求外部 API
    const inFlightPromise = this.inFlight.get(key);
    if (inFlightPromise) {
      return inFlightPromise;
    }

    if (typeof onMiss === 'function') {
      onMiss(key);  // 回调通知（可用于监控）
    }

    const promise = (async () => {
      try {
        // 第二层：跨实例 singleflight（仅在真实未命中后兜底生效）
        // 未配置 Redis 时 coordinator 直接放行 → 行为与旧版单进程一致
        const lockTtl = Math.min(this.getTTL(type), 30000) || 30000;
        const tok = await coordinator.acquire(`sf:${key}`, lockTtl);

        let data;
        if (tok) {
          // ✅ 抢到锁（或 Redis 禁用降级放行）→ 唯一实例负责拉取
          data = await fetchFn();
          if (data !== null && data !== undefined) {
            this.set(key, data, type);
          }
          // 释放锁（禁用态为真正的空操作）
          await coordinator.release(`sf:${key}`, tok);
        } else {
          // ⏳ 其他实例正在拉取 → 有界轮询等待其写入结果
          data = await this._pollForEntry(key, type, 2000);
          if (data === null || data === undefined) {
            // 超时兜底：有界的重复请求，保证请求成功
            data = await fetchFn();
            if (data !== null && data !== undefined) {
              this.set(key, data, type);
            }
          }
        }

        return data;
      } catch (error) {
        logger.error(`获取数据失败: ${key}, error=${error.message}`);
        throw error;
      } finally {
        // 请求完成（成功或失败）后清除在途标记
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);

    return promise;
  }

  /**
   * 记录一次缓存未命中明细（供管理后台排查"是哪些缓存未命中"）
   * @param {string} key - 未命中的缓存键
   * @param {string} type - 缓存类型
   */
  recordMiss(key, type) {
    this.recentMisses.push({ key, type, at: new Date().toISOString() });
    if (this.recentMisses.length > this.maxMissLog) {
      this.recentMisses.shift();
    }
    // 跨实例：同步到 Redis 定长列表，供管理后台查看全副本最近未命中明细
    if (this._redisAvailable()) {
      const c = coordinator.getClient();
      const e = JSON.stringify({ key, type, at: new Date().toISOString() });
      c.lpush(MISSES_KEY, e).catch(() => {});
      c.ltrim(MISSES_KEY, 0, this.maxMissLog - 1).catch(() => {});
    }
  }

  /**
   * 检查缓存命中状态（手动路径专用，统一统计口径）
   *
   * 与 getOrFetch 的区别：
   * - getOrFetch：未命中时自动调用 fetchFn 拉取数据并写入缓存
   * - checkCache：仅检查缓存，不拉取数据，由调用方决定后续操作
   *
   * 统计更新：
   * - totalRequests++（每次调用）
   * - hits++（命中且未过期）
   * - misses++（未命中或已过期）
   * - evictions++（命中但已过期，删除僵尸条目）
   *
   * @param {string} key - 缓存键
   * @param {string} type - 缓存类型（用于计算 TTL）
   * @returns {Promise<{ hit: boolean, data: any|null }>} hit=true 时 data 为缓存数据
   */
  async checkCache(key, type = 'realtime') {
    this._bumpStats('totalRequests');

    // Redis 可用：仅读 Redis（唯一后端）；Redis 出错 → 视为无缓存（不抛错），让调用方回退拉取
    if (this._redisAvailable()) {
      try {
        const entry = await this._redisGetEntry(key);
        if (entry) {
          const ttl = this.getTTL(entry.type || type);
          if (Date.now() - entry.timestamp < ttl) {
            // ✅ 命中且未过期
            this._bumpStats('hits');
            return { hit: true, data: entry.data };
          }
          // ⏰ 命中但已过期（Redis 自动过期兜底），计入淘汰
          this._bumpStats('evictions');
        }
      } catch (err) {
        logger.error(`checkCache Redis 读取失败，降级为未命中: ${key}, error=${err.message}`);
      }
      // ❌ 未命中（或已过期/出错）
      this._bumpStats('misses');
      this.recordMiss(key, type);
      return { hit: false, data: null };
    }

    // 非 Redis 模式：内存行为（与旧版完全一致）
    const cached = this.cache.get(key);
    if (cached) {
      const ttl = this.getTTL(type);
      const age = Date.now() - cached.timestamp;
      if (age < ttl) {
        // ✅ 命中且未过期
        this._bumpStats('hits');
        return { hit: true, data: cached.data };
      }
      // ⏰ 命中但已过期，删除僵尸条目
      this.cache.delete(key);
      this._bumpStats('evictions');
    }
    // ❌ 未命中（或已过期删除后）
    this._bumpStats('misses');
    this.recordMiss(key, type);
    return { hit: false, data: null };
  }

  /**
   * 仅探测缓存是否存在且未过期（不修改统计计数器）
   *
   * 与 checkCache 的区别：checkCache 每次调用都会计入 totalRequests/hits/misses/evictions，
   * 用于衡量真实缓存利用率；peekCache 用于"多来源回退探测"场景（如休市时依次探测
   * confirmed_nav / 3d 历史净值等缓存），这些探测不应拉低命中率。
   *
   * @param {string} key - 缓存键
   * @param {string} type - 缓存类型（用于计算 TTL）
   * @returns {Promise<{ hit: boolean, data: any|null }>} hit=true 时 data 为缓存数据（与 checkCache 一致）
   */
  async peekCache(key, type = 'realtime') {
    // Redis 可用：仅读 Redis，不修改统计；Redis 出错 → 视为无缓存（不抛错）
    if (this._redisAvailable()) {
      try {
        const entry = await this._redisGetEntry(key);
        if (entry) {
          const ttl = this.getTTL(entry.type || type);
          if (Date.now() - entry.timestamp < ttl) {
            return { hit: true, data: entry.data };
          }
        }
      } catch (err) {
        logger.error(`peekCache Redis 读取失败，降级为未命中: ${key}, error=${err.message}`);
      }
      return { hit: false, data: null };
    }

    // 非 Redis 模式：内存行为（与旧版完全一致，不修改统计）
    const cached = this.cache.get(key);
    if (cached) {
      const ttl = this.getTTL(type);
      const age = Date.now() - cached.timestamp;
      if (age < ttl) {
        return { hit: true, data: cached.data };
      }
    }
    return { hit: false, data: null };
  }

  /**
   * 设置缓存
   * - Redis 可用 → 仅写 Redis（唯一后端，不写内存 Map）
   * - Redis 不可用/未配置 → 仅写内存 Map（回退单进程行为）
   */
  set(key, data, type = 'realtime') {
    if (this._redisAvailable()) {
      // Redis 唯一后端：异步写共享 Redis（best-effort，不出错）
      this._redisSetEntry(key, data, type).catch(() => {});
    } else {
      // 内存 Map 唯一后端（含内存保护淘汰）
      this._setMemory(key, data, type);
    }
  }

  /**
   * 计算历史近期净值的动态TTL - v2.4.3
   * 
   * 核心问题：收盘后确认净值已发布，但固定3小时TTL导致持仓界面
   * 长时间显示"待确认"而非"已确认"
   * 
   * 策略：
   * - 盘中(9-15点)：适度缓存（确认数据还未出）
   * - 收盘后黄金窗口(15-18点)：极短TTL（确认净值密集发布期）
   * - 晚间/深夜：延长缓存（数据已固定不变）
   * - 周末：最大化缓存（无交易活动）
   */
  getHistoryRecentTTL() {
    const status = this.getTradingStatus();

    switch (status) {
      case 'trading':
        return 30 * 60 * 1000;  // 盘中：30分钟（确认数据未出，适度缓存）

      case 'after_hours': {
        const hour = new Date().getHours();

        if (hour >= 17 && hour < 23) {
          return 5 * 60 * 1000;    // 收盘后黄金窗口(17:00-23:00)：5分钟（确认净值发布期，快速刷新）
        } else if (hour >= 15 && hour < 17) {
          return 30 * 60 * 1000;   // 刚收盘(15:00-17:00)：30分钟
        } else if (hour >= 23 || hour < 6) {
          return 3 * 60 * 60 * 1000; // 深夜：3小时（几乎无人访问）
        } else {
          return 30 * 60 * 1000;   // 晨间(6:00-9:00)：30分钟
        }
      }

      case 'weekend':
        return 12 * 60 * 60 * 1000;  // 周末：12小时（无交易活动）

      case 'pre_market': {
        const hour = new Date().getHours();

        if (hour < 6) {
          return 3 * 60 * 60 * 1000;  // 凌晨：3小时
        } else {
          return 30 * 60 * 1000;      // 早盘前：30分钟（昨日数据稳定）
        }
      }

      default:
        return 30 * 60 * 1000;
    }
  }

  /**
   * 获取指定类型的TTL - 优化版 v2.4.3
   * 
   * 优化策略：
   * - 历史已确认数据：动态调整（收盘后快速刷新以检测新确认净值）
   * - 基金基本信息：保持长缓存（很少变化）
   * - 市场状态：适度延长（检测频率不需要太高）
   */
  getTTL(type) {
    switch (type) {
      case 'realtime':
        return this.getRealtimeTTL();
        
      case 'history_recent':  // 最近3天的历史净值（用于确认状态检测）★ 动态TTL
        return this.getHistoryRecentTTL();
        
      case 'history_older':   // 更早的历史净值
        return 72 * 60 * 60 * 1000;  // ✨ 3天（原24小时，历史数据固定不变）

      case 'history_chart':   // 走势图历史净值（固定24h，不复用 history_recent：cleanup 按 type 取 TTL，history_recent 黄金窗口仅 5min 会导致走势图缓存被过早清理）
        return 24 * 60 * 60 * 1000;  // 24小时（历史净值一旦确认就固定不变，配合 latestDate 三分支判断）
        
      case 'fund_info':       // 基金基本信息（名称、类型等）
        return 14 * 24 * 60 * 1000;  // ✨ 14天（原7天，极少变化）
        
      case 'fund_list':       // 基金列表（搜索用）
        return 6 * 60 * 60 * 1000;   // ✨ 6小时（原1小时）
        
      case 'stock_quote':     // 股票实时行情缓存（腾讯 qt.gtimg.cn）
      case 'etf_quote':       // ETF实时行情缓存（东方财富 push2 / 腾讯 / 新浪）
        return this.getRealtimeTTL();
        
      case 'market_status':   // 市场开闭状态
        return 60 * 1000;     // ✨ 1分钟（原15秒，适度延长）

      case 'holiday_year':    // 年度节假日表（timor.tech 一次拉整年）全年固定不变
        return 30 * 24 * 60 * 60 * 1000;  // ✨ 30天（覆盖整个年度，次年1月初自然过期刷新）

      case 'holiday_day':     // 单日节假日判定结果（年度接口失败时回退的单日结果）
        return 3 * 24 * 60 * 60 * 1000;  // ✨ 3天（单日判定一旦确定全年不变，配合年度表 30 天 TTL 冗余覆盖）

      default:
        return 60 * 1000;  // ✨ 默认1分钟（原30秒）
    }
  }

  /**
   * 清理过期的缓存条目
   */
  cleanup() {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, value] of this.cache.entries()) {
      const ttl = this.getTTL(value.type);
      const age = now - value.timestamp;

      if (age > ttl * 1.5) {  // 超过TTL的1.5倍就清理
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.evictions += cleaned;
      logger.info(`清理完成: 移除${cleaned}个过期条目, 当前缓存数: ${this.cache.size}`);
    }
  }

  /**
   * 两阶段淘汰策略（先过期后 LRU）
   *
   * 阶段1：遍历所有条目，删除已过期的条目（age > ttl，ttl 按 value.type 调用 getTTL(type) 获取）
   *   - 按 timestamp 从旧到新排序后删除，最多删除 count 个
   * 阶段2：若阶段1淘汰数量不足 count，再按 timestamp 从旧到新淘汰未过期条目
   *
   * 示例：缓存满 500 条，需淘汰 50 条
   *   - 若 80 条已过期 → 删除 50 条最旧的过期条目，不淘汰未过期条目
   *   - 若 30 条已过期 → 删除 30 条过期条目 + 20 条最旧的未过期条目
   *   - 若 0 条已过期 → 删除 50 条最旧的未过期条目
   */
  evictOldest(count) {
    const now = Date.now();
    let removed = 0;

    // 阶段1：收集过期条目并按写入时间从旧到新排序，删除最多 count 个
    const expired = [];
    for (const [key, value] of this.cache.entries()) {
      const ttl = this.getTTL(value.type);
      if (now - value.timestamp > ttl) {
        expired.push([key, value]);
      }
    }
    expired.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (const [key] of expired) {
      if (removed >= count) break;
      this.cache.delete(key);
      this._bumpStats('evictions');
      removed++;
    }

    // 阶段2：淘汰数量不足时，按写入时间从旧到新淘汰未过期条目
    if (removed < count) {
      const remaining = count - removed;
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < Math.min(remaining, entries.length); i++) {
        this.cache.delete(entries[i][0]);
        this._bumpStats('evictions');
      }
    }
  }

  /**
   * 获取缓存命中率
   */
  getHitRate() {
    if (this.stats.totalRequests === 0) return 0;
    return ((this.stats.hits / this.stats.totalRequests) * 100).toFixed(2);
  }

  /**
   * 获取缓存统计信息
   * Redis 可用时返回【跨实例聚合】的全局计数（各副本 INCR 累计）与全局最近未命中明细；
   * 否则返回本实例计数（未配置/不可用时兜底）。
   * @returns {Promise<object>}
   */
  async getStats() {
    // 非 Redis 兜底：本实例统计（同步逻辑，包一层返回）
    const local = () => ({
      ...this.stats,
      hitRate: `${this.getHitRate()}%`,
      size: this.cache.size,
      maxSize: this.maxSize,
      tradingStatus: this.getTradingStatus(),
      realtimeTTL: `${(this.getRealtimeTTL() / 1000)}s`,
      recentMisses: this.recentMisses.slice(-this.maxMissLog),
    });

    if (!this._redisAvailable()) return local();

    try {
      const c = coordinator.getClient();
      const vals = await Promise.all(STATS_FIELDS.map((f) => c.get(STATS_KEY(f)).catch(() => null)));
      const s = {};
      STATS_FIELDS.forEach((f, i) => { s[f] = parseInt(vals[i], 10) || 0; });
      const total = s.totalRequests;
      s.hitRate = total <= 0 ? '0.00%' : `${((s.hits / total) * 100).toFixed(2)}%`;

      // 读取全局最近未命中（LPUSH → index0 最新）
      let recentMisses = [];
      try {
        const rows = await c.lrange(MISSES_KEY, 0, this.maxMissLog - 1).catch(() => []);
        if (Array.isArray(rows)) {
          recentMisses = rows
            .map((r) => { try { return JSON.parse(r); } catch { return null; } })
            .filter(Boolean);
        }
      } catch { /* 忽略最近未命中读取失败 */ }

      return {
        ...s,
        size: this.cache.size,
        maxSize: this.maxSize,
        tradingStatus: this.getTradingStatus(),
        realtimeTTL: `${(this.getRealtimeTTL() / 1000)}s`,
        recentMisses,
      };
    } catch (err) {
      logger.error(`读取全局缓存统计失败，回退本实例: ${err.message}`);
      return local();
    }
  }

  /**
   * 清空所有缓存
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`缓存已清空: 移除${size}个条目`);
    
    // 重置统计
    this.stats = { hits: 0, misses: 0, evictions: 0, totalRequests: 0, forcedRefreshes: 0 };
    this.recentMisses = [];

    // 同步清空 Redis 全局计数/未命中列表（跨实例一致）
    if (this._redisAvailable()) {
      const c = coordinator.getClient();
      c.del(...STATS_FIELDS.map(STATS_KEY), MISSES_KEY).catch(() => {});
    }
  }

  /**
   * 仅清空缓存条目列表，保留命中率等统计信息
   */
  clearEntries() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`缓存条目已清空: 移除${size}个条目 (统计保留)`);
  }

  /**
   * 启动定时清理任务
   * Redis 模式下 Redis 自动处理过期，无需内存清理（本地 Map 仅作镜像），此处空操作。
   */
  startCleanup(intervalMs = 5 * 60 * 1000) {
    if (this._isRedis()) {
      logger.debug('Redis 模式: 跳过定时清理 (Redis 自动处理过期)');
      return;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);  // 避免重复启动
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);

    logger.info(`定时清理已启动: 每${intervalMs / 1000}秒执行一次`);
  }

  /**
   * 停止定时清理任务
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('定时清理已停止');
    }
  }

  /**
   * 预热缓存（批量预加载热门数据）
   */
  async prewarm(keysAndFetchers) {
    logger.info(`开始预热: ${keysAndFetchers.length}个条目`);
    
    let successCount = 0;
    let failCount = 0;

    const results = await Promise.allSettled(
      keysAndFetchers.map(async ({ key, fetchFn }) => {
        try {
          const data = await fetchFn();
          if (data !== null && data !== undefined) {
            this.set(key, data);
            successCount++;
            return { key, status: 'success' };
          }
          failCount++;
          return { key, status: 'empty' };
        } catch (error) {
          failCount++;
          return { key, status: 'error', error: error.message };
        }
      })
    );

    logger.info(
      `预热完成: 成功${successCount}个, 失败${failCount}个, ` +
      `当前缓存数: ${this.cache.size}`
    );

    return { successCount, failCount, results };
  }

  /**
   * 将缓存条目 + 统计计数器落盘（异步，原子写）
   * - 跳过已过期条目，避免落盘 stale 数据
   * - 先写 .tmp 再 rename 原子替换，防止半截文件
   * - 单条不可序列化则跳过该条（容错）
   */
  async saveToFile() {
    // Redis 模式下禁止文件落盘：缓存以 Redis 为准
    if (this._isRedis()) {
      logger.debug('Redis 模式: 跳过文件持久化 (数据以 Redis 为准)');
      return;
    }
    if (this.saving) return;
    this.saving = true;
    try {
      const now = Date.now();
      const entries = [];
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.getTTL(value.type)) continue; // 丢弃过期
        try {
          JSON.stringify(value);
        } catch (e) {
          continue; // 不可序列化则跳过
        }
        entries.push([key, value]);
      }
      const payload = {
        v: 1,
        savedAt: now,
        stats: this.stats, // 请求次数 / 命中 / 淘汰等计数器一并持久化
        recentMisses: this.recentMisses.slice(-this.maxMissLog), // 最近未命中明细一并持久化
        entries
      };
      const dir = path.dirname(this.cacheFilePath);
      await fsp.mkdir(dir, { recursive: true });
      const tmp = `${this.cacheFilePath}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(payload), 'utf8');
      await fsp.rename(tmp, this.cacheFilePath);
    } catch (err) {
      logger.error(`缓存落盘失败: ${err.message}`);
    } finally {
      this.saving = false;
    }
  }

  /**
   * 同步落盘（供进程退出钩子使用，确保能写完）
   */
  saveToFileSync() {
    // Redis 模式下禁止文件落盘
    if (this._isRedis()) {
      logger.debug('Redis 模式: 跳过同步文件落盘 (数据以 Redis 为准)');
      return;
    }
    try {
      const now = Date.now();
      const entries = [];
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.getTTL(value.type)) continue;
        entries.push([key, value]);
      }
      const payload = {
        v: 1,
        savedAt: now,
        stats: this.stats,
        recentMisses: this.recentMisses.slice(-this.maxMissLog),
        entries
      };
      const dir = path.dirname(this.cacheFilePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.cacheFilePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
      fs.renameSync(tmp, this.cacheFilePath);
    } catch (err) {
      logger.error(`缓存同步落盘失败: ${err.message}`);
    }
  }

  /**
   * 启动时从磁盘加载缓存与统计计数器
   * - 统计计数器（hits/misses/evictions/totalRequests/forcedRefreshes）跨重启累计保留
   * - 缓存条目重建 Map，丢弃已过期条目
   * - 文件缺失/损坏则冷启动（不崩溃）
   */
  async loadFromFile() {
    // Redis 模式下不读取磁盘文件（缓存以 Redis 为准，冷启动直接走共享缓存）
    if (this._isRedis()) {
      logger.debug('Redis 模式: 跳过磁盘缓存加载 (数据以 Redis 为准)');
      return false;
    }
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        logger.info('未找到缓存文件，冷启动');
        return false;
      }
      const raw = await fsp.readFile(this.cacheFilePath, 'utf8');
      const payload = JSON.parse(raw);
      if (!payload || !Array.isArray(payload.entries)) {
        logger.warn('缓存文件格式异常，忽略并冷启动');
        return false;
      }

      // 恢复统计计数器（跨重启累计保留）
      const s = this.stats;
      const src = payload.stats || {};
      s.hits = Number(src.hits) || 0;
      s.misses = Number(src.misses) || 0;
      s.evictions = Number(src.evictions) || 0;
      s.totalRequests = Number(src.totalRequests) || 0;
      s.forcedRefreshes = Number(src.forcedRefreshes) || 0;

      // 恢复最近未命中明细
      if (Array.isArray(payload.recentMisses)) {
        this.recentMisses = payload.recentMisses.slice(-this.maxMissLog);
      }

      // 重建 Map，丢弃已过期条目
      const now = Date.now();
      let loaded = 0;
      let dropped = 0;
      for (const [key, value] of payload.entries) {
        if (!value || typeof value !== 'object' || !('type' in value)) continue;
        if (now - (value.timestamp || 0) > this.getTTL(value.type)) {
          dropped++;
          continue;
        }
        this.cache.set(key, value);
        loaded++;
      }
      logger.info(
        `缓存加载完成: 载入${loaded}条, 丢弃过期${dropped}条, ` +
        `统计已恢复 (命中率=${this.getHitRate()}%)`
      );
      return true;
    } catch (err) {
      logger.error(`缓存加载失败，冷启动: ${err.message}`);
      return false;
    }
  }

  /**
   * 启动缓存持久化：周期落盘 + 进程退出时落盘
   * @param {number} intervalMs 周期落盘间隔，默认 60s
   */
  startPersistence(intervalMs = 60 * 1000) {
    // Redis 模式下禁止文件持久化定时器与退出钩子，避免写 data/globalCache.json
    if (this._isRedis()) {
      logger.debug('Redis 模式: 跳过文件持久化启动 (数据以 Redis 为准)');
      return;
    }

    if (this.saveInterval) clearInterval(this.saveInterval);

    this.saveInterval = setInterval(() => {
      this.saveToFile();
    }, intervalMs);
    logger.info(`缓存持久化已启动: 每${intervalMs / 1000}秒落盘一次`);

    // 优雅退出：先同步落盘再退出（保证重启前数据已写回磁盘）
    const onExit = () => {
      this.saveToFileSync();
      process.exit(0);
    };
    process.once('SIGINT', onExit);
    process.once('SIGTERM', onExit);
  }
}

// 导出全局单例
const globalCache = new GlobalCache();

module.exports = globalCache;
