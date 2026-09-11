/* ブラウザのごく薄い代わり
 *
 * ui.js を Node で走らせて「落ちないこと」を確かめるためだけのもの。
 * 見た目は再現しない。canvas の描画命令は全部受け流す。
 * 目で見る確認は tests/preview.js が書き出す HTML でやる。
 */
'use strict';

function makeClassList(el) {
  const set = new Set();
  return {
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    contains: c => set.has(c),
    toggle: (c, on) => { const v = on === undefined ? !set.has(c) : !!on; v ? set.add(c) : set.delete(c); return v; },
    _set: set,
    get length() { return set.size; }
  };
}

function makeEl(doc, tag, id) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: id || '',
    children: [],
    dataset: {},
    style: {},
    value: '',
    textContent: '',
    _html: '',
    _listeners: {},
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this.children = []; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    querySelector(sel) { return doc._stub(sel); },
    querySelectorAll(sel) { return doc.querySelectorAll(sel); },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 }; },
    focus() {}, select() {}, blur() {},
    /* 同じ文脈を返し続ける。呼ぶたびに新しく作ると、ui.js が握っている文脈と
     * 検査が見る文脈が別物になり、描画命令の数を数えられない */
    getContext() { return this._ctx || (this._ctx = makeCtx()); },
    width: 900, height: 600
  };
  el.classList = makeClassList(el);
  /* className への代入と classList を同じものにしておく。
   * 別々にすると querySelectorAll('.pitem') が空振りして、検査が素通りする */
  Object.defineProperty(el, 'className', {
    get() { return [...el.classList._set].join(' '); },
    set(v) {
      el.classList._set.clear();
      String(v).split(/\s+/).filter(Boolean).forEach(c => el.classList._set.add(c));
    }
  });
  return el;
}

/* canvas の 2D 文脈。呼ばれた命令の数だけ数えておく（何も描いていない事故に気づけるように） */
function makeCtx() {
  const calls = { n: 0 };
  const noop = () => { calls.n++; };
  const ctx = {
    _calls: calls,
    save: noop, restore: noop, translate: noop, scale: noop, setTransform: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    rect: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fill: noop, stroke: noop, fillText: noop, strokeText: noop, setLineDash: noop,
    measureText: () => ({ width: 20 })
  };
  ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'lineJoin', 'lineCap', 'globalAlpha']
    .forEach(k => { ctx[k] = ''; });
  return ctx;
}

function install(global) {
  const byId = new Map();
  const created = [];

  const doc = {
    readyState: 'complete',
    _stub(sel) {
      const key = 'sel:' + sel;
      if (!byId.has(key)) byId.set(key, makeEl(doc, 'span', key));
      return byId.get(key);
    },
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeEl(doc, id === 'mIn' ? 'input' : 'div', id));
      return byId.get(id);
    },
    createElement(tag) { const e = makeEl(doc, tag); created.push(e); return e; },
    querySelectorAll(sel) {
      const cls = sel.replace(/^\./, '');
      return created.filter(e => e.classList.contains(cls));
    },
    addEventListener(t, fn) { (doc._listeners[t] = doc._listeners[t] || []).push(fn); },
    _listeners: {}
  };

  const store = new Map();
  const listeners = {};
  const frames = [];

  Object.assign(global, {
    document: doc,
    devicePixelRatio: 1,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      _dump: () => Object.fromEntries(store)
    },
    location: { search: '' },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() {},
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    setTimeout: (fn) => { return { fn: fn }; },      /* 自動保存を勝手に走らせない */
    clearTimeout: () => {},
    alert: (m) => { global._alerts.push(m); },
    URLSearchParams: global.URLSearchParams || URLSearchParams,
    _alerts: []
  });
  global.window = global;

  return {
    doc, byId, created, listeners, frames,
    storage: store,
    /** rAF に積まれた最新のコールバックを1回だけ呼ぶ（＝1フレーム進める） */
    frame() {
      const fn = frames.pop();
      frames.length = 0;
      if (fn) fn();
    },
    fire(target, type, ev) {
      const list = (target === global ? listeners : target._listeners)[type] || [];
      const e = Object.assign({
        button: 0, clientX: 0, clientY: 0, shiftKey: false, ctrlKey: false, metaKey: false,
        key: '', deltaX: 0, deltaY: 0, target: { tagName: 'CANVAS' },
        preventDefault() {}, stopPropagation() {}
      }, ev);
      list.forEach(fn => fn(e));
      return e;
    }
  };
}

module.exports = { install, makeEl, makeCtx };
