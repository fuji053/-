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

// ふちの光（リムライト）：キャラの輪郭が明るく光って、背景から浮き上がって見える（スマブラのような見え方）
function addRim(m, col, str) {
  m.onBeforeCompile = sh => {
    sh.uniforms.rimColor = { value: new THREE.Color(col || 0xdfe9ff) };
    sh.uniforms.rimStr = { value: str || 0.32 };
    sh.fragmentShader = 'uniform vec3 rimColor; uniform float rimStr;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.2);\n  totalEmissiveRadiance += rimColor * rimF * rimStr;');
  };
  m.customProgramCacheKey = () => 'rim';
}
window.addRim = addRim;
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
  rToe: 'RightToeBase', lToe: 'LeftToeBase',
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
  rArm: 'rFore', rFore: 'rHand', lArm: 'lFore', lFore: 'lHand', rUp: 'rLeg', rLeg: 'rFoot', lUp: 'lLeg', lLeg: 'lFoot',
  rFoot: 'rToe', lFoot: 'lToe' };
const CHAINS = [
  { prefix: 'hair_', n: 4, stiff: 0.07, damp: 0.86, grav: 0.35, collide: 'body' },
  { prefix: 'skirtF_', n: 3, stiff: 0.16, damp: 0.8, grav: 0.3, collide: 'legs' },
  { prefix: 'skirtB_', n: 3, stiff: 0.16, damp: 0.8, grav: 0.3, collide: 'legs' },
  { prefix: 'tail_', n: 4, stiff: 0.12, damp: 0.84, grav: 0.12, collide: 'legs' },   // しっぽ（狐の剣士）
  { prefix: 'scarf_', n: 4, stiff: 0.06, damp: 0.88, grav: 0.28, collide: 'body' },  // マフラーのたれ（狐の剣士）
];

MR.build = function (entry, f, scene) {
  if (f.look && f.look.quad && window.QuadRig) return window.QuadRig.build(entry, f, scene); // 4本足（猫）
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
      addRim(m);
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
  // 大きさ：モデルの脚の長さを、ゲームの脚の長さ（47 × キャラの大きさ）に合わせる
  const wp = o => o.getWorldPosition(new V3());
  const legLen = wp(bones.rUp).distanceTo(wp(bones.rLeg)) + wp(bones.rLeg).distanceTo(wp(bones.rFoot));
  const sc = 47 * ((f.look && f.look.scale) || 1) / legLen * ((f.look && f.look.modelScale) || 1); // modelScale：脚が短いちびキャラなどの見た目の大きさ調整
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
  // 体の幅（肩幅・腰幅の半分）：2Dの骨組みに奥行きをつけるときに使う
  const half = (a, b) => (bones[a] && bones[b] ? rest[bones[a].name].wp.distanceTo(rest[bones[b].name].wp) / 2 : 6);
  const Ws = half('rArm', 'lArm'), Wh = half('rUp', 'lUp');
  const hipRestY = (rest[bones.hips.name].wp.y - Math.min(rest[bones.rFoot.name].wp.y, rest[bones.lFoot.name].wp.y)) + 2 * ((f.look && f.look.scale) || 1); // 立った時の腰の高さ（ゲームの単位）
  return { hipRestY, holder, inner, root, bones, rest, restDir, hipsParentWQ, hipsParentInv, chains, mats, sc, curQ: {}, lastX: null, Ws, Wh, P3: {} };
};

// 2点（ゲームの骨組み：前向き・上がプラス）→ 3Dの向き
function dirOf(pts, a, b, zBias, out) {
  out.set(pts[b][0] - pts[a][0], pts[b][1] - pts[a][1], 0);
  const l = out.length() || 1;
  out.multiplyScalar(1 / l);
  if (zBias) { out.z += zBias * 0.22; out.normalize(); }
  return out;
}

