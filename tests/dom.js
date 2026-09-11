/* ごく小さな DOM の模型（SemiLab と ProcessLab で共用。ProcessLab は require でこれを読む）
 *
 * 足したもの:
 *   ・[data-add] のような属性セレクタ（ui.js が工程のボタンを探すのに使う）
 *   ・canvas の createImageData / putImageData / drawImage（断面の絵を画素で作るので）
 *   ・window.open（SemiLab へ渡すときに開く URL を覚えておく）
 *
 * SemiLab で踏んだ3つは最初から直してある:
 *   getContext は毎回同じものを返す／.a.b の複合セレクタ／innerHTML の直下のテキストを捨てない
 */
'use strict';

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

function parseHTML(src, make) {
  const root = make('#frag');
  const stack = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { addText(stack[stack.length - 1], src.slice(i)); break; }
    if (lt > i) addText(stack[stack.length - 1], src.slice(i, lt));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt); i = e < 0 ? src.length : e + 3; continue; }
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    let tag = src.slice(lt + 1, gt).trim();
    i = gt + 1;
    if (tag.startsWith('/')) { if (stack.length > 1) stack.pop(); continue; }
    const selfClose = tag.endsWith('/');
    if (selfClose) tag = tag.slice(0, -1).trim();
    const sp = tag.search(/\s/);
    const name = (sp < 0 ? tag : tag.slice(0, sp)).toLowerCase();
    const el = make(name);
    if (sp > 0) {
      const re = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g;
      let m;
      while ((m = re.exec(tag.slice(sp)))) el.setAttribute(m[1] || m[3], m[2] !== undefined ? m[2] : m[4]);
    }
    stack[stack.length - 1].appendChild(el);
    if (!selfClose && !VOID.has(name)) stack.push(el);
  }
  return root.children.slice();
}

function addText(parent, t) {
  if (!t) return;
  if (parent._onText) { parent._onText(t); return; }
  parent._text = (parent._text || '') + t;
}

