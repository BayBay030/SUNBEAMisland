// ============================================================
//  神木 —— 照著能量帳本「長」出來，不是固定的模型
//  由 Claude 建立 2026-10-15
//
//  怎麼運作：
//    能量越多 → 主枝越多、樹幹越粗越高 → 樹冠越大
//    每根枝的角度、長度、歪法都由那顆球自己的亂數種子決定，
//    所以同一份能量一定長出同一棵樹，但換一顆球就整棵不一樣。
//
//    主枝有上限（config 的 maxBranches），到頂之後不會停止變化，
//    改成繼續長粗、長高、樹冠變密 —— 因為幾何無限長下去會把畫面拖垮。
// ============================================================

import * as THREE from 'three';
import { EMOTIONS, TREE, TREE_FORMS, EMOTION_FORM, DEFAULT_FORM, FORM_BLEND_AT } from './config.js';

const EMO = Object.fromEntries(EMOTIONS.map((e) => [e.id, e]));
const FALLBACK = { id: 'calm', name: '平靜', color: 0x6fd1b0, glow: 0x2f9e7d };
const emo = (id) => EMO[id] ?? FALLBACK;

// 固定種子的亂數：同樣的種子一定產生同樣的序列
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------
//  依情緒比例決定品種。前兩名接近就按比例混，所以不是六選一，是光譜。
// ------------------------------------------------------------
export function pickForm(byEmotion = {}) {
  const ranked = Object.entries(byEmotion).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return { ...TREE_FORMS[DEFAULT_FORM], label: TREE_FORMS[DEFAULT_FORM].name, mix: null };
  }

  const first = TREE_FORMS[EMOTION_FORM[ranked[0][0]]] ?? TREE_FORMS[DEFAULT_FORM];
  const firstName = EMOTIONS.find((e) => e.id === ranked[0][0])?.name ?? ranked[0][0];

  if (ranked.length < 2) {
    return { ...first, label: first.name, mix: null, topEmotion: firstName };
  }

  const ratio = ranked[1][1] / ranked[0][1];
  if (ratio < FORM_BLEND_AT) {
    return { ...first, label: first.name, mix: null, topEmotion: firstName };
  }

  // 混：第二名佔的比重照它跟第一名的比例算，最多一半
  const second = TREE_FORMS[EMOTION_FORM[ranked[1][0]]] ?? first;
  const k = Math.min(0.5, ratio * 0.5);
  const out = {};
  for (const key of ['spread', 'lift', 'decay', 'kids', 'twist', 'droop', 'leafScale']) {
    out[key] = first[key] * (1 - k) + second[key] * k;
  }
  out.leaf = k > 0.35 ? second.leaf : first.leaf;
  out.trunkSides = Math.round(first.trunkSides * (1 - k) + second.trunkSides * k);
  out.label = first.name === second.name
    ? first.name
    : `${first.name}混${second.name}`;
  out.mix = Math.round(k * 100);
  out.topEmotion = firstName;
  return out;
}

function bark(shade = 0) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x5c4030).offsetHSL(0, 0, shade),
    roughness: 0.92,
    metalness: 0.02,
  });
}

// ------------------------------------------------------------
//  一根枝：從 from 長到 to，再往上分岔
// ------------------------------------------------------------
// 小球的形狀。都做成單位大小，實際尺寸靠每顆球自己的縮放。
function makeOrbGeo(kind) {
  switch (kind) {
    case 'shard': return new THREE.OctahedronGeometry(1, 0);     // 尖的，給結晶型
    case 'drop':  return new THREE.SphereGeometry(1, 7, 5);      // 水滴，給垂枝型
    case 'flat':  return new THREE.SphereGeometry(1, 9, 6);      // 扁的，給傘蓋型
    default:      return new THREE.IcosahedronGeometry(1, 1);    // 一般的小球
  }
}

