// ============================================================
//  主島底板 + 無限跑的車
//  由 Claude 建立 2026-10-15
//
//  底板是從 road test  88.blend 輸出的（陸地 + 馬路面）。
//
//  車子的循環刻意不用 Blender 的動畫：
//  那條軌道只輸出成一串座標（road-path.json），車子在網頁用程式沿著跑。
//  好處是檔案極小、真的無限循環沒有接縫、速度隨時可調。
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ISLAND_BASE } from './config.js';

const loader = new GLTFLoader();

// ------------------------------------------------------------
//  底板
// ------------------------------------------------------------
export async function loadIslandBase() {
  const gltf = await loader.loadAsync(ISLAND_BASE.model);
  const root = gltf.scene;
  root.name = '島底板';

  root.scale.setScalar(ISLAND_BASE.scale ?? 0.31);
  root.position.y = ISLAND_BASE.y ?? 0;
  root.rotation.y = ISLAND_BASE.rotateY ?? 0;

  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });

  return root;
}

// ------------------------------------------------------------
//  車流
// ------------------------------------------------------------
export class Traffic {
  constructor() {
    this.group = null;
    this.cars = [];        // { obj, t }  t = 跑到軌道的第幾成（0~1）
    this.path = null;      // THREE.CatmullRomCurve3
    this.ready = false;
  }

  async load(parent) {
    const [pathData, gltf] = await Promise.all([
      fetch(ISLAND_BASE.roadPath).then((r) => r.json()),
      loader.loadAsync(ISLAND_BASE.cars),
    ]);

    const s = ISLAND_BASE.scale ?? 0.31;
    const yOff = ISLAND_BASE.y ?? 0;
    const rot = ISLAND_BASE.rotateY ?? 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);

    // 軌道座標要跟底板做一模一樣的縮放、旋轉、位移，車子才會剛好跑在路上
    const pts = pathData.points.map(([x, y, z]) => new THREE.Vector3(
      (x * cos + z * sin) * s,
      y * s + yOff,
      (-x * sin + z * cos) * s
    ));
    this.path = new THREE.CatmullRomCurve3(pts, pathData.cyclic !== false, 'catmullrom', 0.3);

    // 把 glb 裡的車各自抓出來當樣板
    const models = [];
    gltf.scene.traverse((o) => {
      if (o.isMesh && o.parent === gltf.scene) models.push(o);
    });
    if (!models.length) {
      gltf.scene.children.forEach((o) => models.push(o));
    }

    this.group = new THREE.Group();
    this.group.name = '車流_nohit';     // 車子不擋射線，不然會點不到地面
    parent.add(this.group);

    const n = Math.max(1, ISLAND_BASE.carCount ?? 7);
    for (let i = 0; i < n; i++) {
      const src = models[i % models.length];
      const car = src.clone(true);
      // 車子也要跟著底板一起縮，不然會變成哥吉拉
      car.scale.multiplyScalar((ISLAND_BASE.carScale ?? 1) * s);
      car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      this.group.add(car);
      // 平均分散在軌道上，再加一點隨機，免得像隊伍一樣整齊
      this.cars.push({ obj: car, t: (i / n + Math.random() * 0.02) % 1 });
    }

    this.ready = true;
    return this.cars.length;
  }

  update(dt) {
    if (!this.ready || !this.path) return;
    const speed = ISLAND_BASE.carSpeed ?? 0.035;

    for (const c of this.cars) {
      c.t = (c.t + dt * speed) % 1;
      this.path.getPointAt(c.t, c.obj.position);

      // 面向前進方向：看一點點前面的位置
      const ahead = this.path.getPointAt((c.t + 0.004) % 1);
      c.obj.lookAt(ahead);
    }
  }

  dispose() {
    if (!this.group) return;
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry?.dispose(); }
    });
    this.group = null;
    this.cars = [];
    this.ready = false;
  }
}
