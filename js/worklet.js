/* =========================================================
   MicFX · procesador de audio (AudioWorklet)
   Puerta de ruido → cambio de tono / autotune → robot → compresor.
   Todo en un solo nodo y sin "lookahead", para añadir el mínimo
   retardo posible (el compresor nativo del navegador suma ~6 ms).
   ========================================================= */
class FxProc extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = 'k-rate';
    return [
      {name: 'gateOn', defaultValue: 1, automationRate: k},
      {name: 'gateTh', defaultValue: -55, automationRate: k},
      {name: 'semis', defaultValue: 0, automationRate: k},
      {name: 'atOn', defaultValue: 0, automationRate: k},
      {name: 'atSpeed', defaultValue: 0.7, automationRate: k},
      {name: 'atKey', defaultValue: 0, automationRate: k},
      {name: 'atScale', defaultValue: 1, automationRate: k},
      {name: 'ringMix', defaultValue: 0, automationRate: k},
      {name: 'ringFreq', defaultValue: 50, automationRate: k},
      {name: 'compAmt', defaultValue: 0.3, automationRate: k}
    ];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    const sr = sampleRate;

    // Desplazador de tono granular (dos cabezales cruzados)
    this.N = 16384; this.mask = this.N - 1;
    this.buf = new Float32Array(this.N); this.w = 0;
    this.W = Math.round(sr * (o.winMs || 30) / 1000);
    this.phase = 0.5; this.ratio = 1; this.wet = 0;

    // Puerta de ruido
    this.env = 0; this.g = 0; this.hold = 0;
    this.envA = Math.exp(-1 / (0.001 * sr)); this.envR = Math.exp(-1 / (0.05 * sr));
    this.gA = Math.exp(-1 / (0.002 * sr)); this.gR = Math.exp(-1 / (0.09 * sr));
    this.holdS = Math.round(0.07 * sr);

    // Compresor sin lookahead
    this.cenv = 0;
    this.cA = 1 - Math.exp(-1 / (0.003 * sr));
    this.cR = 1 - Math.exp(-1 / (0.15 * sr));

    // Detección de tono (YIN sobre señal a media frecuencia)
    this.dsN = 2048; this.dsMask = this.dsN - 1; this.ds = new Float32Array(this.dsN);
    this.dw = 0; this.dPrev = 0; this.dOdd = false; this.dsr = sr / 2;
    this.YN = 512; this.tMin = Math.max(2, Math.floor(this.dsr / 1000)); this.tMax = Math.ceil(this.dsr / 70);
    this.d = new Float32Array(this.tMax + 2);
    this.fr = new Float32Array(this.YN + this.tMax + 2);
    this.blk = 0; this.corr = 0; this.voiced = false; this.msg = 0; this.lastM = 0; this.lastT = 0;
    this.scales = [[0,1,2,3,4,5,6,7,8,9,10,11],[0,2,4,5,7,9,11],[0,2,3,5,7,8,10],[0,3,5,7,10],[0,2,4,7,9]];
    this.ringPh = 0;
  }

  read(d) {
    const pos = this.w - d, i0 = Math.floor(pos), f = pos - i0;
    const a = this.buf[i0 & this.mask], b = this.buf[(i0 + 1) & this.mask];
    return a + (b - a) * f;
  }

  detect(P) {
    const N = this.YN, tMax = this.tMax, L = N + tMax, fr = this.fr, M = this.dsMask;
    const start = (this.dw - L) & M;
    let e = 0;
    for (let j = 0; j < L; j++) fr[j] = this.ds[(start + j) & M];
    for (let j = 0; j < N; j++) e += fr[j] * fr[j];
    let tau = -1, f0 = 0;
    if (Math.sqrt(e / N) > 0.004) {
      const d = this.d; d[0] = 1; let run = 0;
      for (let t = 1; t <= tMax; t++) {
        let s = 0;
        for (let j = 0; j < N; j++) { const df = fr[j] - fr[j + t]; s += df * df; }
        run += s; d[t] = run > 0 ? s * t / run : 1;
      }
      for (let t = this.tMin; t < tMax; t++) {
        if (d[t] < 0.15) { while (t + 1 < tMax && d[t + 1] < d[t]) t++; tau = t; break; }
      }
      if (tau > 0) {
        const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a - 2 * b + c;
        const sh = den !== 0 ? 0.5 * (a - c) / den : 0;
        f0 = this.dsr / (tau + sh);
      }
    }
    if (tau > 0 && f0 > 60 && f0 < 1100) {
      const m = 69 + 12 * Math.log2(f0 / 440) + P.semis[0];
      const key = Math.round(P.atKey[0]);
      const sc = this.scales[Math.round(P.atScale[0])] || this.scales[0];
      let best = Math.round(m), bd = 1e9;
      for (let k = Math.floor(m) - 2; k <= Math.floor(m) + 3; k++) {
        const pc = ((k - key) % 12 + 12) % 12;
        if (sc.indexOf(pc) >= 0) { const dd = Math.abs(k - m); if (dd < bd) { bd = dd; best = k; } }
      }
      const sp = P.atSpeed[0], kk = 0.03 + 0.97 * sp * sp;
      this.corr += ((best - m) - this.corr) * kk;
      this.voiced = true; this.lastM = m; this.lastT = best;
    } else {
      this.corr *= 0.85; this.voiced = false;
    }
    if (++this.msg >= 6) { this.msg = 0; this.port.postMessage({v: this.voiced, m: this.lastM, t: this.lastT}); }
  }

  process(inputs, outputs, P) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const inp = inputs[0] && inputs[0][0];
    if (!inp) { out.fill(0); return true; }
    const n = out.length, sr = sampleRate;
    const gateOn = P.gateOn[0] > 0.5, th = Math.pow(10, P.gateTh[0] / 20);
    const semis = P.semis[0], atOn = P.atOn[0] > 0.5;
    const ringMix = P.ringMix[0], ringInc = 2 * Math.PI * P.ringFreq[0] / sr;
    const active = atOn || Math.abs(semis) > 0.01;
    const ca = P.compAmt[0];
    const compOn = ca > 0.001;
    const cThDb = -6 - 34 * ca, cSlope = 1 - 1 / (1 + 11 * ca), cMakeup = Math.pow(10, (ca * 10) / 20);

    // Alimentar el detector (media de pares = submuestreo x2)
    if (atOn) {
      for (let i = 0; i < n; i++) {
        const x = inp[i];
        if (this.dOdd) { this.ds[this.dw] = (x + this.dPrev) * 0.5; this.dw = (this.dw + 1) & this.dsMask; }
        else this.dPrev = x;
        this.dOdd = !this.dOdd;
      }
      if (++this.blk >= 4) { this.blk = 0; this.detect(P); }
    } else { this.corr = 0; this.voiced = false; }

    const r0 = this.ratio, r1 = Math.pow(2, (semis + (atOn ? this.corr : 0)) / 12);
    this.ratio = r1;
    const wetT = active ? 1 : 0, W = this.W;

    for (let i = 0; i < n; i++) {
      let x = inp[i];

      // Puerta de ruido
      const ax = x < 0 ? -x : x;
      this.env = ax > this.env ? this.envA * this.env + (1 - this.envA) * ax : this.envR * this.env + (1 - this.envR) * ax;
      let gt = 1;
      if (gateOn) {
        if (this.env > th) { this.hold = this.holdS; }
        else if (this.hold > 0) { this.hold--; }
        else gt = 0;
      }
      const gc = gt > this.g ? this.gA : this.gR;
      this.g = gc * this.g + (1 - gc) * gt;
      x *= this.g;
      this.buf[this.w] = x;

      // Cambio de tono (si no hay efecto, la señal pasa directa, sin retardo)
      let y = x;
      if (this.wet > 0.0001 || wetT > 0) {
        const r = r0 + (r1 - r0) * (i / n);
        const inc = (1 - r) / W;
        if (Math.abs(inc) < 1e-8) this.phase += (0.5 - this.phase) * 0.0005;
        else { this.phase += inc; if (this.phase >= 1) this.phase -= 1; else if (this.phase < 0) this.phase += 1; }
        let p2 = this.phase + 0.5; if (p2 >= 1) p2 -= 1;
        const w1 = Math.sin(Math.PI * this.phase), w2 = Math.sin(Math.PI * p2);
        const sh = this.read(this.phase * W + 2) * w1 * w1 + this.read(p2 * W + 2) * w2 * w2;
        this.wet += (wetT - this.wet) * 0.002;
        y = x + (sh - x) * this.wet;
      }
      this.w = (this.w + 1) & this.mask;

      // Robot
      if (ringMix > 0.001) {
        const m = Math.sin(this.ringPh);
        this.ringPh += ringInc; if (this.ringPh > 6.283185307179586) this.ringPh -= 6.283185307179586;
        y = y * (1 - ringMix) + y * m * ringMix * 1.4;
      }

      // Compresor (rodilla suave de 6 dB, sin lookahead)
      if (compOn) {
        const a = y < 0 ? -y : y;
        this.cenv += (a - this.cenv) * (a > this.cenv ? this.cA : this.cR);
        const ov = 20 * Math.log10(this.cenv + 1e-9) - cThDb;
        let gr = 0;
        if (ov >= 3) gr = -ov * cSlope;
        else if (ov > -3) { const t = ov + 3; gr = -cSlope * t * t / 12; }
        y *= Math.pow(10, gr / 20) * cMakeup;
      }
      out[i] = y;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('micfx', FxProc);
