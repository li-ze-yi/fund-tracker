const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Fund = require('../models/fund');
const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const fundService = require('../services/fundService');
const { getLocalToday } = require('../utils/date');

// 仅允许 Excel 格式文件（同时校验 mimetype 与扩展名）
const upload = multer({
  dest: path.join(__dirname, '../uploads/'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 限制 5MB，防止超大文件占用服务器资源
  fileFilter: (req, file, cb) => {
    const allowedMime = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (allowedMime.includes(file.mimetype) && (ext === '.xlsx' || ext === '.xls')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .xlsx / .xls 格式的 Excel 文件'));
    }
  }
});

exports.importData = [upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '请上传文件' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const results = { success: 0, failed: 0, errors: [] };

    for (const row of rows) {
      try {
        const fundCode = String(row.fund_code || row.code);
        const fund = await Fund.findByCode(fundCode);
        if (!fund) {
          results.failed++;
          results.errors.push(`基金代码 ${fundCode} 不存在`);
          continue;
        }

        const amount = parseFloat(row.amount || row.total_cost);
        const totalReturn = parseFloat(row.total_return || 0);

        // 当前市值 = 持仓金额 + 累计收益
        const currentValue = amount + totalReturn;

        // 获取最新净值用于计算份额
        const realTime = await fundService.getRealTimeValue(fundCode);
        const netValue = realTime ? realTime.netValue : 0;

        // 持有份额 = 当前市值 / 最新净值
        const shares = netValue ? currentValue / netValue : 0;

        // 成本单价 = 持仓金额 / 持有份额
        const costPrice = shares ? amount / shares : 0;

        const existing = await Holding.findByUserAndFund(req.user.id, fundCode);
        if (existing) {
          results.failed++;
          results.errors.push(`基金 ${fundCode} 已在持仓中`);
          continue;
        }

        await Holding.create({
          userId: req.user.id,
          fundCode,
          shares,
          costPrice
        });

        await Transaction.create({
          userId: req.user.id,
          fundCode,
          type: 'buy',
          shares,
          price: netValue,
          amount,
          fee: 0,
          transactionDate: (realTime?.updateTime?.split(' ')[0]) || getLocalToday()
        });

        results.success++;
      } catch (e) {
        results.failed++;
        results.errors.push(e.message);
      }
    }

    res.json(results);
  } catch (err) {
    next(err);
  } finally {
    // 处理完成后清理上传的临时文件（无论成功失败），避免临时目录堆积
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {}); // 忽略删除失败
    }
  }
}];

exports.exportTemplate = async (req, res, next) => {
  try {
    // 表头与 importData 读取的字段对齐：fund_code（或 code）、amount（或 total_cost）、total_return
    const header = ['fund_code', 'amount', 'total_return'];
    const ws = XLSX.utils.aoa_to_sheet([header]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '导入模板');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=import_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
};

exports.exportData = async (req, res, next) => {
  try {
    const { format = 'xlsx', scope, groupId } = req.query;

    let holdings = await Holding.findByUserId(req.user.id);
    if (scope === 'group' && groupId) {
      holdings = holdings.filter(h => h.group_id === parseInt(groupId));
    }

    const data = holdings.map(h => ({
      '基金代码': h.fund_code,
      '基金名称': h.fund_name || '',
      '持仓份额': h.shares,
      '成本单价': h.cost_price,
      '持仓金额': parseFloat(h.shares) * parseFloat(h.cost_price)
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '持仓数据');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=holdings.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
};