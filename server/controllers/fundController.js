const Fund = require('../models/fund');
const Holding = require('../models/holding');
const Favorite = require('../models/favorite');
const fundService = require('../services/fundService');
const holdingService = require('../services/holdingService');

exports.search = async (req, res, next) => {
  try {
    const { keyword } = req.query;
    if (!keyword || !keyword.trim()) {
      return res.json([]);
    }
    const funds = await Fund.search(keyword.trim());
    res.json(funds);
  } catch (err) {
    next(err);
  }
};

exports.getByCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const fund = await Fund.findByCode(code);
    if (!fund) {
      return res.status(404).json({ message: '基金不存在' });
    }

    const realTime = await fundService.getRealTimeValue(code).catch(() => null);

    const result = {
      code: fund.code,
      name: fund.name,
      type: fund.type,
      net_value: realTime ? realTime.netValue : null,
      estimated_change: realTime ? realTime.gainPercent : null,
      update_time: realTime ? realTime.updateTime : null,
    };

    // ★ 计算更新状态（与holdingService统一使用checkMarketStatus）
    const now = new Date();
    const updateTime = realTime ? realTime.updateTime : null;
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    // ★ 使用统一的checkMarketStatus判断（支持节假日检测）
    const marketStatus = await holdingService.checkMarketStatus([{ fund_code: code }]);

    if (!marketStatus.isMarketOpen) {
      result.last_updated = updateTime || null;
      result.data_source = 'actual';
      result.is_fresh = false;
      result.update_status = 'market_closed';
      result.day_of_week = marketStatus.dayOfWeek || dayNames[now.getDay()];
    } else {
      // ★ 工作日：检查是否有确认净值
      let isConfirmed = false;
      try {
        const todayStr = now.toISOString().slice(0, 10);
        const history = await fundService.getHistoryNetValues(code, todayStr, todayStr);
        isConfirmed = history && history.length > 0;
        
        if (isConfirmed) {
          console.log(`[FundController] 基金 ${code} 今天已有确认净值`);
        }
      } catch (error) {
        console.error(`[FundController] 查询 ${code} 确认净值失败:`, error.message);
      }

      result.last_updated = updateTime || null;

      const hour = now.getHours();
      if (hour < 9) {
        // 盘前待开市：无论是否已确认，都显示待开市，清空涨幅
        result.update_status = 'pre_market';
        result.data_source = 'actual';
        result.is_fresh = false;
        result.estimated_change = null;
      } else if (isConfirmed) {
        result.update_status = 'confirmed';
        result.data_source = 'actual';
        result.is_fresh = true;
      } else if (hour >= 9 && hour < 15) {
        result.update_status = 'estimating';
        result.data_source = 'estimated';
        result.is_fresh = true;
      } else {
        result.update_status = 'pending_confirm';
        result.data_source = 'estimated';
        result.is_fresh = false;
      }
    }

    if (req.user) {
      const holding = await Holding.findByUserAndFund(req.user.id, code);
      if (holding) {
        const shares = parseFloat(holding.shares) || 0;
        const costPrice = parseFloat(holding.cost_price) || 0;
        const totalCost = shares * costPrice;
        let currentValue = 0;
        let dailyGain = 0;
        if (realTime && realTime.netValue) {
          currentValue = shares * realTime.netValue;
          if (realTime.gainPercent) {
            dailyGain = currentValue * realTime.gainPercent / (100 + realTime.gainPercent);
          }
        }
        result.shares = shares;
        result.cost_price = costPrice;
        result.market_value = Math.round(currentValue * 100) / 100;
        result.accumulated_profit = Math.round((currentValue - totalCost) * 100) / 100;
        result.daily_profit = Math.round(dailyGain * 100) / 100;
      }

      const fav = await Favorite.isFavorited(req.user.id, code);
      result.is_favorite = !!fav;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 50;
    const funds = await Fund.getAll(offset, limit);
    res.json(funds);
  } catch (err) {
    next(err);
  }
};

exports.getNavHistory = async (req, res, next) => {
  try {
    const { code, startDate, endDate } = req.query;
    if (!code) return res.status(400).json({ message: '缺少基金代码' });
    const records = await fundService.getHistoryNetValues(code, startDate || '', endDate || '');
    res.json({ records });
  } catch (err) {
    next(err);
  }
};