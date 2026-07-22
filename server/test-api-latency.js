/**
 * 外部API延迟测试脚本 V2 - 增加东方财富移动端API测试
 * 用法: node test-api-latency.js [基金代码]
 * 默认测试 110011
 *
 * 在生产服务器上运行，诊断哪些基金API可用
 */

const axios = require('axios');

const FUND_CODE = process.argv[2] || '110011';
const TIMEOUT = 10000;

const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://fund.eastmoney.com/',
};

const WEB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://fund.eastmoney.com/',
  'Accept': '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

async function measureTime(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    const status = elapsed < 500 ? '✓' : elapsed < 2000 ? '⚠' : '✗';
    console.log(`  ${status} ${name}: ${elapsed}ms → ${JSON.stringify(result).slice(0, 120)}`);
    return { name, elapsed, ok: true, result };
  } catch (e) {
    const elapsed = Date.now() - start;
    console.log(`  ✗ ${name}: ${elapsed}ms → ERROR: ${e.message.slice(0, 80)}`);
    return { name, elapsed, ok: false, error: e.message };
  }
}

async function main() {
  console.log('============================================');
  console.log(`  基金API延迟测试 V2 - 基金代码: ${FUND_CODE}`);
  console.log(`  时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log('============================================\n');

  // ===== A. 东方财富移动端API（重点测试）=====

  console.log('━━━ A. 东方财富移动端API（新发现，可能替代新浪）━━━\n');

  // A1: fundgz 实时估值接口
  console.log('[A1] fundgz.1234567.com.cn (天天基金实时估值 - 打印原始响应!)');
  await measureTime('fundgz估值', async () => {
    const { data } = await axios.get(
      `http://fundgz.1234567.com.cn/js/${FUND_CODE}.js?rt=${Date.now()}`,
      { timeout: TIMEOUT, headers: WEB_HEADERS, responseType: 'text' }
    );
    // 直接返回原始响应内容，方便判断接口是否真正可用
    return data.slice(0, 300);
  });

  // A2: fundmobapi 批量基金信息 - 打印完整原始响应
  console.log('\n[A2] fundmobapi.eastmoney.com (批量基金信息 - 打印完整原始响应!)');
  await measureTime('批量基金信息(3只)', async () => {
    const { data } = await axios.get(
      `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=200&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=Wap&Fcodes=${FUND_CODE},000001,510300`,
      { timeout: TIMEOUT, headers: MOBILE_HEADERS }
    );
    // 打印第一只基金的所有字段，看有没有估值相关字段
    if (data?.Datas?.length) {
      const d = data.Datas[0];
      return { 所有字段: Object.keys(d), 原始数据: d };
    }
    return '无数据';
  });

  // A3: fundmobapi 估值走势详情 - 打印完整原始响应
  console.log('\n[A3] fundmobapi.eastmoney.com (盘中估值走势 - 打印完整原始响应!)');
  await measureTime('估值走势', async () => {
    const { data } = await axios.get(
      `https://fundmobapi.eastmoney.com/FundMApi/FundVarietieValuationDetail.ashx?FCODE=${FUND_CODE}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_=${Date.now()}`,
      { timeout: TIMEOUT, headers: MOBILE_HEADERS }
    );
    // 打印完整原始响应
    return { Expansion: data?.Expansion, Datas数量: data?.Datas?.length || 0, 前3条: (data?.Datas || []).slice(0, 3) };
  });

  // A4: fundmobapi 基金基本信息（含估值）
  console.log('\n[A4] fundmobapi.eastmoney.com (基金基本信息含最新净值)');
  await measureTime('基金基本信息', async () => {
    const { data } = await axios.get(
      `https://fundmobapi.eastmoney.com/FundMApi/FundBaseTypeInformation.ashx?FCODE=${FUND_CODE}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_=${Date.now()}`,
      { timeout: TIMEOUT, headers: MOBILE_HEADERS }
    );
    const d = data?.Datas;
    if (d) {
      return { name: d.SHORTNAME, nav: d.DWJZ, totalNav: d.LJJZ, type: d.FTYPE, scale: d.ENDNAV };
    }
    return '无数据';
  });

  // ===== B. 东方财富网页端API（已知可用）=====

  console.log('\n━━━ B. 东方财富网页端API（已知可用，作为基准）━━━\n');

  console.log('[B1] api.fund.eastmoney.com (确认净值)');
  await measureTime('lsjz接口', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data } = await axios.get(
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${FUND_CODE}&pageIndex=1&pageSize=2&startDate=${threeDaysAgo}&endDate=${today}`,
      { timeout: TIMEOUT, headers: WEB_HEADERS }
    );
    const list = data?.Data?.LSJZList || [];
    return list.map(r => ({ date: r.FSRQ, nav: r.DWJZ, change: r.JZZZL + '%' }));
  });

  console.log('\n[B2] push2.eastmoney.com (场内行情)');
  await measureTime('push2接口', async () => {
    const { data } = await axios.get(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=1.${FUND_CODE}&fields=f43,f44,f170`,
      { timeout: TIMEOUT, headers: WEB_HEADERS }
    );
    return data?.data || '无数据';
  });

  // ===== C. 新浪（已知403）=====

  console.log('\n━━━ C. 新浪接口（已知阿里云403）━━━\n');

  console.log('[C1] hq.sinajs.cn (实时估值)');
  await measureTime('新浪估值', async () => {
    const { status, data } = await axios.get(`http://hq.sinajs.cn/list=fu_${FUND_CODE}`, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.sina.com.cn/' },
      responseType: 'text',
      validateStatus: () => true,
    });
    return `HTTP ${status}`;
  });

  // ===== D. 总结 =====

  console.log('\n============================================');
  console.log('  关键结论');
  console.log('============================================');
  console.log('');
  console.log('  如果 A1(fundgz) 可用 → 可以直接替换新浪获取实时估值');
  console.log('  如果 A2(批量) 可用 → 可以1次请求替代N次确认净值请求');
  console.log('  如果 A3(估值走势) 可用 → 可以获取盘中分时估值数据');
  console.log('');
  console.log('  东方财富移动端API(appType=ttjj)是天天基金APP使用的接口，');
  console.log('  不会被403封禁，且支持批量查询，是最理想的替代方案。');
  console.log('');
}

main().catch(console.error);
