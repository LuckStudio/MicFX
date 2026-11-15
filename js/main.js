/* =========================================================
   MicFX · interfaz y estado
   ========================================================= */
import {DEFAULTS, KEYS, SCALES, COLORS, CATS, LISTEN, EFFECTS, GOAL_ICONS, resolve, AMBIENT_KEYS} from './data.js';
import {store, takesDB} from './store.js';
import * as eng from './engine.js';

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.forEach(k => e.append(k));
  return e;
};

/* Icono de línea (las rutas son constantes del propio código) */
const ico = (inner, size = 28) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.5');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = inner; return s;
};

/* ---------- estado ---------- */
const state = {
  cat: store.get('cat', 'hablar'),
  fx: store.get('fx', 'clara'),
  macros: store.get('macros', {}),
  over: store.get('over', {}),
  vol: store.get('vol', 100),
  gain: store.get('gain', 1),
  key: store.get('key', 0),
  scale: store.get('scale', 1),
  listen: store.get('listen', 'wired'),
  antiFb: store.get('antiFb', false),
  lowLat: store.get('lowLat', false),
  mine: store.get('mine', []),
  inId: store.get('inId', ''),
  outId: '',
  monitor: true, on: false, takes: []
};
if (!LISTEN[state.listen]) state.listen = 'wired';

const allFx = () => EFFECTS.concat(state.mine);
const curFx = () => allFx().find(f => f.id === state.fx) || EFFECTS[0];
const macroOf = fx => state.macros[fx.id] || {i: fx.i == null ? 50 : fx.i, a: fx.a || 0};
if (!state.cat || (state.cat === 'mine' && !state.mine.length)) state.cat = curFx().cat;

function getParams() {
  const fx = curFx(), L = LISTEN[state.listen];
  const p = Object.assign(resolve(fx, macroOf(fx)), state.over);
  return Object.assign(p, {key: state.key, scale: state.scale, vol: state.vol, gain: state.gain, antiFb: state.antiFb, fbFast: L.fast});
}
let saveT;
function persistSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    ['cat', 'fx', 'macros', 'over', 'vol', 'gain', 'key', 'scale', 'listen', 'antiFb', 'lowLat', 'mine', 'inId'].forEach(k => store.set(k, state[k]));
  }, 250);
}
function pushAudio(now) { if (state.on) eng.apply(getParams(), !!now); persistSoon(); }

/* ---------- avisos ---------- */
let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
function showErr(msg) { const e = $('#err'); e.textContent = msg; e.classList.toggle('hidden', !msg); }
const fmtDur = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

/* =========================================================
   Pantalla principal
   ========================================================= */
function renderTabs() {
  const t = $('#tabs'); t.innerHTML = '';
  t.setAttribute('role', 'tablist');
  CATS.filter(c => c.id !== 'mine' || state.mine.length).forEach(c => {
    t.append(el('button', {class: 'tab', role: 'tab', 'aria-selected': String(c.id === state.cat), onclick: () => {
      state.cat = c.id; renderTabs(); renderCards(); persistSoon();
    }}, c.name));
  });
}
function renderCards() {
  const box = $('#cards'); box.innerHTML = '';
  allFx().filter(f => f.cat === state.cat).forEach(f => {
    const c = el('button', {class: 'card', 'aria-pressed': String(f.id === state.fx), onclick: () => selectFx(f.id)},
      el('i', {class: 'led', style: '--c:' + (f.c || '#8a8880')}), f.name);
    if (f.custom) {
      c.append(el('span', {class: 'del', role: 'button', 'aria-label': 'Borrar ' + f.name, onclick: e => {
        e.stopPropagation();
        if (!confirm('¿Borrar «' + f.name + '»?')) return;
        state.mine = state.mine.filter(x => x.id !== f.id);
        if (state.fx === f.id) { state.fx = 'clara'; state.over = {}; }
        if (!state.mine.length && state.cat === 'mine') state.cat = curFx().cat;
        renderAll(); pushAudio(); toast('Efecto borrado');
      }}, '✕'));
    }
    box.append(c);
  });
  $('#fxDesc').textContent = curFx().desc || '';
}
function selectFx(id) {
  state.fx = id; state.over = {};
  state.cat = curFx().cat;
  renderAll(); pushAudio(true);
}
function renderMacros() {
  const fx = curFx(), m = macroOf(fx), P = getParams();
  $('#rowI').classList.toggle('hidden', !!fx.custom || !Object.keys(fx.int || {}).length);
  $('#rowA').classList.toggle('hidden', !!fx.custom);
  $('#customNote').classList.toggle('hidden', !fx.custom);
  $('#sI').value = m.i; $('#oI').textContent = Math.round(m.i) + ' %';
  $('#sA').value = m.a; $('#oA').textContent = Math.round(m.a) + ' %';
  $('#sV').value = state.vol; $('#oV').textContent = Math.round(state.vol) + ' %';
  $('#extras').classList.toggle('hidden', !P.atOn);
  $('#selKey').value = state.key; $('#selScale').value = state.scale;
  $('#tuner').classList.toggle('hidden', !(P.atOn && state.on && eng.hasWorklet()));
}
function renderAll() { renderTabs(); renderCards(); renderMacros(); syncAdv(); updateHero(); }

