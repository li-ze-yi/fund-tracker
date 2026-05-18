require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// 路由挂载
app.use('/api/auth', require('./routes/auth'));
app.use('/api/funds', require('./routes/funds'));
app.use('/api/holdings', require('./routes/holdings'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/import-export', require('./routes/importExport'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/indices', require('./routes/indices'));
app.use('/api/admin', require('./routes/admin'));

// 全局错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});