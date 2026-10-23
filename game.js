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
  let ac = null, master = null, sfxBus = null, musicBus = null, verb = null, noiseBuf = null;
  const lastT = {};
  let musicVol = store.get('bgm', 1) ? 0.32 : 0;
  function unlock() {
    try {
      // iPhoneのマナーモード（消音スイッチ）でも、ゲームの音が鳴るようにする（動画と同じあつかい）
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') { try { navigator.audioSession.type = 'playback'; } catch (e) { /* 古いiOSは非対応 */ } }
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        const comp = ac.createDynamicsCompressor(); // 音が重なっても割れないように
        comp.threshold.value = -14; comp.ratio.value = 4;
        master = ac.createGain(); master.gain.value = 0.9; master.connect(comp); comp.connect(ac.destination);
        sfxBus = ac.createGain(); sfxBus.gain.value = 0.62; sfxBus.connect(master);
        musicBus = ac.createGain(); musicBus.gain.value = musicVol; musicBus.connect(master);
        // 残響（ホールの響き）：打撃の「重さ」と空間の広さを出す
        verb = ac.createConvolver();
        const len = Math.floor(ac.sampleRate * 1.4), ir = ac.createBuffer(2, len, ac.sampleRate);
        for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
        verb.buffer = ir;
        const vg = ac.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(sfxBus);
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
  // rv = 残響に送る量（0〜1）
  function out(g, rv) { g.connect(sfxBus); if (rv) { const s = ac.createGain(); s.gain.value = rv; g.connect(s); s.connect(verb); } }
  function tone(type, f0, f1, dur, vol, delay = 0, rv = 0) {
    const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    env(g, t0, 0.004, vol, dur);
    o.connect(g); out(g, rv); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, f0, f1, q = 1, kind = 'bandpass', delay = 0, rv = 0) {
    const t0 = ac.currentTime + delay, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = kind; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t0); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    env(g, t0, 0.003, vol, dur);
    s.connect(fl); fl.connect(g); out(g, rv); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }
  // 体に当たったときの「ドスッ」（低い音の芯）
  function thud(f, dur, vol, rv) { tone('sine', f, f * 0.42, dur, vol, 0, rv); tone('triangle', f * 1.9, f * 0.6, dur * 0.5, vol * 0.35, 0, rv); }
  const lib = {
    hitL()  { noise(0.05, 0.4, 3600, 1600, 1.1); thud(150, 0.09, 0.45, 0.05); noise(0.08, 0.25, 900, 300, 0.8, 'lowpass'); },
    hitM()  { noise(0.06, 0.6, 3000, 1200, 0.9); thud(115, 0.18, 0.8, 0.15); noise(0.16, 0.5, 1100, 220, 0.7, 'lowpass', 0, 0.12); },
    hitH()  { noise(0.08, 0.85, 5000, 1500, 0.7, 'highpass'); thud(88, 0.42, 1.0, 0.35); noise(0.32, 0.8, 1300, 120, 0.6, 'lowpass', 0.01, 0.3); tone('square', 70, 32, 0.16, 0.14, 0, 0.2); },
    armor() { tone('triangle', 420, 300, 0.09, 0.3); noise(0.06, 0.25, 1500, 900, 2); thud(130, 0.1, 0.4, 0.1); },
    shield(){ tone('sine', 760, 560, 0.1, 0.25, 0, 0.15); noise(0.05, 0.22, 4200, 2500, 3); },
    meteor(){ tone('sine', 220, 30, 0.6, 0.95, 0, 0.4); noise(0.4, 0.85, 900, 70, 0.6, 'lowpass', 0, 0.35); tone('sawtooth', 300, 60, 0.25, 0.12); },
    cine()  { noise(0.08, 0.9, 6000, 3000, 0.8, 'highpass'); tone('sine', 110, 26, 1.1, 1.0, 0, 0.5); noise(0.9, 0.45, 600, 60, 0.5, 'lowpass', 0.03, 0.4); },
    ko()    { noise(0.6, 0.85, 300, 3600, 0.8, 'bandpass', 0, 0.4); tone('sine', 85, 28, 0.9, 1.0, 0.04, 0.5); noise(0.9, 0.7, 1400, 70, 0.5, 'lowpass', 0.08, 0.5); tone('sawtooth', 200, 900, 0.5, 0.08, 0.1, 0.5); },
    shoot(p){ noise(0.09, 0.3 + p * 0.25, 2500, 6000, 1.5); tone('triangle', 900 + p * 500, 260, 0.12, 0.18 + p * 0.12, 0, 0.1); },
    charged(){ tone('sine', 988, 988, 0.18, 0.22, 0, 0.3); tone('sine', 1480, 1480, 0.26, 0.18, 0.06, 0.3); },
    jump()  { noise(0.08, 0.14, 600, 1800, 1); tone('sine', 300, 560, 0.08, 0.08); },
    land(p) { thud(70 + 20 * (1 - p), 0.12 + p * 0.12, 0.25 + p * 0.5, 0.1); noise(0.12, 0.12 + p * 0.25, 600, 150, 0.7, 'lowpass'); },
    grab()  { tone('square', 180, 120, 0.07, 0.14); noise(0.05, 0.25, 1200, 700, 2); thud(160, 0.07, 0.3); },
    reflect(){ tone('triangle', 1300, 2100, 0.14, 0.25, 0, 0.3); tone('sine', 2600, 2600, 0.12, 0.08, 0.03, 0.3); },
    quake() { noise(0.45, 0.8, 500, 50, 0.6, 'lowpass', 0, 0.3); tone('sine', 72, 32, 0.45, 0.85, 0, 0.3); },
    // 空を切る音：強い攻撃ほど低く太い
    swing(p){ noise(0.12 + p * 0.1, 0.16 + p * 0.25, 350 - p * 120, 2400 - p * 900, 1.3); noise(0.08 + p * 0.06, 0.08 + p * 0.12, 3000, 900, 0.8, 'bandpass', 0.03); },
    tech()  { tone('triangle', 600, 900, 0.07, 0.15); },
    // ジャストガード：澄んだ「キィン」。耳に刺さる高さは避けて、低い芯で存在感を出す
    parry() { tone('sine', 784, 1175, 0.16, 0.28, 0, 0.35); tone('triangle', 1568, 1568, 0.22, 0.07, 0.02, 0.35); thud(196, 0.08, 0.3); },
    // 相殺：武器同士がぶつかる「ガキッ」
    clank() { noise(0.07, 0.45, 2400, 1400, 4); tone('square', 523, 392, 0.08, 0.1); thud(140, 0.1, 0.35, 0.1); },
    gun(p)  { noise(0.06, 0.55 + p * 0.3, 3500, 900, 0.9, 'bandpass', 0, 0.25); thud(140 - p * 40, 0.08, 0.35 + p * 0.3); tone('square', 520 - p * 200, 90, 0.07, 0.12 + p * 0.12); },
    slash() { noise(0.18, 0.35, 1800, 6500, 2.2, 'bandpass', 0, 0.15); tone('sine', 2400, 2300, 0.25, 0.06, 0.02, 0.4); tone('sine', 3600, 3500, 0.2, 0.04, 0.02, 0.4); },
    puff()  { noise(0.5, 0.45, 900, 180, 0.5, 'lowpass', 0, 0.3); },
    boom()  { noise(0.6, 1.0, 1600, 70, 0.6, 'lowpass', 0, 0.45); thud(100, 0.6, 1.0, 0.5); tone('square', 160, 45, 0.2, 0.15); },
    wire()  { noise(0.12, 0.25, 4000, 8000, 3, 'highpass'); tone('triangle', 1800, 900, 0.1, 0.08); },
    dodge() { noise(0.14, 0.22, 700, 3200, 1.2); },
    zap()   { tone('sawtooth', 1400, 300, 0.16, 0.18, 0, 0.2); noise(0.18, 0.35, 5000, 2000, 2.5); tone('square', 2200, 800, 0.1, 0.06, 0.05); },
    change(){ tone('sine', 660, 1320, 0.22, 0.22, 0, 0.4); noise(0.3, 0.3, 3000, 8000, 1, 'highpass', 0.05, 0.3); },
    // 試合の流れ
    count() { tone('square', 660, 660, 0.14, 0.18, 0, 0.3); tone('sine', 1320, 1320, 0.12, 0.1, 0, 0.3); },
    go()    { tone('sawtooth', 880, 880, 0.5, 0.16, 0, 0.5); tone('square', 1320, 1320, 0.45, 0.12, 0.02, 0.5); tone('sine', 440, 440, 0.6, 0.3, 0, 0.5); noise(0.4, 0.3, 6000, 2000, 0.8, 'highpass', 0, 0.4); },
    game()  { tone('sine', 110, 40, 1.2, 1.0, 0, 0.6); noise(0.8, 0.8, 4000, 200, 0.6, 'lowpass', 0, 0.6); tone('sawtooth', 220, 110, 0.8, 0.12, 0.05, 0.6); },
    // ジェット（ゴーッ）とビーム
    jet(p)  { noise(0.16, 0.12 + p * 0.1, 900, 1400, 0.6, 'bandpass'); tone('sawtooth', 70, 90, 0.16, 0.05); },
    beamCharge(p) { tone('sine', 300 + p * 900, 400 + p * 1100, 0.12, 0.05 + p * 0.06); },
    beam(p) { tone('sawtooth', 900 + p * 300, 180, 0.5 + p * 0.3, 0.16 + p * 0.12, 0, 0.3); noise(0.4 + p * 0.3, 0.3 + p * 0.25, 5000, 800, 0.8, 'lowpass', 0, 0.3); thud(60, 0.3 * p + 0.1, 0.5, 0.1); },
    // 炎（ボッ）と氷（キンッ）
    fire(p) { noise(0.25 + p * 0.25, 0.25 + p * 0.35, 1800, 300, 0.7, 'lowpass'); thud(70, 0.12 + p * 0.15, 0.25 + p * 0.3, 0.1); },
    ice(p)  { tone('sine', 2600, 2200, 0.18, 0.12 + p * 0.1); tone('triangle', 3900, 3100, 0.12, 0.06 + p * 0.06, 0.02); noise(0.12, 0.12 + p * 0.12, 7000, 4000, 2, 'highpass'); },
    // 吹っ飛ぶ風切り音（強いほど長く低く）
    whoosh(p) { noise(0.35 + p * 0.5, 0.22 + p * 0.3, 2600 - p * 1200, 500, 1.6, 'bandpass', 0, 0.25); noise(0.25 + p * 0.3, 0.12 + p * 0.15, 6000, 1800, 1, 'highpass', 0.03); },
    bounce(p) { thud(60 + 30 * (1 - p), 0.25 + p * 0.2, 0.5 + p * 0.5, 0.15); noise(0.18, 0.2 + p * 0.25, 900, 120, 0.8, 'lowpass'); },
    blast() { noise(0.8, 0.9, 200, 5000, 0.7, 'bandpass', 0, 0.5); tone('sawtooth', 120, 1600, 0.6, 0.1, 0.05, 0.5); },
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
    // BGM（music.js）が使う音の出口
    audio() { return ac && ac.state === 'running' ? { ac, bus: musicBus, verb, noise: noiseBuf } : null; },
    setMusic(on) { musicVol = on ? 0.32 : 0; store.set('bgm', on ? 1 : 0); if (musicBus) musicBus.gain.setTargetAtTime(musicVol, ac.currentTime, 0.1); },
    get musicOn() { return musicVol > 0; },
    duck(on) { if (musicBus) musicBus.gain.setTargetAtTime(on ? musicVol * 0.3 : musicVol, ac.currentTime, 0.15); },
  };
})();

