// ---------------------------------------------------------------------------
// Starter preset library (~80 patches).
//
// ORIGINAL recreations inspired by the classic Casio CZ factory archetypes plus
// subtractive staples — authored in our own parameter model, not copied from any
// vintage SysEx bank. Each preset is written compactly (waveforms + ADSR macros
// + filter) and expanded into a full flat patch via the same ADSR->8-stage
// translation the editor's knobs use, so values stay consistent.
//
// Field reference (all 0-127 unless noted):
//   wf1/wf2     waveform name (params DCO_WAVES); wf2:true = copy wf1
//   amp         { a, d, s, r }                       -> DCA envelope (all required)
//   tone        { brightness, envAmount, a, d, r }   -> DCW envelope (all required)
//   filter      { cutoff, reso, env, a, d, s, r }    -> hybrid resonant filter
//   line        line mode name   detune { oct, note, fine, pol }
//   vib { wave, rate, depth, delay }   lfo { wave, amount, rate }   chorus { rate, depth }
//   dcwKf/dcaKf 'On' | 'Off'
// ---------------------------------------------------------------------------

import { defaultPatch, PARAMS_BY_ID, indexToValue } from './params.js';
import { ENV_BY_SECTION, adsrToStages } from './envelopes.js';

function enumVal(id, name) {
  const p = PARAMS_BY_ID[id];
  const i = p.enum.names.indexOf(name);
  return indexToValue(p, i < 0 ? 0 : i);
}

export function expandPreset(def) {
  const f = defaultPatch();
  const set = (id, v) => { if (v != null && id in f) f[id] = v; };

  if (def.wf1) set('wf1', enumVal('wf1', def.wf1));
  if (def.wf2) set('wf2', enumVal('wf2', def.wf2 === true ? def.wf1 : def.wf2));
  set('dcw_depth', def.dcwDepth);

  if (def.line) set('line_select', enumVal('line_select', def.line));
  if (def.detune) {
    if (def.detune.oct) set('detune_oct', enumVal('detune_oct', def.detune.oct));
    set('detune_note', def.detune.note);
    set('detune_fine', def.detune.fine);
    if (def.detune.pol) set('detune_pol', enumVal('detune_pol', def.detune.pol));
  }
  if (def.dcwKf) set('dcw_kf', enumVal('dcw_kf', def.dcwKf));
  if (def.dcaKf) set('dca_kf', enumVal('dca_kf', def.dcaKf));

  if (def.vib) {
    if (def.vib.wave) set('vib_wave', enumVal('vib_wave', def.vib.wave));
    set('vib_rate', def.vib.rate); set('vib_depth', def.vib.depth); set('vib_delay', def.vib.delay);
  }
  if (def.lfo) {
    if (def.lfo.wave) set('lfo1_wave', enumVal('lfo1_wave', def.lfo.wave));
    set('lfo1_amount', def.lfo.amount); set('lfo1_rate', def.lfo.rate);
  }
  if (def.filter) {
    const x = def.filter;
    set('flt_cutoff', x.cutoff); set('flt_reso', x.reso); set('flt_env', x.env);
    set('flt_a', x.a); set('flt_d', x.d); set('flt_s', x.s); set('flt_r', x.r);
  }
  if (def.chorus) { set('cho_rate', def.chorus.rate); set('cho_depth', def.chorus.depth); }

  if (def.amp) {
    const a = def.amp;
    Object.assign(f, adsrToStages(ENV_BY_SECTION.dcaEnv, { attack: a.a, decay: a.d, sustain: a.s, release: a.r }));
  }
  if (def.tone) {
    const t = def.tone;
    Object.assign(f, adsrToStages(ENV_BY_SECTION.dcwEnv, { brightness: t.brightness, envAmount: t.envAmount, attack: t.a, decay: t.d, release: t.r }));
  }
  return f;
}

// helper shorthands keep the table compact
const A = (a, d, s, r) => ({ a, d, s, r });
const T = (brightness, envAmount, a, d, r) => ({ brightness, envAmount, a, d, r });
const F = (cutoff, reso, env, a, d, s, r) => ({ cutoff, reso, env, a, d, s, r });

