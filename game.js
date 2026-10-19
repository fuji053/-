/* =====================================================================
   ゲーム本体（動き・当たり判定・吹っ飛び・崖・ダウン・CPU・描画・タッチ操作）
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
const easeOut = t => 1 - (1 - t) * (1 - t) * (1 - t);
const DEG = Math.PI / 180;
const rnd = Math.random;
const sign = v => (v < 0 ? -1 : 1);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const clone = o => JSON.parse(JSON.stringify(o));
function deepMerge(base, over) {
  if (Array.isArray(over)) {
    const out = Array.isArray(base) ? base.slice() : [];
    over.forEach((v, i) => { out[i] = v && typeof v === 'object' && out[i] && typeof out[i] === 'object' ? deepMerge(out[i], v) : v; });
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
   骨組み（ポーズ）
   角度（度）：t=胴の傾き / fa=前の腕 / ba=後ろの腕 / fl=前の脚 / bl=後ろの脚 / r=体全体の回転 / tw=腰と肩のひねり
   腕・脚の1つ目の数字は付け根の角度（0=真下、90=前、180=真上）、2つ目はひじ・ひざの曲げ
   ひじは前にだけ（0〜165）、ひざは後ろにだけ（-165〜0）曲がるように制限しています
   ===================================================================== */
/* =====================================================================
   効果音（ファイルを使わず、その場で音を作って鳴らす）
   iPhoneは画面に最初にふれたときから音が出せるようになります
   ===================================================================== */
