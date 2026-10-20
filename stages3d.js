/* =====================================================================
   ステージ（3D）
   ・遠景（Higgsfieldで作った大きな絵）と中景（左右の建物などを切り抜いた絵）を
     カメラから遠い順に置き、カメラが動くと少しずつずれて奥行きが出るようにしています
   ・足場（床）や柱、光の粒・雨・桜吹雪などはプログラムで作っています
   ・当たり判定（床の広さ）は game.js の stage と同じで、見た目だけがステージごとに変わります
   ===================================================================== */
'use strict';
(() => {
const S = {};
const loader = new THREE.TextureLoader();
const texCache = new Map();
function tex(url) {
  if (texCache.has(url)) return texCache.get(url);
  const t = loader.load(url);
  t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  texCache.set(url, t);
  return t;
}
// キャンバスで模様を描いてテクスチャにする
function ctex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (rx !== 1 || ry !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
  return t;
}
const rnd = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.8, metalness: 0.05 }, o));
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

// 柔らかい丸（光の粒・雲・煙用）
function softDot(color, size = 64) {
  return ctex(size, size, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, color); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}
// 遠景・中景の絵（カメラの動きに対して ratio の割合だけついてくる＝遠いほど動かない）
function backdrop(root, url, w, z, y, ratio, opts = {}) {
  const t = tex(url);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / (opts.aspect || 2.357)),
    new THREE.MeshBasicMaterial({ map: t, fog: false, depthWrite: false, transparent: !!opts.alpha }));
  m.position.set(0, y, z); m.renderOrder = opts.order || -10;
  m.userData = { y, ratio };
  root.add(m);
  return m;
}
// 浮かんで流れる粒（光・花びら・雨など）
function particles(root, n, opt) {
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * opt.w; pos[i * 3 + 1] = opt.y0 + rnd() * opt.h; pos[i * 3 + 2] = opt.z0 + rnd() * opt.d;
    vel.push([opt.vx * (0.6 + rnd() * 0.8), opt.vy * (0.6 + rnd() * 0.8), rnd() * 6.28]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: opt.map, size: opt.size, sizeAttenuation: true, transparent: true, depthWrite: false,
    opacity: opt.opacity || 1, color: opt.color || 0xffffff, blending: opt.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
  const p = new THREE.Points(g, mat); root.add(p);
  return { p, update(t, cx) {
    const a = g.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const v = vel[i];
      a[i * 3] += v[0] + Math.sin(t * (opt.sway || 0) + v[2]) * (opt.swayAmp || 0);
      a[i * 3 + 1] += v[1];
      if (a[i * 3 + 1] > opt.y0 + opt.h) a[i * 3 + 1] = opt.y0;
      if (a[i * 3 + 1] < opt.y0) a[i * 3 + 1] = opt.y0 + opt.h;
      const L = cx - opt.w / 2, R = cx + opt.w / 2;
      if (a[i * 3] < L) a[i * 3] += opt.w; else if (a[i * 3] > R) a[i * 3] -= opt.w;
    }
    g.attributes.position.needsUpdate = true;
  } };
}
function lights(root, o) {
  root.add(new THREE.HemisphereLight(o.sky, o.ground, o.hemi));
  const k = new THREE.DirectionalLight(o.key, o.keyI); k.position.set(...o.keyPos); root.add(k);
  for (const r of o.rims || []) { const l = new THREE.DirectionalLight(r[0], r[1]); l.position.set(...r[2]); root.add(l); }
}