function initMacros() {
  KEYS.forEach((k, i) => $('#selKey').append(el('option', {value: i}, k)));
  SCALES.forEach((k, i) => $('#selScale').append(el('option', {value: i}, k)));
  $('#sI').addEventListener('input', e => {
    const fx = curFx(); state.macros[fx.id] = Object.assign({}, macroOf(fx), {i: +e.target.value});
    Object.keys(fx.int || {}).forEach(k => delete state.over[k]);
    afterMacro();
  });
  $('#sA').addEventListener('input', e => {
    const fx = curFx(); state.macros[fx.id] = Object.assign({}, macroOf(fx), {a: +e.target.value});
    AMBIENT_KEYS.forEach(k => delete state.over[k]);
    afterMacro();
  });
  $('#sV').addEventListener('input', e => { state.vol = +e.target.value; afterMacro(); });
  $('#selKey').addEventListener('change', e => { state.key = +e.target.value; afterMacro(); });
  $('#selScale').addEventListener('change', e => { state.scale = +e.target.value; afterMacro(); });
}
function afterMacro() { renderMacros(); syncAdv(); pushAudio(); }

/* ---------- encender / apagar ---------- */
function updateHero() {
  const L = LISTEN[state.listen], fx = curFx();
  $('#heroTitle').textContent = state.on ? (state.monitor ? '¡En directo!' : 'Solo grabando (sin escucha)') : 'Toca para empezar';
  $('#heroSub').textContent = state.on
    ? fx.name + ' · ' + L.name
    : 'Te escucharás con ' + L.name + ' · cambiar';
}
function mapErr(e) {
  if (e && e.code === 'unsupported') return 'Este navegador no deja usar el micrófono aquí. Abre la página desde una dirección https:// en Chrome o Safari.';
  if (e && e.name === 'NotAllowedError') return 'Permiso de micrófono denegado. Actívalo en los ajustes del navegador para esta página y vuelve a intentarlo.';
  if (e && e.name === 'NotFoundError') return 'No se ha encontrado ningún micrófono.';
  return 'No se pudo abrir el micrófono: ' + ((e && (e.message || e.name)) || 'error desconocido');
}
let busy = false;
async function powerOn() {
  showErr('');
  let r;
  try {
    r = await eng.start({inId: state.inId, outId: state.outId, lowLat: state.lowLat, monitor: state.monitor, params: getParams()});
  } catch (e) { showErr(mapErr(e)); return false; }
  state.on = true;
  setOnUI(true);
  if (!r.worklet) toast('Este navegador no admite tono, autotune ni robot. Actualízalo para usarlos.', 4500);
  loop(); updateLatency(); refreshDevices();
  clearInterval(latTimer); latTimer = setInterval(updateLatency, 1000);
  return true;
}
function powerOff() {
  stopRec();
  eng.stop(); eng.reset();
  state.on = false;
  clearInterval(latTimer); cancelAnimationFrame(raf);
  setOnUI(false);
}
function setOnUI(on) {
  const p = $('#power');
  p.setAttribute('aria-pressed', String(on));
  p.setAttribute('aria-label', on ? 'Apagar micro' : 'Encender micro');
  p.style.setProperty('--lvl', 0);
  $('#btnRec').disabled = !on;
  $('#abBtn').classList.toggle('hidden', !on);
  $('#latChip').classList.toggle('hidden', !on);
  if (!on) { $('#mOut').style.width = '0'; }
  renderMacros(); updateHero();
}
$('#power').addEventListener('click', async () => {
  if (busy) return; busy = true;
  try { state.on ? powerOff() : await powerOn(); } finally { busy = false; }
});
async function restart() { if (!state.on) return; powerOff(); await powerOn(); }

