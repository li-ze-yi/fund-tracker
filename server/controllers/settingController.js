const UserSetting = require('../models/userSetting');

exports.get = async (req, res, next) => {
  try {
    const settings = await UserSetting.findByUserId(req.user.id);
    // 兼容旧数据：将 'tencent' 映射为 'holdings'（腾讯接口已废弃，统一回退到持仓穿透）
    let valuationMethod = settings?.valuation_method || 'holdings';
    if (valuationMethod === 'tencent') valuationMethod = 'holdings';
    res.json({
      refresh_frequency: settings?.refresh_frequency || 30,
      valuation_method: valuationMethod,
      valuation_overrides: settings?.valuation_overrides || {},
    });
  } catch (err) {
    next(err);
  }
};

// settings 更新入参白名单（与 updateValuationMethod 全局方法白名单一致）
const VALID_VALUATION_METHODS = ['auto', 'sina', 'holdings'];
const FUND_CODE_RE = /^\d{6}$/;
const MAX_OVERRIDES_JSON_LENGTH = 10 * 1024; // overrides JSON 序列化总长上限 10KB

exports.update = async (req, res, next) => {
  try {
    const { refreshFrequency, valuationMethod, valuationOverrides } = req.body;

    // 入参校验：刷新频率必须为 5-300 的整数（秒）
    if (refreshFrequency !== undefined) {
      const n = Number(refreshFrequency);
      if (!Number.isInteger(n) || n < 5 || n > 300) {
        return res.status(400).json({ message: '刷新频率必须为 5-300 之间的整数（秒）' });
      }
    }

    // 估值方法白名单校验
    if (valuationMethod !== undefined && !VALID_VALUATION_METHODS.includes(valuationMethod)) {
      return res.status(400).json({ message: '无效的估值方法，可选: auto, sina, holdings' });
    }

    // 估值覆盖校验：key 必须为 6 位基金代码、value 在白名单内、总长不超过 10KB
    if (valuationOverrides !== undefined && valuationOverrides !== null) {
      if (typeof valuationOverrides !== 'object' || Array.isArray(valuationOverrides)) {
        return res.status(400).json({ message: '估值覆盖必须是对象' });
      }
      for (const [code, method] of Object.entries(valuationOverrides)) {
        if (!FUND_CODE_RE.test(code)) {
          return res.status(400).json({ message: `估值覆盖的基金代码无效: ${code}（应为6位数字）` });
        }
        if (!VALID_VALUATION_METHODS.includes(method)) {
          return res.status(400).json({ message: `基金 ${code} 的估值方法无效，可选: auto, sina, holdings` });
        }
      }
      if (JSON.stringify(valuationOverrides).length > MAX_OVERRIDES_JSON_LENGTH) {
        return res.status(400).json({ message: '估值覆盖数据过大（上限 10KB）' });
      }
    }

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
    const validMethods = ['auto', 'sina', 'holdings'];
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
    // 基金代码格式校验（6 位数字）
    if (!/^\d{6}$/.test(String(fundCode))) {
      return res.status(400).json({ message: '基金代码格式不正确（应为6位数字）' });
    }
    const validMethods = ['auto', 'sina', 'holdings', ''];

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