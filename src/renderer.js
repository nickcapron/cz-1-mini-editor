import { PARAMS, PARAMS_BY_ID, SECTIONS, BANK_SELECT_CC, defaultPatch, isPerLine, valueToIndex, indexToValue } from './params.js';
import { Midi } from './midi.js';
import { randomPatch } from './randomizer.js';
import { buildToneDump, buildToneRequest, looksLikeCasioTone, hex } from './sysex.js';

const midi = new Midi();

// ---- Patch state ----------------------------------------------------------
// Globals live once; per-line params (bank + split) live twice — one per line.
// Every stored value is a raw 0-127 CC value (enums included).
let activeLine = 0;
let globals = {};
let lines = [{}, {}];
let currentSeed = null;
const controls = {};            // id -> { el, input, set(v) }
let lastCapture = null;

const getVal = (p) => (isPerLine(p) ? lines[activeLine][p.id] : globals[p.id]);
function setVal(p, v) { if (isPerLine(p)) lines[activeLine][p.id] = v; else globals[p.id] = v; }

function defaultsGlobals() { const o = {}; for (const p of PARAMS) if (!isPerLine(p)) o[p.id] = p.def; return o; }
function loadFlat(src) {
  for (const p of PARAMS) {
    const v = src[p.id] ?? p.def;
    if (isPerLine(p)) { lines[0][p.id] = v; lines[1][p.id] = v; } else globals[p.id] = v;
  }
}
function loadStructured(s) {
  globals = { ...defaultsGlobals(), ...(s.globals || {}) };
  lines = [{ ...s.lines?.[0] }, { ...s.lines?.[1] }];
  for (const p of PARAMS) if (isPerLine(p)) for (const ln of [0, 1]) if (lines[ln][p.id] == null) lines[ln][p.id] = p.def;
}
function structured() { return { name: document.getElementById('patchName').value, seed: currentSeed, globals, lines }; }

// ---- CC overrides (from MIDI Learn), persisted ----------------------------
const overrides = JSON.parse(localStorage.getItem('ccOverrides') || '{}');
for (const [id, cc] of Object.entries(overrides)) if (PARAMS_BY_ID[id]) { PARAMS_BY_ID[id].cc = cc; PARAMS_BY_ID[id].verify = false; }
function saveOverride(id, cc) { overrides[id] = cc; localStorage.setItem('ccOverrides', JSON.stringify(overrides)); }

// ---- Build UI -------------------------------------------------------------
const editor = document.getElementById('editor');
const ccBadge = (p) => `CC${p.cc}` + (p.cc2 != null ? `/${p.cc2}` : '') + (p.line === 'bank' ? ' (bank)' : p.line === 'split' ? ' (per-line)' : '');

function buildControlRow(p) {
  const row = document.createElement('div');
  row.className = 'ctl' + (p.verify ? ' verify' : '');
  row.dataset.id = p.id;
  row.title = ccBadge(p);

  const label = document.createElement('label');
  label.textContent = p.label;
  row.appendChild(label);

  let input, val = null;
  if (p.type === 'enum') {
    input = document.createElement('select');
    p.enum.names.forEach((name, i) => { const o = document.createElement('option'); o.value = i; o.textContent = name; input.appendChild(o); });
    input.addEventListener('change', () => onEdit(p, indexToValue(p, +input.value)));
  } else {
    input = document.createElement('input');
    input.type = 'range'; input.min = p.min; input.max = p.max;
    input.addEventListener('input', () => onEdit(p, +input.value));
    val = document.createElement('span'); val.className = 'val';
  }
  row.appendChild(input);
  row.appendChild(val || document.createElement('span'));

  row.addEventListener('click', () => selectForLearn(p, row));
  controls[p.id] = {
    el: row, input,
    set(v) { if (p.type === 'enum') input.value = valueToIndex(p, v); else { input.value = v; if (val) val.textContent = v; } }
  };
  return row;
}

function buildEnvelope(section, ps) {
  const card = document.createElement('div');
  card.className = 'card envelope';
  card.innerHTML = `<h2>${section.label}</h2>`;
  const levels = ps.filter((p) => p.lane === 'level').sort((a, b) => a.index - b.index);
  const rates = ps.filter((p) => p.lane === 'rate').sort((a, b) => a.index - b.index);
  const grid = document.createElement('div'); grid.className = 'envgrid';
  grid.appendChild(cell('hd', ''));
  for (let i = 0; i < 8; i++) grid.appendChild(cell('hd', i));
  grid.appendChild(cell('rhd', 'Level'));
  levels.forEach((p) => grid.appendChild(vSlider(p)));
  grid.appendChild(cell('rhd', 'Rate'));
  rates.forEach((p) => grid.appendChild(vSlider(p)));
  card.appendChild(grid);
  const pts = document.createElement('div'); pts.className = 'envpoints';
  ps.filter((p) => !p.lane).forEach((p) => pts.appendChild(buildControlRow(p)));
  card.appendChild(pts);
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

function buildUI() {
  editor.innerHTML = '';
  for (const section of SECTIONS) {
    const ps = PARAMS.filter((p) => p.section === section.id);
    if (!ps.length) continue;
    if (section.kind === 'envelope') { editor.appendChild(buildEnvelope(section, ps)); continue; }
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h2>${section.label}</h2>`;
    ps.forEach((p) => card.appendChild(buildControlRow(p)));
    editor.appendChild(card);
  }
}

// ---- Edit + send ----------------------------------------------------------
function onEdit(p, value) { setVal(p, value); midi.sendParam(p, value, activeLine); }

function refreshControls() {
  for (const p of PARAMS) controls[p.id]?.set(getVal(p));
  document.getElementById('seedLabel').textContent = currentSeed == null ? 'seed —' : `seed ${currentSeed}`;
}

function sendAll() {
  for (const line of [0, 1]) {            // bank params, per line
    midi.sendCC(BANK_SELECT_CC, line);
    for (const p of PARAMS) if (p.line === 'bank') midi.sendCC(p.cc, lines[line][p.id]);
  }
  for (const line of [0, 1]) {            // split params, dedicated CCs
    for (const p of PARAMS) if (p.line === 'split') midi.sendCC(line && p.cc2 != null ? p.cc2 : p.cc, lines[line][p.id]);
  }
  for (const p of PARAMS) if (p.line === 'global') {   // global params
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
  const outSel = document.getElementById('outSel');
  const inSel = document.getElementById('inSel');
  const fill = (sel, ports, current) => {
    sel.innerHTML = '';
    const none = document.createElement('option'); none.value = ''; none.textContent = '— none —'; sel.appendChild(none);
    ports.forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; if (current && p.id === current.id) o.selected = true; sel.appendChild(o); });
  };
  fill(outSel, midi.outputs(), midi.output);
  fill(inSel, midi.inputs(), midi.input);
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
      if (isPerLine(p)) { lines[0][p.id] = a[p.id]; lines[1][p.id] = b[p.id]; }
      else globals[p.id] = a[p.id];
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
