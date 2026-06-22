// ---------------------------------------------------------------------------
// ADSR <-> CZ 8-stage envelope translation.
//
// Each CZ envelope is 8 (rate, level) stages plus a sustain point and end point.
// That's a superset of ADSR, so we expose familiar ADSR-style macros that GENERATE
// the underlying stage values — the synth receives identical data, and the full
// 8-stage grid stays available in the Advanced view.
//
// Simple ADSR uses only the first three stages:
//   stage 0: rate=Attack   level=peak
//   stage 1: rate=Decay     level=sustain     (sustain point lives here)
//   stage 2: rate=Release   level=floor       (end point lives here)
//   stages 3..7: parked at floor (unused)
//
// CZ rate convention is assumed "higher = faster" (so time = 127 - rate). The
// instant attack on hardware confirms this direction is correct.
//
// POINT_OFFSET: the hardware places the sustain/end POINT one stage EARLIER than
// our stage numbering — a held note froze at the attack peak (stage 0) instead of
// decaying to the sustain level (stage 1). Bumping both points by +1 stage makes a
// held note settle on the sustain level and release from there. Set to 0 to revert
// if a future hardware recheck shows the points are already aligned.
// ---------------------------------------------------------------------------

const clamp = (v) => Math.max(0, Math.min(127, Math.round(v)));
const RATE_INVERTED = true;
const rateFromTime = (t) => clamp(RATE_INVERTED ? 127 - t : t);
const timeFromRate = (r) => clamp(RATE_INVERTED ? 127 - r : r);

// ADSR sustain sits on stage 1, release floor on stage 2 (our numbering);
// POINT_OFFSET shifts the emitted point CCs to match the hardware's indexing.
const SUS_STAGE = 1;
const END_STAGE = 2;
const POINT_OFFSET = 1;

// Sustain point is a 0-127 CC quantised into 8 zones (stage 0..7).
const SUS_VALUES = [9, 27, 45, 63, 81, 99, 117, 127];
const susPointValue = (idx) => SUS_VALUES[Math.max(0, Math.min(7, idx))];
export function susPointIndex(v) {
  const z = [[0, 18], [19, 36], [37, 54], [55, 72], [73, 90], [91, 108], [109, 126], [127, 127]];
  for (let i = 0; i < z.length; i++) if (v >= z[i][0] && v <= z[i][1]) return i;
  return 0;
}
// End point quantises to stage labels 2..8 (min is 2). We use stage 2.
const END_VALUES = { 2: 10, 3: 32, 4: 53, 5: 74, 6: 95, 7: 116, 8: 127 };
const endPointValue = (stage) => END_VALUES[Math.max(2, Math.min(8, stage))];
export function endPointStage(v) {
  const z = [[0, 21, 2], [22, 42, 3], [43, 63, 4], [64, 84, 5], [85, 105, 6], [106, 126, 7], [127, 127, 8]];
  for (const [lo, hi, s] of z) if (v >= lo && v <= hi) return s;
  return 2;
}

// The envelopes that get an Easy ADSR view. Pitch stays advanced-only.
export const ENVELOPES = [
  {
    section: 'dcaEnv', kind: 'amp', label: 'Amp', advancedOnly: false,
    macros: [
      { key: 'attack', label: 'Attack', def: 4 },
      { key: 'decay', label: 'Decay', def: 50 },
      { key: 'sustain', label: 'Sustain', def: 110 },
      { key: 'release', label: 'Release', def: 40 }
    ]
  },
  {
    section: 'dcwEnv', kind: 'tone', label: 'Tone (DCW)', advancedOnly: false,
    macros: [
      { key: 'brightness', label: 'Brightness', def: 95 },
      { key: 'envAmount', label: 'Env Amount', def: 30 },
      { key: 'attack', label: 'Attack', def: 8 },
      { key: 'decay', label: 'Decay', def: 60 },
      { key: 'release', label: 'Release', def: 45 }
    ]
  },
  { section: 'pitchEnv', kind: 'pitch', label: 'Pitch', advancedOnly: true, macros: [] }
];

export const ENV_BY_SECTION = Object.fromEntries(ENVELOPES.map((e) => [e.section, e]));

export function defaultMacro(env) {
  const m = {}; for (const d of env.macros) m[d.key] = d.def; return m;
}

// Musically-tame random ADSR macro (keeps notes audible, not all-instant/all-slow).
export function randomMacro(env) {
  const r = (min, max) => min + Math.round(Math.random() * (max - min));
  const m = {};
  for (const d of env.macros) {
    if (d.key === 'sustain' || d.key === 'brightness') m[d.key] = r(55, 127);
    else if (d.key === 'envAmount') m[d.key] = r(0, 70);
    else if (d.key === 'attack') m[d.key] = r(0, 45);
    else m[d.key] = r(10, 95); // decay / release
  }
  return m;
}

// ADSR macro -> the 18 stage values, keyed by param id (e.g. "dcaEnv_l0").
export function adsrToStages(env, m) {
  const s = env.section;
  const out = {};
  const floor = 0;
  let peak, sustain;
  if (env.kind === 'amp') {
    peak = 127;
    sustain = clamp(m.sustain);
  } else { // tone: brightness is the held level, env amount is the upward sweep
    sustain = clamp(m.brightness);
    peak = clamp(m.brightness + m.envAmount);
  }
  const set = (k, v) => { out[`${s}_${k}`] = clamp(v); };
  set('l0', peak); set('r0', rateFromTime(m.attack));
  set('l1', sustain); set('r1', rateFromTime(m.decay));
  set('l2', floor); set('r2', rateFromTime(m.release));
  for (let i = 3; i < 8; i++) { set(`l${i}`, floor); set(`r${i}`, 127); }
  out[`${s}_sus`] = susPointValue(SUS_STAGE + POINT_OFFSET);
  out[`${s}_end`] = endPointValue(END_STAGE + POINT_OFFSET);
  return out;
}

// Best-fit stage values back into ADSR knobs, and decide if the shape is "custom"
// (i.e. an Advanced edit that simple ADSR can't represent).
export function stagesToAdsr(env, vals) {
  const s = env.section;
  const g = (k) => vals[`${s}_${k}`] ?? 0;
  const m = {};
  if (env.kind === 'amp') {
    m.attack = timeFromRate(g('r0'));
    m.decay = timeFromRate(g('r1'));
    m.sustain = g('l1');
    m.release = timeFromRate(g('r2'));
  } else {
    m.brightness = g('l1');
    m.envAmount = clamp(g('l0') - g('l1'));
    m.attack = timeFromRate(g('r0'));
    m.decay = timeFromRate(g('r1'));
    m.release = timeFromRate(g('r2'));
  }
  // Custom if the parts ADSR doesn't touch have been moved away from the simple shape.
  let custom = susPointIndex(g('sus')) !== SUS_STAGE + POINT_OFFSET || endPointStage(g('end')) !== END_STAGE + POINT_OFFSET || g('l2') > 4;
  for (let i = 3; i < 8 && !custom; i++) if (g(`l${i}`) > 4) custom = true;
  return { macro: m, custom };
}
