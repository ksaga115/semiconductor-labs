/* 保存と読み込み（他のラボと同じ作法: 壊れた保存は退避してから空で始める） */
(function (global) {
  'use strict';
  var OP = global.OP || (global.OP = {});

  var KEY = 'OptoLab.v1';
  var BACKUP = 'OptoLab.broken';

  function blank() {
    return { design: OP.opto.defaults(), cleared: {}, quest: null };
  }

  function looksSane(s) {
    return !!(s && typeof s === 'object' && s.design && typeof s.design === 'object'
      && typeof s.design.N === 'number');
  }

  function pack(st) { return { v: 1, design: st.design, cleared: st.cleared, quest: st.quest }; }

  function merge(s) {
    var b = blank(), k;
    for (k in b) if (s[k] !== undefined) b[k] = s[k];
    var d = OP.opto.defaults();
    for (k in d) if (typeof b.design[k] !== typeof d[k]) b.design[k] = d[k];
    return b;
  }

  function save(st) { try { global.localStorage.setItem(KEY, JSON.stringify(pack(st))); return true; } catch (e) { return false; } }

  function load() {
    var raw;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { return { state: blank(), fresh: true }; }
    if (!raw) return { state: blank(), fresh: true };
    var s = null;
    try { s = JSON.parse(raw); } catch (e) { s = null; }
    if (!looksSane(s)) {
      try { global.localStorage.setItem(BACKUP, raw); global.localStorage.removeItem(KEY); } catch (e) { /* 続ける */ }
      return { state: blank(), broken: true };
    }
    return { state: merge(s) };
  }

  function clear() { try { global.localStorage.removeItem(KEY); } catch (e) { /* 続ける */ } }

  OP.store = { KEY: KEY, BACKUP: BACKUP, blank: blank, save: save, load: load, clear: clear, looksSane: looksSane };
})(typeof window !== 'undefined' ? window : globalThis);
