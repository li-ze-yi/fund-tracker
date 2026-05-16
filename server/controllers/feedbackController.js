const Feedback = require('../models/feedback');

exports.create = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: '请输入反馈内容' });
    }
    const id = await Feedback.create({ userId: req.user.id, content: content.trim() });
    res.json({ id, message: '反馈已提交，感谢您的意见' });
  } catch (err) {
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const list = await Feedback.findByUserId(req.user.id);
    res.json(list);
  } catch (err) {
    next(err);
  }
};