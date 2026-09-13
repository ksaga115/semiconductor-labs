/* 画面の検査 ― 本物の index.html と本物の ui.js を Node で動かす（DOM の模型は SemiLab と共用）
 *
 *   node tests/ui.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { T, ok, eq, report, ROOT } = require('./harness.js');
const { fromIndexHtml, makeWindow } = require(path.join(ROOT, '..', 'SemiLab', 'tests', 'dom.js'));

const OWN = ['sys', 'quest', 'answer', 'store', 'ui', 'main'];

function boot(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const doc = fromIndexHtml(html), win = makeWindow(doc);
  if (opts.search) win.location.search = opts.search;
  if (opts.seed) win.localStorage.setItem('DesignLab.v1', opts.seed);
  vm.createContext(win);
  for (const n of OWN) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8'), win, { filename: 'src/' + n + '.js' });
  win.flush();
  return { win, doc, DG: win.DG, S: win.DG.ui.state };
}
const $ = (doc, id) => doc.getElementById(id);
const inputOf = (doc, win, key) => {
  const keys = win.DG.ui.FIELDS.filter((f) => f[0] !== '#').map((f) => f[0]);
  return $(doc, 'designForm').querySelectorAll('input')[keys.indexOf(key)];
};

T('つなぎ目', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  srcs.forEach((s) => ok(`${s} が存在する`, fs.existsSync(path.join(ROOT, s))));
  eq('読む順', srcs.join(','), OWN.map((n) => 'src/' + n + '.js').join(','));
  const doc = fromIndexHtml(html);
  ['ui', 'main'].forEach((f) => {
    const code = fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8');
    new Set([...code.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]))
      .forEach((id) => ok(`${f}.js が触る #${id} が index.html にある`, $(doc, id) !== null));
  });
  OWN.forEach((n) => {
    const code = fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8');
    ok(`${n}.js は Math.random を使わない`, !/Math\.random\s*\(/.test(code));
    if (n !== 'ui' && n !== 'main') ok(`${n}.js は document を触らない`, !/\bdocument\./.test(code));
  });
  /* 欄はモデルの既定値のキーを全部持つ（欄の無い設計値は画面から直せない） */
  const { DG } = boot({ search: '?fresh=1' });
  const keys = DG.ui.FIELDS.filter((f) => f[0] !== '#').map((f) => f[0]);
  Object.keys(DG.sys.defaults()).forEach((k) => ok(`欄 ${k} がある`, keys.indexOf(k) >= 0));
  keys.forEach((k) => ok(`欄 ${k} はモデルにある`, k in DG.sys.defaults()));
  DG.ui.FIELDS.filter((f) => f[0] !== '#').forEach((f) => {
    const v = DG.sys.defaults()[f[0]];
    ok(`欄 ${f[0]}: 既定値 ${v} が範囲 ${f[3]}〜${f[4]} の中`, v >= f[3] && v <= f[4]);
  });
});

T('起動と設計', () => {
  const { doc, S, win } = boot({ search: '?fresh=1' });
  ok('設計の欄が 50 以上', $(doc, 'designForm').querySelectorAll('input').length >= 50);
  eq('装置ごとの小見出しが 5 つ', $(doc, 'designForm').querySelectorAll('.sect').length, 5);
  ok('設計から出る数字にカメラ・LiDAR・分光器', /SN 比/.test($(doc, 'derived').textContent)
     && /検出数/.test($(doc, 'derived').textContent) && /分解能/.test($(doc, 'derived').textContent));
  const c = $(doc, 'board').getContext();
  ok('描けている（save/restore が対）', c._stack === 0);
  ok('4 枚の図を描いた', c.calls > 400);
  ok('ステータスに SN 比と分解能', /SN 比/.test($(doc, 'statLeft').textContent) && /分解能/.test($(doc, 'statRight').textContent));

  const inp = inputOf(doc, win, 'phot');
  inp.value = '3e5'; inp.fire('change'); win.flush();
  eq('分子の光子を数値で変えた', S.design.phot, 3e5);
  const bad = inputOf(doc, win, 'phot');
  bad.value = 'abc'; bad.fire('change'); win.flush();
  ok('読めない値は赤くなる', bad.classList.contains('bad'));
  eq('読めない値では変わらない', S.design.phot, 3e5);
  const big = inputOf(doc, win, 'phot');
  big.value = '1e12'; big.fire('change'); win.flush();
  eq('範囲の外は端に丸める（≤ 10⁹）', S.design.phot, 1e9);
  const em = inputOf(doc, win, 'emccd');
  em.value = '0.7'; em.fire('change'); win.flush();
  eq('整数の欄は丸める（センサの種類 0.7 → 1）', S.design.emccd, 1);
  const np = inputOf(doc, win, 'npulse');
  np.value = '9.4'; np.fire('change'); win.flush();
  eq('パルスの数は整数', S.design.npulse, 9);
  ok('描き直しても save/restore は対', $(doc, 'board').getContext()._stack === 0);
});

