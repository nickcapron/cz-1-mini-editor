# CZ-1 MINI Patch Generator

A desktop **patch generator + live editor** for the [Behringer CZ-1 MINI](https://www.behringer.com/) — the hybrid recreation of Casio's CZ phase-distortion synth. Built with **Electron + Web MIDI**: edit any parameter and it streams to the synth in real time, generate random patches, audition an 87-patch starter library, and import/export Casio CZ `.syx` files.

![status](https://img.shields.io/badge/version-1.0.0-blue) ![license](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Full editor** — every CZ section (dual waveforms per line, line mode + detune, and the three 8-stage envelopes **PITCH / DCW / DCA**) plus the MINI's hybrid extras (**resonant filter, LFO, chorus, vibrato**). The whole UI is generated from a single source of truth in `src/params.js`.
- **Live MIDI map** — moving any control sends its CC instantly. Per-line params (envelopes, key-follow) auto-send **Bank Select (CC0)** first to target the line chosen in *Active line*; split params use each line's dedicated CC.
- **Simple ADSR + Advanced grid** — envelopes expose familiar Attack/Decay/Sustain/Release (and Brightness/Env-Amount for tone) macros that generate the underlying 8-stage data; the full stage grid stays editable in the Advanced view.
- **87-patch preset library** — grouped by category (Bass, Keys, Bell, Brass/Lead, Pad/Strings, Pluck/Perc, Effects). Bass includes quick punchy "jab" patches and sustained variants.
- **Randomize** — seeded and reproducible (the seed is shown and saved), lightly constrained so patches stay playable. The two lines get independent values.
- **Save / Load** — patches as `.cz1.json`.
- **Casio CZ `.syx` import/export** — import a vintage/community tone (it's re-addressed to the edit buffer so it sounds immediately and never overwrites a stored slot), or export the current patch as `.syx`.
- **Write to synth memory** — Casio-CZ-style SysEx tone dump to the **edit buffer** (hear now) or an **internal slot** (store).
- **MIDI Monitor + Learn** — wiggle a knob on the synth to see its CC; in Learn mode, click a control then move its knob to bind/correct the mapping (bindings persist). Request/Replay captures a real tone dump for reverse-engineering.

---

## Requirements

- **Node.js 18+** (and npm)
- A **Behringer CZ-1 MINI** connected over USB MIDI (the app auto-selects a port whose name matches `CZ-1 MINI`; you can also pick Out/In/Channel manually in the toolbar)
- Windows, macOS, or Linux (Electron is cross-platform)

The synth listens on **MIDI channel 1** by default.

---

## Run from source

```bash
npm install      # installs Electron (first run only)
npm start        # launch the app
```

For verbose Chromium/Electron logging:

```bash
npm run dev      # electron . --enable-logging
```

> On Windows you may see harmless `disk_cache` / `gpu_disk_cache` warnings on launch — they don't affect the app.

---

## Build a distributable

No packaging config is committed (keeps the repo lean), but you can produce a standalone app in one command with [`@electron/packager`](https://github.com/electron/packager) — no extra setup needed:

```bash
# current platform
npx @electron/packager . "CZ-1 MINI Patch Generator" --out=dist --overwrite

# example: explicit Windows x64 build
npx @electron/packager . "CZ-1 MINI Patch Generator" --platform=win32 --arch=x64 --out=dist --overwrite
```

The result lands in `dist/CZ-1 MINI Patch Generator-<platform>-<arch>/` — run the executable inside. For signed installers/auto-update, switch to [`electron-builder`](https://www.electron.build/).

---

## Using it

1. **Connect** the CZ-1 MINI over USB and launch the app. The toolbar status turns green when a device is selected; if it isn't auto-picked, choose it under **Out** (and **In** for monitoring), and set **Ch** to match the synth.
2. **Load a sound** — pick from the grouped **Preset** menu, hit **Randomize**, or **Init** for a blank patch. Loading a preset streams it to the synth automatically.
3. **Edit** — drag any knob or change any selector; the value is sent live. Use **Active line** (Line 1 / Line 2) to choose which layer per-line edits target.
4. **Shape envelopes** — use the ADSR macros for quick work, or open the Advanced grid to place all 8 stages, the sustain point, and the end point by hand.
5. **(Re)send** — **Send All** streams the entire patch (both lines) to the synth, e.g. after reconnecting.
6. **Save / share** — **Save…** / **Load…** for `.cz1.json`; **Import .syx** to bring in a Casio CZ tone; **Export .syx** to save the current patch in SysEx form.
7. **Write to the synth** — in *Write to synth (SysEx)*, target the **Edit buffer** (hear now) or an **Internal slot** (store), then **Write**. **Request** asks the synth to send its current tone; **Replay** re-sends the last captured dump.
8. **Fix a mapping** — open the **MIDI Monitor**, click **Learn**, click a control, then move its knob on the synth to bind the correct CC (saved for next time).

---

## MIDI map & calibration notes

- CCs **27–93** come from the official manual's CC table (pp. 57–59) and are trusted. Controls flagged with `verify: true` in `src/params.js` (mainly waveform selects and DCO key-follow) are **not yet hardware-confirmed** — use **MIDI Learn** to verify/correct; bindings persist.
- Two envelope-translation constants in `src/envelopes.js` were **calibrated by ear** against hardware and are documented inline so they're easy to revert:
  - `POINT_OFFSET` — aligns the sustain/end **point** to the hardware's stage indexing (without it, held notes freeze at the attack peak).
  - `RATE_INVERTED` — rate direction (higher = faster); flip if attack/release feel backwards on a future firmware.
- **SysEx** save/import follows the documented classic Casio CZ format. Encode/decode round-trips, but exact value scaling vs. the MINI's CC engine isn't fully hardware-verified — confirm a write with a MIDI capture before trusting it for stored slots.

---

## Security

This is a fully local, single-window app. The renderer runs **sandboxed** with `contextIsolation` on and `nodeIntegration` off; a strict Content-Security-Policy allows only local scripts; the main process grants **only** MIDI/SysEx permission and denies popups and navigation; and `.syx` import forwards only genuine tone-send dumps.

---

## License

[MIT](LICENSE)
