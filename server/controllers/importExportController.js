const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');
const Fund = require('../models/fund');
const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const fundService = require('../services/fundService');

const upload = multer({ dest: path.join(__dirname, '../uploads/') });

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
          transactionDate: new Date().toISOString().slice(0, 10)
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
  }
}];

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