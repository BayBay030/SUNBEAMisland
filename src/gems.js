// ============================================================
//  鑽石泡泡 —— 隨機冒出來、會自己消失、點到就收下
//  由 Claude 建立 2026-10-15
//
//  收集的數量存在這台電腦的瀏覽器裡（跟能量帳本一樣）。
//  之後要變成跨裝置，改這支的 load/save 就好。
//
//  「可以拿來換什麼」還沒決定，所以這裡只做到「存起來」和「花掉」兩個動作。
//  spend() 已經寫好了，想好要換什麼再接上去。
// ============================================================

import * as THREE from 'three';
import { GEMS } from './config.js';

const KEY = 'island-map.gems.v1';

// ---- 存款 ----

export function load() {
  try {
    const n = parseInt(localStorage.getItem(KEY) ?? '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function save(n) {
  try { localStorage.setItem(KEY, String(Math.max(0, n))); } catch {}
  return n;
}

export function add(n = 1) {
  return save(load() + n);
}

// 花掉。不夠就回傳 false，不會扣成負的
export function spend(n = 1) {
  const have = load();
  if (have < n) return false;
  save(have - n);
  return true;
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch {}
}

// ---- 場上的泡泡 ----

const rand = (a, b) => a + Math.random() * (b - a);

function makeGemMesh() {
  const g = new THREE.Group();
  g.name = 'gem';

  // 鑽石本體：八面體，半透明帶自己的光
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(GEMS.size ?? 0.27, 0),
    new THREE.MeshStandardMaterial({
      color: 0xbdf0ff,
      emissive: 0x5fd0f0,
      emissiveIntensity: 1.8,
      roughness: 0.12,
      metalness: 0.3,
      transparent: true,
      opacity: 0.92,
    })
  );
  g.add(core);

  // 外面一層薄殼，看起來像泡泡包著
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry((GEMS.size ?? 0.27) * 1.75, 14, 10),
    new THREE.MeshStandardMaterial({
      color: 0xdff6ff,
      emissive: 0x7fd8f5,
      emissiveIntensity: 0.5,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    })
  );
  g.add(shell);

  g.userData.isGem = true;      // 點到的時候靠這個認出來
  g.userData.core = core;
  g.userData.shell = shell;
  return g;
}

export class GemField {
  constructor() {
    this.parent = null;
    this.alive = [];
    this.nextIn = rand(1.2, 3);
    // 射線要打得到的網格。外面會直接參照這個陣列，所以只能就地增刪，不能換掉
    this.pickables = [];
  }

  setParent(obj) {
    this.clear();
    this.parent = obj ?? null;
  }

  spawn() {
    if (!this.parent) return;

    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * (GEMS.radius ?? 8.4);   // 平均分布，不會都擠在中間
    const [h0, h1] = GEMS.height ?? [0.9, 4.4];

    const obj = makeGemMesh();
    obj.position.set(Math.cos(a) * r, rand(h0, h1), Math.sin(a) * r);
    obj.scale.setScalar(0.01);
    this.parent.add(obj);
    this.pickables.push(obj.userData.core, obj.userData.shell);

    this.alive.push({
      obj,
      t: 0,
      life: rand(...(GEMS.life ?? [9, 17])),
      spin: rand(0.5, 1.4) * (Math.random() > 0.5 ? 1 : -1),
      bob: rand(0.1, 0.26),
      phase: Math.random() * Math.PI * 2,
      baseY: obj.position.y,
      popping: false,
    });
  }

  // 被點到：原地脹大然後消失
  pop(obj) {
    const e = this.alive.find((x) => x.obj === obj || x.obj === obj.parent);
    if (!e || e.popping) return false;
    e.popping = true;
    e.t = 0;
    e.life = 0.32;
    return true;
  }

  remove(e) {
    for (const mesh of [e.obj.userData.core, e.obj.userData.shell]) {
      const i = this.pickables.indexOf(mesh);
      if (i >= 0) this.pickables.splice(i, 1);
    }
    this.parent?.remove(e.obj);
    e.obj.traverse((o) => {
      if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose(); }
    });
  }

  update(dt, elapsed) {
    if (!this.parent || !GEMS.enabled) return;

    // 該冒新的了嗎
    this.nextIn -= dt;
    if (this.nextIn <= 0) {
      if (this.alive.length < (GEMS.maxAlive ?? 5)) this.spawn();
      this.nextIn = rand(...(GEMS.spawnEvery ?? [3.5, 9]));
    }

    for (let i = this.alive.length - 1; i >= 0; i--) {
      const e = this.alive[i];
      e.t += dt;

      if (e.popping) {
        // 收下的那一下：脹大、變淡
        const k = Math.min(1, e.t / e.life);
        e.obj.scale.setScalar(1 + k * 1.8);
        e.obj.userData.core.material.opacity = 0.92 * (1 - k);
        e.obj.userData.shell.material.opacity = 0.22 * (1 - k);
        if (k >= 1) { this.remove(e); this.alive.splice(i, 1); }
        continue;
      }

      if (e.t >= e.life) { this.remove(e); this.alive.splice(i, 1); continue; }

      // 冒出來的頭 0.6 秒慢慢長大，最後 1 秒慢慢淡掉
      const grow = Math.min(1, e.t / 0.6);
      const fade = Math.min(1, (e.life - e.t) / 1);
      e.obj.scale.setScalar(grow * (0.9 + 0.1 * fade));
      e.obj.userData.core.material.opacity = 0.92 * fade;
      e.obj.userData.shell.material.opacity = 0.22 * fade;

      e.obj.rotation.y += e.spin * dt;
      e.obj.rotation.x = Math.sin(elapsed * 0.7 + e.phase) * 0.25;
      e.obj.position.y = e.baseY + Math.sin(elapsed * 1.1 + e.phase) * e.bob;
    }
  }

  clear() {
    for (const e of this.alive) this.remove(e);
    this.alive.length = 0;
  }
}
