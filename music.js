/* =====================================================================
   BGM（プログラムで作曲して鳴らす）
   ・音源はすべてブラウザの音の機能（WebAudio）で作っています（音のファイルは使いません）
   ・ステージごとに曲がちがいます：天空神殿＝勇ましいオーケストラ風 / 摩天楼＝シンセウェーブ / 古城＝和風
   ・Music.play('temple') のように呼ぶと、その曲がくり返し流れます
   ===================================================================== */
'use strict';
(() => {
const Mu = { want: null, cur: null };
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
let A = null; // { ac, bus, verb, noise }

/* ---------- 楽器 ---------- */
function envG(t, a, peak, d, sus, rel, len) {
  const g = A.ac.createGain(), p = g.gain;
  p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d);
  p.setValueAtTime(Math.max(0.0001, peak * sus), t + len);
  p.exponentialRampToValueAtTime(0.0001, t + len + rel);
  return g;
}
function send(node, rv) { node.connect(A.bus); if (rv && A.verb) { const s = A.ac.createGain(); s.gain.value = rv; node.connect(s); s.connect(A.verb); } }
function osc(type, f, t, end, det = 0) { const o = A.ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = det; o.start(t); o.stop(end); return o; }
function lp(f, q = 0.7) { const b = A.ac.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; return b; }
function nz(t, dur) { const s = A.ac.createBufferSource(); s.buffer = A.noise; s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); return s; }

const I = {
  kick(t, v = 1) { const o = A.ac.createOscillator(), g = envG(t, 0.002, 0.9 * v, 0.2, 0.001, 0.05, 0.2); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); o.connect(g); send(g, 0); o.start(t); o.stop(t + 0.35); },
  snare(t, v = 1, rv = 0.25) {
    const n = nz(t, 0.2), f = A.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = envG(t, 0.002, 0.5 * v, 0.15, 0.001, 0.05, 0.15); n.connect(f); f.connect(g); send(g, rv);
    const o = osc('triangle', 210, t, t + 0.12), g2 = envG(t, 0.002, 0.3 * v, 0.08, 0.001, 0.03, 0.08); o.frequency.exponentialRampToValueAtTime(130, t + 0.08); o.connect(g2); send(g2, rv);
  },
  hat(t, v = 1, open = false) { const n = nz(t, 0.3), f = A.ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500; const g = envG(t, 0.001, 0.16 * v, open ? 0.2 : 0.04, 0.001, 0.02, open ? 0.2 : 0.04); n.connect(f); f.connect(g); send(g, 0.05); },
  tom(t, f0, v = 1, rv = 0.3) {
    const o = A.ac.createOscillator(), g = envG(t, 0.003, 0.8 * v, 0.45, 0.001, 0.1, 0.45);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.4); o.connect(g); send(g, rv); o.start(t); o.stop(t + 0.6);
    const n = nz(t, 0.12), ff = lp(900), g2 = envG(t, 0.002, 0.25 * v, 0.1, 0.001, 0.02, 0.1); n.connect(ff); ff.connect(g2); send(g2, rv);
  },
  bass(t, m, len, v = 1, type = 'sawtooth') {
    const o = osc(type, mf(m), t, t + len + 0.2), f = lp(420, 2), g = envG(t, 0.005, 0.32 * v, 0.12, 0.6, 0.06, len);
    f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.15);
    o.connect(f); f.connect(g); send(g, 0);
  },
  pad(t, ms, len, v = 1, bright = 1400) {
    for (const m of ms) for (const d of [-9, 9]) {
      const o = osc('sawtooth', mf(m), t, t + len + 1.2, d), f = lp(bright), g = envG(t, 0.35, 0.05 * v, 0.3, 0.8, 0.9, len);
      o.connect(f); f.connect(g); send(g, 0.35);
    }
  },
  pluck(t, m, v = 1, rv = 0.25, bright = 2600) {
    const o = osc('triangle', mf(m), t, t + 0.9), o2 = osc('square', mf(m) * 1.002, t, t + 0.9), f = lp(bright, 1.5), g = envG(t, 0.002, 0.18 * v, 0.35, 0.001, 0.1, 0.35);
    f.frequency.setValueAtTime(bright, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    const m2 = A.ac.createGain(); m2.gain.value = 0.35; o.connect(f); o2.connect(m2); m2.connect(f); f.connect(g); send(g, rv);
  },
  koto(t, m, v = 1) {
    const o = osc('triangle', mf(m) * 1.012, t, t + 1.4), f = lp(3200, 3), g = envG(t, 0.001, 0.26 * v, 0.6, 0.001, 0.3, 0.6);
    o.frequency.exponentialRampToValueAtTime(mf(m), t + 0.05); // 弦をはじいた瞬間の少し高い音
    f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.5);
    o.connect(f); f.connect(g); send(g, 0.35);
  },
  brass(t, m, len, v = 1) {
    for (const d of [-6, 6]) {
      const o = osc('sawtooth', mf(m), t, t + len + 0.4, d), f = lp(500, 1.2), g = envG(t, 0.04, 0.09 * v, 0.2, 0.75, 0.25, len);
      f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(2600, t + 0.08); f.frequency.exponentialRampToValueAtTime(1400, t + 0.4);
      o.connect(f); f.connect(g); send(g, 0.3);
    }
  },
  synth(t, m, len, v = 1) {
    const o = osc('square', mf(m), t, t + len + 0.3), o2 = osc('sawtooth', mf(m), t, t + len + 0.3, 12), f = lp(2400, 2), g = envG(t, 0.01, 0.07 * v, 0.15, 0.7, 0.2, len);
    const lfo = A.ac.createOscillator(), lg = A.ac.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 8; lfo.connect(lg); lg.connect(o.detune); lfo.start(t + 0.15); lfo.stop(t + len + 0.3);
    o.connect(f); o2.connect(f); f.connect(g); send(g, 0.35);
  },
  flute(t, m, len, v = 1) { // 尺八のような息の音まじりの笛
    const o = osc('sine', mf(m), t, t + len + 0.4), g = envG(t, 0.09, 0.2 * v, 0.2, 0.8, 0.25, len);
    const lfo = A.ac.createOscillator(), lg = A.ac.createGain(); lfo.frequency.value = 5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(18, t + Math.min(len, 0.6)); lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + len + 0.4);
    o.frequency.setValueAtTime(mf(m) * 0.97, t); o.frequency.exponentialRampToValueAtTime(mf(m), t + 0.08);
    o.connect(g); send(g, 0.45);
    const n = nz(t, len), bf = A.ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = mf(m) * 2; bf.Q.value = 2;
    const ng = envG(t, 0.05, 0.05 * v, 0.2, 0.5, 0.2, len); n.connect(bf); bf.connect(ng); send(ng, 0.45);
  },
};

