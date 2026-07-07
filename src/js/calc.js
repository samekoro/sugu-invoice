// 金額計算ロジック（DOM非依存の純粋関数のみ）。
// 制度に関わる値はすべてこのファイルの定数に集約する。

export const TAX_RATES = [10, 8]; // 選択可能な消費税率(%)

// 源泉徴収（報酬・料金等）: 100万円以下 10.21% / 超過分 20.42%
// 浮動小数点誤差を避けるため、計算は「万分率」の整数で行う。
export const WITHHOLDING_THRESHOLD = 1_000_000;
export const WITHHOLDING_RATE_LOW = 0.1021;
export const WITHHOLDING_RATE_HIGH = 0.2042;
const WITHHOLDING_PERMYRIAD_LOW = 1021;
const WITHHOLDING_PERMYRIAD_HIGH = 2042;
const WITHHOLDING_AT_THRESHOLD = 102_100; // 1,000,000 × 10.21%

function toNonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// 明細1行の金額（税抜）。数量は小数可（例: 7.5時間）。1円未満切り捨て。
export function lineAmount(item) {
  const qty = toNonNegativeNumber(item?.qty);
  const unitPrice = toNonNegativeNumber(item?.unitPrice);
  return Math.floor(qty * unitPrice);
}

// 源泉徴収税額。base は税抜報酬額（整数円）。1円未満切り捨て。
export function calcWithholding(base) {
  const amount = Math.floor(toNonNegativeNumber(base));
  if (amount <= WITHHOLDING_THRESHOLD) {
    return Math.floor((amount * WITHHOLDING_PERMYRIAD_LOW) / 10000);
  }
  return (
    Math.floor(((amount - WITHHOLDING_THRESHOLD) * WITHHOLDING_PERMYRIAD_HIGH) / 10000) +
    WITHHOLDING_AT_THRESHOLD
  );
}

// 集計のエントリポイント。
// 消費税はインボイス制度の端数処理ルールに従い、
// 「税率ごとに課税対象額を合算してから1回だけ切り捨て」で計算する。
export function calcTotals(items, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const taxableByRate = {};
  let subtotal = 0;

  for (const item of list) {
    const amount = lineAmount(item);
    if (amount === 0) continue;
    const rate = TAX_RATES.includes(Number(item.taxRate)) ? Number(item.taxRate) : TAX_RATES[0];
    subtotal += amount;
    taxableByRate[rate] = (taxableByRate[rate] || 0) + amount;
  }

  const taxByRate = {};
  let tax = 0;
  for (const rate of Object.keys(taxableByRate)) {
    const t = Math.floor((taxableByRate[rate] * Number(rate)) / 100);
    taxByRate[rate] = t;
    tax += t;
  }

  const withholding = options.withholding ? calcWithholding(subtotal) : 0;

  return {
    subtotal,
    taxableByRate,
    taxByRate,
    tax,
    withholding,
    total: subtotal + tax - withholding,
  };
}
