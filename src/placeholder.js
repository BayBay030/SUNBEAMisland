// ============================================================
//  假模型產生器 —— 真模型還沒進來之前，用程式生出能跑的場景
//  由 Claude 建立 2026-10-14
//
//  這裡生出來的物件會照 config.js 的命名規則取名字，
//  所以換成真模型時，行為完全不用改程式。
//
//  名字開頭是 float_ 的群組會自己上下漂浮。
// ============================================================

import * as THREE from 'three';
import { buildSacredTree } from './tree.js';
import { load as loadEnergy, todayEntries, summarise } from './energy.js';
import { count as boardCount } from './board.js';
import { BROADCAST, WATER, LIGHTS } from './config.js';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0.04,
    ...opts,
  });
}

// ------------------------------------------------------------
//  一塊浮空的地：上面是平台，下面是扯下來的岩石尖端
// ------------------------------------------------------------
function makeFloatingGround({ topR, waistR, topH, rockH, sides, grass, rock }) {
  const g = new THREE.Group();

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(topR, waistR, topH, sides),
    mat(grass, { roughness: 0.9 })
  );
  top.position.y = -topH / 2;
  top.receiveShadow = true;
  top.castShadow = true;
  g.add(top);

  // 底下的岩石（倒過來的錐體），有了它才像「被扯下來浮在空中」
  const under = new THREE.Mesh(
    new THREE.ConeGeometry(waistR, rockH, sides),
    mat(rock, { roughness: 0.96, metalness: 0.02 })
  );
  under.rotation.x = Math.PI;              // 尖端朝下
  under.position.y = -topH - rockH / 2;
  under.castShadow = true;
  g.add(under);

  return g;
}

// ------------------------------------------------------------
//  蜜糖的材質：用程式畫出一條條流動的紋路（不需要外部圖檔）
//  名字開頭 flow_ 的物件，貼圖會被程式一直往下捲，看起來就像在流
// ------------------------------------------------------------
function makeHoneyTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d');

  // 底色：琥珀色的漸層
  const base = ctx.createLinearGradient(0, 0, 64, 0);
  base.addColorStop(0.0, '#b46f1c');
  base.addColorStop(0.35, '#e8a73a');
  base.addColorStop(0.55, '#ffd27a');   // 中間亮一條，像光打在糖漿上
  base.addColorStop(0.8, '#dd9a30');
  base.addColorStop(1.0, '#a86418');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 256);

  // 直向的流紋，深淺交錯
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 64;
    const w = 1 + Math.random() * 4;
    const y = Math.random() * 256;
    const h = 30 + Math.random() * 90;
    ctx.fillStyle = Math.random() > 0.5
      ? 'rgba(255, 232, 170, 0.30)'
      : 'rgba(120, 66, 12, 0.22)';
    ctx.fillRect(x, y, w, h);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  return tex;
}

function makeHoneyMaterial() {
  return new THREE.MeshStandardMaterial({
    map: makeHoneyTexture(),
    roughness: 0.22,
    metalness: 0.05,
    emissive: 0x8a4f0a,
    emissiveIntensity: 0.35,
  });
}

// ------------------------------------------------------------
//  普通的小樹
// ------------------------------------------------------------
function makeTree(i, scale = 1) {
  const t = new THREE.Group();
  t.name = `樹${i}`;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13 * scale, 0.17 * scale, 0.9 * scale, 6),
    mat(0x6b4b35)
  );
  trunk.position.y = 0.45 * scale;
  trunk.castShadow = true;
  t.add(trunk);

  const leaf = new THREE.Mesh(
    new THREE.IcosahedronGeometry((0.62 + (i % 3) * 0.1) * scale, 0),
    mat(0x4e7a46, { roughness: 0.95 })
  );
  leaf.position.y = 1.35 * scale;
  leaf.castShadow = true;
  t.add(leaf);

  return t;
}

