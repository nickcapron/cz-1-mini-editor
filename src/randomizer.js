// Patch generation. Seeded (mulberry32) so a good result can be reproduced
// by its seed. Uses light constraints so patches are playable, not pure noise.
import { PARAMS, defaultPatch, indexToValue } from './params.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SECTION_AMOUNT = { vibrato: 0.5, line: 0.4, filter: 0.8, chorus: 0.5, lfo: 0.6 };

export function randomPatch(seed = (Math.random() * 1e9) | 0, amount = 1) {
  const rnd = mulberry32(seed);
  const patch = defaultPatch();
  const r = (min, max) => min + Math.floor(rnd() * (max - min + 1));

  for (const p of PARAMS) {
    const sectionAmt = SECTION_AMOUNT[p.section] ?? 1;
    const a = amount * sectionAmt;
    if (rnd() > a && p.type !== 'enum') continue; // sometimes leave at default

    if (p.type === 'enum') {
      // Pick a clean value inside a random zone so it quantises predictably.
      patch[p.id] = indexToValue(p, r(0, p.enum.names.length - 1));
    } else if (p.lane === 'rate') {
      // Envelope rates: bias toward mid-fast so notes don't take forever.
      patch[p.id] = r(40, 110);
    } else if (p.lane === 'level') {
      // Build a falling-ish contour: earlier stages louder.
      const fall = Math.max(0, 1 - p.index * 0.12);
      patch[p.id] = Math.min(127, Math.round((0.4 + 0.6 * rnd()) * 127 * fall));
    } else {
      patch[p.id] = r(p.min, p.max);
    }
  }

  // Sensible touch-ups.
  patch.dcaEnv_l0 = 0;                 // amp envelope should start silent
  patch.flt_cutoff = r(70, 127);       // keep it audible
  patch.vib_depth = r(0, 40);          // subtle vibrato
  patch.seed = seed;
  return patch;
}