/* ---------- retardo ---------- */
let latTimer, latWarned = false;
function updateLatency() {
  const l = eng.latency(); if (!l) return;
  const cls = l.ms < 45 ? 'ok' : l.ms < 120 ? 'warn' : 'bad';
  const chip = $('#latChip');
  chip.className = 'lat ' + cls;
  $('#latVal').textContent = (l.exact ? '' : '≈ ') + l.ms + ' ms';
  chip.title = 'Retardo estimado: ' + l.ms + ' ms' + (cls === 'bad' ? ' · muy alto: usa cascos con cable' : '');
  if (cls === 'bad' && !latWarned) {
    latWarned = true;
    toast('Hay mucho retardo (' + l.ms + ' ms). Con cascos con cable es mucho menor.', 4500);
  }
}
$('#latChip').addEventListener('click', () => toast($('#latChip').title, 3500));

/* ---------- visual: anillo, barra de salida y afinador ---------- */
let raf = 0, lastTune = '';
const meterW = pk => Math.max(0, Math.min(1, (20 * Math.log10(pk + 1e-9) + 55) / 55));
const noteName = m => { const r = Math.round(m); return KEYS[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1); };
function loop() {
  cancelAnimationFrame(raf);
  const power = $('#power'), mOut = $('#mOut');
  const tick = () => {
    if (!state.on) return;
    const r = eng.tick();
    if (r) {
      power.style.setProperty('--lvl', meterW(r.inPk).toFixed(3));
      mOut.style.width = (meterW(r.outPk) * 100).toFixed(0) + '%';
      mOut.style.background = r.outPk > 0.95 ? 'var(--bad)' : r.outPk > 0.6 ? 'var(--warn)' : 'var(--ok)';
    }
    renderTuner();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
function renderTuner() {
  const box = $('#tuner');
  if (box.classList.contains('hidden')) return;
  const n = eng.noteInfo;
  let txt, sub, pos = 50;
  if (!n.v) { txt = '–'; sub = 'Canta para ver la nota…'; }
  else {
    const cents = Math.round((n.m - n.t) * 100);
    txt = noteName(n.t); sub = (cents > 0 ? '+' : '') + cents + '¢ corregido';
    pos = 50 + Math.max(-50, Math.min(50, cents));
  }
  const key = txt + sub + pos;
  if (key === lastTune) return;
  lastTune = key;
  $('#tunerNote').textContent = txt; $('#tunerCents').textContent = sub; $('#tunerNeedle').style.left = pos + '%';
}

/* ---------- comparar con la voz original (mantener pulsado) ---------- */
(() => {
  const b = $('#abBtn');
  const on = e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {} eng.setBypass(true); b.classList.add('held'); };
  const off = () => { eng.setBypass(false); b.classList.remove('held'); };
  b.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, off));
  b.addEventListener('contextmenu', e => e.preventDefault());
})();

/* ---------- barra inferior ---------- */
function renderMon() {
  const b = $('#btnMon');
  b.setAttribute('aria-pressed', String(state.monitor));
  b.querySelector('.d-txt').textContent = state.monitor ? 'Escuchándote' : 'Sin escucha';
  updateHero();
}
$('#btnMon').addEventListener('click', () => {
  state.monitor = !state.monitor; eng.setMonitor(state.monitor); renderMon();
  if (!state.monitor) toast('No te oyes por el altavoz. La grabación sigue funcionando.');
});

