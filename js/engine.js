/* =========================================================
   MicFX · motor de audio
   Cadena (pensada para añadir el mínimo retardo):
   micro → ganancia → corte graves → [worklet: puerta, tono, robot, compresor]
         → EQ → saturación → color → (eco + reverb) → anti-acople
         → volumen → recorte suave → salida
   ========================================================= */
import {COLORS} from './data.js';

let ctx = null, stream = null, src = null, fx = null, N = {}, wake = null;
let workletOK = false, curveDrive = -1, irSize = -1, irTimer = null;
let cfg = {lowLat: false}, winMs = 30, pitchOn = false, fbFrames = 40;
const notches = []; let notchIdx = 0;
const hooks = {onNote() {}, onFeedback() {}, onDevices() {}};
export const noteInfo = {v: false, m: 0, t: 0};

export const setHooks = h => Object.assign(hooks, h);
export const isOn = () => !!ctx;
export const hasWorklet = () => workletOK;
export const canSetSink = () => !!(window.AudioContext && AudioContext.prototype.setSinkId);

/* ---------- utilidades de curvas ---------- */
function makeCurve(drive) {
  if (drive <= 0.001) return null;
  const n = 2048, c = new Float32Array(n), k = 1 + drive * 40, norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = Math.tanh(x * k) / norm; }
  return c;
}
/* Recorte suave: lineal hasta 0.7 y curva hasta 1. Sin retardo (a diferencia de un limitador). */
function makeClip() {
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * 2 / (n - 1) - 1, a = Math.abs(x);
    c[i] = a < 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
  }
  return c;
}
function makeIR(sec) {
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * sec));
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-6.9 * t / sec) * (i < sr * 0.005 ? i / (sr * 0.005) : 1);
    }
  }
  return ir;
}

/* ---------- micro ---------- */
async function getMic(inId) {
  const audio = {echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, latency: {ideal: 0}};
  if (inId) audio.deviceId = {exact: inId};
  try {
    return await navigator.mediaDevices.getUserMedia({audio});
  } catch (e) {
    if (inId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
      delete audio.deviceId;
      return await navigator.mediaDevices.getUserMedia({audio});
    }
    throw e;
  }
}

/* ---------- arranque y parada ---------- */
export async function start(o) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('nomic'), {code: 'unsupported'});
  }
  cfg = {lowLat: !!o.lowLat};
  winMs = cfg.lowLat ? 18 : 30;
  const AC = window.AudioContext || window.webkitAudioContext;
  try {
    ctx = new AC({latencyHint: cfg.lowLat ? 0 : 'interactive'});
    if (navigator.audioSession) { try { navigator.audioSession.type = 'play-and-record'; } catch (e) {} }
    stream = await getMic(o.inId);
  } catch (e) {
    if (ctx) { ctx.close(); ctx = null; }
    throw e;
  }

  workletOK = false;
  if (ctx.audioWorklet) {
    try {
      await ctx.audioWorklet.addModule('js/worklet.js');
      fx = new AudioWorkletNode(ctx, 'micfx', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
        channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers',
        processorOptions: {winMs}
      });
      fx.port.onmessage = e => Object.assign(noteInfo, e.data);
      workletOK = true;
    } catch (e) { console.warn('Worklet no disponible', e); fx = null; }
  }

  buildGraph();
  src = ctx.createMediaStreamSource(stream);
  src.connect(N.inGain); src.connect(N.anIn);
  curveDrive = -1; irSize = -1;
  apply(o.params, true);
  setMonitor(o.monitor);
  if (ctx.state === 'suspended') await ctx.resume();
  if (o.outId && ctx.setSinkId) { try { await ctx.setSinkId(o.outId); } catch (e) {} }
  requestWake();
  return {worklet: workletOK};
}

export function stop() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (ctx) ctx.close();
  ctx = null; stream = null; src = null; fx = null; N = {};
  releaseWake();
}

