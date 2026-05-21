const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Fund = require('../models/fund');
const Holding = require('../models/holding');
const Transaction = require('../models/transaction');
const fundService = require('../services/fundService');
const globalCache = require('../services/globalCache');
const ocrService = require('../services/ocrService');

/**
 * 智能匹配基金：优先匹配C/A后缀，然后按名称相似度排序
 */
function findBestMatch(ocrName, candidates) {
  if (candidates.length === 1) return candidates[0];

  // 检测OCR名称中的后缀类型
  const hasCSuffix = /[C]$/.test(ocrName) || ocrName.includes('C类');
  const hasASuffix = /[A]$/.test(ocrName) || ocrName.includes('A类');

  // 计算每个候选的匹配分数
  const scored = candidates.map(fund => {
    let score = 0;
    const dbName = fund.name;

    // 后缀匹配加分（最重要）
    if (hasCSuffix && /[C]$/.test(dbName)) score += 100;
    if (hasASuffix && /[A]$/.test(dbName)) score += 100;
    if (hasCSuffix && /[A]$/.test(dbName)) score -= 50;
    if (hasASuffix && /[C]$/.test(dbName)) score -= 50;

    // 名称包含匹配加分
    // 计算OCR名称中有多少字符在数据库名称中
    let matchChars = 0;
    for (const ch of ocrName) {
      if (dbName.includes(ch)) matchChars++;
    }
    score += (matchChars / ocrName.length) * 50;

    // 名称长度相似度加分
    const lenDiff = Math.abs(dbName.length - ocrName.length);
    score -= lenDiff * 2;

    // 包含关键词加分
    if (hasCSuffix && dbName.includes('联接') && ocrName.includes('联接')) score += 20;
    if (hasCSuffix && dbName.includes('ETF') && ocrName.includes('ETF')) score += 20;
    if (hasCSuffix && dbName.includes('混合') && ocrName.includes('混合')) score += 20;

    return { fund, score };
  });

  // 按分数降序排序
  scored.sort((a, b) => b.score - a.score);

  console.log(`[ImageImport] 匹配评分: ${scored.map(s => `${s.fund.name}(${s.score})`).join(', ')}`);

  return scored[0].fund;
}

// 配置 multer 用于图片上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/ocr');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `ocr-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/bmp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 PNG/JPEG/WebP/BMP 格式的图片'));
    }
  }
});

/**
 * 识别图片中的基金持仓信息
 * POST /api/image-import/recognize
 */
exports.recognize = [upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '请上传图片文件' });
    }

    const imagePath = req.file.path;
    console.log(`[ImageImport] 收到图片识别请求: ${imagePath}`);

    let ocrResult;
    try {
      ocrResult = await ocrService.recognizeHoldingsFromImage(imagePath);
    } catch (ocrErr) {
      console.error('[ImageImport] OCR 识别失败:', ocrErr.message);
      return res.status(422).json({
        message: '图片识别失败: ' + ocrErr.message,
        items: [],
        rawText: ''
      });
    }

    const holdings = ocrResult.items || [];
    const rawText = ocrResult.rawText || '';
    const engine = ocrResult.engine || 'unknown';

    if (holdings.length === 0) {
      return res.json({
        message: '未能从图片中识别出基金持仓信息，请确保图片清晰且包含基金持仓数据',
        items: [],
        rawText,
        engine
      });
    }

    // 验证每个识别结果的基金代码是否存在于数据库
    const items = await Promise.all(holdings.map(async (holding) => {
      const item = {
        fundCode: holding.fundCode || '',
        fundName: holding.fundName || '',
        amount: holding.amount,
        totalReturn: holding.totalReturn,
        valid: true,
        error: null
      };

      try {
        // 如果有基金代码，直接查数据库验证
        if (item.fundCode) {
          const fund = await Fund.findByCode(item.fundCode);
          if (!fund) {
            item.valid = false;
            item.error = '基金代码不存在于数据库';
          } else if (!item.fundName && fund.name) {
            item.fundName = fund.name;
          }
        } else if (item.fundName) {
          // 没有基金代码但有名称，通过名称模糊搜索数据库查找基金代码
          const searchResults = await Fund.search(item.fundName);

          if (searchResults && searchResults.length > 0) {
            // 智能匹配：优先匹配名称后缀（C/A）和完整度
            const bestMatch = findBestMatch(item.fundName, searchResults);
            item.fundCode = bestMatch.code;
            item.fundName = bestMatch.name;
            console.log(`[ImageImport] 名称反查: "${holding.fundName}" -> ${bestMatch.code} ${bestMatch.name}`);
          } else {
            // 尝试缩短名称再搜索（去掉可能的OCR噪声）
            const shortName = item.fundName.replace(/[选智领]/g, '').substring(0, 4);
            if (shortName.length >= 2) {
              const retryResults = await Fund.search(shortName);
              if (retryResults && retryResults.length > 0) {
                const bestMatch = findBestMatch(item.fundName, retryResults);
                item.fundCode = bestMatch.code;
                item.fundName = bestMatch.name;
                console.log(`[ImageImport] 名称反查(缩短): "${holding.fundName}" -> "${shortName}" -> ${bestMatch.code} ${bestMatch.name}`);
              } else {
                item.valid = false;
                item.error = '未找到匹配的基金，请手动输入基金代码';
              }
            } else {
              item.valid = false;
              item.error = '未找到匹配的基金，请手动输入基金代码';
            }
          }
        } else {
          item.valid = false;
          item.error = '缺少基金代码和名称';
        }
      } catch (err) {
        item.valid = false;
        item.error = '验证基金时出错: ' + err.message;
      }

      return item;
    }));

    console.log(`[ImageImport] 识别完成: ${items.length} 条记录, 有效 ${items.filter(i => i.valid).length} 条`);

    res.json({ items, rawText, engine });
  } catch (err) {
    next(err);
  } finally {
    // 清理上传的临时文件
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.warn('[ImageImport] 清理临时文件失败:', e.message);
      }
    }
  }
}];