function growBranch(group, { from, dir, len, radius, depth, rand, barkMat, form, orbs, orbCount, twistAcc = 0 }) {
  const to = from.clone().addScaledVector(dir, len);

  const seg = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.62, radius, len, 6),
    barkMat
  );
  // 圓柱預設是直立的，要把它轉到 from → to 的方向
  seg.position.copy(from).addScaledVector(dir, len / 2);
  seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  seg.castShadow = true;
  group.add(seg);

  if (depth <= 0) {
    // 枝的末端長一叢白色發光小球。
    // 這裡只把位置記下來，最後統一用「實例化」一次畫完 ——
    // 幾百顆球如果各自是一個網格，畫面會卡。
    const spread = len * (TREE.orbSpread ?? 0.55);
    for (let i = 0; i < orbCount; i++) {
      if (orbs.length >= (TREE.orbMax ?? 1400)) break;
      orbs.push({
        pos: new THREE.Vector3(
          to.x + (rand() - 0.5) * spread,
          to.y + (rand() - 0.5) * spread * (form.leaf === 'flat' ? 0.35 : 1),
          to.z + (rand() - 0.5) * spread
        ),
        scale: (TREE.orbSize ?? 0.19) * (form.leafScale ?? 1) * (0.6 + rand() * 0.85),
        rot: new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28),
      });
    }
    return;
  }

  // 分岔數也看品種：糾結型多、螺旋型少
  const kids = rand() < (form.kids - Math.floor(form.kids)) ? Math.ceil(form.kids) : Math.floor(form.kids);

  for (let i = 0; i < Math.max(1, kids); i++) {
    // 螺旋型用黃金角把子枝繞著轉，所以會長成螺旋梯
    const t = twistAcc + (form.twist ?? 0) * (i + 1);
    const spread = form.spread ?? 0.95;

    const next = dir.clone()
      .add(new THREE.Vector3(
        ((rand() - 0.5) + Math.cos(t) * 0.5) * spread,
        (form.lift ?? 0.42) + rand() * 0.3 - (form.droop ?? 0),   // droop 把枝往下壓
        ((rand() - 0.5) + Math.sin(t) * 0.5) * spread
      ))
      .normalize();

    growBranch(group, {
      from: to,
      dir: next,
      len: len * ((form.decay ?? 0.64) + rand() * 0.14),
      radius: radius * 0.66,
      depth: depth - 1,
      rand, barkMat, form, orbs, orbCount,
      twistAcc: t,
    });
  }
}

