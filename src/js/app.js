// UI制御・状態管理・localStorage・印刷。計算は calc.js に委譲する。
import { calcTotals, lineAmount } from './calc.js';

const STORAGE_KEY = 'sugu-invoice:v1';
const SCHEMA = 1;
const MAX_ITEMS = 20;

const $ = (selector) => document.querySelector(selector);
const yen = (n) => '¥' + Math.trunc(n).toLocaleString('ja-JP');

// ---------- 日付ユーティリティ ----------
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fmtDate(new Date());
function endOfMonth() {
  const now = new Date();
  return fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}
function jpDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}

// ---------- 状態 ----------
function newItem() {
  return { desc: '', qty: 1, unitPrice: 0, taxRate: 10 };
}

function defaultState() {
  return {
    meta: {
      docNumber: `INV-${today().replaceAll('-', '')}-01`,
      issueDate: today(),
      dueDate: endOfMonth(),
      subject: '',
    },
    client: { name: '', honorific: '御中' },
    issuer: { name: '', zipAddress: '', tel: '', email: '', regNumber: '', bank: '' },
    items: [newItem()],
    options: { withholding: false },
    notes: '',
  };
}

let state = defaultState();

function getPath(obj, path) {
  return path.split('.').reduce((o, key) => (o == null ? undefined : o[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, key) => o[key], obj);
  target[last] = value;
}

// ---------- 永続化 ----------
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 容量超過・プライベートモード等では保存を諦める（動作は継続）
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) mergeState(JSON.parse(raw));
  } catch {
    // 壊れたデータは無視して初期値で開始
  }
}

// 外部データ（localStorage / インポートJSON）を欠損に強い形で取り込む
function mergeState(data) {
  if (typeof data !== 'object' || data === null) return;
  const base = defaultState();
  for (const section of ['meta', 'client', 'issuer', 'options']) {
    if (typeof data[section] === 'object' && data[section] !== null) {
      Object.assign(base[section], data[section]);
    }
  }
  if (typeof data.notes === 'string') base.notes = data.notes;
  if (Array.isArray(data.items) && data.items.length > 0) {
    base.items = data.items
      .slice(0, MAX_ITEMS)
      .map((it) => ({ ...newItem(), ...(typeof it === 'object' && it !== null ? it : {}) }));
  }
  state = base;
}

// ---------- フォーム ⇔ 状態 ----------
function bindStaticInputs() {
  for (const el of document.querySelectorAll('[data-bind]')) {
    el.addEventListener('input', () => {
      const value = el.type === 'checkbox' ? el.checked : el.value;
      setPath(state, el.dataset.bind, value);
      if (el.id === 'f-reg-number') validateRegNumber();
      save();
      renderPreview();
    });
  }
}

function syncFormFromState() {
  for (const el of document.querySelectorAll('[data-bind]')) {
    const value = getPath(state, el.dataset.bind);
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value ?? '';
  }
  validateRegNumber();
  renderItemRows();
}

function validateRegNumber() {
  const value = String(state.issuer.regNumber || '').trim();
  $('#reg-warning').hidden = value === '' || /^T\d{13}$/.test(value);
}

// ---------- 明細行フォーム ----------
function renderItemRows() {
  const container = $('#item-rows');
  container.textContent = '';
  const template = $('#item-row-template');

  state.items.forEach((item, index) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const desc = row.querySelector('.item-desc');
    const qty = row.querySelector('.item-qty');
    const price = row.querySelector('.item-price');
    const tax = row.querySelector('.item-tax');
    const amount = row.querySelector('.item-amount');

    desc.value = item.desc;
    qty.value = item.qty;
    price.value = item.unitPrice;
    tax.value = String(item.taxRate);
    amount.textContent = yen(lineAmount(item));

    const update = () => {
      item.desc = desc.value;
      item.qty = qty.value === '' ? 0 : Number(qty.value);
      item.unitPrice = price.value === '' ? 0 : Number(price.value);
      item.taxRate = Number(tax.value);
      amount.textContent = yen(lineAmount(item));
      save();
      renderPreview();
    };
    for (const el of [desc, qty, price, tax]) el.addEventListener('input', update);

    row.querySelector('.item-remove').addEventListener('click', () => {
      state.items.splice(index, 1);
      if (state.items.length === 0) state.items.push(newItem());
      renderItemRows();
      save();
      renderPreview();
    });

    container.appendChild(row);
  });
}

// ---------- プレビュー描画 ----------
function setText(selector, text) {
  $(selector).textContent = text ?? '';
}

function setHidden(selector, hidden) {
  $(selector).hidden = hidden;
}

