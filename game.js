/* =====================================================================
   ゲーム本体（動き・当たり判定・吹っ飛び・CPU・描画・タッチ操作）
   数値の調整は data.js で行います
   ===================================================================== */
'use strict';
(() => {
const D = window.GAME_DATA;
const PH = D.physics;
const ST = D.stage;
const DEBUG = /[?&]debug=1/.test(location.search);
const STEP = 1 / 60;
const BUFFER = 6; // ボタンの先行入力を受け付けるコマ数

/* ---------------- 便利関数 ---------------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const DEG = Math.PI / 180;
const rnd = Math.random;
const sign = v => (v < 0 ? -1 : 1);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const clone = o => JSON.parse(JSON.stringify(o));
function deepMerge(base, over) {
  if (Array.isArray(over)) {
    const out = Array.isArray(base) ? base.slice() : [];
    over.forEach((v, i) => {
      out[i] = v && typeof v === 'object' && out[i] && typeof out[i] === 'object' ? deepMerge(out[i], v) : v;
    });
    return out;
  }
  if (over && typeof over === 'object') {
    const out = Object.assign({}, base);
    for (const k in over) {
      const v = over[k];
      out[k] = v && typeof v === 'object' && base && base[k] && typeof base[k] === 'object' ? deepMerge(base[k], v) : v;
    }
    return out;
  }
  return over;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境では無視 */ } },
};

/* =====================================================================
   棒人間のポーズ
   角度（度）：t=胴の傾き / fa=前の腕 / ba=後ろの腕 / fl=前の脚 / bl=後ろの脚 / r=体全体の回転
   腕・脚は 0=真下、90=前、180=真上。2つ目の数字はひじ・ひざの曲げ
   ===================================================================== */
const PK = ['t', 'fa1', 'fa2', 'ba1', 'ba2', 'fl1', 'fl2', 'bl1', 'bl2', 'r'];
function P(t, fa1, fa2, ba1, ba2, fl1, fl2, bl1, bl2, r = 0) { return { t, fa1, fa2, ba1, ba2, fl1, fl2, bl1, bl2, r }; }
const POSES = {
  idle:         P(6, 25, 75, -10, 85, 14, -12, -14, -6),
  idle2:        P(8, 28, 82, -6, 92, 16, -16, -12, -8),
  walk1:        P(8, -25, 25, 30, 30, 30, -15, -25, -35),
  walk2:        P(8, 30, 30, -25, 25, -25, -35, 30, -15),
  run1:         P(24, -50, 85, 60, 75, 65, -85, -40, -75),
  run2:         P(24, 60, 75, -50, 85, -40, -75, 65, -85),
  crouch:       P(30, 35, 65, 15, 75, 70, -120, -10, -100),
  jump:         P(0, 150, 15, 130, 25, 45, -75, -10, -45),
  fall:         P(4, 115, 30, 100, 40, 25, -30, -20, -35),
  helpless:     P(0, 165, 5, 175, 0, 10, -15, -12, -10),
  shield:       P(10, 60, 100, 40, 110, 30, -40, -28, -18),
  hurt:         P(-25, -60, 25, -85, 15, 25, -25, -15, -10),
  tumble:       P(-10, -120, 20, -150, 20, 40, -60, -30, -40),
  down:         P(0, 170, 0, 160, 0, 5, 0, -5, 0, -90),
  grab:         P(22, 90, 5, 80, 15, 45, -45, -30, -10),
  hold:         P(10, 80, 25, 70, 35, 20, -20, -20, -10),
  grabbed:      P(-15, -30, 20, -40, 20, 10, -10, -10, -10),
  punchWind:    P(-6, -35, 120, 45, 80, 30, -30, -25, -10),
  punch:        P(20, 80, 0, -45, 60, 45, -40, -35, 0),
  uppercutWind: P(26, -10, 35, 60, 80, 70, -105, 0, -60),
  uppercut:     P(-12, 172, 0, 25, 60, 10, -10, -20, -10),
  sweepWind:    P(36, 40, 30, 20, 40, 75, -120, -10, -90),
  sweep:        P(32, 55, 20, -10, 50, 88, 0, -15, -100),
  kickWind:     P(-10, 20, 60, -20, 60, 90, -110, -5, -5),
  kick:         P(-25, -20, 40, -40, 40, 95, 0, -10, -5),
  upKick:       P(-20, 40, 40, 20, 40, 165, 0, -20, -30),
  stomp:        P(0, 125, 20, 115, 20, 0, 0, 15, -70),
  backKick:     P(18, 45, 60, 30, 60, 35, -70, -105, 0),
  nairSpread:   P(0, 90, 0, -90, 0, 80, 0, -60, -20),
  overheadWind: P(-22, 170, 30, 160, 30, 25, -30, -25, -15),
  overheadSlam: P(38, 60, 0, 60, 0, 55, -70, -35, -15),
  smashFwdWind: P(-16, -85, 60, -60, 70, 30, -40, -32, -20),
  smashFwd:     P(30, 85, -5, -60, 30, 60, -60, -40, 0),
  smashUpWind:  P(22, -10, 20, -20, 20, 70, -110, -5, -90),
  smashUp:      P(-10, 176, 0, 168, 0, 10, 0, -10, 0),
  smashDownWind:P(8, 150, 20, 140, 20, 40, -30, -40, -20),
  smashDown:    P(45, 25, -10, 30, -10, 60, -80, -50, -30),
  lariat:       P(12, 90, 0, -90, 0, 40, -40, -30, -10),
  swingWind:    P(-12, -125, -20, 40, 70, 30, -30, -25, -10),
  swingFwd:     P(24, 85, 0, -40, 60, 45, -40, -35, 0),
  swingUpWind:  P(18, -40, 0, 20, 60, 40, -50, -20, -20),
  swingUp:      P(-10, 170, 0, 40, 60, 15, -15, -20, -10),
  swingLowWind: P(30, -60, 0, 20, 60, 70, -115, -10, -90),
  swingLow:     P(34, 60, -10, 10, 60, 70, -115, -10, -90),
  swingDown:    P(10, 15, 0, 60, 60, 25, -40, -20, -30),
  aimBack:      P(-5, -95, 0, 40, 60, 30, -30, -25, -10),
  aim:          P(4, 90, 0, 90, 165, 30, -25, -28, -10),
  release:      P(4, 90, 0, 60, 60, 30, -25, -28, -10),
  aimUp:        P(-8, 150, 0, 150, 165, 20, -20, -25, -10),
  releaseUp:    P(-8, 150, 0, 140, 90, 20, -20, -25, -10),
  aimDown:      P(10, 35, 0, 35, 165, 25, -30, -20, -20),
  releaseDown:  P(10, 35, 0, 30, 100, 25, -30, -20, -20),
  aimDiag:      P(8, 50, 0, 50, 165, 30, -40, -20, -30),
  releaseDiag:  P(8, 50, 0, 45, 100, 30, -40, -20, -30),
  guardWind:    P(-8, 40, 80, 20, 80, 25, -25, -20, -10),
  guard:        P(10, 85, -5, 40, 90, 35, -35, -28, -10),
  guardUp:      P(-5, 170, 0, 60, 80, 25, -25, -20, -10),
  guardDown:    P(20, 10, 0, 40, 80, 40, -50, -20, -30),
  guardLow:     P(35, 65, -10, 20, 60, 70, -115, -10, -90),
  guardDownAir: P(0, 10, 0, 30, 60, 10, -20, -10, -30),
  bash:         P(28, 85, 0, -40, 60, 55, -50, -40, 0),
  pull:         P(-15, 60, 60, 20, 80, 10, -10, -40, -10),
  counter:      P(-5, 20, 90, -20, 80, 25, -30, -28, -10),
  counterHit:   P(30, 95, 0, -60, 40, 60, -60, -40, 0),
  throwFwd:     P(25, 90, 0, 85, 10, 55, -55, -35, 0),
  throwUp:      P(-10, 175, 0, 170, 0, 20, -20, -15, -10),
  throwDown:    P(45, 30, 0, 30, 0, 60, -80, -45, -20),
};
function lerpPose(a, b, t) {
  const o = {};
  for (const k of PK) o[k] = lerp(a[k], b[k], t);
  return o;
}
function copyPose(p) { const o = {}; for (const k of PK) o[k] = p[k]; return o; }

const SK = { thigh: 24, shin: 23, torso: 30, upper: 18, fore: 17 };
function dirv(a) { const r = a * DEG; return [Math.sin(r), -Math.cos(r)]; }
// ポーズ → 関節の位置（前向き・上がプラスの座標）
function solvePose(p, look, plant, plantAll) {
  const H = [0, 47];
  const td = [Math.sin(p.t * DEG), Math.cos(p.t * DEG)];
  const N = [H[0] + td[0] * SK.torso, H[1] + td[1] * SK.torso];
  const S = [H[0] + td[0] * (SK.torso - 3), H[1] + td[1] * (SK.torso - 3)];
  const head = [N[0] + td[0] * (look.head + 1), N[1] + td[1] * (look.head + 1)];
  const limb = (o, a1, a2, l1, l2) => {
    const d1 = dirv(a1), m = [o[0] + d1[0] * l1, o[1] + d1[1] * l1];
    const d2 = dirv(a1 + a2), e = [m[0] + d2[0] * l2, m[1] + d2[1] * l2];
    return [m, e];
  };
  const [fE, fH] = limb(S, p.fa1 + p.t, p.fa2, SK.upper, SK.fore);
  const [bE, bH] = limb(S, p.ba1 + p.t, p.ba2, SK.upper, SK.fore);
  const [fK, fF] = limb(H, p.fl1, p.fl2, SK.thigh, SK.shin);
  const [bK, bF] = limb(H, p.bl1, p.bl2, SK.thigh, SK.shin);
  const pts = { H, N, S, head, fE, fH, bE, bH, fK, fF, bK, bF };
  if (p.r) {
    const th = -p.r * DEG, c = Math.cos(th), s = Math.sin(th);
    for (const k in pts) {
      const q = pts[k], x = q[0] - H[0], y = q[1] - H[1];
      pts[k] = [H[0] + x * c - y * s, H[1] + x * s + y * c];
    }
  }
  if (plant) {
    let m = Math.min(pts.fF[1], pts.bF[1], pts.fK[1], pts.bK[1]);
    if (plantAll) m = Math.min(m, pts.head[1] - look.head, pts.fH[1], pts.bH[1], pts.H[1]);
    for (const k in pts) pts[k] = [pts[k][0], pts[k][1] - m];
  }
  return pts;
}

/* =====================================================================
   技データの準備（武器の共通技 + 投げ + 必殺技 + 個別の上書き）
   ===================================================================== */
const SPECIAL_KEYS = { n: 'nspecial', side: 'sspecial', up: 'uspecial', down: 'dspecial',
  airN: 'nspecialAir', airF: 'fspecialAir', airB: 'bspecialAir', airU: 'uspecialAir', airD: 'dspecialAir' };