// 2Dの骨組み（画面に平行な板）を、体の厚み・ひねりのある3Dの関節位置に起こす
//  ・腰と胸を別々にひねる（パンチで肩が前に出る）
//  ・前に伸ばした手は体の中心線に向かう／曲げたひじと膝は少し外に張る
const _c = (v, a, b) => (v < a ? a : v > b ? b : v);
function lift3D(mr, f, pts) {
  const P = mr.P3, D = f.disp, sc = (f.look && f.look.scale) || 1;
  const tw = _c(D.tw || 0, -1.2, 1.2);
  const yawH = tw * 0.32, yawC = tw * 0.85; // 腰は少し、胸は大きくひねる
  const sH = Math.sin(yawH), cH = Math.cos(yawH), sC = Math.sin(yawC), cC = Math.cos(yawC);
  const set = (k, x, y, z) => { (P[k] || (P[k] = new V3())).set(x, y, z); return P[k]; };
  set('H', pts.H[0], pts.H[1], 0); set('N', pts.N[0], pts.N[1], 0); set('head', pts.head[0], pts.head[1], 0);
  const Ws = mr.Ws, Wh = mr.Wh, S = pts.S;
  const armL = (18 + 17) * sc, legL = (24 + 23) * sc;
  for (const [k, side] of [['f', 1], ['b', -1]]) {
    // 肩（胸のひねりで前後に動く）
    const sx = S[0] + side * Ws * sC, sz = side * Ws * cC;
    set(k + 'S', sx, S[1], sz);
    const ex = pts[k + 'E'][0] - pts[k + 'S'][0], ey = pts[k + 'E'][1] - pts[k + 'S'][1];
    const hx = pts[k + 'H'][0] - pts[k + 'E'][0], hy = pts[k + 'H'][1] - pts[k + 'E'][1];
    const reach = _c((pts[k + 'H'][0] - pts[k + 'S'][0]) / armL, -1, 1);
    const fold = _c(1 - Math.hypot(pts[k + 'H'][0] - pts[k + 'S'][0], pts[k + 'H'][1] - pts[k + 'S'][1]) / armL, 0, 1);
    const conv = Math.max(0, reach);
    const hz = sz * (1 - 0.8 * conv) + (reach < 0 ? sz * 0.25 * -reach : 0) + side * Ws * 0.25 * fold;
    const ez = sz * (1 - 0.45 * conv) + side * Ws * 0.45 * fold;
    // 腕を体の横へ開く（fy・by）：肩を中心に、縦の軸のまわりで回す（ラリアットで腕が体の横から前へ回る）
    const ya = side * ((side > 0 ? D.fy : D.by) || 0) * Math.PI / 180;
    if (ya) {
      const c = Math.cos(ya), s = Math.sin(ya), rot = (x, z) => [x * c - z * s, x * s + z * c];
      const [e1, e2] = rot(ex, ez - sz), [h1, h2] = rot(ex + hx, hz - sz);
      set(k + 'E', sx + e1, S[1] + ey, sz + e2);
      set(k + 'H', sx + h1, S[1] + ey + hy, sz + h2);
    } else {
      set(k + 'E', sx + ex, S[1] + ey, ez);
      set(k + 'H', sx + ex + hx, S[1] + ey + hy, hz);
    }
    // 股関節（腰のひねり）→ 膝は少し外へ、足は腰の真下あたり
    const hpx = pts.H[0] + side * Wh * sH, hpz = side * Wh * cH;
    set(k + 'Hp', hpx, pts.H[1], hpz);
    const kx = pts[k + 'K'][0] - pts[k + 'Hp'][0], ky = pts[k + 'K'][1] - pts[k + 'Hp'][1];
    const fx = pts[k + 'F'][0] - pts[k + 'K'][0], fy = pts[k + 'F'][1] - pts[k + 'K'][1];
    const lfold = _c(1 - Math.hypot(pts[k + 'F'][0] - pts[k + 'Hp'][0], pts[k + 'F'][1] - pts[k + 'Hp'][1]) / legL, 0, 1);
    const kz = hpz * (1.05 + 0.5 * lfold), fz = hpz * 1.02;
    const la = side * ((side > 0 ? D.fly : D.bly) || 0) * Math.PI / 180; // 脚を横へ開く（回し蹴り）
    if (la) {
      const c = Math.cos(la), s = Math.sin(la), rot = (x, z) => [x * c - z * s, x * s + z * c];
      const [k1, k2] = rot(kx, kz - hpz), [f1, f2] = rot(kx + fx, fz - hpz);
      set(k + 'K', hpx + k1, pts.H[1] + ky, hpz + k2);
      set(k + 'F', hpx + f1, pts.H[1] + ky + fy, hpz + f2);
    } else {
      set(k + 'K', hpx + kx, pts.H[1] + ky, kz);
      set(k + 'F', hpx + kx + fx, pts.H[1] + ky + fy, fz);
    }
  }
  return { yawH, yawC };
}
const AIM3 = {
  hips: ['H', 'N'], spine0: ['H', 'N'], spine1: ['H', 'N'], spine2: ['H', 'N'], neck: ['N', 'head'], head: ['N', 'head'],
  rArm: ['fS', 'fE'], rFore: ['fE', 'fH'], lArm: ['bS', 'bE'], lFore: ['bE', 'bH'],
  rUp: ['fHp', 'fK'], rLeg: ['fK', 'fF'], lUp: ['bHp', 'bK'], lLeg: ['bK', 'bF'],
};
const UPV = new V3(0, 1, 0);
// 目線：ふだんは相手の顔、攻撃中は当てる場所、撃つ技は撃つ方向を見る
const _gUp = new V3();
function gaze(mr, f, pts, x, y) {
  const st = f.state, D = f.disp;
  const look = (f.c.look && f.c.look.gaze) || {};
  let w = 0.75;
  if (['tumble', 'hitstun', 'down', 'grabbed', 'dead', 'ledge', 'roll'].includes(st) || Math.abs(D.r || 0) % 360 > 30) w = 0;
  if (w === 0) return { up: _gUp.copy(UPV), w: 0, turn: 0 };
  const sc = (f.look && f.look.scale) || 1;
  let tx, ty;
  const m = st === 'move' ? f.move : null;
  if (m && m.hits && m.hits.length && !m.hits[0].grab && !m.hits[0].cgrab) {
    // 攻撃中：次に当たる（または当たっている）場所を見る
    const fr = f.activeF >= 0 ? f.activeF : 0;
    const h = m.hits.find(h => fr <= h.f[1]) || m.hits[m.hits.length - 1];
    tx = h.x; ty = h.y;
  } else if (m && m.events && m.events.some(e => e.proj)) {
    const e = m.events.find(e => e.proj);
    const a = (e.ang || 0) * Math.PI / 180;
    tx = (e.x || 0) + Math.cos(a) * 200; ty = (e.y || 60) + Math.sin(a) * 200;
  } else {
    const o = f.b && f.b.other(f);
    if (!o || !o.alive) { tx = 200; ty = pts.head[1]; }
    else { tx = (o.x - x) * f.facing; ty = (y - o.y) + 72 * ((o.look && o.look.scale) || 1); }
  }
  const hx = pts.head[0], hy = pts.head[1];
  let gx = tx - hx, gy = ty - hy;
  let turn = 0;
  if (gx < -8) { // 後ろを見る：カメラ側の肩ごしにふり向く
    turn = (f.facing > 0 ? -1 : 1) * 1.15; gx = -gx;
  }
  const l = Math.hypot(gx, gy) || 1; gx /= l; gy /= l;
  // 見上げ・見下ろしは±40度まで
  const lim = 0.64; if (gy > lim) { gy = lim; gx = Math.sqrt(1 - lim * lim); } else if (gy < -lim) { gy = -lim; gx = Math.sqrt(1 - lim * lim); }
  // 顔の「上」方向 ＝ 目線を90度起こした向き。キャラのクセ（あごの角度・首のかしげ）を足す
  const pitch = (look.pitch || 0) * Math.PI / 180;
  let ux = -gy, uy = gx;
  const c = Math.cos(pitch), s2 = Math.sin(pitch);
  const rx = ux * c - uy * s2, ry = ux * s2 + uy * c;
  _gUp.set(rx, ry, (look.tilt || 0) * (f.facing > 0 ? 1 : -1)).normalize();
  return { up: _gUp, w: (look.w !== undefined ? look.w : 1) * w, turn };
}

