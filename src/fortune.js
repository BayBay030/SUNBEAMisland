// ============================================================
//  運氣小卡 —— 主島上的小望遠鏡，每天抽一張
//  由 Claude 建立 2026-10-15
//
//  不需要任何伺服器：用「日期」當亂數種子，
//  所以同一天不管重開幾次都是同一張，隔天自動換一張。
// ============================================================

import { FORTUNE_CARDS } from './config.js';

const KEY = 'island-map.fortune.v1';

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 把日期字串揉成一個數字（同一天一定得到同一個數字）
function hashDate(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 今天該抽到哪一張（還沒翻開也算得出來）
export function cardOfToday() {
  const i = hashDate(todayStr()) % FORTUNE_CARDS.length;
  return { index: i, card: FORTUNE_CARDS[i] };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// 今天翻開了嗎
export function drawnToday() {
  const s = read();
  return !!s && s.d === todayStr();
}

// 翻開。回傳今天那張卡
export function draw() {
  const { index, card } = cardOfToday();
  try {
    localStorage.setItem(KEY, JSON.stringify({ d: todayStr(), i: index }));
  } catch {
    // 寫不進去也沒關係，卡還是算得出來，只是重開會變回沒翻過
  }
  return card;
}

// 連續幾天來抽（只是拿來顯示，鼓勵每天回來）
export function streak() {
  const s = read();
  if (!s) return 0;
  return s.d === todayStr() ? (s.k ?? 1) : 0;
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch {}
}
