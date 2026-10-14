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
//  模式二：真的連線（填上網址就會動）
//
//  伺服器那邊只要做兩件事：
//    POST <endpoint>/state   收下 {id,char,name,x,z,ry}，記下來、記時間
//    GET  <endpoint>/state   回傳 { peers:[...], chat:[...] }
//  用 Google Apps Script、Vercel 的 Serverless、Supabase 都行。
// ------------------------------------------------------------
const remoteAdapter = {
  init() {},

  async publish(state) {
    await post('/state', { ...me, ...state, at: now() });
  },

  async fetchPeers() {
    const data = await get('/state');
    return (data?.peers ?? []).filter((p) => p.id !== me.id && now() - (p.at ?? 0) < NET.peerTimeout);
  },

  async send(msg) {
    await post('/chat', msg);
  },

  async fetchChat(sinceAt) {
    const data = await get('/state');
    return (data?.chat ?? []).filter((m) => m.at > sinceAt && m.from !== me.id);
  },

  bye() {
    // 關分頁時送不出去也沒關係，對方那邊 30 秒後會自己過期
    try {
      navigator.sendBeacon?.(NET.endpoint + '/bye', JSON.stringify({ id: me.id }));
    } catch {}
  },
};

async function post(path, body) {
  try {
    await fetch(NET.endpoint + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // 連不上就安靜地跳過，畫面照樣要能走
  }
}

async function get(path) {
  try {
    const r = await fetch(NET.endpoint + path);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

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

  adapter = NET.mode === 'remote' && NET.endpoint ? remoteAdapter : localAdapter;

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
