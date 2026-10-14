// ============================================================
//  互動 —— 射線（從鏡頭往滑鼠方向射出去，看打到什麼）
//  由 Claude 建立 2026-10-14
//
//  三件事：
//    1. 滑過熱點 → 稍微放大 + 出現提示
//    2. 點熱點   → 換場景
//    3. 點別的   → 打到的那個位置出現波紋
//
//  刻意不去碰材質（不改顏色、不改發光），因為真模型的材質常常是共用的，
//  一改就會連帶把別的物件也改掉。放大是最安全的「會亮」。
// ============================================================

import * as THREE from 'three';

// 從打到的物件往上找，看它是不是掛在某個帶前綴的父物件底下
function findTagged(obj, prefix) {
  let n = obj;
  while (n) {
    if (n.name && n.name.startsWith(prefix)) return n;
    n = n.parent;
  }
  return null;
}

// 這個物件（或它的任何一層父物件）是不是被標成「射線不要理我」
function isIgnored(obj, suffix) {
  let n = obj;
  while (n) {
    if (n.name && n.name.endsWith(suffix)) return true;
    n = n.parent;
  }
  return false;
}

export function collectTargets(root, NAMING) {
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (isIgnored(o, NAMING.ignore)) return;
    list.push(o);
  });
  return list;
}

export class Interaction {
  constructor({ camera, naming, tipEl, panelLabels, onEnter, onHit, onPanel }) {
    this.camera = camera;
    this.naming = naming;
    this.tipEl = tipEl;
    this.onEnter = onEnter;
    this.onHit = onHit;
    this.onPanel = onPanel;
    this.panelLabels = panelLabels ?? {};

    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.pointer = { x: 0, y: 0, inside: false };

    this.targets = [];
    // 場景建好之後才冒出來的東西（例如鑽石泡泡）放這裡。
    // 固定清單是建場景時算一次的，動態物件不放進來就永遠點不到。
    this.extra = [];
    this.hovered = null;        // 現在滑鼠停在哪個熱點上
    this.scaleBase = new Map(); // 熱點原本的大小，放大完要還原
    this.enabled = true;
  }

  setTargets(list) {
    this.clearHover();
    this.targets = list;
    this.scaleBase.clear();
  }

  // 螢幕座標換成 three.js 要的 -1~1
  updatePointer(clientX, clientY) {
    this.pointer.x = clientX;
    this.pointer.y = clientY;
    this.pointer.inside = true;
    const w = Math.max(window.innerWidth, 1);
    const h = Math.max(window.innerHeight, 1);
    this.ndc.x = (clientX / w) * 2 - 1;
    this.ndc.y = -(clientY / h) * 2 + 1;
  }

  leave() {
    this.pointer.inside = false;
    this.clearHover();
  }

  cast() {
    const list = this.extra.length ? this.targets.concat(this.extra) : this.targets;
    if (!list.length) return null;
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(list, false);
    return hits.length ? hits[0] : null;
  }

  clearHover() {
    if (this.hovered) {
      const base = this.scaleBase.get(this.hovered);
      if (base) this.hovered.scale.copy(base);
      this.hovered = null;
    }
    if (this.tipEl) this.tipEl.classList.remove('on');
    document.body.style.cursor = '';
  }

