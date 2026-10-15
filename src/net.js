// ============================================================
//  連線層 —— 把自己的位置送出去、把別人的收回來
//  由 Claude 建立 2026-10-15
//
//  非同步做法：每隔幾秒送一次自己在哪，也每隔幾秒去拿一次大家在哪。
//  不是即時的長連線，但便宜、不容易壞，而且畫面上會補間成平滑移動。
//
//  兩種模式（在 config.js 的 NET.mode 切換）：
//
//    'local'   同一台電腦的不同分頁互相看。開兩個視窗就會看到兩隻角色。
//              完全不需要伺服器，用來驗證整套流程是通的。
//
//    'remote'  真的連線。需要一個網址（NET.endpoint）。
//              要做的事只有兩件：POST 自己的狀態、GET 大家的狀態。
//              下面 remoteAdapter 已經寫好，填上網址就會動。
// ============================================================

import { NET } from './config.js';
import * as DB from './db.js';

const PRESENCE_KEY = 'island-map.presence.v1';
const CHAT_KEY = 'island-map.chat.v1';
const CHANNEL = 'island-map.live';

let me = null;
let onPeers = null;
let onChat = null;
let timer = null;
let bc = null;
let adapter = null;
let lastState = { x: 0, z: 0, ry: 0 };

// 跨分頁廣播和定時輪詢是兩條路，同一則訊息會送兩次。
// 記住看過的 id，重複的就丟掉。
const seenChat = new Set();

function deliverChat(msgs) {
  const fresh = [];
  for (const m of msgs) {
    const key = m?.id ?? `${m?.from}-${m?.at}`;
    if (!key || seenChat.has(key)) continue;
    seenChat.add(key);
    fresh.push(m);
  }
  // 不要讓這個集合無限長大
  if (seenChat.size > 400) {
    for (const k of [...seenChat].slice(0, 200)) seenChat.delete(k);
  }
  if (fresh.length) onChat?.(fresh);
}

const now = () => Date.now();

// ------------------------------------------------------------
//  模式一：同一台電腦的不同分頁
// ------------------------------------------------------------
const localAdapter = {
  init() {
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e) => {
        const m = e.data;
        if (!m || m.from === me.id) return;
        if (m.type === 'chat') deliverChat([m.msg]);
        if (m.type === 'bye') {
          const map = readPresence();
          delete map[m.from];
          writePresence(map);
          onPeers?.(peersFrom(map));
        }
      };
    } catch {
      bc = null;     // 很舊的瀏覽器沒有這個，靠輪詢也能動
    }
  },

  async publish(state) {
    const map = readPresence();
    map[me.id] = { id: me.id, char: me.char, name: me.name, ...state, at: now() };
    prune(map);
    writePresence(map);
    bc?.postMessage({ type: 'ping', from: me.id });
  },

  async fetchPeers() {
    const map = readPresence();
    prune(map);
    return peersFrom(map);
  },

  async send(msg) {
    const list = readChat();
    list.push(msg);
    writeChat(list.slice(-40));
    bc?.postMessage({ type: 'chat', from: me.id, msg });
  },

  async fetchChat(sinceAt) {
    return readChat().filter((m) => m.at > sinceAt && m.from !== me.id);
  },

  bye() {
    const map = readPresence();
    delete map[me.id];
    writePresence(map);
    bc?.postMessage({ type: 'bye', from: me.id });
  },
};

// ------------------------------------------------------------
//  模式二：真的連線（Supabase）
//
//  用五張表：presence（誰在哪）、chat（聊天）、
//  energy（神木能量）、board（公佈欄）、gems（鑽石）。
//  這裡只管前兩張，後面三張各自在自己的檔案裡。
// ------------------------------------------------------------
const remoteAdapter = {
  init() {},

  async publish(state) {
    // 同一個 id 就覆蓋，所以每次回報都是更新自己那一列
    await DB.insert('presence', {
      id: me.id,
      ch: me.char,
      name: me.name,
      x: state.x ?? 0,
      z: state.z ?? 0,
      ry: state.ry ?? 0,
      at: new Date().toISOString(),
    }, { upsert: true });
  },

  async fetchPeers() {
    // 只要最近還有動靜的人
    const since = new Date(now() - NET.peerTimeout).toISOString();
    const rows = await DB.select(
      'presence',
      `select=*&at=gte.${since}&limit=60`
    );
    if (!rows) return [];        // 連不上就當作現在沒看到別人，不要讓畫面壞掉
    return rows
      .filter((r) => r.id !== me.id)
      .map((r) => ({
        id: r.id,
        char: r.ch,
        name: r.name,
        x: r.x,
        z: r.z,
        ry: r.ry,
        at: Date.parse(r.at),
      }));
  },

  async send(msg) {
    await DB.insert('chat', {
      id: msg.id,
      from_id: msg.from,
      name: msg.name,
      ch: msg.char,
      body: msg.text,
      at: new Date(msg.at).toISOString(),
    });
  },

  async fetchChat(sinceAt) {
    const since = new Date(sinceAt).toISOString();
    const rows = await DB.select(
      'chat',
      `select=*&at=gt.${since}&order=at.asc&limit=30`
    );
    if (!rows) return [];
    return rows
      .filter((r) => r.from_id !== me.id)
      .map((r) => ({
        id: r.id,
        from: r.from_id,
        name: r.name,
        char: r.ch,
        text: r.body,
        at: Date.parse(r.at),
      }));
  },

  bye() {
    // 權限規則刻意不給刪除，所以改成把時間戳往回推，
    // 下一次別人來拿名單時就會自動把你濾掉。
    const old = new Date(now() - 600000).toISOString();
    DB.update('presence', `id=eq.${encodeURIComponent(me.id)}`, { at: old });
  },
};


