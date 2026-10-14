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
import { EMOTIONS, TREE } from './config.js';

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
function growBranch(group, { from, dir, len, radius, depth, rand, leafMat, barkMat }) {
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
    // 枝的末端放一坨葉子
    const leaf = new THREE.Mesh(
      new THREE.IcosahedronGeometry(len * (0.52 + rand() * 0.3), 0),
      leafMat
    );
    leaf.position.copy(to);
    leaf.castShadow = true;
    group.add(leaf);
    return;
  }

  const kids = rand() > 0.35 ? 2 : 1;
  for (let i = 0; i < kids; i++) {
    // 往上、往外歪一點，每次都不一樣
    const next = dir.clone()
      .add(new THREE.Vector3(
        (rand() - 0.5) * 0.95,
        0.42 + rand() * 0.35,
        (rand() - 0.5) * 0.95
      ))
      .normalize();

    growBranch(group, {
      from: to,
      dir: next,
      len: len * (0.62 + rand() * 0.16),
      radius: radius * 0.66,
      depth: depth - 1,
      rand, leafMat, barkMat,
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

  // 能量越多，樹幹越高越粗（會慢慢趨緩，不會無限暴衝）
  const grow = Math.log2(total + 1);
  const trunkH = 3.4 + grow * 0.3;
  const trunkR = 0.78 + grow * 0.085;

  const barkMat = bark();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.52, trunkR, trunkH, 9),
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

  // 樹冠的顏色：由累積到現在的情緒比例決定
  const leafMat = new THREE.MeshStandardMaterial({
    color: mixEmotionColor(stats?.byEmotion ?? {}),
    roughness: 0.9,
    emissive: 0x0e2616,
    emissiveIntensity: 0.35,
    flatShading: true,
  });

  // 主枝數量 = 基本盤 + 能量 / energyPerBranch，有上限
  // 給基本盤是因為一棵神木就算還沒人餵，也該長得像神木，不是一根柱子
  const want = (TREE.baseBranches ?? 5) + Math.floor(total / (TREE.energyPerBranch || 2));
  const branches = Math.min(TREE.maxBranches || 34, want);

  for (let i = 0; i < branches; i++) {
    const a = (i / Math.max(branches, 1)) * Math.PI * 2 + rand() * 0.8;
    const h = trunkH * (0.45 + rand() * 0.5);
    const out = 0.42 + rand() * 0.4;

    growBranch(g, {
      from: new THREE.Vector3(Math.cos(a) * trunkR * 0.5, h, Math.sin(a) * trunkR * 0.5),
      dir: new THREE.Vector3(Math.cos(a) * out, 0.72 + rand() * 0.3, Math.sin(a) * out).normalize(),
      len: 1.15 + rand() * 0.75 + grow * 0.035,
      radius: trunkR * 0.3,
      depth: TREE.branchDepth ?? 3,
      rand, leafMat, barkMat,
    });
  }

  // 還沒有能量的時候，至少要有個樹冠，不然只是一根柱子
  if (branches === 0) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), leafMat);
    crown.position.y = trunkH + 0.7;
    crown.castShadow = true;
    g.add(crown);
  }

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
function mixEmotionColor(byEmotion) {
  const c = new THREE.Color(0x4f8a5c);
  const keys = Object.keys(byEmotion);
  if (!keys.length) return c;

  let total = 0;
  const mix = new THREE.Color(0, 0, 0);
  for (const k of keys) {
    const n = byEmotion[k];
    mix.add(new THREE.Color(emo(k).color).multiplyScalar(n));
    total += n;
  }
  mix.multiplyScalar(1 / Math.max(total, 1));

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
