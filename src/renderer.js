import { PARAMS, PARAMS_BY_ID, SECTIONS, BANK_SELECT_CC, defaultPatch, isPerLine, valueToIndex, indexToValue } from './params.js';
import { ENVELOPES, ENV_BY_SECTION, adsrToStages, stagesToAdsr, randomMacro, susPointIndex, endPointStage } from './envelopes.js';
import { createKnob } from './knob.js';
import { Midi } from './midi.js';
import { randomPatch } from './randomizer.js';
import { buildToneDump, buildToneRequest, looksLikeCasioTone, hex } from './sysex.js';

const midi = new Midi();
const ENV_SECTIONS = new Set(ENVELOPES.map((e) => e.section));

// ---- Patch state ----------------------------------------------------------
let activeLine = 0;
let globals = {};
let lines = [{}, {}];
let macroState = [{}, {}];          // [line][section] -> { attack, decay, ... }
let envCustom = [{}, {}];           // [line][section] -> bool
let currentSeed = null;
const controls = {};                // CC param id -> { el, set(v) }
const macroControls = {};           // section -> { key -> set(v), badge: el }
const graphs = {};                  // section -> svg element (envelope graph)
let lastCapture = null;

const getVal = (p) => (isPerLine(p) ? lines[activeLine][p.id] : globals[p.id]);
function setVal(p, v) { if (isPerLine(p)) lines[activeLine][p.id] = v; else globals[p.id] = v; }

function defaultsGlobals() { const o = {}; for (const p of PARAMS) if (!isPerLine(p)) o[p.id] = p.def; return o; }
function loadFlat(src) {
  for (const p of PARAMS) {
    const v = src[p.id] ?? p.def;
    if (isPerLine(p)) { lines[0][p.id] = v; lines[1][p.id] = v; } else globals[p.id] = v;
  }
  deriveAllMacros();
}
function loadStructured(s) {
  globals = { ...defaultsGlobals(), ...(s.globals || {}) };
  lines = [{ ...s.lines?.[0] }, { ...s.lines?.[1] }];
  for (const p of PARAMS) if (isPerLine(p)) for (const ln of [0, 1]) if (lines[ln][p.id] == null) lines[ln][p.id] = p.def;
  deriveAllMacros();
}
function structured() { return { name: document.getElementById('patchName').value, seed: currentSeed, globals, lines }; }

// Recompute ADSR knob positions + custom flags from the stage values.
function deriveAllMacros() {
  for (const line of [0, 1]) {
    macroState[line] = {}; envCustom[line] = {};
    for (const env of ENVELOPES) {
      if (env.advancedOnly) continue;
      const { macro, custom } = stagesToAdsr(env, lines[line]);
      macroState[line][env.section] = macro;
      envCustom[line][env.section] = custom;
    }
  }
}

// ---- CC overrides (MIDI Learn), persisted ---------------------------------
const overrides = JSON.parse(localStorage.getItem('ccOverrides') || '{}');
for (const [id, cc] of Object.entries(overrides)) if (PARAMS_BY_ID[id]) { PARAMS_BY_ID[id].cc = cc; PARAMS_BY_ID[id].verify = false; }
function saveOverride(id, cc) { overrides[id] = cc; localStorage.setItem('ccOverrides', JSON.stringify(overrides)); }

// ---- Build UI -------------------------------------------------------------
const editor = document.getElementById('editor');
const ccBadge = (p) => `CC${p.cc}` + (p.cc2 != null ? `/${p.cc2}` : '') + (p.line === 'bank' ? ' (bank)' : p.line === 'split' ? ' (per-line)' : '');

function pointLabel(p, v) {
  if (p.id.endsWith('_sus')) return `pt ${susPointIndex(v)}`;
  if (p.id.endsWith('_end')) return `pt ${endPointStage(v)}`;
  return String(v);
}

function buildControl(p) { return p.type === 'enum' ? buildEnumRow(p) : buildKnobControl(p); }

