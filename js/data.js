/* MicFX · datos: efectos, escalas, colores y ajustes por defecto */

export const DEFAULTS = {
  gateOn: true, gateTh: -55, hp: 80,
  semis: 0, atOn: false, atSpeed: 70, ringMix: 0, ringFreq: 50,
  color: 'none', drive: 0,
  eqLow: 0, eqMid: 0, eqHigh: 0, comp: 30,
  dlyTime: 0.3, dlyFb: 30, dlyMix: 0,
  revSize: 1.8, revMix: 0
};

export const KEYS = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
export const SCALES = ['Cromática', 'Mayor', 'Menor', 'Pentatónica menor', 'Pentatónica mayor'];

export const COLORS = {
  none:  {name: 'Ninguno',    hp: 20,  lp: 20000, pf: 1000, pg: 0, q: 0.7},
  mega:  {name: 'Megáfono',   hp: 600, lp: 4500,  pf: 2000, pg: 6, q: 0.9},
  radio: {name: 'Radio',      hp: 500, lp: 3500,  pf: 1500, pg: 4, q: 0.9},
  tel:   {name: 'Teléfono',   hp: 350, lp: 3200,  pf: 1000, pg: 3, q: 1.1},
  dist:  {name: 'Distorsión', hp: 80,  lp: 6500,  pf: 900,  pg: 2, q: 0.7}
};

export const CATS = [
  {id: 'hablar', name: 'Hablar',      icon: '🗣️'},
  {id: 'voces',  name: 'Voces',       icon: '🎭'},
  {id: 'cantar', name: 'Cantar',      icon: '🎤'},
  {id: 'inst',   name: 'Instrumento', icon: '🎸'},
  {id: 'mine',   name: 'Míos',        icon: '★'}
];

/* Cómo te vas a escuchar: ajusta la seguridad automáticamente */
export const LISTEN = {
  wired: {icon: '🎧', name: 'Cascos con cable', antiFb: false, fast: false, vol: 100, cap: 150,
          hint: 'La mejor opción: sin retardo y sin pitidos.'},
  phone: {icon: '📱', name: 'Altavoz del móvil', antiFb: true, fast: true, vol: 45, cap: 60,
          hint: 'Volumen bajo y el altavoz lejos del micro para evitar el pitido.'},
  ext:   {icon: '🔊', name: 'Altavoz externo', antiFb: true, fast: true, vol: 70, cap: 110,
          hint: 'Aleja el altavoz del micro. El anti-acople vigila por ti.'},
  bt:    {icon: '🔵', name: 'Bluetooth', antiFb: true, fast: false, vol: 80, cap: 150,
          hint: 'Bluetooth añade retardo (150–300 ms). Para tiempo real usa cables.'}
};