function scaleMove(m, sp, dm) {
  const S = v => Math.max(0, Math.round(v / sp));
  const SR = r => [S(r[0]), Math.max(S(r[0]), S(r[1]))];
  m.dur = S(m.dur);
  if (m.poses) m.poses.forEach(k => { k[0] = S(k[0]); });
  if (m.hits) m.hits.forEach(h => { h.f = SR(h.f); if (h.dmg) h.dmg *= dm; });
  if (m.events) m.events.forEach(e => { e.f = Array.isArray(e.f) ? SR(e.f) : S(e.f); });
  if (m.charge) m.charge.f = S(m.charge.f);
  if (m.loop) { m.loop.from = S(m.loop.from); m.loop.to = S(m.loop.to); }
  if (m.reflect) m.reflect.f = SR(m.reflect.f);
  if (m.counter) m.counter.f = SR(m.counter.f);
  if (m.gravityFrames) m.gravityFrames = SR(m.gravityFrames);
  if (m.release !== undefined) m.release = S(m.release);
  if (m.held) m.held.forEach(k => { k[0] = S(k[0]); });
  if (m.hit) m.hit.dmg *= dm;
  return m;
}
function buildMoves(c) {
  const moves = {};
  const W = D.weapons[c.weapon];
  for (const k in W) moves[k] = clone(W[k]);
  for (const k in D.throws) moves[k] = clone(D.throws[k]);
  for (const k in c.specials) moves[SPECIAL_KEYS[k]] = clone(c.specials[k]);
  for (const k in (c.overrides || {})) {
    const key = SPECIAL_KEYS[k] || k;
    if (moves[key]) moves[key] = deepMerge(moves[key], c.overrides[k]);
  }
  for (const k in moves) { moves[k].key = k; scaleMove(moves[k], c.stats.speed || 1, c.stats.dmgMul || 1); }
  moves.__counterHit = { key: '__counterHit', name: 'カウンター攻撃', dur: 28, poses: [[0, 'counterHit'], [14, 'counterHit'], [28, 'idle']] };
  return moves;
}

/* =====================================================================
   入力（タッチ・キーボード・CPUが共通で使う「コントローラー」）
   ===================================================================== */
class Pad {
  constructor() {
    this.mx = 0; this.my = 0;
    this.held = { A: false, B: false, jump: false, shield: false, grab: false, C: false };
    this.buf = { A: 0, B: 0, jump: 0, grab: 0, C: 0 };
    this.cdir = { x: 0, y: 0 };
  }
  press(k) { this.buf[k] = BUFFER; }
  take(k) { if (this.buf[k] > 0) { this.buf[k] = 0; return true; } return false; }
  tick() { for (const k in this.buf) if (this.buf[k] > 0) this.buf[k]--; }
  clear() { for (const k in this.buf) this.buf[k] = 0; for (const k in this.held) this.held[k] = false; this.mx = this.my = 0; }
}
function stickDir(x, y) {
  if (Math.hypot(x, y) < 0.35) return 'n';
  if (Math.abs(y) > Math.abs(x)) return y > 0 ? 'up' : 'down';
  return 'side';
}

/* =====================================================================
   ファイター（キャラ1体分の動き）
   座標：x = 横、y = 下がプラス（ステージの上面が y=0）。キャラの位置は足元
   ===================================================================== */
