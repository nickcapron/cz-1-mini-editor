# CZ-1 MINI Patch Generator

A desktop patch generator + live editor for the **Behringer CZ-1 MINI**, built with Electron + Web MIDI.

## Run

```
npm install
npm start
```

## Features

- **Full editor** — every CZ section (waveforms, detune, the 3 eight-stage envelopes PITCH/DCW/DCA) plus the MINI's hybrid extras (filter, LFO, chorus), generated from `src/params.js`.
- **Live map** — moving any control sends its MIDI CC instantly. Shared per-line params (envelopes, keyfollow) auto-send **Bank Select (CC0)** first to target the line chosen in *Active line*.
- **Randomize** — seeded, reproducible, lightly constrained so patches stay playable. The two layers get independent random values.
- **Save / Load** — patches as `.cz1.json`.
- **Write to synth memory** — Casio-CZ-style SysEx tone dump to a slot. *Experimental until confirmed on hardware.*
- **MIDI Monitor + Learn** — wiggle a knob on the synth to see its CC; in Learn mode, click a control then move its knob to bind/correct the mapping. **SysEx capture/replay** grabs a real tone dump for reverse-engineering the exact format.

## Status of the MIDI map

CCs 27–93 are taken from the official manual's CC table (pp. 57–59) and are trusted. Controls marked with a **`?`** (and `verify: true` in `src/params.js`) — mainly waveform selects, DCO keyfollow, and the SysEx write header — are **not yet hardware-confirmed**; use MIDI Learn / SysEx capture to verify and the values persist.
