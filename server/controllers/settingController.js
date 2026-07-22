const UserSetting = require('../models/userSetting');

exports.get = async (req, res, next) => {
  try {
    const settings = await UserSetting.findByUserId(req.user.id);
    // 兼容旧数据：将 'tencent' 映射为 'sina'（腾讯接口已替换为新浪）
    let valuationMethod = settings?.valuation_method || 'sina';
    if (valuationMethod === 'tencent') valuationMethod = 'sina';
    res.json({
      refresh_frequency: settings?.refresh_frequency || 30,
      valuation_method: valuationMethod,
      valuation_overrides: settings?.valuation_overrides || {},
    });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { refreshFrequency, valuationMethod, valuationOverrides } = req.body;
    await UserSetting.upsert(req.user.id, refreshFrequency, valuationMethod, valuationOverrides);
    res.json({ message: '设置更新成功' });
  } catch (err) {
    next(err);
  }
};

// 切换全局估值方法
exports.updateValuationMethod = async (req, res, next) => {
  try {
    const { method } = req.body;
    const validMethods = ['sina', 'holdings'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ message: '无效的估值方法，可选: sina, holdings' });
    }
    await UserSetting.updateValuationMethod(req.user.id, method);
    res.json({ message: '估值方法更新成功', valuation_method: method });
  } catch (err) {
    next(err);
  }
};

// 设置单基金估值方法覆盖
exports.setFundOverride = async (req, res, next) => {
  try {
    const { fundCode, method } = req.body;
    if (!fundCode) {
      return res.status(400).json({ message: '缺少基金代码' });
    }
    const validMethods = ['sina', 'holdings', ''];

    if (method === '' || method === null) {
      // 删除覆盖，恢复全局默认
    } else if (!validMethods.includes(method)) {
      return res.status(400).json({ message: '无效的估值方法' });
    }

    const overrides = await UserSetting.updateFundOverride(
      req.user.id, fundCode, method === '' ? null : method
    );
    res.json({ message: '基金估值设置更新成功', valuation_overrides: overrides });
  } catch (err) {
    next(err);
  }
};