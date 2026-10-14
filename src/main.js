// ============================================================
//  島嶼地圖 —— 固定視角的大地圖，點建築進入室內小場景
//  由 Claude 建立 2026-10-14
//
//  這支負責：開畫面、管場景切換、接上互動。
//  要改場景內容請改 config.js，不用動這裡。
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { SCENES, START_SCENE, HOME_SCENE, NAMING, EMOTIONS, TREE, CHARACTERS, AVATAR, NET, BROADCAST, ZOOM, GEMS, SKY, LIGHTS } from './config.js';
import { buildPlaceholder, makeNoticeBoard as buildNoticeBoard } from './placeholder.js';
import { Interaction, Ripples, collectTargets } from './interact.js';
import { buildSacredTree, updateBalls } from './tree.js';
import * as Energy from './energy.js';
import * as Board from './board.js';
import * as Fortune from './fortune.js';
import * as Visitor from './visitor.js';
import { buildCharacter, Walker } from './character.js';
import * as Net from './net.js';
import * as Gems from './gems.js';
import { GemField } from './gems.js';

// ---- 介面元件 ----
const wrap     = document.getElementById('canvas-wrap');
const tipEl    = document.getElementById('tip') ?? makeTip();
const placeEl  = document.querySelector('#place .name');
const backEl   = document.getElementById('back');
const hintEl   = document.getElementById('hint');
const veilEl   = document.getElementById('veil');
const veilMsg  = veilEl.querySelector('.veil-msg');
const oopsEl   = document.getElementById('oops');
const oopsWhy  = document.getElementById('oops-why');
const oopsCode = document.getElementById('oops-detail');

function makeTip() {
  const d = document.createElement('div');
  d.id = 'tip';
  document.body.appendChild(d);
  return d;
}

const sceneNames = Object.fromEntries(
  Object.entries(SCENES).map(([id, s]) => [id, s.name])
);

// 視窗尺寸：最少算 1，避免視窗被縮到 0 的時候相機算出 NaN（畫面會整個不見）
const vw = () => Math.max(window.innerWidth, 1);
const vh = () => Math.max(window.innerHeight, 1);

// ---- 繪圖器 ----
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(vw(), vh());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = SKY.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
wrap.appendChild(renderer.domElement);

// ---- 場景與鏡頭 ----
const scene = new THREE.Scene();
const skyTex = makeSkyTexture();
scene.background = skyTex;
scene.fog = new THREE.Fog(new THREE.Color(SKY.fog), SKY.fogNear, SKY.fogFar);

const camera = new THREE.PerspectiveCamera(
  30, vw() / vh(), 0.1, 200
);

// 環境光源（讓材質有基本的反射，不然模型會看起來很平）
const pmrem = new THREE.PMREMGenerator(renderer);
// 用夕陽天空本身當反射環境，金屬、水面才會映到粉色的光
scene.environment = pmrem.fromEquirectangular(skyTex).texture;

const hemi = new THREE.HemisphereLight(
  new THREE.Color(LIGHTS.skyColor),
  new THREE.Color(LIGHTS.groundColor),
  LIGHTS.ambientIntensity
);
scene.add(hemi);

const sun = new THREE.DirectionalLight(new THREE.Color(LIGHTS.sunColor), LIGHTS.sunIntensity);
sun.position.set(...LIGHTS.sunPos);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.bias = -0.0006;
scene.add(sun);

// 夕陽是單邊光，背光面會黑掉。補一盞冷色的，形狀才看得出來。
const fill = new THREE.DirectionalLight(new THREE.Color(LIGHTS.fillColor), LIGHTS.fillIntensity);
fill.position.set(...LIGHTS.fillPos);
scene.add(fill);