const ACTIONABLE_GROUND = ['idle', 'walk', 'run'];
class Fighter {
  constructor(c, slot, battle) {
    this.c = c; this.s = c.stats; this.slot = slot; this.b = battle;
    this.moves = buildMoves(c);
    this.look = c.look || { thick: 6, head: 10 };
    this.color = slot === 0 ? '#ff5d5d' : '#4fa8ff';
    this.dark = slot === 0 ? '#b8363b' : '#2c6fb3';
    this.label = slot === 0 ? 'あなた' : 'CPU';
    this.stocks = D.rules.stocks;
    this.pad = new Pad();
    this.spawn(slot === 0 ? -220 : 220, 0, slot === 0 ? 1 : -1);
    this.invuln = 0;
  }
  spawn(x, y, facing) {
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.vx = 0; this.vy = 0; this.kbx = 0; this.kby = 0;
    this.facing = facing; this.grounded = y >= 0;
    this.jumps = this.s.airJumps; this.usedOnce = {};
    this.state = this.grounded ? 'idle' : 'air'; this.timer = 0;
    this.move = null; this.mf = 0; this.activeF = -1;
    this.hitRec = new Map();
    this.percent = 0; this.hitlag = 0; this.shieldHP = PH.shieldMax;
    this.grabbed = null; this.grabbedBy = null;
    this.anim = 0; this.walkPhase = 0; this.flipT = 99;
    this.chargeMul = 1; this.charging = false;
    this.poseOut = copyPose(POSES.idle); this.prevPoseOut = this.poseOut;
    this.blendFrom = null; this.blendT = 0; this.blendN = 1; this.poseSrc = '';
    this.hand = [x, y - 70]; this.tip = [x, y - 40]; this.prevTip = this.tip;
    this.shakeT = 0;
  }
  get alive() { return this.state !== 'dead'; }
  hittable() { return this.alive && this.invuln <= 0 && this.state !== 'grabbed'; }
  /* ---------- 1コマ分の更新 ---------- */
  update() {
    const pad = this.pad;
    this.px = this.x; this.py = this.y; this.prevPoseOut = this.poseOut; this.prevTip = this.tip;
    if (this.state === 'dead') {
      if (--this.timer <= 0 && this.stocks > 0) this.respawn();
      return;
    }
    if (this.hitlag > 0) { this.hitlag--; if (this.shakeT > 0) this.shakeT--; return; }
    this.anim++;
    if (this.invuln > 0) this.invuln--;
    if (this.flipT < 99) this.flipT++;
    if (this.state !== 'shield') this.shieldHP = Math.min(PH.shieldMax, this.shieldHP + PH.shieldRegen);
    this.vxSet = false;
    this.runState(pad);
    if (this.state !== 'grabbed') this.physics();
    this.computePose();
  }
  runState(pad) {
    const s = this.s;
    switch (this.state) {
      case 'idle': case 'walk': case 'run':
        if (!this.groundAct(pad)) this.groundMove(pad);
        break;
      case 'squat':
        this.vx = approach(this.vx, 0, 0.3);
        if (--this.timer <= 0) {
          this.vy = -s.jump; this.grounded = false; this.state = 'air';
          this.vx = clamp(this.vx + pad.mx * 1.2, -s.air * 1.2, s.air * 1.2);
        }
        break;
      case 'land': case 'shieldOff':
        this.vx = approach(this.vx, 0, PH.groundFriction);
        if (--this.timer <= 0) this.state = 'idle';
        break;
      case 'air':
        if (!this.airAct(pad)) this.airDrift(pad, 1);
        break;
      case 'helpless':
        this.airDrift(pad, 0.7);
        break;
      case 'move':
        this.updateMove(pad);
        break;
      case 'shield':
        this.vx = approach(this.vx, 0, PH.groundFriction);
        this.shieldHP -= PH.shieldDrain;
        if (this.shieldHP <= 0) { this.shieldBreak(); break; }
        if (pad.take('jump')) { this.state = 'squat'; this.timer = 3; break; }
        if (pad.take('grab') || pad.take('A')) { this.startMove('grab', pad); break; }
        if (!pad.held.shield) { this.state = 'shieldOff'; this.timer = 7; }
        break;
      case 'shieldstun':
        this.vx = approach(this.vx, 0, PH.groundFriction);
        if (--this.timer <= 0) { this.state = pad.held.shield ? 'shield' : 'shieldOff'; this.timer = 4; }
        break;
      case 'hitstun': case 'tumble':
        if (this.grounded) this.vx = approach(this.vx, 0, PH.groundFriction);
        if (--this.timer <= 0) this.state = this.grounded ? 'idle' : 'air';
        break;
      case 'knockdown':
        this.vx = approach(this.vx, 0, PH.groundFriction);
        if (--this.timer <= 0) { this.state = 'idle'; this.invuln = Math.max(this.invuln, 12); }
        break;
      case 'dizzy':
        if (this.grounded) this.vx = approach(this.vx, 0, PH.groundFriction);
        if (--this.timer <= 0) this.state = this.grounded ? 'idle' : 'air';
        break;
      case 'holding':
        this.vx = 0;
        this.updateHolding(pad);
        break;
      case 'grabbed':
        break;
    }
  }
  /* ---------- 地上で行動できるとき ---------- */
  groundAct(pad) {
    if (pad.take('grab')) return this.startMove('grab', pad);
    if (pad.take('C')) {
      const d = stickDir(pad.cdir.x, pad.cdir.y);
      if (d === 'side') this.facing = sign(pad.cdir.x);
      return this.startMove(d === 'up' ? 'usmash' : d === 'down' ? 'dsmash' : 'fsmash', pad, 'C');
    }
    if (pad.take('A')) {
      const d = stickDir(pad.mx, pad.my);
      if (d === 'side') this.facing = sign(pad.mx);
      return this.startMove({ n: 'jab', up: 'utilt', down: 'dtilt', side: 'ftilt' }[d], pad);
    }
    if (pad.take('B')) {
      const d = stickDir(pad.mx, pad.my);
      if (d === 'side') this.facing = sign(pad.mx);
      return this.startMove({ n: 'nspecial', up: 'uspecial', down: 'dspecial', side: 'sspecial' }[d], pad, 'B');
    }
    if (pad.take('jump')) { this.state = 'squat'; this.timer = 3; return true; }
    if (pad.held.shield) { this.state = 'shield'; return true; }
    return false;
  }
  groundMove(pad) {
    const s = this.s, mx = pad.mx;
    if (Math.abs(mx) > 0.2) {
      this.facing = sign(mx);
      const run = Math.abs(mx) > 0.75;
      const target = (run ? s.run : s.walk * Math.min(1, Math.abs(mx) / 0.75)) * this.facing;
      this.vx = approach(this.vx, target, 1.1);
      this.state = run ? 'run' : 'walk';
    } else {
      this.vx = approach(this.vx, 0, PH.groundFriction);
      this.state = 'idle';
    }
  }
  /* ---------- 空中で行動できるとき ---------- */
  airAct(pad) {
    const aerial = (x, y) => {
      const d = stickDir(x, y);
      if (d === 'side') return x * this.facing > 0 ? 'fair' : 'bair';
      return { n: 'nair', up: 'uair', down: 'dair' }[d];
    };
    if (pad.take('A')) return this.startMove(aerial(pad.mx, pad.my), pad);
    if (pad.take('C')) return this.startMove(aerial(pad.cdir.x, pad.cdir.y), pad);
    if (pad.take('B')) {
      const d = stickDir(pad.mx, pad.my);
      let k = { n: 'nspecialAir', up: 'uspecialAir', down: 'dspecialAir' }[d];
      if (d === 'side') k = pad.mx * this.facing > 0 ? 'fspecialAir' : 'bspecialAir';
      return this.startMove(k, pad, 'B');
    }
    if (pad.take('jump') && this.jumps > 0) {
      this.jumps--; this.vy = -this.s.djump; this.vx = pad.mx * this.s.air; this.flipT = 0;
      this.b.fx.dust(this.x, this.y + 4, 0.6);
      return true;
    }
    return false;
  }
  airDrift(pad, mul) {
    const s = this.s;
    if (Math.abs(pad.mx) > 0.15) this.vx = approach(this.vx, pad.mx * s.air * mul, s.airAccel);
    else this.vx = approach(this.vx, 0, 0.04);
  }
  /* ---------- 技 ---------- */
  startMove(key, pad, btn) {
    const m = this.moves[key];
    if (!m) return false;
    if (m.oncePerAir && !this.grounded) {
      if (this.usedOnce[key]) return false;
      this.usedOnce[key] = true;
    }
    if ((key === 'grab' || key === 'uspecial' || key === 'uspecialAir') && pad && Math.abs(pad.mx) > 0.25) this.facing = sign(pad.mx);
    this.state = 'move'; this.move = m; this.mf = 0; this.activeF = -1;
    this.hitRec = new Map(); this.loops = 0;
    this.chargeT = 0; this.chargeMul = 1; this.charging = false; this.chargeDone = false;
    this.chargeBtn = btn || 'A';
    this.moveAir = !this.grounded;
    return true;
  }
  updateMove(pad) {
    const m = this.move;
    if (this.mf > m.dur) { this.endMove(); return; }
    let f = this.mf;
    // ため
    if (m.charge && f === m.charge.f && !this.chargeDone) {
      const held = this.chargeBtn === 'C' ? pad.held.C : pad.held[this.chargeBtn];
      if (held && this.chargeT < m.charge.max) {
        this.chargeT++; this.charging = true;
        this.chargeMul = 1 + (m.charge.mul - 1) * this.chargeT / m.charge.max;
        this.activeF = -1;
        if (!this.grounded) this.airDrift(pad, 0.5);
        else this.vx = approach(this.vx, 0, PH.groundFriction);
        return;
      }
      this.chargeDone = true; this.charging = false;
    }
    // 押し続けると続く技
    if (m.loop && f === m.loop.to && pad.held.B && this.loops < m.loop.max) {
      this.loops++; f = this.mf = m.loop.from; this.hitRec.clear();
    }
    this.activeF = f;
    if (m.events) for (const ev of m.events) {
      const on = Array.isArray(ev.f) ? f >= ev.f[0] && f <= ev.f[1] : f === ev.f;
      if (on) this.doEvent(ev);
    }
    // 投げ
    if (m.held && this.grabbed) this.placeHeld(m, f);
    if (m.release !== undefined && f === m.release && this.grabbed) {
      const t = this.grabbed;
      this.grabbed = null; t.grabbedBy = null;
      const h = m.hit;
      this.b.applyHit(this, t, { dmg: h.dmg, ang: h.ang, bkb: h.bkb, kbg: h.kbg }, this.facing, t.x, t.y - 50, false);
    }
    if (this.grounded) { if (!this.vxSet) this.vx = approach(this.vx, 0, PH.groundFriction); }
    else if (!this.vxSet) this.airDrift(pad, 0.85);
    this.mf++;
  }
  doEvent(ev) {
    if (ev.turn) this.facing *= -1;
    if (ev.vx !== undefined) { this.vx = ev.vx * this.facing; this.vxSet = true; }
    if (ev.vy !== undefined) { this.vy = -ev.vy; if (ev.vy > 0) this.grounded = false; }
    if (ev.proj) this.b.spawnProjectile(this, ev);
  }
  endMove() {
    const m = this.move;
    this.move = null; this.charging = false; this.chargeMul = 1; this.activeF = -1;
    if (this.grabbed) this.releaseGrab();
    if (this.grounded) this.state = 'idle';
    else this.state = m && m.helpless ? 'helpless' : 'air';
  }
  activeHits() {
    if (this.state !== 'move' || !this.move.hits || this.activeF < 0) return [];
    return this.move.hits.filter(h => this.activeF >= h.f[0] && this.activeF <= h.f[1]);
  }
  activeWindow(kind) {
    if (this.state !== 'move' || !this.move[kind] || this.activeF < 0) return null;
    const w = this.move[kind];
    return this.activeF >= w.f[0] && this.activeF <= w.f[1] ? w : null;
  }
  /* ---------- つかみ・投げ ---------- */
  updateHolding(pad) {
    const t = this.grabbed;
    if (!t) { this.state = 'idle'; return; }
    this.timer--;
    this.holdT = (this.holdT || 0) + 1;
    let dir = null;
    if (pad.take('C')) dir = { x: pad.cdir.x, y: pad.cdir.y };
    else if (this.holdT > 6 && Math.hypot(pad.mx, pad.my) > 0.6) dir = { x: pad.mx, y: pad.my };
    if (dir) {
      const d = stickDir(dir.x, dir.y);
      let k = d === 'up' ? 'uthrow' : d === 'down' ? 'dthrow' : dir.x * this.facing > 0 ? 'fthrow' : 'bthrow';
      if (d === 'n') k = 'fthrow';
      const g = this.grabbed;
      this.startMove(k);
      this.grabbed = g;
      return;
    }
    if (this.timer <= 0) this.releaseGrab(true);
  }
  placeHeld(m, f) {
    const t = this.grabbed, k = m.held;
    let a = k[0], b = k[k.length - 1];
    for (let i = 0; i < k.length - 1; i++) if (f >= k[i][0] && f <= k[i + 1][0]) { a = k[i]; b = k[i + 1]; break; }
    const u = b[0] === a[0] ? 1 : clamp((f - a[0]) / (b[0] - a[0]), 0, 1);
    t.x = this.x + lerp(a[1], b[1], ease(u)) * this.facing;
    t.y = this.y - lerp(a[2], b[2], ease(u));
    t.facing = -this.facing;
  }
  releaseGrab(push) {
    const t = this.grabbed;
    this.grabbed = null;
    if (this.state === 'holding') this.state = 'idle';
    if (t && t.grabbedBy === this) {
      t.grabbedBy = null;
      t.state = t.grounded ? 'idle' : 'air';
      if (push) { t.kbx = this.facing * 5; this.kbx = -this.facing * 4; }
    }
  }
  /* ---------- シールド ---------- */
  shieldBreak() {
    this.state = 'dizzy'; this.timer = PH.shieldBreakStun;
    this.vy = -12; this.grounded = false; this.shieldHP = PH.shieldMax * 0.4;
    this.b.fx.ring(this.x, this.y - 45, '#ffe066', 90);
    this.b.shake = Math.max(this.b.shake, 10);
  }
  /* ---------- 物理 ---------- */
  physics() {
    const s = this.s;
    if (!this.grounded) {
      let g = s.gravity;
      if (this.state === 'move') {
        const m = this.move, f = this.activeF < 0 ? (m.charge ? m.charge.f : 0) : this.activeF;
        if (m.gravityFrames && f >= m.gravityFrames[0] && f <= m.gravityFrames[1]) g = 0;
        else if (m.gravityMul !== undefined) g *= m.gravityMul;
      }
      if (this.vy < s.fall) this.vy = Math.min(this.vy + g, s.fall);
    }
    const sp = Math.hypot(this.kbx, this.kby);
    if (sp > 0) {
      const ns = Math.max(0, sp - PH.kbDecay);
      this.kbx *= ns / sp; this.kby *= ns / sp;
    }
    this.x += this.vx + this.kbx;
    this.y += this.vy + this.kby;
    this.collide();
  }
  collide() {
    const L = -ST.halfWidth, R = ST.halfWidth, T = 0, Bt = ST.thickness, hw = 12, hh = 80;
    if (this.grounded) {
      if (this.x < L || this.x > R) {
        this.grounded = false;
        if (['idle', 'walk', 'run', 'land', 'shield', 'shieldOff', 'shieldstun', 'squat', 'knockdown'].includes(this.state)) this.state = 'air';
        if (this.state === 'holding') { this.releaseGrab(); this.state = 'air'; }
      } else if (this.kby < -0.5 || this.vy < 0) {
        this.grounded = false;
      } else { this.y = T; this.vy = 0; this.kby = 0; }
      return;
    }
    const overlapX = this.x + hw > L && this.x - hw < R;
    if (!(overlapX && this.y > T && this.y - hh < Bt)) return;
    const down = this.vy + this.kby >= 0;
    if (down && this.py <= T + 1 && this.x >= L && this.x <= R) { this.land(); return; }
    if (this.py - hh >= Bt - 2) { // 下からぶつかった
      this.y = Bt + hh; if (this.vy < 0) this.vy = 0; if (this.kby < 0) this.kby = -this.kby * 0.4;
      return;
    }
    // 横からぶつかった：上面に近ければよじ登る（段差の救済）
    const stun = this.state === 'hitstun' || this.state === 'tumble';
    if (!stun && this.y - T < 30 && down) {
      this.x = clamp(this.x, L, R); this.land(); return;
    }
    if (this.px <= L || this.x < 0) {
      this.x = L - hw; if (this.kbx > 0) this.kbx = -this.kbx * 0.5; if (this.vx > 0) this.vx = 0;
    } else {
      this.x = R + hw; if (this.kbx < 0) this.kbx = -this.kbx * 0.5; if (this.vx < 0) this.vx = 0;
    }
  }
  land() {
    const speedDown = this.vy + this.kby;
    this.y = 0;
    if ((this.state === 'tumble' || this.state === 'hitstun') && this.timer > 0 && this.kby > 4) {
      // 地面でバウンド
      this.kby = -this.kby * 0.55; this.vy = 0;
      this.b.fx.dust(this.x, 0, 1.2);
      return;
    }
    this.grounded = true; this.jumps = this.s.airJumps; this.usedOnce = {};
    this.vy = 0; this.kby = 0;
    switch (this.state) {
      case 'air': this.state = 'land'; this.timer = 4; break;
      case 'helpless': this.state = 'land'; this.timer = this.helplessLag || 20; break;
      case 'move':
        if (this.moveAir) {
          const m = this.move;
          if (m.landSpawn) for (const ev of m.landSpawn) this.b.spawnProjectile(this, ev);
          this.move = null; this.charging = false; this.chargeMul = 1; this.activeF = -1;
          this.state = 'land'; this.timer = m.landLag !== undefined ? m.landLag : 6;
          if (m.helpless) this.timer = m.landLag || 20;
        }
        break;
      case 'tumble': this.state = 'knockdown'; this.timer = 26; this.b.fx.dust(this.x, 0, 1.4); break;
      case 'hitstun': break;
      default: break;
    }
    if (speedDown > 6) this.b.fx.dust(this.x, 0, 0.8);
  }
  respawn() {
    this.spawn(this.slot === 0 ? -150 : 150, -380, this.slot === 0 ? 1 : -1);
    this.invuln = D.rules.respawnInvincible;
  }
  /* ---------- ポーズ計算（なめらかにつなぐ） ---------- */
  computePose() {
    let src = this.state, target;
    const P0 = POSES;
    switch (this.state) {
      case 'move': {
        src = 'move:' + this.move.key + ':' + this.loops;
        target = this.movePose(this.move, this.activeF < 0 ? (this.move.charge ? this.move.charge.f : 0) : this.activeF);
        break;
      }
      case 'idle': target = lerpPose(P0.idle, P0.idle2, (Math.sin(this.anim * 0.07) + 1) / 2); break;
      case 'walk': this.walkPhase += Math.abs(this.vx) * 0.075;
        target = lerpPose(P0.walk1, P0.walk2, (Math.sin(this.walkPhase) + 1) / 2); src = 'loco'; break;
      case 'run': this.walkPhase += Math.abs(this.vx) * 0.05;
        target = lerpPose(P0.run1, P0.run2, (Math.sin(this.walkPhase) + 1) / 2); src = 'loco'; break;
      case 'squat': case 'land': case 'shieldOff': target = P0.crouch; break;
      case 'air': {
        const t = clamp((this.vy + 8) / 16, 0, 1);
        target = copyPose(lerpPose(P0.jump, P0.fall, t));
        if (this.flipT < 22) target.r = 360 * ease(this.flipT / 22);
        break;
      }
      case 'helpless': target = copyPose(P0.helpless); target.t = Math.sin(this.anim * 0.15) * 8; break;
      case 'shield': case 'shieldstun': target = P0.shield; src = 'shield'; break;
      case 'hitstun': target = P0.hurt; break;
      case 'tumble': target = copyPose(P0.tumble); target.r = -this.anim * 22; break;
      case 'knockdown': target = P0.down; break;
      case 'dizzy': target = copyPose(P0.hurt); target.t = Math.sin(this.anim * 0.1) * 15; break;
      case 'holding': target = P0.hold; break;
      case 'grabbed': target = P0.grabbed; break;
      default: target = P0.idle;
    }
    if (src !== this.poseSrc) {
      this.poseSrc = src;
      this.blendFrom = copyPose(this.poseOut);
      this.blendFrom.r = ((this.blendFrom.r % 360) + 540) % 360 - 180;
      if (Math.abs(this.blendFrom.r) < 1) this.blendFrom.r = 0;
      this.blendT = 0;
      this.blendN = this.state === 'move' ? 2 : this.state === 'hitstun' || this.state === 'tumble' ? 1 : 5;
    }
    if (this.blendT < this.blendN) {
      this.blendT++;
      this.poseOut = lerpPose(this.blendFrom, target, ease(this.blendT / this.blendN));
    } else this.poseOut = copyPose(target);
    // 手の位置（武器の描画用）
    const pts = solvePose(this.poseOut, this.look, this.grounded, false);
    this.hand = [this.x + pts.fH[0] * this.facing, this.y - pts.fH[1]];
    this.updateWhipTip();
  }
  movePose(m, f) {
    const k = m.poses;
    const get = e => (e[2] ? Object.assign(copyPose(POSES[e[1]]), e[2]) : POSES[e[1]]);
    if (!k || !k.length) return POSES.idle;
    if (f <= k[0][0]) return get(k[0]);
    for (let i = 0; i < k.length - 1; i++) {
      if (f >= k[i][0] && f < k[i + 1][0]) {
        const u = (f - k[i][0]) / (k[i + 1][0] - k[i][0]);
        return lerpPose(get(k[i]), get(k[i + 1]), ease(u));
      }
    }
    return get(k[k.length - 1]);
  }
  updateWhipTip() {
    if (this.c.weapon !== 'whip') return;
    let target = [this.hand[0] - this.facing * 10, this.hand[1] + 30];
    const hs = this.activeHits();
    if (hs.length) {
      let best = hs[0];
      for (const h of hs) if (Math.abs(h.x) + Math.abs(h.y) > Math.abs(best.x) + Math.abs(best.y)) best = h;
      if (best.r < 50) target = [this.x + best.x * this.facing, this.y - best.y];
    }
    this.tip = [lerp(this.tip[0], target[0], 0.7), lerp(this.tip[1], target[1], 0.7)];
  }
}