T('動き', () => {
  const { doc, win, DG } = boot({ search: '?fresh=1' });
  ok('最初は動いている', DG.ui.animating === true);
  ok('動いているあいだは次の絵を頼み続ける', win._raf.length >= 1);
  $(doc, 'btnAnim').fire('click'); win.flush();
  ok('止めた', DG.ui.animating === false);
  eq('ボタンの字が変わる', $(doc, 'btnAnim').textContent, '動かす');
  eq('止めたら次の絵を頼まない', win._raf.length, 0);
  ok('止めても save/restore は対', $(doc, 'board').getContext()._stack === 0);
  $(doc, 'btnAnim').fire('click'); win.flush();
  ok('また動く', DG.ui.animating === true && win._raf.length >= 1);
  /* 極端な設計でも描画で例外を出さない */
  const S = DG.ui.state;
  [{ lpmm: 5000 }, { lamlo: 900, lamhi: 400 }, { bgr: 1e7 }, { rho: 0.001, rng: 10000 }, { npulse: 1e6 }, { phot: 1, texp: 0.01 }].forEach((p) => {
    Object.assign(S.design, DG.sys.defaults(), p);
    let err = null;
    try { win.flush(); } catch (e) { err = e; }
    ok('極端な設計でも描ける: ' + JSON.stringify(p), !err && $(doc, 'board').getContext()._stack === 0);
  });
});

T('課題の一巡', () => {
  const { doc, S, win, DG } = boot({ search: '?fresh=1' });
  DG.quest.LIST.forEach((q) => {
    DG.ui.selectQuest(q.id); win.flush();
    ok(`${q.id}: 説明が出る`, $(doc, 'qName').textContent === q.name);
    $(doc, 'btnAnswer').fire('click'); win.flush();
    $(doc, 'btnGrade').fire('click'); win.flush();
    ok(`画面ごしに ${q.id} が通る`, /通った/.test($(doc, 'qResult').textContent));
  });
  eq('全部 ✓', Object.keys(S.cleared).length, DG.quest.LIST.length);

  DG.ui.selectQuest('prec'); win.flush();
  S.design.npulse = 8;
  $(doc, 'btnGrade').fire('click'); win.flush();
  ok('崩した設計は落ちる', /まだ/.test($(doc, 'qResult').textContent));

  const g = boot({ search: '?fresh=1&quest=slit' });
  eq('?quest= で課題を選んでおける', g.S.quest, 'slit');
});

T('保存', () => {
  const { win, S } = boot({ seed: '{壊れ' });
  ok('壊れていても起動する', !!S.design);
  ok('壊れた中身は退避', win.localStorage.getItem('DesignLab.broken') !== null);
  const g = boot({ seed: JSON.stringify({ v: 1, design: { phot: 1234 } }) });
  eq('保存から復元（分子の光子）', g.S.design.phot, 1234);
  ok('足りない項目は既定で埋まる', typeof g.S.design.lpmm === 'number' && g.S.design.lpmm === 400);
  const f = boot({ search: '?fresh=1', seed: JSON.stringify({ v: 1, design: { phot: 1234 } }) });
  eq('?fresh=1 は保存を無視する', f.S.design.phot, 2e5);
});

T('ランチャと README', () => {
  const vbs = path.join(ROOT, '起動.vbs');
  ok('vbs がある', fs.existsSync(vbs));
  if (fs.existsSync(vbs)) {
    const raw = fs.readFileSync(vbs);
    eq('BOM が FF FE', raw[0] + ',' + raw[1], '255,254');
    ok('UTF-16 らしく偶数バイト', raw.length % 2 === 0);
    const text = raw.toString('utf16le').replace(/^﻿/, '');
    ok('起動行の引用符が生きている', text.indexOf('shell.Run """" & target & """", 1, False') >= 0);
    ok('日本語が壊れていない', /設計ラボ/.test(text));
  }
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  ok('launch の先が実在する', fs.existsSync(path.join(ROOT, app.launch)));
  eq('app.json の名前', app.name, 'DesignLab');
  const rd = path.join(ROOT, 'README.md');
  const txt = fs.existsSync(rd) ? fs.readFileSync(rd, 'utf8') : '';
  ok('README がある', txt.length > 2000);
  const { DG } = boot({ search: '?fresh=1' });
  DG.quest.LIST.forEach((q) => ok(`README に課題 ${q.id} が載っている`, txt.indexOf('`' + q.id + '`') >= 0));
});

report();
