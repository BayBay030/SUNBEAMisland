// ============================================================
//  能量帳本 —— 大家投進神木的情緒球都記在這裡
//  由 Claude 建立 2026-10-15
//
//  現在存在「這台電腦的瀏覽器」裡，所以只有你自己看得到自己的。
//  之後要變成「大家一起養同一棵樹」，只要改這一支：
//  把 load() / push() 換成去讀寫共用的資料庫（例如 Google 試算表），
//  其他檔案一行都不用動。
// ============================================================

import * as DB from './db.js';

const KEY = 'island-map.energy.v1';

// 畫面需要「馬上」拿得到資料（建樹的時候），但資料庫是慢的。
// 所以記憶體裡放一份快取：先用本機的開場，背景去資料庫撈，撈回來再重畫。
let cache = null;
let onChange = null;

export function watch(fn) { onChange = fn; }

// 今天的日期（當地時間，YYYY-MM-DD）
export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 讀出全部紀錄。瀏覽器的儲存可能被關掉或清空，所以一律包起來，壞掉就當成空的
export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(list) ? list : [];
  } catch {
    cache = [];
  }
  return cache;
}

// 去資料庫拿大家投的能量，拿到就蓋掉快取並通知外面重畫
export async function refresh() {
  if (!DB.enabled()) return load();
  const rows = await DB.select('energy', 'select=*&order=at.asc&limit=2000');
  if (!rows) return load();      // 連不上 → 維持原狀，千萬不能當成「沒資料」清空
  cache = rows.map((r) => ({ d: r.day, e: r.emotion, t: r.note ?? '', s: Number(r.seed) || 1, v: r.visitor }));
  save(cache);
  onChange?.(cache);
  return cache;
}

function save(list) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    // 無痕視窗之類的情況會寫不進去。畫面照樣要能跑，只是重開就不見了
    return false;
  }
}

// 投一顆球
export function push({ emotion, text, visitor }) {
  const list = load();
  const row = {
    d: today(),
    e: emotion,
    t: (text || '').slice(0, 60),
    s: Math.floor(Math.random() * 1e9),   // 這顆球自己的亂數種子，決定它長出來的枝怎麼歪
    v: visitor || 'me',
  };
  list.push(row);
  save(list);

  // 同時寫進資料庫。送不出去也沒關係，本機這份還在。
  if (DB.enabled()) {
    DB.insert('energy', {
      visitor: row.v, day: row.d, emotion: row.e, note: row.t, seed: row.s,
    });
  }
  return list;
}

export function todayEntries(list = load()) {
  const d = today();
  return list.filter((x) => x.d === d);
}

export function hasThrownToday(list = load()) {
  return todayEntries(list).length > 0;
}

// 給樹用的統計
export function summarise(list = load()) {
  const days = new Set();
  const byEmotion = {};
  for (const x of list) {
    days.add(x.d);
    byEmotion[x.e] = (byEmotion[x.e] ?? 0) + 1;
  }
  return {
    total: list.length,
    days: days.size,
    byEmotion,
    // 整棵樹的亂數種子：由總數和天數決定，所以同樣的能量一定長出同一棵樹
    seed: list.reduce((a, x) => (a * 31 + x.s) >>> 0, 7) || 7,
  };
}

// 清空（測試用，主控台輸入 ISLAND.energy.reset()）
export function reset() {
  cache = [];
  try { localStorage.removeItem(KEY); } catch {}
  return [];
}

// 塞假資料進去看樹長大的樣子（主控台輸入 ISLAND.energy.seedFake(40)）
export function seedFake(n = 30, emotionIds = []) {
  const list = load();
  const ids = emotionIds.length ? emotionIds : ['joy', 'sad', 'angry', 'gloom', 'calm', 'hope'];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const back = Math.floor(i / 3);
    const day = new Date(d.getTime() - back * 86400000);
    const p = (x) => String(x).padStart(2, '0');
    list.push({
      d: `${day.getFullYear()}-${p(day.getMonth() + 1)}-${p(day.getDate())}`,
      e: ids[Math.floor(Math.random() * ids.length)],
      t: '',
      s: Math.floor(Math.random() * 1e9),
    });
  }
  save(list);
  return list;
}
