// ---------------------------------------------------------------------------
// Casio CZ SysEx codec — used for both the .syx importer and save-to-memory.
//
// Format (classic Casio CZ, which the CZ-1 MINI is documented to be compatible
// with). Reference: github.com/ajwills72/cz101 docs/sysex.md
//
//   F0 44 00 00 (70+ch) <op> <program> <256 nibble-bytes> F7
//     44 00 00     Casio manufacturer id
//     70+ch        operation channel base
//     op           0x10 = request tone from synth, 0x20 = send tone to synth
//     program      0x00-0x1F preset, 0x20-0x3F internal memory slot,
//                  0x60 = temporary "edit buffer" (load & hear now)
//   Body: a 128-byte tone, transmitted as 256 half-bytes, LOW nibble first
//         (e.g. value 0x5F transmits as 0x0F 0x05).
//
// Envelope encoding (8 stages of rate+level per envelope):
//   rate  byte = round(119*rate/99), bit 0x80 set => stage is descending
//   level byte = round(127*level/99)
//   DCW level byte = round(119*level/99)+8, bit 0x80 set => sustain point here
//
// HONEST STATUS: the byte layout below is the documented classic format. The
// exact value scaling between a vintage tone and the MINI's CC engine is not
// hardware-verified, so decode-to-knobs is best-effort. The importer therefore
// ALSO sends the raw bytes to the synth's edit buffer, where the MINI decodes
// them natively — so imported patches sound correct regardless of our mapping.
// ---------------------------------------------------------------------------

import { PARAMS_BY_ID, indexToValue } from './params.js';

export const CASIO_ID = 0x44;
export const OP_REQUEST = 0x10;
export const OP_SEND = 0x20;
export const PROG_EDIT_BUFFER = 0x60;

const clamp = (v) => Math.max(0, Math.min(127, Math.round(v)));
const SUS_VALUES = [9, 27, 45, 63, 81, 99, 117, 127];
const END_VALUES = { 2: 10, 3: 32, 4: 53, 5: 74, 6: 95, 7: 116, 8: 127 };
const susValue = (stage) => SUS_VALUES[Math.max(0, Math.min(7, stage))];
const endValue = (stage) => END_VALUES[Math.max(2, Math.min(8, stage))];

// ---- nibble codec (low nibble first) --------------------------------------
function toNibbles(bytes) {
  const out = [];
  for (const b of bytes) { out.push(b & 0x0f, (b >> 4) & 0x0f); }
  return out;
}
function fromNibbles(nibbles) {
  const out = [];
  for (let i = 0; i + 1 < nibbles.length; i += 2) out.push((nibbles[i] & 0x0f) | ((nibbles[i + 1] & 0x0f) << 4));
  return out;
}

// ---- waveform <-> CC value -------------------------------------------------
const waveToCC = (idx) => indexToValue(PARAMS_BY_ID.wf1, Math.max(0, Math.min(7, idx)));
const ccToWaveIdx = (v) => {
  const z = PARAMS_BY_ID.wf1.enum.zones;
  for (let i = 0; i < z.length; i++) if (v >= z[i][0] && v <= z[i][1]) return i;
  return 0;
};

// ---- one 16-byte envelope block <-> our stage values ----------------------
// kind: 'amp' | 'dcw' | 'pitch'. Returns { l:[8], r:[8], sus, end } in 0-127.
function decodeEnv(body, off, endStep, kind) {
  const l = [], r = [];
  let susStage = -1;
  for (let i = 0; i < 8; i++) {
    const rb = body[off + i * 2];
    const lb = body[off + i * 2 + 1];
    r.push(clamp((rb & 0x7f) * 127 / 119));
    if (kind === 'dcw') {
      if (lb & 0x80) susStage = i;
      l.push(clamp(((lb & 0x7f) - 8) * 127 / 119));
    } else {
      l.push(clamp(lb & 0x7f));
    }
  }
  return { l, r, sus: susValue(susStage >= 0 ? susStage : Math.min(7, endStep)), end: endValue(endStep) };
}

