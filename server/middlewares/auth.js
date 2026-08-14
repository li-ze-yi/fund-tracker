const jwt = require('jsonwebtoken');

// JWT 密钥校验：未配置时给出清晰报错，避免用 undefined 静默验签
if (!process.env.JWT_SECRET) {
  throw new Error('[认证中间件] 缺少环境变量 JWT_SECRET，请在 .env 中配置密钥');
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: '未提供认证令牌' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ message: '令牌无效或已过期' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
    } catch {}
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: '需要管理员权限' });
  }
  next();
}

module.exports = { authenticate, optionalAuth, requireAdmin };
