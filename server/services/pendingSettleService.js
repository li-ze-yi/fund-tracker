const Transaction = require('../models/transaction');
const settlementService = require('./settlementService');
const { createLogger } = require('../utils/logger');
const { normalizeDateStr } = require('../utils/date');

const logger = createLogger('PendingSettle');

/**
 * 挂起（pending）订单独立结算服务
 *
 * 设计目的：
 * - 将 pending 订单结算与日收益记录解耦，确保挂起订单在净值确认后一定能被结算
 * - 不依赖"用户当天未记录日收益"作为触发条件，扫描所有有 pending 订单的用户
 * - 与 dailyProfitService._settlePendingTransactions 保持核心结算逻辑一致
 *
 * 触发时机：
 * - 每日 23:50 独立 cron 任务（略早于 23:55 的日收益兜底任务，避免并发）
 */
class PendingSettleService {
  /**
   * 结算单个用户的所有 pending 订单
   * 核心结算逻辑与 dailyProfitService._settlePendingTransactions 保持一致：
   * - 买入结算：actualShares = amount / confirmedNav
   * - 卖出结算：actualAmount = sellShares * confirmedNav，扣减份额，记录盈亏
   * - 净值未发布（confirmedNav = 0）时保持 pending，不报错
   * 每笔交易独立 try/catch，单笔失败不中断整体流程
   * @param {number} userId 用户 ID
   * @returns {Promise<{total: number, settled: number, skipped: number, failed: number}>}
   */
  async settlePendingOrders(userId) {
    const stat = { total: 0, settled: 0, skipped: 0, failed: 0 };

    try {
      const pendingTransactions = await Transaction.findPendingByUserId(userId);
      if (!pendingTransactions.length) {
        logger.info(`用户 ${userId} 无 pending 订单，跳过结算`);
        return stat;
      }

      stat.total = pendingTransactions.length;
      logger.info(`用户 ${userId} 发现 ${pendingTransactions.length} 笔待结算订单，开始结算...`);

      for (const tx of pendingTransactions) {
        try {
          const navDate = this._normalizeDateStr(tx.transaction_date);
          if (!navDate) {
            stat.skipped++;
            logger.warn(`订单 #${tx.id} 日期无效，跳过: rawDate=${tx.transaction_date}`);
            continue;
          }

          const { nav: confirmedNav } = await settlementService.getConfirmedNavByDate(tx.fund_code, navDate);
          if (!confirmedNav) {
            // 净值未发布，保持 pending，等待下次结算任务或用户查看持仓时再次尝试
            stat.skipped++;
            logger.info(`订单 #${tx.id} 净值未发布 (navDate=${navDate})，保持 pending 等待下次结算`);
            continue;
          }

          // 统一结算逻辑（费用/份额/成本反算 + 乐观锁 + 新建/占位替换/加仓三分支）
          const result = await settlementService.settleTransaction({ userId, tx, confirmedNav, navDate });

          if (result.outcome === 'settled') {
            stat.settled++;
          } else if (result.outcome === 'already_settled') {
            stat.skipped++;
            logger.warn(`订单 #${tx.id} 已被其他任务结算（乐观锁未获取），跳过持仓更新`);
          } else {
            stat.skipped++;
            logger.warn(`订单 #${tx.id} 未知交易类型: type=${tx.type}, 跳过`);
          }
        } catch (err) {
          stat.failed++;
          logger.error(`结算交易 #${tx.id} 失败 (用户 ${userId}): ${err.message}`, err.stack);
        }
      }

      logger.info(`用户 ${userId} 结算完成: total=${stat.total}, settled=${stat.settled}, skipped=${stat.skipped}, failed=${stat.failed}`);
    } catch (err) {
      logger.error(`用户 ${userId} 结算流程异常: ${err.message}`, err.stack);
    }

    return stat;
  }

  /**
   * 结算所有用户的 pending 订单（不依赖日收益记录状态）
   * 调用 Transaction.findAllPendingUsers() 获取所有有 pending 订单的用户，逐个结算
   * @returns {Promise<{scannedUsers: number, totalPending: number, settled: number, skipped: number, failed: number}>}
   */
  async settleAllPendingOrders() {
    const result = { scannedUsers: 0, totalPending: 0, settled: 0, skipped: 0, failed: 0 };

    const userIds = await Transaction.findAllPendingUsers();
    if (!userIds.length) {
      logger.info('当前无 pending 订单，跳过结算');
      return result;
    }

    result.scannedUsers = userIds.length;
    logger.info(`===== 全量 pending 结算任务启动 | 待扫描用户数: ${userIds.length} =====`);

    // 串行处理用户，避免并发请求外部 API 过多
    for (const userId of userIds) {
      try {
        const stat = await this.settlePendingOrders(userId);
        result.totalPending += stat.total;
        result.settled += stat.settled;
        result.skipped += stat.skipped;
        result.failed += stat.failed;
      } catch (err) {
        logger.error(`用户 ${userId} 结算异常: ${err.message}`, err.stack);
      }
    }

    logger.info(`===== 全量 pending 结算完成 =====`);
    logger.info(`汇总: 扫描用户数=${result.scannedUsers}, pending 订单数=${result.totalPending}, 成功结算=${result.settled}, 跳过=${result.skipped}, 失败=${result.failed}`);

    return result;
  }

