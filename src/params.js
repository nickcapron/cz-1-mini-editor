// ---------------------------------------------------------------------------
// CZ-1 MINI parameter model — the single source of truth.
//
// CC map reconciled from the official manual CC table (pp. 57-59) and the
// community web editor's constants. Confirmed structure:
//
//   line: 'global'  one CC, no line concept
//   line: 'bank'    one CC shared by BOTH lines; pick the line with Bank Select
//                   (CC0): 0=Line 1, 1=Line 2, sent immediately before the CC.
//                   Used by the three envelopes (PITCH / DCW / DCA).
//   line: 'split'   Line 1 uses `cc`, Line 2 uses a dedicated `cc2` ("lineOffset")
//                   — no bank select. Used by waveforms, DCW depth, key-follow.
//
// Enums are NOT 0..n: the synth reads a 0-127 CC and quantises it into zones.
// Each enum lists [lo,hi] zones; we send the zone midpoint and map incoming
// values back to a label.
//
// `verify:true` = still not hardware-confirmed (detune fine is disabled in the
// live web editor; CC93 mod source is from the manual only). Use MIDI Learn.
// ---------------------------------------------------------------------------

export const BANK_SELECT_CC = 0;

// Ordered for a subtractive-synth mindset: Oscillator -> Filter -> Amp -> Tone,
// then the rest, with the rarely-touched Pitch envelope near the end.
export const SECTIONS = [
  { id: 'waveforms', label: 'Oscillator', kind: 'controls' },
  { id: 'filter', label: 'Filter (resonant)', kind: 'controls' },
  { id: 'dcaEnv', label: 'Amp Envelope', kind: 'envelope' },
  { id: 'dcwEnv', label: 'Tone Envelope', kind: 'envelope' },
  { id: 'line', label: 'Line / Detune', kind: 'controls' },
  { id: 'keyfollow', label: 'Key Follow', kind: 'controls' },
  { id: 'vibrato', label: 'Vibrato', kind: 'controls' },
  { id: 'lfo', label: 'LFO 1', kind: 'controls' },
  { id: 'chorus', label: 'Chorus', kind: 'controls' },
  { id: 'pitchEnv', label: 'Pitch Envelope', kind: 'envelope' },
  { id: 'global', label: 'Global', kind: 'controls' }
];

// Build an enum spec from labels + their 0-127 value zones.
function en(names, zones) {
  return { names, zones, values: zones.map(([lo, hi]) => Math.round((lo + hi) / 2)) };
}
export function valueToIndex(p, v) {
  const z = p.enum.zones;
  for (let i = 0; i < z.length; i++) if (v >= z[i][0] && v <= z[i][1]) return i;
  return 0;
}
export function indexToValue(p, i) { return p.enum.values[i] ?? 0; }

const DCO_WAVES = en(
  ['Saw', 'Square', 'Pulse', 'Double Sine', 'Saw-Pulse', 'Reso I (Saw)', 'Reso II (Tri)', 'Reso III (Trap)'],
  [[0, 18], [19, 36], [37, 54], [55, 72], [73, 90], [91, 108], [109, 126], [127, 127]]
);
const LINE_MODE = en(['Line 1', 'Line 2', 'Line 1+2', "Line 1+1'"], [[0, 42], [43, 84], [85, 126], [127, 127]]);
const VIB_WAVE = en(['Triangle', 'Saw Up', 'Saw Down', 'Square'], [[0, 42], [43, 84], [85, 126], [127, 127]]);
const LFO_WAVE = en(['Triangle', 'Square', 'Saw', 'Ramp', 'S&H'], [[0, 25], [26, 50], [51, 76], [77, 101], [102, 127]]);
const ONOFF = en(['Off', 'On'], [[0, 64], [65, 127]]);
const POLARITY = en(["Down'", "Up'"], [[0, 64], [65, 127]]);
const DET_OCT = en(["0'", "1'", "2'", "3'"], [[0, 42], [43, 84], [85, 126], [127, 127]]);

// 8-stage envelope (levels + rates + sustain/end points), all bank-selected.
function envelope(section, { sustainCC, endCC, levelCCs, rateCCs }) {
  const out = [
    { id: `${section}_sus`, label: 'Sustain Pt', section, cc: sustainCC, line: 'bank', type: 'cont', min: 0, max: 127, def: 64 },
    { id: `${section}_end`, label: 'End Pt', section, cc: endCC, line: 'bank', type: 'cont', min: 0, max: 127, def: 127 }
  ];
  levelCCs.forEach((cc, i) =>
    out.push({ id: `${section}_l${i}`, label: `L${i}`, section, cc, line: 'bank', type: 'cont', min: 0, max: 127, def: i === 0 ? 0 : 80, lane: 'level', index: i }));
  rateCCs.forEach((cc, i) =>
    out.push({ id: `${section}_r${i}`, label: `R${i}`, section, cc, line: 'bank', type: 'cont', min: 0, max: 127, def: 80, lane: 'rate', index: i }));
  return out;
}

