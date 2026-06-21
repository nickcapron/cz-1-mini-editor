// Web MIDI wrapper tuned for the CZ-1 MINI.
import { BANK_SELECT_CC } from './params.js';

export class Midi {
  constructor() {
    this.access = null;
    this.output = null;
    this.input = null;
    this.channel = 0; // 0-15
    this.listeners = [];          // generic incoming-message subscribers
    this.portListeners = [];      // notified when port lists change
  }

  async init() {
    this.access = await navigator.requestMIDIAccess({ sysex: true });
    this.access.onstatechange = () => this._emitPorts();
    // Auto-pick the CZ-1 MINI if present.
    const out = this.outputs().find((p) => /cz-?1/i.test(p.name));
    const inp = this.inputs().find((p) => /cz-?1/i.test(p.name));
    if (out) this.setOutput(out.id);
    if (inp) this.setInput(inp.id);
    this._emitPorts();
    return this;
  }

  outputs() { return this.access ? [...this.access.outputs.values()] : []; }
  inputs() { return this.access ? [...this.access.inputs.values()] : []; }

  setOutput(id) { this.output = this.access.outputs.get(id) || null; this._emitPorts(); }
  setInput(id) {
    if (this.input) this.input.onmidimessage = null;
    this.input = this.access.inputs.get(id) || null;
    if (this.input) this.input.onmidimessage = (e) => this._onMessage(e);
    this._emitPorts();
  }
  setChannel(ch) { this.channel = Math.max(0, Math.min(15, ch | 0)); }

  onMessage(fn) { this.listeners.push(fn); }
  onPorts(fn) { this.portListeners.push(fn); }
  _emitPorts() { this.portListeners.forEach((fn) => fn(this)); }

  _onMessage(e) {
    const d = e.data;
    const status = d[0] & 0xf0;
    const channel = d[0] & 0x0f;
    let parsed = { raw: d, status: d[0], channel };
    if (status === 0xb0) parsed = { ...parsed, kind: 'cc', cc: d[1], value: d[2] };
    else if (status === 0x90 && d[2] > 0) parsed = { ...parsed, kind: 'noteon', note: d[1], value: d[2] };
    else if (status === 0xf0) parsed = { ...parsed, kind: 'sysex' };
    else parsed = { ...parsed, kind: 'other' };
    this.listeners.forEach((fn) => fn(parsed));
  }

  // --- sending ------------------------------------------------------------
  sendCC(cc, value) {
    if (!this.output) return false;
    const v = Math.max(0, Math.min(127, Math.round(value)));
    this.output.send([0xb0 | this.channel, cc & 0x7f, v]);
    return true;
  }

  // Send one parameter's value, honouring its line model:
  //   bank  -> Bank Select (CC0) for the active line, then the shared CC
  //   split -> the active line's dedicated CC (cc for line 1, cc2 for line 2)
  //   global-> just the CC
  // `line_select` additionally emits a Bank Select derived from its own value.
  sendParam(param, value, activeLine = 0) {
    if (!this.output) return false;
    if (param.line === 'bank') {
      this.sendCC(BANK_SELECT_CC, activeLine ? 1 : 0);
      this.sendCC(param.cc, value);
    } else if (param.line === 'split') {
      this.sendCC(activeLine && param.cc2 != null ? param.cc2 : param.cc, value);
    } else {
      this.sendCC(param.cc, value);
    }
    if (param.withBank) this.sendCC(BANK_SELECT_CC, value >= 43 && value <= 84 ? 1 : 0);
    return true;
  }

  sendSysex(bytes) {
    if (!this.output) return false;
    this.output.send(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
    return true;
  }

  programChange(program) {
    if (!this.output) return false;
    this.output.send([0xc0 | this.channel, program & 0x7f]);
    return true;
  }
}