// ------------------------------------------------------------
//  小望遠鏡：主島上的抽卡點，鏡筒朝天空翹起來
// ------------------------------------------------------------
function makeTelescope() {
  const g = new THREE.Group();
  g.name = 'panel_fortune';        // 點了會跳出抽卡面板

  const metal = new THREE.MeshStandardMaterial({
    color: 0xb9833f, roughness: 0.34, metalness: 0.68,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x4e4a46, roughness: 0.5, metalness: 0.5,
  });

  // 三腳架
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.05, 6), darkMetal);
    leg.position.set(Math.cos(a) * 0.21, 0.5, Math.sin(a) * 0.21);
    leg.rotation.z = -Math.cos(a) * 0.3;
    leg.rotation.x = Math.sin(a) * 0.3;
    leg.castShadow = true;
    g.add(leg);
  }

  // 雲台
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.16, 10), darkMetal);
  head.position.y = 1.03;
  head.castShadow = true;
  g.add(head);

  // 鏡筒：朝天空翹起來
  const tube = new THREE.Group();
  tube.position.y = 1.12;
  tube.rotation.z = -0.62;
  tube.rotation.y = 0.5;
  g.add(tube);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.175, 1.12, 12), metal);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  tube.add(body);

  // 前端鏡片亮一點，讓人注意到這裡可以點
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.155, 0.155, 0.05, 12),
    new THREE.MeshStandardMaterial({
      color: 0xbfe6ff,
      emissive: 0x5fa8d8,
      emissiveIntensity: 1.3,
      roughness: 0.15,
      metalness: 0.2,
    })
  );
  lens.rotation.z = Math.PI / 2;
  lens.position.x = 0.58;
  tube.add(lens);

  // 目鏡
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.26, 10), darkMetal);
  eye.rotation.z = Math.PI / 2;
  eye.position.x = -0.66;
  eye.castShadow = true;
  tube.add(eye);

  return g;
}

// ------------------------------------------------------------
//  公佈欄：神木旁邊的小木架，上面釘著便條紙
//  便條紙張數跟留言數連動 —— 留言越多，紙越多
// ------------------------------------------------------------
export function makeNoticeBoard(messageCount = 0) {
  const g = new THREE.Group();
  g.name = 'panel_board';          // 點了會跳出留言板

  const wood = mat(0x7a5436, { roughness: 0.88 });

  // 兩根立柱
  [-0.62, 0.62].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.5, 6), wood);
    post.position.set(x, 0.75, 0);
    post.castShadow = true;
    g.add(post);
  });

  // 橫樑
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.11, 0.11), wood);
  beam.position.y = 1.46;
  beam.castShadow = true;
  g.add(beam);

  // 板子
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.44, 0.92, 0.07),
    mat(0x8d6342, { roughness: 0.85 })
  );
  board.position.y = 0.95;
  board.castShadow = true;
  board.receiveShadow = true;
  g.add(board);

  // 小屋簷，讓它像告示牌而不是看板
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.76, 0.07, 0.44),
    mat(0x6b4a30, { roughness: 0.9 })
  );
  roof.position.set(0, 1.57, 0.07);
  roof.rotation.x = -0.22;
  roof.castShadow = true;
  g.add(roof);

  // 釘上去的便條紙
  const notes = new THREE.Group();
  notes.name = '便條紙';
  g.add(notes);

  const paper = [0xf3ead3, 0xe8dcc0, 0xf6e7c8, 0xeadfc9];
  const slots = [
    [-0.42, 1.2], [0.0, 1.22], [0.42, 1.18],
    [-0.44, 0.92], [0.02, 0.9], [0.44, 0.94],
    [-0.4, 0.64], [0.04, 0.62], [0.42, 0.66],
  ];
  const n = Math.min(slots.length, messageCount);
  for (let i = 0; i < n; i++) {
    const [x, y] = slots[i];
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.33, 0.24),
      new THREE.MeshStandardMaterial({
        color: paper[i % paper.length],
        roughness: 0.95,
        side: THREE.DoubleSide,
      })
    );
    note.position.set(x, y, 0.04);
    note.rotation.z = (i % 2 ? 1 : -1) * (0.05 + (i % 3) * 0.03);
    note.name = `便條_${i + 1}`;
    notes.add(note);
  }

  g.userData.noteCount = n;
  return g;
}

