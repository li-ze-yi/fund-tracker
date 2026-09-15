/**
 * API 数值入参校验工具
 *
 * 目的：在入口处拦截 NaN / 负数 / 非数值，防止其进入账务计算
 * （例如负数份额的卖出请求会使 newShares = old - (负数) = 份额不减反增）。
 * 约定：校验失败返回 NaN，由调用方决定响应 400 与文案。
 */

/**
 * 解析必须为正的有限数（如买入金额、卖出份额）
 * @returns {number} 有效时返回数值，无效返回 NaN
 */
function toPositiveNumber(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/**
 * 解析可选的有限数（如累计收益，允许负数）
 * 未传 / 空串返回 defaultValue；传入但无法解析为有限数时返回 NaN
 */
function toOptionalNumber(v, defaultValue = 0) {
  if (v === undefined || v === null || v === '') return defaultValue;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * 解析必须为非负的有限数（如费率，可选）
 * 未传 / 空串返回 defaultValue；传入但为负或无效时返回 NaN
 */
function toNonNegativeNumber(v, defaultValue = 0) {
  const n = toOptionalNumber(v, defaultValue);
  return Number.isNaN(n) || n < 0 ? NaN : n;
}

module.exports = { toPositiveNumber, toOptionalNumber, toNonNegativeNumber };