/* =========================================================
   Grabación (se guarda en el navegador)
   ========================================================= */
let recorder = null, recChunks = [], recStart = 0, recTimer = null;
function pickMime() {
  if (!window.MediaRecorder) return null;
  for (const m of ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {}
  }
  return '';
}
function startRec() {
  const mime = pickMime();
  if (mime === null) { toast('Este navegador no permite grabar'); return; }
  try { recorder = new MediaRecorder(eng.recStream(), mime ? {mimeType: mime} : undefined); }
  catch (e) { toast('No se pudo empezar a grabar'); return; }
  recChunks = [];
  const fxName = curFx().name;
  recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
  const rec = recorder;
  rec.onstop = () => {
    const type = rec.mimeType || mime || 'audio/webm';
    addTake(new Blob(recChunks, {type}), (Date.now() - recStart) / 1000, fxName);
  };
  rec.start(250);
  recStart = Date.now();
  const b = $('#btnRec'); b.classList.add('rec');
  const upd = () => { b.querySelector('.d-txt').textContent = fmtDur((Date.now() - recStart) / 1000); };
  upd(); recTimer = setInterval(upd, 500);
}
function stopRec() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  clearInterval(recTimer);
  const b = $('#btnRec'); b.classList.remove('rec');
  b.querySelector('.d-txt').textContent = 'Grabar';
}
$('#btnRec').addEventListener('click', () => { recorder ? stopRec() : startRec(); });

function stamp(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function addTake(blob, dur, fxName) {
  const d = new Date();
  const take = {id: d.getTime(), name: 'Grabación ' + d.toLocaleString('es', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}),
    blob, dur, fx: fxName, type: blob.type};
  state.takes.unshift(take);
  takesDB.put(take);
  renderBadge();
  if ($('#takesDlg').open) renderTakes();
  toast('Grabación guardada en Tomas');
}
function renderBadge() {
  const b = $('#takesBadge');
  b.textContent = state.takes.length; b.classList.toggle('hidden', !state.takes.length);
}
let takeUrls = [];
function renderTakes() {
  takeUrls.forEach(u => URL.revokeObjectURL(u)); takeUrls = [];
  const box = $('#takes'); box.innerHTML = '';
  $('#takesEmpty').classList.toggle('hidden', !!state.takes.length);
  state.takes.forEach(t => {
    const url = URL.createObjectURL(t.blob); takeUrls.push(url);
    const ext = t.type.includes('mp4') ? 'm4a' : t.type.includes('ogg') ? 'ogg' : 'webm';
    const fname = 'micfx-' + stamp(new Date(t.id)) + '.' + ext;
    const row = el('div', {class: 'row'});
    row.append(el('button', {onclick: () => { const a = el('a', {href: url, download: fname}); document.body.append(a); a.click(); a.remove(); }}, 'Descargar'));
    const file = new File([t.blob], fname, {type: t.type});
    if (navigator.canShare && navigator.canShare({files: [file]})) {
      row.append(el('button', {onclick: async () => { try { await navigator.share({files: [file], title: t.name}); } catch (e) {} }}, 'Compartir'));
    }
    row.append(el('button', {'aria-label': 'Renombrar', onclick: () => {
      const n = prompt('Nombre de la grabación', t.name);
      if (n && n.trim()) { t.name = n.trim().slice(0, 60); takesDB.put(t); renderTakes(); }
    }}, 'Renombrar'));
    const del = el('button', {class: 'danger', 'aria-label': 'Borrar'}, 'Borrar');
    let armed = false;
    del.addEventListener('click', () => {
      if (!armed) { armed = true; del.classList.add('sure'); del.textContent = '¿Seguro?'; setTimeout(() => { armed = false; del.classList.remove('sure'); del.textContent = 'Borrar'; }, 2500); return; }
      state.takes = state.takes.filter(x => x.id !== t.id); takesDB.del(t.id); renderBadge(); renderTakes();
    });
    row.append(del);
    box.append(el('div', {class: 'take'},
      el('div', {class: 't-name'}, t.name),
      el('div', {class: 't-meta'}, fmtDur(t.dur) + ' · ' + t.fx),
      el('audio', {controls: true, src: url, preload: 'metadata'}), row));
  });
}
$('#btnTakes').addEventListener('click', () => { renderTakes(); openDlg('#takesDlg'); });
$('#takesDlg').addEventListener('close', () => { takeUrls.forEach(u => URL.revokeObjectURL(u)); takeUrls = []; $('#takes').innerHTML = ''; });

