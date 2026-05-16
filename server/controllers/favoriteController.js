const Favorite = require('../models/favorite');

exports.list = async (req, res, next) => {
  try {
    const favorites = await Favorite.findByUserId(req.user.id);
    res.json(favorites);
  } catch (err) {
    next(err);
  }
};

exports.add = async (req, res, next) => {
  try {
    const { fundCode } = req.body;
    await Favorite.add(req.user.id, fundCode);
    res.json({ message: '已加入自选' });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { fundCode } = req.params;
    await Favorite.remove(req.user.id, fundCode);
    res.json({ message: '已取消自选' });
  } catch (err) {
    next(err);
  }
};