function buildGraph() {
  const c = ctx;
  N = {};
  N.inGain = c.createGain();
  N.hp = c.createBiquadFilter(); N.hp.type = 'highpass'; N.hp.Q.value = 0.7;
  N.eqLow = c.createBiquadFilter(); N.eqLow.type = 'lowshelf'; N.eqLow.frequency.value = 200;
  N.eqMid = c.createBiquadFilter(); N.eqMid.type = 'peaking'; N.eqMid.frequency.value = 1500; N.eqMid.Q.value = 0.9;
  N.eqHigh = c.createBiquadFilter(); N.eqHigh.type = 'highshelf'; N.eqHigh.frequency.value = 4000;
  N.shaper = c.createWaveShaper(); N.shaper.oversample = cfg.lowLat ? 'none' : '2x';
  N.shTrim = c.createGain();
  N.colHP = c.createBiquadFilter(); N.colHP.type = 'highpass';
  N.colLP = c.createBiquadFilter(); N.colLP.type = 'lowpass';
  N.colPk = c.createBiquadFilter(); N.colPk.type = 'peaking'; N.colPk.Q.value = 1.2;
  N.post = c.createGain();
  // Eco
  N.delay = c.createDelay(2); N.dlyLP = c.createBiquadFilter(); N.dlyLP.type = 'lowpass'; N.dlyLP.frequency.value = 5000;
  N.dlyFb = c.createGain(); N.dlyWet = c.createGain();
  // Reverb
  N.conv = c.createConvolver(); N.revWet = c.createGain();
  // Suma, comparación, anti-acople y salida
  N.bus = c.createGain();
  N.fxOut = c.createGain();
  N.dry = c.createGain(); N.dry.gain.value = 0;
  N.duck = c.createGain();
  N.master = c.createGain();
  N.clip = c.createWaveShaper(); N.clip.curve = makeClip();
  N.out = c.createGain();
  N.anIn = c.createAnalyser(); N.anIn.fftSize = 1024;
  N.anOut = c.createAnalyser(); N.anOut.fftSize = 4096; N.anOut.smoothingTimeConstant = 0;
  N.rec = c.createMediaStreamDestination();

  N.inGain.connect(N.hp);
  if (fx) { N.hp.connect(fx); fx.connect(N.eqLow); } else N.hp.connect(N.eqLow);
  N.eqLow.connect(N.eqMid); N.eqMid.connect(N.eqHigh); N.eqHigh.connect(N.shaper);
  N.shaper.connect(N.shTrim); N.shTrim.connect(N.colHP); N.colHP.connect(N.colLP);
  N.colLP.connect(N.colPk); N.colPk.connect(N.post);
  N.post.connect(N.bus);
  N.post.connect(N.delay); N.delay.connect(N.dlyLP); N.dlyLP.connect(N.dlyFb); N.dlyFb.connect(N.delay);
  N.dlyLP.connect(N.dlyWet); N.dlyWet.connect(N.bus);
  N.post.connect(N.conv); N.conv.connect(N.revWet); N.revWet.connect(N.bus);
  let last = N.bus;
  notches.length = 0; notchIdx = 0;
  for (let i = 0; i < 6; i++) {
    const f = c.createBiquadFilter(); f.type = 'peaking'; f.frequency.value = 1000; f.Q.value = 30; f.gain.value = 0;
    last.connect(f); last = f; notches.push(f);
  }
  last.connect(N.fxOut); N.fxOut.connect(N.duck);
  N.hp.connect(N.dry); N.dry.connect(N.duck);       // señal sin efecto (para comparar)
  N.duck.connect(N.master); N.master.connect(N.clip);
  N.clip.connect(N.anOut); N.clip.connect(N.rec); N.clip.connect(N.out);
  N.out.connect(c.destination);
}

/* ---------- parámetros ---------- */
function setP(param, v, now) {
  const t = ctx.currentTime;
  if (now) { param.cancelScheduledValues(t); param.setValueAtTime(v, t); }
  else param.setTargetAtTime(v, t, 0.03);
}
function wp(name, v) { if (fx) fx.parameters.get(name).setValueAtTime(v, ctx.currentTime); }

export function apply(P, now) {
  if (!ctx) return;
  fbFrames = P.fbFast ? 25 : 40;
  pitchOn = !!P.atOn || Math.abs(+P.semis) > 0.01;
  setP(N.inGain.gain, +P.gain, now);
  setP(N.hp.frequency, +P.hp, now);
  wp('gateOn', P.gateOn ? 1 : 0); wp('gateTh', +P.gateTh);
  wp('semis', +P.semis); wp('atOn', P.atOn ? 1 : 0); wp('atSpeed', P.atSpeed / 100);
  wp('atKey', +P.key); wp('atScale', +P.scale);
  wp('ringMix', P.ringMix / 100); wp('ringFreq', +P.ringFreq);
  wp('compAmt', P.comp / 100);
  setP(N.eqLow.gain, +P.eqLow, now); setP(N.eqMid.gain, +P.eqMid, now); setP(N.eqHigh.gain, +P.eqHigh, now);
  const dr = P.drive / 100;
  if (dr !== curveDrive) { N.shaper.curve = makeCurve(dr); curveDrive = dr; }
  setP(N.shTrim.gain, 1 - dr * 0.45, now);
  const col = COLORS[P.color] || COLORS.none;
  setP(N.colHP.frequency, col.hp, now); setP(N.colLP.frequency, col.lp, now);
  N.colHP.Q.value = col.q; N.colLP.Q.value = col.q;
  setP(N.colPk.frequency, col.pf, now); setP(N.colPk.gain, col.pg, now);
  setP(N.delay.delayTime, +P.dlyTime, now);
  setP(N.dlyFb.gain, P.dlyFb / 100, now);
  setP(N.dlyWet.gain, (P.dlyMix / 100) * 0.9, now);
  setP(N.revWet.gain, (P.revMix / 100) * 1.2, now);
  if (+P.revSize !== irSize) {
    clearTimeout(irTimer);
    const s = +P.revSize;
    const go = () => { if (ctx) { N.conv.buffer = makeIR(s); irSize = s; } };
    if (now) go(); else irTimer = setTimeout(go, 200);
  }
  setP(N.master.gain, P.vol / 100, now);
  fb.enabled = !!P.antiFb;
  if (!P.antiFb) clearNotches();
}

