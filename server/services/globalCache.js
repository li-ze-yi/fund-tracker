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
const logger = createLogger('GlobalCache');

class GlobalCache {
  constructor() {
    this.cache = new Map();
    
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
   * 获取或设置缓存（核心方法）
   */
  async getOrFetch(key, fetchFn, options = {}) {
    const {
      type = 'realtime',     // 数据类型: realtime/history/fundInfo
      forceRefresh = false,  // 是否强制刷新
      onMiss = null          // 缺失时的回调
    } = options;

    // 统计
    this.stats.totalRequests++;

    // 1️⃣ 强制刷新模式
    if (forceRefresh) {
      this.stats.forcedRefreshes++;
      logger.info(`强制刷新: ${key}`);
      const data = await fetchFn();
      this.set(key, data, type);
      return data;
    }

    // 2️⃣ 检查缓存命中
    const cached = this.cache.get(key);
    
    if (cached) {
      const ttl = this.getTTL(type);
      const age = Date.now() - cached.timestamp;
      
      if (age < ttl) {
        // ✅ 命中缓存
        this.stats.hits++;
        
        // 日志（仅部分输出，避免刷屏）
        if (this.stats.totalRequests % 50 === 0) {
          logger.debug(`命中: ${key} (${(age / 1000).toFixed(1)}s前, TTL=${(ttl / 1000)}s, 命中率=${this.getHitRate()}%)`);
        }
        
        return cached.data;
      } else {
        // ⏰ 缓存过期
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }

    // 3️⃣ 缓存未命中 → 判断是否已有在途请求（缓存击穿防护）
    this.stats.misses++;
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
        const data = await fetchFn();

        if (data !== null && data !== undefined) {
          this.set(key, data, type);
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
   * @returns {{ hit: boolean, data: any|null }} - hit=true 时 data 为缓存数据
   */
  checkCache(key, type = 'realtime') {
    this.stats.totalRequests++;
    const cached = this.cache.get(key);
    if (cached) {
      const ttl = this.getTTL(type);
      const age = Date.now() - cached.timestamp;
      if (age < ttl) {
        // ✅ 命中且未过期
        this.stats.hits++;
        return { hit: true, data: cached.data };
      }
      // ⏰ 命中但已过期，删除僵尸条目
      this.cache.delete(key);
      this.stats.evictions++;
    }
    // ❌ 未命中（或已过期删除后）
    this.stats.misses++;
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
   * @returns {{ hit: boolean, data: any|null }} - hit=true 时 data 为缓存数据（与 checkCache 一致）
   */
  peekCache(key, type = 'realtime') {
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
   */
  set(key, data, type = 'realtime') {
    // 内存保护：超过最大容量时清理旧条目
    if (this.cache.size >= this.maxSize) {
      this.evictOldest(50);  // 清理最旧的50个条目
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      type
    });
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
      this.stats.evictions++;
      removed++;
    }

    // 阶段2：淘汰数量不足时，按写入时间从旧到新淘汰未过期条目
    if (removed < count) {
      const remaining = count - removed;
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < Math.min(remaining, entries.length); i++) {
        this.cache.delete(entries[i][0]);
        this.stats.evictions++;
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
   */
  getStats() {
    return {
      ...this.stats,  // 包含 hits/misses/evictions/totalRequests/forcedRefreshes
      hitRate: `${this.getHitRate()}%`,
      size: this.cache.size,
      maxSize: this.maxSize,
      tradingStatus: this.getTradingStatus(),
      realtimeTTL: `${(this.getRealtimeTTL() / 1000)}s`,
      recentMisses: this.recentMisses.slice(-this.maxMissLog) // 最近未命中明细（倒序：最新在前）
    };
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
   */
  startCleanup(intervalMs = 5 * 60 * 1000) {
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
