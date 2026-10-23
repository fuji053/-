/* =====================================================================
   3D表示
   2Dと同じ骨組み（関節の角度）を使って、立体の仮キャラを動かします
   当たり判定や動きはすべて game.js と同じで、見た目だけが変わります
   ===================================================================== */
'use strict';
(() => {
const R = { ready: false };
let renderer, scene, camera, cv;
const rigs = new Map();
const projMeshes = new Map();
const FOV = 30;
const UP = new THREE.Vector3(0, 1, 0);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
const SPH = new THREE.SphereGeometry(1, 18, 14);
let composer = null, bloom = null;
// 描画が重い（1コマの描画が長い）状態が続いたら、ブルームを切って軽くする
const perf = { n: 0, sum: 0, slow: 0 };
function perfWatch(ms) {
  if (!R.bloomOn) return;
  perf.n++; perf.sum += ms;
  if (perf.n >= 90) {
    const avg = perf.sum / perf.n; perf.n = 0; perf.sum = 0;
    perf.slow = avg > 9 ? perf.slow + 1 : 0;
    if (perf.slow >= 2) { R.bloomOn = false; console.log('bloom off (avg ' + avg.toFixed(1) + 'ms)'); }
  }
}
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
  // 光のにじみ（ブルーム）：ビーム・ジェット・光る技が、本当に光って見えるように。重い端末では自動で切る
  if (THREE.EffectComposer && THREE.UnrealBloomPass) {
    try {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.3, 0.97);
      composer.addPass(bloom);
      R.bloomOn = true;
    } catch (e) { composer = null; R.bloomOn = false; }
  }
  // ステージ（背景・床・光）は stages3d.js で作る
  R.setStage(window.__game.D.stages ? window.__game.D.stages[0].id : 'temple');
  R.resize(view);
  R.ready = true;
};
R.resize = function (view) {
  if (!renderer) return;
  renderer.setPixelRatio(view.dpr);
  renderer.setSize(view.w, view.h, false);
  if (composer) { composer.setPixelRatio(view.dpr); composer.setSize(view.w, view.h); bloom.resolution.set(view.w / 2, view.h / 2); }
  camera.aspect = view.w / view.h;
  camera.updateProjectionMatrix();
};
R.hide = function () { if (cv) cv.style.display = 'none'; };
R.setStage = function (id) {
  if (!window.Stages3D) return;
  if (window.Stages3D.cur && window.Stages3D.cur.id === id) return;
  window.Stages3D.build(scene, renderer, id, window.__game);
};

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
    rig.arrowMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0x000000 });
    rig.arrow = new THREE.Mesh(CYL, rig.arrowMat); rig.arrow.userData.r = 0.9; g.add(rig.arrow);
    rig.glow = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.35, depthWrite: false }));
    rig.glow.visible = false; g.add(rig.glow);
    // 旋矢（横B）：後ろの手でバトンのように回す矢と、回転の残像
    rig.twirl = new THREE.Group(); rig.twirl.visible = false; g.add(rig.twirl);
    const tw = new THREE.Group(); rig.twirl.add(tw); rig.twirlSpin = tw;
    const tshaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 8), new THREE.MeshStandardMaterial({ color: 0xf3e3c0 })); tw.add(tshaft);
    const thead = new THREE.Mesh(new THREE.ConeGeometry(2.6, 8, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color(f.color), metalness: 0.5, roughness: 0.3 })); thead.position.y = 23; tw.add(thead);
    const tfl = new THREE.Mesh(new THREE.BoxGeometry(4.5, 7, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffff })); tfl.position.y = -18; tw.add(tfl);
    rig.twirlBlur = new THREE.Mesh(new THREE.CircleGeometry(23, 28), new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    rig.twirl.add(rig.twirlBlur);
    mats.push(bm);
  } else if (w === 'katana') {
    // 刀：つか（黒）・つば（金）・刃（銀）。刃は +Y 方向に伸ばして作り、手の向きに合わせて回す
    const L = 42 * (f.look.scale || 1);
    rig.katana = new THREE.Group(); g.add(rig.katana);
    const bladeM = new THREE.MeshStandardMaterial({ color: 0xe9eef6, metalness: 0.6, roughness: 0.25, emissive: 0x000000 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, L, 3.2), bladeM); blade.position.y = L / 2 + 1.5; rig.katana.add(blade);
    const tipM = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 4), bladeM); tipM.position.y = L + 3.5; tipM.scale.z = 1; rig.katana.add(tipM);
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.7, roughness: 0.35 }));
    tsuba.position.y = 1; rig.katana.add(tsuba);
    const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 9, 8), new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 0.8 }));
    tsuka.position.y = -3.5; rig.katana.add(tsuka);
    rig.bladeMat = bladeM;
    mats.push(bladeM);
  } else if (w === 'gadget') {
    // 小さなピストル（手の向きに合わせる）
    rig.gun = new THREE.Group(); g.add(rig.gun);
    const gm = new THREE.MeshStandardMaterial({ color: 0x23252b, metalness: 0.5, roughness: 0.4 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(2.6, 13, 3), gm); slide.position.y = 5; rig.gun.add(slide);
    const sil = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 7, 8), gm); sil.position.y = 14.5; rig.gun.add(sil);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 6), gm); grip.position.set(0, 0.5, -2.5); rig.gun.add(grip);
    // ワイヤー（技の間だけ）
    const wm = new THREE.MeshStandardMaterial({ color: 0xcfd6e6, metalness: 0.6, roughness: 0.3 });
    rig.wire = new THREE.Mesh(CYL, wm); rig.wire.userData.r = 0.7; rig.wire.visible = false; scene.add(rig.wire);
    rig.hook = new THREE.Mesh(new THREE.ConeGeometry(3, 7, 6), wm); rig.hook.visible = false; scene.add(rig.hook);
    // 反射ガジェットの光の盾
    rig.field = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.22, depthWrite: false }));
    rig.field.rotation.x = Math.PI / 2; rig.field.visible = false; scene.add(rig.field);
    // 覚醒の演出で手に持つサングラス
    if (f.c.awaken) {
      rig.shades = new THREE.Group();
      const sm = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.6, roughness: 0.15 });
      for (const sx of [-3.2, 3.2]) { const l = new THREE.Mesh(SPH, sm); l.scale.set(2.8, 1.7, 0.6); l.position.x = sx; rig.shades.add(l); }
      const br = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.5), sm); rig.shades.add(br);
      rig.shades.visible = false; g.add(rig.shades);
    }
    mats.push(gm);
  } else if (w === 'mech') {
    // 腕のビーム砲（手前の腕の先）：白い筒＋青く光る砲口。ためると光が強くなる
    rig.cannon = new THREE.Group(); g.add(rig.cannon);
    const wm = new THREE.MeshStandardMaterial({ color: 0xe9edf2, metalness: 0.35, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5, 22, 14), wm); body.position.y = 6; rig.cannon.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, 1.1, 8, 18), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.6, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 16; rig.cannon.add(ring);
    rig.cannonGlowM = new THREE.MeshBasicMaterial({ color: 0x5fd0ff });
    const muzzle = new THREE.Mesh(new THREE.CircleGeometry(3.2, 16), rig.cannonGlowM); muzzle.rotation.x = -Math.PI / 2; muzzle.position.y = 17.2; rig.cannon.add(muzzle);
    rig.cannonOrb = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.8, depthWrite: false }));
    rig.cannonOrb.position.y = 19; rig.cannonOrb.visible = false; rig.cannon.add(rig.cannonOrb);
    mats.push(wm);
  } else if (w === 'shield') {
    // 盾（奥の腕）：白い凧形の盾に金のふちと青く光る紋章。片手剣（手前の手）
    const sc = f.look.scale || 1;
    rig.kshield = new THREE.Group(); g.add(rig.kshield);
    const ks = new THREE.Shape();
    ks.moveTo(0, 17); ks.quadraticCurveTo(13, 16, 13, 4); ks.quadraticCurveTo(11, -11, 0, -22); ks.quadraticCurveTo(-11, -11, -13, 4); ks.quadraticCurveTo(-13, 16, 0, 17);
    rig.kshieldMat = new THREE.MeshStandardMaterial({ color: 0xeceae4, metalness: 0.45, roughness: 0.32, emissive: 0x000000 });
    const goldM = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.8, roughness: 0.3 });
    const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(ks, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 1.4, bevelSegments: 2, curveSegments: 10 }), [rig.kshieldMat, goldM]);
    const inner = new THREE.Group(); inner.add(plate); rig.kshield.add(inner); rig.kshieldInner = inner;
    rig.kshieldGlow = new THREE.MeshBasicMaterial({ color: 0x6fc4ff });
    const em = new THREE.Mesh(new THREE.TorusGeometry(5.2, 1.1, 8, 20), rig.kshieldGlow); em.position.z = 2.9; inner.add(em);
    const core = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16), rig.kshieldGlow); core.position.z = 3; inner.add(core);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(1.6, 26, 0.8), goldM); crossV.position.set(0, -2, 2.8); inner.add(crossV);
    rig.kshield.scale.setScalar(sc);
    // 片手剣
    const L = 34 * sc;
    rig.ksword = new THREE.Group(); g.add(rig.ksword);
    const bm = new THREE.MeshStandardMaterial({ color: 0xe9eef6, metalness: 0.65, roughness: 0.22 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, L, 0.9), bm); blade.position.y = L / 2 + 2; rig.ksword.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.85, 5, 4), bm); tip.position.y = L + 4.5; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.35; rig.ksword.add(tip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 2), goldM); guard.position.y = 1.5; rig.ksword.add(guard);
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 7, 8), new THREE.MeshStandardMaterial({ color: 0x1d2a4a, roughness: 0.7 })); hilt.position.y = -2.5; rig.ksword.add(hilt);
    const pom = new THREE.Mesh(SPH, goldM); pom.scale.setScalar(1.7); pom.position.y = -6.5; rig.ksword.add(pom);
    mats.push(rig.kshieldMat, goldM, bm);
  } else if (w === 'gsword') {
    // 大剣：黒い刃に青く光る筋。長いつか
    const sc = f.look.scale || 1, L = 66 * sc;
    rig.gsword = new THREE.Group(); g.add(rig.gsword);
    const bm = new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.7, roughness: 0.3, emissive: 0x000000 });
    const edgeM = new THREE.MeshStandardMaterial({ color: 0xcfd8e8, metalness: 0.8, roughness: 0.2 });
    rig.gswordGlow = new THREE.MeshBasicMaterial({ color: 0x3f8fff });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(7.5 * sc, L, 1.3), bm); blade.position.y = L / 2 + 3; rig.gsword.add(blade);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.9, L, 1.5), edgeM); e.position.set(sx * 3.9 * sc, L / 2 + 3, 0); rig.gsword.add(e); }
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.1, L * 0.82, 1.6), rig.gswordGlow); line.position.y = L * 0.45 + 3; rig.gsword.add(line);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(4.3 * sc, 9, 4), bm); tip.position.y = L + 7.5; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.2; rig.gsword.add(tip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(15 * sc, 2.6, 3.4), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.7, roughness: 0.35 })); guard.position.y = 2.2; rig.gsword.add(guard);
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 13, 8), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.8 })); hilt.position.y = -4.5; rig.gsword.add(hilt);
    rig.gswordMat = bm;
    mats.push(bm, edgeM);
  } else if (w === 'skate') {
    // ローラーブレード：足の下に4つの車輪（青く光る）
    rig.skates = [];
    const fm = new THREE.MeshStandardMaterial({ color: 0x1b1d24, metalness: 0.4, roughness: 0.4 });
    rig.wheelM = new THREE.MeshStandardMaterial({ color: 0x1e3a66, emissive: 0x0d4f9a, roughness: 0.35 });
    for (let k = 0; k < 2; k++) {
      const sk = new THREE.Group(); g.add(sk); rig.skates.push(sk);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 8), new THREE.MeshStandardMaterial({ color: 0xf2f2f4, roughness: 0.5 })); boot.position.set(1, 5.2, 0); sk.add(boot);
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(7.5, 6, 8.5), fm); cuff.position.set(-2.6, 9.6, 0); sk.add(cuff);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(13, 1.4, 2.4), fm); frame.position.y = 1.2; sk.add(frame);
      for (let i = 0; i < 4; i++) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 2.2, 12), rig.wheelM); wh.rotation.x = Math.PI / 2; wh.position.set(-4.8 + i * 3.4, -0.6, 0); sk.add(wh); }
    }
    mats.push(fm, rig.wheelM);
  } else if (w === 'chain') {
    // 鎖鎌：手前の手に鎌。鎖（ワイヤー）と分銅は技の間だけ
    const sc = f.look.scale || 1;
    rig.sickle = new THREE.Group(); g.add(rig.sickle);
    const hm = new THREE.MeshStandardMaterial({ color: 0x2a1c18, roughness: 0.8 });
    const bm = new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 0.75, roughness: 0.22, emissive: 0x000000 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 16 * sc, 8), hm); handle.position.y = 6 * sc; rig.sickle.add(handle);
    const blade = new THREE.Mesh(new THREE.TorusGeometry(8 * sc, 1.1, 6, 16, Math.PI * 0.75), bm);
    blade.position.set(-8 * sc, 14 * sc, 0); blade.rotation.z = -0.2; rig.sickle.add(blade);
    const redM = new THREE.MeshStandardMaterial({ color: 0xc0182a, emissive: 0x400008, roughness: 0.4 });
    const edge = new THREE.Mesh(new THREE.TorusGeometry(8.6 * sc, 0.45, 4, 16, Math.PI * 0.6), redM); edge.position.copy(blade.position); edge.rotation.z = -0.15; rig.sickle.add(edge);
    rig.sickleMat = bm;
    const cm = new THREE.MeshStandardMaterial({ color: 0x3a3d45, metalness: 0.7, roughness: 0.35 });
    rig.wire = new THREE.Mesh(CYL, cm); rig.wire.userData.r = 1.0; rig.wire.visible = false; scene.add(rig.wire);
    rig.hook = new THREE.Mesh(new THREE.OctahedronGeometry(4.2), new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.8, roughness: 0.3, emissive: 0x300006 })); rig.hook.visible = false; scene.add(rig.hook);
    mats.push(bm, hm, redM);
  } else if (w === 'tako') {
    // タコ：頭にクラゲのような大きなかさ、下に8本の触手（ゆらゆら）
    const sc = f.look.scale || 1;
    rig.takoM = new THREE.MeshStandardMaterial({ color: 0xb04fe8, emissive: 0x2a0a40, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 });
    const hatM = new THREE.MeshStandardMaterial({ color: 0x7f5cff, emissive: 0x1a1050, roughness: 0.2, transparent: true, opacity: 0.85 });
    rig.hat = new THREE.Mesh(new THREE.SphereGeometry(16 * sc, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hatM); g.add(rig.hat);
    const phoneM = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0x803000, roughness: 0.3 });
    rig.phones = []; for (const sz of [-1, 1]) { const ph = new THREE.Mesh(new THREE.TorusGeometry(4.2 * sc, 1.6 * sc, 8, 16), phoneM); g.add(ph); rig.phones.push([ph, sz]); }
    rig.tents = [];
    for (let i = 0; i < 8; i++) { const segs = []; for (let k = 0; k < 5; k++) { const sgm = new THREE.Mesh(CYL, rig.takoM); sgm.userData.r = (2.6 - k * 0.4) * sc; g.add(sgm); segs.push(sgm); } rig.tents.push(segs); }
    mats.push(rig.takoM, hatM, phoneM);
  } else if (w === 'mirror') {
    rig.shieldMat = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.15, metalness: 0.85, emissive: 0x000000 });
    rig.mirror = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 5, 28), rig.shieldMat); g.add(rig.mirror);
    const rimM = new THREE.Mesh(new THREE.TorusGeometry(22, 2.2, 8, 28), new THREE.MeshStandardMaterial({ color: 0x8fb8e8, metalness: 0.6, roughness: 0.3 }));
    rig.mirror.add(rimM); rimM.rotation.x = Math.PI / 2;
    mats.push(rig.shieldMat);
  }
  rig.weaponParts = new Set([rig.bow, rig.str1, rig.str2, rig.arrow, rig.glow, rig.mirror, rig.katana, rig.gun, rig.shades, rig.twirl, rig.cannon, rig.kshield, rig.ksword, rig.gsword, rig.sickle, rig.hat, ...(rig.skates || []), ...(rig.phones || []).map(p => p[0]), ...(rig.tents || []).flat()].filter(Boolean));
  // 反射の光（タコの泡のバリア）
  if (!rig.field && f.c.weapon === 'tako') { rig.field = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.25, depthWrite: false })); rig.field.visible = false; scene.add(rig.field); }
  // 泡に閉じこめられたときの泡
  rig.trap = new THREE.Mesh(SPH, new THREE.MeshStandardMaterial({ color: 0xcff6ff, emissive: 0x2a6f9f, transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false })); rig.trap.visible = false; scene.add(rig.trap);
  // 3Dモデルがあるキャラは読み込みを始める（読み込めるまでは仮の体で表示）
  if (f.c.model && window.ModelRig) rig.modelEntry = window.ModelRig.load(f.c.model);
  const m2 = f.c.model2 || (f.c.form2 && f.c.form2.model); // ％が高くなったとき／下Bで切りかえたときの姿
  if (m2 && window.ModelRig) rig.modelEntry2 = window.ModelRig.load(m2);
  // シールド
  rig.bubble = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: f.slot === 0 ? 0xff5d5d : 0x4fa8ff, transparent: true, opacity: 0.28, depthWrite: false }));
  scene.add(rig.bubble);
  // 足元の影
  // 攻撃の残像（帯）：先と根元の2点の軌跡を、なめらかな帯にする
  {
    const N = 40, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
    const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    rig.ribbon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    rig.ribbon.frustumCulled = false; rig.ribbon.visible = false; rig.ribbonN = N; scene.add(rig.ribbon);
  }
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
  rig.shadow.visible = false; rig.bubble.visible = false; rig.ribbon.visible = false;
  if (rig.whip) for (const s of rig.whip) s.visible = f.alive;
  if (rig.wire) { rig.wire.visible = rig.hook.visible = false; }
  if (rig.field) rig.field.visible = false;
  rig.trap.visible = false;
  if (!f.alive || f.hidden) { g.visible = false; if (rig.mr) rig.mr.holder.visible = false; return; } // 瞬歩で消えている間も見えない
  const pose = G.interpPose(f, alpha);
  const pts = G.solvePose(pose, f.look, f.grounded, f.state === 'down');
  let x = G.lerp(f.px, f.x, alpha), y = G.lerp(f.py, f.y, alpha);
  if (f.hitlag > 0 && f.shakeT > 0) x += (Math.random() - 0.5) * 6;
  if (f.charging && !(f.move && f.move.holdShot)) x += (Math.random() - 0.5) * 2;
  // 向き（カメラ側を通って振り向く）
  const target = f.facing > 0 ? -0.35 : -(Math.PI - 0.35);
  rig.yaw += (target - rig.yaw) * 0.35;
  g.rotation.y = rig.yaw + (pose.yw || 0) * Math.PI / 180; // 回転する技（旋風脚・サイクロンアッパーなど）
  const dz = G.lerp(f.prevDepth || 0, f.depthZ || 0, alpha);
  g.position.set(x, -y, dz);
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
  // 3Dモデル（読み込めていれば、仮の体のかわりに表示）
  // 姿の切りかえ（エージェントは％が高いと別のモデル）
  const wantEntry = (f.outfit2 || f.form2) && rig.modelEntry2 && rig.modelEntry2.ready ? rig.modelEntry2 : rig.modelEntry;
  if (rig.mr && rig.mrEntry !== wantEntry && wantEntry && wantEntry.ready) { window.ModelRig.remove(rig.mr, scene); rig.mr = null; }
  if (wantEntry && wantEntry.ready && !rig.mr) { rig.mr = window.ModelRig.build(wantEntry, f, scene); rig.mrEntry = wantEntry; }
  let fH3, fE3, bH3;
  if (rig.mr) {
    look.glow = f.charging && f.move && f.move.holdShot && f.shotT >= 1 ? 0.35 + 0.25 * Math.sin(f.anim * 0.18) : 0;
    window.ModelRig.update(rig.mr, f, pts, x, y, g.rotation.y, look, blink);
    for (const c of g.children) c.visible = rig.weaponParts.has(c);
    const hi = window.ModelRig.handInfo(rig.mr);
    fH3 = hi.fH; fE3 = hi.fE; bH3 = hi.bH;
  } else { fH3 = V(pts.fH, zw); fE3 = V(pts.fE, zw); bH3 = V(pts.bH, zw); }
  // 武器
  const fdx = fH3.x - fE3.x, fdy = fH3.y - fE3.y, fl = Math.hypot(fdx, fdy) || 1;
  const ux = fdx / fl, uy = fdy / fl;
  if (rig.bow) {
    // 弓は握り（弓の真ん中）を中心に回る
    const ang = Math.atan2(uy, ux) + (pose.wr || 0) * Math.PI / 180;
    const bs = rig.mr ? 0.66 : 1, BR = 24 * bs; // 3Dモデルは体が小さめなので弓も小さく
    rig.bow.scale.setScalar(bs);
    const gx = fH3.x + ux * 7 * bs, gy = fH3.y + uy * 7 * bs;
    rig.bow.position.set(gx - Math.cos(ang) * BR, gy - Math.sin(ang) * BR, fH3.z);
    rig.bow.rotation.set(0, 0, ang - rig.bowArc / 2);
    const e1 = new THREE.Vector3(Math.cos(ang - rig.bowArc / 2) * BR, Math.sin(ang - rig.bowArc / 2) * BR, 0).add(rig.bow.position);
    const e2 = new THREE.Vector3(Math.cos(ang + rig.bowArc / 2) * BR, Math.sin(ang + rig.bowArc / 2) * BR, 0).add(rig.bow.position);
    const near = Math.hypot(bH3.x - fH3.x, bH3.y - fH3.y) < 40;
    const mid = near ? new THREE.Vector3(bH3.x, bH3.y, fH3.z) : e1.clone().lerp(e2, 0.5);
    setSeg(rig.str1, e1, mid); setSeg(rig.str2, mid, e2);
    rig.arrow.visible = near && f.state === 'move';
    if (rig.arrow.visible) setSeg(rig.arrow, mid, new THREE.Vector3(fH3.x + ux * 14, fH3.y + uy * 14, fH3.z));
    // ため撃ち：ためるほど矢が光る
    const st = f.charging && f.move && f.move.holdShot ? f.shotT || 0 : 0;
    rig.arrowMat.emissive.setRGB(st * 0.9, st * 0.75, st * 0.3);
    rig.glow.visible = st >= 1;
    const twm = f.state === 'move' && f.move && f.move.twirl;
    const twOn = !!(twm && f.mf >= twm[0] && f.mf <= twm[1]);
    rig.twirl.visible = twOn;
    if (twOn) {
      const sc = rig.mr ? 0.75 : 1, fast = f.activeHits().length > 0;
      rig.twirl.position.set(bH3.x, bH3.y, bH3.z + 2); rig.twirl.scale.setScalar(sc);
      const thrust = f.mf >= 30; // 最後は回すのをやめて、矢の先で突く
      if (thrust) rig.twirlSpin.rotation.z = Math.atan2(bH3.y - fH3.y, bH3.x - fH3.x) - Math.PI / 2;
      else rig.twirlSpin.rotation.z = -performance.now() / (fast ? 22 : 45);
      rig.twirlBlur.visible = !thrust;
      rig.twirlBlur.material.opacity = fast ? 0.28 : 0.12;
      rig.arrow.visible = false;
    }
    if (rig.glow.visible) { rig.glow.position.set(fH3.x + ux * 12, fH3.y + uy * 12, fH3.z); rig.glow.scale.setScalar(13 + Math.sin(performance.now() / 120) * 2); }
  }
  if (rig.katana) {
    // 刀は手の向き（前腕の向き）に伸びる。wr で手首を回せる
    const ang = Math.atan2(uy, ux) + (pose.wr || 0) * Math.PI / 180;
    rig.katana.position.set(fH3.x, fH3.y, fH3.z + 1);
    rig.katana.rotation.set(0, 0, ang - Math.PI / 2);
    const act = f.state === 'move' && f.activeF >= 0 && f.move.hits && f.activeHits().length > 0;
    rig.bladeMat.emissive.setHex(act ? 0x406080 : (f.activeWindow('counter') ? 0x5090c0 : 0x000000));
  }
  if (rig.gun) {
    // 銃口は、腕をまっすぐ前に伸ばしたとき（ねらうとき）は腕の向き、それ以外は前向き（少し下）
    const armA = Math.atan2(uy, ux), aimW = G.clamp((ux - 0.35) / 0.5, 0, 1);
    const ang = -0.25 + (armA + 0.25) * aimW;
    rig.gun.position.set(fH3.x, fH3.y, fH3.z + 1.5);
    rig.gun.rotation.set(0, 0, ang - Math.PI / 2);
    // 銃を使う技のときだけ手に持つ（それ以外はホルスターにしまっている）
    const m = f.state === 'move' && f.move;
    rig.gun.visible = !!(m && m.poses && m.poses.some(k => k[1] === 'gunAim' || k[1] === 'gunFire')) || f.state === 'victory';
    // 覚醒の演出中：外したサングラスを手に持つ（その間ピストルはしまう）
    const aw = G.state.battle && G.state.battle.awaken;
    const showShades = !!(rig.shades && aw && aw.f === f && aw.t >= 28);
    if (aw && aw.f === f) rig.gun.visible = false;
    if (rig.shades) {
      rig.shades.visible = showShades;
      if (showShades) { rig.shades.position.set(fH3.x + ux * 4, fH3.y + uy * 4, fH3.z + 3); rig.shades.rotation.set(0, 0, ang); }
    }
  }
  if (rig.cannon) {
    // 前腕の向きに、手首の少し手前から前へ
    const ang = Math.atan2(uy, ux), sc2 = (f.look.scale || 1) * (rig.mr ? 0.9 : 1);
    rig.cannon.scale.setScalar(sc2);
    rig.cannon.position.set(fH3.x - ux * 6 * sc2, fH3.y - uy * 6 * sc2, fH3.z + 2);
    rig.cannon.rotation.set(0, 0, ang - Math.PI / 2);
    const st = f.charging && f.move && f.move.holdShot ? f.shotT || 0 : 0;
    rig.cannonOrb.visible = st > 0.05;
    if (st > 0.05) rig.cannonOrb.scale.setScalar(2 + st * 7 + Math.sin(performance.now() / 50) * 0.8);
    rig.cannonGlowM.color.setRGB(0.37 + st * 0.6, 0.8 + st * 0.2, 1);
  }
  if (rig.sickle) {
    const ang = Math.atan2(uy, ux) + (pose.wr || 0) * Math.PI / 180;
    rig.sickle.position.set(fH3.x, fH3.y, fH3.z + 1);
    rig.sickle.rotation.set(0, 0, ang - Math.PI / 2);
    const act = f.state === 'move' && f.activeF >= 0 && f.move.hits && f.activeHits().length > 0;
    rig.sickleMat.emissive.setHex(act ? 0x501018 : 0x000000);
    // 鎖の長さで、鎖の太さと分銅の大きさが変わる（長い＝細い、短い＝太い）
    const ck = [0.7, 1, 1.5][f.chainMode || 0];
    rig.wire.userData.r = ck; rig.hook.scale.setScalar(ck);
  }
  if (rig.hat) {
    // かさ：頭の上。触手：かさのふちから下へ、ゆらゆら（動いた方向と逆に流れる）
    const sc = f.look.scale || 1, hd = P.head || V(pts.head, 0), t = performance.now() / 1000;
    rig.hat.position.set(hd.x, hd.y + 4 * sc, 0);
    rig.phones.forEach(([ph, sz]) => { ph.position.set(hd.x, hd.y - 2 * sc, sz * 12 * sc); });
    const drag = G.clamp(-(f.vx || 0) * 0.08, -0.6, 0.6), up = G.clamp((f.vy || 0) * 0.04, -0.5, 0.5);
    rig.tents.forEach((segs, i) => {
      const a = i / 8 * Math.PI * 2, rx = Math.cos(a) * 13 * sc, rz = Math.sin(a) * 13 * sc;
      let px = hd.x + rx, py = hd.y - 2 * sc, pz = rz;
      segs.forEach((sg, k) => {
        const L = 7 * sc, sw = Math.sin(t * 3 + i * 0.9 + k * 0.7) * 0.35 + drag, out = 0.25 + k * 0.08;
        const nx = px + (Math.cos(a) * out + sw) * L, ny = py - L * (1 - up * 0.5), nz = pz + Math.sin(a) * out * L;
        setSeg(sg, new THREE.Vector3(px, py, pz), new THREE.Vector3(nx, ny, nz)); px = nx; py = ny; pz = nz;
      });
    });
  }
  if (rig.kshield) {
    // 盾は奥の前腕の外側。面は「前＋手前（カメラ側）」へななめに向ける
    const bE3 = rig.mr ? window.ModelRig.handInfo(rig.mr).bE : P.bE;
    const bdx = bH3.x - bE3.x, bdy = bH3.y - bE3.y, bl = Math.hypot(bdx, bdy) || 1;
    rig.kshield.position.set(bE3.x + bdx * 0.55, bE3.y + bdy * 0.55, (bE3.z + bH3.z) / 2 + 5);
    rig.kshield.rotation.set(0, 0.95, Math.atan2(bdy / bl, bdx / bl) - Math.PI / 2);
    const thrown = G.state.battle && G.state.battle.projectiles.some(p => p.maker === f && p.type === 'disc' && !p.dead);
    rig.kshield.visible = !thrown;
    const ref = !!f.activeWindow('reflect');
    rig.kshieldMat.emissive.setHex(ref ? 0x2f6f9f : 0x000000);
    rig.kshieldGlow.color.setHex(ref || (f.charging && f.move && f.move.key.startsWith('nspecial')) ? 0xd8f4ff : 0x6fc4ff);
  }
  if (rig.ksword) {
    const ang = Math.atan2(uy, ux) + (pose.wr || 0) * Math.PI / 180;
    rig.ksword.position.set(fH3.x, fH3.y, fH3.z + 1);
    rig.ksword.rotation.set(0, 0, ang - Math.PI / 2);
  }
  if (rig.gsword) {
    const ang = Math.atan2(uy, ux) + (pose.wr || 0) * Math.PI / 180;
    rig.gsword.position.set(fH3.x, fH3.y, fH3.z + 1);
    rig.gsword.rotation.set(0, 0, ang - Math.PI / 2);
    const act = f.state === 'move' && f.activeF >= 0 && f.move.hits && f.activeHits().length > 0;
    const ch = f.charging ? Math.min(1, (f.chargeT || 0) / 60) : 0;
    rig.gswordMat.emissive.setRGB(0.05 * ch + (act ? 0.08 : 0), 0.12 * ch + (act ? 0.15 : 0), 0.35 * ch + (act ? 0.3 : 0));
    rig.gswordGlow.color.setRGB(0.25 + ch * 0.6, 0.56 + ch * 0.4, 1);
  }
  if (rig.skates) {
    const feet = [[P.fK, P.fF], [P.bK, P.bF]];
    rig.fFt.visible = rig.bFt.visible = false;
    rig.skates.forEach((sk, k) => {
      const [kn, an] = feet[k];
      const a = Math.atan2(an.y - kn.y, an.x - kn.x) + Math.PI / 2;
      sk.position.set(an.x + Math.cos(a) * rig.th * 0.6 - Math.sin(a) * 4, an.y + Math.sin(a) * rig.th * 0.6 + Math.cos(a) * 4, an.z);
      sk.rotation.set(0, 0, a);
    });
    const fast = Math.abs(f.vx) > 6;
    rig.wheelM.emissive.setHex(fast ? 0x3fb0ff : 0x0d4f9a);
  }
  if (rig.mirror) {
    rig.mirror.position.set(fH3.x + ux * 5, fH3.y + uy * 5, fH3.z + 2);
    rig.mirror.quaternion.setFromUnitVectors(UP, tmpA.set(ux, uy, 0));
    const act = !!f.activeWindow('reflect') || !!f.activeWindow('counter');
    rig.shieldMat.emissive.setHex(act ? 0x4f9fcf : 0x000000);
  }
  g.updateMatrixWorld();
  if (rig.whip) {
    const hand = fH3.clone().applyMatrix4(g.matrixWorld);
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
  // ワイヤー（手 → フック）
  if (rig.wire && f.wireOn && f.wireK > 0.02) {
    const hand = fH3.clone().applyMatrix4(g.matrixWorld);
    const tip = new THREE.Vector3(f.tip[0], -f.tip[1], hand.z);
    setSeg(rig.wire, hand, tip); rig.wire.visible = true;
    rig.hook.position.copy(tip); rig.hook.visible = true;
    rig.hook.quaternion.setFromUnitVectors(UP, tmpA.subVectors(tip, hand).normalize());
  }
  // 反射ガジェット（光の六角形）
  if (rig.field) {
    const rw = f.activeWindow('reflect');
    if (rw) {
      rig.field.visible = true;
      rig.field.position.set(x + rw.x * f.facing, -(y - rw.y), 10);
      const s = rw.r * (0.92 + Math.sin(performance.now() / 60) * 0.06);
      if (f.c.weapon === 'tako') rig.field.scale.setScalar(s); else rig.field.scale.set(s, 2, s);
    }
  }
  // シールド
  if (f.state === 'shield' || f.state === 'shieldstun') {
    rig.bubble.visible = true;
    const bq = f.look.quad ? 0.62 : 1; // 4本足（小さい猫）はシールドも小さく低い
    rig.bubble.position.set(x, -(y - 45 * bq), 0);
    rig.bubble.scale.setScalar((20 + 34 * (f.shieldHP / f.shMax)) * bq * Math.sqrt(f.s.shieldMul || 1));
  }
  // 泡に閉じこめられている
  if (f.bubble > 0 && f.state === 'dizzy') {
    const sc = f.look.scale || 1, wob = Math.sin(performance.now() / 140) * 0.05;
    rig.trap.visible = true; rig.trap.position.set(x, -(y - 48 * sc), 0);
    rig.trap.scale.set(52 * sc * (1 + wob), 56 * sc * (1 - wob), 52 * sc);
    rig.trap.material.opacity = f.bubble === 1 ? 0.22 : 0.34; // 1回攻撃されると薄くなる（あと1回で割れる）
  }
  updateRibbon(rig, f);
  // 影（真下にある床：すり抜け床かステージ）
  let gy = null;
  const bt = G.state.battle;
  for (const p of (bt && bt.plats) || []) if (Math.abs(x - p.x) <= p.w / 2 && p.y >= y - 1 && (gy === null || p.y < gy)) gy = p.y;
  if (gy === null && Math.abs(x) <= G.ST.halfWidth + 10 && y <= 1) gy = 0;
  if (gy !== null && y > gy - 300) {
    rig.shadow.visible = true;
    rig.shadow.position.set(x, -gy + 0.6, 0);
    const s = G.clamp(1 + (y - gy) / 400, 0.3, 1);
    rig.shadow.scale.set(s, s * 0.6, 1);
    rig.shadow.material.opacity = 0.3 * s;
  }
}
// 残像の帯：軌跡の点をなめらかな曲線にして、新しいほど明るく太く
const RIB_COL = { katana: [0.75, 0.9, 1], gsword: [0.45, 0.7, 1], shield: [0.85, 0.92, 1], skate: [0.6, 0.95, 1], fire: [1, 0.55, 0.15], ice: [0.6, 0.95, 1], beam: [0.5, 0.85, 1], elec: [0.5, 0.9, 1] };
function updateRibbon(rig, f) {
  const t = f.trail;
  if (!t || t.length < 2 || !t[0] || t[0].length < 4) return;
  const N = rig.ribbonN, pos = rig.ribbon.geometry.attributes.position, col = rig.ribbon.geometry.attributes.color;
  const m = f.state === 'move' ? f.move : null;
  const c = RIB_COL[(m && m.elem) || (m && m.hits && m.hits.some(h => h.elec) ? 'elec' : f.c.weapon)] || [1, 1, 1];
  const z = (f.depthZ || 0) + 14;
  const cr = (a, b, c2, d, u, k) => 0.5 * (2 * b[k] + (-a[k] + c2[k]) * u + (2 * a[k] - 5 * b[k] + 4 * c2[k] - d[k]) * u * u + (-a[k] + 3 * b[k] - 3 * c2[k] + d[k]) * u * u * u);
  const L = t.length;
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1) * (L - 1), j = Math.min(L - 2, Math.floor(s)), u = s - j;
    const p0 = t[Math.max(0, j - 1)], p1 = t[j], p2 = t[j + 1], p3 = t[Math.min(L - 1, j + 2)];
    const tx = cr(p0, p1, p2, p3, u, 0), ty = cr(p0, p1, p2, p3, u, 1), bx = cr(p0, p1, p2, p3, u, 2), by = cr(p0, p1, p2, p3, u, 3);
    const a = i / (N - 1); // 0 = いちばん古い、1 = いま
    const w = 0.25 + 0.75 * a; // 古いほど細い
    pos.setXYZ(i * 2, tx, -ty, z); pos.setXYZ(i * 2 + 1, tx + (bx - tx) * w, -(ty + (by - ty) * w), z);
    const k = a * a; // 古いほど暗い（＝透明）
    col.setXYZ(i * 2, (0.5 + 0.5 * c[0]) * k, (0.5 + 0.5 * c[1]) * k, (0.5 + 0.5 * c[2]) * k); // 先は白っぽく
    col.setXYZ(i * 2 + 1, c[0] * k * 0.35, c[1] * k * 0.35, c[2] * k * 0.35);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
  rig.ribbon.visible = true;
}
/* ---------- 飛び道具 ---------- */
function projMesh(p) {
  let m = projMeshes.get(p);
  if (m) return m;
  const col = new THREE.Color(p.owner.color);
  if (p.type === 'arrow') {
    m = new THREE.Group();
    const faint = p.noHit; // 復帰用の矢（当たらない）はうすく
    const mk = c => new THREE.MeshStandardMaterial({ color: c, transparent: faint, opacity: faint ? 0.4 : 1, emissive: p.big ? 0x806020 : 0x000000 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(p.big ? 1.6 : 1, p.big ? 1.6 : 1, 28, 8), mk(0xf3e3c0));
    shaft.rotation.z = Math.PI / 2; shaft.position.x = -14; m.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(p.big ? 5 : 3.5, 9, 10), mk(col));
    head.rotation.z = -Math.PI / 2; head.position.x = 3; m.add(head);
    if (p.big) {
      const gl = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.35, depthWrite: false }));
      gl.scale.set(22, 9, 9); gl.position.x = -6; m.add(gl);
    }
  } else if (p.type === 'drill') {
    // 螺旋矢：太い矢＋回る羽根＋まわりの風の渦
    m = new THREE.Group();
    const spin = new THREE.Group(); m.add(spin); m.userData.spin = spin;
    const gold = new THREE.MeshStandardMaterial({ color: 0xf3e3c0, emissive: 0x6a4a10, metalness: 0.3, roughness: 0.4 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 34, 8), gold); shaft.rotation.z = Math.PI / 2; shaft.position.x = -16; spin.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(6, 16, 6), new THREE.MeshStandardMaterial({ color: col, emissive: 0x402000, metalness: 0.6, roughness: 0.3 }));
    head.rotation.z = -Math.PI / 2; head.position.x = 6; spin.add(head);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 5), gold);
      const a = i * Math.PI * 2 / 3; fin.position.set(-30, Math.cos(a) * 3, Math.sin(a) * 3); fin.rotation.x = a; spin.add(fin);
    }
    const wm = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    m.userData.winds = [];
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(10 + i * 4, 1.1, 4, 16, Math.PI * 1.3), wm);
      w.rotation.y = Math.PI / 2; w.position.x = -4 - i * 11; spin.add(w); m.userData.winds.push(w);
    }
  } else if (p.type === 'beam') {
    // ビーム：白い芯＋青い光（x方向に1の長さで作って、のびた分だけ横に伸ばす）
    m = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.rotation.z = Math.PI / 2; m.add(core);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16), new THREE.MeshBasicMaterial({ color: 0x3aa8ff, transparent: true, opacity: 0.6, depthWrite: false }));
    glow.rotation.z = Math.PI / 2; m.add(glow);
    const tipG = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0x8fe0ff, transparent: true, opacity: 0.75, depthWrite: false }));
    m.add(tipG);
    m.userData = { core, glow, tipG, life0: p.life };
  } else if (p.type === 'shard') {
    // 氷のつぶて：とがった氷の結晶
    m = new THREE.Group();
    const im = new THREE.MeshStandardMaterial({ color: 0xc8f4ff, emissive: 0x3a7a99, transparent: true, opacity: 0.85, metalness: 0.2, roughness: 0.1 });
    const c1 = new THREE.Mesh(new THREE.OctahedronGeometry(p.r * 0.9, 0), im); c1.scale.set(1.8, 0.7, 0.7); m.add(c1);
    const c2 = new THREE.Mesh(new THREE.OctahedronGeometry(p.r * 0.5, 0), im); c2.position.x = -p.r * 0.9; c2.rotation.x = 0.8; m.add(c2);
    const gl = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.3, depthWrite: false })); gl.scale.setScalar(p.r * 1.6); m.add(gl);
  } else if (p.type === 'fireball') {
    // 火の玉：明るい芯＋ゆらめく炎
    m = new THREE.Group();
    const core = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xfff0b0 })); core.scale.setScalar(p.r * 0.55); m.add(core);
    m.userData.fl = [];
    for (let i = 0; i < 3; i++) {
      const fl = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: i ? 0xff6a1a : 0xffa53a, transparent: true, opacity: 0.55 - i * 0.12, depthWrite: false }));
      fl.scale.setScalar(p.r * (0.85 + i * 0.3)); m.add(fl); m.userData.fl.push(fl);
    }
  } else if (p.type === 'disc') {
    m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 4, 24), new THREE.MeshStandardMaterial({ color: 0xcfe6ff, metalness: 0.85, roughness: 0.15 }));
  } else if (p.type === 'bullet') {
    m = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, p.big ? 16 : 9, 8), new THREE.MeshBasicMaterial({ color: p.big ? 0xffe28a : 0xfff4d0 }));
    b.rotation.z = Math.PI / 2; m.add(b);
    const gl = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: p.big ? 0.45 : 0.25, depthWrite: false }));
    gl.scale.set(p.big ? 16 : 9, p.big ? 6 : 3.5, p.big ? 6 : 3.5); m.add(gl);
  } else if (p.type === 'bubble') {
    // 泡：すきとおった球と、光の点
    m = new THREE.Group();
    m.add(new THREE.Mesh(SPH, new THREE.MeshStandardMaterial({ color: 0xcff6ff, emissive: 0x2a6f9f, transparent: true, opacity: 0.45, roughness: 0.05, depthWrite: false })));
    m.children[0].scale.setScalar(p.r);
    const hl = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.scale.setScalar(p.r * 0.18); hl.position.set(-p.r * 0.35, p.r * 0.4, p.r * 0.6); m.add(hl);
  } else if (p.type === 'wave') {
    // 三日月の斬撃
    m = new THREE.Mesh(new THREE.TorusGeometry(p.r, 3, 6, 18, Math.PI * 0.85), new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.8, depthWrite: false }));
    m.userData.arc = Math.PI * 0.85;
  } else if (p.type === 'mine') {
    m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(11, 13, 6, 16), new THREE.MeshStandardMaterial({ color: 0x2b2f3a, metalness: 0.5, roughness: 0.5 }));
    body.position.y = 3; m.add(body);
    m.userData.lamp = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0x702020 }));
    m.userData.lamp.scale.setScalar(2.6); m.userData.lamp.position.y = 7; m.add(m.userData.lamp);
  } else if (p.type === 'smoke') {
    m = new THREE.Group();
    m.userData.bomb = new THREE.Mesh(SPH, new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.6 }));
    m.userData.bomb.scale.setScalar(5); m.add(m.userData.bomb);
    m.userData.puffs = [];
    const pm = new THREE.MeshLambertMaterial({ color: 0xaab0c4, transparent: true, opacity: 0.45, depthWrite: false });
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(SPH, pm); s.visible = false;
      s.userData.o = [Math.cos(i * 0.9) * 0.55, Math.sin(i * 1.7) * 0.35, Math.sin(i * 2.3) * 0.4, 0.45 + (i % 3) * 0.12];
      m.add(s); m.userData.puffs.push(s);
    }
    m.userData.pm = pm;
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
  // 少し上から見下ろす（床の上面と奥行きが見えて「ステージ」らしくなる）
  const PITCH = 9 * Math.PI / 180;
  camera.position.set(cx, cy + Math.sin(PITCH) * d, Math.cos(PITCH) * d);
  camera.lookAt(cx, cy, 0);
  // 背景をカメラに少しついていかせる・粒を動かす
  if (window.Stages3D) window.Stages3D.update(cam, cy);
  // キャラ
  const seen = new Set();
  for (const f of b.f) {
    let rig = rigs.get(f);
    if (!rig) { rig = makeRig(f); rigs.set(f, rig); }
    seen.add(f);
    updateRig(rig, f, alpha, G);
  }
  for (const [f, rig] of rigs) if (!seen.has(f)) { scene.remove(rig.g, rig.bubble, rig.shadow, rig.ribbon); if (rig.mr) window.ModelRig.remove(rig.mr, scene); if (rig.whip) rig.whip.forEach(s => scene.remove(s)); if (rig.wire) scene.remove(rig.wire, rig.hook, rig.field); rigs.delete(f); }
  // 飛び道具
  const live = new Set(b.projectiles);
  for (const p of b.projectiles) {
    const m = projMesh(p);
    const px = G.lerp(p.px, p.x, alpha), py = G.lerp(p.py, p.y, alpha);
    m.position.set(px, -py, 0);
    if (p.type === 'arrow' || p.type === 'bullet') m.rotation.set(0, 0, Math.atan2(-p.vy, p.vx));
    else if (p.type === 'beam') {
      const u = m.userData, L = Math.max(1, p.len), k = Math.min(1, p.life / 6); // 最後は細くなって消える
      m.position.set(p.x + p.dir * L / 2, -p.y, 0);
      u.core.scale.set(p.r * 0.3 * k, L, p.r * 0.3 * k); u.glow.scale.set(p.r * (1 + Math.sin(p.age * 1.3) * 0.1) * k, L, p.r * k);
      u.tipG.position.set(-p.dir * L / 2, 0, 0); u.tipG.scale.setScalar(p.r * 1.6 * k);
    }
    else if (p.type === 'shard') { m.rotation.set(p.age * 0.3, 0, Math.atan2(-p.vy, p.vx)); }
    else if (p.type === 'fireball') {
      m.userData.fl.forEach((fl, i) => { fl.scale.setScalar(p.r * (0.85 + i * 0.3) * (1 + Math.sin(p.age * 0.7 + i * 2) * 0.12)); fl.position.set(-i * p.r * 0.25, Math.sin(p.age * 0.5 + i) * 1.5, 0); });
      m.rotation.z = Math.atan2(-p.vy, p.vx);
    }
    else if (p.type === 'drill') {
      m.rotation.set(0, 0, Math.atan2(-p.vy, p.vx));
      m.userData.spin.rotation.x = p.age * (p.grip ? 1.1 : 0.7); // 巻き込んでいる間はもっと速く回る
      m.userData.winds.forEach((w, i) => { w.scale.setScalar(1 + Math.sin(p.age * 0.5 + i) * 0.12 + (p.grip ? 0.35 : 0)); });
    }
    else if (p.type === 'disc') m.rotation.set(Math.PI / 2 - 0.4, 0, p.age * 0.4);
    else if (p.type === 'wave') {
      const d = p.vx < 0 ? Math.PI : 0;
      m.rotation.set(0, 0, d - m.userData.arc / 2);
      m.position.x -= (p.vx < 0 ? -1 : 1) * p.r * 0.6;
      m.material.opacity = Math.min(0.85, p.life / 10);
    } else if (p.type === 'mine') {
      m.userData.lamp.material.color.setHex(p.armed && Math.floor(p.age / 15) % 2 === 0 ? 0xff3030 : 0x702020);
    } else if (p.type === 'smoke') {
      m.userData.bomb.visible = !p.cloud;
      if (p.cloud) {
        m.position.y += 30;
        for (const s of m.userData.puffs) {
          const o = s.userData.o; s.visible = true;
          s.position.set(o[0] * p.r + Math.sin(p.age * 0.03 + o[1] * 9) * 4, o[1] * p.r, o[2] * p.r);
          s.scale.setScalar(p.r * o[3] * Math.min(1, 0.4 + (120 - p.life) / 15));
        }
        m.userData.pm.opacity = 0.45 * Math.min(1, p.life / 25);
      }
    }
    else { m.position.y = 15; m.scale.y = 0.8 + Math.sin(p.age * 0.8) * 0.2; }
  }
  for (const [p, m] of projMeshes) if (!live.has(p)) { scene.remove(m); projMeshes.delete(p); }
  // 描画（ブルームあり／なし）。重い端末では自動でブルームを切る
  const t0 = performance.now();
  if (composer && R.bloomOn) composer.render(); else renderer.render(scene, camera);
  perfWatch(performance.now() - t0);
  const W = view.w, H = view.h;
  return { X: wx => (wx - cam.x) * z + W / 2 + sx, Y: wy => (wy - cam.y) * z + H / 2 + sy, z };
};
window.Render3D = R;
})();