// ------------------------------------------------------------
//  蜜糖山丘島：一座圓丘，頂上湧出蜜糖，沿著邊緣流下去
// ------------------------------------------------------------
function makeHoneyHill() {
  const g = new THREE.Group();
  g.name = 'float_蜜糖丘';

  const ground = makeFloatingGround({
    topR: 4.2, waistR: 3.4, topH: 0.9, rockH: 5.0, sides: 10,
    grass: 0x6f8f60, rock: 0x6d6153,
  });
  ground.name = '山丘島地面';
  g.add(ground);

  // 圓丘本體：球壓扁，用平面著色做出一塊一塊的面
  const hill = new THREE.Mesh(
    new THREE.SphereGeometry(2.9, 14, 8),
    mat(0x77995f, { roughness: 0.93, flatShading: true })
  );
  hill.scale.set(1, 0.62, 1);
  hill.position.y = -0.25;
  hill.name = '山丘';
  hill.castShadow = true;
  hill.receiveShadow = true;
  g.add(hill);

  // 丘頂的蜜糖泉
  const honeyMat = makeHoneyMaterial();

  const spring = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.05, 0.26, 18),
    honeyMat
  );
  spring.position.set(0, 1.58, 0);
  spring.name = 'hit_蜜糖泉';
  g.add(spring);

  // 從丘頂流到出水口的那一小段
  const lip = new THREE.Vector3(2.5, 0.62, -2.5);
  const brook = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 1.62, 0),
        new THREE.Vector3(0.9, 1.42, -0.9),
        new THREE.Vector3(1.8, 1.05, -1.8),
        lip.clone(),
      ]),
      24, 0.3, 10, false
    ),
    honeyMat
  );
  brook.name = 'flow_蜜糖小溪';
  g.add(brook);

  // 瀑布：從出水口往下墜到主島表面，刻意多垂一段，
  // 這樣兩座島各自上下飄的時候，瀑布也不會跟水池斷開
  const fall = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        lip.clone(),
        new THREE.Vector3(2.85, -0.15, -2.85),
        new THREE.Vector3(3.0, -1.8, -3.0),
        new THREE.Vector3(3.0, -3.6, -3.0),
        new THREE.Vector3(2.98, -5.3, -2.98),
      ]),
      30, 0.34, 10, false
    ),
    honeyMat
  );
  fall.name = 'flow_蜜糖瀑布';
  g.add(fall);

  // 跟主島一起飄，不要各飄各的，不然瀑布看起來會抖
  g.userData.float = { phase: 0.35, scale: 0.9, rate: 1 };

  return g;
}