export function setMonitor(on) {
  if (ctx) N.out.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.02);
}
/* Oír la voz sin efecto mientras se mantiene pulsado */
export function setBypass(on) {
  if (!ctx) return;
  const t = ctx.currentTime;
  N.fxOut.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
  N.dry.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
}
export const recStream = () => N.rec && N.rec.stream;

/* ---------- dispositivos ---------- */
export async function switchInput(id) {
  if (!ctx) return;
  const ns = await getMic(id);
  if (src) src.disconnect();
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = ns; src = ctx.createMediaStreamSource(stream);
  src.connect(N.inGain); src.connect(N.anIn);
}
export async function switchOutput(id) {
  if (ctx && ctx.setSinkId) await ctx.setSinkId(id);
}
export async function listDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return {ins: [], outs: []};
  let devs = [];
  try { devs = await navigator.mediaDevices.enumerateDevices(); } catch (e) {}
  const pick = kind => devs.filter(d => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications');
  return {ins: pick('audioinput'), outs: pick('audiooutput')};
}
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => hooks.onDevices());
}

/* ---------- pantalla encendida ---------- */
async function requestWake() {
  try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) {}
}
function releaseWake() { try { if (wake) wake.release(); } catch (e) {} wake = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx) {
    if (ctx.state !== 'running') ctx.resume();
    requestWake();
  }
});

/* ---------- retardo estimado (ms) ---------- */
export function latency() {
  if (!ctx) return null;
  const base = ctx.baseLatency || 0;
  const hasOut = typeof ctx.outputLatency === 'number' && ctx.outputLatency > 0;
  const out = hasOut ? ctx.outputLatency : 0.012;      // si el navegador no lo da, se estima
  const fxMs = pitchOn ? winMs / 2 + 2 : 0;
  return {ms: Math.round((base + out) * 1000 + fxMs + 3), exact: hasOut, pitch: pitchOn};
}

/* ---------- anti-acople: detecta un pico estrecho y sostenido y lo recorta ---------- */
const fb = {bin: -1, count: 0, buf: null, enabled: true};
function clearNotches() {
  if (!ctx) return;
  notches.forEach(n => n.gain.setTargetAtTime(0, ctx.currentTime, 0.05));
}
function feedbackCheck() {
  if (!fb.enabled || !ctx) return;
  const an = N.anOut, bins = an.frequencyBinCount;
  if (!fb.buf || fb.buf.length !== bins) fb.buf = new Float32Array(bins);
  an.getFloatFrequencyData(fb.buf);
  const hz = ctx.sampleRate / an.fftSize;
  const lo = Math.floor(120 / hz), hi = Math.min(bins - 1, Math.floor(9000 / hz));
  let max = -Infinity, mi = -1, sum = 0, cnt = 0;
  for (let i = lo; i <= hi; i++) {
    const v = fb.buf[i];
    if (v > max) { max = v; mi = i; }
    if ((i & 3) === 0) { sum += v; cnt++; }
  }
  const mean = sum / Math.max(1, cnt);
  if (max > -22 && max - mean > 32 && Math.abs(mi - fb.bin) <= 1) fb.count++;
  else fb.count = 0;
  fb.bin = mi;
  if (fb.count >= fbFrames) {
    fb.count = 0;
    const f = mi * hz, t = ctx.currentTime;
    let n = notches.find(x => x.gain.value < -1 && Math.abs(x.frequency.value - f) / f < 0.03);
    if (n) { n.gain.setTargetAtTime(Math.max(-36, n.gain.value - 8), t, 0.01); }
    else {
      n = notches[notchIdx]; notchIdx = (notchIdx + 1) % notches.length;
      n.frequency.setValueAtTime(f, t); n.gain.setTargetAtTime(-24, t, 0.01);
    }
    N.duck.gain.cancelScheduledValues(t);
    N.duck.gain.setValueAtTime(0.35, t);
    N.duck.gain.linearRampToValueAtTime(1, t + 2);
    hooks.onFeedback(f);
  }
}

/* ---------- niveles (se llama cada fotograma) ---------- */
let tdIn, tdOut;
function peak(an, arr) {
  an.getFloatTimeDomainData(arr);
  let pk = 0; for (let i = 0; i < arr.length; i++) { const a = Math.abs(arr[i]); if (a > pk) pk = a; }
  return pk;
}
export function tick() {
  if (!ctx) return null;
  if (!tdIn) { tdIn = new Float32Array(N.anIn.fftSize); tdOut = new Float32Array(N.anOut.fftSize); }
  const res = {inPk: peak(N.anIn, tdIn), outPk: peak(N.anOut, tdOut)};
  feedbackCheck();
  return res;
}
export function reset() { tdIn = tdOut = null; noteInfo.v = false; }