// fy・by：手前・奥の腕を、体の横へ開く角度（0=横から見た面の中、90=真横）。fly・bly：脚の同じもの（回し蹴りなど）
const PK = ['t', 'fa1', 'fa2', 'ba1', 'ba2', 'fl1', 'fl2', 'bl1', 'bl2', 'r', 'tw', 'yw', 'wr', 'pa', 'sb', 'fy', 'by', 'fly', 'bly'];
// yw = 体の横回転（3Dで回る技） / wr = 武器の回転 / pa = 1 で体全体を地面につける（寝そべる技）
// 4本足のキャラ（猫）は意味が変わる：t = 背骨の傾き（＋で前足側が上がる＝立ち上がる）/ fa・ba = 前足（手前・奥）/ fl・bl = 後ろ足
//   tw = 頭の上下（度）/ wr = しっぽの上げ具合（度）/ sb = 背中の丸め（＋で丸める、－でそらす）
function P(t, fa1, fa2, ba1, ba2, fl1, fl2, bl1, bl2, r = 0, tw = 0) { return { t, fa1, fa2, ba1, ba2, fl1, fl2, bl1, bl2, r, tw, yw: 0, wr: 0, pa: 0, sb: 0, fy: 0, by: 0, fly: 0, bly: 0 }; }
const POSES = {
  // 立ち・移動
  idle:         P(10, 40, 100, 15, 115, 26, -34, -22, -24, 0, 0.3),
  idle2:        P(12, 44, 106, 18, 120, 29, -40, -20, -30, 0, 0.25),
  walk1:        P(8, -22, 30, 28, 34, 30, -12, -22, -40),
  walk2:        P(8, 6, 30, 2, 30, 4, -45, 6, -10),
  walk3:        P(8, 28, 34, -22, 30, -22, -40, 30, -12),
  walk4:        P(8, 2, 30, 6, 30, 6, -10, 4, -45),
  run1:         P(18, -40, 85, 60, 95, 48, -22, -38, -75, 0, -0.35),
  run2:         P(21, 10, 95, 15, 95, 12, -45, -12, -115, 0, 0),
  run3:         P(18, 60, 95, -40, 85, -38, -75, 48, -22, 0, 0.35),
  run4:         P(21, 15, 95, 10, 95, -12, -115, 12, -45, 0, 0),
  dashStart:    P(30, -40, 90, 50, 70, 60, -90, -40, -30, 0, 0.3),
  skid:         P(-14, 40, 60, 60, 70, 40, -10, -10, -60),
  crouch:       P(30, 35, 70, 15, 80, 72, -122, -12, -100),
  // 空中
  takeoff:      P(-6, 150, 25, 110, 40, 15, -12, -18, -30, 0, 0.2),
  jump:         P(-4, 120, 45, 25, 60, 72, -108, -12, -42, 0, 0.25),
  tuck:         P(14, 75, 115, 55, 120, 100, -135, 62, -130, 0, -0.15),
  fall:         P(6, 50, 30, -25, 60, 45, -72, -18, -26, 0, -0.2),
  fastfall:     P(0, 155, 25, 130, 35, 10, -15, -8, -22),
  helpless:     P(0, 165, 5, 175, 0, 10, -15, -12, -10),
  // 防御・やられ
  shield:       P(10, 60, 110, 40, 120, 30, -40, -28, -18),
  hurtLight:    P(-10, 5, 70, -25, 70, 18, -20, -16, -10),
  hurt:         P(-26, -55, 30, -85, 20, 25, -25, -18, -12),
  hurtHigh:     P(-40, -110, 20, -140, 20, 35, -40, -10, -30),
  tumble:       P(-10, -120, 20, -150, 20, 40, -60, -30, -40),
  launchFly:    P(-34, -150, 25, -165, 30, 18, -30, -28, -14, 0, -0.3),
  down:         P(0, 170, 0, 160, 0, 8, -10, -6, -20, -90),
  grab:         P(22, 90, 5, 80, 15, 45, -45, -30, -10, 0, 0.3),
  hold:         P(10, 80, 25, 70, 35, 20, -20, -20, -10),
  grabbed:      P(-15, -30, 20, -40, 20, 10, -10, -10, -10),
  // 崖
  ledgeHang:    P(12, 172, 0, 168, 0, 8, -20, -6, -30),
  ledgeClimb:   P(40, 120, 40, 110, 40, 100, -140, 40, -120),
  getupSweep:   P(30, 60, 30, -60, 40, 90, 0, -80, 0),
  // 攻撃（素手）
  jabReady:     P(12, 45, 105, 15, 118, 30, -38, -24, -22, 0, 0.1),
  punchWind:    P(-4, 20, 125, 35, 115, 32, -45, -26, -26, 0, -0.7),
  punch:        P(22, 86, 5, 20, 120, 55, -55, -38, -5, 0, 0.9),
  punch2:       P(24, 25, 115, 86, 5, 50, -50, -40, -5, 0, -0.9),
  // 弓使い：矢を後ろの手でバトンのように回す（弓は前の手で胸の前に引きつける）
  twirlWind:    P(6, 30, 100, 40, 95, 32, -40, -26, -24, 0, -0.2),
  twirlA:       P(20, 28, 110, 80, 30, 52, -48, -38, -8, 0, -0.75),
  twirlB:       P(23, 30, 105, 104, 48, 55, -52, -40, -6, 0, -0.6),
  twirlWind2:   P(2, 40, 95, 150, 70, 34, -44, -30, -22, 0, 0.15),
  twirlFinish:  P(28, 22, 112, 76, 4, 64, -56, -46, -4, 0, -1.05),
  roundKick:    P(-30, 65, 55, -55, 45, 112, -8, 0, -24, 0, 0.8),
  uppercutWind: P(26, -10, 40, 60, 85, 70, -105, 0, -60, 0, -0.6),
  uppercut:     P(-12, 172, 0, 25, 70, 12, -12, -20, -10, 0, 0.6),
  sweepWind:    P(36, 40, 30, 20, 40, 75, -120, -10, -90),
  sweep:        P(32, 55, 20, -10, 50, 88, 0, -15, -100),
  kickWind:     P(-8, 35, 110, 20, 120, 112, -140, -10, -14, 0, -0.3),
  kick:         P(-24, 40, 95, -45, 55, 96, -6, -2, -22, 0, 0.3),
  upKick:       P(-22, 60, 70, -40, 55, 160, -5, -8, -24, 0, 0.2),
  stomp:        P(0, 125, 25, 115, 25, 0, 0, 25, -90),
  backKickWind: P(14, 40, 90, 30, 100, 60, -100, 50, -130, 0, -0.2),
  backKick:     P(30, 40, 95, 25, 105, 50, -90, -110, -4, 0, -0.4),
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
  sideKick:     P(-35, 30, 95, -50, 50, 98, 0, -4, -22, 0, 0.2),
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
  chopWind:     P(-8, -50, 70, 40, 110, 32, -45, -28, -28, 0, -1),
  chop:         P(24, 88, 10, 10, 115, 55, -60, -40, -6, 0, 1.05),
  elbowWind:    P(0, -20, 140, 30, 95, 30, -25, -25, -8, 0, -0.4),
  elbow:        P(22, 75, 150, -30, 85, 45, -35, -32, 0, 0, 0.8),
  headbuttWind: P(-25, 30, 95, 30, 95, 25, -30, -25, -10),
  headbutt:     P(50, 20, 85, 10, 85, 55, -50, -40, 0),
  bigBootWind:  P(-8, 35, 105, 20, 115, 112, -140, -12, -16, 0, -0.2),
  bigBoot:      P(-28, 40, 95, -40, 60, 100, -4, -4, -24, 0, 0.3),
  elbowUpWind:  P(25, -10, 140, 40, 95, 60, -90, -5, -50),
  elbowUp:      P(-15, 150, 150, 30, 85, 15, -15, -20, -10, 0, 0.6),
  slide:        Object.assign(P(-60, 150, 20, 160, 20, 85, 0, 60, -40), { pa: 1 }),
  lariatWind:   P(-12, -90, 20, 40, 95, 35, -50, -32, -30, 0, -1),
  lariatFull:   P(15, 90, 0, -60, 40, 55, -50, -40, 0, 0, 1),
  // ラリアット（3D）：腕を後ろ横に引いて体をねじる → 一歩ふみこみ、腕を真横に開く → 体ごと回して前へ → 勢いで体の反対側まで振り抜く
  lariatCoil:   Object.assign(P(-14, 95, 15, 60, 100, 40, -60, -30, -40, 0, -1.1), { fy: 150 }),
  lariatStep:   Object.assign(P(4, 92, 8, 25, 95, 55, -35, -45, -20, 0, -0.4), { fy: 100 }),
  lariatHit:    Object.assign(P(20, 90, 4, -40, 50, 50, -30, -50, -10, 0, 0.9), { fy: 10 }),
  lariatFollow: Object.assign(P(26, 88, 12, -65, 35, 48, -32, -52, -12, 0, 1.3), { fy: -55 }),
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
  // 勝利ポーズ
  flexWin:      P(-6, 160, 130, 160, 130, 22, -26, -22, -24, 0, 0.1),
  pointUp:      P(-4, 178, 0, 70, 120, 22, -26, -22, -24, 0, 0.3),
  kSheathe:     Object.assign(P(6, 15, 100, 25, 110, 14, -14, -16, -12, 0, -0.5), { wr: 180 }),
  bowRest:      P(4, 10, 25, 75, 70, 14, -12, -16, -10, 0, 0.3),
  agentWin:     P(-6, 150, 150, 10, 115, 16, -10, -24, -14, 0, 0.45),
  // ダッシュ攻撃
  tackle:       P(38, 5, 130, 70, 100, 50, -70, -45, -15, 0, 0.9),
  kneeStrike:   P(-6, 40, 110, 10, 120, 110, -150, -30, -40, 0, 0.3),
  // 回避
  dodgeSpot:    P(-14, 60, 130, 50, 125, 40, -75, -35, -55, 0, -1),
  dodgeAir:     P(0, 70, 120, 60, 125, 80, -120, 40, -110, 0, -0.6),
  // 武器ごとの構え（立っているとき）
  // ロボ（重い・大きい）
  idle_mech:    P(8, 32, 72, 22, 84, 30, -40, -26, -30, 0, 0.25),
  idle2_mech:   P(9, 34, 74, 24, 86, 31, -43, -27, -33, 0, 0.22),
  jetFly:       P(10, 150, 10, -30, 25, 6, -18, -10, -28, 0, 0.3),
  beamCharge:   P(4, 92, 0, 70, 45, 34, -30, -32, -20, 0, 0.65),
  beamFire:     P(-8, 92, 0, 62, 55, 38, -36, -34, -14, 0, 0.5),
  rocketWind:   P(-12, -40, 100, 60, 60, 28, -40, -30, -20, 0, -0.9),
  rocketPunch:  P(28, 92, 0, -30, 60, 52, -42, -42, -5, 0, 1.0),
  poundWind:    P(-10, 175, 20, 170, 20, 30, -50, -26, -50, 0, 0),
  pound:        P(48, 62, 10, 56, 10, 72, -122, -42, -40, 0, 0),
  mechWin:      P(4, 165, 8, 22, 92, 30, -30, -26, -26, 0, 0.35),
  idle_bow:     P(8, 18, 35, 20, 75, 24, -30, -20, -22, 0, 0.2),
  idle2_bow:    P(10, 20, 40, 22, 80, 27, -36, -18, -28, 0, 0.18),
  idle_katana:  P(12, 50, 70, 40, 95, 28, -38, -22, -26, 0, 0.25),
  idle2_katana: P(14, 54, 74, 42, 98, 31, -44, -20, -32, 0, 0.2),
  // 狐の剣士（刀は前の手に持ち、前腕の向きに伸びる）
  kReady:       P(12, 55, 70, 40, 90, 25, -30, -25, -12, 0, 0.2),
  kSlashWind:   P(-8, 150, 30, 120, 50, 30, -35, -25, -10, 0, -0.6),
  kSlash:       P(25, 80, 0, 30, 60, 45, -45, -35, -5, 0, 0.7),
  kSlashLow:    P(30, 40, 0, 10, 60, 50, -60, -35, -5, 0, 0.8),
  kRise:        P(5, 140, 0, 40, 70, 30, -30, -25, -10, 0, -0.4),
  kThrustWind:  P(5, 40, 120, 30, 110, 35, -45, -25, -15, 0, -0.7),
  kThrust:      P(30, 75, 0, -40, 60, 70, -60, -40, 0, 0, 0.9),
  kUpWind:      P(15, 20, 30, 20, 60, 50, -70, -15, -40, 0, -0.3),
  kUpArc:       P(-10, 175, 0, 60, 80, 20, -20, -20, -10, 0, 0.3),
  kBack:        P(5, -100, 0, 40, 80, 30, -30, -25, -10, 0, -0.3),
  kLowWind:     P(30, -75, 0, 20, 60, 72, -118, -10, -92, 0, -0.6),
  kLowSweep:    P(36, 25, 0, 10, 60, 72, -118, -10, -92, 0, 0.7),
  iaiWind:      Object.assign(P(26, 20, 100, 30, 110, 62, -92, -25, -48, 0, -1), { wr: 180 }),
  iaiSlash:     P(32, 68, 0, -60, 30, 85, -70, -45, -5, 0, 1),
  kDownThrust:  P(0, 10, 0, 20, 10, 40, -80, 10, -80),
  kCounter:     P(-5, 50, 100, 40, 110, 30, -40, -28, -10, 0, -0.3),
  kDive:        P(30, 50, 0, 40, 20, 30, -60, -20, -40),
  // エージェント（ピストルとワイヤーを使うスパイ）
  gunAim:       P(2, 90, 0, 80, 15, 28, -22, -26, -10, 0, 0.2),
  gunFire:      P(-4, 108, 0, 98, 15, 28, -22, -26, -10, 0, 0.1),
  wireThrow:    P(10, 100, 0, -20, 60, 30, -30, -25, -10, 0, 0.5),
  wireUp:       P(-5, 160, 0, 40, 60, 30, -60, -10, -40),
  placeMine:    P(55, 0, 20, 20, 80, 85, -130, -15, -100),
  splitKick:    Object.assign(P(5, 120, 0, 120, 0, 100, 0, -100, 0), { pa: 0 }),
  heelDrop:     P(-10, 60, 60, 60, 60, 150, 0, -10, -20),
  heelDropDown: P(15, 40, 40, 40, 40, 30, 0, -15, -20),
  // 覚醒の演出（サングラスを外す）
  shadeGrab:    P(2, 150, 150, -8, 35, 18, -18, -18, -8, 0, 0.3),
  shadeOff:     P(-6, 75, 15, -8, 35, 18, -18, -18, -8, 0, -0.4),
  poseCool:     P(-3, 25, 25, -25, 115, 14, -12, -22, -6, 0, 0.35),
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
// 4本足のキャラの骨の長さ（モデルの骨の長さに合わせて look.ql で上書き）
const QL = { body: 18.8, neck: 13, head: 10.5, fu: 9.6, fl: 9.5, fp: 4.2, hu: 10.1, hs: 7.4, hm: 5.4, hp: 3.2, tail: 8.2, rootF: [1.2, -2.7], rootB: [0.3, -1.8] };
// 4本足：ポーズ → 関節の位置（前向き・上がプラス、足元が原点）
//  背骨（腰 H → 背中の中ほど M → 肩 S）・首 N・頭・鼻、前足は 肩→ひじ E→手首 W→つま先 H、後ろ足は 股 Hp→ひざ K→かかと A→足 F→つま先 T
function solveQuad(p, look, plant, plantAll) {
  const L = look.ql || QL, sc = look.scale || 1;
  const v = a => [Math.cos(a * DEG), Math.sin(a * DEG)]; // 水平前向きから a 度の向き
  const add = (o, d, l) => [o[0] + d[0] * l, o[1] + d[1] * l];
  const t = p.t, sb = clamp(p.sb || 0, -40, 60);
  const C = [0, 24];
  // 背骨：丸めると真ん中が上がり、腰と肩が下がる
  const H = add(C, v(t + 180 + sb * 0.5), L.body / 2), S = add(C, v(t - sb * 0.5), L.body / 2);
  const M = add(C, v(t + 90), Math.sin(sb * DEG) * L.body * 0.18);
  const N = add(S, v(t + 66 - sb * 0.3), L.neck);
  const hd = t + (p.tw || 0) - 8;
  const head = add(N, v(hd + 18), L.head * 0.5), nose = add(head, v(hd - 12), L.head * 0.62);
  const eye = add(head, v(hd + 20), L.head * 0.35);
  // 前足（体の傾きと一緒に回る）。fa1：0 で真下、＋で前へ / fa2：＋で先が前へ（手首を返す）
  const front = (a1, a2, o) => {
    const E = add(o, dirv(a1 + t), L.fu), W = add(E, dirv(a1 + t + a2), L.fl);
    const Hh = add(W, dirv(a1 + t + a2 * 1.3 + 75), L.fp);
    return [E, W, Hh];
  };
  // 後ろ足（地面基準）。fl1：太もも（＋で前へ）/ fl2：ひざの曲げ（－で曲がる）。かかとから下は曲げに合わせて自動
  const hind = (a1, a2, o) => {
    const K = add(o, dirv(a1), L.hu), sa = a1 + a2, A = add(K, dirv(sa), L.hs);
    const ma = sa + clamp(-a2 * 1.2, 0, 95), F = add(A, dirv(ma), L.hm);
    const T = add(F, dirv(ma + 70), L.hp);
    return [K, A, F, T];
  };
  // 足の付け根（肩関節・股関節）は背骨の点から少し下
  const rot = (o, d) => { const c = Math.cos(t * DEG), s2 = Math.sin(t * DEG); return [o[0] + d[0] * c - d[1] * s2, o[1] + d[0] * s2 + d[1] * c]; };
  const SJ = rot(S, L.rootF || [0, 0]), HJ = rot(H, L.rootB || [0, 0]);
  const [fE, fW, fH] = front(p.fa1, p.fa2, SJ), [bE, bW, bH] = front(p.ba1, p.ba2, SJ);
  const [fK, fA, fF, fT] = hind(p.fl1, p.fl2, HJ), [bK, bA, bF, bT] = hind(p.bl1, p.bl2, HJ);
  const tailB = add(H, v(t + 180 + sb * 0.5), 3), tail = add(tailB, v(180 + t - (p.wr || 0)), L.tail);
  const pts = { H, M, S, N, head, nose, eye, fS: SJ, bS: SJ, fHp: HJ, bHp: HJ, fE, fW, fH, bE, bW, bH, fK, fA, fF, fT, bK, bA, bF, bT, tailB, tail };
  if (sc !== 1) for (const k in pts) pts[k] = [pts[k][0] * sc, pts[k][1] * sc];
  if (p.r) {
    const th = -p.r * DEG, c = Math.cos(th), s = Math.sin(th), O = pts.M;
    for (const k in pts) { if (k === 'M') continue; const q = pts[k], x = q[0] - O[0], y = q[1] - O[1]; pts[k] = [O[0] + x * c - y * s, O[1] + x * s + y * c]; }
  }
  if (plant) {
    let m = Math.min(pts.fH[1], pts.bH[1], pts.fT[1], pts.bT[1], pts.fF[1], pts.bF[1], pts.fW[1], pts.bW[1]);
    if (plantAll) m = Math.min(m, pts.head[1] - L.head * 0.5 * sc, pts.H[1] - 8 * sc, pts.S[1] - 8 * sc, pts.M[1] - 9 * sc);
    for (const k in pts) pts[k] = [pts[k][0], pts[k][1] - m];
  }
  return pts;
}
const KATANA_LEN = 42; // 刀の長さ（大きさ1のとき。狐は0.8倍で約34）
function dirv(a) { const r = a * DEG; return [Math.sin(r), -Math.cos(r)]; }
// ポーズ → 関節の位置（前向き・上がプラスの座標。足元が原点）
function solvePose(p, look, plant, plantAll) {
  if (look.quad) return solveQuad(p, look, plant, plantAll);
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
  const sc = look.scale || 1; // 小さいキャラ（狐の剣士など）は骨組みごと縮める
  if (sc !== 1) for (const k in pts) { if (k === 'head' || k === 'eye') continue; pts[k] = [pts[k][0] * sc, pts[k][1] * sc]; }
  if (sc !== 1) { const dx = pts.N[0] - N[0], dy = pts.N[1] - N[1]; head[0] += dx; head[1] += dy; eye[0] += dx; eye[1] += dy; }
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
  if (m.jet) m.jet.f = S(m.jet.f);
  if (m.aim) m.aim.f = SR(m.aim.f);
  if (m.twirl) m.twirl = SR(m.twirl);
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
  for (const k in (c.replaceMoves || {})) moves[k] = clone(c.replaceMoves[k]); // 覚醒などで丸ごと入れかえる技
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
/* ---------- 4本足（猫）のポーズ ----------
   Q(背骨の傾き, 手前の前足1, 2, 奥の前足1, 2, 手前の後ろ足1, 2, 奥の後ろ足1, 2, 頭の上下, しっぽ, 背中の丸め, 回転) */
function Q(t, fa1, fa2, ba1, ba2, fl1, fl2, bl1, bl2, tw = 0, wr = 70, sb = 0, r = 0) { return { t, fa1, fa2, ba1, ba2, fl1, fl2, bl1, bl2, r, tw, yw: 0, wr, pa: 0, sb, fy: 0, by: 0, fly: 0, bly: 0 }; }
Object.assign(POSES, {
  // 立ち・移動（モデルの立ち姿：前足 -11/20、後ろ足 7/-43 がまっすぐ立った形）
  q_idle:      Q(0, -9, 18, -12, 22, 8, -44, 5, -42, 0, 32, 2),
  q_idle2:     Q(1, -8, 20, -11, 24, 9, -46, 6, -44, 5, 38, 4),
  q_walk1:     Q(0, 14, 10, -24, 24, -6, -30, 22, -70, -2, 30, 2),
  q_walk2:     Q(1, -4, -20, -8, 20, 6, -44, 8, -50, 0, 32, 3),
  q_walk3:     Q(0, -24, 24, 14, 10, 22, -70, -6, -30, -2, 30, 2),
  q_walk4:     Q(1, -8, 20, -4, -20, 8, -50, 6, -44, 0, 32, 3),
  q_run1:      Q(-4, -40, 10, -34, 8, 45, -90, 40, -88, -6, 5, 20),
  q_run2:      Q(5, 20, 30, 12, 28, -10, -20, -16, -18, 4, 0, -4),
  q_run3:      Q(3, 50, 10, 44, 12, -40, -10, -46, -8, 2, -5, -14),
  q_run4:      Q(-3, 10, 15, 2, 10, 15, -60, 8, -62, -4, 2, 6),
  q_dashStart: Q(-6, -30, 20, -36, 22, 40, -90, 34, -86, -8, 5, 16),
  q_skid:      Q(6, 35, 20, 30, 22, 15, -60, 10, -58, 8, 25, -4),
  q_crouch:    Q(-2, -45, 90, -48, 92, 40, -110, 36, -108, -6, 0, 8),
  // 空中
  q_takeoff:   Q(12, 30, 10, 24, 10, -30, -10, -36, -10, 8, -5, -8),
  q_jump:      Q(6, 35, 15, 28, 12, -20, -20, -26, -18, 6, 5, -6),
  q_tuck:      Q(0, -40, 100, -44, 104, 60, -120, 54, -118, -10, -10, 28),
  q_fall:      Q(-2, 15, 10, 8, 12, 15, -40, 9, -38, -4, 25, 0),
  q_fastfall:  Q(-8, 0, 5, -5, 5, 0, -20, -6, -20, -10, 40, -4),
  q_helpless:  Q(-12, 25, -30, 15, -40, 10, -30, 0, -40, -15, 50, -10),
  // 防御・やられ
  q_shield:    Q(-3, -45, 90, -48, 92, 40, -110, 36, -108, -8, -10, 18),
  q_hurtLight: Q(-5, -18, 20, -20, 22, 12, -50, 9, -48, 10, 30, 8),
  q_hurt:      Q(-12, -30, 0, -35, 0, 5, -35, 0, -35, 15, 45, 16),
  q_hurtHigh:  Q(-22, -45, -10, -50, -10, -5, -25, -10, -25, 25, 55, -12),
  q_tumble:    Q(0, -60, -20, -70, -20, -40, -30, -50, -30, 10, 70, 24),
  q_launchFly: Q(-10, -80, -10, -90, -10, -50, -15, -60, -15, 20, 80, -18),
  q_down:      Object.assign(Q(0, 80, 0, 75, 0, -80, 0, -75, 0, -5, -20, -10), { pa: 1 }),
  q_grab:      Q(8, 55, 0, 48, 0, 0, -35, -5, -35, 0, 15, 0),
  q_hold:      Q(15, 45, -40, 40, -40, 5, -45, 0, -45, 0, 15, 4),
  q_grabbed:   Q(-20, -20, 0, -25, 0, 0, -30, -6, -30, 10, 60, 8),
  q_ledgeHang: Q(85, 95, 10, 90, 10, 0, -10, -6, -10, 10, 60, 0),
  q_ledgeClimb:Q(20, 50, -50, 45, -50, 40, -100, 35, -100, 10, 30, 16),
  q_getupSweep:Q(-5, 70, 20, -20, 10, -60, -10, 30, -80, 0, 50, 8),
  q_dodgeSpot: Q(-5, -30, 60, -35, 65, 35, -100, 30, -98, -10, 50, 20),
  q_dodgeAir:  Q(0, -40, 100, -44, 104, 60, -120, 54, -118, -10, 20, 28),
  // 攻撃（共通）
  q_swipeWind: Q(22, -30, -50, -8, 20, 4, -40, 0, -40, 6, 25, 2),
  q_swipe:     Q(16, 80, 10, -4, 20, 4, -44, 0, -42, -5, 18, 0),
  q_swipe2:    Q(18, -4, 20, 80, 10, 4, -44, 0, -42, -5, 18, 0),
  q_swipeLowW: Q(-6, -40, 40, -20, 30, 30, -95, 26, -92, -10, 5, 10),
  q_swipeLow:  Q(-10, 75, 30, -10, 30, 30, -95, 26, -92, -12, 5, 8),
  q_pounceW:   Q(-6, -45, 90, -48, 92, 45, -115, 40, -112, -4, 0, 16),
  q_pounce:    Q(8, 70, 15, 64, 15, -45, -10, -50, -8, 0, -10, -14),
  q_rear:      Q(55, 20, -50, 10, -50, -5, -30, -10, -30, 10, 25, -5),
  q_rearSlam:  Q(10, 95, 0, 90, 0, 15, -60, 10, -60, -15, 30, 10),
  q_punchWind: Q(45, -60, -40, 25, -45, -5, -30, -10, -30, 6, 30, -8),
  q_punch:     Q(24, 100, 0, 18, -40, 5, -40, 0, -42, -5, 20, 0),
  q_upClawW:   Q(8, -35, -10, -25, 20, 40, -100, 35, -98, -8, 10, 14),
  q_upClaw:    Q(60, 165, 0, 40, -40, -5, -25, -10, -25, 30, 40, -10),
  q_kickWind:  Q(-12, 30, 0, 25, 0, 50, -110, 45, -108, -6, 30, 16),
  q_bunnyKick: Q(-6, 30, -30, 24, -30, -100, 0, -95, 0, -6, 45, -14),
  q_ball:      Q(0, -40, 100, -44, 104, 66, -125, 60, -122, -20, -10, 36),
  q_stretchUp: Q(70, 175, 0, 160, 0, -20, -5, -26, -5, 20, 60, -14),
  q_diveDown:  Q(-70, 70, 0, 66, 0, -40, -10, -46, -10, -10, 70, -10),
  q_tailSpin:  Q(-4, 0, 10, -4, 10, 10, -50, 6, -48, -4, -30, 6),
  q_hiss:      Q(-2, -6, 10, -2, 10, 8, -40, 4, -40, -14, 50, 32),
  q_sitProud:  Q(40, -5, 10, 0, 10, 60, -130, 55, -128, 14, 40, -4),
  q_cast:      Q(28, 90, -10, 15, -30, 10, -50, 5, -50, 4, 30, 4),
  q_castWind:  Q(32, 15, -80, 5, -40, 10, -50, 5, -50, 8, 40, 8),
});
// 4本足キャラの共通の動き（立ち・走り・やられなど）は q_ のポーズを使う
const QPOSES = Object.create(POSES);
for (const k of ['idle', 'idle2', 'walk1', 'walk2', 'walk3', 'walk4', 'run1', 'run2', 'run3', 'run4', 'dashStart', 'skid', 'crouch',
  'takeoff', 'jump', 'tuck', 'fall', 'fastfall', 'helpless', 'shield', 'hurtLight', 'hurt', 'hurtHigh', 'tumble', 'launchFly', 'down',
  'grab', 'hold', 'grabbed', 'ledgeHang', 'ledgeClimb', 'getupSweep', 'dodgeSpot', 'dodgeAir']) QPOSES[k] = POSES['q_' + k];
QPOSES.kickWind = POSES.q_swipeWind; QPOSES.kick = POSES.q_swipe; // 崖攻撃など共通の技は、猫は引っかきで
const SPRING = {
  move: [0.62, 0.32], loco: [0.34, 0.5], air: [0.24, 0.6], hurt: [0.4, 0.62], soft: [0.26, 0.55], snap: [0.8, 0.2], land: [0.3, 0.58],
};
// 体の中心が先に動き、手足の先は少し遅れてついてくる（しなり）。1 = 体幹と同じ速さ
// 勝利ポーズ [コマ, ポーズ名]
const VICTORY = {
  fist:  [[0, 'chopWind'], [14, 'flexWin'], [40, 'flexWin'], [60, 'pointUp'], [100, 'pointUp']],
  fox:   [[0, 'kSlash'], [10, 'kUpArc'], [26, 'kSheathe'], [60, 'kSheathe']],
  bow:   [[0, 'aimUp'], [22, 'releaseUp'], [40, 'bowRest'], [70, 'bowRest']],
  agent: [[0, 'gunAim'], [16, 'agentWin'], [60, 'agentWin']],
  robot: [[0, 'beamCharge'], [18, 'poundWind'], [34, 'mechWin'], [80, 'mechWin']],
  cat:   [[0, 'q_hiss'], [16, 'q_rear'], [30, 'q_sitProud'], [70, 'q_sitProud']],
  default: [[0, 'idle'], [30, 'idle']],
};
// 回避（その場回避・前後回避・空中回避）：dur = 全体のコマ数、inv = 無敵のコマ [始まり, 終わり]
const DODGE = { spot: { dur: 26, inv: [3, 17] }, roll: { dur: 30, inv: [4, 18], dist: 115 }, air: { dur: 36, inv: [3, 22], speed: 9.5, land: 10 } };
const LAG = { t: 1, r: 1, tw: 1, yw: 1, pa: 1, sb: 1, fy: 0.85, by: 0.8, fly: 0.9, bly: 0.88, fa1: 0.85, ba1: 0.8, fl1: 0.9, bl1: 0.88, fa2: 0.68, ba2: 0.64, fl2: 0.78, bl2: 0.74, wr: 0.75 };
class Fighter {
  constructor(c, slot, battle) {
    this.c = c; this.s = tempoStats(c.stats); this.slot = slot; this.b = battle;
    this.moves = this.movesBase = buildMoves(c);
    this.projs = c.projectiles || {};
    // 覚醒（％が高くなると強化版の技に変わるキャラ）
    if (c.awaken) {
      const aw = c.awaken;
      this.cAwake = Object.assign({}, c, {
        stats: Object.assign({}, c.stats, { dmgMul: (c.stats.dmgMul || 1) * (aw.dmgMul || 1), speed: (c.stats.speed || 1) * (aw.speedMul || 1) }),
        specials: Object.assign({}, c.specials, aw.specials || {}),
        replaceMoves: aw.moves || {},
        projectiles: Object.assign({}, c.projectiles, aw.projectiles || {}),
      });
      this.movesAwake = buildMoves(this.cAwake);
    }
    // 姿を切りかえるキャラ（猫：氷 ⇔ 炎）。下Bで切りかわる。％はそのまま
    if (c.form2) {
      const F2 = c.form2;
      this.cForm2 = Object.assign({}, c, {
        name: F2.name || c.name, portrait: F2.portrait || c.portrait, stats: F2.stats || c.stats,
        specials: Object.assign({}, c.specials, F2.specials || {}), replaceMoves: F2.moves || {},
        projectiles: Object.assign({}, c.projectiles, F2.projectiles || {}),
      });
      this.movesForm2 = buildMoves(this.cForm2);
    }
    this.look = c.look || { thick: 6, head: 10 };
    this.color = slot === 0 ? '#ff5d5d' : '#4fa8ff';
    this.dark = slot === 0 ? '#b8363b' : '#2c6fb3';
    this.label = slot === 0 ? 'あなた' : 'CPU';
    this.stocks = D.rules.stocks;
    this.pad = new Pad();
    this.disp = copyPose((this.look.quad ? QPOSES : POSES).idle); this.dvel = {}; for (const k of PK) this.dvel[k] = 0;
    this.prevDisp = copyPose((this.look.quad ? QPOSES : POSES).idle);
    this.staleQ = []; // 最近当てた技（同じ技ばかり当てると弱くなる。新しい順に9個まで）
    this.spawn(slot === 0 ? -220 : 220, 0, slot === 0 ? 1 : -1);
    this.invuln = 0;
  }
  spawn(x, y, facing) {
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.vx = 0; this.vy = 0; this.kbx = 0; this.kby = 0;
    this.facing = facing; this.grounded = y >= 0; this.plat = -1; this.groundY = 0; this.dropT = 0;
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
    this.fuel = this.c.jetFuel || 0; this.jetTilt = 0;
    this.trail = []; this.trailJoint = null;
  }
  get alive() { return this.state !== 'dead'; }
  // 回避中の無敵
  dodgeInv() {
    const d = this.state === 'spotdodge' ? DODGE.spot : this.state === 'roll' ? DODGE.roll : this.state === 'airdodge' ? DODGE.air : null;
    return !!d && this.stateT >= d.inv[0] && this.stateT <= d.inv[1];
  }
  startDodge(kind, pad) {
    this.move = null; this.charging = false; this.activeF = -1;
    if (kind === 'spot') { this.state = 'spotdodge'; this.vx = 0; }
    else if (kind === 'roll') {
      this.state = 'roll'; this.rollDir = sign(pad.mx);
      this.rollFrom = this.x;
      this.facing = -this.rollDir; // 転がったあとは、来た方向（相手のいる方）を向く
      this.vx = 0;
    } else {
      this.state = 'airdodge'; this.airDodged = true; this.ff = false;
      const m = Math.hypot(pad.mx, pad.my);
      if (m > 0.35) { this.vx = pad.mx / m * DODGE.air.speed; this.vy = -pad.my / m * DODGE.air.speed; this.adDir = true; }
      else { this.vx *= 0.3; this.vy = Math.min(this.vy, 1); this.adDir = false; }
    }
    this.prevState = this.state; this.stateT = 0;
    SFX.play('dodge');
    return true;
  }
  get vc() { return this.form2 && this.cForm2 ? this.cForm2 : this.c; } // いまの姿のキャラ（名前・顔）
  toggleForm() {
    if (!this.cForm2) return;
    this.form2 = !this.form2;
    const cc = this.vc;
    this.moves = this.form2 ? this.movesForm2 : this.movesBase;
    this.s = tempoStats(cc.stats);
    this.projs = cc.projectiles || {};
    const fire = this.form2;
    this.b.fx.ring(this.x, this.y - 25, fire ? '#ff8a3c' : '#9fe8ff', 70);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      if (fire) this.b.fx.flame(this.x + Math.cos(a) * 14, this.y - 22 + Math.sin(a) * 14, 9, Math.cos(a) * 2.2, Math.sin(a) * 2.2 - 1);
      else this.b.fx.spark(this.x + Math.cos(a) * 20, this.y - 22 + Math.sin(a) * 20, 30, '#bff4ff');
    }
    this.b.flash = Math.max(this.b.flash, 2);
    SFX.play('change'); SFX.play(fire ? 'fire' : 'ice', 1);
  }
  setAwake(on) {
    if (!this.cAwake || !!this.awake === on) return;
    this.awake = on;
    const c = on ? this.cAwake : this.c;
    this.moves = on ? this.movesAwake : this.movesBase;
    this.s = tempoStats(c.stats);
    this.projs = c.projectiles || {};
  }
  hittable() {
    if (!this.alive || this.invuln > 0 || this.state === 'grabbed') return false;
    if (this.hidden) return false;
    if (this.dodgeInv()) return false;
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
    if (this.hitlag > 0) {
      this.hitlag--; if (this.shakeT > 0) this.shakeT--; if (this.hitFlash > 0) this.hitFlash--;
      if (this.sdiOK && this.state !== 'grabbed') this.sdi(pad);
      if (this.hitlag === 0) { if (this.diPend) this.applyDI(pad); this.diPend = false; this.sdiOK = false; }
      this.prevMx = pad.mx; this.prevMy = pad.my;
      return;
    }
    this.anim++;
    if (this.state !== 'move') this.hidden = false;
    if (this.invuln > 0) this.invuln--;
    if (this.flipT < 99) this.flipT++;
    if (this.ledgeCd > 0) this.ledgeCd--;
    if (this.dropT > 0) this.dropT--;
    if (this.techT > 0) this.techT--;
    if (this.techLock > 0) this.techLock--;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.armorFlash > 0) this.armorFlash--;
    if (this.landSquash > 0) this.landSquash--;
    this.jumpPressT++;
    if (this.state !== 'shield') this.shieldHP = Math.min(PH.shieldMax, this.shieldHP + PH.shieldRegen);
    // ジェットの燃料：地面にいる間に回復（空中でもほんの少し）
    if (this.c.jetFuel && !(this.state === 'move' && this.move.jet && this.charging)) this.fuel = Math.min(this.c.jetFuel, this.fuel + (this.grounded ? this.c.jetRegen || 1 : 0.1));
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
    this.prevMy = pad.my; this.prevMx = pad.mx;
    this.computePose();
  }
  runState(pad) {
    const s = this.s;
    switch (this.state) {
      case 'idle': case 'walk': case 'run': case 'crouch':
        if (!this.groundAct(pad)) {
          // すり抜け床の上でスティックを下にはじくと、下に降りる
          if (this.plat >= 0 && pad.my < -0.75 && this.prevMy >= -0.75) { this.dropThrough(); break; }
          this.groundMove(pad);
        }
        break;
      case 'squat':
        this.vx = approach(this.vx, 0, 0.3);
        if (--this.timer <= 0) this.takeoff(pad);
        break;
      case 'land': case 'shieldOff': case 'tech': case 'getup':
        this.vx = approach(this.vx, 0, PH.groundFriction);
        if (--this.timer <= 0) this.state = 'idle';
        break;
      case 'rebound': // 相殺ではじかれた
        this.vx = approach(this.vx, 0, PH.groundFriction);
        if (--this.timer <= 0) this.state = this.grounded ? 'idle' : 'air';
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
        // 回避：シールド中にスティックを下 → その場回避／横 → 前後に転がる（はじいたとき、またはシールドを出した直後）
        {
          const fresh = this.stateT < 4;
          if (pad.my < -0.7 && (fresh || this.prevMy >= -0.7)) { this.startDodge('spot', pad); break; }
          if (Math.abs(pad.mx) > 0.7 && (fresh || Math.abs(this.prevMx || 0) <= 0.7)) { this.startDodge('roll', pad); break; }
        }
        if (!pad.held.shield) { this.state = 'shieldOff'; this.timer = 7; this.shieldDownAt = this.anim; }
        break;
      case 'spotdodge':
        this.vx = approach(this.vx, 0, PH.groundFriction);
        if (this.stateT >= DODGE.spot.dur) this.state = 'idle';
        break;
      case 'roll': {
        // 速く動き出して、最後はゆっくり止まる。ステージの端からは落ちない
        const u = Math.min(1, (this.stateT + 1) / DODGE.roll.dur), e = 1 - Math.pow(1 - u, 2.2);
        const pl = this.plat >= 0 && this.b.plats ? this.b.plats[this.plat] : null;
        const lo = pl ? pl.x - pl.w / 2 + 4 : -ST.halfWidth + 6, hi = pl ? pl.x + pl.w / 2 - 4 : ST.halfWidth - 6;
        const nx = clamp(this.rollFrom + this.rollDir * DODGE.roll.dist * e, lo, hi);
        this.vx = 0; this.x = nx; this.vxSet = true;
        if (this.stateT >= DODGE.roll.dur) this.state = 'idle';
        break;
      }
      case 'airdodge': {
        const t = this.stateT;
        if (this.adDir) { const k = t < 6 ? 1 : Math.max(0, 1 - (t - 6) / 14); this.vx *= 0.9; this.vy *= 0.9; if (k === 0 && t === 20) { this.vx *= 0.5; } }
        if (t >= DODGE.air.dur) this.state = 'air';
        break;
      }
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
      case 'grabbed': {
        // つかまれている側：ボタン連打・スティックをぐるぐるで早く抜けられる
        const g = this.grabbedBy;
        if (g && g.state === 'holding') {
          let n = 0;
          for (const k of ['A', 'B', 'jump', 'shield', 'grab']) if (pad.take(k)) n++;
          const m = Math.hypot(pad.mx, pad.my), pm = Math.hypot(this.prevMx || 0, this.prevMy || 0);
          if (m > 0.6 && (pm <= 0.6 || Math.abs(Math.atan2(pad.my, pad.mx) - Math.atan2(this.prevMy || 0, this.prevMx || 0)) > 0.6)) n++;
          if (n) g.timer -= 3 * n;
        }
        break;
      }
      case 'victory':
        this.vx = 0;
        break;
    }
  }
  /* ---------- ジャンプ（小ジャンプ・大ジャンプ） ---------- */
  dropThrough() {
    this.grounded = false; this.plat = -1; this.dropT = 14; this.state = 'air'; this.vy = 1.5; this.ff = false;
  }
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
      // 走っているときのA ＝ ダッシュ攻撃
      if (this.state === 'run' && this.moves.dashAttack && Math.abs(this.vx) > this.s.run * 0.5) return this.startMove('dashAttack', pad);
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
    if (pad.held.shield) { this.state = 'shield'; this.shieldUpAt = this.anim; return true; }
    return false;
  }
  // ずらし：ヒットで止まっている間にスティックをはじくと、その方向へ少し体がずれる（連続技から抜けたり、追撃を外したりできる）
  sdi(pad) {
    const m = Math.hypot(pad.mx, pad.my), pm = Math.hypot(this.prevMx || 0, this.prevMy || 0);
    if (m < 0.7) return;
    const turned = pm >= 0.7 && Math.abs(angDiff(Math.atan2(pad.my, pad.mx), Math.atan2(this.prevMy || 0, this.prevMx || 0))) > 0.8;
    if (pm >= 0.5 && !turned) return;
    const k = PH.sdiDist || 6;
    this.x += pad.mx / m * k;
    if (!this.grounded || pad.my > 0.3) { const dy = -pad.my / m * k; if (!(this.grounded && dy > 0)) this.y += dy; }
  }
  // ベク変：吹っ飛ぶ向きに対して
  //  ・横にスティックを倒す → 飛ぶ角度が最大15度かわる
  //  ・逆向きに倒す → 飛ぶ勢いが最大5%弱まる（撃墜されにくい）／同じ向きに倒す → 3%強まる（追撃から逃げやすい）
  applyDI(pad) {
    const sp = Math.hypot(this.kbx, this.kby);
    if (sp < 0.01) return;
    const mx = pad.mx || 0, my = -(pad.my || 0); // 画面の座標（下がプラス）にそろえる
    const m = Math.hypot(mx, my);
    if (m < 0.3) return;
    const lx = this.kbx / sp, ly = this.kby / sp, sx = mx / Math.max(1, m), sy = my / Math.max(1, m);
    const cross = lx * sy - ly * sx, dot = lx * sx + ly * sy;
    const rot = clamp(cross, -1, 1) * (PH.diMaxDeg || 15) * DEG;
    const c = Math.cos(rot), s = Math.sin(rot);
    let nx = lx * c - ly * s, ny = lx * s + ly * c;
    const k = dot < 0 ? 1 + dot * (PH.lsiDown || 0.05) : 1 + dot * (PH.lsiUp || 0.03);
    this.kbx = nx * sp * k; this.kby = ny * sp * k;
    // 地上で下向きにベク変しても、床にめりこまない（床をすべる）
    const onFloor = this.y >= -2 && (Math.abs(this.x) <= ST.halfWidth || this.plat >= 0);
    if (onFloor && this.kby > 0) { this.kby = 0; this.grounded = true; this.y = this.groundY || 0; }
    if (this.grounded && this.kby >= 0) this.kby = 0;
    if (this.kby < -0.5) this.grounded = false;
    this.diApplied = { rot: rot / DEG, k };
    if (this.b.training && this.b.f[1] === this) this.b.training.traj = this.b.trajectory(this);
  }
  // ジャストガードになるか（シールドを張った直後か、離した直後に当たった）
  isParry() {
    const W = PH.parryWindow || 5;
    const ok = (this.state === 'shield' && this.shieldUpAt !== undefined && this.anim - this.shieldUpAt <= W) ||
      (this.state === 'shieldOff' && this.shieldDownAt !== undefined && this.anim - this.shieldDownAt <= W);
    if (ok && this.cpuCfg && rnd() >= (this.cpuCfg.parryChance || 0)) return false; // CPUは強さに応じた確率だけ成功
    return ok;
  }
  groundMove(pad) {
    const s = this.s, mx = pad.mx;
    // しゃがみ：スティックをほぼ真下に倒す（低くなって、吹っ飛びも少し小さくなる）
    if (pad.my < -0.6 && Math.abs(mx) < Math.abs(pad.my) * 0.75) {
      this.vx = approach(this.vx, 0, PH.groundFriction * 1.5);
      this.state = 'crouch';
      return;
    }
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
    if (pad.take('shield') && !this.airDodged) return this.startDodge('air', pad); // 空中回避（着地するまで1回）
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
    this.state = 'move'; this.move = m; this.mf = 0; this.activeF = -1; this.hidden = false;
    this.aimA = 0; this.aimHits = null; this.aimT = 0;
    this.hitRec = new Map(); this.loops = 0; this.pullTarget = null; this.moveInst = (this.moveInst || 0) + 1; this.bRev = false;
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
    // B反転：NBを出した直後にスティックを後ろへはじくと、向きと空中の勢いが反対になる
    if ((m.key === 'nspecial' || m.key === 'nspecialAir') && this.mf <= 4 && !this.bRev && pad.mx * this.facing < -0.6) {
      this.bRev = true; this.facing = -this.facing; if (!this.grounded) this.vx = -this.vx;
    }
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
    // ジェット飛行（ロボの上B）：Bを押している間、スティックの方向へ飛ぶ。燃料が切れるかBを離すと終わり（燃料が残っていれば、そのあとも動ける）
    const jt = m.jet;
    if (jt && f === jt.f && !this.chargeDone) {
      if (pad.held.B && this.fuel > 0) {
        this.chargeT++; this.charging = true; this.activeF = -1;
        let dx = pad.mx || 0, dy = pad.my || 0;
        if (Math.hypot(dx, dy) < 0.3) { dx = 0; dy = 1; }
        const l = Math.hypot(dx, dy);
        if (dx * this.facing < -0.4) this.facing = sign(dx);
        this.vx = approach(this.vx, dx / l * jt.speed, jt.accel); this.vy = approach(this.vy, -dy / l * jt.speed, jt.accel);
        this.vxSet = true; this.grounded = false; this.ff = false;
        this.fuel = Math.max(0, this.fuel - 1);
        this.jetTilt = clamp(Math.atan2(this.vx * this.facing, -this.vy) / DEG, -70, 80);
        // 背中と足から青い炎
        const bx = this.x - this.facing * 10 * (this.look.scale || 1), by = this.y - 70 * (this.look.scale || 1);
        for (let q = 0; q < 2; q++) this.b.fx.flame(bx + (rnd() - 0.5) * 8, by + (rnd() - 0.5) * 8, 6 + rnd() * 5, -this.vx * 0.4 + (rnd() - 0.5), -this.vy * 0.4 + 2.5, true);
        if (this.chargeT % 7 === 1) SFX.play('jet', this.fuel / (this.c.jetFuel || 1));
        if (this.fuel <= 0) { this.b.fx.smoke(bx, by); SFX.play('puff'); }
        return;
      }
      this.charging = false; this.chargeDone = true;
      this.endMove(); return;
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
      if (f >= 15) { this.y = 0; this.grounded = true; this.vy = 0; this.plat = -1; this.groundY = 0; }
      if (f === 2) this.freeLedge();
    }
    // 上B（復帰技）の向き：スティックを倒した方へ（真上から左右に max 度まで）。飛び始めの間は少しずつ向きを変えられる
    if (m.aim && f >= m.aim.f[0] && f <= m.aim.f[1]) this.steerAim(m, pad);
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
  steerAim(m, pad) {
    let mx = (pad.mx || 0) * this.facing, my = pad.my || 0;
    // 飛び始める前なら、うしろに倒すと振り向ける
    if (mx < -0.5 && this.mf <= m.aim.f[0] + 3) { this.facing *= -1; mx = -mx; this.aimA = 0; }
    let want = 0;
    if (Math.hypot(mx, my) > 0.3) want = clamp(Math.atan2(mx, Math.max(my, 0.0001)), -m.aim.max * DEG, m.aim.max * DEG);
    if (mx <= 0.05 && want < 0) want = 0; // 後ろ向きには曲げない（振り向いてから）
    const first = this.mf === m.aim.f[0];
    this.aimA = first ? want : this.aimA + clamp(want - this.aimA, -6 * DEG, 6 * DEG);
    const c = Math.cos(this.aimA), s = Math.sin(this.aimA);
    const rot = (x, y) => [x * c + (y - 45) * s, 45 + (y - 45) * c - x * s];
    this.aimHits = m.hits ? m.hits.map(h => { const [x, y] = rot(h.x, h.y); return Object.assign({}, h, { x, y }); }) : null;
    if (m.wireTip) this.aimTip = rot(m.wireTip[0], m.wireTip[1]);
  }
  doEvent(ev) {
    if (ev.turn) this.facing *= -1;
    if (this.aimA && ev.vy > 0 && this.move && this.move.aim) {
      // 向きをつけた上B：上向きの勢いを、決めた角度へ回す
      const c = Math.cos(this.aimA), s = Math.sin(this.aimA), vx0 = ev.vx || 0;
      this.vx = (vx0 * c + ev.vy * s) * this.facing; this.vxSet = true;
      this.vy = -(ev.vy * c - vx0 * s); this.grounded = false; this.ff = false;
    } else {
      if (ev.vx !== undefined) { this.vx = ev.vx * this.facing; this.vxSet = true; }
      if (ev.vy !== undefined) { this.vy = -ev.vy; if (ev.vy > 0) { this.grounded = false; this.ff = false; } }
    }
    // 銃口・弓の発射の閃光
    if (ev.blast) {
      const bx = this.x + ev.blast.x * this.facing, by = this.y - ev.blast.y;
      this.b.fx.ring(bx, by, ev.blast.col || '#ffd060', 54); this.b.fx.spark(bx, by, 120, ev.blast.col || '#ffd060');
      this.b.fx.smoke(bx + this.facing * 10, by); this.b.fx.smoke(bx + this.facing * 22, by - 4);
      this.b.shake = Math.max(this.b.shake, 4);
      SFX.play(this.c.weapon === 'gadget' ? 'gun' : 'shoot', 1); SFX.play('boom');
    }
    if (ev.proj) this.b.spawnProjectile(this, ev);
    // 瞬歩：姿を消す（その間は無敵）→ 相手の背中側（いなければ前）に現れる
    if (ev.vanish !== undefined) {
      this.hidden = ev.vanish;
      this.b.fx.smoke(this.x, this.y - 40); this.b.fx.smoke(this.x, this.y - 20);
      this.b.fx.ring(this.x, this.y - 40, '#cfe6ff', 36);
      if (ev.vanish) SFX.play('dodge'); else SFX.play('slash');
    }
    if (ev.warp) {
      const o = this.b.other(this), w = ev.warp;
      const ahead = o && o.alive && !o.dodgeInv() && (o.x - this.x) * this.facing > -20 && Math.abs(o.x - this.x) < w.range && Math.abs(o.y - this.y) < 120;
      let nx = ahead ? o.x + this.facing * w.behind : this.x + this.facing * w.dist;
      if (ahead) this.facing *= -1; // 背中側から相手の方を向く
      // ステージの上にいるときは、ステージから落ちない位置まで
      if (this.grounded) nx = clamp(nx, -ST.halfWidth + 10, ST.halfWidth - 10);
      this.x = nx; this.px = nx;
      if (ahead && !this.grounded) this.y = Math.min(this.y, o.y); 
    }
    if (ev.swapForm) this.toggleForm();
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
    return m.charge ? m.charge.f : m.holdShot ? m.holdShot.f : m.jet ? m.jet.f : 0;
  }
  endMove() {
    const m = this.move; this.hidden = false; this.aimA = 0; this.aimHits = null;
    this.move = null; this.charging = false; this.chargeMul = 1; this.activeF = -1;
    if (this.grabbed) this.releaseGrab();
    if (this.grounded) this.state = 'idle';
    else this.state = m && (m.helpless || (m.jet && this.fuel <= 0)) ? 'helpless' : 'air';
    this.jetTilt = 0;
  }
  activeHits() {
    if (this.state !== 'move' || !this.move.hits || this.activeF < 0) return [];
    return (this.aimHits || this.move.hits).filter(h => this.activeF >= h.f[0] && this.activeF <= h.f[1]);
  }
  activeWindow(kind) {
    if (this.state !== 'move' || !this.move[kind] || this.activeF < 0) return null;
    const w = this.move[kind];
    return this.activeF >= w.f[0] && this.activeF <= w.f[1] ? w : null;
  }
  /* ---------- ダウン・起き上がり ---------- */
  knockDown() {
    this.state = 'down'; this.downT = 0; this.grounded = true; this.y = this.groundY || 0; this.vy = 0; this.kby = 0;
    this.kbx *= 0.5; this.move = null; this.ff = false;
    this.b.fx.dust(this.x, 0, 1.3);
  }
  getUp() { this.state = 'getup'; this.timer = 22; this.invuln = Math.max(this.invuln, 22); }
  /* ---------- 崖 ---------- */
  tryLedge() {
    if (this.ledgeCd > 0 || this.grounded) return;
    const upB = this.state === 'move' && (this.move.helpless || this.move.jet);
    if (!(this.state === 'air' || this.state === 'helpless' || this.state === 'airdodge' || upB)) return;
    if (this.vy + this.kby < -1 && !upB) return;
    for (const side of [-1, 1]) {
      const lx = side * ST.halfWidth, dx = (this.x - lx) * side;
      if (dx < -10 || dx > 46) continue;
      if (this.y < 22 || this.y > 125) continue;
      const idx = side < 0 ? 0 : 1;
      const occ = this.b.ledges[idx];
      if (occ && occ !== this) {
        // 崖奪い：先につかまっている相手を、崖からはじき出す（はじかれた側は無敵なしで落ちる）
        if (occ.state !== 'ledge' || occ.ledgeT < 4) continue;
        occ.ledgeTrumped();
      }
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
    this.invuln = Math.max(this.invuln, Math.max(this.ledgeGrabs >= 4 ? 0 : 8, PH.ledgeInvuln - (this.ledgeGrabs - 1) * 14)); // 着地せずにつかみ直すほど短く、4回目以降はほぼ無し
    this.b.fx.dust(side * ST.halfWidth, 0, 0.5);
  }
  ledgeTrumped() {
    this.freeLedge();
    this.state = 'hitstun'; this.hurtKind = 'hurtLight'; this.timer = 30; this.grounded = false;
    this.kbx = -this.facing * 3.2; this.kby = -6; this.vx = this.vy = 0; this.invuln = 0; this.ledgeCd = 50;
    this.b.fx.text(this.x, this.y - 70, '崖奪い！', '#ffd34d');
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
      if (pad.take('shield')) { this.state = 'ledgeClimb'; this.timer = 0; this.climbFrom = [this.x, this.y]; this.climbRoll = true; return; } // 崖から転がって上がる
      if (free && (rel > 0.5 || pad.my > 0.5)) { this.state = 'ledgeClimb'; this.timer = 0; this.climbFrom = [this.x, this.y]; this.climbRoll = false; return; }
      if (free && (rel < -0.5 || pad.my < -0.5)) { this.dropLedge(); return; }
    }
    if (this.timer <= 0) this.dropLedge();
  }
  dropLedge() {
    this.freeLedge(); this.state = 'air'; this.vy = 1; this.x -= this.facing * 6; this.ledgeCd = PH.ledgeRegrab;
  }
  updateClimb() {
    this.timer++;
    const roll = this.climbRoll, T = roll ? 36 : 24, t = this.timer;
    if (t < (roll ? 26 : 18)) this.invuln = Math.max(this.invuln, 2);
    const side = -this.facing;
    const tx = side * ST.halfWidth - side * (roll ? 120 : 24);
    this.x = lerp(this.climbFrom[0], tx, roll ? easeOut(clamp((t - 6) / 26, 0, 1)) : easeOut(clamp((t - 8) / 14, 0, 1)));
    this.y = lerp(this.climbFrom[1], 0, easeOut(clamp(t / 12, 0, 1)));
    if (t === 3) this.freeLedge();
    if (t >= T) { this.y = 0; this.grounded = true; this.state = 'idle'; this.ledgeGrabs = 0; this.plat = -1; this.groundY = 0; }
  }
  /* ---------- つかみ・投げ ---------- */
  updateHolding(pad) {
    const t = this.grabbed;
    if (!t) { this.state = 'idle'; return; }
    this.timer--;
    this.holdT = (this.holdT || 0) + 1;
    if (this.pumCd > 0) this.pumCd--;
    if (this.pumT > 0) this.pumT--;
    // つかみ打撃：つかんでいる間にA（つかみボタン）で、少しずつダメージ
    if (this.holdT > 3 && !(this.pumCd > 0) && (pad.take('A') || pad.take('grab'))) { this.pummel(); return; }
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
  pummel() {
    const t = this.grabbed, dmg = this.c.pummel || 1.0;
    this.b.trainingHit(t, dmg);
    t.percent = Math.min(999, t.percent + dmg);
    this.hitlag = t.hitlag = 5; t.shakeT = 5; t.hitFlash = 4;
    this.pumCd = 15; this.pumT = 9;
    this.dvel.fa1 -= 26; this.dvel.t += 5; t.dvel.t -= 7;
    this.b.fx.spark(lerp(this.x, t.x, 0.6), t.y - 60 * (t.look.scale || 1), 30, '#ffffff');
    SFX.play('hitL');
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
    if (this.grounded && this.plat >= 0 && t.y > this.y - 2) { t.y = this.y; t.grounded = true; t.plat = this.plat; t.groundY = this.y; }
    else if (t.y > -2 && Math.abs(t.x) <= ST.halfWidth) { t.y = 0; t.grounded = true; t.plat = -1; t.groundY = 0; } else { t.grounded = false; t.plat = -1; }
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
      if (this.state === 'airdodge' && this.adDir && this.stateT < 20) g = 0;
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
    const plats = (this.b && this.b.plats) || [];
    const FALL = ['idle', 'walk', 'run', 'crouch', 'land', 'shield', 'shieldOff', 'shieldstun', 'squat', 'down', 'getup', 'tech', 'spotdodge', 'roll', 'rebound'];
    // すり抜け床（上に乗れる浮いた足場）
    if (this.grounded && this.plat >= 0) {
      const p = plats[this.plat];
      if (!p || this.x < p.x - p.w / 2 || this.x > p.x + p.w / 2) {
        this.grounded = false; this.plat = -1;
        if (FALL.includes(this.state)) this.state = 'air';
        if (this.state === 'holding') { this.releaseGrab(); this.state = 'air'; }
      } else if (this.kby < -0.5 || this.vy < 0) { this.grounded = false; this.plat = -1; }
      else { this.y = p.y; this.vy = 0; this.kby = 0; }
      return;
    }
    if (!this.grounded && this.dropT <= 0 && this.vy + this.kby >= 0 && !(this.pad && this.pad.my < -0.75 && this.state !== 'tumble')) {
      for (let i = 0; i < plats.length; i++) {
        const p = plats[i];
        if (this.py <= p.y + 0.5 && this.y >= p.y && this.x >= p.x - p.w / 2 && this.x <= p.x + p.w / 2) { this.land(p.y, i); return; }
      }
    }
    if (this.grounded) {
      if (this.x < L || this.x > R) {
        this.grounded = false;
        if (FALL.includes(this.state)) this.state = 'air';
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
  land(gy = 0, pi = -1) {
    const speedDown = this.vy + this.kby;
    this.y = gy; this.groundY = gy; this.plat = pi;
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
      const p = clamp((this.kby - 9) / 14, 0, 1);
      this.kby = -this.kby * 0.5; this.vy = 0;
      this.b.fx.dust(this.x, gy, 1.4 + p * 1.2); this.b.fx.dust(this.x - 20, gy, 1 + p); this.b.fx.dust(this.x + 20, gy, 1 + p);
      this.b.fx.ring(this.x, gy - 4, '#ffffff', 50 + p * 50);
      this.b.shake = Math.max(this.b.shake, 3 + p * 7); this.b.kick = [0, 6 + p * 8];
      this.dvel.t -= 25; this.dvel.fa1 += 30; this.dvel.ba1 += 30; this.dvel.fl1 += 25; // 体がはねる
      this.spinV = (this.spinV || 0) + 18 * (rnd() < 0.5 ? -1 : 1);
      SFX.play('bounce', p);
      return;
    }
    if (this.state === 'tumble') { // 地面に落ちてダウン：ドサッ
      this.b.fx.dust(this.x, gy, 1.5); this.b.shake = Math.max(this.b.shake, 2.5); SFX.play('bounce', 0.2);
    }
    this.grounded = true; this.jumps = this.s.airJumps; this.usedOnce = {}; this.ledgeGrabs = 0; this.airDodged = false;
    this.vy = 0; this.kby = 0; this.ff = false; this.shCheck = false;
    this.landSquash = 6;
    // 着地の衝撃：重いほど、速く落ちたほど、膝が深く沈む
    const imp = clamp(speedDown, 0, 16) * Math.pow((this.s.weight || 100) / 100, 0.5);
    this.dvel.fl2 -= imp * 2.4; this.dvel.bl2 -= imp * 2.4; this.dvel.fl1 += imp * 1.3; this.dvel.bl1 += imp * 0.5;
    this.dvel.t += imp * 1.3; this.dvel.fa1 -= imp * 1.2; this.dvel.ba1 -= imp * 1.2;
    if (imp > 9) this.b.shake = Math.max(this.b.shake, (imp - 9) * 0.35);
    if (imp > 4) SFX.play('land', clamp((imp - 4) / 12, 0, 1));
    switch (this.state) {
      case 'air': this.state = 'land'; this.timer = landLagT(4); break;
      case 'helpless': this.state = 'land'; this.timer = landLagT(20); break;
      case 'airdodge': this.state = 'land'; this.timer = landLagT(this.adDir ? DODGE.air.land : 3); this.vx *= 0.4; break;
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
    const P0 = this.look.quad ? QPOSES : POSES;
    switch (this.state) {
      case 'move': {
        target = this.movePose(this.move, this.holdFrame());
        if (this.aimA) { target = copyPose(target); target.r = (target.r || 0) + this.aimA / DEG * 0.85; } // 斜めに飛ぶ上Bは体ごと傾ける
        if (this.jetTilt) { target = copyPose(target); target.r = (target.r || 0) + this.jetTilt * 0.8; }
        sp = SPRING.move;
        break;
      }
      case 'idle':
        target = lerpPose(P0['idle_' + this.c.weapon] || P0.idle, P0['idle2_' + this.c.weapon] || P0.idle2, (Math.sin(this.anim * 0.07) + 1) / 2);
        if (this.landSquash > 0) target = lerpPose(target, P0.crouch, this.landSquash / 8);
        sp = SPRING.soft; break;
      case 'walk': case 'run': {
        const run = this.state === 'run';
        if (!run) this.walkClock = (this.walkClock || 0) + Math.abs(this.vx) / Math.max(1, this.s.walk) / 60; // 歩きのモーションを、歩く速さに合わせて進める
        this.walkPhase += Math.abs(this.vx) * (run ? 0.052 : 0.075);
        const ph = this.walkPhase / (Math.PI / 2), i = Math.floor(ph) % 4, u = ph - Math.floor(ph);
        const cyc = run ? [P0.run1, P0.run2, P0.run3, P0.run4] : [P0.walk1, P0.walk2, P0.walk3, P0.walk4];
        target = catmull(cyc[(i + 3) % 4], cyc[i], cyc[(i + 1) % 4], cyc[(i + 2) % 4], u);
        if (run && this.stateT < 6) target = lerpPose(P0.dashStart, target, this.stateT / 6);
        if (this.skidT > 0) target = lerpPose(target, P0.skid, 0.7);
        break;
      }
      case 'squat': case 'shieldOff': case 'tech': target = P0.crouch; sp = SPRING.snap; break;
      case 'crouch': target = copyPose(P0.crouch); target.t += Math.sin(this.anim * 0.08) * 1.5; sp = SPRING.snap; break;
      case 'rebound': target = copyPose(P0.hurtLight || P0.hurt); target.t -= 6; sp = SPRING.hurt; break;
      case 'land': target = P0.crouch; sp = SPRING.land; break;
      case 'getup': target = this.timer > 12 ? P0.crouch : P0.idle; sp = SPRING.loco; break;
      case 'air': {
        const vy = this.vy;
        if (this.ff) target = P0.fastfall;
        else if (vy < -8) target = lerpPose(P0.takeoff, P0.jump, clamp((vy + 14) / 6, 0, 1));
        else if (vy < 2) target = lerpPose(P0.jump, P0.tuck, clamp((vy + 8) / 10, 0, 1) * 0.6);
        else target = lerpPose(P0.tuck, P0.fall, clamp((vy - 0) / 6, 0, 1));
        target = copyPose(target);
        if (this.flipT < 24) { target = copyPose(lerpPose(target, P0.tuck, Math.sin(Math.PI * this.flipT / 24) * 0.9)); target.r = 360 * ease(this.flipT / 24); }
        // 空中で横に動いている向きへ、体を少し傾ける（後ろへ下がるときは反る）
        target.t += clamp(this.vx * this.facing * 1.6, -9, 9);
        sp = SPRING.air; break;
      }
      case 'helpless': target = copyPose(P0.helpless); target.t = Math.sin(this.anim * 0.15) * 8; sp = SPRING.air; break;
      case 'shield': case 'shieldstun': target = P0.shield; sp = SPRING.snap; break;
      case 'victory': {
        // 勝利ポーズ（キャラごと）
        const k = VICTORY[this.c.id] || VICTORY.default, t = this.stateT;
        let pose = POSES[k[k.length - 1][1]];
        for (let i = 0; i < k.length - 1; i++) if (t >= k[i][0] && t < k[i + 1][0]) { pose = lerpPose(POSES[k[i][1]], POSES[k[i + 1][1]], ease((t - k[i][0]) / (k[i + 1][0] - k[i][0]))); break; }
        target = copyPose(pose);
        target.t += Math.sin(this.anim * 0.06) * 1.5;
        target.yw = -40 * this.facing * clamp(t / 30, 0, 1); // 少しカメラの方を向く
        sp = SPRING.soft; break;
      }
      case 'spotdodge': {
        // その場回避：画面の奥へ一歩引いて、体をひねってかわす
        const u = this.stateT / DODGE.spot.dur;
        target = copyPose(lerpPose(P0.crouch, P0.dodgeSpot, Math.sin(Math.PI * Math.min(1, u * 1.3))));
        sp = SPRING.snap; break;
      }
      case 'roll': {
        // 前後回避：低く転がる
        const u = this.stateT / DODGE.roll.dur;
        target = copyPose(u < 0.75 ? P0.tuck : lerpPose(P0.tuck, P0.crouch, (u - 0.75) / 0.25));
        target.r = 360 * ease(Math.min(1, u / 0.75)) * (this.rollDir === this.facing ? 1 : -1) * -1;
        if (this.stateT < 3) { this.disp.r = 0; this.prevDisp.r = 0; }
        target.pa = 0;
        sp = SPRING.snap; break;
      }
      case 'airdodge': {
        const u = this.stateT / DODGE.air.dur;
        target = copyPose(lerpPose(P0.dodgeAir, P0.fall, clamp((u - 0.5) * 2, 0, 1)));
        target.yw = this.adDir ? 0 : 360 * ease(Math.min(1, u * 1.6));
        sp = SPRING.snap; break;
      }
      case 'hitstun': target = P0[this.hurtKind] || P0.hurt; sp = SPRING.hurt; break;
      case 'tumble': {
        const spd = Math.hypot(this.kbx, this.kby);
        if (this.stateT < (this.launchT || 0) && spd > 5) {
          // 飛ばされた直後：体がのびたまま、飛ぶ向きに引っぱられる（手足は風にあおられる）
          target = copyPose(P0.launchFly);
          const back = Math.atan2(this.kby, -this.kbx * this.facing) / DEG;
          target.r = clamp(-(back - 90) * 0.6, -80, 80);
          target.fa1 += Math.sin(this.anim * 0.9) * 10; target.ba1 += Math.cos(this.anim * 0.8) * 12;
          target.fl1 += Math.sin(this.anim * 0.7) * 8;
        } else {
          // きりもみ：速いほど速く回る（3Dで横にも回る）
          target = copyPose(P0.tumble);
          const rate = clamp(spd * 1.6, 5, 26) + (this.spinV || 0);
          this.spinV = (this.spinV || 0) * 0.9;
          target.r = this.disp.r - rate;
          target.yw = (this.disp.yw || 0) + clamp(spd * 0.9, 0, 14);
        }
        sp = SPRING.hurt;
        break;
      }
      case 'down': target = P0.down; sp = SPRING.hurt; break;
      case 'dizzy': target = copyPose(P0.hurt); target.t = Math.sin(this.anim * 0.1) * 15; sp = SPRING.soft; break;
      case 'holding':
        target = P0.hold;
        if (this.pumT > 0) { const k = Math.sin(Math.PI * this.pumT / 9); target = copyPose(target); target.fa1 -= 45 * k; target.fa2 += 20 * k; target.t += 8 * k; } // つかみ打撃
        break;
      case 'grabbed':
        target = copyPose(P0.grabbed); target.r = this.heldR || 0; sp = SPRING.snap;
        if (this.grounded && Math.abs(Math.sin(target.r * DEG)) > 0.7) target.pa = 1; // 寝かされている
        break;
      case 'ledge': target = copyPose(P0.ledgeHang); target.fl1 += Math.sin(this.anim * 0.05) * 6; sp = SPRING.soft; break;
      case 'ledgeClimb':
        if (this.climbRoll && this.timer >= 8) { // 崖から前転して上がる
          const u = clamp((this.timer - 8) / 22, 0, 1);
          target = copyPose(u < 0.85 ? P0.tuck : P0.crouch); target.r = -360 * ease(Math.min(1, u / 0.85)); target.pa = 0; sp = SPRING.snap;
        } else { target = this.timer < 12 ? P0.ledgeClimb : P0.crouch; sp = SPRING.loco; }
        break;
      default: target = P0.idle;
    }
    // 回避のとき、画面の奥・手前に一歩ずれる（見た目だけ）
    { const st = this.state; let dz = 0;
      if (st === 'spotdodge') dz = -38 * Math.sin(Math.PI * Math.min(1, this.stateT / DODGE.spot.dur));
      else if (st === 'roll') dz = 22 * Math.sin(Math.PI * Math.min(1, this.stateT / DODGE.roll.dur));
      this.prevDepth = this.depthZ || 0; this.depthZ = lerp(this.depthZ || 0, dz, 0.5); }
    // 回転の数値が大きく飛ぶとき（360度回った後など）は、近い向きにそろえる
    for (const key of ['r', 'yw', 'wr']) {
      const dr = target[key] - this.disp[key];
      if (Math.abs(dr) > 180) { const n = Math.round(dr / 360) * 360; this.disp[key] += n; this.prevDisp[key] += n; }
    }
    let k = sp[0], dmp = sp[1];
    // 攻撃のリズム：ため（じわっと）→ 当たる瞬間（一気に）→ 当てたあと（体が流れて、重く戻る）
    if (this.state === 'move' && this.move.hits && this.move.hits.length && this.activeF >= 0) {
      const m = this.move, f = this.activeF;
      if (f < m.firstHit - 1) k *= 0.8;
      else if (f <= m.lastHit + 1) { k = Math.max(k, 0.82); dmp = 0.22; }
      else { k *= 0.4; dmp = 0.7; }
    }
    // 重いキャラほど、ゆっくり大きく動く（歩き・走りのくり返しの動きには使わない）
    const loco = this.state === 'walk' || this.state === 'run' || this.state === 'idle';
    if (!loco) k = Math.min(0.9, k / Math.pow((this.s.weight || 100) / 100, 0.35));
    for (let i = 0; i < PK.length; i++) {
      const key = PK[i];
      const kk = loco ? k : k * (LAG[key] || 1);
      const v = this.dvel[key] * dmp + (target[key] - this.disp[key]) * kk;
      this.dvel[key] = v; this.disp[key] += v;
    }
    // 手の位置（武器と軌跡の描画用）
    const pts = solvePose(this.disp, this.look, this.grounded, this.state === 'down');
    this.hand = [this.x + pts.fH[0] * this.facing, this.y - pts.fH[1]];
    if (this.look.quad) { // 4本足：くらい判定は腰〜頭（少し内側）
      const a = pts.H, b = pts.head, r = this.look.hurtR || 13;
      this.qcap = [a[0] + (b[0] - a[0]) * 0.08, a[1] + (b[1] - a[1]) * 0.08, b[0] - 2, b[1] + 10 * (this.look.scale || 1), r]; // 耳の高さまで
    }
    this.updateWhipTip();
    this.updateTrail(pts);
  }
  movePose(m, f) {
    const k = m.poses;
    const PS = this.look.quad ? QPOSES : POSES;
    const get = e => (e[2] ? Object.assign(copyPose(PS[e[1]]), e[2]) : PS[e[1]]);
    if (!k || !k.length) return PS.idle;
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
    // ワイヤー（エージェント）：技の間だけ、手からフックまでワイヤーをのばす
    const m = this.state === 'move' ? this.move : null;
    if (m && m.wire) {
      const f = this.activeF >= 0 ? this.activeF : 0, [w0, w1] = m.wire;
      let tx, ty;
      if (m.wireTip) { [tx, ty] = (m.aim && this.aimA && this.aimTip) ? this.aimTip : m.wireTip; }
      else { const far = m.hits.reduce((a, h) => (Math.abs(h.x) > Math.abs(a.x) ? h : a), m.hits[0]); tx = far.x; ty = far.y; }
      if (!this.wireOn) { this.wireOn = true; this.tip = this.hand.slice(); SFX.play('wire'); }
      // 出る（4コマ）→ 止まる → 戻る（6コマ）
      const out = clamp((f - w0) / 4, 0, 1), back = clamp((f - w1) / 6, 0, 1), k = f < w0 ? 0 : out * (1 - back);
      const end = [this.x + tx * this.facing, this.y - ty];
      if (this.pullTarget && this.pullTarget.alive) { end[0] = this.pullTarget.x; end[1] = this.pullTarget.y - 50 * (this.pullTarget.look.scale || 1); }
      this.tip = [lerp(this.hand[0], end[0], k), lerp(this.hand[1], end[1], k)];
      this.wireK = k;
      return;
    }
    if (this.wireOn) { this.wireOn = false; this.wireK = 0; }
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
      // 軌跡は「先（手・足・刀の先）」と「根元（ひじ・ひざ・刀のつば）」の2点：その間をなでた面が、3Dの残像の帯になる
      let p;
      const W = (q) => [this.x + q[0] * this.facing, this.y - q[1]];
      if (this.trailJoint === 'tip') p = this.tip.slice().concat(this.hand);
      else {
        const j = this.trailJoint, q = pts[j];
        const baseK = this.look.quad ? { fH: 'fW', bH: 'bW', fF: 'fA', bF: 'bA' }[j] : { fH: 'fE', bH: 'bE', fF: 'fK', bF: 'bK' }[j];
        let ex = 0, ey = 0, base = pts[baseK] || q;
        if (j === 'fH' && (this.c.weapon === 'bow' || this.c.weapon === 'mirror' || this.c.weapon === 'katana')) {
          const e = pts.fE, dx = q[0] - e[0], dy = q[1] - e[1], l = Math.hypot(dx, dy) || 1;
          const L = this.c.weapon === 'katana' ? KATANA_LEN * (this.look.scale || 1) : 14; // 刀は刀の先の軌跡
          ex = dx / l * L; ey = dy / l * L;
          if (this.c.weapon === 'katana') base = q; // 刀は、つばから先までの帯
        }
        // 根元は先から少しだけ（帯の太さ）
        const bx = base[0] - (q[0] + ex), by = base[1] - (q[1] + ey), bl = Math.hypot(bx, by) || 1, wdt = this.c.weapon === 'katana' ? bl : Math.min(bl, 16 * (this.look.scale || 1));
        p = W([q[0] + ex, q[1] + ey]).concat(W([q[0] + ex + bx / bl * wdt, q[1] + ey + by / bl * wdt]));
      }
      this.trail.push(p);
      if (this.trail.length > 9) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
  }
}

/* =====================================================================
   飛び道具
   ===================================================================== */
class Projectile {
  constructor(o) { Object.assign(this, o); this.hitRec = new Map(); this.age = 0; this.dead = false; this.px = this.x; this.py = this.y; }
  update(b) {
    this.px = this.x; this.py = this.y; this.age++;
    if (this.grip && !(this.grip.alive && this.grip.state === 'hitstun')) this.grip = null; // 巻き込んだ相手が抜けた
    if (this.grip && this.life < 3) this.life = 3; // 巻き込んでいる間は最後の一撃まで消えない
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
    } else if (this.type === 'beam') {
      this.len = Math.min(this.maxLen, this.len + 80);
    } else if (this.type === 'drill') {
      // 螺旋矢：まっすぐ進む。相手を巻き込んでいる間はゆっくり（削っている感じ）
      const k = this.grip ? 0.32 : 1;
      this.x += this.vx * k; this.y += this.vy * k;
      if (this.grip && this.grip.alive && this.grip.state === 'hitstun') {
        const g = this.grip, sc = g.look.scale || 1;
        g.x += (this.x + Math.sign(this.vx) * 14 - g.x) * 0.45; g.y += (this.y + 45 * sc - g.y) * 0.45;
        if (g.y > 0 && Math.abs(g.x) <= ST.halfWidth && g.grounded) g.y = 0;
        if (this.age % 3 === 0) b.fx.spark(this.x + Math.sign(this.vx) * 10, this.y, 30, '#ffe9a8');
      }
      if (this.y >= 0 && this.y < ST.thickness && Math.abs(this.x) <= ST.halfWidth && !this.grip) { this.dead = true; b.fx.dust(this.x, 0, 0.6); }
    } else if (this.type === 'shock') {
      this.x += this.vx;
      if (Math.abs(this.x) > ST.halfWidth) this.dead = true;
    } else if (this.type === 'bullet' || this.type === 'wave' || this.type === 'shard' || this.type === 'fireball') {
      if (this.type === 'fireball') b.fx.flame(this.x - this.vx * 0.8 + (rnd() - 0.5) * this.r, this.y + (rnd() - 0.5) * this.r, 4 + this.r * 0.45, -this.vx * 0.1, -0.8);
      if (this.type === 'wave') { this.vx *= 0.96; }
      this.x += this.vx; this.y += this.vy;
      if (this.y >= 0 && this.y < ST.thickness && Math.abs(this.x) <= ST.halfWidth) { this.dead = true; b.fx.dust(this.x, 0, 0.3); }
    } else if (this.type === 'mine') {
      // 地雷：ステージの上なら床に置かれる。外なら落ちていく
      if (!this.onGround) {
        this.vy = Math.min(this.vy + 0.6, 14); this.y += this.vy;
        if (this.y >= 0 && this.py <= 0 && Math.abs(this.x) <= ST.halfWidth) { this.y = 0; this.vy = 0; this.onGround = true; }
        if (this.y > 700) this.dead = true;
      }
      this.armed = this.age >= this.arm;
    } else if (this.type === 'smoke') {
      // 煙幕弾：飛んでいって、地面か一定時間で煙になる
      if (!this.cloud) {
        this.vy += this.grav; this.x += this.vx; this.y += this.vy;
        const hitFloor = this.y >= 0 && this.py <= 0 && Math.abs(this.x) <= ST.halfWidth;
        if (hitFloor || this.age > 26) {
          if (hitFloor) this.y = -10;
          this.cloud = true; this.vx = this.vy = 0; this.r = this.cloudR || 55; this.life = Math.min(this.life, this.cloudLife || 120);
          b.fx.ring(this.x, this.y - 20, '#9aa3b8', 70); SFX.play('puff');
        }
        if (this.y > 700) this.dead = true;
      }
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
  text(x, y, s, color) { this.add({ k: 'text', x, y, s, color, life: 40 }); }
  smoke(x, y) { this.add({ k: 'smoke', x, y, life: 26, size: 7 + rnd() * 5 }); }
  ko(x, y, color) { this.add({ k: 'ko', x, y, color, life: 64, rays: Array.from({ length: 14 }, () => [rnd() * 1.4 - 0.7, 0.5 + rnd() * 0.8]) }); }
  meteor(x, y) { this.add({ k: 'meteor', x, y, life: 26 }); this.ring(x, y, '#ffb13b', 70); }
  // 吹っ飛びの煙（heat が高いほど大きく、オレンジに光る）
  puff(x, y, size, heat, vx, vy) { this.add({ k: 'puff', x, y, vx: vx || 0, vy: vy || 0, life: 22 + heat * 16, size, heat, rot: rnd() * 6 }); }
  // 炎：黄色 → オレンジ → 赤 → けむり
  flame(x, y, size, vx, vy, blue) { this.add({ k: 'flame', x, y, vx: vx || 0, vy: vy || -1.2, life: 16 + rnd() * 10, size, blue }); }
  // 吹っ飛びのスピード線（前のコマの位置から今の位置まで）
  streak(x0, y0, x1, y1, w, heat) { this.add({ k: 'streak', x: x1, y: y1, x0, y0, w, heat, life: 10 }); }
  // 強い一撃の衝撃（飛ぶ方向にトゲがのびる）
  impact(x, y, power, ang, color) { this.add({ k: 'impact', x, y, power, ang, color, life: 14 + Math.min(10, power / 20), rays: Array.from({ length: 9 }, (_, i) => [(i - 4) * 0.16 + (rnd() - 0.5) * 0.12, 0.6 + rnd() * 0.6]) }); }
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
// ワンパターン相殺（本家と同じ考え方）：最近当てた9個の技の中に同じ技があるほど弱くなる。1つもなければ1.05倍
const STALE = [0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01];
function staleMul(a, key, inst) {
  if (!key || !a.staleQ) return 1;
  let m = 1, hit = false;
  // 連続ヒットする技の2発目以降は、その技自身の記録を数えない
  for (let i = a.lastStaleInst === inst ? 1 : 0; i < a.staleQ.length; i++) if (a.staleQ[i] === key) { m -= STALE[i]; hit = true; }
  return hit ? m : 1.05;
}
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function capsuleHit(f, x, y, r) {
  const [ax, ay, bx, by, rr] = capsuleOf(f);
  const vx = bx - ax, vy = by - ay;
  const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  const dx = x - (ax + vx * t), dy = y - (ay + vy * t);
  return dx * dx + dy * dy <= (r + rr) * (r + rr);
}
// くらい判定（カプセル形）：[下の点x, y, 上の点x, y, 太さ]
function capsuleOf(f) {
  const s = f.look.scale || 1; // 小さいキャラは、くらう範囲も小さい
  let ax = f.x, ay = f.y - 10 * s, bx = f.x, by = f.y - 82 * s, rr = 15 * Math.sqrt(s);
  if (f.qcap && f.state !== 'ledge') { // 4本足：腰から頭までの横長のくらい判定（立ち上がれば縦になる）
    const q = f.qcap; ax = f.x + q[0] * f.facing; ay = f.y - q[1]; bx = f.x + q[2] * f.facing; by = f.y - q[3]; rr = q[4];
    if (f.state === 'crouch') { ay = f.y - q[1] * 0.75; by = f.y - q[3] * 0.7; }
  } else if (f.state === 'crouch') by = f.y - 52 * s; // しゃがむと上半分には当たらない
  return [ax, ay, bx, by, rr];
}

/* =====================================================================
   CPU
   ===================================================================== */
class CpuBrain {
  constructor(me, battle, level) {
    this.me = me; this.b = battle; this.pad = me.pad;
    this.cfg = D.cpu.levels[level] || D.cpu.levels[D.cpu.default];
    me.cpuCfg = this.cfg;
    this.style = (me.c.cpu && me.c.cpu.style) || 'mid';
    this.range = (me.c.cpu && me.c.cpu.range) || 80;
    this.wait = 30; this.plan = null; this.techDecided = false; this.ledgeWait = -1;
  }
  step() {
    const me = this.me, p = this.pad, op = this.b.other(me), cfg = this.cfg;
    p.held.A = p.held.B = p.held.C = p.held.grab = false;
    if (!me.alive || this.b.over) { p.mx = p.my = 0; p.held.shield = p.held.jump = false; return; }
    // ヒットで止まっている間：ベク変の向きを決める（強いCPUほど上手）
    if (me.hitlag > 0 && me.diPend) {
      if (this.diFor !== me.kbx + ',' + me.kby) { this.diFor = me.kbx + ',' + me.kby; this.di = rnd() < (cfg.diSkill ?? 0.5) ? this.bestDI() : null; }
      if (this.di) { p.mx = this.di[0]; p.my = this.di[1]; } else { p.mx = p.my = 0; }
      return;
    }
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
    // つかまれたら、連打して抜ける（強いCPUほど速い）
    if (me.state === 'grabbed') { if (rnd() < 0.06 + cfg.aggression * 0.14) p.press('A'); return; }
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
        if (r < 0.32) p.mx = me.facing;
        else if (r < 0.55) p.press('jump');
        else if (r < 0.75) p.press('shield'); // 転がって上がる
        else p.press('A');
      }
      return;
    }
    this.ledgeWait = -1;
    if (this.recover()) return;
    // 姿を切りかえるキャラ（猫）：相手が遠いときに、ときどき下Bで氷⇔炎を切りかえる（相手が弱っていれば炎、元気なら氷）
    if (me.cForm2 && me.state === 'idle' && Math.abs(op.x - me.x) > 200 && (this.formCd = (this.formCd || 0) - 1) <= 0) {
      this.formCd = 240 + ((rnd() * 240) | 0);
      const wantFire = op.percent > 70;
      if (wantFire !== !!me.form2 && rnd() < 0.7) { p.mx = 0; p.my = -1; p.press('B'); return; }
    }
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
    // ジェット飛行中：Bを押したまま、ステージの端の少し上へ向かう
    if (me.state === 'move' && me.move.jet) {
      // ステージの真下にいるときは、まず外側へ出てから上へ
      const under = Math.abs(me.x) < R + 30 && me.y > -10;
      const tx = under ? sign(me.x || 1) * (R + 70) : (me.x < 0 ? L + 30 : R - 30), ty = under ? me.y - 20 : -40;
      const ex = tx - me.x, ey = ty - me.y, l = Math.hypot(ex, ey) || 1;
      p.held.B = true; p.mx = ex / l; p.my = -ey / l; return true;
    }
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
    // 相手が崖につかまっている（崖をふさがれている）ときは、早めに高く、ステージの上をねらって上Bを出す
    const op = this.b.other(me), hog = this.b.ledges[me.x < 0 ? 0 : 1] === op;
    if (me.vy > -2 && me.y > (hog ? -10 : 40) - Math.min(distEdge, 300) * 0.45) {
      p.my = 1; p.mx = toward * (hog ? 0.95 : 0.5); p.press('B');
    }
    return true;
  }
  // 一番長く生き残れるベク変（9方向をためして、場外ラインから一番遠いものを選ぶ）
  bestDI() {
    const me = this.me, z = ST.blast, sp = Math.hypot(me.kbx, me.kby);
    const lx = me.kbx / sp, ly = me.kby / sp;
    let best = null, bm = -Infinity;
    for (let i = -1; i < 8; i++) {
      const st = i < 0 ? [0, 0] : [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)];
      const sx = st[0], sy = -st[1];
      const m = Math.hypot(sx, sy);
      let kx = me.kbx, ky = me.kby;
      if (m > 0.3) {
        const cross = lx * sy - ly * sx, dot = lx * sx + ly * sy, rot = clamp(cross, -1, 1) * (PH.diMaxDeg || 15) * DEG;
        const c = Math.cos(rot), s = Math.sin(rot), k = dot < 0 ? 1 + dot * (PH.lsiDown || 0.05) : 1 + dot * (PH.lsiUp || 0.03);
        kx = (lx * c - ly * s) * sp * k; ky = (lx * s + ly * c) * sp * k;
      }
      // 飛んでいく間、場外ラインに一番近づいたときの余裕
      let x = me.x, y = me.y, vy = 0, margin = Infinity;
      for (let t = 0; t < 120; t++) {
        vy = Math.min(vy + me.s.gravity, me.s.fall);
        const v = Math.hypot(kx, ky); if (v > 0) { const ns = Math.max(0, v - PH.kbDecay); kx *= ns / v; ky *= ns / v; }
        x += kx; y += vy + ky;
        margin = Math.min(margin, x - z.left, z.right - x, z.bottom - y, y - z.top);
        if (v < 0.3) break;
      }
      // 撃墜の心配がないときは、相手から離れる向きを少し好む（追撃をかわす）
      const away = sign(me.x - this.b.other(me).x) * sx * 8;
      const score = margin + (margin > 120 ? away : 0);
      if (score > bm) { bm = score; best = st; }
    }
    return best && (best[0] || best[1]) ? best : null;
  }
  face(dir) { if (this.me.facing !== dir) { this.pad.mx = dir * 0.5; this.wait = 1; return false; } return true; }
  decide(op) {
    const me = this.me, p = this.pad, cfg = this.cfg;
    p.mx = 0; p.my = 0;
    if (!op.alive) return;
    const dx = op.x - me.x, adx = Math.abs(dx), dy = op.y - me.y, dir = sign(dx);
    if (me.state === 'holding') {
      // 投げる前に、何回かつかみ打撃
      if (this.holdSeen === undefined || me.holdT < this.holdSeen) this.pumN = (cfg.combo > 0.5 ? 2 : cfg.combo > 0.2 ? 1 : 0) + (rnd() < 0.5 ? 1 : 0);
      this.holdSeen = me.holdT;
      if (this.pumN > 0 && me.timer > 30) { this.pumN--; p.press('A'); this.wait = 16; return; }
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
      const counterer = this.style === 'counter' || (me.c.cpu && me.c.cpu.counter);
      if (counterer && rnd() < (this.style === 'counter' ? 0.45 : 0.28)) { if (this.face(dir)) { p.my = -1; p.press('B'); } return; }
      // 回避：その場回避か、相手から離れる方向へ転がる（端に追いつめられていたら相手の向こう側へ）
      if (rnd() < cfg.shieldChance * 0.6) {
        p.held.shield = true; this.plan = { type: 'shield', t: 2 };
        if (rnd() < 0.5) p.my = -1;
        else { const away = -dir, edge = Math.abs(me.x + away * 120) > ST.halfWidth - 10; p.mx = edge ? dir : away; }
        return;
      }
      if (rnd() < cfg.shieldChance) { this.plan = { type: 'shield', t: 12 + ((rnd() * 14) | 0) }; return; }
    }
    if (!me.grounded && me.state === 'air' && !me.airDodged && opAttacking && adx < 120 && Math.abs(dy) < 110 && rnd() < cfg.shieldChance * 0.5) {
      p.mx = -dir * 0.8; p.press('shield'); return;
    }
    // 飛び道具を跳ね返す
    const reflector = this.style === 'counter' || (me.c.cpu && me.c.cpu.reflect);
    if (reflector) {
      for (const pr of this.b.projectiles) {
        if (pr.owner !== me && !pr.noHit && ['arrow', 'bullet', 'wave', 'disc'].includes(pr.type) && Math.abs(pr.x - me.x) < 180 && Math.abs(pr.y - (me.y - 50)) < 80 && sign(pr.vx) === -sign(pr.x - me.x)) {
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
      // 地雷をしかける（1個まで）
      if (me.c.cpu && me.c.cpu.mine && me.grounded && adx > 200 && rnd() < 0.18 &&
          !this.b.projectiles.some(q => q.maker === me && q.type === 'mine')) { p.my = -1; p.press('B'); return; }
      // ワイヤーで引き寄せる
      if (me.moves.sspecial && me.moves.sspecial.wire && me.grounded && adx > 100 && adx < 165 && Math.abs(dy) < 40 && rnd() < 0.3) { p.mx = dir; p.press('B'); return; }
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
        else if (this.style === 'mid' && adx < 330 && adx > 140 && rnd() < 0.15 && me.moves.nspecial && me.moves.nspecial.events && me.facing === dir) { p.mx = 0; p.press('B'); }
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
    this.frame = 0; this.shake = 0; this.flash = 0; this.kick = null;
    this.cine = null; this.cineCd = 0; this.slowPhase = 0; this.awaken = null;
    this.over = false; this.overT = 0; this.winner = null;
    this.phase = 'ready'; this.phaseT = 0; this.plats = []; // ready（3・2・1・GO!）→ fight → （決着）→ victory
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
    if (this.awaken) { this.slowPhase = 0; this.stepAwaken(); return; }
    this.slowPhase = 0;
    this.frame++;
    this.prevCam = { ...this.cam };
    // 試合開始のカウントダウン：3・2・1 の間は動けない
    if (this.phase === 'ready') {
      this.phaseT++;
      for (const f of this.f) f.pad.clear();
      if (this.phaseT === 1 || this.phaseT === 51 || this.phaseT === 101) SFX.play('count');
      if (this.phaseT >= 150) { this.phase = 'fight'; this.goAt = this.frame; SFX.play('go'); }
    } else if (this.training && this.training.cpu !== 'fight') this.trainingCpu();
    else this.cpu.step();
    if (this.training) { const d = this.f[1], tr = this.training; if (tr.comboT > 0 && !(d.state === 'hitstun' || d.state === 'tumble' || d.hitlag > 0)) tr.comboT = Math.min(tr.comboT, 60) - 1; }

    // 決着後：勝った方の勝利ポーズ
    if (this.over && this.overT === 110 && this.winner) this.startVictory(this.winner);
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
    this.updateOutfits();
    this.checkKO();
    this.updateCamera();
    this.fx.update();
    for (const f of this.f) {
      // 吹っ飛びの軌跡：煙（強いほど大きく光る）とスピード線
      const sp = Math.hypot(f.kbx, f.kby);
      if (f.state === 'tumble' && f.alive && f.hitlag <= 0 && sp > 4) {
        const heat = clamp(((f.launchKB || 0) - 90) / 110, 0, 1), cy = f.y - 45 * (f.look.scale || 1);
        if (this.frame % 2 === 0) this.fx.puff(f.x - f.kbx * 0.4 + (rnd() - 0.5) * 14, cy - f.kby * 0.4 + (rnd() - 0.5) * 14, (5 + sp * 0.7 + heat * 6) * (0.7 + rnd() * 0.6), heat, -f.kbx * 0.05 + (rnd() - 0.5), -f.kby * 0.05 + (rnd() - 0.5));
        if (sp > 8) this.fx.streak(f.px, f.py - 45 * (f.look.scale || 1), f.x, cy, Math.min(26, sp * 1.2), heat);
      }
    }
    // 炎・氷の技：攻撃の出ている場所に炎／氷のきらめき
    for (const f of this.f) {
      if (f.state !== 'move' || !f.move.elem || f.hitlag > 0) continue;
      for (const h of f.activeHits()) {
        const hx = f.x + h.x * f.facing, hy = f.y - h.y;
        if (f.move.elem === 'fire') for (let q = 0; q < 2; q++) this.fx.flame(hx + (rnd() - 0.5) * h.r, hy + (rnd() - 0.5) * h.r, h.r * 0.4 + rnd() * 5, (rnd() - 0.5) * 2, -1.5 - rnd() * 2);
        else if (this.frame % 2 === 0) this.fx.spark(hx + (rnd() - 0.5) * h.r, hy + (rnd() - 0.5) * h.r, 18, '#d8f8ff');
      }
    }
    if (this.kick) { this.kick[0] *= 0.7; this.kick[1] *= 0.7; if (Math.abs(this.kick[0]) + Math.abs(this.kick[1]) < 0.3) this.kick = null; }
    if (this.shake > 0) this.shake *= 0.86;
    if (this.shake < 0.3) this.shake = 0;
    if (this.flash > 0) this.flash--;
    for (const f of this.f) f.pad.tick();
    if (this.over) this.overT++;
  }
  // ％が一定を超えると姿が変わるキャラ（エージェント：ジャケットとサングラスがとれて覚醒する）
  updateOutfits() {
    for (const f of this.f) {
      if (!f.c.model2 && !f.c.awaken) continue;
      const want = f.alive && f.percent >= (f.c.swapPct || 100);
      if (want === !!f.outfit2 || (this.awaken && this.awaken.f === f)) continue;
      if (want) {
        // このまま撃墜されそうなときは演出を出さずに変わる
        if (f.c.awaken && !this.predictKO(f)) { this.startAwaken(f); continue; }
        this.changeOutfit(f, true);
      } else this.changeOutfit(f, false);
    }
  }
  changeOutfit(f, on) {
    f.outfit2 = on; f.setAwake(on);
    if (on) {
      this.fx.ring(f.x, f.y - 60, '#fff3c4', 55); this.fx.spark(f.x, f.y - 60, 60, '#fff3c4');
      f.hitFlash = Math.max(f.hitFlash, 8);
      SFX.play('change');
    }
  }
  // 覚醒の演出：時間が止まり、カメラが寄って、サングラスを外す（「これからよ」と言っている間）
  startAwaken(f) {
    this.awaken = { f, t: 0, from: copyPose(f.disp) };
    this.cine = null; // 強烈な一撃の演出より、こちらを優先
    f.wireOn = false; f.wireK = 0;
    this.flash = Math.max(this.flash, 3);
    SFX.play('cine');
  }
  stepAwaken() {
    const a = this.awaken, f = a.f, T = ++a.t, END = 78;
    this.prevCam = { ...this.cam };
    f.px = f.x; f.py = f.y; f.prevTip = f.tip;
    copyPose(f.disp, f.prevDisp);
    for (const g of this.f) if (g !== f) { g.px = g.x; g.py = g.y; copyPose(g.disp, g.prevDisp); }
    // カメラ：彼女の上半身に寄る → 最後に戻る
    const sc = f.look.scale || 1;
    if (T < END - 10) {
      this.cam.x = lerp(this.cam.x, f.x, 0.14);
      this.cam.y = lerp(this.cam.y, f.y - 80 * sc, 0.14);
      this.cam.z = lerp(this.cam.z, clamp((view.h || 390) / 115, 1.8, 3.6), 0.12);
    }
    // しぐさ：顔に手 → サングラスを外して払う → 決めポーズ
    const keys = [[0, a.from], [10, POSES.shadeGrab], [24, POSES.shadeGrab], [32, POSES.shadeOff], [46, POSES.poseCool], [END - 8, POSES.poseCool], [END, POSES.idle]];
    let tgt = keys[keys.length - 1][1];
    for (let i = 0; i < keys.length - 1; i++) if (T >= keys[i][0] && T < keys[i + 1][0]) { tgt = lerpPose(keys[i][1], keys[i + 1][1], ease((T - keys[i][0]) / (keys[i + 1][0] - keys[i][0]))); break; }
    tgt = copyPose(tgt);
    tgt.yw = (T < END - 8 ? -55 : 0) * f.facing; tgt.r = 0; tgt.pa = 0;
    for (const k of PK) f.disp[k] = lerp(f.disp[k], tgt[k], 0.3);
    if (T === 28) { this.changeOutfit(f, true); this.flash = Math.max(this.flash, 2); }
    if (f.hitFlash > 0) f.hitFlash--;
    this.fx.update();
    if (T >= END) this.awaken = null;
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
    const base = (owner.projs || owner.c.projectiles || {})[ev.proj];
    if (!base) return;
    if (base.max) {
      const mine = this.projectiles.filter(p => p.maker === owner && p.type === base.type);
      if (mine.length >= base.max) {
        if (!base.replace) return;
        mine[0].dead = true; this.fx.smoke(mine[0].x, mine[0].y - 6); // 古い地雷は消える
      }
    }
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
    const o = { owner, maker: owner, type: base.type, r: base.r, dmg, life: base.life, mk: owner.move ? owner.move.key : null, mi: owner.moveInst,
      kang: ev.kang !== undefined ? ev.kang : base.ang, bkb, kbg, grav: base.grav || 0, decel: base.decel || 0,
      noHit: !!(ev.noHit || base.noHit), power, big: power >= 1 || !!ev.big,
      noDouble: !!ev.noDouble, elem: base.elem, // 同じ技の打撃が当たった相手には当たらない（打撃のふっとびを消さないため）
      links: base.links || 0, linkDmg: (base.linkDmg || 0) * (owner.s.dmgMul || 1), nh: 0,
      fkb: base.fkb, react: base.react, rehit: base.rehit || 0, arm: base.arm || 0, cloudR: base.cloudR,
      cloudLife: base.cloudLife || 120, boom: base.boom || 90, pierce: !!base.pierce };
    if (hs) o.grav = (base.grav || 0) * (1 - power * 0.8);
    if (base.type === 'arrow') SFX.play('shoot', power);
    if (base.type === 'bullet') SFX.play('gun', power);
    if (base.type === 'wave') SFX.play('slash');
    if (base.type === 'drill') { SFX.play('shoot', 1); SFX.play('wire'); }
    if (base.type === 'shard') SFX.play('ice', 0.4);
    if (base.type === 'fireball') { SFX.play('fire', power); o.r = base.r * (1 + power * 0.8); }
    if (base.type === 'mine') {
      // 地雷：足元の前に置く（空中なら真下に落ちる）
      Object.assign(o, { x: owner.x + (ev.x || 0) * owner.facing, y: owner.grounded ? (owner.groundY || 0) : owner.y, vx: 0, vy: 0, onGround: owner.grounded });
      this.projectiles.push(new Projectile(o));
      return;
    }
    if (base.type === 'beam') {
      // ビーム：銃口から一気にのびる光線。ためるほど太く・長く・強い
      Object.assign(o, { x: owner.x + (ev.x || 0) * owner.facing, y: owner.y - (ev.y || 0), vx: 0, vy: 0, dir: owner.facing, len: 0,
        maxLen: lerp(base.minLen, base.maxLen, power), r: lerp(base.r, base.r2 || base.r, power), life: base.life + Math.round(power * 10), pierce: true });
      SFX.play('beam', power); this.shake = Math.max(this.shake, 2 + power * 6); this.flash = Math.max(this.flash, power > 0.9 ? 3 : 1);
      this.fx.ring(o.x, o.y, '#8fe6ff', 30 + power * 40);
      owner.vx = -owner.facing * (1.5 + power * 4); owner.vxSet = true; // 反動
      this.projectiles.push(new Projectile(o));
      return;
    }
    if (base.type === 'shock') {
      if ((!owner.grounded && owner.y < -2) || owner.plat >= 0) return;
      const d = (ev.dir || 1) * owner.facing;
      Object.assign(o, { x: owner.x + d * 30, y: 0, vx: d * speed, vy: 0 });
    } else {
      let a = (ev.ang || 0) * DEG;
      if (owner.move && owner.move.aim && owner.aimA) a -= owner.aimA; // 向きをつけた上Bの矢も一緒に回す
      Object.assign(o, { x: owner.x + (ev.x || 0) * owner.facing, y: owner.y - (ev.y || 0),
        vx: Math.cos(a) * speed * owner.facing, vy: -Math.sin(a) * speed });
    }
    this.projectiles.push(new Projectile(o));
  }
  /* ---------- 当たり判定 ---------- */
  // 相殺：地上の攻撃どうしがぶつかったら、ダメージの差が小さいと両方はじかれる。差が大きいと弱い方だけはじかれる
  // 飛び道具どうし・攻撃と飛び道具も、ぶつかると消し合う
  resolveClanks() {
    const [p, q] = this.f;
    const clankable = f => f.alive && f.state === 'move' && f.hitlag <= 0 && f.grounded && !f.grabbed && !f.activeWindow('armorW') && !f.activeWindow('counter');
    const pair = (a, b) => {
      for (const h1 of a.activeHits()) {
        if (h1.grab || h1.cgrab || h1.noClank) continue;
        const x1 = a.x + h1.x * a.facing, y1 = a.y - h1.y;
        for (const h2 of b.activeHits()) {
          if (h2.grab || h2.cgrab || h2.noClank) continue;
          if (Math.hypot(x1 - (b.x + h2.x * b.facing), y1 - (b.y - h2.y)) < h1.r + h2.r) return [h1, h2, x1, y1];
        }
      }
      return null;
    };
    if (clankable(p) && clankable(q) && p.clankInst !== p.moveInst && q.clankInst !== q.moveInst && !p.hitRec.has(q) && !q.hitRec.has(p)) {
      const hit = pair(p, q);
      if (hit) {
        const [h1, h2, x, y] = hit, dp = h1.dmg * (p.chargeMul || 1), dq = h2.dmg * (q.chargeMul || 1);
        p.clankInst = p.moveInst; q.clankInst = q.moveInst;
        const rebound = (f, dmg) => { f.endMove(); f.state = 'rebound'; f.timer = Math.round(14 + dmg * 1.0); f.kbx = -f.facing * 2.5; f.charging = false; f.chargeMul = 1; };
        if (Math.abs(dp - dq) <= 9) { rebound(p, dp); rebound(q, dq); }
        else if (dp < dq) rebound(p, dp); else rebound(q, dq);
        p.hitlag = q.hitlag = 8;
        this.fx.spark(x, y, 60, '#ffe9a8'); this.fx.ring(x, y, '#ffffff', 46);
        this.fx.text(x, y - 40, '相殺', '#ffe9a8');
        this.shake = Math.max(this.shake, 3);
        SFX.play('clank');
      }
    }
    // 飛び道具どうし
    const CL = { arrow: 1, bullet: 1, wave: 1, disc: 1, shard: 1, fireball: 1, drill: 1 };
    const ps = this.projectiles.filter(o => !o.dead && !o.noHit && CL[o.type]);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const A = ps[i], B = ps[j];
      if (A.dead || B.dead || A.owner === B.owner) continue;
      // すれ違いの見落としがないよう、このコマの動き全体で一番近づいた距離で判定
      const sx = (A.px ?? A.x) - (B.px ?? B.x), sy = (A.py ?? A.y) - (B.py ?? B.y), ex = A.x - B.x, ey = A.y - B.y;
      const vx = ex - sx, vy = ey - sy, t = clamp(-(sx * vx + sy * vy) / (vx * vx + vy * vy || 1), 0, 1);
      if (Math.hypot(sx + vx * t, sy + vy * t) > A.r + B.r) continue;
      const diff = A.dmg - B.dmg;
      if (Math.abs(diff) <= 9) { A.dead = B.dead = true; }
      else if (diff > 0) { B.dead = true; A.dmg -= B.dmg; } else { A.dead = true; B.dmg -= A.dmg; }
      this.fx.spark((A.x + B.x) / 2, (A.y + B.y) / 2, 40, '#ffe9a8'); SFX.play('clank');
    }
    // 攻撃で飛び道具を打ち消す（攻撃の方が強いか、差が小さいとき）。攻撃はそのまま続く
    for (const f of this.f) {
      if (!f.alive || f.state !== 'move' || f.hitlag > 0) continue;
      const hs = f.activeHits().filter(h => !h.grab && !h.cgrab && !h.noClank);
      if (!hs.length) continue;
      for (const o of ps) {
        if (o.dead || o.owner === f) continue;
        for (const h of hs) {
          const x = f.x + h.x * f.facing, y = f.y - h.y;
          if (Math.hypot(o.x - x, o.y - y) > h.r + o.r) continue;
          if (h.dmg * (f.chargeMul || 1) + 9 >= o.dmg) {
            o.dead = true; f.hitlag = Math.max(f.hitlag, 4);
            this.fx.spark(o.x, o.y, 40, '#ffe9a8'); SFX.play('clank');
          }
          break;
        }
      }
    }
  }
  resolveHits() {
    this.resolveClanks();
    const hits = [];
    for (const a of this.f) {
      if (a.hitlag > 0 || a.state !== 'move') continue;
      const hs = a.activeHits();
      if (!hs.length) continue;
      const d = this.other(a);
      if (!d.hittable() || d === a.grabbed) continue;
      for (const hb of hs) {
        const last = a.hitRec.get(d);
        // 同じ相手には1回だけ。ただし rehit（連続ヒット）か、あとから出る別の段（f の始まりが前の命中より後）は当たる
        if (last !== undefined && !(hb.rehit && a.activeF - last >= hb.rehit) && !(hb.f[0] > last)) continue;
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
        if (p.type === 'mine' && !p.armed) continue;
        if (p.type === 'smoke' && !p.cloud) continue;
        const rw = d.activeWindow('reflect');
        if (rw && (p.type === 'arrow' || p.type === 'bullet' || p.type === 'wave' || p.type === 'disc' || p.type === 'shard' || p.type === 'fireball')) {
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
        if (!d.hittable()) continue;
        if (p.hitRec.has(d) && !(p.rehit && p.age - p.hitRec.get(d) >= p.rehit)) continue;
        if (p.type === 'beam') {
          let hx = null;
          for (let t = 0; t <= p.len; t += Math.max(6, p.r)) if (capsuleHit(d, p.x + p.dir * t, p.y, p.r)) { hx = p.x + p.dir * t; break; }
          if (hx === null) continue;
          p.hitRec.set(d, p.age);
          hits.push({ a: p.owner, d, hb: { dmg: p.dmg, ang: p.kang, bkb: p.bkb, kbg: p.kbg, elem: 'beam' }, wx: hx, wy: p.y, proj: Object.assign(p, { vx: p.dir }) });
          continue;
        }
        const py = p.type === 'mine' ? p.y - 12 : p.type === 'smoke' ? p.y - 30 : p.y;
        if (capsuleHit(d, p.x, py, p.r)) {
          p.hitRec.set(d, p.age);
          if (p.type === 'drill') {
            // 螺旋矢：links 回は巻き込み（小ダメージ・ほぼ飛ばない）→ 最後の一撃で吹っ飛ばす
            p.nh++;
            const fin = p.nh > p.links;
            if (!fin) { p.grip = d; hits.push({ a: p.owner, d, hb: { dmg: p.linkDmg, ang: 0, fkb: 0, react: 'light', link: true }, wx: p.x, wy: py, proj: p }); }
            else {
              p.dead = true; p.grip = null;
              hits.push({ a: p.owner, d, hb: { dmg: p.dmg, ang: p.kang, bkb: p.bkb, kbg: p.kbg }, wx: p.x, wy: py, proj: p });
              this.fx.ring(p.x, py, '#ffe9a8', 80); SFX.play('boom');
            }
            continue;
          }
          hits.push({ a: p.owner, d, hb: { dmg: p.dmg, ang: p.kang, bkb: p.bkb, kbg: p.kbg, fkb: p.fkb, react: p.react, elem: p.elem }, wx: p.x, wy: py, proj: p });
          if ((p.type === 'arrow' || p.type === 'bullet' || p.type === 'shard' || p.type === 'fireball') && !(p.pierce && p.big)) p.dead = true;
          if (p.type === 'fireball') { this.fx.ring(p.x, py, '#ff8a3c', 40 + p.r * 2); for (let q = 0; q < 8; q++) this.fx.flame(p.x, py, 6 + p.r * 0.5, (rnd() - 0.5) * 6, -rnd() * 4); SFX.play('fire', 0.7); }
          if (p.type === 'mine') {
            // 地雷の爆発
            p.dead = true;
            this.fx.ring(p.x, p.y - 20, '#ffb13b', p.boom); this.fx.spark(p.x, p.y - 20, p.boom * 1.8, '#ffd34d');
            for (const s of [-1, 1]) this.fx.dust(p.x + s * 30, 0, 1.6);
            this.shake = Math.max(this.shake, 9); SFX.play('boom');
          }
        }
      }
    }
    for (const h of hits) {
      if (h.proj) {
        if (h.proj.noDouble && h.proj.owner.state === 'move' && h.proj.owner.hitRec.has(h.d)) continue;
        const pv = h.proj.vx || (h.d.x - h.proj.x) || 1; // 地雷や煙は、相手を外側へ飛ばす
        this.applyHit(h.a, h.d, h.hb, sign(pv), h.wx, h.wy, true, h.proj); continue;
      }
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
  // トレーニング：連続ヒット数とダメージ（のけぞり中にもう一度当たれば「つながった」）
  trainingHit(d, dmg) {
    if (!this.training || d !== this.f[1]) return;
    const tr = this.training, stun = d.state === 'hitstun' || d.state === 'tumble' || d.state === 'grabbed' || d.hitlag > 0;
    if (stun && tr.comboT > 0) { tr.combo++; tr.comboDmg += dmg; } else { tr.combo = 1; tr.comboDmg = dmg; }
    tr.comboT = 150; tr.lastKB = 0;
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
    // 同じ技ばかり当てていると弱くなる（ワンパターン相殺）。しばらく使っていない技は少し強い
    const skey = isProj ? proj && proj.mk : a.move && a.move.key, sinst = isProj ? proj && proj.mi : a.moveInst;
    const dmg = hb.dmg * cm * staleMul(a, skey, sinst) * (isProj ? d.s.projTakenMul || 1 : 1); // projTakenMul：飛び道具に弱いキャラ（ロボット）
    // ジャストガード：シールドを張った直後・離した直後に受けると、ノーダメージで相手に大きなスキ
    if (d.isParry() && !hb.grab) {
      const hl = Math.floor(dmg * 0.35 + 4);
      d.hitlag = hl; if (!isProj) a.hitlag = hl + 12;
      d.state = 'shield'; d.shieldUpAt = -99; d.timer = 0; d.kbx = 0;
      if (!d.pad || !d.pad.held.shield) { d.state = 'idle'; }
      this.fx.ring(d.x, d.y - 48, '#ffffff', 70); this.fx.ring(d.x, d.y - 48, '#9fe8ff', 44);
      this.fx.text(d.x, d.y - 110 * (d.look.scale || 1), 'ジャストガード！', '#9fe8ff');
      this.flash = Math.max(this.flash, 2);
      SFX.play('parry');
      if (proj && proj.type !== 'smoke' && proj.type !== 'beam') proj.dead = true;
      return;
    }
    // シールド
    if (d.state === 'shield' || d.state === 'shieldstun') {
      d.shieldHP -= dmg;
      const hl = Math.floor(dmg * 0.35 + 2);
      if (!isProj) a.hitlag = hl;
      d.hitlag = hl;
      if (d.shieldHP <= 0) { d.shieldBreak(); return; }
      d.state = 'shieldstun'; d.timer = Math.floor(dmg * 0.83) + 2;
      d.kbx = dir * Math.min(8, 1.5 + dmg * 0.35);
      this.fx.ring(wx, wy, 'rgba(255,255,255,0.8)', 26);
      SFX.play('shield');
      if (proj && proj.type !== 'smoke') proj.dead = true;
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
      a.pullTarget = d;
      this.fx.spark(wx, wy, 20, '#ffe9a8');
      return;
    }
    this.trainingHit(d, dmg);
    // 当たった技を「最近使った技」に入れる（1回の技で1回だけ）
    if (skey) { const inst = sinst; if (a.lastStaleInst !== inst) { a.lastStaleInst = inst; a.staleQ.unshift(skey); if (a.staleQ.length > 9) a.staleQ.length = 9; } }
    d.percent = Math.min(999, d.percent + dmg);
    let kb = hb.fkb !== undefined ? hb.fkb : calcKB(d.percent, dmg, d.s.weight, hb.bkb, hb.kbg) * (a.s.kbMul || 1);
    if (d.state === 'crouch' && hb.fkb === undefined) kb *= 0.85; // しゃがんでいると、吹っ飛びが少し小さい
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
    // 当たった衝撃で、体がガクッと折れる（強いほど大きく）
    const jolt = clamp(kb / 40, 0.4, 4) * (hb.react === 'light' ? 0.5 : 1);
    const high = wy < d.y - 70 * (d.look.scale || 1); // 顔のあたりに当たったら上体がのけぞる、低いところなら体が折れる
    d.dvel.t += (high ? -9 : 6) * jolt; d.dvel.fa1 -= 8 * jolt; d.dvel.ba1 -= 6 * jolt; d.dvel.fl2 -= 4 * jolt;
    let hl = Math.min(26, Math.floor(dmg * PH.hitlagMul + PH.hitlagBase) + (kb > 100 ? Math.min(8, Math.round((kb - 100) * 0.05)) : 0)); // 強い一撃ほど「タメ」が長い
    if (isMeteor) hl = Math.min(26, hl + 5);
    d.hitlag = hl; d.shakeT = hl;
    if (!isProj) a.hitlag = hl;
    // ベク変・ずらしの受付：止まっている間のスティックで、止まり終わった瞬間に飛ぶ向きと勢いが変わる
    d.diPend = kb > 40 && !isMeteor && !hb.drag && !hb.link && hb.fkb === undefined;
    d.sdiOK = !hb.link;
    // 反応の種類
    if (kb > PH.tumbleKb) {
      d.state = 'tumble'; d.timer = Math.floor(kb * PH.hitstunMul * (d.s.hitstunMul || 1));
      // 吹っ飛びの演出用：飛ばされた強さと、体をのばして飛ぶ時間
      d.launchKB = kb; d.launchT = Math.round(clamp(kb * 0.09, 6, 22)); d.spinV = 0;
      if (kb > 95) SFX.play('whoosh', clamp((kb - 95) / 130, 0, 1));
    } else if ((hb.react === 'down' || (meteorGround && kb > 45)) && wasGrounded) {
      d.knockDown(); d.kbx = Math.cos(ang * DEG) * speed * dir * 0.6;
    } else {
      d.state = 'hitstun';
      d.timer = Math.max(hb.react === 'light' ? 8 : 10, Math.floor(kb * PH.hitstunMul * (d.s.hitstunMul || 1)));
      d.hurtKind = hb.react === 'light' ? 'hurtLight' : (ang > 60 && ang < 120 ? 'hurtHigh' : 'hurt');
    }
    // 巻き込み攻撃：相手を攻撃した人の前（drag の位置）へ引き寄せて、次の段につなげる
    if (hb.drag && !isProj) {
      const tx = a.x + hb.drag[0] * a.facing, ty = a.y - (hb.drag[1] || 0);
      d.kbx = (tx - d.x) * 0.22 + a.vx; d.kby = d.grounded ? 0 : (ty - d.y) * 0.22 + Math.min(0, a.vy);
      d.timer = Math.max(d.timer, 14); d.hitlag = Math.min(d.hitlag, 3); a.hitlag = Math.min(a.hitlag, 3);
    }
    if (hb.link) { d.timer = Math.max(d.timer, 14); d.hitlag = Math.min(d.hitlag, 3); d.kbx = d.kby = 0; }
    const elem = hb.elem || (!isProj && a.move && a.move.elem);
    const hcol = hb.elec || elem === 'beam' ? '#7fe3ff' : elem === 'fire' ? '#ff8a3c' : elem === 'ice' ? '#bff4ff' : kb > 150 ? '#ffd34d' : '#ffffff';
    this.fx.spark(wx, wy, kb, hcol);
    if (elem === 'fire') { for (let i = 0; i < 6 + Math.min(10, kb / 20); i++) this.fx.flame(wx, wy, 7 + rnd() * 9, (rnd() - 0.5) * 6, -rnd() * 4); SFX.play('fire', clamp(kb / 150, 0.2, 1)); }
    if (elem === 'ice') { this.fx.ring(wx, wy, '#bff4ff', 30 + kb * 0.2); for (let i = 0; i < 5; i++) this.fx.spark(wx + (rnd() - 0.5) * 30, wy + (rnd() - 0.5) * 30, 25, '#e6fbff'); SFX.play('ice', clamp(kb / 150, 0.2, 1)); }
    if (kb > 70) {
      this.fx.impact(wx, wy, kb, Math.atan2(d.kby, d.kbx), hcol);
      // 画面が飛ぶ方向にガツンと揺れる
      const kk = Math.min(16, (kb - 60) * 0.06), sp0 = Math.hypot(d.kbx, d.kby) || 1;
      this.kick = [d.kbx / sp0 * kk, d.kby / sp0 * kk];
    }
    if (hb.elec) { this.fx.ring(wx, wy, '#7fe3ff', 46); SFX.play('zap'); }
    if (kb > 110) this.shake = Math.max(this.shake, Math.min(14, (kb - 100) * 0.07));
    else if (kb > 45) this.shake = Math.max(this.shake, 1.2 + (kb - 45) * 0.02); // 軽い攻撃でも小さく揺れて手ごたえを出す
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
  // トレーニング用：これから飛んでいく線（ベク変後）
  trajectory(d) {
    const pts = []; let x = d.x, y = d.y - 40, vy = 0, kx = d.kbx, ky = d.kby;
    for (let i = 0; i < 160; i++) {
      vy = Math.min(vy + d.s.gravity, d.s.fall);
      const sp = Math.hypot(kx, ky);
      if (sp > 0) { const ns = Math.max(0, sp - PH.kbDecay); kx *= ns / sp; ky *= ns / sp; }
      x += kx; y += vy + ky;
      if (i % 3 === 0) pts.push([x, y]);
      if (y > -40 && y < ST.thickness && Math.abs(x) <= ST.halfWidth) break;
      if (sp < 0.5 && i > 40) break;
    }
    return { pts, t: 120 };
  }
  startCine(x, y, hl, meteor) {
    const lines = [];
    for (let i = 0; i < 26; i++) lines.push({ a: rnd() * Math.PI * 2, w: 0.012 + rnd() * 0.03, l: 0.55 + rnd() * 0.5 });
    this.cine = { t: 0, x, y, freeze: 6, slow: hl * 2 + 26, lines, meteor };
    this.cineCd = PH.cineCooldown;
    this.flash = Math.max(this.flash, 4);
    SFX.play('cine');
  }
  // トレーニング：相手の動き（止まる／歩く／ジャンプ／シールド）
  trainingCpu() {
    const d = this.f[1], p = d.pad, mode = this.training.cpu, t = this.frame;
    p.held.A = p.held.B = p.held.C = p.held.grab = p.held.jump = false; p.held.shield = false; p.mx = p.my = 0;
    if (!d.alive) return;
    if (mode === 'shield') p.held.shield = true;
    else if (mode === 'jump') { if (d.grounded && t % 50 === 0) p.press('jump'); }
    else if (mode === 'walk') { p.mx = Math.floor(t / 100) % 2 ? 0.5 : -0.5; if (Math.abs(d.x) > ST.halfWidth - 60) p.mx = -Math.sign(d.x) * 0.5; }
  }
  checkKO() {
    const z = ST.blast;
    for (const f of this.f) {
      if (!f.alive || f.state === 'grabbed') continue;
      if (f.x < z.left || f.x > z.right || f.y > z.bottom || f.y < z.top) {
        const cx = clamp(f.x, z.left, z.right), cy = clamp(f.y, z.top, z.bottom);
        this.fx.ko(cx, cy, f.color);
        this.shake = 16; this.flash = 6;
        SFX.play('ko'); SFX.play('blast');
        if (f.grabbed) f.releaseGrab();
        f.freeLedge();
        if (!this.training) f.stocks--; // トレーニングは何度でも
        f.state = 'dead'; f.timer = this.training ? 40 : 70; f.move = null; f.kbx = f.kby = f.vx = f.vy = 0; f.trail = [];
        if (f.stocks <= 0 && !this.over) {
          this.over = true; this.winner = this.other(f);
          SFX.play('game'); this.flash = Math.max(this.flash, 6);
          if (window.Music) window.Music.stop();
        }
      }
    }
  }
  startVictory(w) {
    this.phase = 'victory';
    w.move = null; w.charging = false; w.grabbed = null; w.kbx = w.kby = w.vx = w.vy = 0;
    w.x = clamp(w.x, -ST.halfWidth + 80, ST.halfWidth - 80); w.y = 0; w.grounded = true; w.plat = -1; w.groundY = 0;
    w.state = 'victory'; w.stateT = 0; w.prevState = 'victory'; w.facing = w.x > 0 ? -1 : 1; w.invuln = 0;
    this.projectiles = [];
    if (window.Music) window.Music.play('victory');
  }
  updateCamera() {
    // 勝利ポーズ：勝った方に寄る（右側に結果の表示を出すので、少し左に映す）
    if (this.phase === 'victory' && this.winner) {
      const w = this.winner, sc = w.look.scale || 1;
      const tz = clamp((view.h || 390) / (165 * sc), 1.5, 4), tx = w.x + (view.w || 800) * 0.2 / tz, ty = w.y - 62 * sc;
      this.cam.x = lerp(this.cam.x, tx, 0.06); this.cam.y = lerp(this.cam.y, ty, 0.06); this.cam.z = lerp(this.cam.z, tz, 0.05);
      return;
    }
    const alive = this.f.filter(f => f.alive);
    let minX = -260, maxX = 260, minY = -200, maxY = 30;
    if (alive.length) {
      minX = Math.min(...alive.map(f => f.x)); maxX = Math.max(...alive.map(f => f.x));
      minY = Math.min(...alive.map(f => f.y - 90)); maxY = Math.max(...alive.map(f => f.y));
    }
    // 近いときは寄って、離れたら引く（数値は data.js の camera）
    const C = D.camera || { minWidth: 600, padX: 360, minHeight: 300, padY: 260, centerPull: 0.12, zoomIn: 0.04, zoomOut: 0.1 };
    let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const spread = maxX - minX;
    cx = lerp(cx, 0, C.centerPull + clamp(spread / 2000, 0, 0.2)); cy = lerp(cy, -40, 0.35);
    const vw = view.w || 800, vh = view.h || 400;
    const needW = Math.max(spread + C.padX, C.minWidth), needH = Math.max(maxY - minY + C.padY, C.minHeight);
    const z = clamp(Math.min(vw / needW, vh / needH), 0.22, 3);
    if (!this.camInit) { this.cam = { x: cx, y: cy, z }; this.prevCam = { ...this.cam }; this.camInit = true; return; }
    this.cam.x = lerp(this.cam.x, cx, 0.09); this.cam.y = lerp(this.cam.y, cy, 0.08);
    this.cam.z = lerp(this.cam.z, z, z < this.cam.z ? C.zoomOut : C.zoomIn); // 引くときは早く、寄るときはゆっくり
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
  if (b.kick) { sx += b.kick[0] * 1.6; sy += b.kick[1] * 1.6; } // 吹っ飛ぶ方向への画面のゆれ
  if (use3D) {
    PROJ = window.Render3D.render(b, alpha, cam, sx, sy, view, api);
    for (const f of b.f) if (f.alive && !f.hidden && !(b.awaken && b.awaken.f === f)) drawTag(f, PROJ.X(lerp(f.px, f.x, alpha)), PROJ.Y(lerp(f.py, f.y, alpha) - (f.look.tagH || 128)));
  } else {
    if (window.Render3D && window.Render3D.ready) window.Render3D.hide();
    PROJ = make2DProj(cam, sx, sy);
    const { X, Y, z } = PROJ;
    for (const s of STARS) {
      ctx.fillStyle = `rgba(255,255,255,${s.a})`;
      ctx.fillRect((s.x - cam.x * 0.15) * 0.5 + W / 2, (s.y - cam.y * 0.15) * 0.5 + H / 2, s.s, s.s);
    }
    drawStage(X, Y, z); drawPlats(b, X, Y, z);
    for (const p of b.projectiles) drawProjectile(p, alpha, X, Y, z);
    for (const f of b.f) drawFighter(f, alpha, X, Y, z);
  }
  const { X, Y, z } = PROJ;
  if (!b.awaken && !use3D) for (const f of b.f) drawTrail(f, X, Y, z); // 3Dのときは3Dの帯（render3d）
  drawFX(b.fx, X, Y, z);
  if (DEBUG || (b.training && b.training.hit)) drawDebug(b, X, Y, z);
  if (b.training && b.training.traj && b.training.traj.t > 0) {
    // 吹っ飛びの軌道（ベク変の効果が見える）
    const tj = b.training.traj; tj.t--;
    ctx.save(); ctx.globalAlpha = Math.min(1, tj.t / 30) * 0.9; ctx.setLineDash([6, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff6b6b';
    ctx.beginPath(); tj.pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke(); ctx.restore();
  }
  if (b.training) drawTraining(b);
  if (cw > 0) drawCine(b, X, Y, z, cw, tick);
  if (b.awaken) drawAwaken(b, X, Y, z, tick);
  drawMatchText(b, tick);
  if (b.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${b.flash * 0.05})`; ctx.fillRect(0, 0, W, H); }
  if (b.phase !== 'victory') { drawHUD(b); drawControls(); }
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
// 「3・2・1・GO!」と「GAME!」の大きな文字
function drawMatchText(b, tick) {
  let text = null, u = 0, col = '#ffffff', size = 1;
  if (b.phase === 'ready') {
    const t = b.phaseT + tick, n = 3 - Math.floor(t / 50);
    if (n >= 1) { text = String(n); u = (t % 50) / 50; col = ['#5ad1ff', '#ffd54a', '#ff6a6a'][n - 1]; }
  } else if (b.goAt !== undefined && b.frame - b.goAt < 45 && !b.over) { text = 'GO!'; u = (b.frame - b.goAt + tick) / 45; col = '#ffd54a'; size = 1.25; }
  if (b.over && b.overT < 105) { text = 'GAME!'; u = Math.min(1, (b.overT + tick) / 105); col = '#ffffff'; size = 1.3; }
  if (!text) return;
  const W = view.w, H = view.h;
  const pop = u < 0.15 ? 0.6 + (u / 0.15) * 0.55 : u < 0.25 ? 1.15 - (u - 0.15) * 1.5 : 1;
  const a = u > 0.8 ? 1 - (u - 0.8) / 0.2 : 1;
  const fs = Math.min(W, H) * 0.28 * size * pop;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, H * 0.42); ctx.rotate(-0.06);
  ctx.font = `900 ${fs}px "Arial Black", "Hiragino Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.12; ctx.strokeStyle = '#141a3a'; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = col; ctx.fillText(text, 0, 0);
  ctx.lineWidth = fs * 0.03; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.strokeText(text, 0, 0);
  ctx.restore();
}
// 覚醒の演出：まわりを暗くして、映画のような帯と光の粒
function drawAwaken(b, X, Y, z, tick) {
  const a = b.awaken, f = a.f, W = view.w, H = view.h, t = a.t + tick, END = 78;
  const w = ease(Math.min(clamp(t / 8, 0, 1), clamp((END - t) / 10, 0, 1)));
  const sc = f.look.scale || 1, x = X(f.x), y = Y(f.y - 75 * sc), R = Math.hypot(W, H);
  const g = ctx.createRadialGradient(x, y, R * 0.08, x, y, R * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(4,0,12,${0.82 * w})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // サングラスを外した瞬間の光
  if (t > 27 && t < 44) {
    const u = (t - 27) / 17;
    ctx.globalAlpha = (1 - u) * 0.75; ctx.fillStyle = '#fff6dc';
    ctx.beginPath(); ctx.arc(x, y - 12 * z, (10 + 70 * u) * Math.max(0.6, z * 0.5), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // ゆっくり上る光の粒
  ctx.fillStyle = `rgba(255,236,190,${0.75 * w})`;
  for (let i = 0; i < 18; i++) {
    const px = x + Math.sin(i * 7.3) * W * 0.32, py = y + H * 0.5 - ((t * (1.5 + (i % 4) * 0.6) + i * 37) % (H * 0.9));
    ctx.beginPath(); ctx.arc(px, py, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
  const bar = H * 0.1 * w;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
}
function drawPlats(b, X, Y, z) {
  ctx.fillStyle = '#8a92d8';
  for (const p of b.plats || []) { ctx.fillRect(X(p.x - p.w / 2), Y(p.y), p.w * z, 6 * z); }
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
  const dodge = f.dodgeInv && f.dodgeInv();
  if (dodge && f.hitFlash <= 0) { col = mixHex(col, '#d8ecff', 0.45); dark = mixHex(dark, '#b8d4f0', 0.45); }
  return { col, dark, dodge };
}
function interpPose(f, alpha) { return lerpPose(f.prevDisp, f.disp, alpha); }
function drawFighter(f, alpha, X, Y, z) {
  if (!f.alive || f.hidden) return;
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
  } else if (w === 'katana') {
    const L = KATANA_LEN * (f.look.scale || 1) * z;
    ctx.strokeStyle = '#e8eef8'; ctx.lineWidth = Math.max(1.5, 2.6 * z);
    ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(h[0] + dx * L, h[1] + dy * L); ctx.stroke();
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = Math.max(2, 3.5 * z);
    ctx.beginPath(); ctx.moveTo(h[0] - dx * 6 * z, h[1] - dy * 6 * z); ctx.lineTo(h[0] + dx * 3 * z, h[1] + dy * 3 * z); ctx.stroke();
  } else if (w === 'gadget') {
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(h[0] + dx * 4 * z, h[1] + dy * 4 * z, 3.5 * z, 0, Math.PI * 2); ctx.fill();
    if (f.wireOn && f.wireK > 0) {
      const t = [X(f.tip[0]), Y(f.tip[1])];
      ctx.strokeStyle = '#cfd6e6'; ctx.lineWidth = Math.max(1, 1.5 * z);
      ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
      ctx.fillStyle = '#9aa3b8'; ctx.beginPath(); ctx.arc(t[0], t[1], 4 * z, 0, Math.PI * 2); ctx.fill();
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
  if (p.type === 'arrow' || p.type === 'drill') {
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
  } else if (p.type === 'bullet') {
    ctx.fillStyle = p.big ? '#ffe9a8' : '#fff4d0';
    ctx.beginPath(); ctx.ellipse(x, y, (p.big ? 10 : 6) * z, (p.big ? 4 : 2.5) * z, Math.atan2(p.vy, p.vx), 0, Math.PI * 2); ctx.fill();
  } else if (p.type === 'wave') {
    ctx.strokeStyle = 'rgba(220,240,255,0.85)'; ctx.lineWidth = 4 * z;
    const d = sign(p.vx);
    ctx.beginPath(); ctx.arc(x - d * 10 * z, y, p.r * z, -Math.PI / 2.4, Math.PI / 2.4, d < 0); ctx.stroke();
  } else if (p.type === 'mine') {
    ctx.fillStyle = '#2b2f3a'; ctx.beginPath(); ctx.ellipse(x, y - 4 * z, 12 * z, 5 * z, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.armed && Math.floor(p.age / 15) % 2 === 0 ? '#ff4040' : '#702020';
    ctx.beginPath(); ctx.arc(x, y - 8 * z, 2.5 * z, 0, Math.PI * 2); ctx.fill();
  } else if (p.type === 'smoke') {
    if (p.cloud) { ctx.fillStyle = 'rgba(170,176,196,0.45)'; ctx.beginPath(); ctx.arc(x, y - 30 * z, p.r * z, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = '#3a3f4c'; ctx.beginPath(); ctx.arc(x, y, 6 * z, 0, Math.PI * 2); ctx.fill(); }
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
    } else if (e.k === 'puff') {
      // 吹っ飛びの煙：白〜灰色。強い吹っ飛びはオレンジに光る芯がつく
      const r = e.size * z * (0.6 + u * 0.9);
      const hh = e.heat * Math.max(0, 1 - u * 1.8); // 出たばかりの煙だけ熱く光り、すぐ灰色になる
      ctx.globalAlpha = (1 - u) * (1 - u) * 0.42; ctx.fillStyle = `rgb(${225 + 30 * hh | 0},${225 - 70 * hh | 0},${232 - 150 * hh | 0})`;
      ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), r, 0, Math.PI * 2); ctx.fill();
      if (e.heat > 0.3 && u < 0.4) { ctx.globalAlpha = (0.4 - u) * 2 * e.heat; ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), r * 0.45, 0, Math.PI * 2); ctx.fill(); }
    } else if (e.k === 'flame') {
      const r = e.size * z * (1 - u * 0.5);
      const col = e.blue ? (u < 0.25 ? '#ffffff' : u < 0.55 ? '#8fe6ff' : u < 0.8 ? '#2f7dff' : '#4a5468') : u < 0.25 ? '#fff1a0' : u < 0.55 ? '#ff9a2e' : u < 0.8 ? '#e0461e' : '#5a4a48';
      ctx.globalCompositeOperation = u < 0.8 ? 'lighter' : 'source-over';
      ctx.globalAlpha = (1 - u) * 0.85; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(X(e.x), Y(e.y), r, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (e.k === 'streak') {
      ctx.globalAlpha = (1 - u) * 0.8; ctx.strokeStyle = e.heat > 0.3 ? '#ffe2a0' : '#ffffff'; ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, e.w * z * (1 - u));
      ctx.beginPath(); ctx.moveTo(X(e.x0), Y(e.y0)); ctx.lineTo(X(e.x), Y(e.y)); ctx.stroke();
    } else if (e.k === 'impact') {
      // 衝撃：中心の白い光＋飛ぶ方向にのびるトゲ＋衝撃波の輪
      const x = X(e.x), y = Y(e.y), k = 1 - u, P = Math.min(1.6, e.power / 120);
      ctx.globalAlpha = k * k; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, (8 + 16 * P) * z * (0.4 + k * 0.6), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = k;
      ctx.fillStyle = e.color;
      for (const r of e.rays) {
        const a = e.ang + r[0], L = (40 + 110 * P) * r[1] * z * (0.4 + u * 0.8), w = (4 + 5 * P) * z * k;
        ctx.beginPath(); ctx.moveTo(x - Math.sin(a) * w, y + Math.cos(a) * w); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.lineTo(x + Math.sin(a) * w, y - Math.cos(a) * w); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = e.color; ctx.lineWidth = Math.max(1, 5 * k * z);
      ctx.beginPath(); ctx.arc(x, y, (20 + u * 110 * P) * z, 0, Math.PI * 2); ctx.stroke();
    } else if (e.k === 'text') {
      // 「ジャストガード！」などの文字：少し浮き上がって消える
      ctx.globalAlpha = u < 0.7 ? 1 : (1 - u) / 0.3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(15 + 5 * (1 - Math.min(1, u * 6)))}px -apple-system, "Hiragino Sans", sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.fillStyle = e.color || '#fff';
      ctx.strokeText(e.s, X(e.x), Y(e.y) - u * 26); ctx.fillText(e.s, X(e.x), Y(e.y) - u * 26);
      ctx.textBaseline = 'alphabetic';
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
      // 撃墜：画面のふちから中央へ、光の柱がはしる
      const x = X(e.x), y = Y(e.y), cx = view.w / 2, cy = view.h / 2;
      const a = Math.atan2(cy - y, cx - x), len = Math.max(view.w, view.h) * (0.6 + u * 0.8);
      const beam = (wd, col, al) => {
        ctx.globalAlpha = al; ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(x - Math.sin(a) * wd * 0.15, y + Math.cos(a) * wd * 0.15);
        ctx.lineTo(x + Math.cos(a) * len - Math.sin(a) * wd, y + Math.sin(a) * len + Math.cos(a) * wd);
        ctx.lineTo(x + Math.cos(a) * len + Math.sin(a) * wd, y + Math.sin(a) * len - Math.cos(a) * wd);
        ctx.lineTo(x + Math.sin(a) * wd * 0.15, y - Math.cos(a) * wd * 0.15);
        ctx.closePath(); ctx.fill();
      };
      const k = 1 - u;
      beam(110 * k + 16, e.color, 0.45 * k);
      beam(55 * k + 8, e.color, 0.9 * k);
      beam(18 * k + 3, '#ffffff', k);
      // 飛び散る光の線
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = k;
      for (const r of e.rays) { const aa = a + r[0], l0 = 30 + u * 300 * r[1], l1 = l0 + 60 * r[1]; ctx.beginPath(); ctx.moveTo(x + Math.cos(aa) * l0, y + Math.sin(aa) * l0); ctx.lineTo(x + Math.cos(aa) * l1, y + Math.sin(aa) * l1); ctx.stroke(); }
      ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, 60 * k + 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = e.color; ctx.lineWidth = 6 * k + 1;
      ctx.beginPath(); ctx.arc(x, y, 30 + u * 160, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
function drawDebug(b, X, Y, z) {
  ctx.lineWidth = 1;
  for (const f of b.f) {
    if (!f.alive) continue;
    // くらい判定（黄色のカプセル）
    const [ax, ay, bx, by, rr] = capsuleOf(f);
    ctx.strokeStyle = 'rgba(255,230,0,0.85)'; ctx.fillStyle = 'rgba(255,230,0,0.18)'; ctx.lineWidth = 1.5;
    ctx.lineCap = 'round'; ctx.lineWidth = rr * 2 * z; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx), Y(by)); ctx.strokeStyle = '#ffe600'; ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1.5;
    for (const hb of f.activeHits()) {
      ctx.strokeStyle = hb.grab ? 'rgba(160,0,255,0.9)' : 'rgba(255,0,0,0.9)';
      ctx.beginPath(); ctx.arc(X(f.x + hb.x * f.facing), Y(f.y - hb.y), hb.r * z, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = hb.grab ? 'rgba(160,0,255,0.25)' : 'rgba(255,0,0,0.3)'; ctx.fill();
    }
    if (DEBUG) { ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(f.state + (f.move ? ':' + f.move.key + ' ' + f.activeF : ''), X(f.x), Y(f.y + 16)); }
  }
}
// 上の％表示（数字が変わったときだけ描き直す）
const hudCache = new Map();
const faceImg = {};
function face(c) {
  if (!c.portrait) return null;
  let im = faceImg[c.portrait];
  if (!im) { im = faceImg[c.portrait] = new Image(); im.src = c.portrait; im.onload = () => hudCache.clear(); }
  return im.complete && im.naturalWidth ? im : null;
}
function circleImg(g, im, x, y, r, ring) {
  g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.closePath();
  g.fillStyle = '#d9d9de'; g.fill(); g.clip();
  if (im) g.drawImage(im, x - r, y - r * 0.92, r * 2, r * 2);
  g.restore();
  if (ring) { g.strokeStyle = ring; g.lineWidth = Math.max(1.5, r * 0.14); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
}
function hudPanel(f) {
  const pc = f.alive ? Math.floor(f.percent) : 0;
  const vc = f.vc || f.c, im = face(vc);
  const fuelK = f.c.jetFuel ? Math.round(f.fuel / f.c.jetFuel * 24) : -1;
  const key = `${f.slot}|${pc}|${f.stocks}|${vc.name}|${view.dpr}|${!!im}|${!!f.outfit2}|${fuelK}`;
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
  // 顔とストック（残り人数ぶんの小さな顔）
  circleImg(g, im, 25, 24, 16, f.color);
  g.textAlign = 'left'; g.font = 'bold 10px -apple-system, "Hiragino Sans", sans-serif';
  g.fillStyle = '#c9cff0'; g.fillText(`${f.label}：${vc.name}`, 46, 14);
  for (let s2 = 0; s2 < f.stocks; s2++) circleImg(g, im, 52 + s2 * 13, 37, 5.5, 'rgba(255,255,255,0.7)');
  g.textAlign = 'right'; g.font = 'bold 26px -apple-system, "Hiragino Sans", sans-serif';
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(`${pc}%`, w - 7, 45);
  g.fillStyle = pctColor(pc); g.fillText(`${pc}%`, w - 8, 44);
  // ジェットの燃料ゲージ（ロボ）
  if (fuelK >= 0) {
    g.fillStyle = 'rgba(255,255,255,0.15)'; rr(g, 46, 18, 46, 5, 2.5); g.fill();
    g.fillStyle = fuelK > 6 ? '#7fe3ff' : '#ff7a5a'; rr(g, 46, 18, Math.max(2, 46 * fuelK / 24), 5, 2.5); g.fill();
  }
  hudCache.set(f.slot, { key, canvas: cv });
  return cv;
}
// ％とストックは画面の下（移動スティックとボタンの間）
// トレーニング：連続ヒット数とダメージ
function drawTraining(b) {
  const tr = b.training, W = view.w;
  ctx.save(); ctx.textAlign = 'center';
  ctx.font = 'bold 11px -apple-system, "Hiragino Sans", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('トレーニング', W / 2, view.inset.t + 64);
  if (tr.combo >= 2 && tr.comboT > 0) {
    const a = Math.min(1, tr.comboT / 30);
    ctx.globalAlpha = a;
    ctx.font = '900 34px -apple-system, "Hiragino Sans", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(`${tr.combo} HIT`, W / 2 + 2, view.inset.t + 102);
    ctx.fillStyle = '#ffd34d'; ctx.fillText(`${tr.combo} HIT`, W / 2, view.inset.t + 100);
    ctx.font = 'bold 16px -apple-system, "Hiragino Sans", sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(`${tr.comboDmg.toFixed(1)}%`, W / 2, view.inset.t + 122);
  }
  ctx.restore();
}
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
  showFps: store.get('showFps', false), gameMode: store.get('gameMode', 'vs'), mode: '3d', level: store.get('cpuLevel', D.cpu.default), stage: store.get('stage', 0),
};
function show(id) {
  // タイトル＝オープニング映像（映像が使えないときだけ、文字のタイトル画面）
  const useOP = id === 'title' && OP.usable();
  for (const s of ['title', 'select', 'pause', 'result']) $(s).classList.toggle('show', s === id && !useOP);
  if (useOP) OP.play(); else OP.hide();
  // トレーニングの操作パネル：トレーニングの試合中だけ出す
  $('trainBar').classList.toggle('show', !id && !!(state.battle && state.battle.training));
  if (state.battle && state.battle.training) updateTrainBar();
  if (window.Music) { if (useOP) window.Music.stop(); else if (id === 'title' || id === 'select') window.Music.play('menu'); }
}
/* ---------- オープニング映像（タップでキャラ選択へ） ---------- */
const OP = {
  ok: true,
  usable() { const v = $('opVideo'); if (!v || v.error) this.ok = false; return this.ok; },
  play() {
    const el = $('opening'), v = $('opVideo');
    if (!el || !v) { this.ok = false; return; }
    el.classList.add('show'); el.classList.remove('ended');
    try { v.currentTime = 0; } catch (e) { /* 読みこみ前 */ }
    v.muted = !SFX.ready; // 一度でも画面をさわる前は、音なしでしか自動再生できない（iPhoneの決まり）
    const pr = v.play();
    if (pr && pr.catch) pr.catch(() => { v.muted = true; v.play().catch(() => {}); this.syncSound(); });
    this.syncSound();
  },
  hide() { const el = $('opening'), v = $('opVideo'); if (el) el.classList.remove('show'); if (v && !v.paused) v.pause(); },
  syncSound() { const b = $('opSound'); if (b) b.style.display = $('opVideo').muted ? '' : 'none'; },
  toSelect() { this.hide(); state.picking = 'p1'; buildCards(); show('select'); state.screen = 'select'; },
};
function buildCards() {
  // 1つの画面から選ぶ：上の「あなた」「CPU」で、どちらのキャラを選ぶか切りかえる
  if (!state.picking) state.picking = 'p1';
  const pk = (el, key, label) => {
    const c = D.characters[state[key]];
    el.className = 'pick ' + key + (state.picking === key ? ' on' : '');
    el.innerHTML = (c.portrait ? `<img src="${c.portrait}" alt="">` : '') + `<div><b>${label}</b><span>${c.name}</span></div>`;
    el.onclick = () => { state.picking = key; buildCards(); };
  };
  pk($('pickP1'), 'p1', 'あなた'); pk($('pickCPU'), 'cpu', 'CPU');
  const el = $('cards');
  el.innerHTML = '';
  D.characters.forEach((c, i) => {
    const d = document.createElement('div');
    const isP1 = state.p1 === i, isCpu = state.cpu === i;
    d.className = 'card' + (isP1 ? ' p1' : '') + (isCpu ? ' cpu' : '');
    const tags = (isP1 ? '<span class="tag p1">あなた</span>' : '') + (isCpu ? '<span class="tag cpu">CPU</span>' : '');
    d.innerHTML = (c.portrait ? `<img src="${c.portrait}" alt="">` : '') + `<div class="tags">${tags}</div>${c.name}<small>${c.range}・${c.type}</small>`;
    d.addEventListener('click', () => {
      state[state.picking] = i;
      if (state.picking === 'p1') state.picking = 'cpu'; // 自分を選んだら、次はCPUを選ぶ
      buildCards();
    });
    el.appendChild(d);
  });
  // ステージ選び（ランダムもあり）
  const sg = $('stages');
  if (sg && D.stages) {
    sg.innerHTML = '';
    const opts = D.stages.map((st, i) => ({ i, st })).concat([{ i: -1 }]);
    for (const o of opts) {
      const d = document.createElement('div');
      d.className = 'st' + (state.stage === o.i ? ' on' : '') + (o.i < 0 ? ' rand' : '');
      d.innerHTML = o.i < 0 ? 'ランダム' : `<img src="${o.st.thumb}" alt=""><b>${o.st.name}</b>`;
      d.addEventListener('click', () => { state.stage = o.i; store.set('stage', o.i); buildCards(); });
      sg.appendChild(d);
    }
  }
  // モード：対戦／トレーニング
  const md = $('gameMode');
  md.innerHTML = '';
  for (const [k, name] of [['vs', '対戦'], ['training', 'トレーニング']]) {
    const b = document.createElement('div');
    b.className = 'seg' + (state.gameMode === k ? ' on' : '');
    b.textContent = name;
    b.addEventListener('click', () => { state.gameMode = k; store.set('gameMode', k); buildCards(); });
    md.appendChild(b);
  }
  $('cpuLevelWrap').style.display = state.gameMode === 'training' ? 'none' : '';
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
  const ns = (D.stages || []).length;
  const si = state.stage >= 0 && state.stage < ns ? state.stage : Math.floor(Math.random() * ns);
  state.battle = new Battle(D.characters[state.p1], D.characters[state.cpu], state.level);
  if (state.gameMode === 'training') {
    state.battle.training = { cpu: 'stand', hit: false, combo: 0, comboDmg: 0, comboT: 0 };
    state.battle.phase = 'fight'; state.battle.goAt = 0; // トレーニングはカウントダウンなし
  }
  state.battle.stage = D.stages ? D.stages[si] : null;
  // すり抜け床：data.js の h は床からの高さ（上がプラス）→ ゲームの座標（上がマイナス）に
  state.battle.plats = ((state.battle.stage && state.battle.stage.platforms) || []).map(p => ({ x: p.x, y: -p.h, w: p.w }));
  if (window.Music) window.Music.play(state.battle.stage ? state.battle.stage.bgm : 'temple');
  SFX.duck(false);
  if (state.battle.stage && window.Render3D && window.Render3D.ready) window.Render3D.setStage(state.battle.stage.id);
  controls.reset();
  controls.pad = state.battle.f[0].pad;
  state.paused = false; state.screen = 'battle'; state.resultShown = false;
  show(null);
  acc = 0;
}
function pause() {
  if (state.screen !== 'battle' || state.paused || !state.battle || state.battle.over) return;
  state.paused = true; controls.reset(); show('pause'); SFX.duck(true);
}
controls.onPause = pause;
function updateMenuLabels() {
  $('btnFps').textContent = `fps表示：${state.showFps ? 'オン' : 'オフ'}`;
  $('btnBgm').textContent = `BGM：${SFX.musicOn ? 'オン' : 'オフ'}`;
}
// 3D表示の準備（もしこの端末で3Dが使えないときだけ、平面の表示で動かす）
function init3D() {
  try {
    if (!window.THREE || !window.Render3D) throw new Error('3D files missing');
    window.Render3D.init(view);
  } catch (e) { state.mode = '2d'; }
}
$('btnStart').addEventListener('click', () => { state.picking = 'p1'; buildCards(); show('select'); state.screen = 'select'; });
// オープニング：どこをタップしてもキャラ選択へ。「音を出す」は最初から音つきで見直す
// 画面いっぱいに表示（全画面にできる端末だけ。iPhoneのSafariはできないので、ホーム画面から開いてもらう）
function goFullscreen() {
  const d = document.documentElement, fs = d.requestFullscreen || d.webkitRequestFullscreen;
  if (fs && !(document.fullscreenElement || document.webkitFullscreenElement)) { try { const r = fs.call(d, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch (e) { /* できない端末 */ } }
}
$('opening').addEventListener('click', () => { goFullscreen(); SFX.play('count'); OP.toSelect(); });
// iPhoneのSafariで開いているときだけ、「ホーム画面に追加」の案内を出す（ホーム画面から開くと、上のアドレスバーが消える）
{ const ios = /iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
  if (ios && !standalone && $('opHint')) $('opHint').style.display = ''; }
$('opSound').addEventListener('click', e => { e.stopPropagation(); const v = $('opVideo'); v.muted = false; try { v.currentTime = 0; } catch (er) { /* 無視 */ } $('opening').classList.remove('ended'); v.play().catch(() => {}); OP.syncSound(); });
$('opVideo').addEventListener('ended', () => $('opening').classList.add('ended'));
$('opVideo').addEventListener('error', () => { OP.ok = false; if (state.screen === 'title') show('title'); }); // 映像がないときは文字のタイトル
show('title');
$('btnBack').addEventListener('click', () => { show('title'); state.screen = 'title'; });
$('btnFight').addEventListener('click', startBattle);
// トレーニングの操作パネル
const TR_CPU = [['stand', '止まる'], ['walk', '歩く'], ['jump', 'ジャンプ'], ['shield', 'シールド'], ['fight', '戦う']];
function updateTrainBar() {
  const tr = state.battle && state.battle.training;
  if (!tr) return;
  $('trCpu').textContent = '相手：' + TR_CPU.find(o => o[0] === tr.cpu)[1];
  $('trHit').textContent = '当たり判定：' + (tr.hit ? 'オン' : 'オフ');
}
function trBtn(id, fn) {
  const el = $(id);
  const go = e => { e.preventDefault(); e.stopPropagation(); const b = state.battle; if (!b || !b.training) return; fn(b, b.training); updateTrainBar(); };
  el.addEventListener('touchstart', go, { passive: false }); el.addEventListener('mousedown', go);
}
trBtn('trCpu', (b, tr) => { const i = TR_CPU.findIndex(o => o[0] === tr.cpu); tr.cpu = TR_CPU[(i + 1) % TR_CPU.length][0]; b.f[1].pad.clear(); });
trBtn('trMinus', b => { b.f[1].percent = Math.max(0, b.f[1].percent - 10); });
trBtn('trPlus', b => { b.f[1].percent = Math.min(999, b.f[1].percent + 10); });
trBtn('trZero', b => { b.f[1].percent = 0; b.f[0].percent = 0; });
trBtn('trHit', (b, tr) => { tr.hit = !tr.hit; });
trBtn('trReset', b => {
  for (const f of b.f) { const pc = f.percent; f.spawn(f.slot === 0 ? -150 : 150, 0, f.slot === 0 ? 1 : -1); f.percent = pc; }
  b.projectiles = [];
});
$('btnResume').addEventListener('click', () => { state.paused = false; show(null); acc = 0; SFX.duck(false); });
$('btnBgm').addEventListener('click', () => { SFX.setMusic(!SFX.musicOn); updateMenuLabels(); });
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
    if (b.over && b.overT > 170 && !state.resultShown) {
      state.resultShown = true;
      const w = b.winner;
      $('resultText').textContent = w.slot === 0 ? 'あなたの勝ち！' : 'CPUの勝ち…';
      $('resultName').textContent = w.c.name;
      $('resultFace').src = w.c.portrait || '';
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
