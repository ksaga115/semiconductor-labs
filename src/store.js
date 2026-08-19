/* 保存と読み込み
 *
 * 置き場所は localStorage。ブラウザだけで完結させたいので、ファイルは
 * 「書き出し・読み込み」ボタンのときだけ触る。
 *
 * 読めなかった保存データは、黙って既定値で上書きしない。壊れた中身を
 * 別のキーに退避してから空で始める。上書きしてしまうと、直せたかもしれない
 * 回路が永久に消える。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});

  var KEY = 'NandLab.v1';
  var BACKUP = 'NandLab.broken';

  function blank() {
    return { circuit: NL.netlist.create(), lib: {}, cleared: {}, quest: null };
  }

  /** 形だけ見て、最低限そろっているかを確かめる */
  function looksSane(s) {
    if (!s || typeof s !== 'object') return false;
    if (!s.circuit || typeof s.circuit !== 'object') return false;
    if (!s.circuit.parts || typeof s.circuit.parts !== 'object') return false;
    if (!s.circuit.wires || typeof s.circuit.wires !== 'object') return false;
    if (typeof s.circuit.seq !== 'number') return false;
    if (s.lib && typeof s.lib !== 'object') return false;
    for (var k in (s.lib || {})) {
      var d = s.lib[k];
      if (!d || !d.circuit || !Array.isArray(d.inputs) || !Array.isArray(d.outputs)) return false;
    }
    return true;
  }

  function pack(state) {
    return {
      v: 1,
      circuit: state.circuit,
      lib: state.lib,
      cleared: state.cleared || {},
      quest: state.quest || null
    };
  }

  function save(state) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(pack(state)));
      return true;
    } catch (e) {
      return false;    /* 容量超過など。呼び出し側が知らせる */
    }
  }

  /** 戻り値 { state, broken }。broken が真なら前の保存を退避した */
  function load() {
    var raw;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { return { state: blank(), broken: false }; }
    if (!raw) return { state: blank(), broken: false };

    var s = null;
    try { s = JSON.parse(raw); } catch (e) { s = null; }
    if (!looksSane(s)) {
      try { global.localStorage.setItem(BACKUP, raw); global.localStorage.removeItem(KEY); } catch (e) { /* 退避できなくても続ける */ }
      return { state: blank(), broken: true };
    }
    return {
      state: { circuit: s.circuit, lib: s.lib || {}, cleared: s.cleared || {}, quest: s.quest || null },
      broken: false
    };
  }

  function clear() {
    try { global.localStorage.removeItem(KEY); } catch (e) { /* 消せなくても続ける */ }
  }

  function toJSON(state) { return JSON.stringify(pack(state), null, 2); }

  /** 戻り値 { state } または { error } */
  function fromJSON(text) {
    var s;
    try { s = JSON.parse(text); } catch (e) { return { error: 'JSON として読めませんでした' }; }
    if (!looksSane(s)) return { error: 'NandLab の保存ファイルではないようです' };
    return { state: { circuit: s.circuit, lib: s.lib || {}, cleared: s.cleared || {}, quest: s.quest || null } };
  }

  NL.store = { KEY: KEY, BACKUP: BACKUP, blank: blank, save: save, load: load, clear: clear, toJSON: toJSON, fromJSON: fromJSON, looksSane: looksSane };
})(typeof window !== 'undefined' ? window : globalThis);