// ------------------------------------------------------------
//  整棵神木
//  stats 來自 energy.js 的 summarise()
// ------------------------------------------------------------
export function buildSacredTree(stats, todayList = []) {
  const g = new THREE.Group();
  g.name = 'panel_tree';          // 點了會跳出投球面板

  const total = stats?.total ?? 0;
  const rand = rng(stats?.seed ?? 7);

  // 這批能量長出哪個品種（會混）
  const form = pickForm(stats?.byEmotion ?? {});
  g.userData.form = form;

  // 能量越多，樹幹越高越粗（會慢慢趨緩，不會無限暴衝）
  const grow = Math.log2(total + 1);
  const trunkH = 3.4 + grow * 0.3;
  const trunkR = 0.78 + grow * 0.085;

  const barkMat = bark();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.52, trunkR, trunkH, form.trunkSides ?? 9),
    barkMat
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  // 板根
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const root = new THREE.Mesh(
      new THREE.ConeGeometry(trunkR * 0.36, 1.25 + grow * 0.1, 5),
      barkMat
    );
    root.position.set(Math.cos(a) * trunkR * 0.76, 0.42, Math.sin(a) * trunkR * 0.76);
    root.rotation.z = Math.cos(a) * 0.42;
    root.rotation.x = -Math.sin(a) * 0.42;
    root.castShadow = true;
    g.add(root);
  }

  // 小球本體是白的，發出來的光帶一點情緒色（orbTintGlow 設 false 就是純白）
  const glowCol = TREE.orbTintGlow === false
    ? new THREE.Color(0xffffff)
    : new THREE.Color(0xffffff).lerp(mixEmotionColor(stats?.byEmotion ?? {}, true), 0.45);

  const orbMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: glowCol,
    emissiveIntensity: TREE.orbGlow ?? 2.6,
    roughness: 0.28,
    metalness: 0.0,
    flatShading: form.leaf === 'shard',
  });

  // 這棵樹所有小球的位置，最後一次畫完
  const orbs = [];
  const orbCount = Math.max(1, Math.round(
    (form.orbs ?? 4) * (1 + grow * (TREE.orbDensity ?? 0.09))
  ));

  // 主枝數量 = 基本盤 + 能量 / energyPerBranch，有上限
  // 給基本盤是因為一棵神木就算還沒人餵，也該長得像神木，不是一根柱子
  const want = (TREE.baseBranches ?? 5) + Math.floor(total / (TREE.energyPerBranch || 2));
  const branches = Math.min(TREE.maxBranches || 34, want);

  for (let i = 0; i < branches; i++) {
    // 螺旋型用黃金角排主枝，才會繞著樹幹轉上去；其他品種平均分佈
    const a = (form.twist ?? 0) > 1
      ? i * 2.39996
      : (i / Math.max(branches, 1)) * Math.PI * 2 + rand() * 0.8;
    // 螺旋型的主枝要隨序號往上爬，配上黃金角才會繞成螺旋梯；
    // 其他品種維持隨機高度，才不會像排隊
    const h = (form.twist ?? 0) > 1
      ? trunkH * (0.26 + 0.68 * (i / Math.max(branches - 1, 1)))
      : trunkH * (0.45 + rand() * 0.5);
    const out = 0.42 + rand() * 0.4;

    growBranch(g, {
      from: new THREE.Vector3(Math.cos(a) * trunkR * 0.5, h, Math.sin(a) * trunkR * 0.5),
      dir: new THREE.Vector3(
        Math.cos(a) * out,
        0.72 + rand() * 0.3 - (form.droop ?? 0) * 1.15,
        Math.sin(a) * out
      ).normalize(),
      len: 1.15 + rand() * 0.75 + grow * 0.035,
      radius: trunkR * 0.3,
      depth: TREE.branchDepth ?? 3,
      rand, barkMat, form, orbs, orbCount,
      twistAcc: a,
    });
  }

  // 還沒有能量的時候，至少要有個樹冠，不然只是一根柱子
  if (branches === 0) {
    for (let i = 0; i < orbCount * 6; i++) {
      orbs.push({
        pos: new THREE.Vector3(
          (rand() - 0.5) * 2.4, trunkH + 0.7 + (rand() - 0.5) * 1.6, (rand() - 0.5) * 2.4
        ),
        scale: (TREE.orbSize ?? 0.19) * (form.leafScale ?? 1) * (0.6 + rand() * 0.85),
        rot: new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28),
      });
    }
  }

  // ---- 把所有小球一次畫完（實例化：幾百顆只算一次）----
  if (orbs.length) {
    const inst = new THREE.InstancedMesh(makeOrbGeo(form.leaf), orbMat, orbs.length);
    inst.name = '樹葉小球';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    orbs.forEach((o, i) => {
      q.setFromEuler(o.rot);
      // 水滴拉長、扁的壓扁，其餘等比
      sc.set(o.scale, o.scale, o.scale);
      if (form.leaf === 'drop') sc.y *= 1.7;
      if (form.leaf === 'flat') sc.y *= 0.5;
      m.compose(o.pos, q, sc);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    g.add(inst);
  }
  g.userData.orbCount = orbs.length;

  // ---- 今天投進來的能量球，浮在樹幹周圍 ----
  const balls = new THREE.Group();
  balls.name = '今日能量球';
  g.add(balls);

  const shown = todayList.slice(-(TREE.maxBallsShown ?? 48));
  shown.forEach((entry, i) => {
    const e = emo(entry.e);
    const br = rng(entry.s ?? i);
    const a = br() * Math.PI * 2;
    const r = trunkR + 0.5 + br() * 0.95;
    const y = 0.8 + br() * (trunkH - 0.6);

    const ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(TREE.ballRadius ?? 0.17, 1),
      new THREE.MeshStandardMaterial({
        color: e.color,
        emissive: e.glow,
        emissiveIntensity: 1.7,
        roughness: 0.3,
      })
    );
    ball.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    ball.name = `能量_${e.name}`;
    // 讓主程式知道這顆球要怎麼繞、以及它帶了什麼文字
    ball.userData.orbit = { a, r, y, rate: 0.25 + br() * 0.4, bob: 0.1 + br() * 0.18 };
    ball.userData.entry = entry;
    balls.add(ball);
  });

  g.userData.trunkHeight = trunkH;
  return g;
}

// 把各情緒的數量混成一個樹冠顏色
function mixEmotionColor(byEmotion, raw = false) {
  const c = new THREE.Color(0x4f8a5c);
  const keys = Object.keys(byEmotion);
  if (!keys.length) return raw ? new THREE.Color(0xffe8c0) : c;

  let total = 0;
  const mix = new THREE.Color(0, 0, 0);
  for (const k of keys) {
    const n = byEmotion[k];
    mix.add(new THREE.Color(emo(k).color).multiplyScalar(n));
    total += n;
  }
  mix.multiplyScalar(1 / Math.max(total, 1));

  if (raw) return mix;        // 發光用的，要情緒本身的顏色

  // 情緒色普遍偏亮，直接混會把樹冠洗成死白，所以先壓暗再淡淡染上去
  mix.multiplyScalar(0.5);
  return c.lerp(mix, 0.22);
}

// 球的繞行動畫，由主迴圈每格呼叫
export function updateBalls(group, t) {
  if (!group) return;
  for (const b of group.children) {
    const o = b.userData.orbit;
    if (!o) continue;
    const a = o.a + t * o.rate;
    b.position.set(Math.cos(a) * o.r, o.y + Math.sin(t * 1.3 + o.a) * o.bob, Math.sin(a) * o.r);
  }
}
