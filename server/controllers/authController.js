const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const UserSetting = require('../models/userSetting');
const { touchActive } = require('../middlewares/auth');
const { revokeToken } = require('../services/tokenRevocation');

exports.register = async (req, res, next) => {
  try {
    const { username, password, confirmPassword } = req.body;

    if (!username || username.trim() === '') {
      return res.status(400).json({ message: '用户名不能为空' });
    }
    if (username.trim().length > 50) {
      return res.status(400).json({ message: '用户名不能超过50个字符' });
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
    await UserSetting.upsert(userId, 30, 'holdings');

    const newUser = await User.findById(userId);
    const role = newUser.role || 'user';
    const token = jwt.sign({ id: userId, username, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    touchActive(userId, req.ip); // 注册即活跃，记入 DAU 统计（含客户端 IP）
    res.json({ token, user: { id: newUser.id, username: newUser.username, role, created_at: newUser.created_at } });
  } catch (err) {
    // 并发注册同名用户触发唯一约束，返回 400 而非 500
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: '用户名已存在' });
    }
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

    const role = user.role || 'user';
    touchActive(user.id, req.ip); // 登录即活跃，记入 DAU 统计（每日去重，含客户端 IP）
    const token = jwt.sign({ id: user.id, username: user.username, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    res.json({ token, user: { id: user.id, username: user.username, role, created_at: user.created_at } });
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
    res.json({ user: { id: user.id, username: user.username, role: user.role || 'user', created_at: user.created_at } });
  } catch (err) {
    next(err);
  }
};

/**
 * 登出：将当前 token 加入撤销名单，使其在剩余有效期内立即失效。
 * 前端随后清除本地会话；即便本地清理失败，旧 token 也已不可用。
 */
exports.logout = async (req, res, next) => {
  try {
    if (req.token && req.tokenExp) {
      await revokeToken(req.token, req.tokenExp * 1000);
    }
    // 登出请求经过 authenticate 时可能已触发滑动续期（maybeRenew 设置了 X-Auth-Token 响应头），
    // 该新 token 未被撤销且完全有效，凭空留在响应里不干净——登出场景必须移除
    res.removeHeader('X-Auth-Token');
    res.json({ message: '已退出登录' });
  } catch (err) {
    next(err);
  }
};
