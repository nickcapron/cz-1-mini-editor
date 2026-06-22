// Draggable rotary knob, styled to read like a hardware control.
// Vertical drag changes value; Shift = fine; double-click = reset to default.
// Returns { el, set(v) }. onPick fires on a click that wasn't a drag (for MIDI Learn).

export function createKnob({ min = 0, max = 127, value = 0, def = null, label = '', sub = '', onChange, onPick }) {
  const wrap = document.createElement('div'); wrap.className = 'knobwrap';
  const lab = document.createElement('div'); lab.className = 'knob-label'; lab.textContent = label;
  const knob = document.createElement('div'); knob.className = 'knob';
  const ind = document.createElement('div'); ind.className = 'knob-ind'; knob.appendChild(ind);
  const read = document.createElement('div'); read.className = 'knob-read';
  wrap.append(lab, knob, read);
  if (sub) { const s = document.createElement('div'); s.className = 'knob-sub'; s.textContent = sub; wrap.appendChild(s); }

  let v = value;
  const angle = (val) => -135 + 270 * ((val - min) / (max - min || 1));
  const render = () => { ind.style.transform = `translateX(-50%) rotate(${angle(v)}deg)`; read.textContent = Math.round(v); };
  const setV = (nv, emit) => {
    const c = Math.max(min, Math.min(max, nv));
    if (c === v && !emit) { render(); return; }
    v = c; render(); if (emit && onChange) onChange(Math.round(v));
  };
  render();

  let dragging = false, moved = false, lastY = 0;
  const span = max - min || 1;
  knob.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false; lastY = e.clientY;
    knob.setPointerCapture(e.pointerId); knob.classList.add('active'); e.preventDefault();
  });
  knob.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = lastY - e.clientY; lastY = e.clientY;
    if (Math.abs(dy) > 0) moved = true;
    const sens = (e.shiftKey ? 0.25 : 1) * (span / 160); // full range over ~160px drag
    setV(v + dy * sens, true);
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; knob.classList.remove('active');
    try { knob.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!moved && onPick) onPick();
  };
  knob.addEventListener('pointerup', end);
  knob.addEventListener('pointercancel', end);
  knob.addEventListener('dblclick', () => { if (def != null) setV(def, true); });

  return { el: wrap, knob, set(nv) { setV(nv, false); } };
}