class El {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this._doc = doc; this.children = []; this.parentNode = null;
    this.attrs = {}; this.dataset = {}; this.style = {}; this._text = ''; this._listeners = {};
    this.className = ''; this.value = ''; this.checked = false; this.placeholder = '';
    this.width = 300; this.height = 150;
    this.classList = {
      add: (c) => { if (!this._cls().includes(c)) this.className = (this.className + ' ' + c).trim(); },
      remove: (c) => { this.className = this._cls().filter((x) => x !== c).join(' '); },
      toggle: (c, on) => { if (on === undefined) on = !this._cls().includes(c); on ? this.classList.add(c) : this.classList.remove(c); },
      contains: (c) => this._cls().includes(c)
    };
  }
  _cls() { return this.className ? this.className.split(/\s+/) : []; }
  setAttribute(k, v) {
    this.attrs[k] = v;
    if (k === 'id') this.id = v;
    else if (k === 'class') this.className = v;
    else if (k === 'value') this.value = v;
    else if (k === 'type') this.type = v;
    else if (k === 'name') this.name = v;
    else if (k === 'checked') this.checked = true;
    else if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    if (this.id) this._doc._index(this);
  }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { c.parentNode = this; this.children.push(c); this._doc._index(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  addEventListener(t, fn) { (this._listeners[t] || (this._listeners[t] = [])).push(fn); }
  removeEventListener(t, fn) { const a = this._listeners[t]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  fire(t, ev) {
    ev = Object.assign({ target: this, stopPropagation() {}, preventDefault() {} }, ev || {});
    const direct = this['on' + t];
    if (typeof direct === 'function') direct.call(this, ev);
    (this._listeners[t] || []).forEach((fn) => fn.call(this, ev));
    return ev;
  }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) {
    this._html = String(v);
    this.children.forEach((c) => { c.parentNode = null; });
    this.children = []; this._text = '';
    if (this._html) {
      let rootText = '';
      const kids = parseHTML(this._html, (t) => {
        const e = this._doc.createElement(t);
        if (t === '#frag') e._onText = (s) => { rootText += s; };
        return e;
      });
      kids.forEach((c) => this.appendChild(c));
      this._text = rootText;
    }
    /* select の中の option から、最初の値を選んでおく（ブラウザと同じ） */
    if (this.tagName === 'SELECT') { const o = this.children.find((c) => c.tagName === 'OPTION'); if (o) this.value = o.attrs.value; }
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = []; this._html = ''; this._text = String(v); }
  select() {} focus() {} blur() {}
  all() { const out = []; const walk = (e) => e.children.forEach((c) => { out.push(c); walk(c); }); walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    let scope = [this];
    for (const p of sel.trim().split(/\s+/)) {
      const next = [];
      scope.forEach((s) => s.all().forEach((e) => { if (matches(e, p) && !next.includes(e)) next.push(e); }));
      scope = next;
    }
    return scope;
  }
  getBoundingClientRect() { return { width: 900, height: 700, left: 0, top: 0 }; }
  getContext() { return this._ctx || (this._ctx = stubCtx()); }
}

function matches(el, sel) {
  const attr = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (attr) return attr[1] in el.attrs && (attr[2] === undefined || el.attrs[attr[1]] === attr[2]);
  if (sel.startsWith('#')) { const [id, ...cls] = sel.slice(1).split('.'); return el.id === id && cls.every((c) => el._cls().includes(c)); }
  if (sel.startsWith('.')) return sel.slice(1).split('.').every((c) => el._cls().includes(c));
  const [tag, ...cls] = sel.split('.');
  return el.tagName === tag.toUpperCase() && cls.every((c) => el._cls().includes(c));
}

function stubCtx() {
  const c = { calls: 0, _stack: 0, images: 0, imageSmoothingEnabled: true };
  const noop = (name) => function () { c.calls++; if (name === 'save') c._stack++; if (name === 'restore') c._stack--; if (name === 'putImageData') c.images++; };
  ['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'fill',
   'save', 'restore', 'setTransform', 'scale', 'translate', 'rotate', 'setLineDash', 'fillText', 'clip', 'rect', 'arc',
   'putImageData', 'drawImage'].forEach((k) => { c[k] = noop(k); });
  c.measureText = (t) => ({ width: String(t).length * 6 });
  c.createImageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  return c;
}

class Doc {
  constructor() { this._byId = new Map(); this.readyState = 'complete'; this.body = new El('body', this); }
  createElement(t) { return new El(t, this); }
  _index(el) { if (el.id) this._byId.set(el.id, el); el.children.forEach((c) => this._index(c)); }
  getElementById(id) { return this._byId.get(id) || null; }
  getElementsByName(n) { return this.body.all().filter((e) => e.name === n); }
  querySelector(s) { return this.body.querySelector(s); }
  querySelectorAll(s) { return this.body.querySelectorAll(s); }
  addEventListener() {}
  execCommand() { return true; }
}

function fromIndexHtml(html) {
  const doc = new Doc();
  const a = html.indexOf('<body>'), b = html.indexOf('</body>');
  const src = (a >= 0 ? html.slice(a + 6, b < 0 ? html.length : b) : html).replace(/<script[\s\S]*?<\/script>/g, '');
  parseHTML(src, (t) => doc.createElement(t)).forEach((c) => doc.body.appendChild(c));
  doc._index(doc.body);
  /* HTML に書いた select は、最初の option の値を持っている */
  doc.body.all().filter((e) => e.tagName === 'SELECT').forEach((s) => {
    const o = s.children.find((c) => c.tagName === 'OPTION'); if (o && !s.value) s.value = o.attrs.value;
  });
  return doc;
}

function makeWindow(doc) {
  const store = new Map();
  const win = {
    document: doc, devicePixelRatio: 1, location: { search: '' }, URLSearchParams: URLSearchParams,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } },
    requestAnimationFrame: (fn) => { win._raf.push(fn); return win._raf.length; },
    addEventListener: () => {}, setTimeout: (fn) => { win._timers.push(fn); return win._timers.length; },
    performance: { now: () => Date.now() },
    alert: (m) => { win._alerts.push(String(m)); }, confirm: () => win._confirm,
    open: (u) => { win._opened.push(String(u)); },
    _raf: [], _timers: [], _alerts: [], _opened: [], _confirm: true
  };
  win.window = win; win.globalThis = win;
  win.flush = () => {
    let n = 0;
    while (win._raf.length && n < 50) { win._raf.shift()(); n++; }
    while (win._timers.length && n < 100) { win._timers.shift()(); n++; }
  };
  return win;
}

module.exports = { El, Doc, fromIndexHtml, makeWindow, parseHTML, stubCtx };
