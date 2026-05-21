const AipOcrClient = require('baidu-aip-sdk').ocr;
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// ==================== 百度 OCR 配置 ====================
const BAIDU_APP_ID = process.env.BAIDU_OCR_APP_ID || '';
const BAIDU_API_KEY = process.env.BAIDU_OCR_API_KEY || '';
const BAIDU_SECRET_KEY = process.env.BAIDU_OCR_SECRET_KEY || '';

let baiduOcrClient = null;

function getBaiduOcrClient() {
  if (baiduOcrClient) return baiduOcrClient;
  if (BAIDU_APP_ID && BAIDU_API_KEY && BAIDU_SECRET_KEY) {
    baiduOcrClient = new AipOcrClient(BAIDU_APP_ID, BAIDU_API_KEY, BAIDU_SECRET_KEY);
    console.log('[OcrService] 百度OCR客户端已初始化');
    return baiduOcrClient;
  }
  return null;
}

async function recognizeWithBaidu(imagePath) {
  const client = getBaiduOcrClient();
  if (!client) return null;

  try {
    const image = fs.readFileSync(imagePath);
    const base64Img = Buffer.from(image).toString('base64');

    console.log('[OcrService] 使用百度OCR识别...');
    const startTime = Date.now();

    const result = await client.generalBasic(base64Img);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[OcrService] 百度OCR识别完成，耗时 ${elapsed}s`);

    if (result.error_code) {
      console.error(`[OcrService] 百度OCR错误: ${result.error_code} - ${result.error_msg}`);
      return null;
    }

    if (!result.words_result || result.words_result.length === 0) {
      console.log('[OcrService] 百度OCR未识别到文字');
      return null;
    }

    const text = result.words_result.map(item => item.words).join('\n');
    console.log(`[OcrService] 百度OCR识别到 ${result.words_result.length} 行文字`);
    console.log(`[OcrService] 百度OCR原始文本:\n${text}`);

    return text;
  } catch (err) {
    console.error('[OcrService] 百度OCR异常:', err.message);
    return null;
  }
}

// ==================== Tesseract.js 兜底 ====================
let workerInstance = null;
let workerInitializing = null;

async function getTesseractWorker() {
  if (workerInstance) return workerInstance;
  if (workerInitializing) return workerInitializing;

  workerInitializing = (async () => {
    console.log('[OcrService] 初始化 Tesseract worker (chi_sim+eng)...');
    try {
      const worker = await createWorker('chi_sim+eng', 1, {
        cachePath: path.join(__dirname, '../tesseract_cache'),
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`[OcrService] Tesseract 进度: ${(m.progress * 100).toFixed(1)}%`);
          }
        }
      });
      console.log('[OcrService] Tesseract worker 初始化完成');
      workerInstance = worker;
      workerInitializing = null;
      return worker;
    } catch (err) {
      console.error('[OcrService] Tesseract 初始化失败:', err.message);
      try {
        const worker = await createWorker('eng', 1, {
          cachePath: path.join(__dirname, '../tesseract_cache'),
        });
        console.log('[OcrService] Tesseract worker (eng-only) 初始化完成');
        workerInstance = worker;
        workerInitializing = null;
        return worker;
      } catch (err2) {
        workerInitializing = null;
        throw new Error('Tesseract 初始化失败: ' + err2.message);
      }
    }
  })();

  return workerInitializing;
}

async function recognizeWithTesseract(imagePath) {
  try {
    let processedPath;
    try {
      processedPath = await preprocessImage(imagePath);
    } catch (err) {
      console.warn('[OcrService] 图片预处理失败，使用原图:', err.message);
      processedPath = imagePath;
    }

    const worker = await getTesseractWorker();
    console.log('[OcrService] 使用 Tesseract.js 识别...');
    const startTime = Date.now();

    const { data: { text } } = await worker.recognize(processedPath);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[OcrService] Tesseract 识别完成，耗时 ${elapsed}s，文本长度: ${text.length}`);

    if (processedPath !== imagePath && fs.existsSync(processedPath)) {
      try { fs.unlinkSync(processedPath); } catch (e) { /* ignore */ }
    }

    if (text && text.trim().length > 0) {
      console.log(`[OcrService] Tesseract 原始文本:\n${text}`);
      return text;
    }

    return null;
  } catch (err) {
    console.error('[OcrService] Tesseract 识别异常:', err.message);
    return null;
  }
}