/* =========================================================
   Ajustar a fondo
   ========================================================= */
const pct = v => Math.round(v) + ' %';
const dB = v => (v > 0 ? '+' : '') + Number(v).toFixed(0) + ' dB';
const SECTIONS = [
  {title: 'Micro', items: [
    {id: 'gain', g: 1, label: 'Sensibilidad del micro', hint: 'Súbela si el micro capta poco.', min: 0, max: 4, step: 0.05, fmt: v => '×' + Number(v).toFixed(2)},
    {id: 'gateOn', label: 'Quitar ruido de fondo', hint: 'Silencia el micro cuando no hablas.', type: 'toggle'},
    {id: 'gateTh', label: 'Cuánto ruido quitar', hint: 'Más a la derecha = corta sonidos más fuertes.', min: -80, max: -20, step: 1, fmt: v => v + ' dB'},
    {id: 'hp', label: 'Quitar zumbidos graves', hint: 'Elimina golpes y rumor de baja frecuencia.', min: 20, max: 400, step: 5, fmt: v => v + ' Hz'}
  ]},
  {title: 'Voz y afinación', items: [
    {id: 'semis', label: 'Tono', hint: 'Más grave (–) o más agudo (+).', min: -12, max: 12, step: 1, fmt: v => (v > 0 ? '+' : '') + v + ' semitonos'},
    {id: 'atOn', label: 'Autotune', hint: 'Corrige la nota que cantas.', type: 'toggle'},
    {id: 'atSpeed', label: 'Fuerza del autotune', hint: 'Al máximo, efecto robótico.', min: 0, max: 100, step: 1, fmt: pct},
    {id: 'key', g: 1, label: 'Tonalidad', type: 'select', options: KEYS.map((k, i) => [i, k])},
    {id: 'scale', g: 1, label: 'Escala', type: 'select', options: SCALES.map((s, i) => [i, s])},
    {id: 'ringMix', label: 'Robot', min: 0, max: 100, step: 1, fmt: pct},
    {id: 'ringFreq', label: 'Tono del robot', min: 20, max: 500, step: 1, fmt: v => v + ' Hz'}
  ]},
  {title: 'Sonido', items: [
    {id: 'eqLow', label: 'Graves', min: -12, max: 12, step: 1, fmt: dB},
    {id: 'eqMid', label: 'Medios', min: -12, max: 12, step: 1, fmt: dB},
    {id: 'eqHigh', label: 'Agudos', min: -12, max: 12, step: 1, fmt: dB},
    {id: 'comp', label: 'Igualar volumen', hint: 'Sube lo flojo y baja lo fuerte (compresor).', min: 0, max: 100, step: 1, fmt: pct},
    {id: 'color', label: 'Carácter', type: 'select', options: Object.entries(COLORS).map(([k, c]) => [k, c.name])},
    {id: 'drive', label: 'Saturación', hint: 'Distorsión: de cálida a salvaje.', min: 0, max: 100, step: 1, fmt: pct}
  ]},
  {title: 'Eco', items: [
    {id: 'dlyMix', label: 'Cantidad', min: 0, max: 100, step: 1, fmt: pct},
    {id: 'dlyTime', label: 'Tiempo entre repeticiones', min: 0.05, max: 1, step: 0.01, fmt: v => Math.round(v * 1000) + ' ms'},
    {id: 'dlyFb', label: 'Número de repeticiones', min: 0, max: 90, step: 1, fmt: pct}
  ]},
  {title: 'Sala (reverb)', items: [
    {id: 'revMix', label: 'Cantidad', min: 0, max: 100, step: 1, fmt: pct},
    {id: 'revSize', label: 'Tamaño de la sala', min: 0.3, max: 5, step: 0.1, fmt: v => Number(v).toFixed(1) + ' s'}
  ]}
];
const advRefs = {};
function readP(id) { return (id === 'gain' || id === 'key' || id === 'scale') ? state[id] : getParams()[id]; }
function setParam(id, v) {
  if (id === 'gain' || id === 'key' || id === 'scale') state[id] = v; else state.over[id] = v;
  renderMacros(); syncAdv(); pushAudio();
}
function buildCtl(it) {
  if (it.type === 'toggle') {
    const inp = el('input', {type: 'checkbox'});
    inp.addEventListener('change', () => setParam(it.id, inp.checked));
    advRefs[it.id] = {it, inp};
    return el('label', {class: 'toggle'}, el('span', {}, it.label, it.hint ? el('small', {}, it.hint) : ''), el('span', {class: 'sw'}, inp, el('span')));
  }
  if (it.type === 'select') {
    const sel = el('select');
    it.options.forEach(([v, t]) => sel.append(el('option', {value: v}, t)));
    sel.addEventListener('change', () => setParam(it.id, isNaN(+sel.value) ? sel.value : +sel.value));
    advRefs[it.id] = {it, inp: sel};
    return el('label', {class: 'field', style: 'margin-bottom:14px'}, it.label, sel);
  }
  const out = el('output'), inp = el('input', {type: 'range', min: it.min, max: it.max, step: it.step});
  inp.addEventListener('input', () => setParam(it.id, +inp.value));
  advRefs[it.id] = {it, inp, out};
  return el('label', {class: 'slider'}, el('span', {class: 's-top'}, el('b', {style: 'font-weight:500'}, it.label), out),
    it.hint ? el('span', {class: 's-hint'}, it.hint) : '', inp);
}
function buildAdvanced() {
  const box = $('#advBody'); box.innerHTML = '';
  SECTIONS.forEach((sec, i) => {
    const det = el('details', {open: i === 0 ? true : null}, el('summary', {}, sec.title));
    sec.items.forEach(it => det.append(buildCtl(it)));
    box.append(det);
  });
  syncAdv();
}
function syncAdv() {
  const P = getParams();
  for (const [id, r] of Object.entries(advRefs)) {
    const v = (id === 'gain' || id === 'key' || id === 'scale') ? state[id] : P[id];
    if (r.it.type === 'toggle') r.inp.checked = !!v;
    else { r.inp.value = v; if (r.out) r.out.textContent = r.it.fmt(+v); }
  }
}
$('#btnAdv').addEventListener('click', () => {
  $('#advNote').textContent = 'Efecto actual: ' + curFx().name + '. Los cambios se oyen al momento.';
  openDlg('#advDlg');
});
$('#resetFx').addEventListener('click', () => {
  const fx = curFx(); state.over = {}; delete state.macros[fx.id];
  renderAll(); pushAudio(true); toast('Efecto restablecido');
});
function savePreset() {
  const inp = $('#presetName');
  const name = inp.value.trim() || ('Mi efecto ' + (state.mine.length + 1));
  const P = getParams(), p = {};
  Object.keys(DEFAULTS).forEach(k => p[k] = P[k]);
  const i = state.mine.findIndex(x => x.name === name);
  const fx = {id: i >= 0 ? state.mine[i].id : 'u' + Date.now(), custom: true, cat: 'mine', c: '#8a8880', name, desc: 'Efecto guardado por ti.', p};
  if (i >= 0) state.mine[i] = fx; else state.mine.push(fx);
  inp.value = '';
  state.fx = fx.id; state.cat = 'mine'; state.over = {};
  renderAll(); persistSoon();
  toast('«' + name + '» guardado en ★ Míos');
}
$('#savePreset').addEventListener('click', savePreset);
$('#presetName').addEventListener('keydown', e => { if (e.key === 'Enter') savePreset(); });