  // 每一格更新一次：決定現在滑鼠停在什麼東西上
  updateHover(sceneNames) {
    if (!this.enabled || !this.pointer.inside) return;

    const hit = this.cast();
    if (!hit) { this.clearHover(); return; }

    const enter = findTagged(hit.object, this.naming.enter);
    const panel = this.naming.panel ? findTagged(hit.object, this.naming.panel) : null;
    const hoverable = enter || panel || findTagged(hit.object, this.naming.hover);

    if (hoverable !== this.hovered) {
      this.clearHover();
      this.hovered = hoverable;
      if (hoverable) {
        if (!this.scaleBase.has(hoverable)) {
          this.scaleBase.set(hoverable, hoverable.scale.clone());
        }
        const b = this.scaleBase.get(hoverable);
        hoverable.scale.set(b.x * 1.045, b.y * 1.045, b.z * 1.045);
        document.body.style.cursor = 'pointer';
      }
    }

    if (this.hovered && this.tipEl) {
      let label;
      if (enter) {
        const id = enter.name.slice(this.naming.enter.length);
        label = `進入　${sceneNames[id] ?? id}`;
      } else if (panel) {
        label = this.panelLabels?.[panel.name.slice(this.naming.panel.length)] ?? '打開';
      } else {
        label = this.hovered.name.slice(this.naming.hover.length);
      }
      this.tipEl.textContent = label;
      this.tipEl.style.left = `${this.pointer.x}px`;
      this.tipEl.style.top = `${this.pointer.y}px`;
      this.tipEl.classList.add('on');
    }
  }

  // 點下去
  click() {
    if (!this.enabled) return;

    const hit = this.cast();
    if (!hit) return;

    const enter = findTagged(hit.object, this.naming.enter);
    if (enter) {
      const id = enter.name.slice(this.naming.enter.length);
      this.onEnter?.(id);
      return;
    }

    if (this.naming.panel) {
      const panel = findTagged(hit.object, this.naming.panel);
      if (panel) {
        this.onPanel?.(panel.name.slice(this.naming.panel.length), hit);
        return;
      }
    }

    // 不是入口 → 在打到的位置做出反應
    this.onHit?.(hit);
  }
}

// ------------------------------------------------------------
//  波紋記號：在射線打到的位置長出一個圈圈，然後淡掉
// ------------------------------------------------------------
export class Ripples {
  constructor(scene) {
    this.scene = scene;
    this.parent = scene;
    this.live = [];
    this.geo = new THREE.RingGeometry(0.42, 0.5, 40);
    this.dot = new THREE.SphereGeometry(0.05, 12, 8);
    this.life = 0.78;
    this._q = new THREE.Quaternion();
  }

  // 波紋掛在哪個物件底下。掛在會轉動的島上面，島轉的時候記號才會跟著轉。
  setParent(obj) {
    this.parent = obj || this.scene;
  }

  spawn(point, normal, parentOverride) {
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        color: 0xffe9b8,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    group.add(ring);

    const core = new THREE.Mesh(
      this.dot,
      new THREE.MeshBasicMaterial({
        color: 0xfff6e0,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      })
    );
    group.add(core);

    const parent = parentOverride || this.parent;

    // 射線給的是「世界座標」，但波紋要掛在會轉動的島底下，
    // 所以先換算成島自己的座標，島轉的時候記號才會跟著一起轉。
    parent.updateWorldMatrix(true, false);
    group.position.copy(parent.worldToLocal(point.clone()));

    // 讓圈圈貼著表面：把它的正面轉到跟表面法線同方向
    if (normal) {
      const n = normal.clone().normalize()
        .applyQuaternion(parent.getWorldQuaternion(this._q).invert());
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      group.position.addScaledVector(n, 0.012);  // 稍微浮起來，避免跟表面打架
    }

    parent.add(group);
    this.live.push({ group, ring, core, parent, t: 0 });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const r = this.live[i];
      r.t += dt;
      const k = r.t / this.life;

      if (k >= 1) {
        r.parent.remove(r.group);
        r.ring.material.dispose();
        r.core.material.dispose();
        this.live.splice(i, 1);
        continue;
      }

      // 先快後慢的擴散
      const ease = 1 - Math.pow(1 - k, 3);
      const s = 0.3 + ease * 1.9;
      r.group.scale.set(s, s, s);
      r.ring.material.opacity = 0.95 * (1 - k);
      r.core.material.opacity = 1 - Math.min(1, k * 2.2);
    }
  }

  clear() {
    for (const r of this.live) {
      r.parent.remove(r.group);
      r.ring.material.dispose();
      r.core.material.dispose();
    }
    this.live.length = 0;
  }
}
