// ============================================================
//  代表角色 —— 長相 + 走路
//  由 Claude 建立 2026-10-15
//
//  角色是「島」的子物件，所以拖轉島的時候角色跟著轉，
//  走路用的是島自己的座標，怎麼轉都不會亂。
//
//  之後換成 Blender 做的真角色：把 buildCharacter 換成載入 .glb 就好，
//  Walker（走路邏輯）完全不用動。
// ============================================================

import * as THREE from 'three';
import { AVATAR } from './config.js';

function mat(color, rough = 0.78) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.03 });
}

// ------------------------------------------------------------
//  六種長相。都用很簡單的形狀，認得出來就好
// ------------------------------------------------------------
export function buildCharacter(def) {
  const g = new THREE.Group();
  g.name = `avatar_${def.id}`;

  const body = mat(def.color);
  const accent = mat(def.accent);

  // 共用的身體
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.34, 4, 10), body);
  torso.position.y = 0.52;
  torso.castShadow = true;
  g.add(torso);

  // 眼睛（兩顆小黑點，朝向 +Z，也就是角色正面）
  const eyeMat = mat(0x2b2b33, 0.4);
  [-0.13, 0.13].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat);
    eye.position.set(x, 0.72, 0.3);
    g.add(eye);
  });

  switch (def.shape) {
    case 'ears': {
      [-0.14, 0.14].forEach((x, i) => {
        const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 3, 7), body);
        ear.position.set(x, 1.02, 0);
        ear.rotation.z = (i ? 1 : -1) * 0.22;
        ear.castShadow = true;
        g.add(ear);
      });
      break;
    }
    case 'block': {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.46), body);
      head.position.y = 0.92;
      head.castShadow = true;
      g.add(head);
      break;
    }
    case 'hat': {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.52, 9), accent);
      hat.position.y = 1.0;
      hat.castShadow = true;
      g.add(hat);
      break;
    }
    case 'bird': {
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 6), accent);
      beak.position.set(0, 0.63, 0.36);
      beak.rotation.x = Math.PI / 2;
      g.add(beak);
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), accent);
      tuft.position.y = 0.96;
      tuft.rotation.z = 0.3;
      g.add(tuft);
      break;
    }
    case 'ghost': {
      torso.position.y = 0.62;          // 飄起來一點，沒有腳
      const veil = new THREE.Mesh(
        new THREE.ConeGeometry(0.36, 0.42, 10),
        new THREE.MeshStandardMaterial({
          color: def.color, roughness: 0.6, transparent: true, opacity: 0.82,
        })
      );
      veil.position.y = 0.3;
      veil.rotation.x = Math.PI;
      g.add(veil);
      break;
    }
    default: {                           // round
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), accent);
      tuft.position.y = 0.95;
      tuft.castShadow = true;
      g.add(tuft);
    }
  }

  // 腳（飄飄沒有腳）
  if (def.shape !== 'ghost') {
    [-0.15, 0.15].forEach((x) => {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), accent);
      foot.position.set(x, 0.1, 0.02);
      foot.castShadow = true;
      g.add(foot);
    });
  }

  g.scale.setScalar(AVATAR.scale);
  g.userData.isAvatar = true;
  return g;
}

// ------------------------------------------------------------
//  走路
//  setTarget 給島自己座標系裡的位置，update 每格推進一點
// ------------------------------------------------------------
export class Walker {
  constructor(obj) {
    this.obj = obj;
    this.target = obj.position.clone();
    this.moving = false;
    this.facing = obj.rotation.y;
    this.bobT = 0;
    this.baseY = obj.position.y;
  }

  setTarget(v) {
    const t = v.clone();
    t.y = this.baseY;

    // 不要走出島外（會掉下去很怪）
    const r = AVATAR.walkRadius;
    const d = Math.hypot(t.x, t.z);
    if (d > r) {
      t.x = (t.x / d) * r;
      t.z = (t.z / d) * r;
    }

    this.target.copy(t);
    this.moving = true;
  }

  stop() {
    this.moving = false;
    this.obj.position.y = this.baseY;
  }

  update(dt) {
    const o = this.obj;

    if (this.moving) {
      const dx = this.target.x - o.position.x;
      const dz = this.target.z - o.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= AVATAR.arriveAt) {
        o.position.x = this.target.x;
        o.position.z = this.target.z;
        this.stop();
      } else {
        const step = Math.min(AVATAR.speed * dt, dist);
        o.position.x += (dx / dist) * step;
        o.position.z += (dz / dist) * step;

        // 轉身面向前進方向（慢慢轉，不要瞬間扭過去）
        this.facing = Math.atan2(dx, dz);
        this.bobT += dt * 9;
        o.position.y = this.baseY + Math.abs(Math.sin(this.bobT)) * 0.06;
      }
    }

    // 角度要走最短的那一邊，不然會繞一大圈
    let diff = this.facing - o.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    o.rotation.y += diff * Math.min(1, AVATAR.turnSpeed * dt);
  }
}
