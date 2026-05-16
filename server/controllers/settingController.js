const UserSetting = require('../models/userSetting');

exports.get = async (req, res, next) => {
  try {
    const settings = await UserSetting.findByUserId(req.user.id);
    res.json(settings || { refresh_frequency: 30 });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { refreshFrequency } = req.body;
    await UserSetting.upsert(req.user.id, refreshFrequency);
    res.json({ message: '设置更新成功' });
  } catch (err) {
    next(err);
  }
};