/* =========================================================
   Ajustes
   ========================================================= */
function applyListen(id, setVol) {
  const L = LISTEN[id];
  state.listen = id; state.antiFb = L.antiFb;
  state.vol = setVol ? L.vol : Math.min(state.vol, L.cap);
  renderMacros(); updateHero(); pushAudio();
}
async function renderSettings() {
  const box = $('#setBody'); box.innerHTML = '';

  box.append(el('h3', {style: 'margin-top:0'}, 'Cómo te escuchas'));
  const choices = el('div', {class: 'choices', style: 'grid-template-columns:1fr 1fr'});
  const hint = el('p', {class: 'listen-hint'}, LISTEN[state.listen].hint);
  Object.entries(LISTEN).forEach(([id, L]) => {
    choices.append(el('button', {class: 'choice', style: 'min-height:84px', 'aria-pressed': String(id === state.listen), onclick: () => {
      applyListen(id, false);
      choices.querySelectorAll('.choice').forEach(b => b.setAttribute('aria-pressed', String(b === choices.children[Object.keys(LISTEN).indexOf(id)])));
      hint.textContent = L.hint; syncSettingsToggles();
    }}, ico(L.svg, 26), L.name));
  });
  box.append(choices, hint);

  const t1 = el('input', {type: 'checkbox', id: 'tgFb'}), t2 = el('input', {type: 'checkbox', id: 'tgLow'});
  t1.addEventListener('change', () => { state.antiFb = t1.checked; pushAudio(); });
  t2.addEventListener('change', async () => {
    state.lowLat = t2.checked; persistSoon();
    toast(state.lowLat ? 'Latencia mínima activada' : 'Latencia mínima desactivada');
    await restart();
  });
  box.append(
    el('label', {class: 'toggle'}, el('span', {}, 'Anti-acople automático', el('small', {}, 'Detecta el pitido y lo recorta.')), el('span', {class: 'sw'}, t1, el('span'))),
    el('label', {class: 'toggle'}, el('span', {}, 'Latencia mínima', el('small', {}, 'Menos retardo. Puede entrecortarse en móviles lentos. Reinicia el micro.')), el('span', {class: 'sw'}, t2, el('span')))
  );
  const g = el('input', {type: 'range', min: 0, max: 4, step: 0.05, 'aria-label': 'Sensibilidad del micro'}), go = el('output');
  g.value = state.gain; go.textContent = '×' + state.gain.toFixed(2);
  g.addEventListener('input', () => { state.gain = +g.value; go.textContent = '×' + state.gain.toFixed(2); syncAdv(); pushAudio(); });
  box.append(el('label', {class: 'slider'}, el('span', {class: 's-top'}, el('b', {style: 'font-weight:500'}, 'Sensibilidad del micro'), go),
    el('span', {class: 's-hint'}, 'Súbela si el micro capta poco.'), g));
  syncSettingsToggles();

  // Dispositivos
  const dev = await eng.listDevices();
  const mk = (list, cur, label, prefix, onchange) => {
    const sel = el('select'); sel.append(el('option', {value: ''}, 'Predeterminado del sistema'));
    list.forEach((d, i) => sel.append(el('option', {value: d.deviceId}, d.label || (prefix + ' ' + (i + 1)))));
    sel.value = cur || ''; sel.addEventListener('change', () => onchange(sel.value));
    return el('label', {class: 'field', style: 'margin-bottom:14px'}, label, sel);
  };
  if (dev.ins.length > 1) {
    box.append(mk(dev.ins, state.inId, 'Micro', 'Micro', async id => {
      state.inId = id; persistSoon();
      try { await eng.switchInput(id); toast('Micro cambiado'); } catch (e) { toast('No se pudo cambiar el micro'); }
    }));
  }
  if (eng.canSetSink() && dev.outs.length > 1) {
    box.append(mk(dev.outs, state.outId, 'Salida de audio', 'Salida', async id => {
      state.outId = id;
      try { await eng.switchOutput(id); toast('Salida cambiada'); } catch (e) { toast('No se pudo cambiar la salida'); }
    }));
  }
  box.append(
    el('button', {class: 'btn-wide', style: 'margin-top:8px', onclick: () => { $('#setDlg').close(); showIntro(); }}, 'Ver la bienvenida otra vez'),
    el('button', {class: 'btn-ghost', onclick: () => {
      if (confirm('Se borrarán tus efectos guardados y los ajustes. Las grabaciones se mantienen.')) { store.clear(); location.reload(); }
    }}, 'Restablecer todos los ajustes')
  );
}
function syncSettingsToggles() {
  const a = $('#tgFb'), b = $('#tgLow');
  if (a) a.checked = state.antiFb;
  if (b) b.checked = state.lowLat;
}
$('#btnSettings').addEventListener('click', () => { renderSettings(); openDlg('#setDlg'); });
$('#heroSub').addEventListener('click', () => { renderSettings(); openDlg('#setDlg'); });
$('#btnHelp').addEventListener('click', () => openDlg('#helpDlg'));
$('#replayIntro').addEventListener('click', () => { $('#helpDlg').close(); showIntro(); });
eng.setHooks({
  onFeedback: f => toast('Acople detectado en ' + (f >= 1000 ? (f / 1000).toFixed(1) + ' kHz' : Math.round(f) + ' Hz') + ' · corregido'),
  onDevices: () => { if (state.on) toast('Dispositivo de audio conectado o desconectado'); if ($('#setDlg').open) renderSettings(); }
});
function refreshDevices() { /* los selectores se rellenan al abrir Ajustes */ }