/**
 * 确认导入持仓数据
 * POST /api/image-import/confirm
 */
exports.confirmImport = async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: '请提供要导入的持仓数据列表' });
    }

    const results = { success: 0, failed: 0, errors: [] };

    for (const item of items) {
      try {
        const { fundCode, amount, totalReturn, groupId } = item;

        // 基本验证
        if (!fundCode || !amount) {
          results.failed++;
          results.errors.push({ fundCode: fundCode || '未知', error: '基金代码和持仓金额为必填项' });
          continue;
        }

        // 验证基金代码存在
        const fund = await Fund.findByCode(fundCode);
        if (!fund) {
          results.failed++;
          results.errors.push({ fundCode, error: '基金代码不存在' });
          continue;
        }

        // 检查是否已在持仓中
        const existing = await Holding.findByUserAndFund(req.user.id, fundCode);
        if (existing) {
          results.failed++;
          results.errors.push({ fundCode, error: '该基金已在持仓中' });
          continue;
        }

        // 获取净值（参考 holdingController.js 的 create 方法）
        let netValue = 0;
        let netValueSource = 'unknown';
        let confirmedNavDate = null;

        try {
          const today = new Date().toISOString().slice(0, 10);
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const historyCacheKey = `history_${fundCode}_${today}`;

          try {
            const recentHistory = await globalCache.getOrFetch(
              historyCacheKey,
              () => fundService.getHistoryNetValues(fundCode, thirtyDaysAgo, today),
              { type: 'history_recent' }
            );

            if (recentHistory && recentHistory.length > 0) {
              const latestConfirmed = recentHistory[0];
              if (latestConfirmed.nav) {
                netValue = parseFloat(latestConfirmed.nav) || 0;
              } else if (latestConfirmed.netValue) {
                netValue = parseFloat(latestConfirmed.netValue) || 0;
              }

              if (netValue > 0) {
                netValueSource = `confirmed(${latestConfirmed.date})`;
                confirmedNavDate = latestConfirmed.date;
              }
            }
          } catch (e) {
            console.warn(`[ImageImport] 获取历史净值失败: ${e.message}`);
          }

          if (netValue <= 0) {
            const realtimeCacheKey = `realtime_${fundCode}`;
            try {
              const realTime = await globalCache.getOrFetch(
                realtimeCacheKey,
                () => fundService.getRealTimeValue(fundCode),
                { type: 'realtime' }
              );
              if (realTime && realTime.netValue > 0) {
                netValue = realTime.netValue;
                netValueSource = 'realtime';
              }
            } catch (e) {
              console.warn(`[ImageImport] 获取实时估值失败: ${e.message}`);
            }
          }
        } catch (error) {
          console.error(`[ImageImport] 获取净值失败:`, error.message);
        }

        if (netValue <= 0) {
          results.failed++;
          results.errors.push({ fundCode, error: '无法获取有效的基金净值，请稍后重试' });
          continue;
        }

        // 计算份额和成本（与 holdingController.js 逻辑一致）
        const currentValue = amount;
        const shares = currentValue / netValue;
        const totalCost = amount - (totalReturn || 0);
        const costPrice = shares > 0 ? totalCost / shares : 0;

        console.log(`[ImageImport] 创建持仓: fund=${fundCode}, shares=${shares.toFixed(2)}, costPrice=${costPrice.toFixed(4)}, netValue=${netValue}`);

        // 创建持仓记录
        const id = await Holding.create({
          userId: req.user.id,
          fundCode,
          shares,
          costPrice,
          groupId: groupId || null,
          confirmedNav: netValue,
          confirmedNavDate,
          totalCost
        });

        // 创建交易记录
        await Transaction.create({
          userId: req.user.id,
          fundCode,
          type: 'buy',
          shares,
          price: netValue,
          amount,
          fee: 0,
          transactionDate: new Date().toISOString().slice(0, 10),
          metadata: JSON.stringify({ netValueSource, source: 'image_import' })
        });

        console.log(`[ImageImport] 持仓创建成功: id=${id}, fund=${fundCode}`);
        results.success++;
      } catch (err) {
        console.error(`[ImageImport] 导入单条持仓失败:`, err);
        results.failed++;
        results.errors.push({ fundCode: item.fundCode || '未知', error: err.message });
      }
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
};
