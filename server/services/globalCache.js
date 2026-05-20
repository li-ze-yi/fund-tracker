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

class GlobalCache {
  constructor() {
    this.cache = new Map();
    
    // 缓存统计
    this.stats = {
      hits: 0,           // 命中次数
      misses: 0,         // 未命中次数
      evictions: 0,      // 过期清理次数
      totalRequests: 0   // 总请求数
    };
    
    // 最大缓存条目数（防止内存溢出）
    this.maxSize = 500;
    
    // 定时清理器
    this.cleanupInterval = null;
    
    console.log('[GlobalCache] 初始化完成');
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
      console.log(`[GlobalCache] 强制刷新: ${key}`);
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
          console.log(`[GlobalCache] 命中: ${key} (${(age / 1000).toFixed(1)}s前, TTL=${(ttl / 1000)}s, 命中率=${this.getHitRate()}%)`);
        }
        
        return cached.data;
      } else {
        // ⏰ 缓存过期
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }

    // 3️⃣ 缓存未命中 → 发起实际请求
    this.stats.misses++;
    
    if (typeof onMiss === 'function') {
      onMiss(key);  // 回调通知（可用于监控）
    }

    try {
      const data = await fetchFn();
      
      if (data !== null && data !== undefined) {
        this.set(key, data, type);
      }
      
      return data;
    } catch (error) {
      console.error(`[GlobalCache] 获取数据失败: ${key}`, error.message);
      throw error;
    }
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
        
      case 'fund_info':       // 基金基本信息（名称、类型等）
        return 14 * 24 * 60 * 1000;  // ✨ 14天（原7天，极少变化）
        
      case 'fund_list':       // 基金列表（搜索用）
        return 6 * 60 * 60 * 1000;   // ✨ 6小时（原1小时）
        
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
      console.log(`[GlobalCache] 清理完成: 移除${cleaned}个过期条目, 当前缓存数: ${this.cache.size}`);
    }
  }

  /**
   * 清理最旧的N个条目（LRU近似）
   */
  evictOldest(count) {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      this.cache.delete(entries[i][0]);
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
      ...this.stats,
      hitRate: `${this.getHitRate()}%`,
      size: this.cache.size,
      maxSize: this.maxSize,
      tradingStatus: this.getTradingStatus(),
      realtimeTTL: `${(this.getRealtimeTTL() / 1000)}s`
    };
  }

  /**
   * 清空所有缓存
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[GlobalCache] 缓存已清空: 移除${size}个条目`);
    
    // 重置统计
    this.stats = { hits: 0, misses: 0, evictions: 0, totalRequests: 0 };
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

    console.log(`[GlobalCache] 定时清理已启动: 每${intervalMs / 1000}秒执行一次`);
  }

  /**
   * 停止定时清理任务
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[GlobalCache] 定时清理已停止');
    }
  }

  /**
   * 预热缓存（批量预加载热门数据）
   */
  async prewarm(keysAndFetchers) {
    console.log(`[GlobalCache] 开始预热: ${keysAndFetchers.length}个条目`);
    
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

    console.log(
      `[GlobalCache] 预热完成: 成功${successCount}个, 失败${failCount}个, ` +
      `当前缓存数: ${this.cache.size}`
    );

    return { successCount, failCount, results };
  }
}

// 导出全局单例
const globalCache = new GlobalCache();

module.exports = globalCache;
