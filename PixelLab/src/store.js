/* 保存と読み込み（SemiLab と同じ作法: 壊れた保存は退避してから空で始める） */
(function (global) {
  'use strict';
  var PX = global.PX || (global.PX = {});

  var KEY = 'PixelLab.v1';
  var BACKUP = 'PixelLab.broken';

  function blank() {
    return {
      design: PX.pixel.defaults(),
      flux: 500,                    /* 設計したカメラに当てる光 [光子/µm²/s] */
      cam: 'design',                /* 'design' | 'A' | 'B' | 'C' */
      expMs: 10,
      light: true,
      showFit: false,
      points: { design: [], A: [], B: [], C: [] },
      answers: {},
      cleared: {},
      quest: null,
      seq: 1
    };
  }

  function looksSane(s) {
    return !!(s && typeof s === 'object' && s.design && typeof s.design === 'object'
      && typeof s.design.pitch === 'number' && s.points && typeof s.points === 'object');
  }

  function pack(st) {
    /* 測った点は保存しない（画像ごと振り直せば同じものが出る。保存が膨らむだけ） */
    return { v: 1, design: st.design, flux: st.flux, cam: st.cam, expMs: st.expMs, light: st.light,
             showFit: st.showFit, answers: st.answers, cleared: st.cleared, quest: st.quest, seq: st.seq };
  }

  function merge(s) {
    var b = blank(), k;
    for (k in b) if (s[k] !== undefined && k !== 'points') b[k] = s[k];
    var d = PX.pixel.defaults();
    for (k in d) if (typeof b.design[k] !== typeof d[k]) b.design[k] = d[k];   /* 項目が増えても壊れない */
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

  PX.store = { KEY: KEY, BACKUP: BACKUP, blank: blank, save: save, load: load, clear: clear, looksSane: looksSane };
})(typeof window !== 'undefined' ? window : globalThis);
