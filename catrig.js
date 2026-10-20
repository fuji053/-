/* =====================================================================
   4本足の3Dモデル（猫）
   Higgsfieldで作ったモデルに、Blenderで4本足用の骨を入れたもの。
   ゲームの4本足の骨組み（solveQuad の関節の位置）に、モデルの骨の向きを毎コマ合わせます。
   しっぽの先と耳は、少し遅れてついてくる（ばね）ように動かします。
   ===================================================================== */
'use strict';
(() => {
const QR = {};
const V3 = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;
const tv1 = new V3(), tv2 = new V3(), tv3 = new V3(), tq1 = new Q(), tq2 = new Q(), tm1 = new M4();
const _c = (v, a, b) => (v < a ? a : v > b ? b : v);

// 骨の名前（Blenderで入れた骨）。R = 右半身 = 右向きのときカメラ側（ゲームの「手前 f」）
// [骨, 根元の関節, 先の関節]
const AIMQ = [
  ['hips', 'H', 'M'], ['spine', 'M', 'S'], ['neck', 'S', 'N'], ['head', 'N', 'nose'],
  ['up_FR', 'fS', 'fE'], ['lo_FR', 'fE', 'fW'], ['paw_FR', 'fW', 'fH'],
  ['up_FL', 'bS', 'bE'], ['lo_FL', 'bE', 'bW'], ['paw_FL', 'bW', 'bH'],
  ['th_BR', 'fHp', 'fK'], ['sh_BR', 'fK', 'fA'], ['mt_BR', 'fA', 'fF'], ['toe_BR', 'fF', 'fT'],
  ['th_BL', 'bHp', 'bK'], ['sh_BL', 'bK', 'bA'], ['mt_BL', 'bA', 'bF'], ['toe_BL', 'bF', 'bT'],
  ['tail_1', 'tailB', 'tail'],
];
// 向きを合わせるときの「骨の先」：子の骨（なければ _end の点）
const TIP = {
  hips: 'spine', spine: 'neck', neck: 'head', head: 'head_end',
  up_FR: 'lo_FR', lo_FR: 'paw_FR', paw_FR: 'paw_FR_end', up_FL: 'lo_FL', lo_FL: 'paw_FL', paw_FL: 'paw_FL_end',
  th_BR: 'sh_BR', sh_BR: 'mt_BR', mt_BR: 'toe_BR', toe_BR: 'toe_BR_end', th_BL: 'sh_BL', sh_BL: 'mt_BL', mt_BL: 'toe_BL', toe_BL: 'toe_BL_end',
  tail_1: 'tl_1',
};
// しっぽの先（ばね）と耳
const CHAIN = { prefix: 'tl_', n: 5, stiff: 0.2, damp: 0.8, grav: 0.04 };

QR.build = function (entry, f, scene) {
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
      m.metalness = 0.05; m.roughness = 0.85;
      if (f.slot === 1 && f.b && f.b.f[0].c.id === f.c.id) m.color = new THREE.Color(0.78, 0.88, 1.15);
      m.needsUpdate = true;
      mats.push(m);
    }
  });
  const holder = new THREE.Group(), inner = new THREE.Group();
  inner.rotation.y = Math.PI / 2; // モデルの正面（+Z）を右向き（+X）に
  inner.add(root); holder.add(inner); scene.add(holder);
  holder.updateMatrixWorld(true);
  const bones = {};
  root.traverse(o => { if (o.isBone) bones[o.name] = o; });
  // 大きさ：モデルの腰の高さを、ゲームの骨組みの腰の高さ（look.hipH）に合わせる
  const wp = o => o.getWorldPosition(new V3());
  const groundY = (() => { let m = Infinity; for (const k of ['toe_BR_end', 'toe_BL_end', 'paw_FR_end', 'paw_FL_end']) if (bones[k]) m = Math.min(m, wp(bones[k]).y); return m; })();
  const hipH = wp(bones.hips).y - groundY;
  const sc = ((f.look && f.look.hipH) || 26) * ((f.look && f.look.scale) || 1) / hipH;
  inner.scale.setScalar(sc);
  root.position.y -= groundY; // 足元を原点に
  holder.updateMatrixWorld(true);
  const rest = {};
  for (const n in bones) { const b = bones[n]; rest[n] = { q: b.quaternion.clone(), wq: b.getWorldQuaternion(new Q()), wp: b.getWorldPosition(new V3()) }; }
  const restDir = {};
  for (const [k] of AIMQ) {
    const b = bones[k], t = bones[TIP[k]];
    if (!b) continue;
    restDir[k] = t ? rest[t.name].wp.clone().sub(rest[k].wp).normalize() : new V3(0, 1, 0).applyQuaternion(rest[k].wq);
  }
  const hipsParent = bones.hips.parent;
  // 体の幅：前足と後ろ足の左右の間の半分
  const half = (a, b) => (bones[a] && bones[b] ? Math.abs(rest[a].wp.z - rest[b].wp.z) / 2 : 5);
  const Wf = half('up_FR', 'up_FL'), Wh = half('th_BR', 'th_BL');
  // しっぽの先のばね
  const cb = [];
  for (let i = 1; i <= CHAIN.n; i++) if (bones[CHAIN.prefix + i]) cb.push(bones[CHAIN.prefix + i]);
  const chain = cb.length ? {
    bones: cb,
    lens: cb.map((b, i) => { const nx = cb[i + 1] || bones[b.name + '_end']; return nx ? rest[b.name].wp.distanceTo(rest[nx.name].wp) : 3; }),
    local: cb.map((b, i) => { const nx = cb[i + 1] || bones[b.name + '_end']; const d = nx ? rest[nx.name].wp.clone().sub(rest[b.name].wp).normalize() : new V3(0, 1, 0); return d.applyQuaternion(rest[b.name].wq.clone().invert()); }),
    pts: null, prev: null,
  } : null;
  return { quad: true, holder, inner, root, bones, rest, restDir, hipsParent, chain, mats, sc, curQ: {}, Wf, Wh, P3: {}, ear: 0 };
};