// 由上往下的漸層天空，純程式生成（不需要外部圖檔）
function makeSkyTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // 由上到下的夕陽漸層
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0.0, SKY.top);
  grd.addColorStop(0.42, SKY.mid);
  grd.addColorStop(0.62, SKY.horizon);
  grd.addColorStop(0.72, SKY.mid);
  grd.addColorStop(1.0, SKY.bottom);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // 天空裡的太陽：一團暖色光暈。
  // 這張圖同時拿去當反射環境，所以金屬和水面會真的映到這顆太陽。
  const sx = SKY.sunX * W;
  const sy = SKY.sunY * H;
  const sr = SKY.sunSize * H;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
  glow.addColorStop(0.0, SKY.sunColor);
  glow.addColorStop(0.18, SKY.sunColor);
  glow.addColorStop(0.55, 'rgba(255, 190, 150, 0.35)');
  glow.addColorStop(1.0, 'rgba(255, 170, 150, 0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

// ---- 互動 ----
const ripples = new Ripples(scene);

// 滑過 panel_ 物件時要顯示什麼字
const PANEL_LABELS = { tree: '餵神木', board: '看公佈欄', fortune: '今日運氣', broadcast: '看轉播' };

const interaction = new Interaction({
  camera,
  naming: NAMING,
  tipEl,
  panelLabels: PANEL_LABELS,
  onEnter: (id) => {
    if (!SCENES[id]) {
      console.warn(`[島嶼地圖] 找不到場景代號「${id}」，請檢查 config.js 或 Blender 裡的物件名稱`);
      return;
    }
    go(id);
  },
  onPanel: (id) => {
    if (id === 'tree') openTreePanel();
    else if (id === 'board') openBoardPanel();
    else if (id === 'fortune') openFortunePanel();
    else if (id === 'broadcast') openTvPanel();
  },
  onHit: (hit) => {
    // 點到鑽石泡泡就收下，不要當成點地面
    const gem = gemFrom(hit.object);
    if (gem) { collectGem(gem); return; }

    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      : null;
    // 掛在「會漂浮的那一層」底下，波紋才會跟著島一起上下飄，不會脫節
    ripples.spawn(hit.point, normal, floatingAncestorOf(hit.object));

    // 點在主島上 → 角色走過去
    if (walker && avatar?.parent) {
      const local = avatar.parent.worldToLocal(hit.point.clone());
      walker.setTarget(local);
    }
  },
});

// ---- 場景切換 ----
const loader = new GLTFLoader();
let currentId = null;
let currentRoot = null;
let switching = false;

function disposeTree(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}

let camFov = 32;   // config 裡設定的基準視角

// 直立或很窄的畫面（手機）如果照原本的視角算，左右會被裁掉。
// 改成「以左右看得到的範圍為準」，畫面越窄就自動拉得越遠。
function fitFov() {
  const aspect = vw() / vh();
  if (aspect >= 1) return camFov;
  const half = (camFov * Math.PI) / 360;
  const wide = (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI;
  return Math.min(wide, 78);            // 太廣會變魚眼，設個上限
}

function applyCamera(cfg) {
  camFov = cfg.fov ?? 32;
  camera.fov = fitFov();
  camera.position.set(...cfg.position);
  camera.lookAt(new THREE.Vector3(...cfg.target));
  camera.updateProjectionMatrix();
  resetZoom(cfg);
}

async function buildSceneRoot(def) {
  if (!def.model) return buildPlaceholder(def.placeholder, def);

  const gltf = await loader.loadAsync(def.model);
  const root = gltf.scene;

  // 讓匯入的模型吃得到陰影
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}

async function go(id, { instant = false } = {}) {
  if (switching || id === currentId) return;
  const def = SCENES[id];
  if (!def) return;

  switching = true;
  interaction.enabled = false;
  interaction.clearHover();

  if (!instant) {
    veilMsg.textContent = `前往　${def.name}`;
    veilEl.classList.remove('hide');
    await wait(420);
  }

  ripples.clear();
  if (tvPanel.classList.contains('on')) closeTvPanel();
  releaseScreen();

  if (currentRoot) {
    scene.remove(currentRoot);
    disposeTree(currentRoot);
    currentRoot = null;
  }

  try {
    currentRoot = await buildSceneRoot(def);
  } catch (err) {
    showOops(def, err);
    switching = false;
    return;
  }

  scene.add(currentRoot);
  applyCamera(def.camera);

  interaction.setTargets(collectTargets(currentRoot, NAMING));

  // 這個場景能不能拖？波紋也要掛到會轉的這一層，才會跟著一起轉。
  drag.cfg = def.drag ?? null;
  drag.active = false;
  drag.pending = false;
  drag.speed = 0;
  drag.blockClick = false;
  ripples.setParent(currentRoot);
  setDragCursor();

  floatCfg = def.float ?? null;
  floaters = floatCfg ? collectFloaters(currentRoot, NAMING) : [];

  flowCfg = def.flow ?? null;
  flows = flowCfg ? collectFlows(currentRoot, NAMING) : [];

  ballGroup = currentRoot.getObjectByName('今日能量球') ?? null;
  bindScreen();

  // 泡泡掛在主島底下，拖轉島的時候會跟著轉
  if (GEMS.enabled && def.isOutdoor) {
    let main = null;
    currentRoot.traverse((o) => { if (o.name === 'float_主島') main = o; });
    gemField.setParent(main);
    renderGemCount(false);
  } else {
    gemField.setParent(null);
    gemChip.classList.remove('on');
  }
  document.body.classList.toggle('indoor', !def.isOutdoor);

  // 角色只存在於島上，進室內就收起來
  clearAvatar();
  clearPeers();
  if (def.isOutdoor) spawnAvatar();

  currentId = id;
  placeEl.textContent = def.name;
  backEl.classList.toggle('on', !def.isOutdoor);
  hintEl.style.display = def.isOutdoor ? '' : 'none';

  await wait(60);
  veilEl.classList.add('hide');
  interaction.enabled = true;
  switching = false;
}

function showOops(def, err) {
  veilEl.classList.add('hide');
  oopsEl.classList.add('on');
  oopsWhy.innerHTML = `
    場景「${def.name}」的模型讀不到。<br>
    請確認 <b>models</b> 資料夾裡真的有這個檔案，檔名大小寫也要一樣。<br>
    如果檔案在，可能是匯出時沒勾「<b>+Y Up</b>」或檔案壞了，重新匯出一次。
  `;
  oopsCode.textContent = `要找的檔案：${def.model}\n${err?.message ?? err}`;
  console.error('[島嶼地圖] 載入失敗', err);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let ballGroup = null;   // 今天那些浮在樹幹旁邊的能量球

function buildTreeFromLedger(ledger) {
  return buildSacredTree(Energy.summarise(ledger), Energy.todayEntries(ledger));
}

// ---- 神木的投球面板 ----
const treePanel = document.getElementById('tree-panel');
const emotionsEl = document.getElementById('emotions');
const noteEl = document.getElementById('note');
const noteCountEl = document.getElementById('note-count');
const throwBtn = document.getElementById('throw');
const treeStatsEl = document.getElementById('tree-stats');

let chosenEmotion = null;

// 情緒按鈕：顏色直接吃 config 的設定，不寫死在 HTML 裡
function buildEmotionButtons() {
  emotionsEl.innerHTML = '';
  for (const e of EMOTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'emo';
    b.style.color = '#' + e.color.toString(16).padStart(6, '0');
    b.innerHTML = `<span class="orb"></span><span class="label">${e.name}</span>`;
    b.addEventListener('click', () => {
      chosenEmotion = e.id;
      [...emotionsEl.children].forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      throwBtn.disabled = false;
      throwBtn.textContent = `把「${e.name}」丟進去`;
    });
    emotionsEl.appendChild(b);
  }
}

function renderTreeStats() {
  const list = Energy.load();
  const s = Energy.summarise(list);
  const todayN = Energy.todayEntries(list).length;

  if (s.total === 0) {
    treeStatsEl.innerHTML = '還沒有人餵過它。你會是第一顆。';
    return;
  }

  const top = Object.entries(s.byEmotion).sort((a, b) => b[1] - a[1])[0];
  const topName = EMOTIONS.find((e) => e.id === top[0])?.name ?? top[0];
  treeStatsEl.innerHTML =
    `累積 <b>${s.total}</b> 顆能量，養了 <b>${s.days}</b> 天。<br>` +
    `今天掛在樹上的有 <b>${todayN}</b> 顆，最多的情緒是<b>${topName}</b>。`;
}

function openTreePanel() {
  buildEmotionButtons();
  chosenEmotion = null;
  noteEl.value = '';
  noteCountEl.textContent = '0';
  throwBtn.disabled = true;
  throwBtn.textContent = '先選一個情緒';

  const thrown = TREE.oneBallPerDay && Energy.hasThrownToday();
  treePanel.classList.toggle('thrown', thrown);
  renderTreeStats();
  treePanel.classList.add('on');
  interaction.enabled = false;
}

function closeTreePanel() {
  treePanel.classList.remove('on');
  interaction.enabled = true;
}

noteEl?.addEventListener('input', () => {
  noteCountEl.textContent = String(noteEl.value.length);
});

throwBtn?.addEventListener('click', () => {
  if (!chosenEmotion) return;
  Energy.push({ emotion: chosenEmotion, text: noteEl.value.trim() });
  regrowTree();
  treePanel.classList.add('thrown');
  renderTreeStats();
});

treePanel?.querySelector('.close')?.addEventListener('click', closeTreePanel);
treePanel?.addEventListener('click', (e) => {
  if (e.target === treePanel) closeTreePanel();   // 點面板外面也能關
});

// 投完球之後，整棵樹重長一次（能量變了，形狀就會變）
function regrowTree() {
  if (!currentRoot) return;
  let islet = null;
  currentRoot.traverse((o) => { if (o.name === 'float_神木島') islet = o; });
  if (!islet) return;

  const old = islet.children.find((c) => c.name === 'panel_tree');
  if (old) {
    islet.remove(old);
    disposeTree(old);
  }

  const ledger = Energy.load();
  const fresh = buildTreeFromLedger(ledger);
  islet.add(fresh);

  // 樹換了，可以被點的清單跟球的動畫都要重新抓
  interaction.setTargets(collectTargets(currentRoot, NAMING));
  ballGroup = fresh.getObjectByName('今日能量球') ?? null;
}

// ---- 公佈欄 ----
const boardPanel = document.getElementById('board-panel');
const msgListEl = document.getElementById('msg-list');
const msgNameEl = document.getElementById('msg-name');
const msgTextEl = document.getElementById('msg-text');
const msgCountEl = document.getElementById('msg-count');
const msgSendEl = document.getElementById('msg-send');

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

function renderMessages() {
  const list = Board.load();
  const rows = Board.recent(list);

  if (!rows.length) {
    msgListEl.innerHTML =
      '<div class="msg-empty">還沒有人留話。<br>第一張便條紙由你來貼。</div>';
  } else {
    msgListEl.innerHTML = '';
    for (const m of rows) {
      const el = document.createElement('div');
      el.className = 'msg' + (m.mine ? ' mine' : '');
      el.innerHTML = `
        <div class="head">
          <span class="who">${escapeHtml(m.n)}${m.mine ? '（你）' : ''}</span>
          <span class="when">${timeAgo(m.at)}</span>
        </div>
        <div class="body">${escapeHtml(m.t)}</div>
        <button class="cheer${m.cheered ? ' on' : ''}" type="button" data-id="${m.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"></path>
          </svg>
          <span>${m.up ?? 0}</span>
        </button>`;
      msgListEl.appendChild(el);
    }
  }

  boardPanel.classList.toggle('full', !Board.canPost(list));
}

// 留言是別人打的字，直接塞進 HTML 會出事，先把標籤符號換掉
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function openBoardPanel() {
  msgTextEl.value = '';
  msgCountEl.textContent = '0';
  msgSendEl.disabled = true;
  renderMessages();
  boardPanel.classList.add('on');
  interaction.enabled = false;
}

function closeBoardPanel() {
  boardPanel.classList.remove('on');
  interaction.enabled = true;
}

msgTextEl?.addEventListener('input', () => {
  msgCountEl.textContent = String(msgTextEl.value.length);
  msgSendEl.disabled = msgTextEl.value.trim().length === 0;
});

msgSendEl?.addEventListener('click', () => {
  if (!msgTextEl.value.trim()) return;
  Board.post({ name: msgNameEl.value, text: msgTextEl.value });
  msgTextEl.value = '';
  msgCountEl.textContent = '0';
  msgSendEl.disabled = true;
  renderMessages();
  rebuildNoticeBoard();      // 板子上的便條紙要跟著變多
});

msgListEl?.addEventListener('click', (e) => {
  const btn = e.target.closest('.cheer');
  if (!btn || btn.classList.contains('on')) return;
  Board.cheer(btn.dataset.id);
  renderMessages();
});

boardPanel?.querySelector('.close')?.addEventListener('click', closeBoardPanel);
boardPanel?.addEventListener('click', (e) => {
  if (e.target === boardPanel) closeBoardPanel();
});

// 留言數變了 → 木架上的便條紙重貼一次
function rebuildNoticeBoard() {
  if (!currentRoot) return;
  let islet = null;
  currentRoot.traverse((o) => { if (o.name === 'float_神木島') islet = o; });
  if (!islet) return;

  const old = islet.children.find((c) => c.name === 'panel_board');
  if (!old) return;

  const pos = old.position.clone();
  const rot = old.rotation.clone();
  islet.remove(old);
  disposeTree(old);

  const fresh = buildNoticeBoard(Board.count());
  fresh.position.copy(pos);
  fresh.rotation.copy(rot);
  islet.add(fresh);

  interaction.setTargets(collectTargets(currentRoot, NAMING));
}

// ---- 運氣小卡（望遠鏡）----
const fortunePanel = document.getElementById('fortune-panel');
const fortuneCard = document.getElementById('fortune-card');
const fortuneName = document.getElementById('fortune-name');
const fortuneLine = document.getElementById('fortune-line');
const fortuneLead = document.getElementById('fortune-lead');
const fortuneDraw = document.getElementById('fortune-draw');

function showCard(card) {
  const hex = '#' + card.hue.toString(16).padStart(6, '0');
  fortuneName.textContent = card.name;
  fortuneLine.textContent = card.line;
  fortuneCard.style.setProperty('--card-hue', hex);
}

function openFortunePanel() {
  const drawn = Fortune.drawnToday();
  fortunePanel.classList.toggle('drawn', drawn);

  if (drawn) {
    showCard(Fortune.cardOfToday().card);
    fortuneCard.classList.add('flipped');
    fortuneLead.textContent = '今天你看到的是這張。';
  } else {
    fortuneCard.classList.remove('flipped');
    fortuneLead.textContent = '對著望遠鏡看看今天。';
  }

  fortunePanel.classList.add('on');
  interaction.enabled = false;
}

function closeFortunePanel() {
  fortunePanel.classList.remove('on');
  interaction.enabled = true;
}

function doDraw() {
  if (Fortune.drawnToday()) return;
  showCard(Fortune.draw());
  fortuneCard.classList.add('flipped');
  fortunePanel.classList.add('drawn');
  fortuneLead.textContent = '今天你看到的是這張。';
}

fortuneDraw?.addEventListener('click', doDraw);
fortuneCard?.addEventListener('click', doDraw);   // 直接點卡也能翻

fortunePanel?.querySelector('.close')?.addEventListener('click', closeFortunePanel);
fortunePanel?.addEventListener('click', (e) => {
  if (e.target === fortunePanel) closeFortunePanel();
});

// ---- 代表角色：選角 + 走路 ----
const joinPanel = document.getElementById('join-panel');
const charsEl = document.getElementById('chars');
const joinNameEl = document.getElementById('join-name');
const joinGoEl = document.getElementById('join-go');
const whoEl = document.getElementById('who');
const tagsEl = document.getElementById('tags');

let me = null;          // 目前的訪客身分
let avatar = null;      // 場上的角色物件
let walker = null;      // 走路控制
let myTag = null;       // 頭頂名牌
let pickedChar = null;

// 選角按鈕上的小圖示，照角色顏色畫（介面不用 emoji）
function charIcon(def) {
  const body = '#' + def.color.toString(16).padStart(6, '0');
  const acc = '#' + def.accent.toString(16).padStart(6, '0');
  const top = {
    ears:  `<rect x="13" y="2" width="4" height="10" rx="2" fill="${body}"/>
            <rect x="21" y="2" width="4" height="10" rx="2" fill="${body}"/>`,
    block: `<rect x="11" y="3" width="16" height="12" rx="2" fill="${body}"/>`,
    hat:   `<path d="M19 1 27 13H11z" fill="${acc}"/>`,
    bird:  `<path d="M19 4 22 9h-6z" fill="${acc}"/>
            <path d="M26 17 32 20l-6 3z" fill="${acc}"/>`,
    ghost: '',
    round: `<circle cx="19" cy="8" r="4" fill="${acc}"/>`,
  }[def.shape] ?? '';

  const feet = def.shape === 'ghost'
    ? `<path d="M11 30q8 6 16 0v4q-8 5-16 0z" fill="${body}" opacity="0.85"/>`
    : `<circle cx="14" cy="35" r="3" fill="${acc}"/><circle cx="24" cy="35" r="3" fill="${acc}"/>`;

  return `<svg viewBox="0 0 38 40" aria-hidden="true">${top}
    <rect x="8" y="12" width="22" height="20" rx="10" fill="${body}"/>
    <circle cx="15" cy="21" r="1.7" fill="#2b2b33"/>
    <circle cx="23" cy="21" r="1.7" fill="#2b2b33"/>
    ${feet}</svg>`;
}

function buildCharButtons(selectedId) {
  charsEl.innerHTML = '';
  for (const def of CHARACTERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'char' + (def.id === selectedId ? ' sel' : '');
    b.innerHTML = charIcon(def) + `<span>${def.name}</span>`;
    b.addEventListener('click', () => {
      pickedChar = def.id;
      [...charsEl.children].forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      joinGoEl.disabled = false;
      joinGoEl.textContent = me ? '換成這隻' : '就決定是你了';
    });
    charsEl.appendChild(b);
  }
}

function openJoinPanel() {
  pickedChar = me?.char ?? null;
  buildCharButtons(pickedChar);
  joinNameEl.value = me?.name && me.name !== '訪客' ? me.name : '';
  joinGoEl.disabled = !pickedChar;
  joinGoEl.textContent = pickedChar ? (me ? '換成這隻' : '就決定是你了') : '先選一個角色';
  joinPanel.classList.add('on');
  interaction.enabled = false;
}

function closeJoinPanel() {
  joinPanel.classList.remove('on');
  interaction.enabled = true;
}

joinGoEl?.addEventListener('click', () => {
  if (!pickedChar) return;
  me = me
    ? Visitor.update({ char: pickedChar, name: joinNameEl.value })
    : Visitor.join({ char: pickedChar, name: joinNameEl.value });
  closeJoinPanel();
  renderWho();
  spawnAvatar();
  startNet();
});

whoEl?.addEventListener('click', openJoinPanel);
joinPanel?.querySelector('.close')?.addEventListener('click', () => {
  if (me) closeJoinPanel();     // 還沒選過就不給關，不然沒有角色可以走
});

function renderWho() {
  if (!me) { whoEl.classList.remove('on'); return; }
  const def = Visitor.charOf(me);
  whoEl.style.color = '#' + def.color.toString(16).padStart(6, '0');
  whoEl.querySelector('.who-name').textContent = `${me.name}　${def.name}`;
  whoEl.classList.add('on');
}

// 把角色放到主島上
function spawnAvatar() {
  if (!me || !currentRoot) return;

  let main = null;
  currentRoot.traverse((o) => { if (o.name === 'float_主島') main = o; });
  if (!main) return;                       // 室內場景沒有角色

  const keep = avatar ? avatar.position.clone() : new THREE.Vector3(0, 0, 3.4);
  if (avatar) { main.remove(avatar); disposeTree(avatar); }

  avatar = buildCharacter(Visitor.charOf(me));
  avatar.position.copy(keep);
  avatar.name = 'avatar_me';
  main.add(avatar);
  walker = new Walker(avatar);

  if (!myTag) {
    myTag = document.createElement('div');
    myTag.className = 'tag me';
    tagsEl.appendChild(myTag);
  }
  myTag.textContent = me.name;
  myTag.style.display = '';
}

function clearAvatar() {
  avatar = null;
  walker = null;
  if (myTag) myTag.style.display = 'none';
}

// 每格把名牌貼到角色頭頂（3D 位置換算成畫面座標）
const tagVec = new THREE.Vector3();
function updateTags() {
  if (!avatar || !myTag || myTag.style.display === 'none') return;
  avatar.getWorldPosition(tagVec);
  tagVec.y += 1.25 * AVATAR.scale + 0.45;
  tagVec.project(camera);

  // 轉到鏡頭背後就不要畫
  if (tagVec.z > 1) { myTag.style.opacity = '0'; return; }
  myTag.style.opacity = '1';
  myTag.style.left = `${(tagVec.x * 0.5 + 0.5) * vw()}px`;
  myTag.style.top = `${(-tagVec.y * 0.5 + 0.5) * vh()}px`;
}

// ---- 連線：別人的角色 + 聊天 ----
const chatEl = document.getElementById('chat');
const chatLogEl = document.getElementById('chat-log');
const chatInputEl = document.getElementById('chat-input');

const peers = new Map();      // id -> { obj, target, data, tag }
let peerRoot = null;          // 別人的角色都掛在這底下
let netStarted = false;

function ensurePeerRoot() {
  if (!currentRoot) return null;
  let main = null;
  currentRoot.traverse((o) => { if (o.name === 'float_主島') main = o; });
  if (!main) return null;

  if (!peerRoot || peerRoot.parent !== main) {
    peerRoot = new THREE.Group();
    peerRoot.name = '其他人_nohit';     // 別人的角色不擋射線，不然會點不到地面
    main.add(peerRoot);
  }
  return peerRoot;
}

function charDefOf(id) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

function makeTag(cls) {
  const d = document.createElement('div');
  d.className = 'tag' + (cls ? ' ' + cls : '');
  tagsEl.appendChild(d);
  return d;
}

function applyPeers(list) {
  const root = ensurePeerRoot();
  if (!root) return;

  const seen = new Set();

  for (const p of list) {
    if (!p?.id) continue;
    seen.add(p.id);

    let entry = peers.get(p.id);

    // 新的人，或是他換角色了 → 重做一隻
    if (!entry || entry.data.char !== p.char) {
      if (entry) { root.remove(entry.obj); disposeTree(entry.obj); }
      const obj = buildCharacter(charDefOf(p.char));
      obj.position.set(p.x ?? 0, 0, p.z ?? 0);
      obj.rotation.y = p.ry ?? 0;
      root.add(obj);
      entry = {
        obj,
        target: new THREE.Vector3(p.x ?? 0, 0, p.z ?? 0),
        targetRy: p.ry ?? 0,
        data: p,
        tag: entry?.tag ?? makeTag(),
      };
      peers.set(p.id, entry);
    }

    entry.data = p;
    entry.target.set(p.x ?? 0, 0, p.z ?? 0);
    entry.targetRy = p.ry ?? 0;
    entry.tag.textContent = p.name || '訪客';
  }

  // 不在名單裡的人 = 走了
  for (const [id, entry] of peers) {
    if (seen.has(id)) continue;
    root.remove(entry.obj);
    disposeTree(entry.obj);
    entry.tag.remove();
    peers.delete(id);
  }
}

// 每格把別人的角色往他回報的位置補一點，這樣就不會一格一格跳
function updatePeers(dt) {
  const k = Math.min(1, (NET.lerpSpeed ?? 3.2) * dt);
  for (const entry of peers.values()) {
    const o = entry.obj;
    o.position.lerp(entry.target, k);

    let diff = entry.targetRy - o.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    o.rotation.y += diff * k;
  }
}

const peerVec = new THREE.Vector3();
function updatePeerTags() {
  for (const entry of peers.values()) {
    const t = entry.tag;
    if (!t) continue;
    entry.obj.getWorldPosition(peerVec);
    peerVec.y += 1.25 * AVATAR.scale + 0.45;
    peerVec.project(camera);
    if (peerVec.z > 1) { t.style.opacity = '0'; continue; }
    t.style.opacity = '1';
    t.style.left = `${(peerVec.x * 0.5 + 0.5) * vw()}px`;
    t.style.top = `${(-peerVec.y * 0.5 + 0.5) * vh()}px`;
  }
}

function clearPeers() {
  for (const [, entry] of peers) {
    entry.obj.parent?.remove(entry.obj);
    disposeTree(entry.obj);
    entry.tag?.remove();
  }
  peers.clear();
  peerRoot = null;
}

// ---- 聊天 ----
function addChatLine(msg, mine) {
  const def = charDefOf(msg.char);
  const el = document.createElement('div');
  el.className = 'chat-line';
  el.style.setProperty('--chat-hue', '#' + def.color.toString(16).padStart(6, '0'));
  el.innerHTML = `<span class="who">${escapeHtml(msg.name || '訪客')}${mine ? '（你）' : ''}</span>`
    + `<span class="what">${escapeHtml(msg.text)}</span>`;
  chatLogEl.appendChild(el);

  while (chatLogEl.children.length > (NET.chatShow ?? 8)) {
    chatLogEl.firstChild.remove();
  }
  setTimeout(() => el.classList.add('faded'), NET.chatFade ?? 25000);
}

chatInputEl?.addEventListener('keydown', (e) => {
  e.stopPropagation();                      // 打字的時候別去觸發場景的快捷鍵
  if (e.key !== 'Enter') return;
  const text = chatInputEl.value.trim();
  if (!text) return;
  const msg = Net.say(text, me);
  if (msg) addChatLine(msg, true);
  chatInputEl.value = '';
});

chatInputEl?.addEventListener('blur', () => { /* 失焦就讓快捷鍵恢復 */ });

function startNet() {
  if (netStarted || !me) return;
  netStarted = true;
  chatEl.classList.add('on');

  Net.start({
    me,
    onPeers: (list) => applyPeers(list),
    onChat: (msgs) => msgs.forEach((m) => addChatLine(m, false)),
  });
}

let screenGroup = null;   // 房間牆上那台螢幕

function bindScreen() {
  screenGroup = currentRoot?.getObjectByName('panel_broadcast') ?? null;
}

function updateScreen(t) {
  screenGroup?.userData?.animateScreen?.(t);
}

// 離開房間時把貼在模型上的影片停掉，不然會一直在背景解碼吃效能
function releaseScreen() {
  const v = screenGroup?.userData?.video;
  if (v) { try { v.pause(); } catch {} }
  screenGroup = null;
}

// ---- 房間的轉播 ----
const tvPanel = document.getElementById('tv-panel');
const tvStage = document.getElementById('tv-stage');
const tvTitle = document.getElementById('tv-title');
const tvEmpty = document.getElementById('tv-empty');

// 網址或影片代號都接受，統一抽出代號
function youtubeId(src) {
  if (!src) return null;
  const s = String(src).trim();
  if (/^[\w-]{11}$/.test(s)) return s;            // 直接給代號
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function openTvPanel() {
  tvTitle.textContent = BROADCAST.title || '轉播';
  tvStage.querySelectorAll('iframe, video').forEach((n) => n.remove());

  const id = youtubeId(BROADCAST.youtube);

  if (id) {
    // 用 youtube-nocookie，對觀眾的隱私比較客氣
    const auto = BROADCAST.autoplay ? '1' : '0';
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=${auto}&rel=0&modestbranding=1`;
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture';
    f.allowFullscreen = true;
    f.title = BROADCAST.title || '轉播';
    tvStage.appendChild(f);
    tvEmpty.style.display = 'none';
  } else if (BROADCAST.fallbackVideo) {
    // 沒有直播就播預錄的（例如 Blender 輸出的 DJ 動畫）
    const v = document.createElement('video');
    v.src = BROADCAST.fallbackVideo;
    v.autoplay = true;
    v.loop = true;
    v.muted = true;
    v.playsInline = true;
    v.controls = true;
    tvStage.appendChild(v);
    tvEmpty.style.display = 'none';
  } else {
    tvEmpty.style.display = '';
  }

  tvPanel.classList.add('on');
  interaction.enabled = false;
}

function closeTvPanel() {
  // 一定要把 iframe 拿掉，不然關了面板影片還在背景播
  tvStage.querySelectorAll('iframe, video').forEach((n) => n.remove());
  tvPanel.classList.remove('on');
  interaction.enabled = true;
}

tvPanel?.querySelector('.close')?.addEventListener('click', closeTvPanel);
tvPanel?.addEventListener('click', (e) => {
  if (e.target === tvPanel) closeTvPanel();
});

// ---- 鑽石泡泡 ----
const gemChip = document.getElementById('gem-chip');
const gemCountEl = document.getElementById('gem-count');
const gemField = new GemField();
interaction.extra = gemField.pickables;   // 同一個陣列，泡泡增減會自動反映

function renderGemCount(got) {
  gemCountEl.textContent = String(Gems.load());
  gemChip.classList.add('on');
  if (got) {
    gemChip.classList.add('got');
    setTimeout(() => gemChip.classList.remove('got'), 220);
  }
}

// 從被射線打到的東西往上找，看它是不是一顆泡泡
function gemFrom(obj) {
  let n = obj;
  while (n) {
    if (n.userData?.isGem) return n;
    n = n.parent;
  }
  return null;
}

function collectGem(obj) {
  if (!gemField.pop(obj)) return false;
  Gems.add(1);
  renderGemCount(true);
  return true;
}

// ---- 滾輪縮放：對著游標指的地方拉近 ----
// 角度一直維持 config 裡設定的那個方向，只有「看哪裡」和「離多遠」會變，
// 所以固定視角的感覺不會跑掉。滾到底就回到一開始的全覽。
const zoom = {
  level: 0,                              // 現在（平滑後）0 = 全覽，1 = 最近
  wanted: 0,                             // 滾輪想要的
  focus: new THREE.Vector3(),            // 現在對著哪裡
  wantedFocus: new THREE.Vector3(),      // 想對著哪裡
  baseTarget: new THREE.Vector3(),       // 全覽時看的位置
  dir: new THREE.Vector3(0, 1, 1),       // 鏡頭方向（固定）
  baseDist: 10,
};

function resetZoom(cfg) {
  zoom.level = 0;
  zoom.wanted = 0;
  zoom.baseTarget.set(...cfg.target);
  zoom.focus.copy(zoom.baseTarget);
  zoom.wantedFocus.copy(zoom.baseTarget);

  const pos = new THREE.Vector3(...cfg.position);
  zoom.baseDist = pos.distanceTo(zoom.baseTarget);
  zoom.dir.copy(pos).sub(zoom.baseTarget).normalize();
}

function anyPanelOpen() {
  return [treePanel, boardPanel, fortunePanel, joinPanel, tvPanel]
    .some((p) => p?.classList.contains('on'));
}

renderer.domElement.addEventListener('wheel', (e) => {
  if (!ZOOM.enabled || anyPanelOpen()) return;
  e.preventDefault();

  const dir = e.deltaY > 0 ? -1 : 1;                     // 往上滾 = 拉近
  const next = Math.min(1, Math.max(0, zoom.wanted + dir * (ZOOM.step ?? 0.14)));

  if (next <= 0.001) {
    // 滾到底 → 回到一開始的全覽
    zoom.wantedFocus.copy(zoom.baseTarget);
  } else if (dir > 0) {
    // 拉近的時候，對準游標底下那個東西
    interaction.updatePointer(e.clientX, e.clientY);
    const hit = interaction.cast();
    if (hit) zoom.wantedFocus.copy(hit.point);
  }

  zoom.wanted = next;
}, { passive: false });

function updateZoom(dt) {
  if (!ZOOM.enabled) return;

  const k = Math.min(1, (ZOOM.smooth ?? 7.5) * dt);
  zoom.level += (zoom.wanted - zoom.level) * k;
  zoom.focus.lerp(zoom.wantedFocus, k);

  const dist = zoom.baseDist * (1 - zoom.level * (ZOOM.max ?? 0.8));
  const target = zoom.baseTarget.clone().lerp(zoom.focus, zoom.level);

  camera.position.copy(target).addScaledVector(zoom.dir, dist);
  camera.lookAt(target);
}

// ---- 漂浮 ----
// 名字開頭 float_ 的物件會自己上下飄。每個給不一樣的節奏，才不會像整組電梯。
let floaters = [];
let floatCfg = null;

function collectFloaters(root, naming) {
  const list = [];
  root.traverse((o) => {
    if (!o.name || !o.name.startsWith(naming.float)) return;
    // 已經有祖先在飄了就跳過，不然會飄兩次
    let p = o.parent, nested = false;
    while (p && p !== root) {
      if (p.name && p.name.startsWith(naming.float)) { nested = true; break; }
      p = p.parent;
    }
    if (nested) return;

    const i = list.length;
    // 想單獨微調某一塊：Blender 的自訂屬性 float 匯出後會變成 userData.float
    const over = o.userData?.float ?? {};
    list.push({
      obj: o,
      baseY: o.position.y,
      baseRotX: o.rotation.x,
      baseRotZ: o.rotation.z,
      phase: over.phase ?? i * 1.9,                 // 錯開節奏
      scale: over.scale ?? 1 + (i % 3) * 0.28,      // 飄的幅度各差一點
      rate:  over.rate  ?? 1 - (i % 2) * 0.22,      // 速度也差一點
    });
  });
  return list;
}

// 從某個物件往上找，看它掛在哪一塊會漂浮的地上面
function floatingAncestorOf(obj) {
  let n = obj;
  while (n && n !== currentRoot) {
    if (n.name && n.name.startsWith(NAMING.float)) return n;
    n = n.parent;
  }
  return currentRoot;
}

function updateFloaters(t) {
  if (!floatCfg) return;
  const amp = floatCfg.amp ?? 0.26;
  const speed = floatCfg.speed ?? 0.42;
  const tilt = floatCfg.tilt ?? 0;

  for (const f of floaters) {
    const a = t * speed * f.rate + f.phase;
    f.obj.position.y = f.baseY + Math.sin(a) * amp * f.scale;
    if (tilt) {
      f.obj.rotation.x = f.baseRotX + Math.sin(a * 0.73) * tilt;
      f.obj.rotation.z = f.baseRotZ + Math.cos(a * 0.61) * tilt;
    }
  }
}

// ---- 流動（蜜糖瀑布之類）----
// 名字開頭 flow_ 的物件，貼圖會被一直往下捲，看起來就像液體在流
let flows = [];
let flowCfg = null;

function collectFlows(root, naming) {
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.name || !o.name.startsWith(naming.flow)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m?.map && !list.includes(m.map)) list.push(m.map);
    }
  });
  return list;
}

function updateFlows(dt) {
  if (!flowCfg || !flows.length) return;
  const speed = flowCfg.speed ?? 0.5;
  for (const tex of flows) {
    tex.offset.y = (tex.offset.y - dt * speed) % 1;
  }
}

// ---- 拖動整座島 ----
// 設定寫在 config.js 每個場景的 drag 裡。沒寫 drag 的場景就不能拖。
const drag = {
  cfg: null,         // 目前場景的 drag 設定
  active: false,     // 真的在拖了嗎
  pending: false,    // 按下去了但還沒超過門檻（可能只是想點一下）
  startX: 0, startY: 0,
  lastX: 0, lastY: 0,
  speed: 0,          // 放手之後的滑行速度
  blockClick: false, // 拖過了就不要當成點擊
};

// 移動超過幾個像素才算「在拖」。沒有這個門檻，點的時候手稍微抖一下就點不到東西。
const DRAG_THRESHOLD = 4;

const dragAxisKey = () => (drag.cfg?.axis === 'x' ? 'x' : 'y');

function applyDrag(amount) {
  if (!currentRoot || !drag.cfg) return;
  const key = dragAxisKey();
  let v = currentRoot.rotation[key] + amount;

  // 有設範圍就夾住（'x' 軸常用，免得島翻過頭看到底部）
  if (drag.cfg.min != null) v = Math.max(drag.cfg.min, v);
  if (drag.cfg.max != null) v = Math.min(drag.cfg.max, v);

  currentRoot.rotation[key] = v;
}

function setDragCursor() {
  renderer.domElement.style.cursor =
    !drag.cfg ? '' : (drag.active ? 'grabbing' : 'grab');
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!drag.cfg || e.button !== 0) return;
  drag.pending = true;
  drag.active = false;
  drag.startX = drag.lastX = e.clientX;
  drag.startY = drag.lastY = e.clientY;
  drag.speed = 0;
  // 新的一次操作開始了，把上次拖曳留下的「別當成點擊」清掉。
  // 不清的話，上次在畫面外放開滑鼠（沒觸發 click）時，旗標會留到下次害你點不到東西。
  drag.blockClick = false;
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch {}
});

function endDrag(e) {
  if (!drag.pending && !drag.active) return;
  if (drag.active) drag.blockClick = true;   // 這次放手不要觸發點擊
  drag.pending = false;
  drag.active = false;
  try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
  setDragCursor();
}

renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

// ---- 事件 ----
window.addEventListener('pointermove', (e) => {
  interaction.updatePointer(e.clientX, e.clientY);

  if (!drag.cfg) return;

  if (drag.pending && !drag.active) {
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (moved > DRAG_THRESHOLD) {
      drag.active = true;
      interaction.clearHover();
      setDragCursor();
    }
  }

  if (drag.active) {
    const d = dragAxisKey() === 'x'
      ? e.clientY - drag.lastY      // 上下拖 → 繞 X 軸翻
      : e.clientX - drag.lastX;     // 左右拖 → 繞 Y 軸轉
    const amount = d * (drag.cfg.speed ?? 0.0075);
    applyDrag(amount);
    drag.speed = amount;            // 記住最後的速度，放手後拿來滑行
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  }
});

window.addEventListener('pointerleave', () => interaction.leave());

renderer.domElement.addEventListener('click', (e) => {
  // 剛剛是在拖島，不是要點東西
  if (drag.blockClick) { drag.blockClick = false; return; }
  interaction.updatePointer(e.clientX, e.clientY);
  interaction.click();
});

backEl.addEventListener('click', () => go(HOME_SCENE));

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (treePanel.classList.contains('on')) { closeTreePanel(); return; }
  if (boardPanel.classList.contains('on')) { closeBoardPanel(); return; }
  if (fortunePanel.classList.contains('on')) { closeFortunePanel(); return; }
  if (joinPanel.classList.contains('on') && me) { closeJoinPanel(); return; }
  if (tvPanel.classList.contains('on')) { closeTvPanel(); return; }
  if (currentId !== HOME_SCENE) go(HOME_SCENE);
});

window.addEventListener('resize', () => {
  camera.aspect = vw() / vh();
  camera.fov = fitFov();
  camera.updateProjectionMatrix();
  renderer.setSize(vw(), vh());
});

// ---- 主迴圈 ----
const timer = new THREE.Timer();

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);

  // 放手之後讓島再滑一小段，手感比較順
  if (drag.cfg && !drag.active && Math.abs(drag.speed) > 0.00002) {
    applyDrag(drag.speed);
    drag.speed *= (drag.cfg.damping ?? 0.92);
  }

  updateFloaters(timer.getElapsed());
  updateFlows(dt);
  updateScreen(timer.getElapsed());
  updateZoom(dt);
  gemField.update(dt, timer.getElapsed());
  updateBalls(ballGroup, timer.getElapsed());
  walker?.update(dt);
  if (avatar) Net.setState({ x: avatar.position.x, z: avatar.position.z, ry: avatar.rotation.y });
  updatePeers(dt);
  updateTags();
  updatePeerTags();

  // 拖島的時候不要去判斷滑鼠停在誰身上
  if (!drag.active) interaction.updateHover(sceneNames);

  ripples.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// 除錯把手：在瀏覽器主控台可以直接操作場景，例如 ISLAND.go('dessert')
// （只是方便檢查，不影響畫面）
window.ISLAND = {
  go,
  scene,
  camera,
  get current() { return currentId; },
  get targets() { return interaction.targets.map((o) => o.name); },
  get rotation() { return currentRoot ? currentRoot.rotation.toArray() : null; },
  drag,
  energy: Energy,
  board: Board,
  fortune: Fortune,
  visitor: Visitor,
  net: Net,
  get peers() { return peers; },
  get avatar() { return avatar; },
  get walker() { return walker; },
  zoom,
  gems: Gems,
  gemField,
  rebuildNoticeBoard,
  regrowTree,
};

// ---- 起跑 ----
go(START_SCENE, { instant: true }).then(() => {
  veilEl.classList.add('hide');
  frame();

  me = Visitor.load();
  if (me) { renderWho(); spawnAvatar(); startNet(); }
  else openJoinPanel();          // 第一次來，先選一個你
});