function encodeEnv(get, sec, kind) {
  const bytes = [];
  const susStage = (() => {
    const sv = get(`${sec}_sus`);
    for (let i = 0; i < 8; i++) if (sv <= SUS_VALUES[i]) return i;
    return 7;
  })();
  for (let i = 0; i < 8; i++) {
    const rate = get(`${sec}_r${i}`);
    const level = get(`${sec}_l${i}`);
    const prev = i ? get(`${sec}_l${i - 1}`) : 0;
    let rb = clamp(rate * 119 / 127) & 0x7f;
    if (level < prev) rb |= 0x80;                       // descending flag
    let lb;
    if (kind === 'dcw') { lb = (clamp(level * 119 / 127) + 8) & 0x7f; if (i === susStage) lb |= 0x80; }
    else lb = clamp(level) & 0x7f;
    bytes.push(rb, lb);
  }
  return bytes;
}

// Byte offsets within the 128-byte tone (see header).
const OFF = {
  PFLAG: 0, PDS: 1, PDTL: 2, PDTH: 3, PVK: 4,
  MFW: 14, MAM: 16, MWM: 18, PMAL: 20, PMA: 21, PMWL: 37, PMW: 38, PMPL: 54, PMP: 55,
  SFW: 71, SAM: 73, SWM: 75, PSAL: 77, PSA: 78, PSWL: 94, PSW: 95, PSPL: 111, PSP: 112
};

// ---- decode: raw SysEx -> structured patch {globals, lines:[l1,l2]} --------
export function decodeSysexToPatch(raw) {
  const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
  if (bytes[0] !== 0xf0 || bytes[1] !== CASIO_ID) return null;
  // find body: skip F0 44 00 00 (70+ch) <op> <program>, read nibbles until F7
  let i = 5;                       // after 70+ch
  const op = bytes[i++];
  let program = 0x60;
  if (op === OP_SEND || op === OP_REQUEST) program = bytes[i++];
  const end = bytes.indexOf(0xf7, i);
  const nibbles = [...bytes.slice(i, end < 0 ? bytes.length : end)];
  const body = fromNibbles(nibbles);
  if (body.length < 120) return null;

  const kf = (b) => indexToValue(PARAMS_BY_ID.dcw_kf, (b & 0x0f) > 0 ? 1 : 0);
  const kfRange = (b) => clamp((b & 0x0f) * 127 / 9);

  const e1a = decodeEnv(body, OFF.PMA, body[OFF.PMAL] & 0x07, 'amp');
  const e1w = decodeEnv(body, OFF.PMW, body[OFF.PMWL] & 0x07, 'dcw');
  const e1p = decodeEnv(body, OFF.PMP, body[OFF.PMPL] & 0x07, 'pitch');
  const e2a = decodeEnv(body, OFF.PSA, body[OFF.PSAL] & 0x07, 'amp');
  const e2w = decodeEnv(body, OFF.PSW, body[OFF.PSWL] & 0x07, 'dcw');
  const e2p = decodeEnv(body, OFF.PSP, body[OFF.PSPL] & 0x07, 'pitch');

  const envInto = (obj, sec, e) => {
    for (let s = 0; s < 8; s++) { obj[`${sec}_l${s}`] = e.l[s]; obj[`${sec}_r${s}`] = e.r[s]; }
    obj[`${sec}_sus`] = e.sus; obj[`${sec}_end`] = e.end;
  };

  const line1 = { wf1: waveToCC(body[OFF.MFW] & 0x07), dcw_kf: kf(body[OFF.MWM]), dcw_kf_rng: kfRange(body[OFF.MWM]), dca_kf: kf(body[OFF.MAM]), dca_kf_rng: kfRange(body[OFF.MAM]) };
  const line2 = { wf1: waveToCC(body[OFF.SFW] & 0x07), dcw_kf: kf(body[OFF.SWM]), dcw_kf_rng: kfRange(body[OFF.SWM]), dca_kf: kf(body[OFF.SAM]), dca_kf_rng: kfRange(body[OFF.SAM]) };
  line1.wf2 = line1.wf1; line2.wf2 = line2.wf1;
  envInto(line1, 'dcaEnv', e1a); envInto(line1, 'dcwEnv', e1w); envInto(line1, 'pitchEnv', e1p);
  envInto(line2, 'dcaEnv', e2a); envInto(line2, 'dcwEnv', e2w); envInto(line2, 'pitchEnv', e2p);

  const pflag = body[OFF.PFLAG];
  const globals = {
    detune_oct: indexToValue(PARAMS_BY_ID.detune_oct, (pflag >> 4) & 0x03),
    line_select: indexToValue(PARAMS_BY_ID.line_select, pflag & 0x03),
    detune_pol: indexToValue(PARAMS_BY_ID.detune_pol, body[OFF.PDS] ? 0 : 1),
    detune_fine: clamp((body[OFF.PDTL] & 0x7f) * 127 / 99)
  };

  return { name: 'Imported', globals, lines: [line1, line2], rawProgram: program, raw: bytes };
}