/* =====================================================================
   飛び道具
   ===================================================================== */
class Projectile {
  constructor(o) { Object.assign(this, o); this.hitRec = new Set(); this.age = 0; this.dead = false; this.px = this.x; this.py = this.y; }
  update(b) {
    this.px = this.x; this.py = this.y; this.age++;
    if (--this.life <= 0) { this.dead = true; return; }
    if (this.type === 'arrow') {
      this.vy += this.grav || 0;
      this.x += this.vx; this.y += this.vy;
      if (this.y >= 0 && this.y < ST.thickness && Math.abs(this.x) <= ST.halfWidth) { this.dead = true; b.fx.dust(this.x, 0, 0.4); }
    } else if (this.type === 'disc') {
      if (!this.back) {
        const sp = Math.hypot(this.vx, this.vy), ns = sp - this.decel;
        if (ns <= 0) { this.back = true; this.hitRec.clear(); this.vx = this.vy = 0; }
        else { this.vx *= ns / sp; this.vy *= ns / sp; }
      } else {
        const o = this.owner, tx = o.x, ty = o.y - 55;
        const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (d < 30 || !o.alive) { this.dead = true; return; }
        const sp = Math.min(15, Math.hypot(this.vx, this.vy) + 0.6);
        this.vx = dx / d * sp; this.vy = dy / d * sp;
      }
      this.x += this.vx; this.y += this.vy;
    } else if (this.type === 'shock') {
      this.x += this.vx;
      if (Math.abs(this.x) > ST.halfWidth) this.dead = true;
    }
  }
}

/* =====================================================================
   エフェクト（火花・砂ぼこり・撃墜など）
   ===================================================================== */
class FX {
  constructor() { this.list = []; }
  add(o) { o.t = 0; this.list.push(o); }
  spark(x, y, power, color) { this.add({ k: 'spark', x, y, life: 12 + Math.min(10, power / 15), size: 18 + Math.min(60, power * 0.35), color, rot: rnd() * 6 }); }
  dust(x, y, s) { for (let i = 0; i < 4; i++) this.add({ k: 'dust', x: x + (rnd() - 0.5) * 30 * s, y: y - 4, vx: (rnd() - 0.5) * 3 * s, vy: -rnd() * 1.5, life: 22, size: 6 + rnd() * 6 * s }); }
  ring(x, y, color, size) { this.add({ k: 'ring', x, y, color, life: 18, size }); }
  smoke(x, y) { this.add({ k: 'smoke', x, y, life: 26, size: 7 + rnd() * 5 }); }
  ko(x, y, color) { this.add({ k: 'ko', x, y, color, life: 50 }); }
  update() {
    for (const e of this.list) {
      e.t++;
      if (e.vx) { e.x += e.vx; e.y += e.vy; e.vx *= 0.92; e.vy *= 0.92; }
    }
    this.list = this.list.filter(e => e.t < e.life);
  }
}

/* =====================================================================
   吹っ飛びの計算（スマブラ式に近い計算方法）
   ===================================================================== */
function calcKB(p, d, w, bkb, kbg) {
  return ((p / 10 + (p * d) / 20) * (200 / (w + 100)) * 1.4 + 18) * (kbg / 100) + bkb;
}
function capsuleHit(f, x, y, r) {
  let ax = f.x, ay = f.y - 10, bx = f.x, by = f.y - 82, rr = 15;
  if (f.state === 'knockdown') { ax = f.x - 36; ay = f.y - 8; bx = f.x + 36; by = f.y - 8; rr = 10; }
  const vx = bx - ax, vy = by - ay;
  const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  const dx = x - (ax + vx * t), dy = y - (ay + vy * t);
  return dx * dx + dy * dy <= (r + rr) * (r + rr);
}

/* =====================================================================
   CPU
   ===================================================================== */
class CpuBrain {
  constructor(me, battle) {
    this.me = me; this.b = battle; this.pad = me.pad; this.cfg = D.cpu;
    this.style = (me.c.cpu && me.c.cpu.style) || 'mid';
    this.range = (me.c.cpu && me.c.cpu.range) || 80;
    this.wait = 30; this.plan = null;
  }
  step() {
    const me = this.me, p = this.pad, op = this.b.other(me);
    p.held.A = p.held.B = p.held.C = p.held.jump = p.held.grab = false;
    if (!me.alive || this.b.over) { p.mx = p.my = 0; p.held.shield = false; return; }
    if (this.plan) {
      const pl = this.plan;
      if (pl.type === 'shield') p.held.shield = true;
      if (pl.type === 'holdB') p.held.B = true;
      if (pl.type === 'holdC') p.held.C = true;
      if (--pl.t <= 0) { this.plan = null; p.held.shield = false; }
      return;
    }
    p.held.shield = false;
    if (this.recover()) return;
    if (this.wait > 0) { this.wait--; return; }
    this.wait = this.cfg.reaction + ((rnd() * 5) | 0);
    this.decide(op);
  }
  recover() {
    const me = this.me, p = this.pad, L = -ST.halfWidth, R = ST.halfWidth;
    const off = !me.grounded && (me.x < L - 4 || me.x > R + 4 || me.y > 2);
    if (!off) return false;
    let toward = me.x < 0 ? 1 : -1;
    if (Math.abs(me.x) < R + 14 && me.y > 5) toward = -toward; // ステージの真下なら外側へ
    if (['hitstun', 'tumble', 'dizzy', 'grabbed'].includes(me.state)) { p.mx = toward; p.my = 0; return true; }
    p.mx = toward; p.my = 0;
    if (me.state !== 'air') return true;
    const distEdge = Math.max(0, me.x < 0 ? L - me.x : me.x - R);
    const sk = 'fspecialAir', sm = me.moves[sk];
    const canSide = sm && sm.oncePerAir && !me.usedOnce[sk] && me.facing === toward && sm.events && sm.events.some(e => e.vx > 5);
    if (me.jumps > 0) {
      if (me.y > -40 || (me.vy > 2 && distEdge > 200 && me.y > -220)) { p.press('jump'); return true; }
      if (canSide && distEdge > 280 && me.vy > 0) { p.press('B'); return true; }
      return true;
    }
    if (canSide && distEdge > 190 && me.y < 80) { p.press('B'); return true; }
    if (me.vy > -2 && me.y > -60 - Math.min(distEdge, 300) * 0.45) {
      p.my = 1; p.mx = toward * 0.5; p.press('B');
    }
    return true;
  }
  face(dir) { if (this.me.facing !== dir) { this.pad.mx = dir * 0.5; this.wait = 1; return false; } return true; }
  decide(op) {
    const me = this.me, p = this.pad, cfg = this.cfg;
    p.mx = 0; p.my = 0;
    if (!op.alive) return;
    const dx = op.x - me.x, adx = Math.abs(dx), dy = op.y - me.y, dir = sign(dx);
    if (me.state === 'holding') {
      const toEdge = sign(me.x) === me.facing ? 1 : -1;
      const r = rnd();
      if (op.percent > 100 && r < 0.4) p.my = 1;
      else if (r < 0.2) p.my = -1;
      else p.mx = me.facing * toEdge;
      this.wait = 2;
      return;
    }
    if (rnd() < cfg.mistake) return;
    const opOff = op.x < -ST.halfWidth || op.x > ST.halfWidth;
    const nearEdge = Math.abs(me.x) > ST.halfWidth - 70;
    const opAttacking = op.state === 'move' && op.move.hits && op.activeF < (op.move.hits[0].f[0] + 2);
    // 守り
    if (me.grounded && opAttacking && adx < 150 && Math.abs(dy) < 100) {
      if (this.style === 'counter' && rnd() < 0.45) { p.my = -1; p.press('B'); return; }
      if (rnd() < cfg.shieldChance) { this.plan = { type: 'shield', t: 12 + ((rnd() * 14) | 0) }; return; }
    }
    // 飛び道具を跳ね返す
    if (this.style === 'counter') {
      for (const pr of this.b.projectiles) {
        if (pr.owner !== me && pr.type !== 'shock' && Math.abs(pr.x - me.x) < 180 && Math.abs(pr.y - (me.y - 50)) < 80 && sign(pr.vx) === -sign(pr.x - me.x)) {
          if (this.face(sign(pr.x - me.x))) { p.press('B'); }
          return;
        }
      }
    }
    if (me.grounded && op.state === 'shield' && adx < 70) { if (this.face(dir)) p.press('grab'); return; }
    // 相手が場外：崖のそばで待つ
    if (opOff) {
      if (nearEdge && sign(me.x) === sign(op.x)) { if (adx < 120 && Math.abs(dy) < 110) { p.mx = dir; p.press('A'); } return; }
      p.mx = sign(op.x) * 0.6; return;
    }
    // 遠距離タイプ
    if (this.style === 'zone') {
      if (adx < 120 && me.grounded) {
        if (rnd() < 0.5) { if (this.face(dir)) { p.my = -1; p.press('B'); } return; }
        const r = rnd();
        if (r < 0.4) { p.mx = dir; p.press('A'); } else if (r < 0.7) { p.press('grab'); p.mx = dir * 0.5; } else { p.mx = -dir; }
        return;
      }
      if (Math.abs(dy) < 130 && adx < 750) {
        if (!this.face(dir)) return;
        if (!me.grounded) { p.press('B'); return; }
        if (rnd() < 0.55) { p.press('B'); this.plan = { type: 'holdB', t: 6 + ((rnd() * 40) | 0) }; }
        else { p.mx = dir; p.press('B'); }
        return;
      }
      p.mx = dir * 0.8;
      if (dy < -120 && me.grounded) p.press('jump');
      return;
    }
    // 近距離・中距離タイプ
    if (adx > this.range + 25 || Math.abs(dy) > 150) {
      p.mx = dir;
      if (nearEdge && sign(me.x) === dir && Math.abs(op.x) > ST.halfWidth - 40) p.mx = 0;
      if (dy < -90 && me.grounded && rnd() < 0.45) p.press('jump');
      if (!me.grounded && dy < -60 && me.jumps > 0 && rnd() < 0.3) p.press('jump');
      if (me.grounded && Math.abs(dy) < 60) {
        if (this.style === 'mid' && adx < 260 && adx > 120 && rnd() < 0.3) { p.mx = dir; p.press('B'); }
        if (this.style === 'rush' && adx > 200 && adx < 420 && rnd() < 0.12) { p.mx = dir; p.press('B'); }
      }
      return;
    }
    if (!me.grounded) {
      if (dy < -40) p.my = 1; else if (dy > 50) p.my = -1; else p.mx = dir;
      p.press('A');
      return;
    }
    if (dy < -70) {
      if (rnd() < 0.5) { p.my = 1; p.press('A'); } else { p.cdir = { x: 0, y: 1 }; p.press('C'); }
      return;
    }
    const r = rnd();
    if (op.percent > 85 && r < 0.35 * cfg.aggression + 0.1) {
      p.cdir = { x: dir, y: 0 }; p.press('C');
      this.plan = { type: 'holdC', t: (rnd() * 20) | 0 };
      return;
    }
    if (r < 0.2) { if (this.face(dir)) p.press('grab'); }
    else if (r < 0.48) { p.mx = dir; p.press('A'); }
    else if (r < 0.62) { if (this.face(dir)) p.press('A'); }
    else if (r < 0.74) { if (this.face(dir)) { p.my = -1; p.press('A'); } }
    else if (r < 0.86) { p.mx = dir; p.press('B'); }
    else if (r < 0.93) { p.cdir = { x: dir, y: 0 }; p.press('C'); }
    else { p.cdir = { x: 0, y: -1 }; p.press('C'); }
  }
}

