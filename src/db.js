// ============================================================
//  Supabase 連線 —— 一層很薄的包裝
//  由 Claude 建立 2026-10-15
//
//  刻意不裝 Supabase 的官方套件，直接用瀏覽器內建的 fetch 打它的 REST。
//  理由：這個專案的原則是「不裝 node_modules、雙擊就能跑」，
//  裝套件就要有建置流程，整個就回不去了。
//
//  金鑰是 publishable（可公開）的那把，本來就設計成寫在前端。
//  真正擋住壞事的是資料庫那邊的權限規則，不是把金鑰藏起來。
// ============================================================

import { SUPABASE } from './config.js';

export const enabled = () => !!(SUPABASE.url && SUPABASE.key);

// 連線狀態：null = 還沒試過，true = 通的，false = 連不上
let online = null;
const watchers = new Set();

export function status() { return online; }
export function watchStatus(fn) { watchers.add(fn); fn(online); return () => watchers.delete(fn); }

function mark(ok) {
  if (online === ok) return;        // 沒變就不要一直通知
  online = ok;
  for (const fn of watchers) { try { fn(ok); } catch {} }
}

const base = () => SUPABASE.url.replace(/\/+$/, '') + '/rest/v1';

function headers(extra = {}) {
  return {
    apikey: SUPABASE.key,
    Authorization: `Bearer ${SUPABASE.key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

// 連不上就安靜地回 null / 空陣列，畫面照樣要能動
async function call(path, init) {
  if (!enabled()) return null;
  try {
    const r = await fetch(base() + path, init);
    if (!r.ok) {
      console.warn('[島嶼地圖] 資料庫回應', r.status, await r.text().catch(() => ''));
      // 400 之類是我們自己送錯東西，不算斷線；5xx 和 401/403 才算
      mark(!(r.status >= 500 || r.status === 401 || r.status === 403));
      return null;
    }
    mark(true);
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  } catch (e) {
    // fetch 直接爆掉 = 真的連不上（斷網、專案被暫停、DNS 掛了…）
    console.warn('[島嶼地圖] 連不到資料庫', e.message);
    mark(false);
    return null;
  }
}

// 讀。query 是 PostgREST 的查詢字串，例如 'select=*&order=at.desc&limit=20'
//
// 注意回傳值的差別，這個很重要：
//   []    = 真的去問了，資料庫裡就是沒東西
//   null  = 根本沒問到（斷網、專案被暫停、超用量…）
// 兩者不能混為一談 —— 把 null 當成 [] 會讓「連不上」變成「清空大家的資料」。
export async function select(table, query = 'select=*') {
  return call(`/${table}?${query}`, { headers: headers() });
}

// 新增。upsert = 同一個主鍵就覆蓋（回報位置要用這個）
export async function insert(table, rows, { upsert = false } = {}) {
  const prefer = upsert
    ? 'return=minimal,resolution=merge-duplicates'
    : 'return=minimal';
  return call(`/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: prefer }),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
}

// 更新符合條件的列。filter 例如 'id=eq.abc'
export async function update(table, filter, patch) {
  return call(`/${table}?${filter}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
}

// 呼叫資料庫裡的函式
export async function rpc(fn, args = {}) {
  return call(`/rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  });
}