export const PRESETS = [
  // ---- Bass --------------------------------------------------------------
  { name: 'Electro Bass', cat: 'Bass', wf1: 'Saw', amp: A(0, 42, 78, 24), tone: T(72, 50, 0, 36, 20), filter: F(72, 30, 45, 0, 42, 38, 24) },
  { name: 'Sub Square', cat: 'Bass', wf1: 'Square', amp: A(0, 60, 104, 28), tone: T(42, 18, 0, 50, 24), filter: F(48, 12, 25, 0, 50, 50, 24) },
  { name: 'Reso Bass', cat: 'Bass', wf1: 'Reso I (Saw)', amp: A(0, 50, 70, 26), tone: T(66, 64, 0, 44, 22), filter: F(64, 58, 50, 0, 46, 30, 24) },
  { name: 'Acid Bass', cat: 'Bass', wf1: 'Saw-Pulse', dcwKf: 'On', amp: A(0, 40, 60, 20), tone: T(78, 72, 0, 36, 18), filter: F(60, 80, 60, 0, 40, 24, 20) },
  { name: 'Pluck Bass', cat: 'Bass', wf1: 'Pulse', amp: A(0, 34, 30, 18), tone: T(80, 64, 0, 30, 16), filter: F(70, 30, 46, 0, 32, 26, 18) },
  { name: 'Saw Bass', cat: 'Bass', wf1: 'Saw', amp: A(0, 48, 84, 26), tone: T(60, 40, 0, 44, 22), filter: F(66, 18, 38, 0, 46, 46, 24) },
  { name: 'Growl Bass', cat: 'Bass', wf1: 'Reso II (Tri)', lfo: { wave: 'Square', amount: 30, rate: 90 }, amp: A(0, 44, 72, 24), tone: T(70, 68, 0, 40, 20), filter: F(58, 66, 56, 0, 44, 30, 22) },
  { name: 'Round Bass', cat: 'Bass', wf1: 'Double Sine', amp: A(4, 52, 90, 30), tone: T(50, 30, 2, 48, 26), filter: F(56, 14, 30, 0, 50, 60, 26) },
  { name: 'Dark Bass', cat: 'Bass', wf1: 'Square', amp: A(0, 56, 96, 28), tone: T(36, 16, 0, 50, 24), filter: F(40, 10, 22, 0, 52, 54, 24) },
  { name: 'Punch Bass', cat: 'Bass', wf1: 'Saw', amp: A(0, 30, 64, 20), tone: T(74, 60, 0, 28, 16), filter: F(78, 26, 52, 0, 30, 30, 18) },
  { name: 'Detune Bass', cat: 'Bass', wf1: 'Saw', line: 'Line 1+2', detune: { fine: 8, pol: "Up'" }, amp: A(0, 46, 86, 26), tone: T(62, 44, 0, 44, 22), filter: F(64, 16, 36, 0, 46, 44, 24) },
  { name: 'FM Bass', cat: 'Bass', wf1: 'Reso III (Trap)', amp: A(0, 40, 58, 22), tone: T(82, 70, 0, 36, 18), filter: F(72, 40, 50, 0, 38, 28, 20) },

  // ---- Keys --------------------------------------------------------------
  { name: 'Farfisa Organ', cat: 'Keys', wf1: 'Square', wf2: 'Pulse', vib: { wave: 'Triangle', rate: 70, depth: 22, delay: 30 }, amp: A(2, 10, 127, 10), tone: T(92, 8, 2, 12, 10), filter: F(110, 10, 0, 0, 30, 110, 12) },
  { name: 'Rock Organ', cat: 'Keys', wf1: 'Square', vib: { wave: 'Triangle', rate: 80, depth: 30, delay: 20 }, amp: A(2, 12, 122, 12), tone: T(88, 14, 2, 14, 12), filter: F(104, 20, 10, 0, 30, 104, 14) },
  { name: 'Drawbar Organ', cat: 'Keys', wf1: 'Pulse', amp: A(0, 8, 127, 8), tone: T(84, 6, 0, 10, 8), filter: F(120, 6, 0, 0, 20, 120, 10) },
  { name: 'Rhodes EP', cat: 'Keys', wf1: 'Double Sine', chorus: { rate: 40, depth: 55 }, amp: A(3, 56, 58, 34), tone: T(74, 52, 3, 50, 30), filter: F(90, 14, 40, 2, 55, 40, 30) },
  { name: 'Wurli EP', cat: 'Keys', wf1: 'Pulse', chorus: { rate: 44, depth: 40 }, amp: A(2, 50, 52, 30), tone: T(78, 56, 0, 46, 28), filter: F(88, 18, 42, 0, 50, 36, 28) },
  { name: 'DX EP', cat: 'Keys', wf1: 'Reso II (Tri)', chorus: { rate: 30, depth: 45 }, amp: A(0, 60, 48, 40), tone: T(90, 64, 0, 56, 34), filter: F(100, 12, 30, 0, 58, 40, 34) },
  { name: 'Clav', cat: 'Keys', wf1: 'Pulse', dcwKf: 'On', amp: A(0, 30, 40, 18), tone: T(86, 60, 0, 26, 16), filter: F(96, 26, 40, 0, 28, 24, 16) },
  { name: 'Harpsichord', cat: 'Keys', wf1: 'Saw-Pulse', amp: A(0, 40, 44, 24), tone: T(84, 58, 0, 38, 22), filter: F(98, 16, 36, 0, 38, 30, 22) },
  { name: 'Toy Piano', cat: 'Keys', wf1: 'Reso III (Trap)', amp: A(0, 44, 30, 28), tone: T(92, 66, 0, 42, 26), filter: F(110, 14, 28, 0, 42, 22, 26) },
  { name: 'Tine Keys', cat: 'Keys', wf1: 'Double Sine', chorus: { rate: 36, depth: 48 }, amp: A(3, 54, 56, 36), tone: T(72, 50, 2, 52, 32), filter: F(92, 12, 38, 2, 52, 42, 32) },
  { name: 'Pump Organ', cat: 'Keys', wf1: 'Square', vib: { wave: 'Triangle', rate: 60, depth: 26, delay: 40 }, amp: A(8, 20, 118, 24), tone: T(80, 20, 4, 24, 22), filter: F(96, 16, 14, 4, 30, 100, 22) },
  { name: 'Pipe Organ', cat: 'Keys', wf1: 'Pulse', amp: A(4, 14, 124, 18), tone: T(86, 10, 2, 16, 16), filter: F(116, 8, 0, 2, 24, 116, 16) },

  // ---- Bell / Mallet -----------------------------------------------------
  { name: 'Glass Bell', cat: 'Bell', wf1: 'Reso II (Tri)', wf2: 'Double Sine', chorus: { rate: 30, depth: 40 }, amp: A(0, 72, 28, 60), tone: T(96, 70, 0, 66, 54), filter: F(118, 18, 30, 0, 70, 20, 56) },
  { name: 'Xylo Mallet', cat: 'Bell', wf1: 'Pulse', amp: A(0, 34, 0, 22), tone: T(84, 60, 0, 30, 20), filter: F(104, 12, 24, 0, 34, 0, 20) },
  { name: 'Music Box', cat: 'Bell', wf1: 'Reso III (Trap)', amp: A(0, 64, 18, 50), tone: T(92, 66, 0, 60, 46), filter: F(114, 16, 28, 0, 62, 14, 48) },
  { name: 'Tubular Bell', cat: 'Bell', wf1: 'Reso I (Saw)', chorus: { rate: 26, depth: 38 }, amp: A(0, 80, 24, 70), tone: T(90, 68, 0, 76, 64), filter: F(112, 20, 32, 0, 76, 18, 64) },
  { name: 'Marimba', cat: 'Bell', wf1: 'Double Sine', amp: A(0, 40, 0, 26), tone: T(70, 52, 0, 36, 22), filter: F(96, 10, 26, 0, 40, 0, 22) },
  { name: 'Vibraphone', cat: 'Bell', wf1: 'Double Sine', vib: { wave: 'Triangle', rate: 64, depth: 30, delay: 10 }, chorus: { rate: 30, depth: 44 }, amp: A(0, 70, 30, 56), tone: T(76, 54, 0, 66, 50), filter: F(100, 12, 28, 0, 66, 22, 50) },
  { name: 'Kalimba', cat: 'Bell', wf1: 'Pulse', amp: A(0, 30, 10, 24), tone: T(82, 60, 0, 26, 20), filter: F(102, 16, 30, 0, 30, 8, 22) },
  { name: 'Celesta', cat: 'Bell', wf1: 'Reso II (Tri)', amp: A(0, 56, 20, 46), tone: T(94, 66, 0, 54, 44), filter: F(116, 14, 28, 0, 54, 16, 44) },
  { name: 'Carillon', cat: 'Bell', wf1: 'Reso III (Trap)', amp: A(0, 84, 26, 72), tone: T(92, 70, 0, 80, 66), filter: F(114, 18, 30, 0, 80, 20, 66) },
  { name: 'Crystal', cat: 'Bell', wf1: 'Reso II (Tri)', wf2: 'Reso III (Trap)', chorus: { rate: 34, depth: 42 }, amp: A(0, 60, 34, 54), tone: T(98, 72, 0, 58, 50), filter: F(120, 20, 30, 0, 58, 26, 50) },
  { name: 'Bell Pad', cat: 'Bell', wf1: 'Double Sine', chorus: { rate: 30, depth: 52 }, amp: A(40, 80, 90, 70), tone: T(80, 56, 30, 80, 66), filter: F(96, 16, 34, 30, 80, 80, 66) },
  { name: 'Gamelan', cat: 'Bell', wf1: 'Reso I (Saw)', amp: A(0, 50, 22, 44), tone: T(88, 64, 0, 48, 40), filter: F(108, 22, 30, 0, 48, 18, 40) },

  // ---- Brass / Lead ------------------------------------------------------
  { name: 'Synth Brass', cat: 'Brass / Lead', wf1: 'Saw', amp: A(24, 50, 104, 34), tone: T(62, 60, 24, 50, 32), filter: F(82, 16, 52, 22, 50, 80, 32) },
  { name: 'Detuned Brass', cat: 'Brass / Lead', wf1: 'Saw', line: 'Line 1+2', detune: { fine: 12, pol: "Up'" }, chorus: { rate: 36, depth: 40 }, amp: A(26, 54, 106, 38), tone: T(64, 58, 26, 54, 34), filter: F(84, 14, 48, 24, 54, 84, 34) },
  { name: 'Square Lead', cat: 'Brass / Lead', wf1: 'Square', vib: { wave: 'Triangle', rate: 78, depth: 24, delay: 50 }, amp: A(3, 30, 110, 24), tone: T(80, 36, 3, 30, 22), filter: F(98, 28, 30, 2, 30, 96, 22) },
  { name: 'Sync Lead', cat: 'Brass / Lead', wf1: 'Saw-Pulse', amp: A(2, 32, 100, 24), tone: T(86, 66, 2, 30, 22), filter: F(100, 44, 40, 0, 32, 90, 22) },
  { name: 'Saw Lead', cat: 'Brass / Lead', wf1: 'Saw', vib: { wave: 'Triangle', rate: 80, depth: 20, delay: 60 }, amp: A(2, 28, 108, 22), tone: T(78, 40, 2, 28, 20), filter: F(100, 30, 34, 0, 28, 98, 20) },
  { name: 'Soft Lead', cat: 'Brass / Lead', wf1: 'Double Sine', chorus: { rate: 34, depth: 40 }, amp: A(8, 40, 100, 34), tone: T(64, 40, 6, 40, 30), filter: F(84, 18, 30, 6, 40, 90, 30) },
  { name: 'Hard Lead', cat: 'Brass / Lead', wf1: 'Saw-Pulse', amp: A(0, 26, 112, 20), tone: T(90, 60, 0, 26, 18), filter: F(104, 40, 40, 0, 26, 100, 18) },
  { name: 'Fifths Lead', cat: 'Brass / Lead', wf1: 'Saw', line: 'Line 1+2', detune: { oct: "1'" }, amp: A(3, 30, 106, 24), tone: T(76, 44, 2, 30, 22), filter: F(96, 24, 34, 2, 30, 96, 22) },
  { name: 'Mini Lead', cat: 'Brass / Lead', wf1: 'Pulse', vib: { wave: 'Triangle', rate: 76, depth: 22, delay: 44 }, amp: A(2, 30, 104, 22), tone: T(82, 48, 2, 30, 20), filter: F(98, 32, 36, 0, 30, 96, 20) },
  { name: 'Trumpet', cat: 'Brass / Lead', wf1: 'Saw', vib: { wave: 'Triangle', rate: 80, depth: 18, delay: 60 }, amp: A(18, 40, 100, 28), tone: T(66, 56, 16, 40, 26), filter: F(86, 14, 50, 16, 40, 84, 26) },
  { name: 'Horn Section', cat: 'Brass / Lead', wf1: 'Saw', chorus: { rate: 30, depth: 40 }, amp: A(30, 54, 104, 40), tone: T(60, 52, 28, 54, 36), filter: F(80, 12, 44, 28, 54, 86, 36) },
  { name: 'Brass Stab', cat: 'Brass / Lead', wf1: 'Saw', amp: A(4, 34, 0, 24), tone: T(70, 64, 2, 34, 22), filter: F(84, 18, 54, 2, 34, 0, 22) },
  { name: 'Whistle Lead', cat: 'Brass / Lead', wf1: 'Double Sine', vib: { wave: 'Triangle', rate: 84, depth: 30, delay: 40 }, amp: A(6, 30, 110, 28), tone: T(58, 30, 4, 30, 24), filter: F(78, 16, 24, 4, 30, 100, 24) },
  { name: 'PWM Lead', cat: 'Brass / Lead', wf1: 'Pulse', lfo: { wave: 'Triangle', amount: 40, rate: 50 }, amp: A(4, 34, 106, 26), tone: T(80, 44, 2, 34, 22), filter: F(96, 26, 32, 2, 34, 96, 22) },

  // ---- Pad / Strings -----------------------------------------------------
  { name: 'String Pad', cat: 'Pad / Strings', wf1: 'Saw', chorus: { rate: 32, depth: 60 }, amp: A(58, 80, 110, 70), tone: T(56, 40, 55, 80, 70), filter: F(78, 12, 36, 54, 80, 96, 70) },
  { name: 'Warm Pad', cat: 'Pad / Strings', wf1: 'Double Sine', chorus: { rate: 26, depth: 64 }, amp: A(70, 90, 116, 84), tone: T(46, 30, 66, 90, 82), filter: F(64, 10, 28, 64, 90, 100, 82) },
  { name: 'Glass Pad', cat: 'Pad / Strings', wf1: 'Double Sine', wf2: 'Reso II (Tri)', chorus: { rate: 28, depth: 58 }, amp: A(80, 90, 120, 90), tone: T(72, 44, 76, 90, 88), filter: F(86, 16, 30, 72, 90, 108, 88) },
  { name: 'Choir Vox', cat: 'Pad / Strings', wf1: 'Double Sine', chorus: { rate: 30, depth: 50 }, amp: A(55, 80, 115, 72), tone: T(50, 34, 52, 80, 70), filter: F(70, 10, 26, 50, 80, 102, 70) },
  { name: 'Analog Strings', cat: 'Pad / Strings', wf1: 'Saw', vib: { wave: 'Triangle', rate: 50, depth: 16, delay: 50 }, chorus: { rate: 34, depth: 58 }, amp: A(50, 78, 108, 66), tone: T(58, 42, 48, 78, 64), filter: F(80, 14, 38, 48, 78, 96, 64) },
  { name: 'Synth Strings', cat: 'Pad / Strings', wf1: 'Saw-Pulse', chorus: { rate: 32, depth: 56 }, amp: A(54, 82, 110, 70), tone: T(62, 46, 50, 82, 68), filter: F(82, 16, 36, 50, 82, 98, 68) },
  { name: 'Sweep Pad', cat: 'Pad / Strings', wf1: 'Reso I (Saw)', lfo: { wave: 'Triangle', amount: 40, rate: 30 }, amp: A(40, 90, 108, 70), tone: T(56, 78, 50, 95, 66), filter: F(70, 40, 70, 50, 95, 90, 66) },
  { name: 'Halo Pad', cat: 'Pad / Strings', wf1: 'Reso II (Tri)', chorus: { rate: 30, depth: 54 }, amp: A(76, 90, 118, 88), tone: T(74, 50, 70, 90, 84), filter: F(90, 18, 30, 70, 90, 108, 84) },
  { name: 'Dark Pad', cat: 'Pad / Strings', wf1: 'Square', chorus: { rate: 26, depth: 50 }, amp: A(72, 90, 112, 84), tone: T(38, 24, 66, 90, 80), filter: F(56, 10, 22, 66, 90, 98, 80) },
  { name: 'Air Pad', cat: 'Pad / Strings', wf1: 'Double Sine', chorus: { rate: 28, depth: 60 }, amp: A(84, 92, 120, 92), tone: T(60, 36, 76, 92, 88), filter: F(84, 12, 26, 76, 92, 108, 88) },
  { name: 'Ensemble', cat: 'Pad / Strings', wf1: 'Saw', line: 'Line 1+2', detune: { fine: 10, pol: "Up'" }, chorus: { rate: 36, depth: 62 }, amp: A(52, 80, 110, 68), tone: T(60, 44, 50, 80, 66), filter: F(80, 14, 36, 50, 80, 98, 66) },
  { name: 'Vox Pad', cat: 'Pad / Strings', wf1: 'Double Sine', chorus: { rate: 30, depth: 52 }, amp: A(58, 82, 114, 74), tone: T(52, 34, 52, 82, 72), filter: F(72, 12, 26, 52, 82, 102, 72) },
  { name: 'Octave Strings', cat: 'Pad / Strings', wf1: 'Saw', line: 'Line 1+2', detune: { oct: "1'" }, chorus: { rate: 32, depth: 56 }, amp: A(54, 80, 110, 70), tone: T(58, 42, 50, 80, 68), filter: F(80, 14, 36, 50, 80, 96, 68) },
  { name: 'Slow Pad', cat: 'Pad / Strings', wf1: 'Double Sine', chorus: { rate: 24, depth: 58 }, amp: A(90, 95, 120, 95), tone: T(48, 30, 84, 95, 90), filter: F(66, 10, 24, 84, 95, 104, 90) },

  // ---- Pluck / Perc ------------------------------------------------------
  { name: 'Pluck', cat: 'Pluck / Perc', wf1: 'Saw-Pulse', amp: A(0, 30, 18, 20), tone: T(80, 70, 0, 30, 18), filter: F(92, 30, 40, 0, 30, 16, 18) },
  { name: 'Reso Sweep', cat: 'Pluck / Perc', wf1: 'Reso I (Saw)', amp: A(30, 90, 110, 60), tone: T(58, 80, 60, 95, 70), filter: F(70, 62, 70, 50, 95, 90, 64) },
  { name: 'Synth Tom', cat: 'Pluck / Perc', wf1: 'Saw', amp: A(0, 26, 0, 16), tone: T(60, 50, 0, 22, 14), filter: F(76, 24, 30, 0, 26, 0, 14) },
  { name: 'Koto', cat: 'Pluck / Perc', wf1: 'Pulse', amp: A(0, 40, 14, 30), tone: T(84, 62, 0, 38, 26), filter: F(100, 18, 32, 0, 38, 12, 26) },
  { name: 'Harp', cat: 'Pluck / Perc', wf1: 'Double Sine', amp: A(0, 54, 10, 44), tone: T(72, 52, 0, 52, 40), filter: F(96, 12, 28, 0, 52, 8, 40) },
  { name: 'Guitar Pluck', cat: 'Pluck / Perc', wf1: 'Saw-Pulse', amp: A(0, 36, 20, 24), tone: T(78, 60, 0, 34, 22), filter: F(90, 20, 38, 0, 34, 18, 22) },
  { name: 'Sitar', cat: 'Pluck / Perc', wf1: 'Reso I (Saw)', dcwKf: 'On', amp: A(0, 44, 24, 34), tone: T(86, 66, 0, 42, 30), filter: F(104, 28, 34, 0, 42, 20, 30) },
  { name: 'Woodblock', cat: 'Pluck / Perc', wf1: 'Pulse', amp: A(0, 20, 0, 14), tone: T(88, 64, 0, 18, 12), filter: F(108, 14, 26, 0, 20, 0, 12) },
  { name: 'Clave', cat: 'Pluck / Perc', wf1: 'Reso III (Trap)', amp: A(0, 18, 0, 12), tone: T(90, 66, 0, 16, 10), filter: F(110, 16, 26, 0, 18, 0, 10) },
  { name: 'Zap', cat: 'Pluck / Perc', wf1: 'Reso II (Tri)', lfo: { wave: 'Saw', amount: 60, rate: 90 }, amp: A(0, 22, 0, 16), tone: T(96, 74, 0, 22, 14), filter: F(116, 30, 40, 0, 22, 0, 14) },
  { name: 'Blip', cat: 'Pluck / Perc', wf1: 'Pulse', amp: A(0, 16, 0, 12), tone: T(84, 60, 0, 16, 10), filter: F(100, 20, 30, 0, 16, 0, 10) },
  { name: 'Pizz Strings', cat: 'Pluck / Perc', wf1: 'Saw', chorus: { rate: 30, depth: 40 }, amp: A(0, 30, 8, 22), tone: T(66, 50, 0, 30, 18), filter: F(84, 16, 34, 0, 30, 6, 18) },

  // ---- Effects -----------------------------------------------------------
  { name: 'Sci-Fi Drone', cat: 'Effects', wf1: 'Reso I (Saw)', lfo: { wave: 'Triangle', amount: 70, rate: 20 }, amp: A(40, 90, 110, 80), tone: T(60, 70, 40, 95, 76), filter: F(64, 50, 60, 40, 95, 90, 76) },
  { name: 'Riser', cat: 'Effects', wf1: 'Saw', lfo: { wave: 'Saw', amount: 30, rate: 40 }, amp: A(100, 100, 120, 60), tone: T(50, 90, 100, 100, 50), filter: F(50, 40, 90, 100, 100, 110, 50) },
  { name: 'Laser', cat: 'Effects', wf1: 'Saw-Pulse', lfo: { wave: 'Saw', amount: 90, rate: 100 }, amp: A(0, 40, 0, 30), tone: T(90, 80, 0, 40, 26), filter: F(100, 50, 70, 0, 40, 0, 26) },
  { name: 'Drop', cat: 'Effects', wf1: 'Square', lfo: { wave: 'S&H', amount: 50, rate: 70 }, amp: A(0, 60, 0, 40), tone: T(70, 60, 0, 60, 34), filter: F(80, 30, 60, 0, 60, 0, 34) },
  { name: 'Noise Sweep', cat: 'Effects', wf1: 'Reso III (Trap)', lfo: { wave: 'S&H', amount: 80, rate: 90 }, amp: A(30, 90, 100, 70), tone: T(80, 90, 40, 95, 64), filter: F(70, 70, 80, 40, 95, 90, 64) },
  { name: 'Robot', cat: 'Effects', wf1: 'Pulse', lfo: { wave: 'Square', amount: 100, rate: 80 }, amp: A(0, 40, 80, 24), tone: T(84, 50, 0, 40, 22), filter: F(90, 40, 40, 0, 40, 70, 22) },
  { name: 'Telephone', cat: 'Effects', wf1: 'Square', lfo: { wave: 'Square', amount: 110, rate: 90 }, amp: A(0, 10, 110, 10), tone: T(88, 20, 0, 12, 10), filter: F(100, 60, 10, 0, 20, 100, 10) },
  { name: 'Wind Pad', cat: 'Effects', wf1: 'Reso II (Tri)', lfo: { wave: 'Triangle', amount: 60, rate: 40 }, chorus: { rate: 30, depth: 50 }, amp: A(80, 95, 115, 90), tone: T(56, 70, 76, 95, 86), filter: F(70, 55, 50, 76, 95, 100, 86) }
];