// ------------------------------------------------------------
//  島：主島 + 右邊飄高一點的神木島
// ------------------------------------------------------------
export function buildIsland() {
  const g = new THREE.Group();
  g.name = 'placeholder_island';

  // ---- 主島（會漂浮）----
  const main = new THREE.Group();
  main.name = 'float_主島';
  g.add(main);

  const ground = makeFloatingGround({
    topR: 9, waistR: 8.1, topH: 1.1, rockH: 6.5, sides: 11,
    grass: 0x5d7f5a, rock: 0x6b6258,
  });
  ground.name = '島地面';
  main.add(ground);

  // 兩個可以點進去的建築
  const doors = [
    { id: 'dessert', pos: [-3.2, 0, 1.4], color: 0xf0d8c0, h: 2.3, w: 2.6, d: 2.2 },
    { id: 'room',    pos: [ 2.9, 0,-1.9], color: 0xd8dcea, h: 2.8, w: 2.2, d: 2.4 },
  ];

  for (const d of doors) {
    const b = new THREE.Group();
    b.name = `enter_${d.id}`;
    b.position.set(d.pos[0], d.pos[1], d.pos[2]);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(d.w, d.h, d.d),
      mat(d.color, { roughness: 0.6 })
    );
    body.position.y = d.h / 2;
    body.castShadow = true;
    b.add(body);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(d.w, d.d) * 0.82, 1.2, 4),
      mat(0x9a5f4e, { roughness: 0.78 })
    );
    roof.position.y = d.h + 0.6;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    b.add(roof);

    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.62),
      new THREE.MeshStandardMaterial({
        color: 0xffd9a0,
        emissive: 0xffc473,
        emissiveIntensity: 1.5,
        roughness: 0.4,
      })
    );
    win.position.set(0, d.h * 0.52, d.d / 2 + 0.01);
    b.add(win);

    main.add(b);
  }

  // 風景樹
  const spots = [
    [-6.0, 0, -2.2], [5.6, 0, 3.0], [-1.4, 0, -5.4],
    [6.2, 0, -3.6], [-5.2, 0, 3.8], [1.2, 0, 5.6],
  ];
  spots.forEach((p, i) => {
    const t = makeTree(i + 1);
    t.position.set(p[0], p[1], p[2]);
    main.add(t);
  });

  // 滑過去會亮的示範物件
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.9, 0.09),
    mat(0xe8e2d2, { roughness: 0.5 })
  );
  sign.position.set(0, 1.0, 4.4);
  sign.name = 'hover_看板';
  sign.castShadow = true;
  main.add(sign);

  // 小望遠鏡：每天抽一張運氣小卡
  const scope = makeTelescope();
  scope.position.set(4.6, 0, 3.4);
  scope.rotation.y = -0.6;
  main.add(scope);

  // 瀑布落下來的蜜糖池（在主島上，所以跟著主島一起飄）
  const poolMat = makeHoneyMaterial();
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.25, 0.16, 20),
    poolMat
  );
  pool.position.set(-5.82, 0.04, 5.82);
  pool.name = 'hit_蜜糖池';
  pool.receiveShadow = true;
  main.add(pool);

  // 池邊往外擴的兩圈，像糖漿漫出來
  [[2.05, 0.09], [2.55, 0.06]].forEach(([r, h], i) => {
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r - 0.22, h, 22),
      new THREE.MeshStandardMaterial({
        color: 0xd79a3c,
        roughness: 0.3,
        metalness: 0.05,
        transparent: true,
        opacity: 0.72 - i * 0.26,
      })
    );
    ring.position.set(-5.82, 0.02, 5.82);
    ring.name = `糖漬${i + 1}_nohit`;
    main.add(ring);
  });

  // ---- 神木島（在畫面右邊，飄得比主島高）----
  const islet = new THREE.Group();
  islet.name = 'float_神木島';
  // 鏡頭在 (+X, +Z) 看向原點，所以畫面右邊的方向是 (+X, -Z)
  islet.position.set(7.9, 3.5, -7.9);
  g.add(islet);

  const isletGround = makeFloatingGround({
    topR: 3.5, waistR: 2.9, topH: 0.8, rockH: 4.2, sides: 9,
    grass: 0x688c5f, rock: 0x6f6459,
  });
  isletGround.name = '神木島地面';
  islet.add(isletGround);

  // 神木不是固定模型，是照能量帳本長出來的
  const ledger = loadEnergy();
  const sacred = buildSacredTree(summarise(ledger), todayEntries(ledger));
  sacred.position.y = 0;
  islet.add(sacred);

  // 神木旁邊的小木架公佈欄
  const notice = makeNoticeBoard(boardCount());
  notice.position.set(2.0, 0, 1.5);
  notice.rotation.y = -0.72;        // 轉向鏡頭這一側，才看得到板面
  islet.add(notice);

  // 神木腳邊的幾顆石頭
  [[1.6, 0.2, 1.1], [-1.5, 0.18, -1.3], [0.4, 0.16, -2.0]].forEach((p, i) => {
    const r = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26 + i * 0.05, 0),
      mat(0x7d7466, { roughness: 0.95 })
    );
    r.position.set(...p);
    r.name = `石頭${i + 1}`;
    r.castShadow = true;
    islet.add(r);
  });

  // ---- 蜜糖山丘島（在畫面左邊，比主島稍高）----
  const hill = makeHoneyHill();
  // 鏡頭在 (+X, +Z) 看向原點，所以畫面左邊的方向是 (-X, +Z)
  hill.position.set(-8.8, 3.2, 8.8);
  g.add(hill);

  // ---- 底下的海（不參與點擊）----
  // 底色是深藍紫，看起來的粉色是從天空反射來的 —— 跟原檔同一個做法
  const waveTex = WATER.wave ? makeWaveTexture() : null;
  const waterMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(WATER.color),
    roughness: WATER.roughness,
    metalness: WATER.metalness,
  });
  if (waveTex) {
    waterMat.normalMap = waveTex;
    waterMat.normalScale = new THREE.Vector2(WATER.waveStrength, WATER.waveStrength);
    waterMat.roughnessMap = waveTex;      // 波峰波谷的粗糙度不一樣，才會有閃動的光
  }

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(WATER.radius, WATER.radius, 0.3, 64),
    waterMat
  );
  water.position.y = WATER.y;
  water.name = '海面_nohit';
  water.userData.waveTex = waveTex;       // 主迴圈會慢慢推它，海面才會流動
  g.add(water);

  return g;
}

