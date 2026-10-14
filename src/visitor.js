// ============================================================
//  訪客身分 —— 不做會員制度的做法
//  由 Claude 建立 2026-10-15
//
//  沒有註冊、沒有密碼。第一次來就給一個隨機代號存在這台電腦裡，
//  之後每次來都是同一隻角色。
//
//  代價要講清楚：換電腦、換瀏覽器、或清掉瀏覽器資料，
//  就會變成另一個人。這是不做會員制必然的取捨。
//
//  之後要連線，這支檔案的 id 就是別人認得你的那個代號。
// ============================================================

import { CHARACTERS, AVATAR } from './config.js';

const KEY = 'island-map.visitor.v1';

function newId() {
  return 'v-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || !v.id || !v.char) return null;
    // 角色清單改過之後，舊的代號可能已經不存在了
    if (!CHARACTERS.some((c) => c.id === v.char)) return null;
    return v;
  } catch {
    return null;
  }
}

function save(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

// 選好角色，開始參與
export function join({ char, name }) {
  const prev = load();
  const v = {
    id: prev?.id ?? newId(),
    char,
    name: (name || '').trim().slice(0, AVATAR.nameLimit) || '訪客',
    at: Date.now(),
  };
  save(v);
  return v;
}

// 換角色 / 改名字（id 不變，所以還是同一個人）
export function update(patch) {
  const v = load();
  if (!v) return null;
  const next = { ...v, ...patch, at: Date.now() };
  if (next.name) next.name = String(next.name).trim().slice(0, AVATAR.nameLimit);
  save(next);
  return next;
}

export function charOf(v) {
  return CHARACTERS.find((c) => c.id === v?.char) ?? CHARACTERS[0];
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch {}
}