/* =====================================================================
   対戦（1試合分の管理）
   ===================================================================== */
class Battle {
  constructor(p1Def, cpuDef) {
    this.fx = new FX();
    this.f = [new Fighter(p1Def, 0, this), new Fighter(cpuDef, 1, this)];
    this.cpu = new CpuBrain(this.f[1], this);
    this.projectiles = [];
    this.frame = 0; this.shake = 0; this.flash = 0;
    this.over = false; this.overT = 0; this.winner = null;
    this.cam = { x: 0, y: -150, z: 1 }; this.prevCam = { ...this.cam };
    this.camInit = false;
  }
  other(f) { return this.f[0] === f ? this.f[1] : this.f[0]; }
  step() {
    this.frame++;
    this.prevCam = { ...this.cam };
    this.cpu.step();
    for (const f of this.f) f.update();
    for (const f of this.f) {
      if (f.state === 'holding' && f.grabbed && f.hitlag <= 0) {
        const t = f.grabbed;
        t.x = f.x + f.facing * 36; t.y = f.y; t.grounded = f.grounded; t.facing = -f.facing;
      }
    }
    for (const p of this.projectiles) p.update(this);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.pushApart();
    this.resolveHits();
    this.checkKO();
    this.updateCamera();
    this.fx.update();
    for (const f of this.f) {
      if (f.state === 'tumble' && Math.hypot(f.kbx, f.kby) > 9 && this.frame % 2 === 0) this.fx.smoke(f.x, f.y - 45);
    }
    if (this.shake > 0) this.shake *= 0.86;
    if (this.shake < 0.3) this.shake = 0;
    if (this.flash > 0) this.flash--;
    for (const f of this.f) f.pad.tick();
    if (this.over) this.overT++;
  }
  pushApart() {
    const [a, b] = this.f;
    if (!a.alive || !b.alive || !a.grounded || !b.grounded || a.grabbed || b.grabbed || a.grabbedBy || b.grabbedBy) return;
    const dx = b.x - a.x;
    if (Math.abs(dx) < 26) {
      const s = dx === 0 ? 1 : sign(dx);
      a.x -= s * 1; b.x += s * 1;
    }
  }
  spawnProjectile(owner, ev) {
    const base = owner.c.projectiles && owner.c.projectiles[ev.proj];
    if (!base) return;
    if (base.max && this.projectiles.filter(p => p.owner === owner && p.type === base.type).length >= base.max) return;
    const cm = owner.chargeMul || 1;
    const dmg = (ev.dmg !== undefined ? ev.dmg : base.dmg) * (owner.s.dmgMul || 1) * cm;
    const speed = (ev.speed !== undefined ? ev.speed : base.speed) * (1 + (cm - 1) * 0.35);
    const o = { owner, type: base.type, r: base.r, dmg, life: base.life,
      kang: ev.kang !== undefined ? ev.kang : base.ang, bkb: ev.bkb !== undefined ? ev.bkb : base.bkb,
      kbg: ev.kbg !== undefined ? ev.kbg : base.kbg, grav: base.grav || 0, decel: base.decel || 0 };
    if (base.type === 'shock') {
      if (!owner.grounded && owner.y < -2) return;
      const d = (ev.dir || 1) * owner.facing;
      Object.assign(o, { x: owner.x + d * 30, y: 0, vx: d * speed, vy: 0 });
    } else {
      const a = (ev.ang || 0) * DEG;
      Object.assign(o, { x: owner.x + (ev.x || 0) * owner.facing, y: owner.y - (ev.y || 0),
        vx: Math.cos(a) * speed * owner.facing, vy: -Math.sin(a) * speed });
    }
    this.projectiles.push(new Projectile(o));
  }
  /* ---------- 当たり判定 ---------- */
  resolveHits() {
    const hits = [];
    for (const a of this.f) {
      if (a.hitlag > 0 || a.state !== 'move') continue;
      const hs = a.activeHits();
      if (!hs.length) continue;
      const d = this.other(a);
      if (!d.hittable() || d === a.grabbed) continue;
      for (const hb of hs) {
        const last = a.hitRec.get(d);
        if (last !== undefined && !(hb.rehit && a.activeF - last >= hb.rehit)) continue;
        if (hb.grab && !d.grounded) continue;
        const wx = a.x + hb.x * a.facing, wy = a.y - hb.y;
        if (capsuleHit(d, wx, wy, hb.r)) { hits.push({ a, d, hb, wx, wy }); break; }
      }
    }
    // 飛び道具
    for (const p of this.projectiles) {
      if (p.dead) continue;
      for (const d of this.f) {
        if (d === p.owner || !d.alive) continue;
        // 跳ね返し
        const rw = d.activeWindow('reflect');
        if (rw && p.type !== 'shock') {
          const rx = d.x + rw.x * d.facing, ry = d.y - rw.y;
          if (Math.hypot(p.x - rx, p.y - ry) < rw.r + p.r) {
            p.owner = d; p.dmg *= rw.mul; p.hitRec.clear();
            if (p.type === 'disc') { p.back = false; p.vx = d.facing * 13 * 1.2; p.vy = 0; p.life = Math.max(p.life, 80); }
            else { p.vx = -p.vx * 1.15; p.vy = -p.vy * 0.6; if (sign(p.vx) !== d.facing) p.vx = -p.vx; p.life = 75; }
            this.fx.ring(p.x, p.y, '#bfe9ff', 40);
            continue;
          }
        }
        if (!d.hittable() || p.hitRec.has(d)) continue;
        if (capsuleHit(d, p.x, p.y, p.r)) {
          p.hitRec.add(d);
          hits.push({ a: p.owner, d, hb: { dmg: p.dmg, ang: p.kang, bkb: p.bkb, kbg: p.kbg }, wx: p.x, wy: p.y, proj: p });
          if (p.type === 'arrow') p.dead = true;
        }
      }
    }
    for (const h of hits) {
      if (h.proj) { this.applyHit(h.a, h.d, h.hb, sign(h.proj.vx || 1), h.wx, h.wy, true, h.proj); continue; }
      if (!h.a.alive || !h.d.alive) continue;
      h.a.hitRec.set(h.d, h.a.activeF);
      if (h.hb.grab && h.a.state !== 'move') continue;
      if (h.hb.grab) { this.startGrab(h.a, h.d); continue; }
      this.applyHit(h.a, h.d, h.hb, h.a.facing, h.wx, h.wy, false);
    }
  }
  startGrab(a, d) {
    if (d.state === 'shield' || d.state === 'shieldstun') { /* つかみはシールドを無視 */ }
    if (d.move && d.grabbed) d.releaseGrab();
    a.state = 'holding'; a.move = null; a.activeF = -1; a.holdT = 0;
    a.timer = PH.grabHoldBase + d.percent * 0.5;
    a.grabbed = d; d.grabbedBy = a;
    d.state = 'grabbed'; d.move = null; d.vx = d.vy = d.kbx = d.kby = 0; d.charging = false;
    d.x = a.x + a.facing * 36; d.y = a.y; d.facing = -a.facing;
    a.hitlag = d.hitlag = 4;
  }
  applyHit(a, d, hb, dir, wx, wy, isProj, proj) {
    // カウンター
    const cw = d.activeWindow('counter');
    if (cw && !hb.grab) {
      const dmg = Math.max(cw.min, hb.dmg * (isProj ? 1 : a.chargeMul || 1) * cw.mul);
      d.startMove('__counterHit');
      d.invuln = 24;
      this.fx.ring(d.x, d.y - 50, '#ffffff', 80);
      this.flash = 4;
      if (proj) proj.dead = true;
      if (!isProj && Math.abs(a.x - d.x) < 170 && Math.abs(a.y - d.y) < 150) {
        d.facing = sign(a.x - d.x);
        this.applyHit(d, a, { dmg, ang: cw.ang, bkb: cw.bkb, kbg: cw.kbg }, d.facing, a.x, a.y - 50, false);
        d.hitlag = Math.max(d.hitlag, 14); a.hitlag = Math.max(a.hitlag, 14);
      }
      return;
    }
    const cm = isProj ? 1 : a.chargeMul || 1;
    const dmg = hb.dmg * cm;
    // シールド
    if (d.state === 'shield' || d.state === 'shieldstun') {
      d.shieldHP -= dmg;
      const hl = Math.floor(dmg * 0.25 + 2);
      if (!isProj) a.hitlag = hl;
      d.hitlag = hl;
      if (d.shieldHP <= 0) { d.shieldBreak(); return; }
      d.state = 'shieldstun'; d.timer = Math.floor(dmg * 0.6) + 2;
      d.kbx = dir * Math.min(8, 1.5 + dmg * 0.25);
      this.fx.ring(wx, wy, 'rgba(255,255,255,0.8)', 26);
      if (proj) proj.dead = true;
      return;
    }
    // ムチ引き寄せ
    if (hb.pull) {
      d.percent = Math.min(999, d.percent + dmg);
      if (d.grabbed) d.releaseGrab();
      d.move = null; d.charging = false; d.chargeMul = 1; d.activeF = -1;
      const dist = Math.max(0, Math.abs(d.x - a.x) - 45);
      const v = Math.sqrt(2 * PH.kbDecay * dist);
      d.kbx = -sign(d.x - a.x) * v; d.kby = d.grounded ? 0 : -2; d.vx = d.vy = 0;
      d.state = 'hitstun'; d.timer = 26;
      d.hitlag = a.hitlag = 5;
      this.fx.spark(wx, wy, 20, '#ffe9a8');
      return;
    }
    d.percent = Math.min(999, d.percent + dmg);
    let kb = calcKB(d.percent, dmg, d.s.weight, hb.bkb, hb.kbg) * (a.s.kbMul || 1);
    let ang = hb.ang;
    if (ang === 361) ang = d.grounded && kb < 60 ? 0 : 40;
    ang = ((ang % 360) + 360) % 360;
    if (d.grounded && ang > 180 && ang < 360) { ang = 360 - ang; kb *= 0.8; } // 地上でメテオ → バウンド
    if (d.grabbed) d.releaseGrab();
    if (d.grabbedBy) { const g = d.grabbedBy; g.grabbed = null; d.grabbedBy = null; if (g.state === 'holding') g.state = 'idle'; }
    const speed = kb * PH.launchScale;
    d.kbx = Math.cos(ang * DEG) * speed * dir;
    d.kby = -Math.sin(ang * DEG) * speed;
    d.vx = 0; d.vy = 0;
    if (d.grounded && d.kby >= 0) d.kby = 0;
    if (d.kby < 0) d.grounded = false;
    d.move = null; d.charging = false; d.chargeMul = 1; d.activeF = -1;
    d.usedOnce = {};
    d.timer = Math.floor(kb * PH.hitstunMul);
    d.state = kb > PH.tumbleKb ? 'tumble' : 'hitstun';
    if (d.state === 'hitstun' && d.timer < 6) d.timer = 6;
    const hl = Math.min(22, Math.floor(dmg * PH.hitlagMul + PH.hitlagBase) + (kb > 150 ? 4 : 0));
    d.hitlag = hl; d.shakeT = hl;
    if (!isProj) a.hitlag = hl;
    this.fx.spark(wx, wy, kb, kb > 150 ? '#ffd34d' : '#ffffff');
    if (kb > 110) this.shake = Math.max(this.shake, Math.min(14, (kb - 100) * 0.07));
    if (kb > 170) this.flash = Math.max(this.flash, 3);
  }
  checkKO() {
    const z = ST.blast;
    for (const f of this.f) {
      if (!f.alive || f.state === 'grabbed') continue;
      if (f.x < z.left || f.x > z.right || f.y > z.bottom || f.y < z.top) {
        const cx = clamp(f.x, z.left, z.right), cy = clamp(f.y, z.top, z.bottom);
        this.fx.ko(cx, cy, f.color);
        this.shake = 16; this.flash = 6;
        if (f.grabbed) f.releaseGrab();
        f.stocks--; f.state = 'dead'; f.timer = 70; f.move = null; f.kbx = f.kby = f.vx = f.vy = 0;
        if (f.stocks <= 0 && !this.over) { this.over = true; this.winner = this.other(f); }
      }
    }
  }
  updateCamera() {
    const alive = this.f.filter(f => f.alive);
    let minX = -260, maxX = 260, minY = -200, maxY = 30;
    if (alive.length) {
      minX = Math.min(...alive.map(f => f.x)); maxX = Math.max(...alive.map(f => f.x));
      minY = Math.min(...alive.map(f => f.y - 90)); maxY = Math.max(...alive.map(f => f.y));
    }
    let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    cx = lerp(cx, 0, 0.25); cy = lerp(cy, -120, 0.3);
    const vw = view.w || 800, vh = view.h || 400;
    const needW = Math.max(maxX - minX + 480, 1120), needH = Math.max(maxY - minY + 400, 540);
    const z = clamp(Math.min(vw / needW, vh / needH), 0.22, 3);
    if (!this.camInit) { this.cam = { x: cx, y: cy, z }; this.prevCam = { ...this.cam }; this.camInit = true; return; }
    this.cam.x = lerp(this.cam.x, cx, 0.1); this.cam.y = lerp(this.cam.y, cy, 0.1); this.cam.z = lerp(this.cam.z, z, 0.08);
  }
}