// ------------------------------------------------------------
//  室內：地板 + 兩面牆 + 幾件家具
// ------------------------------------------------------------
// ------------------------------------------------------------
//  海面的波光
//  原檔是兩層 Wave + 兩層 Noise 做凹凸，這裡用一張會捲動的法線貼圖模擬：
//  兩個方向交錯的細紋，讓反射的夕陽在海面上閃動
// ------------------------------------------------------------
function makeWaveTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);

  const S1 = 0.055, S2 = 0.13;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // 兩層不同方向、不同密度的波，疊起來就不會看出規律
      const a = Math.sin(x * S1 + Math.sin(y * S1 * 0.7) * 2.2);
      const b = Math.sin((x * 0.6 + y) * S2 + Math.cos(x * S2 * 0.5) * 1.6);
      const h = a * 0.6 + b * 0.4;

      // 由高度差推法線（左右、上下各取一點差值）
      const hx = Math.sin((x + 1) * S1 + Math.sin(y * S1 * 0.7) * 2.2) * 0.6
               + Math.sin(((x + 1) * 0.6 + y) * S2 + Math.cos((x + 1) * S2 * 0.5) * 1.6) * 0.4;
      const hy = Math.sin(x * S1 + Math.sin((y + 1) * S1 * 0.7) * 2.2) * 0.6
               + Math.sin((x * 0.6 + y + 1) * S2 + Math.cos(x * S2 * 0.5) * 1.6) * 0.4;

      const i = (y * N + x) * 4;
      img.data[i]     = 128 + (h - hx) * 110;   // 法線 X
      img.data[i + 1] = 128 + (h - hy) * 110;   // 法線 Y
      img.data[i + 2] = 235;                    // 法線 Z，偏平
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(WATER.waveScale ?? 26, WATER.waveScale ?? 26);
  return tex;
}

