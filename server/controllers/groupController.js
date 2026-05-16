const Group = require('../models/group');
const Holding = require('../models/holding');
const holdingService = require('../services/holdingService');

exports.list = async (req, res, next) => {
  try {
    const groups = await Group.findByUserId(req.user.id);
    const holdings = await Holding.findByUserId(req.user.id);
    const enriched = await holdingService.enrichHoldingsWithRealTimeData(holdings);

    const result = groups.map(g => {
      const groupHoldings = enriched.filter(h => h.group_id === g.id);
      const totalValue = groupHoldings.reduce((sum, h) => sum + (h.market_value || 0), 0);
      const totalReturn = groupHoldings.reduce((sum, h) => sum + (h.accumulated_profit || 0), 0);
      const dailyGain = groupHoldings.reduce((sum, h) => sum + (h.daily_profit || 0), 0);
      return { ...g, totalValue, totalReturn, dailyGain, holdingCount: groupHoldings.length };
    });

    const totalAsset = result.reduce((sum, g) => sum + g.totalValue, 0);
    const totalReturnVal = result.reduce((sum, g) => sum + g.totalReturn, 0);
    const totalDailyGain = result.reduce((sum, g) => sum + g.dailyGain, 0);

    res.json({ groups: result, summary: { totalAsset, totalReturn: totalReturnVal, dailyGain: totalDailyGain } });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: '分组名不能为空' });
    }
    const id = await Group.create(req.user.id, name);
    res.json({ id, message: '创建成功' });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: '分组名不能为空' });
    }
    await Group.update(id, req.user.id, name.trim());
    res.json({ message: '更新成功' });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    // 将分组的持仓移入默认分组
    await Holding.update(id, req.user.id, { group_id: null });
    await Group.delete(id, req.user.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
};