// ---- encode: structured patch -> raw SysEx --------------------------------
export function encodePatchToSysex({ globals, lines }, program = PROG_EDIT_BUFFER, channel = 0) {
  const body = new Array(128).fill(0);
  const g = (id) => globals[id] ?? (PARAMS_BY_ID[id] ? PARAMS_BY_ID[id].def : 0);
  const ln = (i, id) => lines[i]?.[id] ?? (PARAMS_BY_ID[id] ? PARAMS_BY_ID[id].def : 0);

  body[OFF.PFLAG] = ((zoneIdx('detune_oct', g('detune_oct')) & 0x03) << 4) | (zoneIdx('line_select', g('line_select')) & 0x03);
  body[OFF.PDS] = zoneIdx('detune_pol', g('detune_pol')) === 0 ? 1 : 0;
  body[OFF.PDTL] = clamp((g('detune_fine')) * 99 / 127) & 0x7f;
  body[OFF.PVK] = 0x08;
  body[OFF.MFW] = ccToWaveIdx(ln(0, 'wf1'));
  body[OFF.SFW] = ccToWaveIdx(ln(1, 'wf1'));
  body[OFF.MAM] = onOff(ln(0, 'dca_kf')) ? 9 : 0;
  body[OFF.MWM] = onOff(ln(0, 'dcw_kf')) ? 9 : 0;
  body[OFF.SAM] = onOff(ln(1, 'dca_kf')) ? 9 : 0;
  body[OFF.SWM] = onOff(ln(1, 'dcw_kf')) ? 9 : 0;

  const put = (off, lvlOff, sec, i, kind) => { const b = encodeEnv((id) => ln(i, id), sec, kind); for (let k = 0; k < 16; k++) body[off + k] = b[k]; body[lvlOff] = 7; };
  put(OFF.PMA, OFF.PMAL, 'dcaEnv', 0, 'amp'); put(OFF.PMW, OFF.PMWL, 'dcwEnv', 0, 'dcw'); put(OFF.PMP, OFF.PMPL, 'pitchEnv', 0, 'pitch');
  put(OFF.PSA, OFF.PSAL, 'dcaEnv', 1, 'amp'); put(OFF.PSW, OFF.PSWL, 'dcwEnv', 1, 'dcw'); put(OFF.PSP, OFF.PSPL, 'pitchEnv', 1, 'pitch');

  return Uint8Array.from([0xf0, CASIO_ID, 0x00, 0x00, 0x70 | (channel & 0x0f), OP_SEND, program & 0x7f, ...toNibbles(body), 0xf7]);
}

function zoneIdx(id, v) {
  const z = PARAMS_BY_ID[id].enum.zones;
  for (let i = 0; i < z.length; i++) if (v >= z[i][0] && v <= z[i][1]) return i;
  return 0;
}
const onOff = (v) => v >= 65;

export function requestTone(program = PROG_EDIT_BUFFER, channel = 0) {
  return Uint8Array.from([0xf0, CASIO_ID, 0x00, 0x00, 0x70 | (channel & 0x0f), OP_REQUEST, program & 0x7f, 0xf7]);
}

// Take an imported .syx and return just its FIRST tone message, re-addressed to
// the edit buffer — so importing makes a sound immediately without overwriting
// any stored memory slots (and without relying on our decode accuracy).
export function redirectToEditBuffer(raw) {
  const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
  const f7 = bytes.indexOf(0xf7);
  const msg = Uint8Array.from(bytes.slice(0, f7 < 0 ? bytes.length : f7 + 1));
  // Only forward a genuine Casio "send tone" dump. Refuse request/other ops so a
  // crafted .syx can't push arbitrary SysEx (e.g. a memory-bank write) to the
  // synth — we re-address to the edit buffer, never a stored slot.
  if (msg[0] !== 0xf0 || msg[1] !== CASIO_ID || msg[5] !== OP_SEND) return null;
  msg[6] = PROG_EDIT_BUFFER;
  return msg;
}

export function looksLikeCasioTone(bytes) {
  return bytes.length > 6 && bytes[0] === 0xf0 && bytes[1] === CASIO_ID;
}
export function hex(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' '); }
