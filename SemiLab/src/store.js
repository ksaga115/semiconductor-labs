/* 保存と読み込み
 *
 * 置き場所は localStorage。ブラウザだけで完結させたいので、ファイルは
 * 「書き出し・読み込み」ボタンのときだけ触る。
 *
 * 読めなかった保存データは、黙って既定値で上書きしない。壊れた中身を
 * 別のキーに退避してから空で始める（NandLab / CoinLab と同じ作法）。
 * 上書きしてしまうと、直せたかもしれない構造が永久に消える。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});

  var KEY = 'SemiLab.v1';
  var BACKUP = 'SemiLab.broken';
  var NMOS_KEY = 'SemiLab.nmos';   /* 第5章「NAND の中身へ」を通した nMOS。NandLab「電圧で見る」が読む */

  function blank() {
    return {
      stack: SL.stack.create(),
      T: SL.phys.T300,
      bias: { left: 0, right: 0 },
      light: { on: false, nm: 600, power: 1e-3, ar: null, sFront: 1e4 },
      lib: {},                 /* 名前を付けて残した構造 */
      cleared: {},
      quest: null,
      view: { field: 'E', zoom: 1 }
    };
  }

  function looksSane(s) {
    if (!s || typeof s !== 'object') return false;
    if (!s.stack || typeof s.stack !== 'object') return false;
    if (!Array.isArray(s.stack.layers)) return false;
    if (typeof s.stack.seq !== 'number') return false;
    for (var i = 0; i < s.stack.layers.length; i++) {
      var L = s.stack.layers[i];
      if (!L || (L.mat !== 'si' && L.mat !== 'ox')) return false;
      if (typeof L.tnm !== 'number' || !(L.tnm > 0)) return false;
    }
    if (s.lib && typeof s.lib !== 'object') return false;
    return true;
  }

  function pack(state) {
    return {
      v: 1,
      stack: state.stack,
      T: state.T,
      bias: state.bias,
      light: state.light,
      lib: state.lib || {},
      cleared: state.cleared || {},
      quest: state.quest || null,
      view: state.view || {}
    };
  }

  function merge(s) {
    var b = blank();
    return {
      stack: s.stack,
      T: typeof s.T === 'number' ? s.T : b.T,
      bias: s.bias && typeof s.bias === 'object' ? s.bias : b.bias,
      light: s.light && typeof s.light === 'object' ? s.light : b.light,
      lib: s.lib || {},
      cleared: s.cleared || {},
      quest: s.quest || null,
      view: s.view && typeof s.view === 'object' ? s.view : b.view
    };
  }

  function save(state) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(pack(state)));
      return true;
    } catch (e) {
      return false;                 /* 容量超過など。呼び出し側が知らせる */
    }
  }

  /** 戻り値 { state, broken, fresh } */
  function load() {
    var raw;
    try { raw = global.localStorage.getItem(KEY); }
    catch (e) { return { state: blank(), broken: false, fresh: true }; }
    if (!raw) return { state: blank(), broken: false, fresh: true };

    var s = null;
    try { s = JSON.parse(raw); } catch (e) { s = null; }
    if (!looksSane(s)) {
      try {
        global.localStorage.setItem(BACKUP, raw);
        global.localStorage.removeItem(KEY);
      } catch (e) { /* 退避できなくても続ける */ }
      return { state: blank(), broken: true };
    }
    return { state: merge(s), broken: false };
  }

  function clear() {
    try { global.localStorage.removeItem(KEY); } catch (e) { /* 消せなくても続ける */ }
  }

  /** 第5章の採点を通した nMOS を、NandLab へ渡す置き場に書く（最後に通したものが残る） */
  function saveNmos(mm) {
    if (!mm || typeof mm.vth !== 'number') return false;
    try {
      global.localStorage.setItem(NMOS_KEY, JSON.stringify({
        v: 1, vth: mm.vth, swingmV: mm.swing * 1000, toxNm: mm.tox * 1e7
      }));
      return true;
    } catch (e) { return false; }
  }

  function toJSON(state) { return JSON.stringify(pack(state), null, 2); }

  /** 戻り値 { state } または { error } */
  function fromJSON(text) {
    var s;
    try { s = JSON.parse(text); } catch (e) { return { error: 'JSON として読めませんでした' }; }
    if (!looksSane(s)) return { error: 'SemiLab の保存ファイルではないようです' };
    return { state: merge(s) };
  }

  SL.store = {
    KEY: KEY, BACKUP: BACKUP, NMOS_KEY: NMOS_KEY, blank: blank, save: save, load: load, clear: clear,
    saveNmos: saveNmos, toJSON: toJSON, fromJSON: fromJSON, looksSane: looksSane
  };
})(typeof window !== 'undefined' ? window : globalThis);