// 2Dの骨組みに、体の幅で奥行きをつける（手前の足は手前、奥の足は奥）
function lift(mr, pts, f) {
  const P = mr.P3, set = (k, x, y, z) => { (P[k] || (P[k] = new V3())).set(x, y, z); return P[k]; };
  const sc = (f.look && f.look.scale) || 1;
  for (const k of ['H', 'M', 'S', 'N', 'head', 'nose', 'tailB', 'tail']) set(k, pts[k][0], pts[k][1], 0);
  for (const [s, side] of [['f', 1], ['b', -1]]) {
    const zf = side * mr.Wf, zh = side * mr.Wh;
    set(s + 'S', pts.S[0], pts.S[1], zf);
    for (const k of ['E', 'W', 'H']) set(s + k, pts[s + k][0], pts[s + k][1], zf * (k === 'E' ? 1.05 : 0.95));
    set(s + 'Hp', pts.H[0], pts.H[1], zh);
    for (const k of ['K', 'A', 'F', 'T']) set(s + k, pts[s + k][0], pts[s + k][1], zh * (k === 'K' ? 1.15 : 1));
  }
  // 前足を前に高く上げた（パンチ・引っかき）ときは、少し体の中心へ寄せる
  for (const s of ['f', 'b']) {
    const reach = _c((pts[s + 'H'][0] - pts.S[0]) / (20 * sc), 0, 1);
    P[s + 'H'].z *= 1 - 0.5 * reach; P[s + 'W'].z *= 1 - 0.35 * reach;
  }
}

// 目線：相手の方へ頭を向ける（攻撃中は当てる場所）
function lookDir(f, pts, x, y, out) {
  const m = f.state === 'move' ? f.move : null;
  let tx, ty;
  if (m && m.hits && m.hits.length && !m.hits[0].grab) {
    const fr = f.activeF >= 0 ? f.activeF : 0;
    const h = m.hits.find(h => fr <= h.f[1]) || m.hits[m.hits.length - 1];
    tx = h.x; ty = h.y;
  } else {
    const o = f.b && f.b.other(f);
    if (!o || !o.alive) return null;
    tx = (o.x - x) * f.facing; ty = (y - o.y) + 40 * ((o.look && o.look.scale) || 1);
  }
  const gx = tx - pts.head[0], gy = ty - pts.head[1];
  if (gx < 5) return null;
  const l = Math.hypot(gx, gy) || 1;
  return out.set(gx / l, _c(gy / l, -0.6, 0.6), 0).normalize();
}