/* =========================================================
   Diálogos y bienvenida
   ========================================================= */
function openDlg(sel) { const d = $(sel); if (!d.open) d.showModal(); }
document.querySelectorAll('dialog.sheet').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
});

const GOALS = [
  {cat: 'hablar', name: 'Hablar más alto'},
  {cat: 'voces', name: 'Cambiar mi voz'},
  {cat: 'cantar', name: 'Cantar (karaoke)'},
  {cat: 'inst', name: 'Tocar un instrumento'}
];
function showIntro() {
  const step = n => document.querySelectorAll('#introDlg .step').forEach(s => s.classList.toggle('hidden', s.dataset.step !== String(n)));
  step(1);
  $('#introGo').disabled = true; $('#listenHint').textContent = '';
  const g = $('#goalChoices'); g.innerHTML = '';
  GOALS.forEach(o => g.append(el('button', {class: 'choice', onclick: () => {
    state.cat = o.cat;
    const first = EFFECTS.find(f => f.cat === o.cat);
    state.fx = first.id; state.over = {};
    renderAll(); pushAudio(true); step(2);
  }}, ico(GOAL_ICONS[o.cat], 26), o.name)));
  const l = $('#listenChoices'); l.innerHTML = '';
  Object.entries(LISTEN).forEach(([id, L]) => l.append(el('button', {class: 'choice', 'aria-pressed': 'false', onclick: e => {
    applyListen(id, true);
    l.querySelectorAll('.choice').forEach(b => b.setAttribute('aria-pressed', 'false'));
    e.currentTarget.setAttribute('aria-pressed', 'true');
    $('#listenHint').textContent = L.hint; $('#introGo').disabled = false;
  }}, ico(L.svg, 26), L.name)));
  openDlg('#introDlg');
}
$('#introGo').addEventListener('click', () => $('#introDlg').close());
$('#introDlg').addEventListener('close', () => store.set('intro2', 1));

/* ---------- atajos de teclado ---------- */
document.addEventListener('keydown', e => {
  if (e.target !== document.body || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); $('#power').click(); }
  else if (k === 'm') $('#btnMon').click();
  else if (k === 'r' && state.on) $('#btnRec').click();
  else if (k === 'b' && state.on) { eng.setBypass(true); $('#abBtn').classList.add('held'); }
});
document.addEventListener('keyup', e => {
  if (e.key.toLowerCase() === 'b' && state.on) { eng.setBypass(false); $('#abBtn').classList.remove('held'); }
});

/* =========================================================
   Inicio
   ========================================================= */
initMacros();
buildAdvanced();
renderAll();
renderMon();
takesDB.all().then(t => { state.takes = t; renderBadge(); });
if (!store.get('intro2', 0)) showIntro();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__micfx = {state, eng};