const SFX = (() => {
  let ac = null, master = null, noiseBuf = null;
  const lastT = {};
  function unlock() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain(); master.gain.value = 0.55;
        const comp = ac.createDynamicsCompressor(); // 音が重なっても割れないように
        master.connect(comp); comp.connect(ac.destination);
        const n = ac.sampleRate;
        noiseBuf = ac.createBuffer(1, n, n);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0);
      }
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { /* 音が出せない環境では何もしない */ }
  }
  for (const ev of ['touchstart', 'touchend', 'mousedown', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  function env(g, t0, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    env(g, t0, 0.004, vol, dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, f0, f1, q = 1, kind = 'bandpass', delay = 0) {
    const t0 = ac.currentTime + delay, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = kind; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t0); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    env(g, t0, 0.003, vol, dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }
  const lib = {
    hitL()  { noise(0.07, 0.35, 3200, 1400, 1.2); tone('square', 260, 120, 0.05, 0.08); },
    hitM()  { noise(0.12, 0.55, 2200, 500, 0.9); tone('sine', 190, 60, 0.14, 0.45); },
    hitH()  { noise(0.22, 0.8, 1800, 260, 0.7); tone('sine', 140, 38, 0.32, 0.8); tone('square', 90, 40, 0.12, 0.12); },
    armor() { tone('triangle', 420, 300, 0.09, 0.3); noise(0.06, 0.25, 1500, 900, 2); },
    shield(){ tone('sine', 700, 520, 0.08, 0.25); noise(0.05, 0.2, 4000, 2500, 3); },
    meteor(){ tone('sine', 220, 30, 0.55, 0.9); noise(0.35, 0.8, 900, 80, 0.6, 'lowpass'); tone('sawtooth', 300, 60, 0.25, 0.12); },
    cine()  { noise(0.08, 0.9, 6000, 3000, 0.8, 'highpass'); tone('sine', 110, 28, 1.0, 0.95); noise(0.9, 0.45, 600, 60, 0.5, 'lowpass', 0.03); },
    ko()    { noise(0.5, 0.7, 400, 3000, 0.8); tone('sine', 90, 30, 0.8, 0.9, 0.05); noise(0.7, 0.6, 1200, 80, 0.5, 'lowpass', 0.08); },
    shoot(p){ noise(0.09, 0.3 + p * 0.25, 2500, 6000, 1.5); tone('triangle', 900 + p * 500, 260, 0.12, 0.18 + p * 0.12); },
    charged(){ tone('sine', 988, 988, 0.18, 0.22); tone('sine', 1480, 1480, 0.26, 0.18, 0.06); },
    jump()  { tone('sine', 320, 620, 0.09, 0.12); },
    grab()  { tone('square', 180, 120, 0.07, 0.14); noise(0.05, 0.25, 1200, 700, 2); },
    reflect(){ tone('triangle', 1300, 2100, 0.14, 0.25); tone('sine', 2600, 2600, 0.12, 0.08, 0.03); },
    quake() { noise(0.4, 0.75, 500, 60, 0.6, 'lowpass'); tone('sine', 75, 35, 0.4, 0.7); },
    swing(p){ noise(0.1 + p * 0.06, 0.12 + p * 0.18, 500, 2200, 1.4); },
    tech()  { tone('triangle', 600, 900, 0.07, 0.15); },
  };
  return {
    unlock,
    play(name, p = 0) {
      if (!ac || ac.state !== 'running' || !lib[name]) return;
      const now = ac.currentTime;
      if (lastT[name] !== undefined && now - lastT[name] < 0.03) return;
      lastT[name] = now;
      try { lib[name](p); } catch (e) { /* 無視 */ }
    },
    get ready() { return !!ac && ac.state === 'running'; },
  };
})();

const PK = ['t', 'fa1', 'fa2', 'ba1', 'ba2', 'fl1', 'fl2', 'bl1', 'bl2', 'r', 'tw', 'yw', 'wr', 'pa'];
// yw = 体の横回転（3Dで回る技） / wr = 武器の回転 / pa = 1 で体全体を地面につける（寝そべる技）
function P(t, fa1, fa2, ba1, ba2, fl1, fl2, bl1, bl2, r = 0, tw = 0) { return { t, fa1, fa2, ba1, ba2, fl1, fl2, bl1, bl2, r, tw, yw: 0, wr: 0, pa: 0 }; }
const POSES = {
  // 立ち・移動
  idle:         P(6, 25, 80, -12, 90, 16, -14, -16, -8, 0, 0.15),
  idle2:        P(9, 30, 88, -8, 98, 20, -24, -14, -16, 0, 0.1),
  walk1:        P(8, -22, 30, 28, 34, 30, -12, -22, -40),
  walk2:        P(8, 6, 30, 2, 30, 4, -45, 6, -10),
  walk3:        P(8, 28, 34, -22, 30, -22, -40, 30, -12),
  walk4:        P(8, 2, 30, 6, 30, 6, -10, 4, -45),
  run1:         P(22, -45, 95, 55, 80, 70, -95, -45, -60),
  run2:         P(24, 5, 90, 10, 90, 15, -120, 10, -30),
  run3:         P(22, 55, 80, -45, 95, -45, -60, 70, -95),
  run4:         P(24, 10, 90, 5, 90, 10, -30, 15, -120),
  dashStart:    P(30, -40, 90, 50, 70, 60, -90, -40, -30, 0, 0.3),
  skid:         P(-14, 40, 60, 60, 70, 40, -10, -10, -60),
  crouch:       P(30, 35, 70, 15, 80, 72, -122, -12, -100),
  // 空中
  takeoff:      P(-4, 145, 20, 125, 30, 10, -10, -12, -25),
  jump:         P(0, 112, 45, 96, 55, 50, -85, -5, -60),
  tuck:         P(10, 70, 110, 60, 110, 95, -140, 70, -140),
  fall:         P(4, 120, 35, 105, 45, 22, -26, -16, -36),
  fastfall:     P(0, 150, 20, 140, 25, 5, -8, -5, -12),
  helpless:     P(0, 165, 5, 175, 0, 10, -15, -12, -10),
  // 防御・やられ
  shield:       P(10, 60, 110, 40, 120, 30, -40, -28, -18),
  hurtLight:    P(-10, 5, 70, -25, 70, 18, -20, -16, -10),
  hurt:         P(-26, -55, 30, -85, 20, 25, -25, -18, -12),
  hurtHigh:     P(-40, -110, 20, -140, 20, 35, -40, -10, -30),
  tumble:       P(-10, -120, 20, -150, 20, 40, -60, -30, -40),
  down:         P(0, 170, 0, 160, 0, 8, -10, -6, -20, -90),
  grab:         P(22, 90, 5, 80, 15, 45, -45, -30, -10, 0, 0.3),
  hold:         P(10, 80, 25, 70, 35, 20, -20, -20, -10),
  grabbed:      P(-15, -30, 20, -40, 20, 10, -10, -10, -10),
  // 崖
  ledgeHang:    P(12, 172, 0, 168, 0, 8, -20, -6, -30),
  ledgeClimb:   P(40, 120, 40, 110, 40, 100, -140, 40, -120),
  getupSweep:   P(30, 60, 30, -60, 40, 90, 0, -80, 0),
  // 攻撃（素手）
  jabReady:     P(10, 35, 95, -5, 100, 25, -20, -22, -8, 0, -0.2),
  punchWind:    P(-6, -35, 125, 45, 85, 30, -30, -25, -10, 0, -0.6),
  punch:        P(18, 82, 0, -45, 70, 40, -32, -32, 0, 0, 0.6),
  punch2:       P(20, -30, 100, 85, 0, 35, -25, -35, -5, 0, -0.6),
  roundKick:    P(-28, 20, 60, -40, 60, 100, 0, -12, -6, 0, 0.8),
  uppercutWind: P(26, -10, 40, 60, 85, 70, -105, 0, -60, 0, -0.6),
  uppercut:     P(-12, 172, 0, 25, 70, 12, -12, -20, -10, 0, 0.6),
  sweepWind:    P(36, 40, 30, 20, 40, 75, -120, -10, -90),
  sweep:        P(32, 55, 20, -10, 50, 88, 0, -15, -100),
  kickWind:     P(-10, 20, 65, -20, 65, 92, -115, -6, -6),
  kick:         P(-25, -20, 45, -40, 45, 95, 0, -10, -5, 0, 0.4),
  upKick:       P(-20, 40, 40, 20, 40, 165, 0, -20, -30),
  stomp:        P(0, 125, 25, 115, 25, 0, 0, 25, -90),
  backKickWind: P(10, 40, 80, 30, 80, 60, -110, 40, -130),
  backKick:     P(22, 45, 70, 30, 70, 50, -90, -110, 0, 0, -0.3),
  nairSpread:   P(0, 90, 0, -90, 0, 80, 0, -60, -20),
  overheadWind: P(-22, 170, 30, 160, 30, 25, -30, -25, -15),
  overheadSlam: P(38, 60, 0, 60, 0, 55, -70, -35, -15),
  smashFwdWind: P(-16, -85, 70, -60, 80, 30, -40, -32, -20, 0, -1),
  smashFwd:     P(28, 85, 0, -60, 40, 62, -62, -40, 0, 0, 1),
  smashUpWind:  P(22, -10, 20, -20, 20, 75, -115, 0, -95),
  smashUp:      P(-10, 176, 0, 168, 0, 10, 0, -10, 0),
  smashDownWind:P(8, 150, 20, 140, 20, 40, -30, -40, -20),
  smashDown:    P(45, 25, 0, 30, 0, 60, -80, -50, -30),
  lariat:       P(12, 90, 0, -90, 0, 40, -40, -30, -10, 0, 0.5),
  // 武器
  swingWind:    P(-12, -125, 0, 40, 70, 30, -30, -25, -10, 0, -0.7),
  swingFwd:     P(24, 85, 0, -40, 60, 45, -40, -35, 0, 0, 0.7),
  swingBackhand:P(10, 120, 0, -20, 60, 35, -30, -28, -6, 0, -0.5),
  swingUpWind:  P(18, -40, 0, 20, 60, 40, -50, -20, -20),
  swingUp:      P(-10, 170, 0, 40, 60, 15, -15, -20, -10),
  swingLow:     P(34, 60, 0, 10, 60, 72, -118, -10, -92),
  swingLowWind: P(30, -60, 0, 20, 60, 72, -118, -10, -92),
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
  guardWind:    P(-8, 40, 85, 20, 85, 25, -25, -20, -10, 0, -0.4),
  guard:        P(10, 85, 0, 40, 95, 35, -35, -28, -10),
  guardUp:      P(-5, 170, 0, 60, 85, 25, -25, -20, -10),
  guardDown:    P(20, 10, 0, 40, 85, 40, -50, -20, -30),
  guardLow:     P(35, 65, 0, 20, 60, 72, -118, -10, -92),
  guardDownAir: P(0, 10, 0, 30, 60, 10, -20, -10, -30),
  bash:         P(28, 85, 0, -40, 60, 55, -50, -40, 0, 0, 0.6),
  pull:         P(-15, 60, 60, 20, 80, 10, -10, -40, -10),
  counter:      P(-5, 20, 95, -20, 85, 25, -30, -28, -10),
  counterHit:   P(30, 95, 0, -60, 40, 60, -60, -40, 0, 0, 0.8),
  throwFwd:     P(25, 90, 0, 85, 10, 55, -55, -35, 0),
  throwUp:      P(-10, 175, 0, 170, 0, 20, -20, -15, -10),
  throwDown:    P(45, 30, 0, 30, 0, 60, -80, -45, -20),
  // 弓使い
  bowJab:       P(14, 92, 0, 30, 95, 40, -35, -30, -8, 0, 0.5),
  palm:         P(18, 20, 95, 88, 0, 40, -35, -32, -5, 0, -0.6),
  bowSweepWind: P(-5, -100, 0, 40, 85, 30, -30, -25, -10, 0, -0.8),
  bowSweep:     P(22, 95, 0, -30, 70, 45, -40, -35, 0, 0, 0.8),
  sideKickWind: P(-15, 40, 95, 20, 95, 100, -135, -10, -8, 0, -0.3),
  sideKick:     P(-35, 10, 85, -20, 75, 98, 0, -12, -6, 0, 0.2),
  bowSpinUp:    P(-6, 165, 0, 60, 85, 20, -20, -20, -10),
  staffWind:    P(-15, -120, 0, -60, 40, 30, -30, -35, -10, 0, -1),
  staffSwing:   P(30, 90, 0, 70, 10, 60, -60, -40, 0, 0, 1),
  plantWind:    P(30, 30, 0, 40, 70, 72, -118, -10, -92),
  plantKick:    P(25, 25, 0, 40, 60, 92, 0, -20, -95),
  tornadoKick:  P(5, 100, 0, -100, 0, 88, 0, -50, -30),
  aimDraw:      P(4, 90, 0, 90, 165, 32, -28, -30, -12),
  spearWind:    P(-5, 60, 45, 70, 140, 30, -30, -25, -10, 0, -0.5),
  spearThrust:  P(25, 90, 0, 90, 15, 60, -50, -40, 0, 0, 0.6),
  // 拳闘士（プロレスラー）
  chopWind:     P(-5, -60, 60, 30, 95, 30, -25, -25, -8, 0, -0.7),
  chop:         P(20, 85, 10, -30, 85, 40, -30, -32, 0, 0, 0.7),
  elbowWind:    P(0, -20, 140, 30, 95, 30, -25, -25, -8, 0, -0.4),
  elbow:        P(22, 75, 150, -30, 85, 45, -35, -32, 0, 0, 0.8),
  headbuttWind: P(-25, 30, 95, 30, 95, 25, -30, -25, -10),
  headbutt:     P(50, 20, 85, 10, 85, 55, -50, -40, 0),
  bigBootWind:  P(-5, 30, 85, 10, 85, 110, -140, -8, -6),
  bigBoot:      P(-30, 10, 75, -10, 75, 100, 0, -10, -6),
  elbowUpWind:  P(25, -10, 140, 40, 95, 60, -90, -5, -50),
  elbowUp:      P(-15, 150, 150, 30, 85, 15, -15, -20, -10, 0, 0.6),
  slide:        Object.assign(P(-60, 150, 20, 160, 20, 85, 0, 60, -40), { pa: 1 }),
  lariatWind:   P(-10, -90, 20, 40, 85, 30, -30, -30, -10, 0, -1),
  lariatFull:   P(15, 90, 0, -60, 40, 55, -50, -40, 0, 0, 1),
  headbuttUp:   P(-5, -30, 40, -40, 40, 10, 0, -10, 0),
  stompWind:    P(0, 60, 60, 60, 60, 100, -110, -10, -10),
  stompDown:    P(15, 40, 40, 40, 40, 25, -30, -15, -20),
  bodyPress:    P(0, 150, 0, 30, 0, 20, 0, -20, 0, 80),
  dropkick:     P(10, 60, 60, 60, 60, -100, 0, -95, 0, -20),
  footStamp:    P(0, 130, 25, 120, 25, 0, 0, 6, 0),
  chopBigWind:  P(-20, 175, 25, 60, 85, 30, -30, -30, -10, 0, -0.6),
  chopBig:      P(35, 60, 0, -40, 60, 60, -60, -40, 0, 0, 0.9),
  leapGrab:     P(30, 90, 0, 85, 10, 60, -80, -40, -20),
  sleeperHold:  P(5, 70, 125, 60, 135, 25, -25, -25, -8),
  bodyAttack:   P(0, 170, 0, 160, 0, 0, 0, 10, 0, 75),
  backhand:     P(15, 95, 0, -40, 60, 30, -30, -30, -10, 0, 0.7),
  divingElbow:  P(0, 10, 150, 30, 125, 20, -60, -10, -60, 60),
  germanWind:   P(10, 80, 30, 80, 30, 50, -60, -30, -20),
  germanBridge: Object.assign(P(-30, 150, 20, 150, 20, 60, -100, 40, -110, -110), { pa: 1 }),
};
function lerpPose(a, b, t, out) {
  const o = out || {};
  for (let i = 0; i < PK.length; i++) { const k = PK[i]; o[k] = a[k] + (b[k] - a[k]) * t; }
  return o;
}
function copyPose(p, out) { const o = out || {}; for (let i = 0; i < PK.length; i++) o[PK[i]] = p[PK[i]]; return o; }
// キーフレームの間をなめらかな曲線（Catmull-Rom）でつなぐ
function catmull(p0, p1, p2, p3, u, out) {
  const o = out || {};
  const u2 = u * u, u3 = u2 * u;
  for (let i = 0; i < PK.length; i++) {
    const k = PK[i], a = p0[k], b = p1[k], c = p2[k], d = p3[k];
    o[k] = 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  }
  return o;
}

const SK = { thigh: 24, shin: 23, torso: 30, upper: 18, fore: 17 };
function dirv(a) { const r = a * DEG; return [Math.sin(r), -Math.cos(r)]; }
// ポーズ → 関節の位置（前向き・上がプラスの座標。足元が原点）
function solvePose(p, look, plant, plantAll) {
  if (p.pa > 0.5) plantAll = true;
  const fa2 = clamp(p.fa2, 0, 165), ba2 = clamp(p.ba2, 0, 165);
  const fl2 = clamp(p.fl2, -165, 0), bl2 = clamp(p.bl2, -165, 0);
  const tw = clamp(p.tw || 0, -1.2, 1.2);
  const H = [0, 47];
  const st = Math.sin(p.t * DEG), ct = Math.cos(p.t * DEG);
  const N = [H[0] + st * SK.torso, H[1] + ct * SK.torso];
  const S = [H[0] + st * (SK.torso - 3), H[1] + ct * (SK.torso - 3)];
  const fS = [S[0] + tw * 5 * ct, S[1] - tw * 5 * st], bS = [S[0] - tw * 5 * ct, S[1] + tw * 5 * st];
  const fHp = [H[0] - tw * 2.5, H[1]], bHp = [H[0] + tw * 2.5, H[1]];
  const head = [N[0] + st * (look.head + 1), N[1] + ct * (look.head + 1)];
  const eye = [head[0] + ct * look.head * 0.5 + st * look.head * 0.15, head[1] - st * look.head * 0.5 + ct * look.head * 0.15];
  const limb = (o, a1, a2, l1, l2) => {
    const d1 = dirv(a1), m = [o[0] + d1[0] * l1, o[1] + d1[1] * l1];
    const d2 = dirv(a1 + a2), e = [m[0] + d2[0] * l2, m[1] + d2[1] * l2];
    return [m, e];
  };
  const [fE, fH] = limb(fS, p.fa1 + p.t, fa2, SK.upper, SK.fore);
  const [bE, bH] = limb(bS, p.ba1 + p.t, ba2, SK.upper, SK.fore);
  const [fK, fF] = limb(fHp, p.fl1, fl2, SK.thigh, SK.shin);
  const [bK, bF] = limb(bHp, p.bl1, bl2, SK.thigh, SK.shin);
  const pts = { H, N, S, fS, bS, fHp, bHp, head, eye, fE, fH, bE, bH, fK, fF, bK, bF };
  if (p.r) {
    const th = -p.r * DEG, c = Math.cos(th), s = Math.sin(th);
    for (const k in pts) {
      const q = pts[k], x = q[0] - H[0], y = q[1] - H[1];
      pts[k] = [H[0] + x * c - y * s, H[1] + x * s + y * c];
    }
  }
  if (plant) {
    let m = Math.min(pts.fF[1], pts.bF[1], pts.fK[1], pts.bK[1]);
    if (plantAll) m = Math.min(m, pts.head[1] - look.head, pts.fH[1], pts.bH[1], pts.H[1] - 6, pts.N[1] - 6);
    for (const k in pts) pts[k] = [pts[k][0], pts[k][1] - m];
  }
  return pts;
}

/* =====================================================================
   技データの準備（武器の共通技 + 投げ + 共通技 + 必殺技 + 個別の上書き）
   ===================================================================== */
const SPECIAL_KEYS = { n: 'nspecial', side: 'sspecial', up: 'uspecial', down: 'dspecial',
  airN: 'nspecialAir', airF: 'fspecialAir', airB: 'bspecialAir', airU: 'uspecialAir', airD: 'dspecialAir' };
function scaleMove(m, sp, dm) {
  const S = v => Math.max(0, Math.round(v / sp));
  const SR = r => [S(r[0]), Math.max(S(r[0]), S(r[1]))];
  m.dur = S(m.dur);
  if (m.iasa !== undefined) m.iasa = S(m.iasa);
  if (m.next) m.next.f = SR(m.next.f);
  if (m.poses) m.poses.forEach(k => { k[0] = S(k[0]); });
  if (m.hits) m.hits.forEach(h => { h.f = SR(h.f); if (h.dmg) h.dmg *= dm; });
  if (m.events) m.events.forEach(e => { e.f = Array.isArray(e.f) ? SR(e.f) : S(e.f); });
  if (m.charge) m.charge.f = S(m.charge.f);
  if (m.holdShot) m.holdShot.f = S(m.holdShot.f);
  if (m.loop) { m.loop.from = S(m.loop.from); m.loop.to = S(m.loop.to); }
  if (m.reflect) m.reflect.f = SR(m.reflect.f);
  if (m.counter) m.counter.f = SR(m.counter.f);
  if (m.armor) m.armorW = { f: SR(m.armor) };
  if (m.invuln) m.invulnW = { f: SR(m.invuln) };
  if (m.gravityFrames) m.gravityFrames = SR(m.gravityFrames);
  if (m.release !== undefined) m.release = S(m.release);
  if (m.held) m.held.forEach(k => { k[0] = S(k[0]); });
  if (m.hit) m.hit.dmg *= dm;
  if (m.hits && m.hits.length) {
    m.firstHit = Math.min(...m.hits.map(h => h.f[0]));
    m.lastHit = Math.max(...m.hits.map(h => h.f[1]));
  }
  return m;
}
// テンポ設定をキャラの動きの数値にかける
function landLagT(n) { return Math.max(2, Math.round(n * ((D.tempo && D.tempo.landLag) || 1))); }
function tempoStats(st) {
  const T = D.tempo || {}, s = Object.assign({}, st);
  const run = T.run || 1, air = T.air || 1, fall = T.fall || 1;
  s.run *= run; s.runAccel = run;
  s.air *= air; s.airAccel *= air;
  s.gravity *= fall; s.fall *= fall;
  // 重力が強くなってもジャンプの高さが同じになるように、跳ぶ力も上げる
  s.jump *= Math.sqrt(fall); s.djump *= Math.sqrt(fall);
  return s;
}
function buildMoves(c) {
  const moves = {};
  const W = D.weapons[c.weapon];
  for (const k in W) moves[k] = clone(W[k]);
  for (const k in D.throws) moves[k] = clone(D.throws[k]);
  for (const k in D.common) moves[k] = clone(D.common[k]);
  for (const k in (c.throws || {})) moves[k] = clone(c.throws[k]);
  for (const k in c.specials) moves[SPECIAL_KEYS[k]] = clone(c.specials[k]);
  for (const k in (c.extraMoves || {})) moves[k] = clone(c.extraMoves[k]);
  for (const k in (c.overrides || {})) {
    const key = SPECIAL_KEYS[k] || k;
    if (moves[key]) moves[key] = deepMerge(moves[key], c.overrides[k]);
  }
  const ta = (D.tempo && D.tempo.attack) || 1;
  for (const k in moves) {
    moves[k].key = k;
    // テンポを上げて技が短くなっても、技で動く距離（突進・復帰の高さ）は変わらないようにする
    if (ta !== 1 && moves[k].events) for (const e of moves[k].events) if (Array.isArray(e.f)) { if (e.vx !== undefined) e.vx *= ta; if (e.vy !== undefined) e.vy *= ta; }
    scaleMove(moves[k], (c.stats.speed || 1) * ta, c.stats.dmgMul || 1);
  }
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
    this.buf = { A: 0, B: 0, jump: 0, grab: 0, C: 0, shield: 0 };
    this.cdir = { x: 0, y: 0 };
  }
  press(k) { if (k in this.buf) this.buf[k] = BUFFER; }
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
// 状態ごとのポーズの追従のしかた（k=かたさ、d=ゆれの残り方）
const SPRING = {
  move: [0.62, 0.32], loco: [0.34, 0.5], air: [0.3, 0.5], hurt: [0.4, 0.62], soft: [0.26, 0.55], snap: [0.8, 0.2],
};
class Fighter {
  constructor(c, slot, battle) {
    this.c = c; this.s = tempoStats(c.stats); this.slot = slot; this.b = battle;
    this.moves = buildMoves(c);
    this.look = c.look || { thick: 6, head: 10 };
    this.color = slot === 0 ? '#ff5d5d' : '#4fa8ff';
    this.dark = slot === 0 ? '#b8363b' : '#2c6fb3';
    this.label = slot === 0 ? 'あなた' : 'CPU';
    this.stocks = D.rules.stocks;
    this.pad = new Pad();
    this.disp = copyPose(POSES.idle); this.dvel = {}; for (const k of PK) this.dvel[k] = 0;
    this.prevDisp = copyPose(POSES.idle);
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
    this.ff = false; this.shCheck = false; this.jumpPressT = 99; this.prevMy = 0;
    this.techT = 0; this.techLock = 0; this.downT = 0;
    this.ledge = -1; this.ledgeGrabs = 0; this.ledgeCd = 0; this.ledgeT = 0;
    this.hitFlash = 0; this.armorFlash = 0; this.hurtKind = 'hurt'; this.shakeT = 0;
    this.prevState = this.state; this.stateT = 0; this.landSquash = 0;
    this.hand = [x, y - 70]; this.tip = [x, y - 40]; this.prevTip = this.tip;
    this.trail = []; this.trailJoint = null;
  }
  get alive() { return this.state !== 'dead'; }
  hittable() {
    if (!this.alive || this.invuln > 0 || this.state === 'grabbed') return false;
    if (this.activeWindow('invulnW')) return false;
    return true;
  }
  /* ---------- 1コマ分の更新 ---------- */
  update() {
    const pad = this.pad;
    this.px = this.x; this.py = this.y; copyPose(this.disp, this.prevDisp); this.prevTip = this.tip;
    if (this.state === 'dead') {
      if (--this.timer <= 0 && this.stocks > 0) this.respawn();
      return;
    }
    if (this.hitlag > 0) { this.hitlag--; if (this.shakeT > 0) this.shakeT--; if (this.hitFlash > 0) this.hitFlash--; return; }
    this.anim++;
    if (this.invuln > 0) this.invuln--;
    if (this.flipT < 99) this.flipT++;
    if (this.ledgeCd > 0) this.ledgeCd--;
    if (this.techT > 0) this.techT--;
    if (this.techLock > 0) this.techLock--;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.armorFlash > 0) this.armorFlash--;
    if (this.landSquash > 0) this.landSquash--;
    this.jumpPressT++;
    if (this.state !== 'shield') this.shieldHP = Math.min(PH.shieldMax, this.shieldHP + PH.shieldRegen);
    // 受け身の入力（吹っ飛び中にシールド）
    if ((this.state === 'tumble' || (this.state === 'hitstun' && !this.grounded)) && pad.take('shield') && this.techLock <= 0) {
      this.techT = PH.techWindow; this.techLock = PH.techLockout;
    }
    this.vxSet = false;
    this.runState(pad);
    this.fastFallCheck(pad);
    const noPhys = this.state === 'grabbed' || this.state === 'ledge' || this.state === 'ledgeClimb' || this.ledgeRising();
    if (!noPhys) { this.physics(); this.tryLedge(); }
    if (this.state !== this.prevState) { this.prevState = this.state; this.stateT = 0; } else this.stateT++;
    this.prevMy = pad.my;
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
        if (--this.timer <= 0) this.takeoff(pad);
        break;
      case 'land': case 'shieldOff': case 'tech': case 'getup':
        this.vx = approach(this.vx, 0, PH.groundFriction);
        if (--this.timer <= 0) this.state = 'idle';
        break;
      case 'air':
        this.shortHopCheck(pad);
        if (!this.airAct(pad)) this.airDrift(pad, 1);
        break;
      case 'helpless':
        this.airDrift(pad, 0.7);
        break;
      case 'move':
        this.shortHopCheck(pad);
        this.updateMove(pad);
        break;
      case 'shield':
        this.vx = approach(this.vx, 0, PH.groundFriction);
        this.shieldHP -= PH.shieldDrain;
        if (this.shieldHP <= 0) { this.shieldBreak(); break; }
        if (pad.take('jump')) { this.startJump(); break; }
        if (pad.take('grab') || pad.take('A')) { this.startMove('grab', pad); break; }
        if (pad.take('B') && pad.my > 0.5) { this.startMove('uspecial', pad, 'B'); break; }
        if (pad.take('C') && pad.cdir.y > 0.5) { this.startMove('usmash', pad, 'C'); break; }
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
      case 'down':
        this.vx = approach(this.vx, 0, PH.groundFriction);
        this.downT++;
        if (this.downT >= PH.downMinTime) {
          if (pad.take('A')) { this.startMove('getupAttack', pad); break; }
          if (pad.take('jump') || pad.take('shield') || pad.take('B') || pad.take('grab') || Math.hypot(pad.mx, pad.my) > 0.5) { this.getUp(); break; }
        }
        if (this.downT >= PH.downAutoTime) this.getUp();
        break;
      case 'dizzy':
        if (this.grounded) this.vx = approach(this.vx, 0, PH.groundFriction);
        if (--this.timer <= 0) this.state = this.grounded ? 'idle' : 'air';
        break;
      case 'holding':
        this.vx = 0;
        this.updateHolding(pad);
        break;
      case 'ledge':
        this.updateLedge(pad);
        break;
      case 'ledgeClimb':
        this.updateClimb();
        break;
      case 'grabbed':
        break;
    }
  }
  /* ---------- ジャンプ（小ジャンプ・大ジャンプ） ---------- */
  startJump() { this.state = 'squat'; this.timer = PH.jumpSquat; this.jumpPressT = 0; }
  takeoff(pad) {
    const s = this.s;
    const full = pad.held.jump;
    this.vy = -(full ? s.jump : s.jump * PH.shortHopRatio);
    this.shCheck = full;
    this.grounded = false; this.state = 'air'; this.ff = false;
    this.vx = clamp(this.vx + pad.mx * 1.2, -s.air * 1.2, s.air * 1.2);
    this.b.fx.dust(this.x, this.y + 2, 0.5);
    if (this.slot === 0) SFX.play('jump');
  }
  shortHopCheck(pad) {
    if (!this.shCheck) return;
    if (this.jumpPressT > PH.shortHopWindow) { this.shCheck = false; return; }
    if (!pad.held.jump) {
      const sh = -this.s.jump * PH.shortHopRatio;
      if (this.vy < sh) this.vy = sh;
      this.shCheck = false;
    }
  }
  fastFallCheck(pad) {
    if (this.grounded || this.ff) return;
    const ok = this.state === 'air' || this.state === 'helpless' || (this.state === 'move' && this.moveAir && !this.move.gravityFrames);
    if (!ok) return;
    if (this.vy >= -0.5 && pad.my < -0.7 && this.prevMy >= -0.7) {
      this.ff = true; this.vy = Math.max(this.vy, this.s.fall * PH.fastFallMul);
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
    if (pad.take('jump')) { this.startJump(); return true; }
    if (pad.held.shield) { this.state = 'shield'; return true; }
    return false;
  }
  groundMove(pad) {
    const s = this.s, mx = pad.mx;
    if (Math.abs(mx) > 0.2) {
      const nf = sign(mx);
      if (nf !== this.facing && Math.abs(this.vx) > s.run * 0.6) this.skidT = 6;
      this.facing = nf;
      const run = Math.abs(mx) > 0.75;
      const target = (run ? s.run : s.walk * Math.min(1, Math.abs(mx) / 0.75)) * this.facing;
      this.vx = approach(this.vx, target, run ? 1.0 * (s.runAccel || 1) : 0.8);
      this.state = run ? 'run' : 'walk';
    } else {
      this.vx = approach(this.vx, 0, PH.groundFriction);
      this.state = 'idle';
    }
    if (this.skidT > 0) this.skidT--;
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
      this.jumps--; this.vy = -this.s.djump; this.vx = pad.mx * this.s.air; this.flipT = 0; this.ff = false; this.shCheck = false;
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
    this.chargeT = 0; this.chargeMul = 1; this.charging = false; this.chargeDone = false; this.shotT = 0;
    this.chargeBtn = btn || 'A';
    this.moveAir = !this.grounded;
    this.trail = []; this.trailJoint = null;
    if (key === 'ledgeAttack') this.ledgeFrom = [this.x, this.y];
    return true;
  }
  ledgeRising() { return this.state === 'move' && this.move && this.move.key === 'ledgeAttack' && this.mf <= 15; }
  updateMove(pad) {
    const m = this.move;
    if (this.mf > m.dur) { this.endMove(); return; }
    let f = this.mf;
    // スマッシュのため（Cスティックを倒し続ける）
    if (m.charge && this.chargeBtn === 'C' && f === m.charge.f && !this.chargeDone) {
      if (pad.held.C && this.chargeT < m.charge.max) {
        this.chargeT++; this.charging = true;
        this.chargeMul = 1 + (m.charge.mul - 1) * this.chargeT / m.charge.max;
        this.activeF = -1;
        this.vx = approach(this.vx, 0, PH.groundFriction);
        return;
      }
      this.chargeDone = true; this.charging = false;
    }
    // ため撃ち（Bを押している間ためて、離すと発射。シールドでやめられる）
    const hs = m.holdShot;
    if (hs && this.chargeBtn === 'B' && f === hs.f && !this.chargeDone) {
      if (pad.take('shield')) { this.charging = false; this.endMove(); return; }
      if (pad.held.B && this.chargeT < hs.max + hs.over) {
        this.chargeT++; this.charging = true;
        this.shotT = Math.min(1, this.chargeT / hs.max);
        if (this.chargeT === hs.max) { this.b.fx.ring(this.hand[0], this.hand[1], '#ffe9a8', 46); SFX.play('charged'); }
        this.activeF = -1;
        if (this.grounded) this.vx = approach(this.vx, 0, PH.groundFriction);
        else { this.airDrift(pad, 0.5); this.vxSet = true; if (this.vy > 1.5) this.vy = 1.5; } // 空中でためている間はゆっくり落ちる
        return;
      }
      this.chargeDone = true; this.charging = false;
    }
    // 押し続けると続く技
    if (m.loop && f === m.loop.to && pad.held.B && this.loops < m.loop.max) {
      this.loops++; f = this.mf = m.loop.from; this.hitRec.clear();
    }
    // 弱1 → 弱2 → 弱3
    if (m.next && this.grounded && f >= m.next.f[0] && f <= m.next.f[1] && pad.take('A')) {
      this.startMove(m.next.key, pad);
      this.updateMove(pad);
      return;
    }
    // スキの終わり（ここから先は次の行動で中断できる）
    if (m.iasa !== undefined && f >= m.iasa) {
      if (this.grounded) {
        if (this.groundAct(pad)) return;
        if (Math.abs(pad.mx) > 0.3) { this.endMove(); this.groundMove(pad); return; }
      } else if (this.airAct(pad)) return;
    }
    this.activeF = f;
    if (m.hits && f === m.firstHit && !m.hits[0].cgrab && !m.hits[0].grab) {
      const p = Math.max(...m.hits.map(h => h.dmg || 0));
      if (p >= 5) SFX.play('swing', clamp((p * this.chargeMul - 5) / 15, 0, 1));
    }
    // 崖攻撃：崖から上がる動き
    if (m.key === 'ledgeAttack') {
      const t = clamp(f / 15, 0, 1), side = -this.facing;
      const tx = side * ST.halfWidth - side * 26;
      this.x = lerp(this.ledgeFrom[0], tx, easeOut(clamp((t - 0.5) * 2, 0, 1)));
      this.y = lerp(this.ledgeFrom[1], 0, easeOut(clamp(t * 1.6, 0, 1)));
      if (f >= 15) { this.y = 0; this.grounded = true; this.vy = 0; }
      if (f === 2) this.freeLedge();
    }
    if (m.events) for (const ev of m.events) {
      const on = Array.isArray(ev.f) ? f >= ev.f[0] && f <= ev.f[1] : f === ev.f;
      if (on) this.doEvent(ev);
    }
    // 投げ
    if (m.held && this.grabbed) this.placeHeld(m, f);
    if (m.release !== undefined && f === m.release && this.grabbed) {
      const t = this.grabbed;
      this.grabbed = null; t.grabbedBy = null;
      t.heldR = 0;
      this.b.applyHit(this, t, m.hit, this.facing, t.x, t.y - 50, false);
    }
    if (this.grounded) { if (!this.vxSet) this.vx = approach(this.vx, 0, PH.groundFriction); }
    else if (!this.vxSet) this.airDrift(pad, 0.85);
    this.mf++;
  }
  doEvent(ev) {
    if (ev.turn) this.facing *= -1;
    if (ev.vx !== undefined) { this.vx = ev.vx * this.facing; this.vxSet = true; }
    if (ev.vy !== undefined) { this.vy = -ev.vy; if (ev.vy > 0) { this.grounded = false; this.ff = false; } }
    if (ev.proj) this.b.spawnProjectile(this, ev);
    if (ev.quake) {
      for (const d of [-1, 1]) this.b.fx.dust(this.x + d * 45, 0, 1.7);
      this.b.shake = Math.max(this.b.shake, 6);
      SFX.play('quake');
    }
  }
  // ためている間の技のコマ（ポーズと重力の計算に使う）
  holdFrame() {
    const m = this.move;
    if (this.activeF >= 0) return this.activeF;
    return m.charge ? m.charge.f : m.holdShot ? m.holdShot.f : 0;
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
  /* ---------- ダウン・起き上がり ---------- */
  knockDown() {
    this.state = 'down'; this.downT = 0; this.grounded = true; this.y = 0; this.vy = 0; this.kby = 0;
    this.kbx *= 0.5; this.move = null; this.ff = false;
    this.b.fx.dust(this.x, 0, 1.3);
  }
  getUp() { this.state = 'getup'; this.timer = 22; this.invuln = Math.max(this.invuln, 22); }
  /* ---------- 崖 ---------- */
  tryLedge() {
    if (this.ledgeCd > 0 || this.grounded) return;
    const upB = this.state === 'move' && this.move.helpless;
    if (!(this.state === 'air' || this.state === 'helpless' || upB)) return;
    if (this.vy + this.kby < -1 && !upB) return;
    for (const side of [-1, 1]) {
      const lx = side * ST.halfWidth, dx = (this.x - lx) * side;
      if (dx < -10 || dx > 46) continue;
      if (this.y < 22 || this.y > 125) continue;
      const idx = side < 0 ? 0 : 1;
      if (this.b.ledges[idx] && this.b.ledges[idx] !== this) continue;
      this.grabLedge(side, idx);
      return;
    }
  }
  grabLedge(side, idx) {
    this.b.ledges[idx] = this; this.ledge = idx;
    this.state = 'ledge'; this.timer = PH.ledgeHangMax; this.ledgeT = 0; this.ledgeNeutral = false;
    this.facing = -side; this.x = side * ST.halfWidth + side * 13; this.y = 98;
    this.vx = this.vy = this.kbx = this.kby = 0; this.ff = false; this.shCheck = false;
    this.jumps = this.s.airJumps; this.usedOnce = {};
    this.move = null; this.charging = false; this.chargeMul = 1; this.activeF = -1;
    this.ledgeGrabs++;
    this.invuln = Math.max(this.invuln, Math.max(8, PH.ledgeInvuln - (this.ledgeGrabs - 1) * 14));
    this.b.fx.dust(side * ST.halfWidth, 0, 0.5);
  }
  freeLedge() { if (this.ledge >= 0 && this.b.ledges[this.ledge] === this) this.b.ledges[this.ledge] = null; this.ledge = -1; }
  updateLedge(pad) {
    this.ledgeT++; this.timer--;
    const rel = pad.mx * this.facing;
    if (Math.hypot(pad.mx, pad.my) < 0.3) this.ledgeNeutral = true;
    const free = this.ledgeNeutral || this.ledgeT > 40;
    if (this.ledgeT >= 6) {
      if (pad.take('A') || pad.take('B')) { this.startMove('ledgeAttack', pad); return; }
      if (pad.take('jump')) {
        // 崖の上まで体を引き上げてから跳ぶ
        this.freeLedge(); this.state = 'air'; this.y = -4; this.vy = -this.s.jump * 0.95; this.vx = this.facing * 2.6;
        this.invuln = Math.max(this.invuln, 6); this.flipT = 0; this.ledgeCd = 20;
        return;
      }
      if (free && (rel > 0.5 || pad.my > 0.5)) { this.state = 'ledgeClimb'; this.timer = 0; this.climbFrom = [this.x, this.y]; return; }
      if (free && (rel < -0.5 || pad.my < -0.5)) { this.dropLedge(); return; }
    }
    if (this.timer <= 0) this.dropLedge();
  }
  dropLedge() {
    this.freeLedge(); this.state = 'air'; this.vy = 1; this.x -= this.facing * 6; this.ledgeCd = PH.ledgeRegrab;
  }
  updateClimb() {
    this.timer++;
    const T = 24, t = this.timer;
    if (t < 18) this.invuln = Math.max(this.invuln, 2);
    const side = -this.facing;
    const tx = side * ST.halfWidth - side * 24;
    this.x = lerp(this.climbFrom[0], tx, easeOut(clamp((t - 8) / 14, 0, 1)));
    this.y = lerp(this.climbFrom[1], 0, easeOut(clamp(t / 12, 0, 1)));
    if (t === 3) this.freeLedge();
    if (t >= T) { this.y = 0; this.grounded = true; this.state = 'idle'; this.ledgeGrabs = 0; }
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
    t.heldR = a.length > 3 ? lerp(a[3], b[3], ease(u)) : 0;
    t.facing = m.faceAway ? this.facing : -this.facing;
    if (t.y > -2 && Math.abs(t.x) <= ST.halfWidth) { t.y = 0; t.grounded = true; } else t.grounded = false;
  }
  releaseGrab(push) {
    const t = this.grabbed;
    this.grabbed = null;
    if (this.state === 'holding') this.state = 'idle';
    if (t && t.grabbedBy === this) {
      t.grabbedBy = null; t.heldR = 0;
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
    SFX.play('meteor');
  }
  /* ---------- 物理 ---------- */
  physics() {
    const s = this.s;
    let cap = this.ff ? s.fall * PH.fastFallMul : s.fall;
    if (!this.grounded) {
      let g = s.gravity;
      if (this.state === 'move') {
        const m = this.move, f = this.holdFrame();
        if (m.gravityFrames && f >= m.gravityFrames[0] && f <= m.gravityFrames[1]) g = 0;
        else if (m.gravityMul !== undefined) g *= m.gravityMul;
      }
      if (this.ff) this.vy = Math.max(this.vy, cap);
      if (this.vy < cap) this.vy = Math.min(this.vy + g, cap);
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
        if (['idle', 'walk', 'run', 'land', 'shield', 'shieldOff', 'shieldstun', 'squat', 'down', 'getup', 'tech'].includes(this.state)) this.state = 'air';
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
    // 横からぶつかった：上面のすぐ下なら上に乗る（段差の救済）
    const stun = this.state === 'hitstun' || this.state === 'tumble';
    if (!stun && this.y - T < 18 && down) { this.x = clamp(this.x, L, R); this.land(); return; }
    if (this.px <= L || this.x < 0) {
      this.x = L - hw; if (this.kbx > 0) this.kbx = -this.kbx * 0.5; if (this.vx > 0) this.vx = 0;
    } else {
      this.x = R + hw; if (this.kbx < 0) this.kbx = -this.kbx * 0.5; if (this.vx < 0) this.vx = 0;
    }
  }
  land() {
    const speedDown = this.vy + this.kby;
    this.y = 0;
    const stun = this.state === 'tumble' || (this.state === 'hitstun' && this.hurtKind !== 'hurtLight');
    if (stun && this.techT > 0) { // 受け身
      this.grounded = true; this.vy = this.kby = 0; this.kbx = 0; this.vx = 0;
      this.state = 'tech'; this.timer = 14; this.invuln = Math.max(this.invuln, 18); this.techT = 0;
      this.jumps = this.s.airJumps; this.usedOnce = {}; this.ledgeGrabs = 0;
      this.b.fx.ring(this.x, -10, '#ffffff', 40);
      SFX.play('tech');
      return;
    }
    if (this.state === 'tumble' && this.kby > 9) { // 強く地面にたたきつけられたらバウンド
      this.kby = -this.kby * 0.5; this.vy = 0;
      this.b.fx.dust(this.x, 0, 1.4);
      return;
    }
    this.grounded = true; this.jumps = this.s.airJumps; this.usedOnce = {}; this.ledgeGrabs = 0;
    this.vy = 0; this.kby = 0; this.ff = false; this.shCheck = false;
    this.landSquash = 6;
    switch (this.state) {
      case 'air': this.state = 'land'; this.timer = landLagT(4); break;
      case 'helpless': this.state = 'land'; this.timer = landLagT(20); break;
      case 'move':
        if (this.moveAir) {
          const m = this.move;
          if (m.noLandCancel) { this.moveAir = false; break; }
          if (m.landSpawn) { for (const ev of m.landSpawn) this.b.spawnProjectile(this, ev); SFX.play('quake'); this.b.shake = Math.max(this.b.shake, 5); }
          let lag = m.landLag !== undefined ? m.landLag : 6;
          // 本家と同じ「着地キャンセル」：攻撃の出る前・出し終わってしばらく後なら着地のスキが少ない
          if (m.hits && m.hits.length && !m.helpless && (this.activeF < m.firstHit - 1 || this.activeF > m.lastHit + 7)) lag = 4;
          if (m.helpless) lag = m.landLag || 20;
          this.move = null; this.charging = false; this.chargeMul = 1; this.activeF = -1;
          this.state = 'land'; this.timer = landLagT(lag);
        }
        break;
      case 'tumble': this.knockDown(); break;
      default: break;
    }
    if (speedDown > 6) this.b.fx.dust(this.x, 0, 0.8);
  }
  respawn() {
    this.spawn(this.slot === 0 ? -150 : 150, -380, this.slot === 0 ? 1 : -1);
    this.invuln = D.rules.respawnInvincible;
  }
  /* ---------- ポーズ計算（ばねのようになめらかに追従） ---------- */
  computePose() {
    let target, sp = SPRING.loco;
    const P0 = POSES;
    switch (this.state) {
      case 'move': {
        target = this.movePose(this.move, this.holdFrame());
        sp = SPRING.move;
        break;
      }
      case 'idle':
        target = lerpPose(P0.idle, P0.idle2, (Math.sin(this.anim * 0.07) + 1) / 2);
        if (this.landSquash > 0) target = lerpPose(target, P0.crouch, this.landSquash / 8);
        sp = SPRING.soft; break;
      case 'walk': case 'run': {
        const run = this.state === 'run';
        this.walkPhase += Math.abs(this.vx) * (run ? 0.052 : 0.075);
        const ph = this.walkPhase / (Math.PI / 2), i = Math.floor(ph) % 4, u = ph - Math.floor(ph);
        const cyc = run ? [P0.run1, P0.run2, P0.run3, P0.run4] : [P0.walk1, P0.walk2, P0.walk3, P0.walk4];
        target = catmull(cyc[(i + 3) % 4], cyc[i], cyc[(i + 1) % 4], cyc[(i + 2) % 4], u);
        if (run && this.stateT < 6) target = lerpPose(P0.dashStart, target, this.stateT / 6);
        if (this.skidT > 0) target = lerpPose(target, P0.skid, 0.7);
        break;
      }
      case 'squat': case 'land': case 'shieldOff': case 'tech': target = P0.crouch; sp = SPRING.snap; break;
      case 'getup': target = this.timer > 12 ? P0.crouch : P0.idle; sp = SPRING.loco; break;
      case 'air': {
        const vy = this.vy;
        if (this.ff) target = P0.fastfall;
        else if (vy < -8) target = lerpPose(P0.takeoff, P0.jump, clamp((vy + 14) / 6, 0, 1));
        else if (vy < 2) target = lerpPose(P0.jump, P0.tuck, clamp((vy + 8) / 10, 0, 1) * 0.6);
        else target = lerpPose(P0.tuck, P0.fall, clamp((vy - 0) / 6, 0, 1));
        target = copyPose(target);
        if (this.flipT < 24) { target = copyPose(lerpPose(target, P0.tuck, Math.sin(Math.PI * this.flipT / 24) * 0.9)); target.r = 360 * ease(this.flipT / 24); }
        sp = SPRING.air; break;
      }
      case 'helpless': target = copyPose(P0.helpless); target.t = Math.sin(this.anim * 0.15) * 8; sp = SPRING.air; break;
      case 'shield': case 'shieldstun': target = P0.shield; sp = SPRING.snap; break;
      case 'hitstun': target = P0[this.hurtKind] || P0.hurt; sp = SPRING.hurt; break;
      case 'tumble': target = copyPose(P0.tumble); target.r = this.disp.r - 20; sp = SPRING.hurt; break;
      case 'down': target = P0.down; sp = SPRING.hurt; break;
      case 'dizzy': target = copyPose(P0.hurt); target.t = Math.sin(this.anim * 0.1) * 15; sp = SPRING.soft; break;
      case 'holding': target = P0.hold; break;
      case 'grabbed':
        target = copyPose(P0.grabbed); target.r = this.heldR || 0; sp = SPRING.snap;
        if (this.grounded && Math.abs(Math.sin(target.r * DEG)) > 0.7) target.pa = 1; // 寝かされている
        break;
      case 'ledge': target = copyPose(P0.ledgeHang); target.fl1 += Math.sin(this.anim * 0.05) * 6; sp = SPRING.soft; break;
      case 'ledgeClimb': target = this.timer < 12 ? P0.ledgeClimb : P0.crouch; sp = SPRING.loco; break;
      default: target = P0.idle;
    }
    // 回転の数値が大きく飛ぶとき（360度回った後など）は、近い向きにそろえる
    for (const key of ['r', 'yw', 'wr']) {
      const dr = target[key] - this.disp[key];
      if (Math.abs(dr) > 180) { const n = Math.round(dr / 360) * 360; this.disp[key] += n; this.prevDisp[key] += n; }
    }
    const k = sp[0], dmp = sp[1];
    for (let i = 0; i < PK.length; i++) {
      const key = PK[i];
      const v = this.dvel[key] * dmp + (target[key] - this.disp[key]) * k;
      this.dvel[key] = v; this.disp[key] += v;
    }
    // 手の位置（武器と軌跡の描画用）
    const pts = solvePose(this.disp, this.look, this.grounded, this.state === 'down');
    this.hand = [this.x + pts.fH[0] * this.facing, this.y - pts.fH[1]];
    this.updateWhipTip();
    this.updateTrail(pts);
  }
  movePose(m, f) {
    const k = m.poses;
    const get = e => (e[2] ? Object.assign(copyPose(POSES[e[1]]), e[2]) : POSES[e[1]]);
    if (!k || !k.length) return POSES.idle;
    if (f <= k[0][0]) return get(k[0]);
    for (let i = 0; i < k.length - 1; i++) {
      if (f >= k[i][0] && f < k[i + 1][0]) {
        const u = (f - k[i][0]) / (k[i + 1][0] - k[i][0]);
        return catmull(get(k[Math.max(0, i - 1)]), get(k[i]), get(k[i + 1]), get(k[Math.min(k.length - 1, i + 2)]), u);
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
  // 攻撃している手足の軌跡（どこを攻撃したかわかるように）
  updateTrail(pts) {
    const m = this.state === 'move' ? this.move : null;
    if (!m || !m.hits || !m.hits.length || m.hits[0].grab || this.activeF < 0) { if (this.trail.length) this.trail.shift(); return; }
    if (!this.trailJoint) {
      const h0 = m.hits[0];
      const pp = solvePose(this.movePose(m, h0.f[0]), this.look, this.grounded, false);
      let best = 'fH', bd = Infinity;
      for (const j of ['fH', 'bH', 'fF', 'bF']) {
        const q = pp[j], d = Math.hypot(q[0] - h0.x, q[1] - h0.y);
        if (d < bd) { bd = d; best = j; }
      }
      this.trailJoint = (this.c.weapon === 'whip' && best === 'fH') ? 'tip' : best;
    }
    const f = this.activeF;
    if (f >= m.firstHit - 3 && f <= m.lastHit + 2) {
      let p;
      if (this.trailJoint === 'tip') p = this.tip.slice();
      else {
        const q = pts[this.trailJoint];
        let ex = 0, ey = 0;
        if (this.trailJoint === 'fH' && (this.c.weapon === 'bow' || this.c.weapon === 'mirror')) {
          const e = pts.fE, dx = q[0] - e[0], dy = q[1] - e[1], l = Math.hypot(dx, dy) || 1;
          ex = dx / l * 14; ey = dy / l * 14;
        }
        p = [this.x + (q[0] + ex) * this.facing, this.y - (q[1] + ey)];
      }
      this.trail.push(p);
      if (this.trail.length > 7) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
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
  meteor(x, y) { this.add({ k: 'meteor', x, y, life: 26 }); this.ring(x, y, '#ffb13b', 70); }
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
  if (f.state === 'down') { ax = f.x - 36; ay = f.y - 8; bx = f.x + 36; by = f.y - 8; rr = 10; }
  if (f.state === 'ledge') { ay = f.y - 30; by = f.y - 105; }
  const vx = bx - ax, vy = by - ay;
  const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  const dx = x - (ax + vx * t), dy = y - (ay + vy * t);
  return dx * dx + dy * dy <= (r + rr) * (r + rr);
}

/* =====================================================================
   CPU
   ===================================================================== */
class CpuBrain {
  constructor(me, battle, level) {
    this.me = me; this.b = battle; this.pad = me.pad;
    this.cfg = D.cpu.levels[level] || D.cpu.levels[D.cpu.default];
    this.style = (me.c.cpu && me.c.cpu.style) || 'mid';
    this.range = (me.c.cpu && me.c.cpu.range) || 80;
    this.wait = 30; this.plan = null; this.techDecided = false; this.ledgeWait = -1;
  }
  step() {
    const me = this.me, p = this.pad, op = this.b.other(me), cfg = this.cfg;
    p.held.A = p.held.B = p.held.C = p.held.grab = false;
    if (!me.alive || this.b.over) { p.mx = p.my = 0; p.held.shield = p.held.jump = false; return; }
    if (this.plan) {
      const pl = this.plan;
      if (pl.type === 'shield') p.held.shield = true;
      if (pl.type === 'holdC') p.held.C = true;
      if (pl.type === 'holdB') {
        p.held.B = true;
        if (pl.t > 2 && Math.abs(op.x - me.x) < 110 && me.charging) pl.t = 1; // 近づかれたら早めに撃つ
      }
      if (pl.type === 'fullhop') p.held.jump = true;
      if (--pl.t <= 0) { this.plan = null; p.held.shield = false; p.held.jump = false; }
      if (pl.type !== 'fullhop') return;
    }
    p.held.shield = false;
    // 受け身
    if (me.state === 'tumble') {
      if (!this.techDecided && me.y > -90 && me.vy + me.kby > 0) {
        this.techDecided = true;
        if (rnd() < cfg.techChance) p.press('shield');
      }
    } else this.techDecided = false;
    // ダウン中
    if (me.state === 'down') {
      if (me.downT >= PH.downMinTime + ((rnd() * 20) | 0)) {
        if (Math.abs(op.x - me.x) < 70 && rnd() < 0.5) p.press('A'); else p.press('jump');
      }
      return;
    }
    // 崖
    if (me.state === 'ledge') {
      p.mx = 0; p.my = 0;
      if (this.ledgeWait < 0) this.ledgeWait = 8 + ((rnd() * (20 + cfg.reaction * 2)) | 0);
      if (--this.ledgeWait <= 0) {
        this.ledgeWait = -1;
        const r = rnd();
        if (r < 0.4) p.mx = me.facing;
        else if (r < 0.65) p.press('jump');
        else p.press('A');
      }
      return;
    }
    this.ledgeWait = -1;
    if (this.recover()) return;
    // 相手がのけぞっている間は、すぐ追撃を考える（強いほど上手）
    const opStun = op.state === 'hitstun' || op.state === 'tumble';
    if (opStun && this.wait > 1 && rnd() < cfg.combo) this.wait = 1;
    if (this.wait > 0) { this.wait--; return; }
    this.wait = cfg.reaction + ((rnd() * 5) | 0);
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
      if (me.y > 10 || (me.vy > 2 && distEdge > 200 && me.y > -220)) { p.press('jump'); return true; }
      if (canSide && distEdge > 280 && me.vy > 0) { p.press('B'); return true; }
      return true;
    }
    if (canSide && distEdge > 190 && me.y < 80) { p.press('B'); return true; }
    if (me.vy > -2 && me.y > 40 - Math.min(distEdge, 300) * 0.45) {
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
      else if (r < 0.25) p.my = -1;
      else p.mx = me.facing * toEdge;
      this.wait = 2;
      return;
    }
    if (rnd() < cfg.mistake) return;
    const opOff = op.x < -ST.halfWidth || op.x > ST.halfWidth || op.state === 'ledge';
    const nearEdge = Math.abs(me.x) > ST.halfWidth - 70;
    const opAttacking = op.state === 'move' && op.move.hits && op.activeF < (op.move.hits[0].f[0] + 2);
    // 守り
    if (me.grounded && opAttacking && adx < 150 && Math.abs(dy) < 100) {
      if (this.style === 'counter' && rnd() < 0.45) { p.my = -1; p.press('B'); return; }
      if (rnd() < cfg.shieldChance) { this.plan = { type: 'shield', t: 12 + ((rnd() * 14) | 0) }; return; }
    }
    // 飛び道具を跳ね返す
    const reflector = this.style === 'counter' || (me.c.cpu && me.c.cpu.reflect);
    if (reflector) {
      for (const pr of this.b.projectiles) {
        if (pr.owner !== me && !pr.noHit && pr.type !== 'shock' && Math.abs(pr.x - me.x) < 180 && Math.abs(pr.y - (me.y - 50)) < 80 && sign(pr.vx) === -sign(pr.x - me.x)) {
          if (this.face(sign(pr.x - me.x))) { if (this.style !== 'counter') p.my = -1; p.press('B'); }
          return;
        }
      }
    }
    // 必殺技のつかみ（拳闘士）：シールドしている相手に強い
    const cgrab = me.c.cpu && me.c.cpu.cgrab;
    if (cgrab && me.grounded && op.state === 'shield' && adx < 58 && rnd() < 0.55) { if (this.face(dir)) { p.my = -1; p.press('B'); } return; }
    if (me.grounded && op.state === 'shield' && adx < 70) { if (this.face(dir)) p.press('grab'); return; }
    // 相手がダウン中：近づいて攻撃
    if (op.state === 'down' && me.grounded) {
      if (adx > 50) { p.mx = dir; return; }
      if (this.face(dir)) { if (op.downT > PH.downMinTime - 4) { p.cdir = { x: dir, y: 0 }; p.press('C'); } else { p.my = -1; p.press('A'); } }
      return;
    }
    // 相手が場外：崖のそばで待つ
    if (opOff) {
      if (nearEdge && sign(me.x) === sign(op.x)) {
        if (adx < 120 && Math.abs(dy) < 120) { p.mx = dir; p.press('A'); }
        else if (op.state === 'ledge' && adx < 90 && rnd() < 0.3) { if (this.face(dir)) { p.my = -1; p.press('A'); } }
        return;
      }
      p.mx = sign(op.x) * 0.6; return;
    }
    // 遠距離タイプ
    if (this.style === 'zone') {
      if (adx < 120 && me.grounded) {
        const r = rnd();
        if (r < 0.25) { if (this.face(dir)) p.press('A'); }
        else if (r < 0.45) { p.mx = dir; p.press('A'); }
        else if (r < 0.57) { if (this.face(dir)) { p.my = -1; p.press('A'); } }
        else if (r < 0.72) { if (this.face(dir)) p.press('grab'); }
        else if (r < 0.82 && op.percent > 70) { p.cdir = { x: dir, y: 0 }; p.press('C'); }
        else { p.mx = -dir; if (rnd() < 0.4) p.press('jump'); }
        return;
      }
      if (Math.abs(dy) < 130 && adx < 750) {
        if (!this.face(dir)) return;
        const hs = me.moves.nspecial && me.moves.nspecial.holdShot;
        if (hs && rnd() < 0.75) {
          // ため撃ち：遠いほど長くためる
          const hold = adx > 320 ? (rnd() < 0.5 ? hs.max + 2 : (rnd() * hs.max) | 0) : (rnd() * 25) | 0;
          p.press('B'); this.plan = { type: 'holdB', t: hold + hs.f + 2 };
        } else { p.mx = dir; p.press('B'); }
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
      if (dy < -90 && me.grounded && rnd() < 0.45) { p.press('jump'); if (dy < -160) this.plan = { type: 'fullhop', t: 8 }; }
      if (!me.grounded && dy < -60 && me.jumps > 0 && rnd() < 0.3) p.press('jump');
      if (me.grounded && Math.abs(dy) < 60) {
        if (this.style === 'mid' && adx < 260 && adx > 120 && rnd() < 0.3) { p.mx = dir; p.press('B'); }
        if (this.style === 'rush' && !cgrab && adx > 200 && adx < 420 && rnd() < 0.12) { p.mx = dir; p.press('B'); }
        if (cgrab && adx > 70 && adx < 190 && rnd() < 0.2) { p.mx = dir; p.press('B'); }
      }
      return;
    }
    if (!me.grounded) {
      if (dy < -40) p.my = 1; else if (dy > 50) p.my = -1; else p.mx = dir;
      p.press('A');
      return;
    }
    if (dy < -70) {
      const r = rnd();
      if (r < 0.35) { p.my = 1; p.press('A'); }
      else if (r < 0.6 && op.state !== 'hitstun') { p.cdir = { x: 0, y: 1 }; p.press('C'); }
      else { p.press('jump'); if (dy < -130) this.plan = { type: 'fullhop', t: 8 }; this.wait = 6; }
      return;
    }
    const r = rnd();
    if (op.percent > 85 && r < 0.35 * cfg.aggression + 0.1) {
      p.cdir = { x: dir, y: 0 }; p.press('C');
      this.plan = { type: 'holdC', t: (rnd() * 20) | 0 };
      return;
    }
    if (r < 0.18) { if (this.face(dir)) p.press('grab'); }
    else if (r < 0.4) { if (this.face(dir)) { p.press('A'); this.plan = null; } }
    else if (r < 0.55) { p.mx = dir; p.press('A'); }
    else if (r < 0.66) { if (this.face(dir)) { p.my = -1; p.press('A'); } }
    else if (r < 0.76) { if (this.face(dir)) { p.my = 1; p.press('A'); } }
    else if (r < 0.86) { p.mx = dir; p.press('B'); }
    else if (r < 0.93) { p.press('jump'); this.wait = 5; }
    else { p.cdir = { x: 0, y: -1 }; p.press('C'); }
  }
}

/* =====================================================================
   対戦（1試合分の管理）
   ===================================================================== */
class Battle {
  constructor(p1Def, cpuDef, level) {
    this.fx = new FX();
    this.ledges = [null, null];
    this.f = [new Fighter(p1Def, 0, this), new Fighter(cpuDef, 1, this)];
    this.cpu = new CpuBrain(this.f[1], this, level);
    this.projectiles = [];
    this.frame = 0; this.shake = 0; this.flash = 0;
    this.cine = null; this.cineCd = 0; this.slowPhase = 0;
    this.over = false; this.overT = 0; this.winner = null;
    this.cam = { x: 0, y: -150, z: 1 }; this.prevCam = { ...this.cam };
    this.camInit = false;
  }
  other(f) { return this.f[0] === f ? this.f[1] : this.f[0]; }
  step() {
    if (this.cineCd > 0) this.cineCd--;
    // 強烈な一撃の演出中：一瞬止めて、そのあとスローにする
    if (this.cine) {
      const c = this.cine; c.t++;
      if (c.t <= c.freeze) { this.slowPhase = 1; return; }
      if (c.t > c.freeze + c.slow) this.cine = null;
      else if ((c.t - c.freeze) % 2 === 0) { this.slowPhase = 1; return; }
    }
    this.slowPhase = 0;
    this.frame++;
    this.prevCam = { ...this.cam };
    this.cpu.step();
    for (const f of this.f) f.update();
    for (const f of this.f) {
      if (f.state === 'holding' && f.grabbed && f.hitlag <= 0) {
        const t = f.grabbed;
        t.x = f.x + f.facing * 36; t.y = f.y; t.grounded = f.grounded; t.facing = -f.facing;
      }
      if (f.ledge >= 0 && f.state !== 'ledge' && f.state !== 'ledgeClimb' && !(f.state === 'move' && f.move && f.move.key === 'ledgeAttack')) f.freeLedge();
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
    let dmg = (ev.dmg !== undefined ? ev.dmg : base.dmg) * (owner.s.dmgMul || 1) * cm;
    let speed = (ev.speed !== undefined ? ev.speed : base.speed) * (1 + (cm - 1) * 0.35);
    let bkb = ev.bkb !== undefined ? ev.bkb : base.bkb, kbg = ev.kbg !== undefined ? ev.kbg : base.kbg;
    let power = 0;
    // ため撃ち：ためた長さで、ためなし(min)〜最大ため(max2)の間の強さになる
    const hs = ev.shot && owner.move && owner.move.holdShot;
    if (hs) {
      power = owner.shotT || 0;
      const L = k => lerp(hs.min[k], hs.max2[k], power);
      dmg = L('dmg') * (owner.s.dmgMul || 1); speed = L('speed'); bkb = L('bkb'); kbg = L('kbg');
    }
    const o = { owner, type: base.type, r: base.r, dmg, life: base.life,
      kang: ev.kang !== undefined ? ev.kang : base.ang, bkb, kbg, grav: base.grav || 0, decel: base.decel || 0,
      noHit: !!ev.noHit, power, big: power >= 1 };
    if (hs) o.grav = (base.grav || 0) * (1 - power * 0.8);
    if (base.type === 'arrow') SFX.play('shoot', power);
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
        if (hb.grab && (!d.grounded || d.state === 'down')) continue;
        if (hb.cgrab && (d.state === 'down' || d.grabbedBy || a.grabbed)) continue;
        const wx = a.x + hb.x * a.facing, wy = a.y - hb.y;
        if (capsuleHit(d, wx, wy, hb.r)) { hits.push({ a, d, hb, wx, wy }); break; }
      }
    }
    // 飛び道具
    for (const p of this.projectiles) {
      if (p.dead || p.noHit) continue;
      for (const d of this.f) {
        if (d === p.owner || !d.alive) continue;
        const rw = d.activeWindow('reflect');
        if (rw && p.type !== 'shock') {
          const rx = d.x + rw.x * d.facing, ry = d.y - rw.y;
          if (Math.hypot(p.x - rx, p.y - ry) < rw.r + p.r) {
            p.owner = d; p.dmg *= rw.mul; p.hitRec.clear();
            if (p.type === 'disc') { p.back = false; p.vx = d.facing * 13 * 1.2; p.vy = 0; p.life = Math.max(p.life, 80); }
            else { p.vx = -p.vx * 1.15; p.vy = -p.vy * 0.6; if (sign(p.vx) !== d.facing) p.vx = -p.vx; p.life = 75; }
            this.fx.ring(p.x, p.y, '#bfe9ff', 40);
            SFX.play('reflect');
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
      if (h.hb.grab) { if (h.a.state === 'move') this.startGrab(h.a, h.d); continue; }
      if (h.hb.cgrab) { if (h.a.state === 'move') this.startCmdGrab(h.a, h.d, h.hb.cgrab); continue; }
      this.applyHit(h.a, h.d, h.hb, h.a.facing, h.wx, h.wy, false);
    }
  }
  startGrab(a, d) {
    if (d.grabbed) d.releaseGrab();
    d.freeLedge();
    a.state = 'holding'; a.move = null; a.activeF = -1; a.holdT = 0;
    a.timer = PH.grabHoldBase + d.percent * 0.5;
    a.grabbed = d; d.grabbedBy = a;
    d.state = 'grabbed'; d.move = null; d.vx = d.vy = d.kbx = d.kby = 0; d.charging = false;
    d.x = a.x + a.facing * 36; d.y = a.y; d.facing = -a.facing;
    a.hitlag = d.hitlag = 4;
    SFX.play('grab');
  }
  // 必殺技のつかみ（シールドでは防げない）：つかんだら専用の動きに切りかわる
  startCmdGrab(a, d, key) {
    if (!a.moves[key]) return;
    if (d.grabbed) d.releaseGrab();
    d.freeLedge();
    a.startMove(key);
    a.grabbed = d; d.grabbedBy = a;
    d.state = 'grabbed'; d.move = null; d.vx = d.vy = d.kbx = d.kby = 0; d.charging = false; d.chargeMul = 1; d.activeF = -1; d.heldR = 0;
    a.placeHeld(a.move, 0);
    a.hitlag = d.hitlag = 6;
    this.fx.ring(d.x, d.y - 50, '#ffd34d', 50);
    SFX.play('grab');
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
      SFX.play('reflect');
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
      SFX.play('shield');
      if (proj) proj.dead = true;
      return;
    }
    // アーマー（ダメージは受けるが、ひるまない）
    if (d.activeWindow('armorW')) {
      d.percent = Math.min(999, d.percent + dmg);
      const hl = Math.min(14, Math.floor(dmg * PH.hitlagMul + PH.hitlagBase));
      d.hitlag = hl; if (!isProj) a.hitlag = hl;
      d.armorFlash = 10;
      this.fx.spark(wx, wy, 30, '#ffb347');
      SFX.play('armor');
      return;
    }
    // ムチ引き寄せ
    if (hb.pull) {
      d.percent = Math.min(999, d.percent + dmg);
      if (d.grabbed) d.releaseGrab();
      d.freeLedge();
      d.move = null; d.charging = false; d.chargeMul = 1; d.activeF = -1;
      const dist = Math.max(0, Math.abs(d.x - a.x) - 45);
      const v = Math.sqrt(2 * PH.kbDecay * dist);
      d.kbx = -sign(d.x - a.x) * v; d.kby = d.grounded ? 0 : -2; d.vx = d.vy = 0;
      d.state = 'hitstun'; d.hurtKind = 'hurt'; d.timer = 26; d.hitFlash = 4;
      d.hitlag = a.hitlag = 5;
      this.fx.spark(wx, wy, 20, '#ffe9a8');
      return;
    }
    d.percent = Math.min(999, d.percent + dmg);
    let kb = hb.fkb !== undefined ? hb.fkb : calcKB(d.percent, dmg, d.s.weight, hb.bkb, hb.kbg) * (a.s.kbMul || 1);
    let ang = hb.ang;
    if (ang === 361) ang = d.grounded && kb < 60 ? 0 : 40;
    ang = ((ang % 360) + 360) % 360;
    // メテオ（空中の相手を真下にたたき落とす）
    const isMeteor = !d.grounded && ang >= 235 && ang <= 305;
    if (isMeteor) kb = Math.max(kb, PH.meteorMinKb);
    const meteorGround = d.grounded && ang > 180 && ang < 360;
    if (meteorGround) { ang = 360 - ang; kb *= 0.8; } // 地上でメテオ → バウンド
    const wasGrounded = d.grounded;
    if (d.grabbed) d.releaseGrab();
    if (d.grabbedBy) { const g = d.grabbedBy; g.grabbed = null; d.grabbedBy = null; if (g.state === 'holding') g.state = 'idle'; }
    d.freeLedge();
    const speed = kb * PH.launchScale;
    d.kbx = Math.cos(ang * DEG) * speed * dir;
    d.kby = -Math.sin(ang * DEG) * speed;
    d.vx = 0; d.vy = 0; d.ff = false; d.shCheck = false;
    if (d.grounded && d.kby >= 0) d.kby = 0;
    if (d.kby < -0.5) d.grounded = false;
    d.move = null; d.charging = false; d.chargeMul = 1; d.activeF = -1;
    d.usedOnce = {};
    d.facing = isProj ? -dir : sign(a.x - d.x) || d.facing; // くらった側は攻撃の方を向く
    d.hitFlash = 4; d.heldR = 0;
    let hl = Math.min(22, Math.floor(dmg * PH.hitlagMul + PH.hitlagBase) + (kb > 150 ? 4 : 0));
    if (isMeteor) hl = Math.min(26, hl + 5);
    d.hitlag = hl; d.shakeT = hl;
    if (!isProj) a.hitlag = hl;
    // 反応の種類
    if (kb > PH.tumbleKb) {
      d.state = 'tumble'; d.timer = Math.floor(kb * PH.hitstunMul);
    } else if ((hb.react === 'down' || (meteorGround && kb > 45)) && wasGrounded) {
      d.knockDown(); d.kbx = Math.cos(ang * DEG) * speed * dir * 0.6;
    } else {
      d.state = 'hitstun';
      d.timer = Math.max(hb.react === 'light' ? 8 : 10, Math.floor(kb * PH.hitstunMul));
      d.hurtKind = hb.react === 'light' ? 'hurtLight' : (ang > 60 && ang < 120 ? 'hurtHigh' : 'hurt');
    }
    this.fx.spark(wx, wy, kb, kb > 150 ? '#ffd34d' : '#ffffff');
    if (kb > 110) this.shake = Math.max(this.shake, Math.min(14, (kb - 100) * 0.07));
    if (kb > 170) this.flash = Math.max(this.flash, 3);
    SFX.play(kb < 60 ? 'hitL' : kb < 130 ? 'hitM' : 'hitH');
    if (isMeteor) { this.fx.meteor(wx, wy); this.shake = Math.max(this.shake, 8); SFX.play('meteor'); }
    // 「ガツン」と強烈な一撃が決まったときの演出（撃墜が決まったという意味ではない）
    const offstage = Math.abs(d.x) > ST.halfWidth + 5 || d.y > 5;
    const strong = (isMeteor && offstage) || this.predictKO(d) || (d.percent >= PH.cineStrongPct && kb >= PH.cineStrongKb);
    if (strong && this.cineCd <= 0) this.startCine(wx, wy, hl, isMeteor);
  }
  // このまま飛んでいったら場外に出そうか、ざっくり計算する（ふんばりや復帰は考えない）
  predictKO(d) {
    const z = ST.blast;
    let x = d.x, y = d.y, vy = 0, kx = d.kbx, ky = d.kby;
    const sp0 = Math.hypot(kx, ky);
    const n = Math.min(200, Math.ceil(sp0 / PH.kbDecay) + 6);
    for (let i = 0; i < n; i++) {
      vy = Math.min(vy + d.s.gravity, d.s.fall);
      const sp = Math.hypot(kx, ky);
      if (sp > 0) { const ns = Math.max(0, sp - PH.kbDecay); kx *= ns / sp; ky *= ns / sp; }
      const py = y;
      x += kx; y += vy + ky;
      if (py <= 0 && y >= 0 && Math.abs(x) <= ST.halfWidth) return false; // ステージに落ちる
      if (y > 0 && y < ST.thickness && Math.abs(x) <= ST.halfWidth) return false;
      if (x < z.left || x > z.right || y > z.bottom || y < z.top) return true;
    }
    return false;
  }
  startCine(x, y, hl, meteor) {
    const lines = [];
    for (let i = 0; i < 26; i++) lines.push({ a: rnd() * Math.PI * 2, w: 0.012 + rnd() * 0.03, l: 0.55 + rnd() * 0.5 });
    this.cine = { t: 0, x, y, freeze: 6, slow: hl * 2 + 26, lines, meteor };
    this.cineCd = PH.cineCooldown;
    this.flash = Math.max(this.flash, 4);
    SFX.play('cine');
  }
  checkKO() {
    const z = ST.blast;
    for (const f of this.f) {
      if (!f.alive || f.state === 'grabbed') continue;
      if (f.x < z.left || f.x > z.right || f.y > z.bottom || f.y < z.top) {
        const cx = clamp(f.x, z.left, z.right), cy = clamp(f.y, z.top, z.bottom);
        this.fx.ko(cx, cy, f.color);
        this.shake = 16; this.flash = 6;
        SFX.play('ko');
        if (f.grabbed) f.releaseGrab();
        f.freeLedge();
        f.stocks--; f.state = 'dead'; f.timer = 70; f.move = null; f.kbx = f.kby = f.vx = f.vy = 0; f.trail = [];
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
    this.cam.x = lerp(this.cam.x, cx, 0.08); this.cam.y = lerp(this.cam.y, cy, 0.08); this.cam.z = lerp(this.cam.z, z, 0.06);
  }
}

/* =====================================================================
   画面とタッチ操作
   ===================================================================== */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { w: 0, h: 0, dpr: 1, maxDpr: 2, inset: { l: 0, r: 0, t: 0, b: 0 } };
const safeEl = document.getElementById('safe');
function readInsets() {
  const cs = getComputedStyle(safeEl);
  view.inset = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
}
function resize() {
  view.dpr = Math.min(window.devicePixelRatio || 1, view.maxDpr);
  view.w = window.innerWidth; view.h = window.innerHeight;
  canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
  readInsets();
  controls.layout();
  layers.dirty = true;
  if (window.Render3D && window.Render3D.ready) window.Render3D.resize(view);
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
      if (this.inPause(e.clientX, e.clientY) && this.onPause) this.onPause();
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
  // いちばん近いボタン（少し外れていても反応するように、半径の2倍まで）
  nearest(x, y, lim) {
    let best = null, bd = Infinity;
    for (const k in this.btns) {
      const b = this.btns[k], d = Math.hypot(x - b.x, y - b.y) / b.r;
      if (d < lim && d < bd) { bd = d; best = k; }
    }
    const cd = Math.hypot(x - this.cs.x, y - this.cs.y) / this.cs.r;
    if (cd < lim && cd < bd) best = '__C';
    return best;
  }
  pressBtn(k) { this.btns[k].on = true; this.pad.held[k] = true; this.pad.press(k); }
  releaseBtn(k) { if (![...this.btnTouches.values()].includes(k)) { this.btns[k].on = false; this.pad.held[k] = false; } }
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
      const best = this.nearest(x, y, 2.0);
      if (best === '__C') {
        this.cTouch = { id: t.identifier, fired: false };
        this.updateC(x, y);
      } else if (best) {
        this.btnTouches.set(t.identifier, best);
        this.pressBtn(best);
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
      else if (this.btnTouches.has(t.identifier)) {
        // 指をすべらせて別のボタンに移ったら、そのボタンを押したことにする
        const cur = this.btnTouches.get(t.identifier);
        const nb = this.nearest(t.clientX, t.clientY, 1.15);
        if (nb && nb !== '__C' && nb !== cur) {
          this.btnTouches.set(t.identifier, nb);
          this.releaseBtn(cur);
          this.pressBtn(nb);
        }
      }
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
        this.releaseBtn(k);
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
   描画（2D）
   重い描画（背景・ボタン）は前もって別の画像に描いておき、毎コマはそれを貼るだけにして軽くしています
   ===================================================================== */
const layers = { dirty: true, bg: document.createElement('canvas'), ui: document.createElement('canvas') };
const STARS = Array.from({ length: 70 }, () => ({ x: rnd() * 2400 - 1200, y: rnd() * 1400 - 1150, s: rnd() * 1.6 + 0.4, a: rnd() * 0.6 + 0.2 }));
function buildLayers() {
  const W = view.w, H = view.h, dpr = view.dpr;
  for (const c of [layers.bg, layers.ui]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = layers.bg.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#0a0f26'); gr.addColorStop(0.6, '#1b2552'); gr.addColorStop(1, '#2d2a5a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // ボタン（押していないときの見た目）
  const u = layers.ui.getContext('2d');
  u.setTransform(dpr, 0, 0, dpr, 0, 0);
  u.clearRect(0, 0, W, H);
  const c = controls;
  const pr = c.pauseRect;
  u.fillStyle = 'rgba(255,255,255,0.14)'; rr(u, pr.x, pr.y, pr.w, pr.h, 9); u.fill();
  u.fillStyle = 'rgba(255,255,255,0.85)'; u.fillRect(pr.x + 16, pr.y + 12, 4, 16); u.fillRect(pr.x + 26, pr.y + 12, 4, 16);
  u.textAlign = 'center'; u.textBaseline = 'middle';
  for (const k in c.btns) {
    const b = c.btns[k];
    const base = k === 'A' ? '255,93,93' : k === 'B' ? '255,211,77' : '255,255,255';
    u.fillStyle = `rgba(${base},0.17)`; u.strokeStyle = `rgba(${base},0.6)`; u.lineWidth = 2;
    u.beginPath(); u.arc(b.x, b.y, b.r, 0, Math.PI * 2); u.fill(); u.stroke();
    u.fillStyle = 'rgba(255,255,255,0.92)';
    u.font = `bold ${b.label.length > 2 ? 10 : 20}px -apple-system, "Hiragino Sans", sans-serif`;
    u.fillText(b.label, b.x, b.y + 1);
  }
  const cs = c.cs;
  u.fillStyle = 'rgba(255,211,77,0.12)'; u.strokeStyle = 'rgba(255,211,77,0.5)';
  u.beginPath(); u.arc(cs.x, cs.y, cs.r, 0, Math.PI * 2); u.fill(); u.stroke();
  layers.dirty = false;
  hudCache.clear();
}
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function pctColor(p) {
  if (p < 50) return `rgb(255,${Math.round(255 - p * 0.6)},${Math.round(255 - p * 3)})`;
  if (p < 120) { const t = (p - 50) / 70; return `rgb(255,${Math.round(225 - t * 125)},${Math.round(105 - t * 80)})`; }
  const t = Math.min(1, (p - 120) / 100); return `rgb(${Math.round(255 - t * 80)},${Math.round(100 - t * 80)},${Math.round(25 + t * 10)})`;
}
// 2Dの座標変換（3D表示のときは3D側の変換に差し替わる）
let PROJ = null;
function make2DProj(cam, sx, sy) {
  const z = cam.z, W = view.w, H = view.h;
  return { X: wx => (wx - cam.x) * z + W / 2 + sx, Y: wy => (wy - cam.y) * z + H / 2 + sy, z };
}
function render(b, alpha) {
  if (layers.dirty) buildLayers();
  const W = view.w, H = view.h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const use3D = state.mode === '3d' && window.Render3D && window.Render3D.ready && b;
  if (use3D) ctx.clearRect(0, 0, canvas.width, canvas.height);
  else ctx.drawImage(layers.bg, 0, 0);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  if (!b) { if (window.Render3D && window.Render3D.ready) window.Render3D.hide(); return; }
  const tick = alpha;
  if (b.cine) alpha = b.cine.t <= b.cine.freeze ? 1 : (b.slowPhase + alpha) / 2; // スロー中もなめらかに
  const cam = { x: lerp(b.prevCam.x, b.cam.x, alpha), y: lerp(b.prevCam.y, b.cam.y, alpha), z: lerp(b.prevCam.z, b.cam.z, alpha) };
  const cw = cineWeight(b, tick);
  if (cw > 0) { cam.x = lerp(cam.x, b.cine.x, cw * 0.8); cam.y = lerp(cam.y, b.cine.y + 20, cw * 0.8); cam.z *= 1 + 0.75 * cw; }
  let sx = 0, sy = 0;
  if (b.shake > 0) { sx = (rnd() - 0.5) * b.shake * 2; sy = (rnd() - 0.5) * b.shake * 2; }
  if (use3D) {
    PROJ = window.Render3D.render(b, alpha, cam, sx, sy, view, api);
    for (const f of b.f) if (f.alive) drawTag(f, PROJ.X(lerp(f.px, f.x, alpha)), PROJ.Y(lerp(f.py, f.y, alpha) - 128));
  } else {
    if (window.Render3D && window.Render3D.ready) window.Render3D.hide();
    PROJ = make2DProj(cam, sx, sy);
    const { X, Y, z } = PROJ;
    for (const s of STARS) {
      ctx.fillStyle = `rgba(255,255,255,${s.a})`;
      ctx.fillRect((s.x - cam.x * 0.15) * 0.5 + W / 2, (s.y - cam.y * 0.15) * 0.5 + H / 2, s.s, s.s);
    }
    drawStage(X, Y, z);
    for (const p of b.projectiles) drawProjectile(p, alpha, X, Y, z);
    for (const f of b.f) drawFighter(f, alpha, X, Y, z);
  }
  const { X, Y, z } = PROJ;
  for (const f of b.f) drawTrail(f, X, Y, z);
  drawFX(b.fx, X, Y, z);
  if (DEBUG) drawDebug(b, X, Y, z);
  if (cw > 0) drawCine(b, X, Y, z, cw, tick);
  if (b.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${b.flash * 0.05})`; ctx.fillRect(0, 0, W, H); }
  drawHUD(b);
  drawControls();
}
// 強烈な一撃の演出の強さ（0〜1）：すっと寄って、最後にゆっくり戻る
function cineWeight(b, tick) {
  const c = b.cine;
  if (!c) return 0;
  const t = c.t + (tick || 0), end = c.freeze + c.slow;
  const up = clamp(t / 4, 0, 1), down = clamp((end - t) / 16, 0, 1);
  return ease(Math.min(up, down));
}
function drawCine(b, X, Y, z, w, tick) {
  const c = b.cine, W = view.w, H = view.h;
  const x = X(c.x), y = Y(c.y), R = Math.hypot(W, H);
  // まわりを暗くして、当たったところに目を向ける
  const g = ctx.createRadialGradient(x, y, R * 0.08, x, y, R * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,10,${0.55 * w})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 集中線
  ctx.fillStyle = c.meteor ? `rgba(255,190,90,${0.5 * w})` : `rgba(255,255,255,${0.45 * w})`;
  const wob = (c.t + tick) * 0.02;
  for (const L of c.lines) {
    const a = L.a + wob * 0.1, r0 = R * (0.16 + (1 - L.l) * 0.2), r1 = R;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a - L.w) * r1, y + Math.sin(a - L.w) * r1);
    ctx.lineTo(x + Math.cos(a + L.w) * r1, y + Math.sin(a + L.w) * r1);
    ctx.closePath(); ctx.fill();
  }
  // 当たった瞬間の光
  const t = c.t + tick;
  if (t < 14) {
    const u = t / 14;
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = c.meteor ? '#ffcf7a' : '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, (30 + 90 * u) * Math.max(0.6, z), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 画面の上下の帯（映画のような雰囲気）
  const bar = H * 0.07 * w;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
}
function drawStage(X, Y, z) {
  const L = -ST.halfWidth, R = ST.halfWidth, T = 0, Bt = ST.thickness;
  ctx.beginPath();
  ctx.moveTo(X(L), Y(T)); ctx.lineTo(X(R), Y(T)); ctx.lineTo(X(R - 30), Y(Bt)); ctx.lineTo(X(R - 170), Y(Bt + 80)); ctx.lineTo(X(L + 170), Y(Bt + 80)); ctx.lineTo(X(L + 30), Y(Bt));
  ctx.closePath();
  const sg = ctx.createLinearGradient(0, Y(T), 0, Y(Bt + 90));
  sg.addColorStop(0, '#4a4f86'); sg.addColorStop(1, '#14173a');
  ctx.fillStyle = sg; ctx.fill();
  ctx.fillStyle = '#bfc6ff'; ctx.fillRect(X(L), Y(T) - 1, (R - L) * z, Math.max(2, 4 * z));
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(X(L), Y(T) + 4 * z, (R - L) * z, 10 * z);
  // 崖の角
  ctx.fillStyle = '#e6e9ff';
  for (const ex of [L, R]) { ctx.beginPath(); ctx.arc(X(ex), Y(T) + 1, Math.max(2, 3.5 * z), 0, Math.PI * 2); ctx.fill(); }
}
function mixHex(a, b, t) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function fighterLook(f) {
  let col = f.color, dark = f.dark;
  if (f.hitFlash > 0) { col = '#ffffff'; dark = '#e8e8e8'; }
  else if (f.armorFlash > 0 && Math.floor(f.armorFlash / 2) % 2 === 0) { col = '#ffb347'; dark = '#d9862a'; }
  else if (f.charging && f.move && f.move.holdShot) {
    // ため撃ち：最大までたまったら、ゆっくり光る（チカチカさせない）
    if (f.shotT >= 1) { const k = 0.35 + 0.25 * Math.sin(f.anim * 0.18); col = mixHex(col, '#fff2b0', k); dark = mixHex(dark, '#e8d27a', k); }
  }
  else if (f.charging && Math.floor(f.anim / 3) % 2 === 0) { col = '#ffffff'; dark = '#dddddd'; }
  else if (f.state === 'dizzy' && Math.floor(f.anim / 6) % 2 === 0) col = '#ffe066';
  return { col, dark };
}
function interpPose(f, alpha) { return lerpPose(f.prevDisp, f.disp, alpha); }
function drawFighter(f, alpha, X, Y, z) {
  if (!f.alive) return;
  if (f.invuln > 0 && f.state !== 'move' && Math.floor(f.invuln / 4) % 2 === 0) ctx.globalAlpha = 0.5;
  let x = lerp(f.px, f.x, alpha), y = lerp(f.py, f.y, alpha);
  if (f.hitlag > 0 && f.shakeT > 0) x += (rnd() - 0.5) * 6;
  if (f.charging && !(f.move && f.move.holdShot)) x += (rnd() - 0.5) * 2;
  const pose = interpPose(f, alpha);
  const pts = solvePose(pose, f.look, f.grounded, f.state === 'down');
  const fc = f.facing;
  const P = {}; for (const k in pts) P[k] = [X(x + pts[k][0] * fc), Y(y - pts[k][1])];
  const th = f.look.thick * z;
  const line = (pp, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pp[0][0], pp[0][1]); for (let i = 1; i < pp.length; i++) ctx.lineTo(pp[i][0], pp[i][1]); ctx.stroke(); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const { col, dark } = fighterLook(f);
  if (f.grounded || y > -200) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(X(x), Y(0) + 2, 22 * z * clamp(1 + y / 400, 0.3, 1), 5 * z, 0, 0, Math.PI * 2); ctx.fill();
  }
  line([P.bS, P.bE, P.bH], dark, th * 0.9);
  line([P.bHp, P.bK, P.bF], dark, th * 0.95);
  line([P.H, P.N], col, th * 1.15);
  line([P.fHp, P.fK, P.fF], col, th);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(P.head[0], P.head[1], f.look.head * z, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#10142c';
  ctx.beginPath(); ctx.arc(P.eye[0], P.eye[1], Math.max(1.2, 2.2 * z), 0, Math.PI * 2); ctx.fill();
  line([P.fS, P.fE, P.fH], col, th);
  drawWeapon(f, P, z, alpha, X, Y, col, dark);
  if (f.state === 'shield' || f.state === 'shieldstun') {
    const r = (20 + 34 * (f.shieldHP / PH.shieldMax)) * z;
    ctx.fillStyle = f.slot === 0 ? 'rgba(255,93,93,0.28)' : 'rgba(79,168,255,0.28)';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(x), Y(y - 45), r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  drawTag(f, P.head[0], Math.min(P.head[1], P.N[1]) - (f.look.head + 14) * z);
}
function drawTag(f, hx, hy) {
  ctx.fillStyle = f.color;
  ctx.beginPath(); ctx.moveTo(hx - 6, hy - 9); ctx.lineTo(hx + 6, hy - 9); ctx.lineTo(hx, hy); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 11px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(f.slot === 0 ? 'P1' : 'CPU', hx, hy - 13);
}
function drawWeapon(f, P, z, alpha, X, Y, col, dark) {
  const w = f.c.weapon, h = P.fH, e = P.fE;
  let dx = h[0] - e[0], dy = h[1] - e[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const px = -dy, py = dx;
  if (w === 'unarmed') {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(h[0], h[1], f.look.thick * 0.85 * z, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(P.bH[0], P.bH[1], f.look.thick * 0.8 * z, 0, Math.PI * 2); ctx.fill();
  } else if (w === 'whip') {
    const t = [X(lerp(f.prevTip[0], f.tip[0], alpha)), Y(lerp(f.prevTip[1], f.tip[1], alpha))];
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
}
// 攻撃の軌跡（手足の通り道を白く残す）
function drawTrail(f, X, Y, z) {
  const t = f.trail;
  if (!f.alive || t.length < 2) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 1; i < t.length; i++) {
    const u = i / (t.length - 1);
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + u * 0.5})`;
    ctx.lineWidth = Math.max(2, (4 + u * 10) * z);
    ctx.beginPath(); ctx.moveTo(X(t[i - 1][0]), Y(t[i - 1][1])); ctx.lineTo(X(t[i][0]), Y(t[i][1])); ctx.stroke();
  }
}
function drawProjectile(p, alpha, X, Y, z) {
  const x = X(lerp(p.px, p.x, alpha)), y = Y(lerp(p.py, p.y, alpha));
  const col = p.owner.color;
  if (p.noHit) ctx.globalAlpha = 0.45;
  if (p.big) { ctx.fillStyle = 'rgba(255,233,168,0.35)'; ctx.beginPath(); ctx.arc(x, y, 16 * z, 0, Math.PI * 2); ctx.fill(); }
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
  ctx.globalAlpha = 1;
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
    } else if (e.k === 'meteor') {
      // 下向きの衝撃（メテオ）
      const x = X(e.x), y = Y(e.y), L = (60 + u * 120) * z;
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = '#ffb13b';
      ctx.beginPath(); ctx.moveTo(x - 26 * z * (1 - u), y); ctx.lineTo(x + 26 * z * (1 - u), y); ctx.lineTo(x, y + L); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = Math.max(1.5, 3 * z);
      for (const dx of [-18, 0, 18]) { ctx.beginPath(); ctx.moveTo(x + dx * z, y - 10 * z); ctx.lineTo(x + dx * 1.6 * z, y + L * 0.8); ctx.stroke(); }
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
// 上の％表示（数字が変わったときだけ描き直す）
const hudCache = new Map();
function hudPanel(f) {
  const pc = f.alive ? Math.floor(f.percent) : 0;
  const key = `${f.slot}|${pc}|${f.stocks}|${f.c.name}|${view.dpr}`;
  let c = hudCache.get(f.slot);
  if (c && c.key === key) return c.canvas;
  const w = 150, h = 50, dpr = view.dpr;
  const cv = (c && c.canvas) || document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(8,12,30,0.62)'; rr(g, 0, 0, w, h, 10); g.fill();
  g.fillStyle = f.color; g.fillRect(0, 8, 4, 34);
  g.textAlign = 'left'; g.font = 'bold 11px -apple-system, "Hiragino Sans", sans-serif';
  g.fillStyle = '#c9cff0'; g.fillText(`${f.label}：${f.c.name}`, 12, 16);
  for (let s = 0; s < f.stocks; s++) { g.fillStyle = f.color; g.beginPath(); g.arc(16 + s * 13, 36, 4.5, 0, Math.PI * 2); g.fill(); }
  g.textAlign = 'right'; g.font = 'bold 26px -apple-system, "Hiragino Sans", sans-serif';
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(`${pc}%`, w - 9, 44);
  g.fillStyle = pctColor(pc); g.fillText(`${pc}%`, w - 10, 43);
  hudCache.set(f.slot, { key, canvas: cv });
  return cv;
}
// ％とストックは画面の下（移動スティックとボタンの間）
function drawHUD(b) {
  const W = view.w, H = view.h, ins = view.inset;
  const left = ins.l + 30 + D.controls.stickRadius * 2 + 22, right = W - ins.r - 252;
  const gap = 10, avail = right - left;
  const boxW = clamp((avail - gap) / 2, 96, 150), boxH = boxW / 3;
  const mid = avail >= boxW * 2 + gap ? (left + right) / 2 : W / 2;
  const x0 = mid - boxW - gap / 2, y = H - ins.b - boxH - 8;
  b.f.forEach((f, i) => ctx.drawImage(hudPanel(f), x0 + i * (boxW + gap), y, boxW, boxH));
}
function drawControls() {
  const c = controls;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layers.ui, 0, 0);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  const pr = c.pauseRect;
  if (state.showFps) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = 'bold 13px monospace';
    ctx.fillStyle = fpsNow >= 55 ? '#7dff9a' : fpsNow >= 40 ? '#ffe066' : '#ff7070';
    ctx.fillText(`${fpsNow} fps${view.maxDpr < 2 ? ' 画質' + view.maxDpr : ''}`, pr.x + pr.w + 10, pr.y + 25);
  }
  // 押しているボタンだけ明るく
  for (const k in c.btns) {
    const b = c.btns[k];
    if (!b.on) continue;
    const base = k === 'A' ? '255,93,93' : k === 'B' ? '255,211,77' : '255,255,255';
    ctx.fillStyle = `rgba(${base},0.42)`;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }
  // 移動スティック
  const R = D.controls.stickRadius;
  const st = c.stick ? { x: c.stick.ox, y: c.stick.oy } : c.stickHome;
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(st.x, st.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const kx = st.x + (c.pad ? c.pad.mx : 0) * R, ky = st.y - (c.pad ? c.pad.my : 0) * R;
  ctx.fillStyle = c.stick ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.arc(c.stick ? kx : st.x, c.stick ? ky : st.y, R * 0.45, 0, Math.PI * 2); ctx.fill();
  // Cスティック
  const cs = c.cs;
  ctx.fillStyle = c.cTouch ? 'rgba(255,211,77,0.75)' : 'rgba(255,211,77,0.42)';
  ctx.beginPath(); ctx.arc(cs.x + cs.kx * cs.r * 0.6, cs.y + cs.ky * cs.r * 0.6, cs.r * 0.48, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(30,20,0,0.9)'; ctx.font = 'bold 15px -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(cs.label, cs.x + cs.kx * cs.r * 0.6, cs.y + cs.ky * cs.r * 0.6 + 1);
  ctx.textBaseline = 'alphabetic';
}

/* =====================================================================
   画面の切り替えとメインループ
   ===================================================================== */
const $ = id => document.getElementById(id);
const state = {
  screen: 'title', battle: null, paused: false, p1: 0, cpu: 1,
  showFps: store.get('showFps', false), mode: '3d', level: store.get('cpuLevel', D.cpu.default),
};
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
  const lv = $('cpuLevel');
  lv.innerHTML = '';
  for (const k in D.cpu.levels) {
    const b = document.createElement('div');
    b.className = 'seg' + (state.level === k ? ' on' : '');
    b.textContent = D.cpu.levels[k].name;
    b.addEventListener('click', () => { state.level = k; store.set('cpuLevel', k); buildCards(); });
    lv.appendChild(b);
  }
}
function startBattle() {
  state.battle = new Battle(D.characters[state.p1], D.characters[state.cpu], state.level);
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
function updateMenuLabels() {
  $('btnFps').textContent = `fps表示：${state.showFps ? 'オン' : 'オフ'}`;
}
// 3D表示の準備（もしこの端末で3Dが使えないときだけ、平面の表示で動かす）
function init3D() {
  try {
    if (!window.THREE || !window.Render3D) throw new Error('3D files missing');
    window.Render3D.init(view);
  } catch (e) { state.mode = '2d'; }
}
$('btnStart').addEventListener('click', () => { buildCards(); show('select'); state.screen = 'select'; });
$('btnBack').addEventListener('click', () => { show('title'); state.screen = 'title'; });
$('btnFight').addEventListener('click', startBattle);
$('btnResume').addEventListener('click', () => { state.paused = false; show(null); acc = 0; });
$('btnRestart').addEventListener('click', startBattle);
$('btnToSelect').addEventListener('click', () => { state.battle = null; state.screen = 'select'; buildCards(); show('select'); });
$('btnFps').addEventListener('click', () => { state.showFps = !state.showFps; store.set('showFps', state.showFps); updateMenuLabels(); });
$('btnAgain').addEventListener('click', startBattle);
$('btnResSelect').addEventListener('click', () => { state.battle = null; state.screen = 'select'; buildCards(); show('select'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
updateMenuLabels();

// 画面の更新が追いつかないときは、自動で画質（解像度）を少し下げて60fpsを保つ
let acc = 0, last = performance.now(), fpsCount = 0, fpsT = 0, fpsNow = 60, lowT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  if (Math.abs(dt - STEP) < 0.002) dt = STEP; // 画面の更新タイミングのゆれをならす
  fpsCount++; fpsT += dt;
  if (fpsT >= 0.5) {
    fpsNow = Math.round(fpsCount / fpsT); fpsCount = 0; fpsT = 0;
    if (state.battle && !state.paused) {
      lowT = fpsNow < 52 ? lowT + 1 : 0;
      if (lowT >= 4 && view.maxDpr > 1.25) { view.maxDpr = Math.max(1.25, view.maxDpr - 0.25); lowT = 0; resize(); }
    }
  }
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

// 3D表示や動作確認で使う共有の部品
const api = { state, D, Battle, CpuBrain, Fighter, startBattle, calcKB, POSES, solvePose, lerpPose, interpPose, fighterLook, lerp, clamp, ST, PH, view, SFX };
window.__game = api;
init3D();
})();