/*
  Cada efecto:
   p      → ajustes base
   int    → qué cambia el mando «Intensidad» ([valor al 0 %, valor al 100 %])
   i, a   → Intensidad y Ambiente por defecto
   echo   → cuánto del «Ambiente» va al eco (0–1);  revK → y a la reverb (0–1)
   size   → tamaño de la sala
*/
export const EFFECTS = [
  // ---- Hablar
  {id: 'clara', cat: 'hablar', emoji: '🗣️', name: 'Voz clara', desc: 'Tu voz, más nítida y con cuerpo.',
   p: {eqLow: -2, eqMid: 3, eqHigh: 2, hp: 120}, int: {comp: [30, 80]}, i: 50, a: 0},
  {id: 'mega', cat: 'hablar', emoji: '📢', name: 'Megáfono', desc: 'Voz potente de altavoz de calle.',
   p: {color: 'mega', hp: 200, comp: 70}, int: {drive: [10, 70]}, i: 40, a: 0},
  {id: 'pres', cat: 'hablar', emoji: '🎙️', name: 'Presentador', desc: 'Voz de radio: cálida y con presencia.',
   p: {eqLow: 3, eqMid: 1, eqHigh: 3, comp: 55}, int: {comp: [35, 75]}, i: 50, a: 20, size: 0.8},
  {id: 'estadio', cat: 'hablar', emoji: '🏟️', name: 'Estadio', desc: 'Suena como en un pabellón enorme.',
   p: {eqMid: 2, comp: 60, dlyTime: 0.28, dlyFb: 20}, int: {comp: [40, 80]}, i: 50, a: 50, echo: 0.5, size: 3.5},

  // ---- Voces
  {id: 'robot', cat: 'voces', emoji: '🤖', name: 'Robot', desc: 'Voz metálica de máquina.',
   p: {ringFreq: 55, comp: 50, eqMid: 2}, int: {ringMix: [40, 100]}, i: 70, a: 0},
  {id: 'monstruo', cat: 'voces', emoji: '👹', name: 'Monstruo', desc: 'Voz grave y áspera.',
   p: {eqLow: 5, color: 'dist', drive: 20, comp: 50}, int: {semis: [-3, -12]}, i: 60, a: 20, size: 1.2},
  {id: 'ardilla', cat: 'voces', emoji: '🐿️', name: 'Ardilla', desc: 'Voz aguda y divertida.',
   p: {comp: 40}, int: {semis: [3, 12]}, i: 70, a: 0},
  {id: 'radio', cat: 'voces', emoji: '📻', name: 'Radio', desc: 'Sonido de radio antigua.',
   p: {color: 'radio', comp: 60}, int: {drive: [10, 60]}, i: 40, a: 0},
  {id: 'tel', cat: 'voces', emoji: '☎️', name: 'Teléfono', desc: 'Como hablando por una llamada.',
   p: {color: 'tel', comp: 60}, int: {drive: [5, 40]}, i: 30, a: 0},
  {id: 'alien', cat: 'voces', emoji: '👽', name: 'Alien', desc: 'Voz extraterrestre con ecos raros.',
   p: {semis: 4, ringFreq: 280, dlyTime: 0.09, dlyFb: 55}, int: {ringMix: [20, 70]}, i: 50, a: 42, echo: 1, revK: 0},
  {id: 'cueva', cat: 'voces', emoji: '🕳️', name: 'Cueva', desc: 'Ecos y reverberación de cueva.',
   p: {dlyTime: 0.38, dlyFb: 45}, int: {dlyFb: [20, 70]}, i: 50, a: 58, echo: 1, size: 4},

  // ---- Cantar
  {id: 'sala', cat: 'cantar', emoji: '🎤', name: 'Sala', desc: 'Karaoke natural con un toque de sala.',
   p: {comp: 50, eqMid: 1, eqHigh: 2}, int: {comp: [30, 70]}, i: 50, a: 37, size: 1.6},
  {id: 'estudio', cat: 'cantar', emoji: '🎧', name: 'Eco de estudio', desc: 'Eco suave de cabina de grabación.',
   p: {comp: 50, eqHigh: 2, dlyTime: 0.32, dlyFb: 28}, int: {dlyFb: [10, 45]}, i: 50, a: 30, echo: 1, size: 1.8},
  {id: 'atsoft', cat: 'cantar', emoji: '🎵', name: 'Autotune suave', desc: 'Corrige la afinación con naturalidad.',
   p: {comp: 50, atOn: true}, int: {atSpeed: [10, 60]}, i: 60, a: 33, size: 1.6},
  {id: 'attpain', cat: 'cantar', emoji: '🎶', name: 'Autotune T-Pain', desc: 'El efecto robótico del pop actual.',
   p: {comp: 55, atOn: true}, int: {atSpeed: [70, 100]}, i: 100, a: 23, size: 1.2},
  {id: 'catedral', cat: 'cantar', emoji: '⛪', name: 'Catedral', desc: 'Reverberación enorme y majestuosa.',
   p: {comp: 45, eqHigh: 1}, int: {revSize: [2, 5]}, i: 75, a: 70},

  // ---- Instrumento
  {id: 'limpio', cat: 'inst', emoji: '🎸', name: 'Limpio', desc: 'Sonido natural con un poco de aire.',
   p: {gateOn: false, hp: 40}, int: {comp: [20, 60]}, i: 40, a: 20, size: 1.4},
  {id: 'overdrive', cat: 'inst', emoji: '🔥', name: 'Overdrive', desc: 'Distorsión cálida de guitarra.',
   p: {gateTh: -50, hp: 60, color: 'dist', eqMid: 3, comp: 40}, int: {drive: [20, 80]}, i: 50, a: 17, size: 1.4},
  {id: 'fuzz', cat: 'inst', emoji: '⚡', name: 'Fuzz', desc: 'Distorsión salvaje y densa.',
   p: {gateTh: -45, hp: 60, color: 'dist', eqLow: 2, eqHigh: -3, comp: 30}, int: {drive: [70, 100]}, i: 80, a: 0},
  {id: 'ambiente', cat: 'inst', emoji: '🌌', name: 'Ambiente', desc: 'Ecos largos y sala enorme.',
   p: {gateOn: false, hp: 40, comp: 35, dlyTime: 0.45, dlyFb: 50}, int: {dlyFb: [25, 70]}, i: 50, a: 58, echo: 0.86, size: 3.5},
  {id: 'octava', cat: 'inst', emoji: '⬇️', name: 'Octava abajo', desc: 'Todo una octava más grave.',
   p: {hp: 40, semis: -12, comp: 40}, int: {eqLow: [0, 6]}, i: 33, a: 0}
];

/* Parámetros de un efecto a partir de sus mandos Intensidad / Ambiente */
export function resolve(fx, macro) {
  const p = Object.assign({}, DEFAULTS, fx.p);
  if (!fx.custom) {
    const a = macro.a / 100;
    p.revMix = a * 60 * (fx.revK == null ? 1 : fx.revK);
    p.dlyMix = a * 60 * (fx.echo || 0);
    p.revSize = fx.size || 1.8;
    for (const [k, [lo, hi]] of Object.entries(fx.int || {})) p[k] = lo + (hi - lo) * macro.i / 100;
  }
  return p;
}
/* Qué ajustes controla cada mando (para soltar los cambios manuales) */
export const AMBIENT_KEYS = ['revMix', 'dlyMix', 'revSize'];
