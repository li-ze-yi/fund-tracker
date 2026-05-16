const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const UserSetting = require('../models/userSetting');

exports.register = async (req, res, next) => {
  try {
    const { username, password, confirmPassword } = req.body;

    if (!username || username.trim() === '') {
      return res.status(400).json({ message: '用户名不能为空' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ message: '密码至少6位' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: '两次密码不一致' });
    }

    const existing = await User.findByUsername(username);
    if (existing) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await User.create(username, hashedPassword);
    await UserSetting.upsert(userId, 30);

    const token = jwt.sign({ id: userId, username }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    res.json({ token, user: { id: userId, username } });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }

    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(400).json({ message: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ message: '用户名或密码错误' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
};