/* ---------- 1：夕焼けの天空神殿 ---------- */
function temple(root, G, upd) {
  const hw = G.ST.halfWidth;
  lights(root, { sky: 0xffe2c4, ground: 0x6a5a86, hemi: 0.72, key: 0xffc890, keyI: 1.0, keyPos: [-600, 520, 520],
    rims: [[0xffb070, 0.55, [600, 300, -500]], [0xb8a0ff, 0.25, [0, -300, 400]]] });
  backdrop(root, 'stage/temple_far.jpg', 9400, -3600, 230, 0.86);
  backdrop(root, 'stage/temple_mid.webp', 3100, -2500, 260, 0.76, { alpha: true, order: -9 });
  // 大理石の模様
  const marble = ctex(512, 256, (g, w, h) => {
    g.fillStyle = '#efe7d8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${200 + rnd() * 40},${190 + rnd() * 40},${170 + rnd() * 40},0.25)`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 2 + rnd() * 6); }
    g.strokeStyle = 'rgba(150,140,130,0.35)';
    for (let i = 0; i < 14; i++) { g.lineWidth = 0.6 + rnd() * 1.4; g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.3) * 60; y += (rnd() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(120,110,100,0.4)'; g.lineWidth = 2; for (let x = 0; x < w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  }, 4, 1);
  const marbleM = std({ map: marble, roughness: 0.55, color: 0xcfc4b2 });
  const gold = std({ color: 0xd8aa4c, metalness: 0.75, roughness: 0.3, emissive: 0x2a1a00 });
  const top = box(hw * 2, 16, 250, marbleM); top.position.set(0, -8, -60); root.add(top);
  for (const [y, h, w] of [[-2, 4, hw * 2 + 8], [-16, 3, hw * 2 + 4]]) { const b = box(w, h, 6, gold); b.position.set(0, y, 66); root.add(b); }
  // 段（ギリシャ風の雷文の帯）
  const meander = ctex(256, 32, (g, w, h) => {
    g.fillStyle = '#e2d6bf'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a8874a'; g.lineWidth = 3;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x + 4, 26); g.lineTo(x + 4, 6); g.lineTo(x + 24, 6); g.lineTo(x + 24, 20); g.lineTo(x + 12, 20); g.lineTo(x + 12, 12); g.stroke(); }
  }, 12, 1);
  const tier = box(hw * 2 - 30, 34, 230, [std({ map: meander, roughness: 0.5 }), std({ map: meander }), std({ color: 0xd8ccb4 }), std({ color: 0xd8ccb4 }), std({ map: meander, roughness: 0.5 }), std({ map: meander })]);
  tier.position.set(0, -33, -62); root.add(tier);
  // 浮き島の岩（下にいくほど細い）
  const rockG = new THREE.CylinderGeometry(hw - 30, 50, 360, 11, 5);
  const p = rockG.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 1 + (rnd() - 0.5) * 0.22; p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); p.setY(i, p.getY(i) + (rnd() - 0.5) * 18); }
  rockG.computeVertexNormals();
  const rock = new THREE.Mesh(rockG, std({ color: 0x9a8268, roughness: 0.95, flatShading: true }));
  rock.scale.z = 0.42; rock.position.set(0, -50 - 180, -60); root.add(rock);
  // 草とつる
  const moss = std({ color: 0x5e8a3c, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 0.8, 40 + rnd() * 90, 5), moss);
    const x = (rnd() - 0.5) * (hw * 1.7); v.position.set(x, -60 - 30 - rnd() * 30, 30 + rnd() * 20); v.rotation.z = (rnd() - 0.5) * 0.3; root.add(v);
  }
  // 滝（流れる模様）
  const fallT = ctex(64, 256, (g, w, h) => {
    g.fillStyle = 'rgba(220,240,255,0.0)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(235,248,255,${0.25 + rnd() * 0.5})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 20 + rnd() * 60); }
  }, 1, 2);
  for (const x of [-hw + 90, hw - 120]) {
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(46, 520), new THREE.MeshBasicMaterial({ map: fallT, transparent: true, depthWrite: false, opacity: 0.85, fog: false }));
    wf.position.set(x, -60 - 260, 40); root.add(wf);
    upd.push(t => { fallT.offset.y = (t * 0.9) % 1; });
  }
  // 柱（後ろに4本。2本は折れている）
  const flute = ctex(128, 32, (g, w, h) => { g.fillStyle = '#f2ead9'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(160,145,120,0.45)'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 5, h); }, 1, 1);
  const colM = std({ map: flute, roughness: 0.6, color: 0xc9bea9 });
  for (const [x, h] of [[-hw + 40, 300], [-hw + 190, 130], [hw - 170, 175], [hw - 40, 300]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(17, 19, h, 16), colM); c.position.set(x, h / 2, -165); root.add(c);
    const b = box(52, 12, 52, marbleM); b.position.set(x, 6, -165); root.add(b);
    if (h > 200) { const cap = box(58, 14, 58, marbleM); cap.position.set(x, h + 7, -165); root.add(cap); const g2 = box(60, 4, 60, gold); g2.position.set(x, h + 16, -165); root.add(g2); }
    else { const tilt = box(34, 18, 34, marbleM); tilt.position.set(x + 10, h + 2, -165); tilt.rotation.z = 0.5; root.add(tilt); }
  }
  // 近くの雲（ゆっくり流れる）と、ふわっと上る金色の光
  const cloudT = softDot('rgba(255,236,220,0.9)', 128);
  const cl = particles(root, 26, { map: cloudT, size: 900, w: 5200, y0: -900, h: 700, z0: -1700, d: 1300, vx: -0.35, vy: 0, opacity: 0.55 });
  const motes = particles(root, 70, { map: softDot('rgba(255,220,140,1)'), size: 10, w: 2200, y0: -150, h: 700, z0: -400, d: 500, vx: 0.05, vy: 0.35, sway: 0.8, swayAmp: 0.25, add: true, opacity: 0.9 });
  upd.push((t, cam) => { cl.update(t, cam.x); motes.update(t, cam.x); });
  return { fog: [0xf1c49c, 2200, 7000], clear: 0xf3c6a0 };
}

/* ---------- 2：夜の摩天楼の屋上 ---------- */
function city(root, G, upd) {
  const hw = G.ST.halfWidth;
  lights(root, { sky: 0x8a96ff, ground: 0x241238, hemi: 0.6, key: 0xb6c8ff, keyI: 0.72, keyPos: [-300, 620, 420],
    rims: [[0xff4fd8, 0.85, [-600, 220, -420]], [0x40e0ff, 0.75, [620, 260, -380]]] });
  backdrop(root, 'stage/city_far.jpg', 9400, -3600, 330, 0.86);
  backdrop(root, 'stage/city_mid.webp', 3100, -2500, 60, 0.76, { alpha: true, order: -9 });
  // 屋上の床（コンクリートのパネル）
  const conc = ctex(512, 256, (g, w, h) => {
    g.fillStyle = '#4a4e5c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { const v = 60 + rnd() * 40; g.fillStyle = `rgba(${v},${v},${v + 8},0.35)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    g.strokeStyle = 'rgba(25,25,35,0.7)'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, 4, 1);
  const top = box(hw * 2, 14, 250, std({ map: conc, roughness: 0.75, color: 0x9aa0b8 })); top.position.set(0, -7, -60); root.add(top);
  // 床の円（ヘリポートのような印。文字はなし）
  for (const [r0, r1, o] of [[118, 126, 0.55], [92, 96, 0.35]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.scale.y = 0.55; ring.position.set(0, 0.6, -40); root.add(ring);
  }
  // 手前のふちのLED（ゆっくり色が流れる）
  const ledM = new THREE.MeshBasicMaterial({ color: 0x40e0ff });
  const led = box(hw * 2, 2.4, 2, ledM); led.position.set(0, -4, 66); root.add(led);
  upd.push(t => { const k = (Math.sin(t * 0.8) + 1) / 2; ledM.color.setRGB(0.25 + 0.75 * k, 0.88 - 0.6 * k, 1); });
  // ビル本体（窓の明かり）
  const win = ctex(512, 1024, (g, w, h) => {
    g.fillStyle = '#141428'; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 24) for (let x = 6; x < w; x += 20) {
      const r = rnd(); g.fillStyle = r < 0.72 ? '#1a1d38' : r < 0.9 ? '#ffd890' : r < 0.96 ? '#7fe8ff' : '#ff7fe0';
      g.globalAlpha = r < 0.72 ? 1 : 0.45 + rnd() * 0.45; g.fillRect(x, y, 12, 14);
    }
    g.globalAlpha = 1;
  }, 5, 7);
  // 空に浮かぶビルの最上部（下にいくほど細くなり、先に推進装置の光）
  const winM = std({ map: win, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.28, roughness: 0.6 });
  const body = box(hw * 2 - 80, 200, 210, winM); body.position.set(0, -14 - 100, -62); root.add(body);
  const lipM = std({ color: 0x2a2d3a, metalness: 0.6, roughness: 0.4 });
  const lip = box(hw * 2 - 40, 10, 225, lipM); lip.position.set(0, -214, -62); root.add(lip);
  const spireG = new THREE.CylinderGeometry((hw - 60) * 1.414, 40, 520, 4, 1);
  const spire = new THREE.Mesh(spireG, winM); spire.rotation.y = Math.PI / 4; spire.scale.z = 0.36; spire.position.set(0, -219 - 260, -62); root.add(spire);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('rgba(90,220,255,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  core.scale.set(260, 260, 1); core.position.set(0, -760, -40); root.add(core);
  upd.push(t => { const k = 1 + Math.sin(t * 9) * 0.06 + Math.sin(t * 23) * 0.04; core.scale.set(260 * k, 300 * k, 1); });
  for (const sx of [-1, 1]) { const st = box(10, 560, 10, std({ color: 0x40e0ff, emissive: 0x40e0ff, emissiveIntensity: 0.8 })); st.position.set(sx * (hw - 105), -214 - 250, 24); st.rotation.z = sx * 0.28; root.add(st); }
  // 奥の設備：室外機・パイプ・貯水タンク・赤く点滅するアンテナ
  const metal = std({ color: 0x5a6070, metalness: 0.5, roughness: 0.45 });
  for (const [x, w, h] of [[-hw + 70, 90, 46], [-hw + 175, 70, 34], [hw - 230, 80, 40]]) {
    const u = box(w, h, 60, metal); u.position.set(x, h / 2, -150); root.add(u);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 3, 20), std({ color: 0x23262e })); fan.rotation.x = Math.PI / 2; fan.position.set(x, h / 2, -119); root.add(fan);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 80, 20), std({ color: 0x3a3340, roughness: 0.7 })); tank.position.set(hw - 70, 130, -170); root.add(tank);
  for (const lx of [-25, 25]) { const leg = box(5, 90, 5, metal); leg.position.set(hw - 70 + lx, 45, -170); root.add(leg); }
  const mast = box(5, 260, 5, metal); mast.position.set(-hw + 30, 130, -185); root.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff2020 })); beacon.position.set(-hw + 30, 262, -185); root.add(beacon);
  upd.push(t => { beacon.visible = Math.floor(t * 1.4) % 2 === 0; });
  // 雨（細い線）と、遠くを飛ぶ車の光
  const rainN = 160, rp = new Float32Array(rainN * 6);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.35, fog: false })); root.add(rain);
  const rs = []; for (let i = 0; i < rainN; i++) rs.push([(rnd() - 0.5) * 2600, rnd() * 1400 - 700, -200 - rnd() * 700, 9 + rnd() * 6]);
  upd.push((t, cam) => {
    for (let i = 0; i < rainN; i++) {
      const r = rs[i]; r[1] -= r[3]; if (r[1] < -700) { r[1] = 700; r[0] = cam.x + (rnd() - 0.5) * 2600; }
      rp.set([r[0], r[1], r[2], r[0] + 3, r[1] + 26, r[2]], i * 6);
    }
    rg.attributes.position.needsUpdate = true;
  });
  const cars = particles(root, 24, { map: softDot('rgba(255,240,200,1)'), size: 16, w: 4800, y0: 120, h: 500, z0: -1100, d: 200, vx: 2.2, vy: 0, add: true });
  const cars2 = particles(root, 18, { map: softDot('rgba(255,90,120,1)'), size: 14, w: 4800, y0: 200, h: 400, z0: -1000, d: 200, vx: -1.8, vy: 0, add: true });
  upd.push((t, cam) => { cars.update(t, cam.x); cars2.update(t, cam.x); });
  return { fog: [0x1d1340, 2400, 7500], clear: 0x120b2a };
}

