/**
 * 本地日期工具
 * 统一使用本地时区（getFullYear/getMonth/getDate）推导日期，避免 toISOString() 的 UTC 偏移
 * （中国 UTC+8 在东八区 0-8 点之间，UTC 日期会比本地日期早一天）
 */

/**
 * 返回本地时区日期字符串 'YYYY-MM-DD'
 */
function getLocalToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 把各种 mysql2 / API 返回的日期值规范化为 'YYYY-MM-DD'
 * - Date 对象：用本地时间（getFullYear/getMonth/getDate）提取，避免 UTC 偏移
 * - 字符串：取前 10 字符（兼容 'YYYY-MM-DD HH:mm:ss' / 'YYYY-MM-DDTHH:mm:ss'）
 * 无法解析时返回 ''
 */
function normalizeDateStr(dateVal) {
  if (dateVal instanceof Date) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, '0');
    const day = String(dateVal.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof dateVal === 'string' && dateVal) {
    const str = dateVal.split('T')[0].split(' ')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  }
  return '';
}

module.exports = { getLocalToday, normalizeDateStr };