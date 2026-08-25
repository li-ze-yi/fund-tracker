const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeBuySettlement,
  computeSellSettlement,
  computeSharesAndCost
} = require('../services/settlementService');

const round2 = (v) => Math.round(v * 100) / 100;

test('computeBuySettlement：含费率时正确扣除费用并反算含费成本均价', () => {
  const { feeAmount, actualShares, costPrice } = computeBuySettlement(1000, 0.015, 2.0);

  assert.equal(round2(feeAmount), 15);          // 1000 * 1.5%
  assert.equal(round2(actualShares), 492.5);    // (1000 - 15) / 2.0
  assert.equal(round2(costPrice), 2.03);        // 1000 / 492.5（含费成本）
});

test('computeBuySettlement：零费率时成本均价等于确认净值', () => {
  const { feeAmount, actualShares, costPrice } = computeBuySettlement(1000, 0, 2.0);

  assert.equal(feeAmount, 0);
  assert.equal(actualShares, 500);              // 1000 / 2.0
  assert.equal(costPrice, 2.0);                 // 1000 / 500
});

test('computeBuySettlement：费率为空/未传时视为 0', () => {
  const { feeAmount, actualShares } = computeBuySettlement(500, null, 1.25);

  assert.equal(feeAmount, 0);
  assert.equal(actualShares, 400);
});

test('computeSellSettlement：正确计算毛额、费用与净额', () => {
  const { grossAmount, feeAmount, netAmount } = computeSellSettlement(100, 0.005, 3.0);

  assert.equal(round2(grossAmount), 300);       // 100 * 3.0
  assert.equal(round2(feeAmount), 1.5);         // 300 * 0.5%
  assert.equal(round2(netAmount), 298.5);       // 300 - 1.5
});

test('computeSellSettlement：零费率时净额等于毛额', () => {
  const { grossAmount, netAmount } = computeSellSettlement(200, 0, 2.5);

  assert.equal(grossAmount, 500);
  assert.equal(netAmount, 500);
});

test('computeSharesAndCost：金额→份额→成本反算（累计收益为 0 时成本=净值）', () => {
  const { shares, totalCost, costPrice } = computeSharesAndCost(10000, 0, 2.0);

  assert.equal(shares, 5000);                   // 10000 / 2.0
  assert.equal(totalCost, 10000);               // amount - 0
  assert.equal(costPrice, 2.0);                 // 10000 / 5000
});

test('computeSharesAndCost：含累计收益时从本金中扣除收益', () => {
  const { shares, totalCost, costPrice } = computeSharesAndCost(10000, 2000, 2.0);

  assert.equal(shares, 5000);
  assert.equal(totalCost, 8000);                // 10000 - 2000
  assert.equal(round2(costPrice), 1.6);         // 8000 / 5000
});