/* =====================================================================
   画面とタッチ操作
   ===================================================================== */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { w: 0, h: 0, dpr: 1, inset: { l: 0, r: 0, t: 0, b: 0 } };
const safeEl = document.getElementById('safe');
function readInsets() {
  const cs = getComputedStyle(safeEl);
  view.inset = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
}
function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.w = window.innerWidth; view.h = window.innerHeight;
  canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
  readInsets();
  controls.layout();
}

class TouchControls {
  constructor() {
    this.pad = null; this.btns = {}; this.cs = null;
    this.stick = null; this.cTouch = null; this.btnTouches = new Map();
    this.pauseRect = { x: 0, y: 0, w: 0, h: 0 };
    this.onPause = null;
    const opt = { passive: false };
    canvas.addEventListener('touchstart', e => this.start(e), opt);
    canvas.addEventListener('touchmove', e => this.move(e), opt);
    canvas.addEventListener('touchend', e => this.end(e), opt);
    canvas.addEventListener('touchcancel', e => this.end(e), opt);
    canvas.addEventListener('mousedown', e => {
      const x = e.clientX, y = e.clientY;
      if (this.inPause(x, y) && this.onPause) this.onPause();
    });
  }
  layout() {
    const C = D.controls, W = view.w, H = view.h, ins = view.inset;
    this.btns = {};
    for (const k in C.buttons) {
      const b = C.buttons[k];
      this.btns[k] = { x: W - ins.r - b.right, y: H - ins.b - b.bottom, r: b.r, label: b.label, on: false };
    }
    const c = C.cstick;
    this.cs = { x: W - ins.r - c.right, y: H - ins.b - c.bottom, r: c.r, label: c.label, kx: 0, ky: 0 };
    this.stickHome = { x: ins.l + 30 + C.stickRadius + 14, y: H - ins.b - C.stickRadius - 34 };
    this.pauseRect = { x: ins.l + 10, y: ins.t + 8, w: 46, h: 40 };
  }
  inPause(x, y) { const r = this.pauseRect; return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  start(e) {
    e.preventDefault();
    if (!this.pad) return;
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY;
      if (this.inPause(x, y)) { if (this.onPause) this.onPause(); continue; }
      if (x < view.w * D.controls.stickZoneRatio && !this.stick) {
        this.stick = { id: t.identifier, ox: x, oy: y, x, y };
        this.updateStick();
        continue;
      }
      // いちばん近いボタンを探す（少し外れていても反応するように）
      let best = null, bd = Infinity;
      for (const k in this.btns) {
        const b = this.btns[k], d = Math.hypot(x - b.x, y - b.y);
        if (d < b.r * 1.5 && d / b.r < bd) { bd = d / b.r; best = k; }
      }
      const cd = Math.hypot(x - this.cs.x, y - this.cs.y);
      if (cd < this.cs.r * 1.5 && cd / this.cs.r < bd) best = '__C';
      if (best === '__C') {
        this.cTouch = { id: t.identifier, fired: false };
        this.updateC(x, y);
      } else if (best) {
        this.btnTouches.set(t.identifier, best);
        this.btns[best].on = true;
        this.pad.held[best] = true;
        this.pad.press(best);
      } else if (!this.stick && x < view.w * 0.6) {
        this.stick = { id: t.identifier, ox: x, oy: y, x, y };
        this.updateStick();
      }
    }
  }
  move(e) {
    e.preventDefault();
    if (!this.pad) return;
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) { this.stick.x = t.clientX; this.stick.y = t.clientY; this.updateStick(); }
      else if (this.cTouch && t.identifier === this.cTouch.id) this.updateC(t.clientX, t.clientY);
    }
  }
  end(e) {
    e.preventDefault();
    if (!this.pad) return;
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) { this.stick = null; this.pad.mx = 0; this.pad.my = 0; }
      else if (this.cTouch && t.identifier === this.cTouch.id) { this.cTouch = null; this.cs.kx = this.cs.ky = 0; this.pad.held.C = false; }
      else if (this.btnTouches.has(t.identifier)) {
        const k = this.btnTouches.get(t.identifier);
        this.btnTouches.delete(t.identifier);
        if (![...this.btnTouches.values()].includes(k)) { this.btns[k].on = false; this.pad.held[k] = false; }
      }
    }
  }
  updateStick() {
    const R = D.controls.stickRadius, s = this.stick;
    let dx = s.x - s.ox, dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > R * 1.25) { // 指が大きく動いたら土台がついてくる
      const k = (d - R * 1.25) / d; s.ox += dx * k; s.oy += dy * k; dx = s.x - s.ox; dy = s.y - s.oy;
    }
    const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx);
    this.pad.mx = m > 0.12 ? Math.cos(a) * m : 0;
    this.pad.my = m > 0.12 ? -Math.sin(a) * m : 0;
  }
  updateC(x, y) {
    const c = this.cs, dx = x - c.x, dy = y - c.y, m = Math.min(1, Math.hypot(dx, dy) / c.r);
    const a = Math.atan2(dy, dx);
    c.kx = Math.cos(a) * m; c.ky = Math.sin(a) * m;
    if (m > 0.5 && !this.cTouch.fired) {
      this.cTouch.fired = true;
      this.pad.cdir = { x: c.kx, y: -c.ky };
      this.pad.press('C');
    }
    if (m < 0.3) this.cTouch.fired = false;
    this.pad.held.C = m > 0.4;
  }
  reset() {
    this.stick = null; this.cTouch = null; this.btnTouches.clear();
    for (const k in this.btns) this.btns[k].on = false;
    if (this.cs) this.cs.kx = this.cs.ky = 0;
    if (this.pad) this.pad.clear();
  }
}
const controls = new TouchControls();

// パソコン確認用のキーボード操作（WASD=移動、J=A、K=B、スペース=ジャンプ、L=シールド、H=つかみ、矢印=C）
const keys = new Set();
const KEYMAP = { KeyJ: 'A', KeyK: 'B', Space: 'jump', KeyL: 'shield', KeyH: 'grab' };
const CKEYS = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
window.addEventListener('keydown', e => {
  if (!controls.pad) return;
  if (e.repeat) { if (KEYMAP[e.code] || CKEYS[e.code]) e.preventDefault(); return; }
  keys.add(e.code);
  const p = controls.pad;
  if (KEYMAP[e.code]) { p.held[KEYMAP[e.code]] = true; p.press(KEYMAP[e.code]); e.preventDefault(); }
  if (CKEYS[e.code]) { p.cdir = { x: CKEYS[e.code][0], y: CKEYS[e.code][1] }; p.press('C'); p.held.C = true; e.preventDefault(); }
  if (e.code === 'Escape' && controls.onPause) controls.onPause();
  keyStick();
});
window.addEventListener('keyup', e => {
  keys.delete(e.code);
  if (!controls.pad) return;
  const p = controls.pad;
  if (KEYMAP[e.code]) p.held[KEYMAP[e.code]] = false;
  if (CKEYS[e.code]) p.held.C = false;
  keyStick();
});
function keyStick() {
  const p = controls.pad;
  const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  if (!controls.stick) { p.mx = x; p.my = y; }
}
document.addEventListener('gesturestart', e => e.preventDefault());