const cont = (id, label, section, cc, line, def = 0, extra = {}) => ({ id, label, section, cc, line, type: 'cont', min: 0, max: 127, def, ...extra });
const enumP = (id, label, section, cc, line, e, def = 0, extra = {}) => ({ id, label, section, cc, line, type: 'enum', enum: e, min: 0, max: 127, def, ...extra });

export const PARAMS = [
  // --- DCO Waveforms (split: Line 1 cc / Line 2 cc2) -----------------------
  enumP('wf1', 'WF1', 'waveforms', 13, 'split', DCO_WAVES, 0, { cc2: 16 }),
  enumP('wf2', 'WF2', 'waveforms', 14, 'split', DCO_WAVES, 0, { cc2: 17 }),
  cont('dcw_depth', 'DCW Depth', 'waveforms', 15, 'split', 0, { cc2: 18 }),

  // --- Line / Detune -------------------------------------------------------
  enumP('line_select', 'Line Mode', 'line', 8, 'global', LINE_MODE, 0, { withBank: true }),
  enumP('detune_pol', 'Detune Polarity', 'line', 9, 'global', POLARITY, 0),
  enumP('detune_oct', 'Detune Octave', 'line', 10, 'global', DET_OCT, 0),
  cont('detune_note', 'Detune Note', 'line', 11, 'global', 0),
  cont('detune_fine', 'Detune Fine', 'line', 12, 'global', 0, { verify: true }),

  // --- Envelopes (bank-selected per line) ----------------------------------
  ...envelope('pitchEnv', { sustainCC: 45, endCC: 46, levelCCs: [47, 48, 49, 50, 51, 52, 53, 54], rateCCs: [55, 56, 57, 58, 59, 60, 61, 62] }),
  ...envelope('dcwEnv', { sustainCC: 63, endCC: 64, levelCCs: [65, 66, 67, 68, 69, 70, 71, 72], rateCCs: [73, 74, 75, 76, 77, 78, 79, 80] }),
  ...envelope('dcaEnv', { sustainCC: 27, endCC: 28, levelCCs: [29, 30, 31, 32, 33, 34, 35, 36], rateCCs: [37, 38, 39, 40, 41, 42, 43, 44] }),

  // --- Key Follow (split) --------------------------------------------------
  enumP('dcw_kf', 'DCW Key Follow', 'keyfollow', 19, 'split', ONOFF, 0, { cc2: 23 }),
  cont('dcw_kf_rng', 'DCW KF Range', 'keyfollow', 20, 'split', 0, { cc2: 24 }),
  enumP('dca_kf', 'DCA Key Follow', 'keyfollow', 21, 'split', ONOFF, 0, { cc2: 25 }),
  cont('dca_kf_rng', 'DCA KF Range', 'keyfollow', 22, 'split', 0, { cc2: 26 }),

  // --- Vibrato (global) ----------------------------------------------------
  enumP('vib_wave', 'Wave', 'vibrato', 2, 'global', VIB_WAVE, 0),
  cont('vib_rate', 'Rate', 'vibrato', 3, 'global', 64),
  enumP('vib_sync', 'Sync', 'vibrato', 4, 'global', ONOFF, 0),
  cont('vib_sync_rate', 'Sync Rate', 'vibrato', 5, 'global', 64),
  cont('vib_depth', 'Depth', 'vibrato', 6, 'global', 0),
  cont('vib_delay', 'Delay', 'vibrato', 7, 'global', 0),

  // --- LFO 1 (hybrid) ------------------------------------------------------
  enumP('lfo1_wave', 'Wave', 'lfo', 81, 'global', LFO_WAVE, 0),
  cont('lfo1_amount', 'Amount', 'lfo', 82, 'global', 0),
  cont('lfo1_rate', 'Rate', 'lfo', 83, 'global', 64),

  // --- Filter (hybrid) -----------------------------------------------------
  cont('flt_cutoff', 'Cutoff', 'filter', 89, 'global', 127),
  cont('flt_reso', 'Resonance', 'filter', 90, 'global', 0),
  cont('flt_env', 'Env Amount', 'filter', 88, 'global', 0),
  cont('flt_a', 'Attack', 'filter', 84, 'global', 0),
  cont('flt_d', 'Decay', 'filter', 85, 'global', 64),
  cont('flt_s', 'Sustain', 'filter', 86, 'global', 127),
  cont('flt_r', 'Release', 'filter', 87, 'global', 32),

  // --- Chorus (hybrid) -----------------------------------------------------
  cont('cho_rate', 'Rate', 'chorus', 91, 'global', 64),
  cont('cho_depth', 'Depth', 'chorus', 92, 'global', 0),

  // --- Global --------------------------------------------------------------
  enumP('mod_source', 'Mod Source', 'global', 93, 'global', en(['Off', 'LFO 1', 'Velocity', 'Key Follow', 'Mod Wheel'], [[0, 25], [26, 50], [51, 76], [77, 101], [102, 127]]), 0, { verify: true })
];

export const PARAMS_BY_ID = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

export const isPerLine = (p) => p.line === 'bank' || p.line === 'split';

export function defaultPatch() {
  const patch = {};
  for (const p of PARAMS) patch[p.id] = p.def;
  return patch;
}
