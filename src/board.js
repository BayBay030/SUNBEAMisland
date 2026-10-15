// ============================================================
//  公佈欄 —— 神木旁邊那個小木架上的留言
//  由 Claude 建立 2026-10-15
//
//  跟 energy.js 一樣，現在存在「這台電腦的瀏覽器」裡。
//  之後要變成大家共用，只要改這一支：把 load() / save() 換成
//  去讀寫共用的資料庫，其他檔案一行都不用動。
// ============================================================

import * as DB from './db.js';

const KEY = 'island-map.board.v1';

let cache = null;
let onChange = null;

export function watch(fn) { onChange = fn; }

export const LIMITS = {
  name: 12,      // 署名最多幾個字
  text: 120,     // 留言最多幾個字
  perDay: 3,     // 同一個人一天最多留幾則
  show: 24,      // 面板上顯示最近幾則
};

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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

// 去資料庫拿大家的留言。自己留的那幾則要標回 mine，才看得到「（你）」
export async function refresh(myVisitor) {
  if (!DB.enabled()) return load();
  const rows = await DB.select('board', 'select=*&order=at.desc&limit=100');
  if (!rows) return load();      // 連不上 → 維持原狀，不要清空大家的留言
  const cheered = new Set(load().filter((m) => m.cheered).map((m) => m.id));
  cache = rows.map((r) => ({
    id: r.id, d: r.day, n: r.name, t: r.body,
    at: Date.parse(r.at), up: r.up ?? 0,
    mine: r.visitor === myVisitor,
    cheered: cheered.has(r.id),
  }));
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
    return false;   // 無痕視窗寫不進去，但畫面照樣要能跑
  }
}

// 這台電腦今天留了幾則（換成共用資料庫之後，這裡要改成認帳號）
export function postedToday(list = load()) {
  const d = todayStr();
  return list.filter((m) => m.d === d && m.mine).length;
}

export function canPost(list = load()) {
  return postedToday(list) < LIMITS.perDay;
}

export function post({ name, text, visitor }) {
  const body = (text || '').trim().slice(0, LIMITS.text);
  if (!body) return load();

  const list = load();
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  list.push({
    id,
    d: todayStr(),
    n: (name || '').trim().slice(0, LIMITS.name) || '路過的人',
    t: body,
    at: Date.now(),
    up: 0,
    mine: true,           // 自己留的，用來擋每日上限、也用來標「你」
  });
  save(list);

  if (DB.enabled()) {
    DB.insert('board', {
      id,
      visitor: visitor || 'me',
      day: todayStr(),
      name: (name || '').trim().slice(0, LIMITS.name) || '路過的人',
      body,
    });
  }
  return list;
}

// 按 +1。同一則自己只能按一次
export function cheer(id) {
  const list = load();
  const m = list.find((x) => x.id === id);
  if (!m || m.cheered) return list;
  m.up = (m.up ?? 0) + 1;
  m.cheered = true;
  save(list);

  // 資料庫那邊只開放改 up 這一個欄位，別的改不了
  if (DB.enabled()) DB.update('board', `id=eq.${encodeURIComponent(id)}`, { up: m.up });
  return list;
}

// 最新的排前面
export function recent(list = load()) {
  return [...list].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, LIMITS.show);
}

export function count(list = load()) {
  return list.length;
}

export function reset() {
  cache = [];
  try { localStorage.removeItem(KEY); } catch {}
  return [];
}

// 塞假留言看畫面（主控台輸入 ISLAND.board.seedFake(8)）
export function seedFake(n = 6) {
  const names = ['鼠尼', '路過的人', '貝貝', '夜貓', '小海', '糖漿控'];
  const texts = [
    '今天的蜜糖瀑布看起來特別濃',
    '來報到，樹又變高了',
    '誰在樹上掛了一顆紅色的球',
    '明天還要來',
    '這裡好安靜，我喜歡',
    '第一次來，先留個名',
  ];
  const list = load();
  for (let i = 0; i < n; i++) {
    list.push({
      id: `fake-${Date.now()}-${i}`,
      d: todayStr(),
      n: names[i % names.length],
      t: texts[i % texts.length],
      at: Date.now() - i * 3600000,
      up: Math.floor(Math.random() * 5),
      mine: false,
    });
  }
  save(list);
  return list;
}