function buildKnobControl(p) {
  const isPoint = p.id.endsWith('_sus') || p.id.endsWith('_end');
  const k = createKnob({
    min: p.min, max: p.max, value: p.def, def: p.def, label: p.label,
    onChange: (v) => onEdit(p, v),
    onPick: () => selectForLearn(p, k.el)
  });
  k.el.classList.add('kc');
  if (p.verify) k.el.classList.add('verify');
  k.el.dataset.id = p.id;
  k.el.title = ccBadge(p);
  controls[p.id] = {
    el: k.el,
    set(v) {
      k.set(v);
      if (isPoint) k.el.querySelector('.knob-read').textContent = pointLabel(p, v);
    }
  };
  return k.el;
}

function buildEnumRow(p) {
  const row = document.createElement('div');
  row.className = 'ctl' + (p.verify ? ' verify' : '');
  row.dataset.id = p.id;
  row.title = ccBadge(p);
  const label = document.createElement('label'); label.textContent = p.label;
  const input = document.createElement('select');
  p.enum.names.forEach((name, i) => { const o = document.createElement('option'); o.value = i; o.textContent = name; input.appendChild(o); });
  input.addEventListener('change', () => onEdit(p, indexToValue(p, +input.value)));
  row.append(label, input, document.createElement('span'));
  row.addEventListener('click', (e) => { if (e.target !== input) selectForLearn(p, row); });
  controls[p.id] = { el: row, set(v) { input.value = valueToIndex(p, v); } };
  return row;
}

function buildEnvelopeGrid(section, ps) {
  const wrap = document.createElement('div');
  const levels = ps.filter((p) => p.lane === 'level').sort((a, b) => a.index - b.index);
  const rates = ps.filter((p) => p.lane === 'rate').sort((a, b) => a.index - b.index);
  const grid = document.createElement('div'); grid.className = 'envgrid';
  grid.appendChild(cell('hd', ''));
  for (let i = 0; i < 8; i++) grid.appendChild(cell('hd', i));
  grid.appendChild(cell('rhd', 'Level'));
  levels.forEach((p) => grid.appendChild(vSlider(p)));
  grid.appendChild(cell('rhd', 'Rate'));
  rates.forEach((p) => grid.appendChild(vSlider(p)));
  wrap.appendChild(grid);
  const pts = document.createElement('div'); pts.className = 'envpoints knobs';
  ps.filter((p) => !p.lane).forEach((p) => pts.appendChild(buildControl(p)));
  wrap.appendChild(pts);
  return wrap;
}

function buildMacroKnob(env, def) {
  const k = createKnob({
    min: 0, max: 127, value: def.def, def: def.def, label: def.label,
    onChange: (v) => onMacroEdit(env, def.key, v)
  });
  k.el.classList.add('kc', 'macro');
  macroControls[env.section] = macroControls[env.section] || {};
  macroControls[env.section][def.key] = { set(v) { k.set(v); } };
  return k.el;
}

// Mini line-graph of the envelope contour, CZ-style.
function buildEnvGraph(section) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'envgraph');
  svg.setAttribute('viewBox', '0 0 100 40');
  svg.setAttribute('preserveAspectRatio', 'none');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('class', 'env-line');
  svg.appendChild(poly);
  graphs[section] = svg;
  return svg;
}

function updateGraph(section) {
  const svg = graphs[section]; if (!svg) return;
  const g = (k) => lines[activeLine][`${section}_${k}`] ?? 0;
  const endIdx = Math.min(7, endPointStage(g('end')));
  const pts = [[0, 0]]; let x = 0;
  for (let i = 0; i <= endIdx; i++) {
    x += 4 + (127 - g(`r${i}`)) / 127 * 30;
    pts.push([x, g(`l${i}`)]);
  }
  const maxX = x || 1;
  svg.querySelector('polyline').setAttribute('points',
    pts.map(([px, lv]) => `${(px / maxX * 100).toFixed(1)},${(39 - lv / 127 * 37).toFixed(1)}`).join(' '));
}