MR.update = function (mr, f, pts, x, y, yaw, look, blink) {
  if (mr.quad) return window.QuadRig.update(mr, f, pts, x, y, yaw, look, blink);
  const { holder, bones, rest, restDir } = mr;
  holder.visible = f.alive;
  if (!f.alive) return;
  holder.position.set(x, -y, f.depthZ || 0);
  holder.rotation.y = yaw;
  holder.updateMatrixWorld(true);
  // 腰の位置（ゲームの骨盤の位置へ）
  const hipsB = bones.hips;
  const target = tv1.set(pts.H[0], pts.H[1], 0);
  // モーション再生中は、腰の高さもモーションに合わせる（脚がのびた分だけ腰が上がる）
  mocapStep(mr, f);
  if (mr.mcW > 0 && mr.mcCur && mr.mcCur.hy) {
    const hy = hipsYOf(mr.mcCur);
    const hy2 = mr.mcPrev && mr.mcX < 1 ? (mr.mcPrev.hy ? hipsYOf(mr.mcPrev) : target.y / mr.hipRestY) : hy;
    const h = hy2 + (hy - hy2) * (mr.mcX ?? 1);
    target.y = target.y + (mr.hipRestY * h - target.y) * mr.mcW;
  }
  hipsB.position.copy(target.applyMatrix4(mr.hipsParentInv));
  // 3Dの関節位置とひねり
  const { yawH, yawC } = lift3D(mr, f, pts);
  const P = mr.P3;
  const gz = gaze(mr, f, pts, x, y);
  const twist = { hips: yawH, spine0: yawH + (yawC - yawH) * 0.3, spine1: yawH + (yawC - yawH) * 0.65, spine2: yawC,
    neck: yawC * 0.45 + gz.turn * 0.4, head: yawC * 0.15 + gz.turn * 0.6 };
  const cur = mr.curQ;
  // 骨を親から順に向けていく（holder基準の回転で計算）
  const order = ['hips', 'spine0', 'spine1', 'spine2', 'neck', 'head', 'rArm', 'rFore', 'lArm', 'lFore', 'rUp', 'rLeg', 'lUp', 'lLeg', 'rFoot', 'lFoot'];
  const parentQ = b => {
    const p = b.parent;
    if (cur[p.name]) return cur[p.name];
    if (p.isBone) {
      const pq = parentQ(p);
      const q = pq.clone().multiply(rest[p.name].q);
      cur[p.name] = q;
      return q;
    }
    return mr.hipsParentWQ;
  };
  for (const k in cur) delete cur[k];
  const d = tv2;
  for (const k of order) {
    const b = bones[k];
    if (!b || !restDir[k]) continue;
    const pq = parentQ(b);
    if (k === 'rFoot' || k === 'lFoot') {
      // 足：地面ではつま先を前に（かかとが浮いていれば、つま先立ち）。空中ではつま先を少し伸ばす
      const s = k === 'rFoot' ? 'f' : 'b', side = s === 'f' ? 1 : -1;
      const ank = P[s + 'F'], knee = P[s + 'K'];
      const h = pts[s + 'F'][1];
      if (f.grounded && h < 12) {
        let lift = _c(h / 9, 0, 1);
        // 反対の足を高く蹴り上げているときは、軸足のかかとが上がる（つま先立ち）
        if (pts[(s === 'f' ? 'b' : 'f') + 'F'][1] > 34) lift = Math.max(lift, 0.4);
        d.set(1, -0.12 - 1.6 * lift, side * 0.18).normalize();
      } else {
        d.subVectors(ank, knee).normalize().multiplyScalar(0.5).add(tv3.set(0.75, -0.1, side * 0.1)).normalize();
      }
    } else {
      const a = AIM3[k];
      d.subVectors(P[a[1]], P[a[0]]);
      if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
      d.normalize();
      // 頭：体が傾いても目線はねらう先へ（キャラごとのクセ：あごの上げ下げ・首のかしげ）
      if (k === 'head' || k === 'neck') {
        d.lerp(UPV, k === 'head' ? 0.35 : 0.2).normalize();
        if (gz.w > 0) d.lerp(gz.up, gz.w * (k === 'head' ? 1 : 0.5)).normalize();
      }
    }
    tq1.setFromUnitVectors(restDir[k], d);
    const q = tq1.clone().multiply(rest[b.name].wq);
    const tw = twist[k];
    if (tw) q.premultiply(tq2.setFromAxisAngle(d, tw));
    cur[b.name] = q;
    b.quaternion.copy(pq.clone().invert().multiply(q));
  }
  // 人の動きのデータ（モーション）がある動きは、それで上書きする（切りかわりはなめらかに混ぜる）
  applyMocap(mr, f);
  mr.root.updateMatrixWorld(true);
  // 揺れもの
  simulateChains(mr);
  // 見た目（ヒット時に白く光るなど）
  const flash = look.col === '#ffffff' ? 0.75 : look.col === '#ffb347' ? 0.5 : 0;
  for (const m of mr.mats) {
    if (flash) m.emissive.setRGB(flash, flash * (look.col === '#ffb347' ? 0.6 : 1), flash * (look.col === '#ffb347' ? 0.2 : 1));
    else if (look.glow) m.emissive.setRGB(look.glow * 0.5, look.glow * 0.42, look.glow * 0.15);
    else if (look.dodge) m.emissive.setRGB(0.18, 0.26, 0.4); // 回避中（無敵）はうっすら青白く光る
    else m.emissive.setRGB(0, 0, 0);
    m.transparent = blink; m.opacity = blink ? 0.45 : 1;
  }
};