// ==================== 图片预处理 ====================
async function preprocessImage(inputPath) {
  const outputPath = inputPath.replace(/\.\w+$/, '_processed.png');
  const metadata = await sharp(inputPath).metadata();
  const width = metadata.width || 1000;
  const targetWidth = Math.max(width * 2, 2000);

  await sharp(inputPath)
    .resize(targetWidth, null, { withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5 })
    .toFile(outputPath);

  return outputPath;
}

// ==================== 文本解析 ====================

function parseAmount(str) {
  if (!str) return null;
  let cleaned = str.replace(/[元￥¥$\s]/g, '');
  cleaned = cleaned.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractFundCodes(text) {
  const matches = text.match(/\d{6}/g);
  if (!matches) return [];
  return [...new Set(matches.filter(code => {
    const first = parseInt(code[0]);
    return first <= 6;
  }))];
}

function extractAmounts(text) {
  const amounts = [];
  const seen = new Set();

  const patterns = [
    /[-+]?\d{1,3}(?:,\d{3})+\.\d{1,2}/g,
    /[-+]?\d+\.\d{1,2}/g,
    /[-+]?\d{1,3}(?:,\d{3})+/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const num = parseAmount(match[0]);
      if (num !== null && !seen.has(num) && Math.abs(num) >= 0.01) {
        amounts.push(num);
        seen.add(num);
      }
    }
  }

  return amounts;
}

function extractFundName(text) {
  if (!text) return '';
  const match = text.match(/[\u4e00-\u9fa5]{2,}/);
  return match ? match[0] : '';
}

/**
 * 判断一行是否是金额行（包含小数数字）
 */
function isAmountLine(line) {
  return /\d+\.\d{1,2}/.test(line);
}

/**
 * 判断一行是否是百分比行
 */
function isPercentLine(line) {
  return /[-+]?\d+\.\d+%/.test(line);
}

/**
 * 判断一行是否是纯中文行（基金名称）
 */