// ------------------------------------------------------------
//  共用：讀寫本機的暫存
// ------------------------------------------------------------
function readPresence() {
  try { return JSON.parse(localStorage.getItem(PRESENCE_KEY) || '{}') || {}; }
  catch { return {}; }
}
function writePresence(map) {
  try { localStorage.setItem(PRESENCE_KEY, JSON.stringify(map)); } catch {}
}
function readChat() {
  try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]') || []; }
  catch { return []; }
}
function writeChat(list) {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(list)); } catch {}
}

function prune(map) {
  const t = now();
  for (const k of Object.keys(map)) {
    if (t - (map[k].at ?? 0) > NET.peerTimeout) delete map[k];
  }
}

function peersFrom(map) {
  return Object.values(map).filter((p) => p.id !== me.id);
}

// ------------------------------------------------------------
//  對外
// ------------------------------------------------------------
// 本機模式：同一個瀏覽器的分頁共用 localStorage，身分會撞在一起。
// sessionStorage 是「每個分頁各一份」，拿它做一個分頁代號，
// 兩個分頁就會被當成兩個人 —— 這樣才驗得出整套同步是通的。
function tabSuffix() {
  try {
    let t = sessionStorage.getItem('island-map.tab');
    if (!t) {
      t = Math.random().toString(36).slice(2, 7);
      sessionStorage.setItem('island-map.tab', t);
    }
    return t;
  } catch {
    return 'tab';
  }
}

export function start(opts) {
  me = opts.me;
  onPeers = opts.onPeers;
  onChat = opts.onChat;

  // 有設定 Supabase 才走連線模式，沒有就退回本機，不要整個壞掉
  adapter = NET.mode === 'remote' && DB.enabled() ? remoteAdapter : localAdapter;

  // 真的連線時 id 就是訪客 id；本機模式才加分頁代號
  if (adapter === localAdapter) {
    me = { ...me, id: `${me.id}#${tabSuffix()}` };
  }

  adapter.init();

  let lastChatAt = now();

  const tick = async () => {
    await adapter.publish(lastState);
    const peers = await adapter.fetchPeers();
    onPeers?.(peers);

    const msgs = await adapter.fetchChat(lastChatAt);
    if (msgs.length) {
      lastChatAt = Math.max(...msgs.map((m) => m.at));
      deliverChat(msgs);
    }
  };

  tick();
  timer = setInterval(tick, NET.publishEvery);

  // 關分頁時跟大家說一聲，別人就不用等 30 秒才看到你消失
  window.addEventListener('pagehide', () => adapter?.bye());
}

// 把自己現在的位置記下來，下一次 tick 會一起送出去
export function setState(state) {
  lastState = { ...lastState, ...state };
}

export function say(text, who) {
  const body = String(text || '').trim().slice(0, NET.chatLimit);
  if (!body || !me) return null;
  const msg = {
    id: `${me.id}-${now()}`,
    from: me.id,
    name: who?.name ?? me.name,
    char: who?.char ?? me.char,
    text: body,
    at: now(),
  };
  seenChat.add(msg.id);
  adapter?.send(msg);
  return msg;
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  adapter?.bye();
  try { bc?.close(); } catch {}
}

export function whoAmI() {
  return me;
}

export function mode() {
  return adapter === remoteAdapter ? 'remote' : 'local';
}

// 測試用：清掉這台電腦上的暫存
export function reset() {
  try {
    localStorage.removeItem(PRESENCE_KEY);
    localStorage.removeItem(CHAT_KEY);
  } catch {}
}