QR.update = function (mr, f, pts, x, y, yaw, look, blink) {
  const { holder, bones, rest, restDir } = mr;
  holder.visible = f.alive;
  if (!f.alive) return;
  holder.position.set(x, -y, f.depthZ || 0);
  holder.rotation.y = yaw;
  holder.updateMatrixWorld(true);
  // 腰の位置
  const inv = tm1.copy(mr.hipsParent.matrixWorld).invert();
  bones.hips.position.copy(tv1.set(pts.H[0], pts.H[1], 0).applyMatrix4(mr.holder.matrixWorld).applyMatrix4(inv));
  lift(mr, pts, f);
  const P = mr.P3, cur = mr.curQ;
  for (const k in cur) delete cur[k];
  const parentQ = b => {
    const p = b.parent;
    if (cur[p.name]) return cur[p.name];
    if (p.isBone) { const q = parentQ(p).clone().multiply(rest[p.name].q); cur[p.name] = q; return q; }
    return p.getWorldQuaternion(new Q()).premultiply(tq2.copy(holder.getWorldQuaternion(new Q())).invert());
  };
  const gazeOk = !['tumble', 'hitstun', 'down', 'grabbed', 'dead', 'roll'].includes(f.state) && Math.abs((f.disp.r || 0) % 360) < 30;
  const d = tv2;
  for (const [k, a, b] of AIMQ) {
    const bone = bones[k];
    if (!bone || !restDir[k] || !P[a] || !P[b]) continue;
    const pq = parentQ(bone);
    d.subVectors(P[b], P[a]);
    if (d.lengthSq() < 1e-6) continue;
    d.normalize();
    if (k === 'head' && gazeOk) { const g = lookDir(f, pts, x, y, tv3); if (g) d.lerp(g, 0.45).normalize(); }
    tq1.setFromUnitVectors(restDir[k], d);
    const q = tq1.clone().multiply(rest[k].wq);
    // 骨の向きだけ合わせると、ねじれが残ることがある：親の回転を基準に、ねじれを最小にする
    cur[k] = q;
    bone.quaternion.copy(pq.clone().invert().multiply(q));
  }
  mr.root.updateMatrixWorld(true);
  // 耳：攻撃・やられ・シールドで後ろに伏せる（ばねでゆっくり）
  const angry = f.state === 'move' || f.state === 'shield' || f.state === 'hitstun' || f.state === 'tumble';
  mr.ear += ((angry ? 1 : 0) - mr.ear) * 0.2;
  for (const [n, s] of [['ear_R', 1], ['ear_L', -1]]) {
    const b = bones[n];
    if (!b) continue;
    b.quaternion.copy(rest[n].q).multiply(tq2.setFromAxisAngle(tv1.set(1, 0, 0), -mr.ear * 0.7)).multiply(tq1.setFromAxisAngle(tv1.set(0, 0, 1), s * mr.ear * 0.25));
  }
  mr.root.updateMatrixWorld(true);
  simulateChain(mr);
  const flash = look.col === '#ffffff' ? 0.75 : look.col === '#ffb347' ? 0.5 : 0;
  for (const m of mr.mats) {
    if (flash) m.emissive.setRGB(flash, flash * (look.col === '#ffb347' ? 0.6 : 1), flash * (look.col === '#ffb347' ? 0.2 : 1));
    else if (look.glow) m.emissive.setRGB(look.glow * 0.5, look.glow * 0.42, look.glow * 0.15);
    else if (look.dodge) m.emissive.setRGB(0.18, 0.26, 0.4);
    else if (look.aura) m.emissive.setRGB(look.aura[0], look.aura[1], look.aura[2]);
    else m.emissive.setRGB(0, 0, 0);
    m.transparent = blink; m.opacity = blink ? 0.45 : 1;
  }
};

function simulateChain(mr) {
  const ch = mr.chain;
  if (!ch) return;
  const n = ch.bones.length;
  for (const b of ch.bones) b.quaternion.copy(mr.rest[b.name].q);
  ch.bones[0].updateMatrixWorld(true);
  const root = ch.bones[0].getWorldPosition(new V3());
  const targets = [];
  let p = root.clone();
  for (let i = 0; i < n; i++) {
    const wq = ch.bones[i].getWorldQuaternion(new Q());
    p = p.clone().add(ch.local[i].clone().applyQuaternion(wq).multiplyScalar(ch.lens[i] * mr.sc / (mr.sc || 1)));
    targets.push(p);
  }
  if (!ch.pts || ch.pts[n - 1].distanceTo(targets[n - 1]) > 200) { ch.pts = targets.map(t => t.clone()); ch.prev = targets.map(t => t.clone()); }
  for (let i = 0; i < n; i++) {
    const cp = ch.pts[i], pv = ch.prev[i];
    const vx = (cp.x - pv.x) * CHAIN.damp, vy = (cp.y - pv.y) * CHAIN.damp, vz = (cp.z - pv.z) * CHAIN.damp;
    pv.copy(cp); cp.x += vx; cp.y += vy - CHAIN.grav; cp.z += vz;
    cp.lerp(targets[i], CHAIN.stiff);
  }
  let prevP = root;
  for (let i = 0; i < n; i++) {
    const cp = ch.pts[i], dd = tv1.copy(cp).sub(prevP), dl = dd.length() || 1;
    const L = targets[i].distanceTo(i ? targets[i - 1] : root);
    cp.copy(prevP).add(dd.multiplyScalar(L / dl)); prevP = cp;
  }
  for (let i = 0; i < n; i++) {
    const b = ch.bones[i];
    b.updateMatrixWorld(true);
    const head = b.getWorldPosition(new V3()), wq = b.getWorldQuaternion(new Q());
    const curDir = ch.local[i].clone().applyQuaternion(wq);
    const want = ch.pts[i].clone().sub(head);
    if (want.lengthSq() < 1e-6) continue;
    want.normalize();
    const nw = new Q().setFromUnitVectors(curDir, want).multiply(wq);
    b.quaternion.copy(b.parent.getWorldQuaternion(new Q()).invert().multiply(nw));
    b.updateMatrixWorld(true);
  }
}

QR.handInfo = function (mr) {
  const inv = tm1.copy(mr.holder.matrixWorld).invert();
  const g = k => (mr.bones[k] ? mr.bones[k].getWorldPosition(new V3()).applyMatrix4(inv) : new V3());
  return { fH: g('paw_FR'), fE: g('lo_FR'), bH: g('paw_FL'), bE: g('lo_FL') };
};
QR.remove = function (mr, scene) { scene.remove(mr.holder); };
window.QuadRig = QR;
})();