/* ---------- 3：和の古城と夜桜 ---------- */
function castle(root, G, upd) {
  const hw = G.ST.halfWidth;
  lights(root, { sky: 0xa8b8ff, ground: 0x3a2440, hemi: 0.58, key: 0xd0dcff, keyI: 0.85, keyPos: [420, 700, 300],
    rims: [[0xffb070, 0.45, [-500, 80, 500]], [0xff9ad0, 0.3, [0, 200, -600]]] });
  backdrop(root, 'stage/castle_far.jpg', 9400, -3600, 260, 0.86);
  backdrop(root, 'stage/castle_mid.webp', 3100, -2500, 60, 0.76, { alpha: true, order: -9 });
  // 瓦（丸い瓦の列）
  const tiles = ctex(256, 128, (g, w, h) => {
    g.fillStyle = '#262c3c'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#1b2030'); gr.addColorStop(0.45, '#4a5470'); gr.addColorStop(1, '#1b2030');
      g.fillStyle = gr; g.fillRect(x + 1, 0, 14, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
  }, 12, 1);
  const tileM = std({ map: tiles, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
  // 足場＝屋根のいちばん上（棟）
  const ridge = box(hw * 2, 16, 170, std({ color: 0x30384c, roughness: 0.6 })); ridge.position.set(0, -8, -40); root.add(ridge);
  const ridgeTop = box(hw * 2, 3, 172, std({ color: 0x3e465c, roughness: 0.7, metalness: 0.1 })); ridgeTop.position.set(0, -1, -40); root.add(ridgeTop);
  const goldM = std({ color: 0xd9ad48, metalness: 0.8, roughness: 0.3, emissive: 0x241600 });
  const trim = box(hw * 2 + 6, 3, 4, goldM); trim.position.set(0, -14, 46); root.add(trim);
  // 前と奥に下がる屋根（反り）
  for (const side of [1, -1]) {
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 - 30, 120, 1, 6), tileM);
    const pg = slope.geometry.attributes.position;
    for (let i = 0; i < pg.count; i++) { const v = (pg.getY(i) + 60) / 120; pg.setZ(i, Math.pow(1 - v, 2) * 18); } // 軒先が少し反る
    slope.geometry.computeVertexNormals();
    slope.rotation.x = side > 0 ? -1.07 : 1.07;
    slope.position.set(0, -45, side > 0 ? 99 : -179);
    root.add(slope);
  }
  // 両はしの金のしゃちほこ（形をかんたんにしたもの）
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    const bodyF = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 10), goldM); bodyF.scale.set(1, 1.6, 0.8); g.add(bodyF);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(8, 22, 8), goldM); tail.position.set(sx * 6, 22, 0); tail.rotation.z = -sx * 0.7; g.add(tail);
    g.scale.setScalar(0.75); g.position.set(sx * (hw + 8), 10, -40); root.add(g);
  }
  // 白い壁と黒い窓、その下に石垣
  const wall = ctex(512, 128, (g, w, h) => {
    g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,50,40,0.55)'; for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 8, h); // 柱
    g.fillStyle = '#3a3026'; g.fillRect(0, 0, w, 10); g.fillRect(0, 62, w, 6); // はり
    g.fillStyle = '#2a2e3a'; g.fillRect(0, h - 26, w, 26);
  }, 3, 1);
  const wallB = box(hw * 2 - 120, 150, 230, std({ map: wall, roughness: 0.8, color: 0xa9a7a2 })); wallB.position.set(0, -190, -90); root.add(wallB);
  const stone = ctex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4c55'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 28) for (let x = -(y % 56); x < w; x += 56) { const v = 70 + rnd() * 40; g.fillStyle = `rgb(${v},${v},${v + 8})`; g.fillRect(x + 2, y + 2, 52, 24); }
  }, 6, 4);
  // 浮かぶ石垣（下にいくほど細い岩のかたまり）と、その下の雲
  const baseG = new THREE.CylinderGeometry(hw - 60, 70, 520, 9, 4);
  const bp = baseG.attributes.position;
  for (let i = 0; i < bp.count; i++) { const f = 1 + (rnd() - 0.5) * 0.16; bp.setX(i, bp.getX(i) * f); bp.setZ(i, bp.getZ(i) * f); }
  baseG.computeVertexNormals();
  const base = new THREE.Mesh(baseG, std({ map: stone, roughness: 0.9, flatShading: true }));
  base.scale.z = 0.42; base.position.set(0, -265 - 260, -90); root.add(base);
  const mist = particles(root, 22, { map: softDot('rgba(170,180,230,0.8)', 128), size: 700, w: 4200, y0: -1000, h: 380, z0: -900, d: 900, vx: -0.25, vy: 0, opacity: 0.4 });
  upd.push((t, cam) => mist.update(t, cam.x));
  // 奥の提灯（ゆらゆら）
  const lanternM = new THREE.MeshBasicMaterial({ color: 0xffb060 });
  for (const x of [-hw + 60, -150, 150, hw - 60]) {
    const pole = box(3, 120, 3, std({ color: 0x2a2420 })); pole.position.set(x, 60, -150); root.add(pole);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 18, 12), lanternM); l.position.set(x, 112, -150); root.add(l);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('rgba(255,170,90,0.9)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(70, 70, 1); glow.position.set(x, 112, -148); root.add(glow);
    upd.push(t => { const k = 0.85 + Math.sin(t * 3 + x) * 0.08 + Math.sin(t * 7.3 + x * 2) * 0.05; glow.scale.set(70 * k, 70 * k, 1); });
  }
  // 桜吹雪
  const petal = ctex(32, 32, (g) => {
    g.fillStyle = '#ffc4dc'; g.beginPath(); g.ellipse(16, 16, 12, 7, 0.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff9cc4'; g.beginPath(); g.ellipse(18, 14, 5, 3, 0.6, 0, Math.PI * 2); g.fill();
  });
  const pt = particles(root, 140, { map: petal, size: 9, w: 2600, y0: -500, h: 1200, z0: -500, d: 700, vx: -0.9, vy: -0.9, sway: 1.3, swayAmp: 0.7 });
  const pt2 = particles(root, 30, { map: petal, size: 7, w: 1800, y0: -300, h: 900, z0: -60, d: 120, vx: -1.2, vy: -1.3, sway: 1.6, swayAmp: 1 });
  upd.push((t, cam) => { pt.update(t, cam.x); pt2.update(t, cam.x); });
  return { fog: [0x1d2244, 2400, 7500], clear: 0x141834 };
}