function isChineseLine(line) {
  const chineseChars = (line.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = line.replace(/\s/g, '').length;
  return chineseChars > 0 && chineseChars / totalChars > 0.5;
}

/**
 * 判断一行是否包含基金类型关键词（ETF、LOF、QDII等）
 */
function hasFundTypeKeyword(line) {
  return /ETF|LOF|QDII|FOF|联接|混合|股票|债券|指数|货币|C$|A$|AC|CA/i.test(line);
}

/**
 * 支付宝持仓截图解析（无基金代码模式）
 *
 * 核心策略：先按中文行分组，每组取最大金额为持仓金额，名称续行后的金额为累计收益
 *
 * OCR输出的实际模式（每只基金）：
 *   基金名称前半     "永赢高端装备智"
 *   持仓金额         "1,399.38"
 *   昨日收益         "0.00" 或 "+101.83"
 *   基金名称后半     "选混合C"
 *   累计收益         "+0.82" 或 "+15.67"
 *   收益率           "0.00%"
 */
function parseAlipayByNamePattern(text) {
  const results = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // 噪声行过滤
  const filteredLines = lines.filter(l => {
    if (/^\d{1,3}$/.test(l)) return false;
    if (/^\d{1,2}:\d{2}/.test(l)) return false;
    if (/^(淘|基金市场|持有收益\/率|金额\/昨日收益|今日收益更新|名称|金额|收益|持有|排序|更新|偏股|偏债|指数|黄金|自选|机会|市场|定投|今日|解读|基金|全部|已送达|昨日|持有收益|行情)$/.test(l)) return false;
    if (l.includes('更新时间排序')) return false;
    if (l.includes('我的持有')) return false;
    if (l.includes('基金经理')) return false;
    if (l.includes('市场解读')) return false;
    return true;
  });

  // 按中文行分组：每个中文行开始一个新组，直到下一个中文行
  // 每组包含：名称行 + 金额行
  const groups = [];
  let currentGroup = null;

  for (let i = 0; i < filteredLines.length; i++) {
    const line = filteredLines[i];

    // 中文行或包含基金类型关键词的行（如"ETF联接C"）= 新组的开始或续行
    const isNameLine = (isChineseLine(line) || hasFundTypeKeyword(line)) && !isPercentLine(line) && !isAmountLine(line);

    if (isNameLine) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = { nameLines: [line], amountLines: [], startIdx: i };
    } else if (currentGroup) {
      if (isPercentLine(line)) continue;
      if (isAmountLine(line)) {
        currentGroup.amountLines.push({ line, idx: i });
      }
    }
  }
  if (currentGroup) groups.push(currentGroup);

  // 合并相邻组：如果一组的名称行看起来是基金类型后缀（如"选混合C"、"ETF联接C"），
  // 将它合并到前一组，并记录分割点（名称续行前的金额 vs 后的金额）
  const mergedGroups = [];
  for (const group of groups) {
    const firstName = group.nameLines[0] || '';
    const isContinuation = (hasFundTypeKeyword(firstName) || firstName.length <= 6) && mergedGroups.length > 0;

    if (isContinuation) {
      const prev = mergedGroups[mergedGroups.length - 1];
      // 记录分割点：前一组的金额数量 = 名称续行前的金额数
      prev.splitIndex = prev.amountLines.length;
      // 合并名称和金额
      prev.nameLines.push(...group.nameLines);
      prev.amountLines.push(...group.amountLines);
    } else {
      mergedGroups.push({
        nameLines: [...group.nameLines],
        amountLines: [...group.amountLines],
        splitIndex: group.amountLines.length, // 没有续行时，全部是续行前的金额
      });
    }
  }

  // 从每个合并组中提取持仓信息
  for (const group of mergedGroups) {
    const fundName = group.nameLines.join('');
    const splitIndex = group.splitIndex || 0;

    if (group.amountLines.length === 0 || !fundName) continue;

    // 按分割点拆分金额
    const preAmounts = group.amountLines.slice(0, splitIndex);   // 名称续行前的金额
    const postAmounts = group.amountLines.slice(splitIndex);      // 名称续行后的金额

    // 解析金额
    const parseGroup = (arr) => arr.map(a => extractAmounts(a.line)[0] || 0);

    const preValues = parseGroup(preAmounts);
    const postValues = parseGroup(postAmounts);

    // 持仓金额 = 名称续行前的最大正数金额
    let amount = 0;
    if (preValues.length > 0) {
      const maxPre = Math.max(...preValues.filter(v => v > 0));
      if (maxPre > 0) amount = maxPre;
    }

    // 累计收益 = 名称续行前的第二个金额（与金额同行右侧的"持有收益"）
    // 支付宝布局：名称前半 | 金额 | 持有收益(累计收益)
    //                    | 昨日收益 | 收益率
    //             名称后半 |
    // OCR按列读取：金额、持有收益(累计) 在名称续行前；昨日收益在名称续行后
    let totalReturn = 0;
    if (preValues.length >= 2) {
      // preAmounts 中：第一个是持仓金额，第二个是累计收益
      totalReturn = preValues[1];
    }

    results.push({ fundCode: '', fundName, amount, totalReturn });
    console.log(`[OcrService] 解析: "${fundName}" 金额=${amount} 累计收益=${totalReturn} (pre=${preValues} post=${postValues})`);
  }

  return results;
}

/**
 * 通用解析：基于基金代码位置，提取基金名称/代码、持仓金额、累计收益
 */
function parseByFundCodes(text) {
  const results = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const fundCodes = extractFundCodes(text);

  if (fundCodes.length === 0) return results;

  for (const fundCode of fundCodes) {
    let codeLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(fundCode)) {
        codeLineIndex = i;
        break;
      }
    }
    if (codeLineIndex === -1) continue;

    // 提取基金名称
    let fundName = '';
    const codeLine = lines[codeLineIndex];
    const codePosInLine = codeLine.indexOf(fundCode);
    if (codePosInLine > 0) {
      fundName = extractFundName(codeLine.substring(0, codePosInLine));
    }
    if (!fundName && codeLineIndex > 0) {
      fundName = extractFundName(lines[codeLineIndex - 1]);
    }
    if (!fundName) {
      fundName = extractFundName(codeLine.substring(codePosInLine + fundCode.length));
    }

    // 从上下文提取金额：持仓金额（第一个正数）和累计收益（第一个负数或第二个金额）
    const contextLines = lines.slice(Math.max(0, codeLineIndex - 1), Math.min(lines.length, codeLineIndex + 4));
    const allAmounts = extractAmounts(contextLines.join(' '));
    const filteredAmounts = allAmounts.filter(a => {
      // 排除6位整数（可能是基金代码）
      return !(Math.abs(a) >= 100000 && Math.abs(a) < 1000000 && Number.isInteger(a));
    });

    let amount = 0;
    let totalReturn = 0;

    if (filteredAmounts.length >= 2) {
      // 持仓金额 = 最大的正数
      const positives = filteredAmounts.filter(a => a > 0).sort((a, b) => b - a);
      const negatives = filteredAmounts.filter(a => a < 0);
      amount = positives[0] || 0;
      totalReturn = negatives.length > 0 ? negatives[0] : 0;
    } else if (filteredAmounts.length === 1) {
      amount = Math.abs(filteredAmounts[0]);
      totalReturn = filteredAmounts[0] < 0 ? filteredAmounts[0] : 0;
    }

    if (amount > 0) {
      results.push({ fundCode, fundName, amount, totalReturn });
    }
  }

  return results;
}

