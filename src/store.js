/* 保存と読み込み（SemiLab と同じ作法）
 *
 * 置き場所は localStorage。読めなかった保存データは黙って上書きしない ―
 * 壊れた中身を別のキーに退避してから空で始める。
 */
(function (global) {
  'use strict';
  var PL = global.PL || (global.PL = {});

  var KEY = 'ProcessLab.v1';
  var BACKUP = 'ProcessLab.broken';
  var KINDS = { depo: 1, mask: 1, etch: 1, strip: 1, imp: 1, heat: 1 };

  function blank() {
    return {
      recipe: PL.recipe.create({ type: 'p', N: 1e15 }),
      sel: -1,                     /* 見ている工程（-1 は最初のウェーハ） */
      cutX: 5,                     /* 縦に切る位置 [µm] */
      view: { depth: 2 },          /* 断面で見る深さ [µm] */
      cleared: {},
      quest: null
    };
  }

  function looksSane(s) {
    if (!s || typeof s !== 'object' || !s.recipe || typeof s.recipe !== 'object') return false;
    if (!Array.isArray(s.recipe.steps) || !s.recipe.sub) return false;
    for (var i = 0; i < s.recipe.steps.length; i++) {
      var st = s.recipe.steps[i];
      if (!st || !KINDS[st.t]) return false;
    }
    return true;
  }

  function pack(state) {
    return { v: 1, recipe: state.recipe, sel: state.sel, cutX: state.cutX, view: state.view, cleared: state.cleared || {}, quest: state.quest || null };
  }

  function merge(s) {
    var b = blank();
    return {
      recipe: s.recipe,
      sel: typeof s.sel === 'number' ? Math.min(s.sel, s.recipe.steps.length - 1) : b.sel,
      cutX: typeof s.cutX === 'number' ? s.cutX : b.cutX,
      view: s.view && typeof s.view === 'object' ? s.view : b.view,
      cleared: s.cleared || {},
      quest: s.quest || null
    };
  }

  function save(state) {
    try { global.localStorage.setItem(KEY, JSON.stringify(pack(state))); return true; } catch (e) { return false; }
  }

  function load() {
    var raw;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { return { state: blank(), fresh: true }; }
    if (!raw) return { state: blank(), fresh: true };
    var s = null;
    try { s = JSON.parse(raw); } catch (e) { s = null; }
    if (!looksSane(s)) {
      try { global.localStorage.setItem(BACKUP, raw); global.localStorage.removeItem(KEY); } catch (e) { /* 退避できなくても続ける */ }
      return { state: blank(), broken: true };
    }
    return { state: merge(s) };
  }

  function clear() { try { global.localStorage.removeItem(KEY); } catch (e) { /* 続ける */ } }
  function toJSON(state) { return JSON.stringify(pack(state), null, 2); }
  function fromJSON(text) {
    var s;
    try { s = JSON.parse(text); } catch (e) { return { error: 'JSON として読めませんでした' }; }
    if (!looksSane(s)) return { error: 'ProcessLab の保存ファイルではないようです' };
    return { state: merge(s) };
  }

  PL.store = { KEY: KEY, BACKUP: BACKUP, blank: blank, save: save, load: load, clear: clear, toJSON: toJSON, fromJSON: fromJSON, looksSane: looksSane };
})(typeof window !== 'undefined' ? window : globalThis);