// どの状態でどのモーションを使うか
//  t：モーションのどこを再生するか（0〜1）/ hy：腰の高さもモーションに合わせるか（空中はゲーム側が動かすので合わせない）/ arms：腕もモーションにするか
const TAU = Math.PI * 2;
const cl01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
function mocapFor(f) {
  const M = window.MOCAP;
  if (!M || (f.look && f.look.noMocap)) return null;
  if (f.__mcForce) return f.__mcForce; // 確認用
  const st = f.state, loop = (clock, name) => ((clock / M[name].dur) % 1 + 1) % 1;
  switch (st) {
    case 'run': return { name: 'run', t: ((f.walkPhase % TAU) + TAU) % TAU / TAU, hy: true };
    case 'idle': return { name: 'idle', t: loop((f.anim || 0) / 60, 'idle'), hy: true };
    case 'walk': return { name: 'walk', t: loop(f.walkClock || 0, 'walk'), hy: true };
    case 'squat': return { name: 'jump', t: 0.1 + 0.14 * cl01(f.stateT / 4), hy: true };
    case 'air': {
      if (f.flipT < (f.djDur || 24)) return null; // 空中ジャンプはキャラごとの動き
      return { name: 'jump', t: 0.31 + 0.19 * cl01((f.vy + 12) / 18), hy: false };
    }
    case 'land': return { name: 'jump', t: 0.6 + 0.12 * cl01(f.stateT / 10), hy: true };
    case 'hitstun': return { name: 'hit', t: 0.02 + 0.34 * cl01(f.stateT / Math.max(8, f.stateT + f.timer)), hy: f.grounded, arms: true };
    case 'tumble': return f.stateT < (f.launchT || 0) + 6 ? { name: 'fly', t: 0.1 + 0.24 * cl01(f.stateT / ((f.launchT || 0) + 6)), hy: false, arms: true } : null;
    case 'down': return { name: 'fly', t: 0.6, hy: true, arms: true };
    case 'roll': { const u = cl01(f.stateT / 30); return { name: 'roll', t: f.rollDir === f.facing ? 0.12 + 0.8 * u : 0.92 - 0.8 * u, hy: true, arms: true }; }
    case 'shield': case 'shieldstun': return { name: 'block', t: 0.25 + 0.05 * Math.sin((f.anim || 0) * 0.03), hy: true };
  }
  return null;
}
function hipsYOf(cur) {
  const c = window.MOCAP[cur.name];
  if (!c.hipsY || !c.hipsY.length) return 1;
  const u = cur.t * c.n, i0 = Math.floor(u) % c.n, i1 = (i0 + 1) % c.n, fr = u - Math.floor(u);
  return (c.hipsY[i0] * (1 - fr) + c.hipsY[i1] * fr) / c.restHipsY;
}
// 1コマごと：どのモーションを、どれだけ混ぜるか（モーション同士も、なめらかに切りかえる）
function mocapStep(mr, f) {
  const want = mocapFor(f);
  if (want) {
    if (mr.mcCur && mr.mcCur.name !== want.name && mr.mcW > 0) { mr.mcPrev = mr.mcCur; mr.mcX = 0; }
    mr.mcCur = want;
  }
  if (mr.mcX !== undefined && mr.mcX < 1) mr.mcX = Math.min(1, mr.mcX + 0.2);
  mr.mcW = Math.max(0, Math.min(1, (mr.mcW || 0) + (want ? 0.2 : -0.2))); // 5コマかけて切りかえる
}
const _mq0 = new Q(), _mq1 = new Q(), _mqr = new Q(), _mq2 = new Q();
const MC_W = { Hips: 0.6, Spine02: 0.8 }; // 前のめりが強すぎるので、腰と背中は少しだけ弱める
const ARMED = { katana: 0.25, bow: 0.2 };
// モーションの1つの骨の回転（このモデルの立ち姿勢に直したもの）
function sampleBone(mr, b, cur, out) {
  const c = window.MOCAP[cur.name], r = c.rot[b.__mcName], cr = c.rest[b.__mcName];
  if (!r) return false;
  const n = c.n, u = cur.t * n, i0 = Math.floor(u) % n, i1 = (i0 + 1) % n, fr = u - Math.floor(u);
  _mq0.set(r[i0 * 4], r[i0 * 4 + 1], r[i0 * 4 + 2], r[i0 * 4 + 3]);
  _mq2.set(r[i1 * 4], r[i1 * 4 + 1], r[i1 * 4 + 2], r[i1 * 4 + 3]);
  _mq0.slerp(_mq2, fr);
  // モーションの「立ち姿勢からの変化」を、このモデルの立ち姿勢に足す
  _mqr.set(cr[0], cr[1], cr[2], cr[3]).invert().multiply(_mq0);
  out.copy(mr.rest[b.name].q).multiply(_mqr);
  return true;
}
const FREE = ['LeftShoulder', 'RightShoulder', 'LeftHand', 'RightHand', 'LeftToeBase', 'RightToeBase']; // 今の動きでは動かさない骨
function applyMocap(mr, f) {
  if (!mr.freeBones) mr.freeBones = FREE.map(n => mr.root.getObjectByName(n)).filter(b => b && mr.rest[b.name]);
  for (const b of mr.freeBones) b.quaternion.copy(mr.rest[b.name].q); // まず立ち姿勢に戻す（モーションを混ぜる分だけ動く）
  if (!(mr.mcW > 0) || !mr.mcCur) return;
  if (!mr.mcBones) { mr.mcBones = []; for (const name in window.MOCAP.run.rot) { const b = mr.root.getObjectByName(name); if (b && mr.rest[b.name]) { b.__mcName = name; mr.mcBones.push(b); } } }
  const cur = mr.mcCur, prev = mr.mcX < 1 ? mr.mcPrev : null;
  for (const b of mr.mcBones) {
    if (!sampleBone(mr, b, cur, _mq1)) continue;
    if (prev && sampleBone(mr, b, prev, tq2)) { tq2.slerp(_mq1, mr.mcX); _mq1.copy(tq2); }
    // 刀・弓を持つキャラは、腕は武器の構えのまま（モーションは少しだけ混ぜる）。やられたときは腕もモーションに
    const armK = ARMED[f.c.weapon] && !cur.arms && /Shoulder|Arm|Hand/.test(b.__mcName) ? ARMED[f.c.weapon] : 1;
    b.quaternion.slerp(_mq1, mr.mcW * (MC_W[b.__mcName] || 1) * armK);
  }
}

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
  if (mr.quad) return window.QuadRig.handInfo(mr);
  const inv = tm1.copy(mr.holder.matrixWorld).invert();
  const g = k => mr.bones[k].getWorldPosition(new V3()).applyMatrix4(inv);
  return { fH: g('rHand'), fE: g('rFore'), bH: g('lHand'), bE: g('lFore') };
};
MR.remove = function (mr, scene) { scene.remove(mr.holder); };
window.ModelRig = MR;
})();