/**
 * 检测截图来源
 */
function detectFormat(text) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('支付宝') || lowerText.includes('蚂蚁财富') ||
      lowerText.includes('蚂蚁基金') || lowerText.includes('余额宝') ||
      lowerText.includes('总资产') || lowerText.includes('持仓收益')) {
    return 'alipay';
  }
  // 支付宝特征：金额/昨日收益 + 持有收益/率 的表头
  if (text.includes('金额') && text.includes('昨日收益') && text.includes('持有收益')) {
    return 'alipay';
  }
  if (lowerText.includes('天天基金') || lowerText.includes('东方财富') ||
      lowerText.includes('基金持仓') || lowerText.includes('持有份额')) {
    return 'tiantian';
  }
  return 'generic';
}

function mergeResults(resultsArr) {
  const map = new Map();
  for (const item of resultsArr) {
    const key = item.fundCode || item.fundName;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
    } else if (item.fundName && !existing.fundName) {
      map.set(key, item);
    } else if (item.fundCode && !existing.fundCode) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

/**
 * 解析 OCR 文本为持仓数据
 */
function parseHoldingsFromText(text) {
  if (!text || text.trim().length === 0) return [];

  const format = detectFormat(text);
  console.log(`[OcrService] 检测到截图格式: ${format}`);

  // 先尝试基于基金代码的解析
  const codeResults = parseByFundCodes(text);

  // 再尝试基于名称+金额模式的解析（适用于支付宝等不含基金代码的截图）
  const nameResults = parseAlipayByNamePattern(text);

  let results = mergeResults([...codeResults, ...nameResults]);

  // 宽松回退：如果还是没有结果，尝试从所有6位数字中提取
  if (results.length === 0) {
    console.log('[OcrService] 标准解析无结果，尝试宽松解析...');
    const allCodes = text.match(/\d{6}/g);
    if (allCodes) {
      for (const code of [...new Set(allCodes)]) {
        const fundCode = code.substring(0, 6);
        const codeIdx = text.indexOf(fundCode);
        const afterText = text.substring(codeIdx, codeIdx + 200);
        const amounts = extractAmounts(afterText).filter(a => Math.abs(a) < 10000000);
        if (amounts.length > 0) {
          results.push({
            fundCode,
            fundName: '',
            amount: Math.abs(amounts[0]),
            totalReturn: amounts.length > 1 ? amounts[1] : 0,
          });
        }
      }
    }
  }

  console.log(`[OcrService] 解析到 ${results.length} 条持仓记录`);
  return results;
}

// ==================== 主入口 ====================

async function recognizeHoldingsFromImage(imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error('图片文件不存在: ' + imagePath);
  }

  let text = null;
  let engine = 'none';

  if (BAIDU_APP_ID && BAIDU_API_KEY && BAIDU_SECRET_KEY) {
    text = await recognizeWithBaidu(imagePath);
    if (text) engine = 'baidu';
  } else {
    console.log('[OcrService] 百度OCR未配置，跳过（需配置 BAIDU_OCR_APP_ID/API_KEY/SECRET_KEY）');
  }

  if (!text) {
    console.log('[OcrService] 回退到 Tesseract.js...');
    text = await recognizeWithTesseract(imagePath);
    if (text) engine = 'tesseract';
  }

  if (!text || text.trim().length === 0) {
    throw new Error('OCR 未能识别出任何文字，请确保图片清晰且包含基金持仓信息');
  }

  const items = parseHoldingsFromText(text);

  return { items, rawText: text, engine };
}

module.exports = {
  recognizeHoldingsFromImage,
  parseHoldingsFromText,
  parseByFundCodes,
  parseAlipayByNamePattern,
  detectFormat,
  parseAmount,
  extractFundCodes,
  extractAmounts,
};
