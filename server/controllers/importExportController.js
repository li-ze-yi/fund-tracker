const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Fund = require('../models/fund');
const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const fundService = require('../services/fundService');
const { getLocalToday } = require('../utils/date');
const { toPositiveNumber, toOptionalNumber } = require('../utils/validate');

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

// 单次导入行数上限（防止超大文件拖垮 DB 与外部净值接口）
const MAX_IMPORT_ROWS = 500;

exports.importData = [upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '请上传文件' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ message: `导入行数超过上限（最多 ${MAX_IMPORT_ROWS} 行）` });
    }

    const results = { success: 0, failed: 0, errors: [] };

    // 逐行解析校验（amount 必须为正数、total_return 须为有限数），非法值记为该行失败，不影响其他行
    const validRows = [];
    for (const row of rows) {
      const fundCode = String(row.fund_code || row.code || '').trim();
      if (!fundCode) {
        results.failed++;
        results.errors.push('缺少基金代码');
        continue;
      }
      const amount = toPositiveNumber(row.amount || row.total_cost);
      const totalReturn = toOptionalNumber(row.total_return);
      if (Number.isNaN(amount) || Number.isNaN(totalReturn)) {
        results.failed++;
        results.errors.push(`基金 ${fundCode} 的金额必须为正数且累计收益必须为数字`);
        continue;
      }
      validRows.push({ fundCode, amount, totalReturn });
    }

    if (validRows.length > 0) {
      // 批量查询基金与已有持仓（消除逐行 N+1）
      const codes = [...new Set(validRows.map(r => r.fundCode))];
      const [funds, existingHoldings] = await Promise.all([
        Fund.findByCodes(codes),
        Holding.findByUserAndCodes(req.user.id, codes)
      ]);
      const fundMap = new Map(funds.map(f => [f.code, f]));
      const existingSet = new Set(existingHoldings.map(h => h.fund_code));

      // 净值获取按 10/批并行（getRealTimeValue 为外部请求；单行失败不影响其他行）
      const navMap = new Map();
      for (let i = 0; i < validRows.length; i += 10) {
        const batch = validRows.slice(i, i + 10);
        const navs = await Promise.all(batch.map(r => fundService.getRealTimeValue(r.fundCode).catch(() => null)));
        batch.forEach((r, idx) => navMap.set(r.fundCode, navs[idx]));
      }

      for (const row of validRows) {
        try {
          const { fundCode, amount, totalReturn } = row;
          if (!fundMap.has(fundCode)) {
            results.failed++;
            results.errors.push(`基金代码 ${fundCode} 不存在`);
            continue;
          }
          if (existingSet.has(fundCode)) {
            results.failed++;
            results.errors.push(`基金 ${fundCode} 已在持仓中`);
            continue;
          }

          const realTime = navMap.get(fundCode);
          const netValue = realTime ? realTime.netValue : 0;

          // 当前市值 = 持仓金额 + 累计收益
          const currentValue = amount + totalReturn;

          // 持有份额 = 当前市值 / 最新净值
          const shares = netValue ? currentValue / netValue : 0;

          // 成本单价 = 持仓金额 / 持有份额
          const costPrice = shares ? amount / shares : 0;

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