/* =====================================================================
   描画
   ===================================================================== */
const STARS = Array.from({ length: 70 }, () => ({ x: rnd() * 2400 - 1200, y: rnd() * 1400 - 1150, s: rnd() * 1.6 + 0.4, a: rnd() * 0.6 + 0.2 }));
function pctColor(p) {
  if (p < 50) return `rgb(255,${255 - p * 0.6},${255 - p * 3})`;
  if (p < 120) { const t = (p - 50) / 70; return `rgb(255,${Math.round(225 - t * 125)},${Math.round(105 - t * 80)})`; }
  const t = Math.min(1, (p - 120) / 100); return `rgb(${Math.round(255 - t * 80)},${Math.round(100 - t * 80)},${Math.round(25 + t * 10)})`;
}
function render(b, alpha) {
  const W = view.w, H = view.h;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  // 背景
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0f26'); g.addColorStop(0.6, '#1b2552'); g.addColorStop(1, '#2d2a5a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (!b) return;
  const cam = { x: lerp(b.prevCam.x, b.cam.x, alpha), y: lerp(b.prevCam.y, b.cam.y, alpha), z: lerp(b.prevCam.z, b.cam.z, alpha) };
  let sx = 0, sy = 0;
  if (b.shake > 0) { sx = (rnd() - 0.5) * b.shake * 2; sy = (rnd() - 0.5) * b.shake * 2; }
  const z = cam.z;
  const X = wx => (wx - cam.x) * z + W / 2 + sx;
  const Y = wy => (wy - cam.y) * z + H / 2 + sy;
  // 星
  for (const s of STARS) {
    ctx.fillStyle = `rgba(255,255,255,${s.a})`;
    ctx.fillRect((s.x - cam.x * 0.15) * 0.5 + W / 2, (s.y - cam.y * 0.15) * 0.5 + H / 2, s.s, s.s);
  }
  // ステージ
  const L = -ST.halfWidth, R = ST.halfWidth, T = 0, Bt = ST.thickness;
  ctx.beginPath();
  ctx.moveTo(X(L), Y(T)); ctx.lineTo(X(R), Y(T)); ctx.lineTo(X(R - 30), Y(Bt)); ctx.lineTo(X(R - 170), Y(Bt + 80)); ctx.lineTo(X(L + 170), Y(Bt + 80)); ctx.lineTo(X(L + 30), Y(Bt));
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, Y(T), 0, Y(Bt + 90));
  sg.addColorStop(0, '#4a4f86'); sg.addColorStop(1, '#14173a');
  ctx.fillStyle = sg; ctx.fill();
  ctx.fillStyle = '#bfc6ff'; ctx.fillRect(X(L), Y(T) - 1, (R - L) * z, Math.max(2, 4 * z));
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(X(L), Y(T) + 4 * z, (R - L) * z, 10 * z);
  // 飛び道具
  for (const p of b.projectiles) drawProjectile(p, alpha, X, Y, z);
  // ファイター
  for (const f of b.f) drawFighter(f, alpha, X, Y, z, b);
  // エフェクト
  drawFX(b.fx, X, Y, z);
  if (DEBUG) drawDebug(b, X, Y, z);
  if (b.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${b.flash * 0.05})`; ctx.fillRect(0, 0, W, H); }
  drawHUD(b);
  drawControls();
}
function drawFighter(f, alpha, X, Y, z, b) {
  if (!f.alive) return;
  if (f.invuln > 0 && f.state !== 'move' && Math.floor(f.invuln / 4) % 2 === 0) ctx.globalAlpha = 0.45;
  let x = lerp(f.px, f.x, alpha), y = lerp(f.py, f.y, alpha);
  if (f.hitlag > 0 && f.shakeT > 0) x += (rnd() - 0.5) * 6;
  if (f.charging) x += (rnd() - 0.5) * 2;
  const pose = lerpPose(f.prevPoseOut, f.poseOut, alpha);
  const pts = solvePose(pose, f.look, f.grounded, f.state === 'knockdown');
  const fc = f.facing;
  const S = q => [X(x + q[0] * fc), Y(y - q[1])];
  const P = {}; for (const k in pts) P[k] = S(pts[k]);
  const th = f.look.thick * z;
  const line = (pts2, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts2[0][0], pts2[0][1]); for (let i = 1; i < pts2.length; i++) ctx.lineTo(pts2[i][0], pts2[i][1]); ctx.stroke(); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let col = f.color, dark = f.dark;
  if (f.charging && Math.floor(f.anim / 3) % 2 === 0) { col = '#ffffff'; dark = '#dddddd'; }
  if (f.state === 'dizzy' && Math.floor(f.anim / 6) % 2 === 0) col = '#ffe066';
  // 足元の影
  if (f.grounded || y > -200) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(X(x), Y(0) + 2, 22 * z * clamp(1 + y / 400, 0.3, 1), 5 * z, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 後ろの手足
  line([P.S, P.bE, P.bH], dark, th * 0.9);
  line([P.H, P.bK, P.bF], dark, th * 0.95);
  // 胴・前の脚
  line([P.H, P.N], col, th * 1.1);
  line([P.H, P.fK, P.fF], col, th);
  // 頭
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(P.head[0], P.head[1], f.look.head * z, 0, Math.PI * 2); ctx.fill();
  const ed = [Math.sin((pose.t - pose.r) * DEG) * 0.4 + 0.55, 0.15];
  ctx.fillStyle = '#10142c';
  ctx.beginPath(); ctx.arc(P.head[0] + ed[0] * f.look.head * z * fc, P.head[1] - ed[1] * f.look.head * z, Math.max(1.2, 2.2 * z), 0, Math.PI * 2); ctx.fill();
  // 前の腕
  line([P.S, P.fE, P.fH], col, th);
  drawWeapon(f, P, z, alpha, X, Y);
  // シールド
  if (f.state === 'shield' || f.state === 'shieldstun') {
    const r = (20 + 34 * (f.shieldHP / PH.shieldMax)) * z;
    ctx.fillStyle = f.slot === 0 ? 'rgba(255,93,93,0.28)' : 'rgba(79,168,255,0.28)';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(x), Y(y - 45), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // 頭の上の目印
  ctx.globalAlpha = 1;
  const hx = P.head[0], hy = Math.min(P.head[1], P.N[1]) - (f.look.head + 14) * z;
  ctx.fillStyle = f.color;
  ctx.beginPath(); ctx.moveTo(hx - 6, hy - 9); ctx.lineTo(hx + 6, hy - 9); ctx.lineTo(hx, hy); ctx.closePath(); ctx.fill();
  if (f.slot === 0) { ctx.font = 'bold 11px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('P1', hx, hy - 13); }
  else { ctx.font = 'bold 11px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CPU', hx, hy - 13); }
}
function drawWeapon(f, P, z, alpha, X, Y) {
  const w = f.c.weapon, h = P.fH, e = P.fE;
  let dx = h[0] - e[0], dy = h[1] - e[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const px = -dy, py = dx;
  if (w === 'unarmed') {
    ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.arc(h[0], h[1], f.look.thick * 0.85 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f.dark;
    ctx.beginPath(); ctx.arc(P.bH[0], P.bH[1], f.look.thick * 0.8 * z, 0, Math.PI * 2); ctx.fill();
  } else if (w === 'whip') {
    const t = [X(lerp(f.prevTip[0], f.tip[0], alpha)) , Y(lerp(f.prevTip[1], f.tip[1], alpha))];
    const mx = (h[0] + t[0]) / 2, my = (h[1] + t[1]) / 2 + 18 * z;
    ctx.strokeStyle = '#d9b071'; ctx.lineWidth = Math.max(1.5, 3 * z);
    ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.quadraticCurveTo(mx, my, t[0], t[1]); ctx.stroke();
    ctx.fillStyle = '#7a5530'; ctx.beginPath(); ctx.arc(h[0], h[1], 3.5 * z, 0, Math.PI * 2); ctx.fill();
  } else if (w === 'bow') {
    const L = 24 * z, a1 = [h[0] + px * L, h[1] + py * L], a2 = [h[0] - px * L, h[1] - py * L];
    ctx.strokeStyle = '#c99a5b'; ctx.lineWidth = Math.max(2, 3.5 * z);
    ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.quadraticCurveTo(h[0] + dx * 16 * z, h[1] + dy * 16 * z, a2[0], a2[1]); ctx.stroke();
    const bh = P.bH, near = Math.hypot(bh[0] - h[0], bh[1] - h[1]) < 40 * z;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a1[0], a1[1]);
    if (near) ctx.lineTo(bh[0], bh[1]);
    ctx.lineTo(a2[0], a2[1]); ctx.stroke();
    if (near && f.state === 'move') {
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = Math.max(1.5, 2 * z);
      ctx.beginPath(); ctx.moveTo(bh[0], bh[1]); ctx.lineTo(h[0] + dx * 14 * z, h[1] + dy * 14 * z); ctx.stroke();
    }
  } else if (w === 'mirror') {
    const c = [h[0] + dx * 4 * z, h[1] + dy * 4 * z], L = 22 * z;
    const active = !!f.activeWindow('reflect') || !!f.activeWindow('counter');
    if (active) {
      ctx.strokeStyle = 'rgba(190,240,255,0.5)'; ctx.lineWidth = 14 * z;
      ctx.beginPath(); ctx.moveTo(c[0] + px * L, c[1] + py * L); ctx.lineTo(c[0] - px * L, c[1] - py * L); ctx.stroke();
    }
    ctx.strokeStyle = '#8fb8e8'; ctx.lineWidth = 9 * z;
    ctx.beginPath(); ctx.moveTo(c[0] + px * L, c[1] + py * L); ctx.lineTo(c[0] - px * L, c[1] - py * L); ctx.stroke();
    ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = 3 * z;
    ctx.beginPath(); ctx.moveTo(c[0] + px * L * 0.7 + dx * 2 * z, c[1] + py * L * 0.7 + dy * 2 * z); ctx.lineTo(c[0] - px * L * 0.2 + dx * 2 * z, c[1] - py * L * 0.2 + dy * 2 * z); ctx.stroke();
  }
  // 攻撃の軌跡（当たっているコマだけ、うっすら）
  for (const hb of f.activeHits()) {
    if (hb.grab) continue;
    const wx = X(f.x + hb.x * f.facing), wy = Y(f.y - hb.y);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.arc(wx, wy, hb.r * z, 0, Math.PI * 2); ctx.fill();
  }
}
function drawProjectile(p, alpha, X, Y, z) {
  const x = X(lerp(p.px, p.x, alpha)), y = Y(lerp(p.py, p.y, alpha));
  const col = p.owner.color;
  if (p.type === 'arrow') {
    const a = Math.atan2(p.vy, p.vx), c = Math.cos(a), s = Math.sin(a), L = 28 * z;
    ctx.strokeStyle = '#f3e3c0'; ctx.lineWidth = Math.max(1.5, 2.5 * z); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - c * L, y - s * L); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x + c * 8 * z, y + s * 8 * z); ctx.lineTo(x - s * 4 * z, y + c * 4 * z); ctx.lineTo(x + s * 4 * z, y - c * 4 * z); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2 * z;
    ctx.beginPath(); ctx.moveTo(x - c * L, y - s * L); ctx.lineTo(x - c * (L - 6 * z) - s * 5 * z, y - s * (L - 6 * z) + c * 5 * z); ctx.stroke();
  } else if (p.type === 'disc') {
    ctx.fillStyle = '#cfe6ff'; ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, p.r * z, p.r * 0.55 * z, p.age * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (p.type === 'shock') {
    const h = (22 + Math.sin(p.age * 0.8) * 5) * z;
    ctx.fillStyle = 'rgba(255,160,60,0.85)';
    ctx.beginPath(); ctx.moveTo(x - 14 * z, y); ctx.lineTo(x - 5 * z, y - h * 0.7); ctx.lineTo(x, y - h); ctx.lineTo(x + 6 * z, y - h * 0.6); ctx.lineTo(x + 14 * z, y); ctx.closePath(); ctx.fill();
  }
}
function drawFX(fx, X, Y, z) {
  for (const e of fx.list) {
    const u = e.t / e.life;
    if (e.k === 'spark') {
      ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - u; ctx.lineWidth = Math.max(1.5, 3 * z * (1 - u));
      const r1 = e.size * z * (0.3 + u * 0.7), r2 = e.size * z * (0.6 + u);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = e.rot + i * Math.PI / 4; ctx.moveTo(X(e.x) + Math.cos(a) * r1, Y(e.y) + Math.sin(a) * r1); ctx.lineTo(X(e.x) + Math.cos(a) * r2, Y(e.y) + Math.sin(a) * r2); }
      ctx.stroke();
      ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), e.size * 0.35 * z * (1 - u), 0, Math.PI * 2); ctx.fill();
    } else if (e.k === 'dust' || e.k === 'smoke') {
      ctx.globalAlpha = (1 - u) * (e.k === 'smoke' ? 0.35 : 0.5); ctx.fillStyle = '#d8dcff';
      ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), e.size * z * (1 + u), 0, Math.PI * 2); ctx.fill();
    } else if (e.k === 'ring') {
      ctx.globalAlpha = 1 - u; ctx.strokeStyle = e.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), e.size * z * (0.4 + u), 0, Math.PI * 2); ctx.stroke();
    } else if (e.k === 'ko') {
      ctx.globalAlpha = 1 - u;
      const x = X(e.x), y = Y(e.y), cx = view.w / 2, cy = view.h / 2;
      const a = Math.atan2(cy - y, cx - x), len = Math.max(view.w, view.h) * (0.5 + u);
      const wdt = 60 * (1 - u) + 10;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(x - Math.sin(a) * wdt * 0.2, y + Math.cos(a) * wdt * 0.2);
      ctx.lineTo(x + Math.cos(a) * len - Math.sin(a) * wdt, y + Math.sin(a) * len + Math.cos(a) * wdt);
      ctx.lineTo(x + Math.cos(a) * len + Math.sin(a) * wdt, y + Math.sin(a) * len - Math.cos(a) * wdt);
      ctx.lineTo(x + Math.sin(a) * wdt * 0.2, y - Math.cos(a) * wdt * 0.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 40 * (1 - u) + 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
function drawDebug(b, X, Y, z) {
  ctx.lineWidth = 1;
  for (const f of b.f) {
    if (!f.alive) continue;
    ctx.strokeStyle = 'rgba(255,255,0,0.6)';
    ctx.beginPath(); ctx.moveTo(X(f.x), Y(f.y - 10)); ctx.lineTo(X(f.x), Y(f.y - 82)); ctx.stroke();
    for (const hb of f.activeHits()) {
      ctx.strokeStyle = hb.grab ? 'rgba(160,0,255,0.9)' : 'rgba(255,0,0,0.9)';
      ctx.beginPath(); ctx.arc(X(f.x + hb.x * f.facing), Y(f.y - hb.y), hb.r * z, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(f.state + (f.move ? ':' + f.move.key + ' ' + f.activeF : ''), X(f.x), Y(f.y + 16));
  }
}
function drawHUD(b) {
  const W = view.w, t = view.inset.t + 8;
  const boxW = 150, gap = 16, x0 = W / 2 - boxW - gap / 2;
  b.f.forEach((f, i) => {
    const x = x0 + i * (boxW + gap);
    ctx.fillStyle = 'rgba(8,12,30,0.62)';
    roundRect(x, t, boxW, 50, 10); ctx.fill();
    ctx.fillStyle = f.color; ctx.fillRect(x, t + 8, 4, 34);
    ctx.textAlign = 'left'; ctx.font = 'bold 11px -apple-system, "Hiragino Sans", sans-serif';
    ctx.fillStyle = '#c9cff0'; ctx.fillText(`${f.label}：${f.c.name}`, x + 12, t + 16);
    for (let s = 0; s < f.stocks; s++) { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x + 16 + s * 13, t + 36, 4.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.textAlign = 'right'; ctx.font = 'bold 26px -apple-system, "Hiragino Sans", sans-serif';
    const pc = f.alive ? Math.floor(f.percent) : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(`${pc}%`, x + boxW - 9, t + 44);
    ctx.fillStyle = pctColor(pc); ctx.fillText(`${pc}%`, x + boxW - 10, t + 43);
  });
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawControls() {
  const c = controls;
  // 一時停止ボタン
  const pr = c.pauseRect;
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; roundRect(pr.x, pr.y, pr.w, pr.h, 9); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(pr.x + 16, pr.y + 12, 4, 16); ctx.fillRect(pr.x + 26, pr.y + 12, 4, 16);
  if (state.showFps) {
    ctx.textAlign = 'left'; ctx.font = 'bold 13px monospace';
    ctx.fillStyle = fpsNow >= 55 ? '#7dff9a' : fpsNow >= 40 ? '#ffe066' : '#ff7070';
    ctx.fillText(`${fpsNow} fps`, pr.x + pr.w + 10, pr.y + 25);
  }
  // 移動スティック
  const R = D.controls.stickRadius;
  const st = c.stick ? { x: c.stick.ox, y: c.stick.oy } : c.stickHome;
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(st.x, st.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const kx = st.x + (c.pad ? c.pad.mx : 0) * R, ky = st.y - (c.pad ? c.pad.my : 0) * R;
  ctx.fillStyle = c.stick ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.arc(c.stick ? kx : st.x, c.stick ? ky : st.y, R * 0.45, 0, Math.PI * 2); ctx.fill();
  // ボタン
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const k in c.btns) {
    const b = c.btns[k];
    const base = k === 'A' ? '255,93,93' : k === 'B' ? '255,211,77' : '255,255,255';
    ctx.fillStyle = `rgba(${base},${b.on ? 0.55 : 0.17})`;
    ctx.strokeStyle = `rgba(${base},0.6)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `bold ${b.label.length > 2 ? 10 : 20}px -apple-system, "Hiragino Sans", sans-serif`;
    ctx.fillText(b.label, b.x, b.y + 1);
  }
  // Cスティック
  const cs = c.cs;
  ctx.fillStyle = 'rgba(255,211,77,0.12)'; ctx.strokeStyle = 'rgba(255,211,77,0.5)';
  ctx.beginPath(); ctx.arc(cs.x, cs.y, cs.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = c.cTouch ? 'rgba(255,211,77,0.7)' : 'rgba(255,211,77,0.4)';
  ctx.beginPath(); ctx.arc(cs.x + cs.kx * cs.r * 0.6, cs.y + cs.ky * cs.r * 0.6, cs.r * 0.48, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(30,20,0,0.9)'; ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.fillText(cs.label, cs.x + cs.kx * cs.r * 0.6, cs.y + cs.ky * cs.r * 0.6 + 1);
  ctx.textBaseline = 'alphabetic';
}

/* =====================================================================
   画面の切り替えとメインループ
   ===================================================================== */
const $ = id => document.getElementById(id);
const state = { screen: 'title', battle: null, paused: false, p1: 0, cpu: 1, showFps: store.get('showFps', false) };
function show(id) {
  for (const s of ['title', 'select', 'pause', 'result']) $(s).classList.toggle('show', s === id);
}
function buildCards() {
  const mk = (el, key) => {
    el.innerHTML = '';
    D.characters.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'card' + (state[key] === i ? ' on' : '');
      d.innerHTML = `${c.no}. ${c.name}<small>${c.range}・${c.type}</small>`;
      d.addEventListener('click', () => { state[key] = i; buildCards(); });
      el.appendChild(d);
    });
  };
  mk($('cardsP1'), 'p1'); mk($('cardsCPU'), 'cpu');
}
function startBattle() {
  state.battle = new Battle(D.characters[state.p1], D.characters[state.cpu]);
  controls.reset();
  controls.pad = state.battle.f[0].pad;
  state.paused = false; state.screen = 'battle'; state.resultShown = false;
  show(null);
  acc = 0;
}
function pause() {
  if (state.screen !== 'battle' || state.paused || !state.battle || state.battle.over) return;
  state.paused = true; controls.reset(); show('pause');
}
controls.onPause = pause;
function updateFpsBtn() { $('btnFps').textContent = `fps表示：${state.showFps ? 'オン' : 'オフ'}`; }
$('btnStart').addEventListener('click', () => { buildCards(); show('select'); state.screen = 'select'; });
$('btnBack').addEventListener('click', () => { show('title'); state.screen = 'title'; });
$('btnFight').addEventListener('click', startBattle);
$('btnResume').addEventListener('click', () => { state.paused = false; show(null); acc = 0; });
$('btnRestart').addEventListener('click', startBattle);
$('btnToSelect').addEventListener('click', () => { state.battle = null; state.screen = 'select'; buildCards(); show('select'); });
$('btnFps').addEventListener('click', () => { state.showFps = !state.showFps; store.set('showFps', state.showFps); updateFpsBtn(); });
$('btnAgain').addEventListener('click', startBattle);
$('btnResSelect').addEventListener('click', () => { state.battle = null; state.screen = 'select'; buildCards(); show('select'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
updateFpsBtn();

let acc = 0, last = performance.now(), fpsCount = 0, fpsT = 0, fpsNow = 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  if (Math.abs(dt - STEP) < 0.002) dt = STEP; // 画面の更新タイミングのゆれをならす
  fpsCount++; fpsT += dt;
  if (fpsT >= 0.5) { fpsNow = Math.round(fpsCount / fpsT); fpsCount = 0; fpsT = 0; }
  const b = state.battle;
  if (b && !state.paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) { b.step(); acc -= STEP; n++; }
    if (n === 4) acc = 0;
    if (b.over && b.overT > 100 && !state.resultShown) {
      state.resultShown = true;
      $('resultText').textContent = b.winner.slot === 0 ? 'あなたの勝ち！' : 'CPUの勝ち…';
      show('result');
    }
  }
  render(b, b && !state.paused ? acc / STEP : 1);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();
requestAnimationFrame(frame);

// 動作確認用（パソコンでのテストに使います）
window.__game = { state, D, Battle, CpuBrain, Fighter, startBattle, calcKB, POSES };
})();