function appendCell(tr, text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  tr.appendChild(td);
}

function renderTaxRow(rate, totals) {
  const taxable = totals.taxableByRate[rate];
  setHidden(`#pv-tax${rate}-row`, taxable === undefined);
  if (taxable === undefined) return;
  setText(`#pv-taxable${rate}`, yen(taxable));
  setText(`#pv-tax${rate}`, yen(totals.taxByRate[rate]));
}

function renderPreview() {
  const totals = calcTotals(state.items, state.options);

  // 宛先・ヘッダー
  setText('#pv-client-name', state.client.name || '（請求先名）');
  setText('#pv-honorific', state.client.honorific);
  setHidden('#pv-subject-row', !state.meta.subject);
  setText('#pv-subject', state.meta.subject);
  setText('#pv-docnumber', state.meta.docNumber);
  setText('#pv-issuedate', jpDate(state.meta.issueDate));
  setText('#pv-duedate', jpDate(state.meta.dueDate));

  // 発行者
  setText('#pv-issuer-name', state.issuer.name);
  setText('#pv-issuer-address', state.issuer.zipAddress);
  setText(
    '#pv-issuer-contact',
    [state.issuer.tel && `TEL: ${state.issuer.tel}`, state.issuer.email].filter(Boolean).join('　'),
  );
  setHidden('#pv-issuer-reg', !state.issuer.regNumber);
  setText('#pv-regnumber', state.issuer.regNumber);

  // 明細（品目名も金額も空の行は印字しない）
  const tbody = $('#pv-item-rows');
  tbody.textContent = '';
  let hasReducedRate = false;
  for (const item of state.items) {
    const amount = lineAmount(item);
    if (!item.desc && amount === 0) continue;
    const isReduced = Number(item.taxRate) === 8;
    if (isReduced) hasReducedRate = true;
    const tr = document.createElement('tr');
    appendCell(tr, item.desc + (isReduced ? ' ※' : ''), 'col-desc');
    appendCell(tr, String(item.qty), 'num');
    appendCell(tr, yen(Number(item.unitPrice) || 0), 'num');
    appendCell(tr, yen(amount), 'num');
    tbody.appendChild(tr);
  }

  // 合計欄
  setText('#pv-subtotal', yen(totals.subtotal));
  renderTaxRow(10, totals);
  renderTaxRow(8, totals);
  setHidden('#pv-withholding-row', !state.options.withholding);
  setHidden('#pv-withholding-note', !state.options.withholding);
  setText('#pv-withholding', `-${yen(totals.withholding)}`);
  setText('#pv-total', yen(totals.total));
  setText('#pv-total-big', yen(totals.total));
  setHidden('#pv-reduced-note', !hasReducedRate);

  // 振込先・備考
  setHidden('#pv-bank-block', !state.issuer.bank);
  setText('#pv-bank', state.issuer.bank);
  setHidden('#pv-notes-block', !state.notes);
  setText('#pv-notes', state.notes);
}

// ---------- ツールバー ----------
function exportJson() {
  const data = { app: 'sugu-invoice', schema: SCHEMA, ...state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.meta.docNumber || 'invoice'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importJson(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'sugu-invoice' || data.schema !== SCHEMA) throw new Error('unsupported file');
    mergeState(data);
    syncFormFromState();
    save();
    renderPreview();
  } catch {
    alert('読み込めませんでした。スグ請求書で書き出したJSONファイルを選択してください。');
  }
}

function clearDocument() {
  if (!confirm('請求先・明細・備考をクリアします（発行者情報は残ります）。よろしいですか？')) return;
  const issuer = state.issuer;
  state = defaultState();
  state.issuer = issuer;
  syncFormFromState();
  save();
  renderPreview();
}

function wipeAll() {
  if (!confirm('発行者情報を含む、ブラウザに保存されたすべてのデータを削除します。よろしいですか？')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  syncFormFromState();
  renderPreview();
}

function bindToolbar() {
  $('#btn-print').addEventListener('click', () => window.print());
  $('#btn-add-item').addEventListener('click', () => {
    if (state.items.length >= MAX_ITEMS) return;
    state.items.push(newItem());
    renderItemRows();
    save();
    renderPreview();
  });
  $('#btn-export').addEventListener('click', exportJson);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', importJson);
  $('#btn-clear').addEventListener('click', clearDocument);
  $('#btn-wipe').addEventListener('click', wipeAll);
}

// ---------- 起動 ----------
function init() {
  load();
  syncFormFromState();
  bindStaticInputs();
  bindToolbar();
  renderPreview();
}

init();