function buildEnvelopeCard(section) {
  const env = ENV_BY_SECTION[section.id];
  const ps = PARAMS.filter((p) => p.section === section.id);
  const card = document.createElement('div'); card.className = 'card envelope';
  const head = document.createElement('h2');
  head.textContent = section.label;
  const badge = document.createElement('span'); badge.className = 'custombadge'; badge.textContent = 'custom';
  head.appendChild(badge);
  card.appendChild(head);
  macroControls[section.id] = macroControls[section.id] || {};
  macroControls[section.id].badge = badge;

  card.appendChild(buildEnvGraph(section.id));

  if (env && !env.advancedOnly) {
    const macros = document.createElement('div'); macros.className = 'macros knobs';
    env.macros.forEach((d) => macros.appendChild(buildMacroKnob(env, d)));
    card.appendChild(macros);
  } else {
    const note = document.createElement('p'); note.className = 'hint';
    note.textContent = 'Pitch envelope — usually left flat. Open below only for pitch sweeps/blips.';
    card.appendChild(note);
  }

  const det = document.createElement('details'); det.className = 'adv';
  const sum = document.createElement('summary'); sum.textContent = 'Advanced stages (full 8-stage envelope)';
  det.appendChild(sum);
  det.appendChild(buildEnvelopeGrid(section, ps));
  card.appendChild(det);
  return card;
}

function cell(cls, txt) { const d = document.createElement('div'); d.className = cls; d.textContent = txt; return d; }
function vSlider(p) {
  const wrap = document.createElement('div'); wrap.className = 'vslider';
  const input = document.createElement('input');
  input.type = 'range'; input.min = p.min; input.max = p.max; input.title = `${p.label} (${ccBadge(p)})`;
  const v = document.createElement('span'); v.className = 'v';
  input.addEventListener('input', () => { onEdit(p, +input.value); v.textContent = input.value; });
  wrap.appendChild(input); wrap.appendChild(v);
  wrap.addEventListener('click', () => selectForLearn(p, wrap));
  controls[p.id] = { el: wrap, input, set(val) { input.value = val; v.textContent = val; } };
  return wrap;
}

function legend() {
  const d = document.createElement('div'); d.className = 'card legend';
  d.innerHTML = `<h2>Subtractive map</h2><p class="hint">
    <b>Amp</b> = volume ADSR (DCA) &nbsp;·&nbsp; <b>Tone</b> = brightness envelope (DCW, phase-distortion's "filter") &nbsp;·&nbsp;
    <b>Filter</b> = real resonant filter &nbsp;·&nbsp; each envelope's <b>Advanced stages</b> reveal the full CZ 8-stage editor.</p>`;
  return d;
}

