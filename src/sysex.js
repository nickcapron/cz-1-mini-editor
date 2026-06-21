// ---------------------------------------------------------------------------
// Casio-CZ-compatible SysEx for "write to synth memory".
//
// HONEST STATUS: the CZ-1 MINI advertises SysEx compatibility with original
// Casio CZ patches, and the classic CZ tone-dump body layout below is the
// well-documented one used by every CZ librarian. BUT the exact request/write
// header bytes for *this* unit have not been confirmed on hardware yet, so the
// safe workflow is:
//     1. "Request from synth" (or save a tone on the synth so it dumps) and let
//        the app CAPTURE the real bytes -> we then know the exact framing.
//     2. Compare against buildToneDump() and adjust the HEADER constants.
// Until confirmed, treat writeToMemory() as experimental and prefer capture/replay.
//
// References: classic Casio CZ-101/1000/1 SysEx tone format.
// ---------------------------------------------------------------------------

import { PARAMS_BY_ID } from './params.js';

export const CASIO_ID = 0x44;          // Casio manufacturer ID (confirmed, stable)
// --- Header bytes below are UNVERIFIED for the CZ-1 MINI; confirm via capture.
const HDR_PREFIX = [0xf0, CASIO_ID, 0x00, 0x00];
const ONE_WAY_SEND = 0x70;             // "one-way send" group (classic CZ)
const SUBTYPE_WRITE = 0x20;            // write/store to memory (VERIFY)
const SUBTYPE_REQUEST = 0x30;          // request current tone (VERIFY)

// Nibble-encode a byte array the CZ way: low nibble then high nibble.
function toNibbles(bytes) {
  const out = [];
  for (const b of bytes) { out.push(b & 0x0f, (b >> 4) & 0x0f); }
  return out;
}
export function fromNibbles(nibbles) {
  const out = [];
  for (let i = 0; i + 1 < nibbles.length; i += 2) out.push((nibbles[i] & 0x0f) | ((nibbles[i + 1] & 0x0f) << 4));
  return out;
}

// Build the 128-byte classic CZ tone body from our patch object.
// This maps the parameters we model onto the documented byte positions. Bytes
// we don't model yet are left at 0. Good enough to round-trip the params we edit;
// confirm exact offsets by diffing against a captured dump.
export function buildToneBody(patch) {
  const body = new Array(128).fill(0);
  const g = (id) => (PARAMS_BY_ID[id] ? patch[id] ?? PARAMS_BY_ID[id].def : 0);

  // Global header region (classic CZ offsets 0..7-ish).
  body[0] = g('line_select') & 0x0f;
  body[1] = ((g('detune_pol') & 1) << 6) | (g('detune_oct') & 0x07);
  body[2] = g('detune_note') & 0x7f;
  body[3] = g('detune_fine') & 0x7f;
  body[4] = g('vib_wave') & 0x0f;
  body[5] = g('vib_rate') & 0x7f;
  body[6] = g('vib_depth') & 0x7f;
  body[7] = g('vib_delay') & 0x7f;

  // Per-line envelope/waveform data starts here in the classic layout.
  // We pack the three 8-stage envelopes for line 1 as level/rate pairs.
  let p = 8;
  for (const env of ['pitchEnv', 'dcwEnv', 'dcaEnv']) {
    body[p++] = g(`${env}_sus`) & 0x07;
    body[p++] = g(`${env}_end`) & 0x07;
    for (let i = 0; i < 8; i++) body[p++] = g(`${env}_r${i}`) & 0x7f;
    for (let i = 0; i < 8; i++) body[p++] = g(`${env}_l${i}`) & 0x7f;
  }
  body[p++] = g('wf1') & 0x7f;
  body[p++] = g('wf2') & 0x7f;
  return body;
}

// Full SysEx message to store a tone into memory slot `mem` (0-based).
export function buildToneDump(patch, mem = 0) {
  const body = buildToneBody(patch);
  return Uint8Array.from([...HDR_PREFIX, ONE_WAY_SEND, SUBTYPE_WRITE, mem & 0x7f, ...toNibbles(body), 0xf7]);
}

// Ask the synth to transmit its current tone so we can capture the real format.
export function buildToneRequest() {
  return Uint8Array.from([...HDR_PREFIX, ONE_WAY_SEND, SUBTYPE_REQUEST, 0x00, 0xf7]);
}

export function looksLikeCasioTone(bytes) {
  return bytes.length > 6 && bytes[0] === 0xf0 && bytes[1] === CASIO_ID;
}

export function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}