/* ---------- 曲 ---------- */
// メロディは [拍の位置(16分), 音の高さ(MIDI), 長さ(16分)] の並び。1小節 = 16
const seq = (bars) => { const out = []; bars.forEach((b, i) => { let p = 0; for (const [m, l] of b) { if (m) out.push([i * 16 + p, m, l]); p += l; } }); return out; };
const TRACKS = {
  temple: { bpm: 132, bars: 16,
    chords: [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 61, 64], [62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]],
    roots: [38, 34, 36, 33, 38, 34, 31, 33],
    mel: seq([[[74, 4], [77, 2], [81, 2], [86, 6], [84, 2]], [[82, 6], [81, 2], [79, 4], [77, 4]], [[79, 4], [81, 2], [82, 2], [84, 6], [81, 2]], [[81, 8], [85, 4], [88, 4]],
              [[86, 6], [84, 2], [81, 4], [77, 4]], [[82, 4], [86, 4], [89, 6], [88, 2]], [[86, 4], [82, 4], [79, 4], [82, 4]], [[81, 12], [0, 4]]]),
    step(s, t, d) {
      const bar = Math.floor(s / 16) % 16, b8 = bar % 8, i = s % 16, part = bar < 8 ? 0 : 1;
      const ch = this.chords[b8];
      if (i === 0) I.pad(t, ch.map(m => m + 12), d * 16, part ? 1.3 : 1);
      if (i % 2 === 0) I.bass(t, this.roots[b8] + (i % 8 === 6 ? 12 : 0), d * 1.6, 1);
      if (part === 0) { for (const n of this.mel) if (n[0] === b8 * 16 + i) I.brass(t, n[1], n[2] * d * 0.95, 1); }
      else { const arp = [0, 1, 2, 1]; if (i % 2 === 0) I.pluck(t, ch[arp[(i / 2) % 4]] + 24, 0.9, 0.3, 2200); if (i === 0) I.brass(t, ch[0] + 24, d * 14, 0.6); }
      if (i === 0 || i === 8 || (i === 14 && bar % 2)) I.kick(t, 0.9);
      if (i === 4 || i === 12) I.snare(t, 0.8, 0.35);
      if (i % 2 === 0) I.hat(t, 0.45);
      if (bar % 8 === 7 && i >= 12) I.tom(t, [200, 170, 140, 110][i - 12], 0.8);
    } },
  city: { bpm: 118, bars: 16,
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    roots: [33, 29, 36, 31],
    mel: seq([[[76, 4], [81, 4], [83, 2], [84, 6]], [[84, 2], [83, 2], [81, 4], [77, 8]], [[79, 4], [84, 4], [86, 2], [88, 6]], [[86, 8], [83, 8]],
              [[81, 2], [84, 2], [88, 4], [86, 2], [84, 2], [83, 4]], [[81, 6], [79, 2], [77, 8]], [[76, 4], [79, 4], [84, 8]], [[83, 12], [86, 4]]]),
    step(s, t, d) {
      const bar = Math.floor(s / 16) % 16, b4 = bar % 4, i = s % 16, sec = bar < 8 ? 0 : 1;
      const ch = this.chords[b4];
      if (i === 0) I.pad(t, ch.map(m => m + 12), d * 16, 0.9, 1800);
      if (i % 2 === 0) I.bass(t, this.roots[b4] + (i % 4 === 2 ? 12 : 0), d * 1.7, 1.1, 'sawtooth');
      const arp = [0, 1, 2, 1, 0, 2, 1, 2]; I.pluck(t, ch[arp[i % 8]] + 24 + (i >= 8 ? 12 : 0), 0.55, 0.2, 3200);
      if (sec === 1) for (const n of this.mel) if (n[0] === (bar - 8) * 16 + i) I.synth(t, n[1], n[2] * d * 0.95, 1);
      if (i % 4 === 0) I.kick(t, 1);
      if (i === 4 || i === 12) I.snare(t, 0.9, 0.45);
      if (i % 4 === 2) I.hat(t, 0.6, true); else if (i % 2 === 1) I.hat(t, 0.35);
    } },
  castle: { bpm: 140, bars: 16,
    ost: [62, 69, 70, 69, 74, 69, 67, 69],
    mel: seq([[[81, 8], [82, 4], [81, 4]], [[79, 8], [75, 4], [74, 4]], [[74, 4], [75, 4], [79, 4], [81, 4]], [[82, 12], [81, 4]],
              [[86, 8], [82, 4], [81, 4]], [[79, 6], [81, 2], [82, 4], [81, 4]], [[79, 4], [75, 4], [74, 8]], [[0, 16]]]),
    step(s, t, d) {
      const bar = Math.floor(s / 16) % 16, b8 = bar % 8, i = s % 16, sec = bar < 8 ? 0 : 1;
      if (i === 0 && bar % 2 === 0) I.pad(t, [50, 57], d * 32, 0.8, 900);
      if (i % 2 === 0) I.koto(t, this.ost[(i / 2) % 8] + (sec && bar % 4 === 3 ? 12 : 0), 0.8);
      if (b8 === 7 && i % 2 === 1) I.koto(t, [74, 75, 79, 81, 82, 86, 82, 81][(i - 1) / 2], 0.7);
      for (const n of this.mel) if (n[0] === b8 * 16 + i) I.flute(t, n[1] - (sec ? 0 : 12), n[2] * d * 0.95, sec ? 1 : 0.8);
      if (i === 0 || i === 6 || i === 10) I.tom(t, 80, 1.1, 0.4); // 大太鼓
      if (i === 12 && bar % 2) I.tom(t, 160, 0.6, 0.3);
      if (i % 2 === 0 && i !== 0) I.tom(t, 520, 0.18, 0.1); // 締太鼓
      if (i === 0) I.bass(t, 38, d * 6, 0.7, 'triangle');
    } },
  menu: { bpm: 96, bars: 8,
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    step(s, t, d) {
      const bar = Math.floor(s / 16) % 8, b4 = bar % 4, i = s % 16, ch = this.chords[b4];
      if (i === 0) I.pad(t, ch.map(m => m + 12), d * 16, 0.8, 1200);
      if (i % 2 === 0) I.pluck(t, ch[[0, 1, 2, 1][(i / 2) % 4]] + 24, 0.5, 0.4, 2000);
      if (i === 0) I.bass(t, ch[0] - 24, d * 8, 0.6, 'triangle');
    } },
  victory: { bpm: 150, bars: 2, once: true,
    step(s, t, d) {
      const notes = { 0: [72, 2], 2: [72, 2], 4: [72, 2], 6: [76, 6], 12: [79, 4], 16: [84, 12] };
      const n = notes[s]; if (n) { I.brass(t, n[0], n[1] * d, 1.2); I.brass(t, n[0] - 12, n[1] * d, 0.6); }
      if (s === 0 || s === 6 || s === 16) { I.kick(t, 1); I.tom(t, 120, 0.7); }
      if (s === 16) I.pad(t, [60, 64, 67, 72], d * 16, 1.2);
    } },
};

/* ---------- 再生のしくみ（少し先までの音を予約しておく） ---------- */
function tick() {
  A = window.__game && window.__game.SFX.audio();
  if (!A) return;
  if (Mu.want !== (Mu.cur && Mu.cur.name)) {
    Mu.cur = Mu.want ? { name: Mu.want, tr: TRACKS[Mu.want], s: 0, t: A.ac.currentTime + 0.12 } : null;
  }
  const c = Mu.cur; if (!c || !c.tr) return;
  const d = 60 / c.tr.bpm / 4;
  while (c.t < A.ac.currentTime + 0.2) {
    if (c.tr.once && c.s >= c.tr.bars * 16) break;
    try { c.tr.step(c.s, c.t, d); } catch (e) { /* 無視 */ }
    c.s++; c.t += d;
  }
}
setInterval(tick, 40);
Mu.play = function (name) { Mu.want = name; };
Mu.stop = function () { Mu.want = null; };
window.Music = Mu;
})();