// ------------------------------------------------------------
//  螢幕的占位畫面：還沒有 DJ 影片之前，用程式畫一個會動的節奏畫面
//  換成真影片之後這段就用不到了
// ------------------------------------------------------------
function makeScreenPlaceholderTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 144;
  const ctx = c.getContext('2d');
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;

  const bars = 22;
  const seeds = Array.from({ length: bars }, (_, i) => 0.6 + (i % 5) * 0.27);

  function draw(t) {
    // 背景：慢慢換色的漸層
    const hue = (t * 18) % 360;
    const bg = ctx.createLinearGradient(0, 0, 0, 144);
    bg.addColorStop(0, `hsl(${hue}, 46%, 22%)`);
    bg.addColorStop(1, `hsl(${(hue + 60) % 360}, 52%, 11%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 144);

    // 跳動的音量條
    const w = 256 / bars;
    for (let i = 0; i < bars; i++) {
      const h = (0.22 + 0.58 * Math.abs(Math.sin(t * seeds[i] * 2.1 + i * 0.7))) * 144;
      ctx.fillStyle = `hsl(${(hue + i * 9) % 360}, 72%, ${56 + (i % 3) * 6}%)`;
      ctx.fillRect(i * w + 1.5, 144 - h, w - 3, h);
    }

    // 掃過去的一條光
    const x = ((t * 70) % 320) - 32;
    const sweep = ctx.createLinearGradient(x, 0, x + 32, 0);
    sweep.addColorStop(0, 'rgba(255,255,255,0)');
    sweep.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    sweep.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sweep;
    ctx.fillRect(x, 0, 32, 144);

    texture.needsUpdate = true;
  }

  draw(0);
  return { texture, draw };
}

// ------------------------------------------------------------
//  轉播螢幕：掛在房間牆上，點了跳出播放器
// ------------------------------------------------------------
function makeBroadcastScreen() {
  const g = new THREE.Group();
  g.name = 'panel_broadcast';

  // 外框
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.5, 0.1),
    mat(0x2a2d35, { roughness: 0.6, metalness: 0.25 })
  );
  frame.castShadow = true;
  g.add(frame);

  // 畫面本體。有自己的影片就直接貼上去播，沒有就放一個會動的占位畫面。
  // 不管哪一種，走進房間螢幕都是亮著在動的，不用點。
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.9,
    roughness: 0.32,
  });

  const src = BROADCAST.screenVideo;
  if (src) {
    const v = document.createElement('video');
    v.src = src;
    v.loop = true;
    v.muted = true;          // 沒有靜音，瀏覽器不准自動播
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.play().catch(() => {});

    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    panelMat.map = tex;
    panelMat.emissiveMap = tex;
    g.userData.video = v;    // 離開房間時要暫停，不然會一直在背景解碼
  } else {
    const made = makeScreenPlaceholderTexture();
    panelMat.map = made.texture;
    panelMat.emissiveMap = made.texture;
    g.userData.animateScreen = made.draw;
  }

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.28, 1.28), panelMat);
  panel.position.z = 0.055;
  panel.name = '螢幕畫面';
  g.add(panel);

  // 螢幕打出來的光，會照到牆上
  const glow = new THREE.PointLight(0x7fb4e8, 6, 6, 2);
  glow.position.set(0, 0, 0.8);
  g.add(glow);

  // 播放的小三角，告訴你這裡可以點
  const play = new THREE.Mesh(
    new THREE.ConeGeometry(0.17, 0.3, 3),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xdfeaff,
      emissiveIntensity: 1.6,
      roughness: 0.3,
    })
  );
  play.position.z = 0.07;
  play.rotation.z = -Math.PI / 2;
  play.name = '播放鍵';
  g.add(play);

  // 兩顆小喇叭
  [-1.52, 1.52].forEach((x) => {
    const sp = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.72, 0.26),
      mat(0x3a3d45, { roughness: 0.75 })
    );
    sp.position.set(x, -0.3, 0.02);
    sp.castShadow = true;
    g.add(sp);
  });

  return g;
}

export function buildRoom(tint = 0xf3e7da, opts = {}) {
  const g = new THREE.Group();
  g.name = 'placeholder_room';

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 0.2, 6.4),
    mat(0xa8826a, { roughness: 0.85 })
  );
  floor.position.y = -0.1;
  floor.name = '室內地板';
  floor.receiveShadow = true;
  g.add(floor);

  const wallMat = mat(tint, { roughness: 0.9 });

  const wallA = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.4, 0.18), wallMat);
  wallA.position.set(0, 1.7, -3.2);
  wallA.name = '牆A';
  wallA.receiveShadow = true;
  g.add(wallA);

  const wallB = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 6.4), wallMat);
  wallB.position.set(-3.2, 1.7, 0);
  wallB.name = '牆B';
  wallB.receiveShadow = true;
  g.add(wallB);

  const props = [
    { n: 'hit_櫃台', s: [2.6, 1.0, 0.9], p: [-0.6, 0.5, -1.6], c: 0xcf9f7a },
    { n: 'hit_桌子', s: [1.5, 0.75, 1.5], p: [ 1.5, 0.37, 1.2], c: 0xb98f6d },
    { n: 'hit_箱子', s: [0.7, 0.7, 0.7],  p: [-2.1, 0.35, 1.9], c: 0xdcc9a8 },
  ];
  for (const p of props) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...p.s), mat(p.c, { roughness: 0.65 }));
    m.position.set(...p.p);
    m.name = p.n;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xfff1d6,
      emissive: 0xffd9a0,
      emissiveIntensity: 2.4,
    })
  );
  bulb.position.set(0, 2.7, 0);
  bulb.name = '燈泡_nohit';
  g.add(bulb);

  const lamp = new THREE.PointLight(0xffd9a0, 18, 12, 2);
  lamp.position.set(0, 2.65, 0);
  lamp.castShadow = true;
  g.add(lamp);

  if (opts.broadcast) {
    const screen = makeBroadcastScreen();
    screen.position.set(0, 1.85, -3.05);   // 貼在牆A上
    g.add(screen);
  }

  return g;
}

export function buildPlaceholder(kind, def = {}) {
  if (kind === 'island') return buildIsland();
  return buildRoom(undefined, { broadcast: !!def.broadcast });
}
