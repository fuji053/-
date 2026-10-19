/* =====================================================================
   3D表示（テスト）
   2Dと同じ骨組み（関節の角度）を使って、立体の仮キャラを動かします
   当たり判定や動きはすべて game.js と同じで、見た目だけが変わります
   ===================================================================== */
'use strict';
(() => {
const R = { ready: false };
let renderer, scene, camera, cv, stage, bgPlane, rocks = [];
const rigs = new Map();
const projMeshes = new Map();
const FOV = 30;
const UP = new THREE.Vector3(0, 1, 0);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
const SPH = new THREE.SphereGeometry(1, 18, 14);
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

R.init = function (view) {
  cv = document.createElement('canvas');
  cv.id = 'game3d';
  document.body.insertBefore(cv, document.getElementById('game'));
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x0b1022);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x161c40, 1600, 4200);
  camera = new THREE.PerspectiveCamera(FOV, 1, 20, 9000);
  // 光
  scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x2a2350, 0.62));
  const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(-400, 700, 600); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb0ff, 0.55); rim.position.set(500, 300, -500); scene.add(rim);
  buildBackground();
  buildStage();
  R.resize(view);
  R.ready = true;
};
R.resize = function (view) {
  if (!renderer) return;
  renderer.setPixelRatio(view.dpr);
  renderer.setSize(view.w, view.h, false);
  camera.aspect = view.w / view.h;
  camera.updateProjectionMatrix();
};
R.hide = function () { if (cv) cv.style.display = 'none'; };

/* ---------- 背景 ---------- */
function buildBackground() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#070b20'); gr.addColorStop(0.55, '#1b2552'); gr.addColorStop(1, '#3a2f66');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  bgPlane = new THREE.Mesh(new THREE.PlaneGeometry(16000, 9000), new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false }));
  bgPlane.position.set(0, 200, -4000);
  scene.add(bgPlane);
  // 星
  const n = 500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 9000; pos[i * 3 + 1] = Math.random() * 4500 - 900; pos[i * 3 + 2] = -3500 + Math.random() * 400; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.8 })));
  // 遠くに浮かぶ岩（奥行きを出すため）
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3b3f73, roughness: 0.9, flatShading: true });
  const spots = [[-1500, -150, -1400, 120], [1300, 80, -1700, 160], [-700, 380, -2200, 110], [800, -300, -1100, 80], [2100, 300, -2500, 200], [-2300, 50, -2300, 180]];
  for (const [x, y, z, s] of spots) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    m.position.set(x, y, z); m.scale.y = 0.6; m.rotation.set(Math.random(), Math.random(), 0);
    m.userData.base = y; m.userData.ph = Math.random() * 6;
    scene.add(m); rocks.push(m);
  }
}
/* ---------- ステージ ---------- */
function buildStage() {
  const G = window.__game, hw = G.ST.halfWidth, th = G.ST.thickness;
  stage = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0); shape.lineTo(hw, 0); shape.lineTo(hw - 30, -th); shape.lineTo(hw - 170, -th - 80);
  shape.lineTo(-hw + 170, -th - 80); shape.lineTo(-hw + 30, -th); shape.lineTo(-hw, 0);
  const depth = 260;
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 4, bevelThickness: 4, bevelSegments: 2 }),
    new THREE.MeshStandardMaterial({ color: 0x343a78, roughness: 0.85, metalness: 0.1 }));
  body.position.z = -depth / 2 - 70;
  stage.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 6, depth + 8), new THREE.MeshStandardMaterial({ color: 0x7f88d6, roughness: 0.45, metalness: 0.2 }));
  top.position.set(0, -3, -70);
  stage.add(top);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 3, 3), new THREE.MeshBasicMaterial({ color: 0xe6e9ff }));
  edge.position.set(0, 0, depth / 2 - 66);
  stage.add(edge);
  // 中央のライン模様
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xbfc6ff, transparent: true, opacity: 0.35 });
  for (const z of [-150, 10]) { const l = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 60, 0.5, 2), lineMat); l.position.set(0, 0.3, z); stage.add(l); }
  scene.add(stage);
}