function buildUI() {
  editor.innerHTML = '';
  editor.appendChild(legend());
  for (const section of SECTIONS) {
    const ps = PARAMS.filter((p) => p.section === section.id);
    if (!ps.length) continue;
    if (section.kind === 'envelope') { editor.appendChild(buildEnvelopeCard(section)); continue; }
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h2>${section.label}</h2>`;
    const knobBox = document.createElement('div'); knobBox.className = 'knobs';
    const rows = document.createElement('div'); rows.className = 'rows';
    ps.forEach((p) => (p.type === 'enum' ? rows : knobBox).appendChild(buildControl(p)));
    if (rows.childElementCount) card.appendChild(rows);
    if (knobBox.childElementCount) card.appendChild(knobBox);
    editor.appendChild(card);
  }
}

// ---- Edit + send ----------------------------------------------------------
function onEdit(p, value) {
  setVal(p, value);
  midi.sendParam(p, value, activeLine);
  // A direct edit of an envelope stage may break the simple ADSR shape.
  if (ENV_SECTIONS.has(p.section)) {
    const env = ENV_BY_SECTION[p.section];
    if (env && !env.advancedOnly) refreshMacros(p.section);
    updateGraph(p.section);
  }
}

// Send every stage CC of one envelope for a line (bank-select once).
function sendEnvStages(section, line) {
  midi.sendCC(BANK_SELECT_CC, line);
  for (const p of PARAMS) if (p.section === section && p.line === 'bank') midi.sendCC(p.cc, lines[line][p.id]);
}

function onMacroEdit(env, key, value) {
  const m = macroState[activeLine][env.section];
  m[key] = value;
  const stages = adsrToStages(env, m);
  for (const [pid, v] of Object.entries(stages)) { lines[activeLine][pid] = v; controls[pid]?.set(v); }
  sendEnvStages(env.section, activeLine);
  envCustom[activeLine][env.section] = false;
  updateBadge(env.section);
  updateGraph(env.section);
}

function updateBadge(section) {
  const mc = macroControls[section];
  if (mc?.badge) mc.badge.style.display = envCustom[activeLine]?.[section] ? 'inline' : 'none';
}

function refreshMacros(section) {
  const env = ENV_BY_SECTION[section];
  if (!env || env.advancedOnly) return;
  const { macro, custom } = stagesToAdsr(env, lines[activeLine]);
  macroState[activeLine][section] = macro;
  envCustom[activeLine][section] = custom;
  const mc = macroControls[section] || {};
  for (const [k, v] of Object.entries(macro)) mc[k]?.set(v);
  updateBadge(section);
}

function refreshControls() {
  for (const p of PARAMS) controls[p.id]?.set(getVal(p));
  for (const env of ENVELOPES) if (!env.advancedOnly) refreshMacros(env.section);
  for (const env of ENVELOPES) updateGraph(env.section);
  document.getElementById('seedLabel').textContent = currentSeed == null ? 'seed —' : `seed ${currentSeed}`;
}

function sendAll() {
  for (const line of [0, 1]) {
    midi.sendCC(BANK_SELECT_CC, line);
    for (const p of PARAMS) if (p.line === 'bank') midi.sendCC(p.cc, lines[line][p.id]);
  }
  for (const line of [0, 1]) for (const p of PARAMS) if (p.line === 'split') midi.sendCC(line && p.cc2 != null ? p.cc2 : p.cc, lines[line][p.id]);
  for (const p of PARAMS) if (p.line === 'global') {
    midi.sendCC(p.cc, globals[p.id]);
    if (p.withBank) midi.sendCC(BANK_SELECT_CC, globals[p.id] >= 43 && globals[p.id] <= 84 ? 1 : 0);
  }
}

// ---- MIDI Learn -----------------------------------------------------------
let learning = false, learnTarget = null;
function selectForLearn(p, el) {
  if (!learning) return;
  document.querySelectorAll('.learnsel').forEach((e) => e.classList.remove('learnsel'));
  learnTarget = p; el.classList.add('learnsel');
  document.getElementById('learnHint').textContent = `Now move "${p.label}" on the synth to bind it.`;
}
function bindLearned(cc) {
  if (!learnTarget) return;
  learnTarget.cc = cc; learnTarget.verify = false;
  saveOverride(learnTarget.id, cc);
  const c = controls[learnTarget.id];
  c.el.classList.add('bound'); c.el.classList.remove('learnsel', 'verify');
  document.getElementById('learnHint').textContent = `Bound "${learnTarget.label}" → CC${cc}.`;
  learnTarget = null;
}

// ---- Monitor --------------------------------------------------------------
const monitor = document.getElementById('monitor');
function logMsg(m) {
  const div = document.createElement('div');
  if (m.kind === 'cc') { div.className = 'm'; div.innerHTML = `ch${m.channel + 1} <b>CC${m.cc}</b> = ${m.value}`; }
  else if (m.kind === 'sysex') { div.className = 'm sx'; div.innerHTML = `<b>SysEx</b> ${m.raw.length} bytes`; }
  else if (m.kind === 'noteon') { div.className = 'm'; div.innerHTML = `ch${m.channel + 1} note ${m.note} v${m.value}`; }
  else return;
  monitor.prepend(div);
  while (monitor.childElementCount > 40) monitor.lastChild.remove();
}

// ---- IO wiring ------------------------------------------------------------
function fillPorts() {
  const fill = (sel, ports, current) => {
    sel.innerHTML = '';
    const none = document.createElement('option'); none.value = ''; none.textContent = '— none —'; sel.appendChild(none);
    ports.forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; if (current && p.id === current.id) o.selected = true; sel.appendChild(o); });
  };
  fill(document.getElementById('outSel'), midi.outputs(), midi.output);
  fill(document.getElementById('inSel'), midi.inputs(), midi.input);
  const on = !!midi.output;
  const st = document.getElementById('status');
  st.textContent = on ? midi.output.name : 'no device';
  st.className = 'status ' + (on ? 'on' : 'off');
}

function wireToolbar() {
  document.getElementById('outSel').addEventListener('change', (e) => midi.setOutput(e.target.value));
  document.getElementById('inSel').addEventListener('change', (e) => midi.setInput(e.target.value));
  const chSel = document.getElementById('chSel');
  for (let i = 0; i < 16; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i + 1; chSel.appendChild(o); }
  chSel.addEventListener('change', (e) => midi.setChannel(+e.target.value));

  document.getElementById('lineSel').addEventListener('change', (e) => { activeLine = +e.target.value; refreshControls(); });

  document.getElementById('btnRandom').addEventListener('click', () => {
    const seed = (Math.random() * 1e9) | 0;
    const a = randomPatch(seed), b = randomPatch(seed ^ 0x9e3779b9);
    for (const p of PARAMS) {
      if (ENV_SECTIONS.has(p.section)) continue; // envelopes handled via macros below
      if (isPerLine(p)) { lines[0][p.id] = a[p.id]; lines[1][p.id] = b[p.id]; } else globals[p.id] = a[p.id];
    }
    for (const env of ENVELOPES) for (const line of [0, 1]) {
      if (env.advancedOnly) continue;
      const m = randomMacro(env);
      macroState[line][env.section] = m;
      Object.assign(lines[line], adsrToStages(env, m));
      envCustom[line][env.section] = false;
    }
    currentSeed = seed; refreshControls(); sendAll();
  });
  document.getElementById('btnSendAll').addEventListener('click', sendAll);
  document.getElementById('btnInit').addEventListener('click', () => { loadFlat(defaultPatch()); currentSeed = null; refreshControls(); sendAll(); });

  document.getElementById('btnSave').addEventListener('click', async () => {
    const name = document.getElementById('patchName').value || 'patch';
    const res = await window.cz1.savePatch(`${name}.cz1.json`, JSON.stringify(structured(), null, 2));
    if (res.ok) flash('Saved');
  });
  document.getElementById('btnLoad').addEventListener('click', async () => {
    const res = await window.cz1.loadPatch();
    if (!res.ok) return;
    const s = JSON.parse(res.json);
    loadStructured(s); currentSeed = s.seed ?? null;
    document.getElementById('patchName').value = s.name || 'Loaded';
    refreshControls(); sendAll(); flash('Loaded');
  });

  document.getElementById('btnWrite').addEventListener('click', () => {
    const slot = (+document.getElementById('memSlot').value || 1) - 1;
    midi.sendSysex(buildToneDump({ ...globals, ...lines[activeLine] }, slot));
    flash(`Sent write→slot ${slot + 1} (experimental)`);
  });
  document.getElementById('btnRequest').addEventListener('click', () => { midi.sendSysex(buildToneRequest()); flash('Requested tone dump'); });
  document.getElementById('btnReplay').addEventListener('click', () => { if (lastCapture) { midi.sendSysex(lastCapture); flash('Replayed capture'); } });

  document.getElementById('btnLearn').addEventListener('click', () => {
    learning = !learning;
    document.body.classList.toggle('learning', learning);
    document.getElementById('learnHint').textContent = learning
      ? 'Learn ON — click a control, then move its knob on the synth.'
      : 'Move a knob on the CZ-1 MINI to see its CC.';
    if (!learning) { learnTarget = null; document.querySelectorAll('.learnsel').forEach((e) => e.classList.remove('learnsel')); }
  });
}

let flashTimer = null;
function flash(text) {
  const st = document.getElementById('status');
  const prev = st.textContent, prevCls = st.className;
  st.textContent = text; st.className = 'status on';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { st.textContent = prev; st.className = prevCls; }, 1600);
}

// ---- Init -----------------------------------------------------------------
async function start() {
  buildUI();
  loadFlat(defaultPatch());
  refreshControls();
  wireToolbar();

  midi.onPorts(fillPorts);
  midi.onMessage((m) => {
    logMsg(m);
    if (m.kind === 'cc' && learning) bindLearned(m.cc);
    if (m.kind === 'sysex' && looksLikeCasioTone(m.raw)) {
      lastCapture = m.raw; document.getElementById('btnReplay').disabled = false;
      flash(`Captured ${m.raw.length}-byte dump`);
      console.log('Captured SysEx:', hex(m.raw));
    }
  });

  try { await midi.init(); }
  catch (err) { document.getElementById('status').textContent = 'MIDI blocked'; console.error('Web MIDI init failed:', err); }
  fillPorts();
}

start();