// すり抜け床の見た目（ステージごと）
function platform(id, root, p, upd) {
  const { x, h, w } = p;
  if (id === 'temple') {
    const m = std({ color: 0xd4c9b6, roughness: 0.5 });
    const slab = box(w, 14, 110, m); slab.position.set(x, h - 7, -40); root.add(slab);
    const gold = std({ color: 0xd8aa4c, metalness: 0.75, roughness: 0.3, emissive: 0x2a1a00 });
    const tr = box(w + 4, 3, 4, gold); tr.position.set(x, h - 2, 16); root.add(tr);
    const orn = new THREE.Mesh(new THREE.ConeGeometry(w * 0.16, 46, 8), m); orn.rotation.x = Math.PI; orn.position.set(x, h - 37, -40); root.add(orn);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(7), gold); gem.position.set(x, h - 66, -40); root.add(gem);
    upd.push(t => { gem.rotation.y = t * 1.2; gem.position.y = h - 66 + Math.sin(t * 2 + x) * 3; });
  } else if (id === 'city') {
    const m = std({ color: 0x5c6378, metalness: 0.55, roughness: 0.35 });
    const deck = box(w, 10, 100, m); deck.position.set(x, h - 5, -40); root.add(deck);
    const edgeM = new THREE.MeshBasicMaterial({ color: 0x40e0ff });
    const edge = box(w, 2.5, 2.5, edgeM); edge.position.set(x, h - 1, 11); root.add(edge);
    const edge2 = box(w, 2, 2, edgeM); edge2.position.set(x, h - 9, 11); root.add(edge2);
    for (const sx of [-0.32, 0.32]) {
      const th = new THREE.Mesh(new THREE.CylinderGeometry(9, 6, 14, 12), m); th.position.set(x + sx * w, h - 17, -40); root.add(th);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('rgba(90,220,255,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      gl.position.set(x + sx * w, h - 34, -38); root.add(gl);
      upd.push(t => { const k = 1 + Math.sin(t * 17 + sx * 9 + x) * 0.12; gl.scale.set(26 * k, 44 * k, 1); });
    }
  } else {
    const wood = std({ color: 0x6e4a30, roughness: 0.8 });
    const plank = box(w, 9, 90, wood); plank.position.set(x, h - 4.5, -40); root.add(plank);
    const red = std({ color: 0x9a2a22, roughness: 0.6 });
    const beam = box(w + 10, 6, 6, red); beam.position.set(x, h - 11, 6); root.add(beam);
    for (const sx of [-0.4, 0.4]) {
      const rope = box(1.2, 26, 1.2, std({ color: 0x2a2018 })); rope.position.set(x + sx * w, h - 24, 4); root.add(rope);
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 14, 12), new THREE.MeshBasicMaterial({ color: 0xffb060 })); lan.position.set(x + sx * w, h - 42, 4); root.add(lan);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('rgba(255,170,90,0.9)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      gl.scale.set(50, 50, 1); gl.position.set(x + sx * w, h - 42, 6); root.add(gl);
    }
  }
}
const BUILDERS = { temple, city, castle };
// ステージを作る（前のステージは消す）
S.build = function (scene, renderer, id, G) {
  if (S.cur) { scene.remove(S.cur.root); }
  const root = new THREE.Group();
  const upd = [];
  const build = BUILDERS[id] || temple;
  const env = build(root, G, upd);
  const def = (G.D.stages || []).find(s2 => s2.id === id);
  for (const p of (def && def.platforms) || []) platform(id, root, p, upd);
  scene.add(root);
  scene.fog = new THREE.Fog(env.fog[0], env.fog[1], env.fog[2]);
  renderer.setClearColor(env.clear);
  S.cur = { id, root, upd };
  return S.cur;
};
// 毎コマ：遠景・中景をカメラに少しついていかせる、粒を動かす
S.update = function (cam, camY) {
  const c = S.cur; if (!c) return;
  const t = performance.now() / 1000;
  for (const o of c.root.children) {
    const u = o.userData;
    if (u && u.ratio) { o.position.x = cam.x * u.ratio; o.position.y = u.y + camY * u.ratio; }
  }
  for (const f of c.upd) f(t, cam);
};
window.Stages3D = S;
})();