  /**
   * 兜底任务：先结算所有 pending 订单，再清除超过指定天数的异常 pending 订单
   * 执行顺序：先结算 → 后清除（避免误删可结算的订单）
   * @param {number} days 阈值天数，默认 30 天
   * @returns {Promise<{settle: object, cleanedCount: number, cleanedOrders: Array}>}
   */
  async cleanupStalePendingOrders(days = 30) {
    const triggerTime = new Date().toLocaleString('zh-CN');
    logger.info(`===== pending 订单兜底清理任务触发 | 时间: ${triggerTime} | 阈值: ${days}天 =====`);

    // 第一步：先尝试结算所有 pending 订单（净值已发布的会被结算）
    let settle;
    try {
      settle = await this.settleAllPendingOrders();
    } catch (err) {
      logger.error(`全量结算阶段异常，继续执行清除阶段: ${err.message}`, err.stack);
      settle = { scannedUsers: 0, totalPending: 0, settled: 0, skipped: 0, failed: 0 };
    }

    // 第二步：清除剩余超过阈值的异常 pending 订单（净值仍未发布的长期堆积订单）
    let cleanedOrders = [];
    try {
      logger.info(`开始清除超过 ${days} 天未结算的 pending 订单...`);
      cleanedOrders = await Transaction.deleteStalePending(days);
    } catch (err) {
      logger.error(`清除异常 pending 订单阶段异常: ${err.message}`, err.stack);
      cleanedOrders = [];
    }

    // 第三步：记录被清除订单的详细日志
    if (cleanedOrders.length > 0) {
      logger.warn(`清除超过 ${days} 天未结算的 pending 订单 ${cleanedOrders.length} 笔:`);
      const deleteTime = new Date().toLocaleString('zh-CN');
      for (const order of cleanedOrders) {
        logger.warn(
          `清除订单: 订单ID=${order.id}, 用户ID=${order.user_id}, 基金代码=${order.fund_code}, ` +
          `金额=${order.amount}, 份额=${order.shares}, navDate=${this._normalizeDateStr(order.transaction_date)}, ` +
          `创建时间=${this._formatDateTime(order.created_at)}, 删除时间=${deleteTime}`
        );
      }
    } else {
      logger.info(`无超过 ${days} 天的异常 pending 订单需清除`);
    }

    logger.info(`===== 兜底清理任务完成 =====`);
    logger.info(`汇总: 扫描用户数=${settle.scannedUsers}, pending 订单数=${settle.totalPending}, 成功结算=${settle.settled}, 跳过=${settle.skipped}, 清除数=${cleanedOrders.length}`);

    return {
      settle,
      cleanedCount: cleanedOrders.length,
      cleanedOrders
    };
  }

  /**
   * 规范化日期字符串：Date 对象用本地时间（getFullYear/getMonth/getDate）格式化为 YYYY-MM-DD；
   * 字符串则取前 10 字符。mysql2 会把 DATE 列转成 UTC Date 对象，必须用本地时间提取。
   * 复用公共 normalizeDateStr
   */
  _normalizeDateStr(dateVal) {
    return normalizeDateStr(dateVal);
  }

  /**
   * 格式化 datetime 用于日志输出（YYYY-MM-DD HH:mm:ss）
   */
  _formatDateTime(dateVal) {
    if (dateVal instanceof Date) {
      const y = dateVal.getFullYear();
      const m = String(dateVal.getMonth() + 1).padStart(2, '0');
      const d = String(dateVal.getDate()).padStart(2, '0');
      const h = String(dateVal.getHours()).padStart(2, '0');
      const min = String(dateVal.getMinutes()).padStart(2, '0');
      const s = String(dateVal.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d} ${h}:${min}:${s}`;
    }
    if (typeof dateVal === 'string' && dateVal) return dateVal;
    return '';
  }
}

module.exports = new PendingSettleService();