/* ---------- キャラの立体（骨組みに合わせて円柱と球を並べる） ---------- */
function makeRig(f) {
  const g = new THREE.Group();
  const th = f.look.thick;
  const mat = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.45, metalness: 0.05 });
  const matD = new THREE.MeshStandardMaterial({ color: f.dark, roughness: 0.55, metalness: 0.05 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x10142c, roughness: 0.3 });
  const mats = [mat, matD, eyeMat];
  const seg = (m, r) => { const s = new THREE.Mesh(CYL, m); s.userData.r = r; g.add(s); return s; };
  const ball = (m, r) => { const s = new THREE.Mesh(SPH, m); s.scale.setScalar(r); g.add(s); return s; };
  const rLimb = th * 0.55, rLeg = th * 0.62, rBody = th * 0.95;
  const rig = {
    g, mat, matD, mats, th, zw: th * 1.25,
    torso: seg(mat, rBody), pelvis: ball(mat, rBody), chest: ball(mat, rBody * 1.05),
    head: ball(mat, f.look.head), eye1: ball(eyeMat, Math.max(1.4, f.look.head * 0.16)), eye2: ball(eyeMat, Math.max(1.4, f.look.head * 0.16)),
    fU: seg(mat, rLimb), fFo: seg(mat, rLimb), fSh: ball(mat, rLimb * 1.15), fEl: ball(mat, rLimb), fHa: ball(mat, f.c.weapon === 'unarmed' ? th * 0.85 : rLimb * 1.15),
    bU: seg(matD, rLimb), bFo: seg(matD, rLimb), bSh: ball(matD, rLimb * 1.15), bEl: ball(matD, rLimb), bHa: ball(matD, f.c.weapon === 'unarmed' ? th * 0.8 : rLimb * 1.1),
    fTh: seg(mat, rLeg), fSn: seg(mat, rLeg), fHp: ball(mat, rLeg * 1.1), fKn: ball(mat, rLeg), fFt: new THREE.Mesh(new THREE.BoxGeometry(th * 2.1, th * 0.9, th * 1.3), mat),
    bTh: seg(matD, rLeg), bSn: seg(matD, rLeg), bHp: ball(matD, rLeg * 1.1), bKn: ball(matD, rLeg), bFt: new THREE.Mesh(new THREE.BoxGeometry(th * 2.1, th * 0.9, th * 1.3), matD),
    yaw: f.facing > 0 ? -0.35 : -(Math.PI - 0.35),
  };
  g.add(rig.fFt); g.add(rig.bFt);
  // 武器
  const w = f.c.weapon;
  if (w === 'whip') {
    const wm = new THREE.MeshStandardMaterial({ color: 0xd9b071, roughness: 0.6 });
    rig.whip = []; for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(CYL, wm); s.userData.r = 1.6; scene.add(s); rig.whip.push(s); }
    mats.push(wm);
  } else if (w === 'bow') {
    const bm = new THREE.MeshStandardMaterial({ color: 0xc99a5b, roughness: 0.5 });
    rig.bowArc = Math.PI * 0.8;
    rig.bow = new THREE.Mesh(new THREE.TorusGeometry(24, 2, 8, 24, rig.bowArc), bm); g.add(rig.bow);
    const sm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    rig.str1 = new THREE.Mesh(CYL, sm); rig.str1.userData.r = 0.5; g.add(rig.str1);
    rig.str2 = new THREE.Mesh(CYL, sm); rig.str2.userData.r = 0.5; g.add(rig.str2);
    rig.arrow = new THREE.Mesh(CYL, new THREE.MeshStandardMaterial({ color: 0xffe9a8 })); rig.arrow.userData.r = 0.9; g.add(rig.arrow);
    mats.push(bm);
  } else if (w === 'mirror') {
    rig.shieldMat = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.15, metalness: 0.85, emissive: 0x000000 });
    rig.mirror = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 5, 28), rig.shieldMat); g.add(rig.mirror);
    const rimM = new THREE.Mesh(new THREE.TorusGeometry(22, 2.2, 8, 28), new THREE.MeshStandardMaterial({ color: 0x8fb8e8, metalness: 0.6, roughness: 0.3 }));
    rig.mirror.add(rimM); rimM.rotation.x = Math.PI / 2;
    mats.push(rig.shieldMat);
  }
  // シールド
  rig.bubble = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: f.slot === 0 ? 0xff5d5d : 0x4fa8ff, transparent: true, opacity: 0.28, depthWrite: false }));
  scene.add(rig.bubble);
  // 足元の影
  rig.shadow = new THREE.Mesh(new THREE.CircleGeometry(24, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  rig.shadow.rotation.x = -Math.PI / 2;
  scene.add(rig.shadow);
  scene.add(g);
  return rig;
}
function setSeg(mesh, a, b) {
  tmpD.subVectors(b, a);
  const len = tmpD.length() || 0.001;
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.scale.set(mesh.userData.r, len, mesh.userData.r);
  mesh.quaternion.setFromUnitVectors(UP, tmpD.divideScalar(len));
}
const V = (p, z) => new THREE.Vector3(p[0], p[1], z);
function updateRig(rig, f, alpha, G) {
  const g = rig.g;
  g.visible = f.alive;
  rig.shadow.visible = false; rig.bubble.visible = false;
  if (rig.whip) for (const s of rig.whip) s.visible = f.alive;
  if (!f.alive) return;
  const pose = G.interpPose(f, alpha);
  const pts = G.solvePose(pose, f.look, f.grounded, f.state === 'down');
  let x = G.lerp(f.px, f.x, alpha), y = G.lerp(f.py, f.y, alpha);
  if (f.hitlag > 0 && f.shakeT > 0) x += (Math.random() - 0.5) * 6;
  if (f.charging) x += (Math.random() - 0.5) * 2;
  // 向き（カメラ側を通って振り向く）
  const target = f.facing > 0 ? -0.35 : -(Math.PI - 0.35);
  rig.yaw += (target - rig.yaw) * 0.35;
  g.rotation.y = rig.yaw;
  g.position.set(x, -y, 0);
  const zw = rig.zw;
  const P = {};
  for (const k in pts) {
    const back = k[0] === 'b';
    const front = k[0] === 'f';
    P[k] = V(pts[k], front ? zw : back ? -zw : 0);
  }
  setSeg(rig.torso, P.H, P.N);
  rig.pelvis.position.copy(P.H); rig.chest.position.copy(P.N);
  rig.head.position.copy(V(pts.head, 0));
  const hr = f.look.head;
  tmpA.set(pts.eye[0] - pts.head[0], pts.eye[1] - pts.head[1], 0).normalize();
  rig.eye1.position.set(pts.head[0] + tmpA.x * hr * 0.82, pts.head[1] + tmpA.y * hr * 0.82 + hr * 0.12, hr * 0.42);
  rig.eye2.position.set(pts.head[0] + tmpA.x * hr * 0.82, pts.head[1] + tmpA.y * hr * 0.82 + hr * 0.12, -hr * 0.42);
  setSeg(rig.fU, P.fS, P.fE); setSeg(rig.fFo, P.fE, P.fH);
  setSeg(rig.bU, P.bS, P.bE); setSeg(rig.bFo, P.bE, P.bH);
  setSeg(rig.fTh, P.fHp, P.fK); setSeg(rig.fSn, P.fK, P.fF);
  setSeg(rig.bTh, P.bHp, P.bK); setSeg(rig.bSn, P.bK, P.bF);
  rig.fSh.position.copy(P.fS); rig.fEl.position.copy(P.fE); rig.fHa.position.copy(P.fH);
  rig.bSh.position.copy(P.bS); rig.bEl.position.copy(P.bE); rig.bHa.position.copy(P.bH);
  rig.fHp.position.copy(P.fHp); rig.fKn.position.copy(P.fK);
  rig.bHp.position.copy(P.bHp); rig.bKn.position.copy(P.bK);
  // 足（すねの向きに合わせて、つま先を前に）
  for (const [ft, kn, an] of [[rig.fFt, P.fK, P.fF], [rig.bFt, P.bK, P.bF]]) {
    const a = Math.atan2(an.y - kn.y, an.x - kn.x) + Math.PI / 2;
    ft.position.set(an.x + Math.cos(a) * rig.th * 0.6, an.y + Math.sin(a) * rig.th * 0.6, an.z);
    ft.rotation.set(0, 0, a);
  }
  // 色（ヒット時の白・アーマーのオレンジなど）
  const look = G.fighterLook(f);
  rig.mat.color.set(look.col); rig.matD.color.set(look.dark);
  const blink = f.invuln > 0 && f.state !== 'move' && Math.floor(f.invuln / 4) % 2 === 0;
  for (const m of rig.mats) { m.transparent = blink; m.opacity = blink ? 0.45 : 1; }
  // 武器
  const fdx = pts.fH[0] - pts.fE[0], fdy = pts.fH[1] - pts.fE[1], fl = Math.hypot(fdx, fdy) || 1;
  const ux = fdx / fl, uy = fdy / fl;
  if (rig.bow) {
    const ang = Math.atan2(uy, ux);
    rig.bow.position.set(pts.fH[0] - ux * 14, pts.fH[1] - uy * 14, zw);
    rig.bow.rotation.set(0, 0, ang - rig.bowArc / 2);
    const e1 = new THREE.Vector3(Math.cos(ang - rig.bowArc / 2) * 24, Math.sin(ang - rig.bowArc / 2) * 24, 0).add(rig.bow.position);
    const e2 = new THREE.Vector3(Math.cos(ang + rig.bowArc / 2) * 24, Math.sin(ang + rig.bowArc / 2) * 24, 0).add(rig.bow.position);
    const near = Math.hypot(pts.bH[0] - pts.fH[0], pts.bH[1] - pts.fH[1]) < 40;
    const mid = near ? V(pts.bH, zw) : e1.clone().lerp(e2, 0.5);
    setSeg(rig.str1, e1, mid); setSeg(rig.str2, mid, e2);
    rig.arrow.visible = near && f.state === 'move';
    if (rig.arrow.visible) setSeg(rig.arrow, V(pts.bH, zw), new THREE.Vector3(pts.fH[0] + ux * 14, pts.fH[1] + uy * 14, zw));
  }
  if (rig.mirror) {
    rig.mirror.position.set(pts.fH[0] + ux * 5, pts.fH[1] + uy * 5, zw + 2);
    rig.mirror.quaternion.setFromUnitVectors(UP, tmpA.set(ux, uy, 0));
    const act = !!f.activeWindow('reflect') || !!f.activeWindow('counter');
    rig.shieldMat.emissive.setHex(act ? 0x4f9fcf : 0x000000);
  }
  g.updateMatrixWorld();
  if (rig.whip) {
    const hand = V(pts.fH, zw).applyMatrix4(g.matrixWorld);
    const tip = new THREE.Vector3(G.lerp(f.prevTip[0], f.tip[0], alpha), -G.lerp(f.prevTip[1], f.tip[1], alpha), hand.z);
    const ctrl = hand.clone().add(tip).multiplyScalar(0.5); ctrl.y -= 18;
    const n = rig.whip.length;
    let prev = hand.clone();
    for (let i = 1; i <= n; i++) {
      const t = i / n, it = 1 - t;
      const p = new THREE.Vector3(it * it * hand.x + 2 * it * t * ctrl.x + t * t * tip.x, it * it * hand.y + 2 * it * t * ctrl.y + t * t * tip.y, hand.z);
      setSeg(rig.whip[i - 1], prev, p); prev = p;
    }
  }
  // シールド
  if (f.state === 'shield' || f.state === 'shieldstun') {
    rig.bubble.visible = true;
    rig.bubble.position.set(x, -(y - 45), 0);
    rig.bubble.scale.setScalar(20 + 34 * (f.shieldHP / G.PH.shieldMax));
  }
  // 影
  if (Math.abs(x) <= G.ST.halfWidth + 10 && y > -300) {
    rig.shadow.visible = true;
    rig.shadow.position.set(x, 0.6, 0);
    const s = G.clamp(1 + y / 400, 0.3, 1);
    rig.shadow.scale.set(s, s * 0.6, 1);
    rig.shadow.material.opacity = 0.3 * s;
  }
}
/* ---------- 飛び道具 ---------- */
function projMesh(p) {
  let m = projMeshes.get(p);
  if (m) return m;
  const col = new THREE.Color(p.owner.color);
  if (p.type === 'arrow') {
    m = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 28, 8), new THREE.MeshStandardMaterial({ color: 0xf3e3c0 }));
    shaft.rotation.z = Math.PI / 2; shaft.position.x = -14; m.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(3.5, 9, 10), new THREE.MeshStandardMaterial({ color: col }));
    head.rotation.z = -Math.PI / 2; head.position.x = 3; m.add(head);
  } else if (p.type === 'disc') {
    m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 4, 24), new THREE.MeshStandardMaterial({ color: 0xcfe6ff, metalness: 0.85, roughness: 0.15 }));
  } else {
    m = new THREE.Mesh(new THREE.ConeGeometry(14, 30, 10), new THREE.MeshStandardMaterial({ color: 0xffa03c, emissive: 0x552200 }));
  }
  scene.add(m); projMeshes.set(p, m);
  return m;
}
/* ---------- 毎コマの描画 ---------- */
R.render = function (b, alpha, cam, sx, sy, view, G) {
  cv.style.display = 'block';
  // カメラ：2Dと同じ範囲が映る距離に置く（ステージの面上では2Dと位置がぴったり一致）
  const z = cam.z;
  const d = (view.h / z / 2) / Math.tan(FOV * Math.PI / 360);
  const cx = cam.x - sx / z, cy = -(cam.y) + sy / z;
  camera.position.set(cx, cy, d);
  camera.lookAt(cx, cy, 0);
  // 岩をゆっくり浮かせる
  const t = performance.now() / 1000;
  for (const r of rocks) { r.position.y = r.userData.base + Math.sin(t * 0.4 + r.userData.ph) * 20; r.rotation.y += 0.001; }
  bgPlane.position.x = cam.x * 0.7;
  // キャラ
  const seen = new Set();
  for (const f of b.f) {
    let rig = rigs.get(f);
    if (!rig) { rig = makeRig(f); rigs.set(f, rig); }
    seen.add(f);
    updateRig(rig, f, alpha, G);
  }
  for (const [f, rig] of rigs) if (!seen.has(f)) { scene.remove(rig.g, rig.bubble, rig.shadow); if (rig.whip) rig.whip.forEach(s => scene.remove(s)); rigs.delete(f); }
  // 飛び道具
  const live = new Set(b.projectiles);
  for (const p of b.projectiles) {
    const m = projMesh(p);
    const px = G.lerp(p.px, p.x, alpha), py = G.lerp(p.py, p.y, alpha);
    m.position.set(px, -py, 0);
    if (p.type === 'arrow') m.rotation.set(0, 0, Math.atan2(-p.vy, p.vx));
    else if (p.type === 'disc') m.rotation.set(Math.PI / 2 - 0.4, 0, p.age * 0.4);
    else { m.position.y = 15; m.scale.y = 0.8 + Math.sin(p.age * 0.8) * 0.2; }
  }
  for (const [p, m] of projMeshes) if (!live.has(p)) { scene.remove(m); projMeshes.delete(p); }
  renderer.render(scene, camera);
  const W = view.w, H = view.h;
  return { X: wx => (wx - cam.x) * z + W / 2 + sx, Y: wy => (wy - cam.y) * z + H / 2 + sy, z };
};
window.Render3D = R;
})();
