import test from 'node:test';
import assert from 'node:assert/strict';
import { lineAmount, calcWithholding, calcTotals } from '../src/js/calc.js';

test('lineAmount: 整数の数量×単価', () => {
  assert.equal(lineAmount({ qty: 2, unitPrice: 1000 }), 2000);
});

test('lineAmount: 小数の数量（7.5時間 × 6,000円）', () => {
  assert.equal(lineAmount({ qty: 7.5, unitPrice: 6000 }), 45000);
});

test('lineAmount: 不正値（NaN・負値・欠損）は0扱い', () => {
  assert.equal(lineAmount({ qty: 'abc', unitPrice: 1000 }), 0);
  assert.equal(lineAmount({ qty: -1, unitPrice: 1000 }), 0);
  assert.equal(lineAmount({ qty: 1, unitPrice: -500 }), 0);
  assert.equal(lineAmount({}), 0);
  assert.equal(lineAmount(undefined), 0);
});

test('calcTotals: 10%のみの基本ケース', () => {
  const totals = calcTotals([{ desc: 'a', qty: 1, unitPrice: 100000, taxRate: 10 }]);
  assert.equal(totals.subtotal, 100000);
  assert.deepEqual(totals.taxableByRate, { 10: 100000 });
  assert.deepEqual(totals.taxByRate, { 10: 10000 });
  assert.equal(totals.tax, 10000);
  assert.equal(totals.withholding, 0);
  assert.equal(totals.total, 110000);
});

test('calcTotals: 10%と軽減8%の混在', () => {
  const totals = calcTotals([
    { qty: 1, unitPrice: 90000, taxRate: 10 },
    { qty: 1, unitPrice: 10005, taxRate: 8 },
  ]);
  assert.equal(totals.subtotal, 100005);
  assert.equal(totals.taxByRate[10], 9000);
  assert.equal(totals.taxByRate[8], 800); // floor(10005 × 0.08 = 800.4)
  assert.equal(totals.tax, 9800);
  assert.equal(totals.total, 109805);
});

test('calcTotals: 消費税は税率ごとに合算後に1回だけ端数処理（行ごとではない）', () => {
  // 行ごとにfloorすると floor(0.96)+floor(1.04) = 0+1 = 1 になるが、
  // インボイスのルール（合算後に1回）では floor(25×0.08) = 2 が正しい。
  const totals = calcTotals([
    { qty: 1, unitPrice: 12, taxRate: 8 },
    { qty: 1, unitPrice: 13, taxRate: 8 },
  ]);
  assert.equal(totals.taxByRate[8], 2);
});

test('calcTotals: 空の明細・金額0行は集計に含めない', () => {
  const totals = calcTotals([{ qty: 0, unitPrice: 0, taxRate: 10 }]);
  assert.equal(totals.subtotal, 0);
  assert.deepEqual(totals.taxableByRate, {});
  assert.equal(totals.total, 0);
});

test('calcWithholding: 100万円以下は10.21%（切り捨て）', () => {
  assert.equal(calcWithholding(500000), 51050);
  assert.equal(calcWithholding(333333), 34033); // floor(34033.29993)
  assert.equal(calcWithholding(0), 0);
});

test('calcWithholding: 境界値 100万円ちょうど / 100万1円', () => {
  assert.equal(calcWithholding(1_000_000), 102100);
  assert.equal(calcWithholding(1_000_001), 102100); // floor(1×0.2042)=0 + 102100
});

test('calcWithholding: 100万円超は超過分が20.42%', () => {
  assert.equal(calcWithholding(2_000_000), 306300); // 102100 + 1,000,000×0.2042
});

test('calcTotals: 源泉徴収ONで合計から差し引かれる', () => {
  const totals = calcTotals(
    [{ qty: 1, unitPrice: 100000, taxRate: 10 }],
    { withholding: true },
  );
  assert.equal(totals.withholding, 10210);
  assert.equal(totals.total, 100000 + 10000 - 10210);
});

test('calcTotals: 不正な入力（配列以外・不明な税率）に耐える', () => {
  assert.equal(calcTotals(null).total, 0);
  const totals = calcTotals([{ qty: 1, unitPrice: 100, taxRate: 99 }]);
  assert.deepEqual(totals.taxableByRate, { 10: 100 }); // 不明税率は10%に正規化
});
