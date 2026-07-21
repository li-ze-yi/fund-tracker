const Announcement = require('../models/announcement');

// ─── 管理后台: 公告 CRUD ───

exports.list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, keyword = '', status = '' } = req.query;
    const result = await Announcement.findAll({ page: Number(page), pageSize: Number(pageSize), keyword, status });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { title, content, type, status, startDate, endDate } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ message: '公告标题不能为空' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ message: '公告内容不能为空' });
    }
    const id = await Announcement.create({ title: title.trim(), content: content.trim(), type, status, startDate, endDate });
    res.json({ id, message: '公告创建成功' });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, type, status, startDate, endDate } = req.body;
    const existing = await Announcement.findById(id);
    if (!existing) {
      return res.status(404).json({ message: '公告不存在' });
    }
    await Announcement.update(id, { title, content, type, status, startDate, endDate });
    res.json({ message: '公告更新成功' });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Announcement.findById(id);
    if (!existing) {
      return res.status(404).json({ message: '公告不存在' });
    }
    await Announcement.delete(id);
    res.json({ message: '公告删除成功' });
  } catch (err) {
    next(err);
  }
};

exports.republish = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Announcement.findById(id);
    if (!existing) {
      return res.status(404).json({ message: '公告不存在' });
    }
    await Announcement.republish(id);
    res.json({ message: '公告已重新发布，所有用户将再次看到此公告' });
  } catch (err) {
    next(err);
  }
};

// ─── 公开接口: 获取当前生效的弹窗/横幅公告 ───

exports.getActivePopup = async (req, res, next) => {
  try {
    const announcements = await Announcement.findActive();
    const popups = announcements.filter(a => a.type === 'popup');
    res.json(popups.length > 0 ? popups[0] : null);
  } catch (err) {
    next(err);
  }
};

exports.getActiveBanner = async (req, res, next) => {
  try {
    const announcements = await Announcement.findActive();
    const banners = announcements.filter(a => a.type === 'banner');
    res.json(banners.length > 0 ? banners[0] : null);
  } catch (err) {
    next(err);
  }
};