/* =====================================================================
   3Dモデルのキャラ（Higgsfieldで作ってBlenderで骨を足したモデル）
   ゲームの骨組み（関節の角度）から、モデルの骨の向きを毎コマ合わせます。
   髪とスカートの布は「少し遅れてついてくる」ように、ばねで動かします。
   ===================================================================== */
'use strict';
(() => {
const MR = {};
const cache = new Map(); // url -> { gltf, ready, failed, waiters }
const V3 = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;
const tv1 = new V3(), tv2 = new V3(), tv3 = new V3(), tq1 = new Q(), tq2 = new Q(), tm1 = new M4();

MR.load = function (url) {
  let e = cache.get(url);
  if (e) return e;
  e = { ready: false, failed: false, gltf: null };
  cache.set(url, e);
  try {
    new THREE.GLTFLoader().load(url, g => { e.gltf = g; e.ready = true; }, undefined, () => { e.failed = true; });
  } catch (err) { e.failed = true; }
  return e;
};

// 骨の名前（Meshyの自動の骨）
const B = {
  hips: 'Hips', spine0: 'Spine02', spine1: 'Spine01', spine2: 'Spine', neck: 'neck', head: 'Head',
  rArm: 'RightArm', rFore: 'RightForeArm', rHand: 'RightHand', lArm: 'LeftArm', lFore: 'LeftForeArm', lHand: 'LeftHand',
  rUp: 'RightUpLeg', rLeg: 'RightLeg', rFoot: 'RightFoot', lUp: 'LeftUpLeg', lLeg: 'LeftLeg', lFoot: 'LeftFoot',
};
// ゲームの「手前（f）」の手足 = モデルの右、「奥（b）」= 左（右向きのとき右半身がカメラ側）
// どの骨を、ゲームの骨組みのどの2点の向きに合わせるか
const AIM = [
  ['hips', 'H', 'N'], ['spine0', 'H', 'N'], ['spine1', 'H', 'N'], ['spine2', 'H', 'N'],
  ['neck', 'N', 'head'], ['head', 'N', 'head'],
  ['rArm', 'fS', 'fE', 1], ['rFore', 'fE', 'fH', 1], ['lArm', 'bS', 'bE', -1], ['lFore', 'bE', 'bH', -1],
  ['rUp', 'fHp', 'fK', 0.5], ['rLeg', 'fK', 'fF', 0.5], ['lUp', 'bHp', 'bK', -0.5], ['lLeg', 'bK', 'bF', -0.5],
];
// 向きを合わせるときの、ねらう子の骨
const CHILD = { hips: 'spine0', spine0: 'spine1', spine1: 'spine2', spine2: 'neck', neck: 'head', head: null,
  rArm: 'rFore', rFore: 'rHand', lArm: 'lFore', lFore: 'lHand', rUp: 'rLeg', rLeg: 'rFoot', lUp: 'lLeg', lLeg: 'lFoot' };
const CHAINS = [
  { prefix: 'hair_', n: 4, stiff: 0.07, damp: 0.86, grav: 0.35, collide: 'body' },
  { prefix: 'skirtF_', n: 3, stiff: 0.16, damp: 0.8, grav: 0.3, collide: 'legs' },
  { prefix: 'skirtB_', n: 3, stiff: 0.16, damp: 0.8, grav: 0.3, collide: 'legs' },
];

MR.build = function (entry, f, scene) {
  const src = entry.gltf.scene;
  const root = THREE.SkeletonUtils ? THREE.SkeletonUtils.clone(src) : src.clone(true);
  const mats = [];
  root.traverse(o => {
    if (o.isMesh) {
      o.frustumCulled = false;
      o.material = o.material.clone();
      const m = o.material;
      for (const k of ['map', 'normalMap', 'metalnessMap', 'roughnessMap']) if (m[k]) { m[k].encoding = THREE.LinearEncoding; m[k].needsUpdate = true; }
      m.emissiveMap = null; m.emissive = new THREE.Color(0, 0, 0);
      m.metalness = 0.1; m.roughness = 0.75; // 環境光の映り込みがないので、金属っぽさを弱めて暗くならないように
      if (f.slot === 1 && f.b && f.b.f[0].c.id === f.c.id) m.color = new THREE.Color(0.78, 0.88, 1.15); // 同じキャラ同士は色を少し変える
      m.needsUpdate = true;
      mats.push(m);
    }
  });
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI / 2; // モデルの正面（+Z）を右向き（+X）に
  inner.add(root); holder.add(inner); scene.add(holder);
  holder.updateMatrixWorld(true);
  const bones = {};
  for (const k in B) bones[k] = root.getObjectByName(B[k]);
  // 大きさ：モデルの脚の長さを、ゲームの脚の長さ（47）に合わせる
  const wp = o => o.getWorldPosition(new V3());
  const legLen = wp(bones.rUp).distanceTo(wp(bones.rLeg)) + wp(bones.rLeg).distanceTo(wp(bones.rFoot));
  const sc = 47 / legLen;
  inner.scale.setScalar(sc);
  holder.updateMatrixWorld(true);
  // 立ち姿勢（骨の初期状態）を記録
  const rest = {};
  const all = [];
  root.traverse(o => { if (o.isBone) all.push(o); });
  for (const b of all) {
    rest[b.name] = { q: b.quaternion.clone(), p: b.position.clone(), wq: b.getWorldQuaternion(new Q()), wp: b.getWorldPosition(new V3()) };
  }
  const restDir = {};
  for (const k in CHILD) {
    const b = bones[k], c = CHILD[k] ? bones[CHILD[k]] : null;
    if (!b) continue;
    if (c) restDir[k] = rest[c.name].wp.clone().sub(rest[b.name].wp).normalize();
    else restDir[k] = new V3(0, 1, 0).applyQuaternion(rest[b.name].wq).normalize();
  }
  // 頭の向き（頭の骨は子の向きでなく「上」を基準にする）
  if (bones.head) {
    const hf = root.getObjectByName('head_end');
    if (hf) restDir.head = rest[hf.name].wp.clone().sub(rest[bones.head.name].wp).normalize();
  }
  const hipsParent = bones.hips.parent;
  const hipsParentWQ = hipsParent.getWorldQuaternion(new Q());
  const hipsParentInv = new M4().copy(hipsParent.matrixWorld).invert();
  // 揺れもの（髪・布）
  const chains = [];
  for (const c of CHAINS) {
    const bs = [];
    for (let i = 1; i <= c.n; i++) { const b = root.getObjectByName(c.prefix + i); if (b) bs.push(b); }
    if (!bs.length) continue;
    const lens = bs.map((b, i) => {
      const nxt = bs[i + 1];
      if (nxt) return rest[b.name].wp.distanceTo(rest[nxt.name].wp);
      return rest[b.name].wp.distanceTo(rest[bs[i - 1] ? bs[i - 1].name : b.name].wp) || 10;
    });
    const dirs = bs.map((b, i) => {
      const nxt = bs[i + 1];
      if (nxt) return rest[nxt.name].wp.clone().sub(rest[b.name].wp).normalize();
      return rest[b.name].wp.clone().sub(rest[bs[i - 1].name].wp).normalize();
    });
    const local = bs.map((b, i) => dirs[i].clone().applyQuaternion(rest[b.name].wq.clone().invert()));
    chains.push(Object.assign({}, c, { bones: bs, lens, local, pts: null, prev: null }));
  }
  return { holder, inner, root, bones, rest, restDir, hipsParentWQ, hipsParentInv, chains, mats, sc, curQ: {}, lastX: null };
};

// 2点（ゲームの骨組み：前向き・上がプラス）→ 3Dの向き
function dirOf(pts, a, b, zBias, out) {
  out.set(pts[b][0] - pts[a][0], pts[b][1] - pts[a][1], 0);
  const l = out.length() || 1;
  out.multiplyScalar(1 / l);
  if (zBias) { out.z += zBias * 0.22; out.normalize(); }
  return out;
}

MR.update = function (mr, f, pts, x, y, yaw, look, blink) {
  const { holder, bones, rest, restDir } = mr;
  holder.visible = f.alive;
  if (!f.alive) return;
  holder.position.set(x, -y, 0);
  holder.rotation.y = yaw;
  holder.updateMatrixWorld(true);
  // 腰の位置（ゲームの骨盤の位置へ）
  const hipsB = bones.hips;
  const target = tv1.set(pts.H[0], pts.H[1], 0);
  // holder基準 → 腰の親の座標へ
  hipsB.position.copy(target.applyMatrix4(mr.hipsParentInv));
  // 体のひねり
  const tw = Math.max(-1.2, Math.min(1.2, f.disp.tw || 0));
  const cur = mr.curQ;
  // 骨を親から順に向けていく（holder基準の回転で計算）
  const order = ['hips', 'spine0', 'spine1', 'spine2', 'neck', 'head', 'rArm', 'rFore', 'lArm', 'lFore', 'rUp', 'rLeg', 'lUp', 'lLeg'];
  const aimMap = {};
  for (const a of AIM) aimMap[a[0]] = a;
  const parentQ = b => {
    const p = b.parent;
    if (cur[p.name]) return cur[p.name];
    // 動かしていない親：親の親から計算
    if (p.isBone) {
      const pq = parentQ(p);
      const q = pq.clone().multiply(rest[p.name].q);
      cur[p.name] = q;
      return q;
    }
    return mr.hipsParentWQ;
  };
  for (const k in cur) delete cur[k];
  for (const k of order) {
    const b = bones[k];
    if (!b) continue;
    const a = aimMap[k];
    const pq = parentQ(b);
    const d = dirOf(pts, a[1], a[2], a[3] || 0, tv2);
    // 立ち姿勢の向き → 目標の向き
    tq1.setFromUnitVectors(restDir[k], d);
    const q = tq1.clone().multiply(rest[b.name].wq);
    if (k === 'spine2' && tw) q.premultiply(tq2.setFromAxisAngle(d, tw * 0.45));
    if (k === 'hips' && tw) q.premultiply(tq2.setFromAxisAngle(d, tw * 0.15));
    cur[b.name] = q;
    b.quaternion.copy(pq.clone().invert().multiply(q));
  }
  mr.root.updateMatrixWorld(true);
  // 揺れもの
  simulateChains(mr);
  // 見た目（ヒット時に白く光るなど）
  const flash = look.col === '#ffffff' ? 0.75 : look.col === '#ffb347' ? 0.5 : 0;
  for (const m of mr.mats) {
    if (flash) m.emissive.setRGB(flash, flash * (look.col === '#ffb347' ? 0.6 : 1), flash * (look.col === '#ffb347' ? 0.2 : 1));
    else if (look.glow) m.emissive.setRGB(look.glow * 0.5, look.glow * 0.42, look.glow * 0.15);
    else m.emissive.setRGB(0, 0, 0);
    m.transparent = blink; m.opacity = blink ? 0.45 : 1;
  }
};

function simulateChains(mr) {
  const capsules = { body: [], legs: [] };
  const P = k => mr.bones[k] ? mr.bones[k].getWorldPosition(new V3()) : null;
  const hp = P('hips'), nk = P('neck');
  if (hp && nk) capsules.body.push([hp, nk, 0.12 * mr.sc]);
  for (const [a, b] of [['rUp', 'rLeg'], ['rLeg', 'rFoot'], ['lUp', 'lLeg'], ['lLeg', 'lFoot']]) {
    const pa = P(a), pb = P(b);
    if (pa && pb) capsules.legs.push([pa, pb, 0.075 * mr.sc]);
  }
  for (const ch of mr.chains) {
    const n = ch.bones.length;
    // いったん立ち姿勢の角度に戻して、「揺れなかった場合」の位置を出す
    for (const b of ch.bones) b.quaternion.copy(mr.rest[b.name].q);
    ch.bones[0].updateMatrixWorld(true);
    const root = ch.bones[0].getWorldPosition(new V3());
    const targets = [];
    {
      let p = root.clone();
      for (let i = 0; i < n; i++) {
        const wq = ch.bones[i].getWorldQuaternion(new Q());
        p = p.clone().add(ch.local[i].clone().applyQuaternion(wq).multiplyScalar(ch.lens[i]));
        targets.push(p);
      }
    }
    if (!ch.pts || ch.pts[n - 1].distanceTo(targets[n - 1]) > 250) {
      ch.pts = targets.map(t => t.clone()); ch.prev = targets.map(t => t.clone());
    }
    // 少し遅れてついてくる（ばね）
    for (let i = 0; i < n; i++) {
      const cp = ch.pts[i], pv = ch.prev[i];
      const vx = (cp.x - pv.x) * ch.damp, vy = (cp.y - pv.y) * ch.damp, vz = (cp.z - pv.z) * ch.damp;
      pv.copy(cp);
      cp.x += vx; cp.y += vy - ch.grav; cp.z += vz;
      cp.lerp(targets[i], ch.stiff);
    }
    for (let it = 0; it < 3; it++) {
      let prevP = root;
      for (let i = 0; i < n; i++) {
        const cp = ch.pts[i];
        const d = tv1.copy(cp).sub(prevP);
        const dl = d.length() || 1;
        cp.copy(prevP).add(d.multiplyScalar(ch.lens[i] / dl));
        for (const [a, b, r] of capsules[ch.collide]) pushOut(cp, a, b, r);
        prevP = cp;
      }
    }
    // 骨を、ばねの点の方へ向ける
    for (let i = 0; i < n; i++) {
      const b = ch.bones[i];
      b.updateMatrixWorld(true);
      const head = b.getWorldPosition(new V3());
      const wq = b.getWorldQuaternion(new Q());
      const curDir = ch.local[i].clone().applyQuaternion(wq);
      const want = ch.pts[i].clone().sub(head);
      if (want.lengthSq() < 1e-6) continue;
      want.normalize();
      const newWq = new Q().setFromUnitVectors(curDir, want).multiply(wq);
      const pwq = b.parent.getWorldQuaternion(new Q());
      b.quaternion.copy(pwq.invert().multiply(newWq));
      b.updateMatrixWorld(true);
    }
  }
}
function pushOut(p, a, b, r) {
  const ab = tv2.copy(b).sub(a), ap = tv3.copy(p).sub(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / (ab.lengthSq() || 1)));
  const c = ab.multiplyScalar(t).add(a);
  const d = p.clone().sub(c), l = d.length();
  if (l < r && l > 1e-4) p.copy(c).add(d.multiplyScalar(r / l));
}

// 弓などを持たせるための、手の位置（holder基準＝ゲームの骨組みと同じ座標）
MR.handInfo = function (mr) {
  const inv = tm1.copy(mr.holder.matrixWorld).invert();
  const g = k => mr.bones[k].getWorldPosition(new V3()).applyMatrix4(inv);
  return { fH: g('rHand'), fE: g('rFore'), bH: g('lHand'), bE: g('lFore') };
};
MR.remove = function (mr, scene) { scene.remove(mr.holder); };
window.ModelRig = MR;
})();
