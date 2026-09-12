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

const OWN = ['qa', 'quest', 'answer', 'store', 'ui', 'main'];

function boot(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const doc = fromIndexHtml(html), win = makeWindow(doc);
  if (opts.search) win.location.search = opts.search;
  if (opts.seed) win.localStorage.setItem('QALab.v1', opts.seed);
  vm.createContext(win);
  for (const n of OWN) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8'), win, { filename: 'src/' + n + '.js' });
  win.flush();
  return { win, doc, QA: win.QA, S: win.QA.ui.state };
}
const $ = (doc, id) => doc.getElementById(id);

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
  OWN.filter((n) => n !== 'ui' && n !== 'main').forEach((n) => {
    const code = fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8');
    ok(`${n}.js は document を触らない`, !/\bdocument\./.test(code));
    ok(`${n}.js は Math.random を使わない`, !/Math\.random\s*\(/.test(code));
  });
});

T('起動と設計', () => {
  const { doc, S, win } = boot({ search: '?fresh=1' });
  ok('設計の欄がある', $(doc, 'designForm').querySelectorAll('input').length >= 22);
  ok('設計から出る数字がある', /MTTF/.test($(doc, 'derived').textContent));
  ok('描けている', $(doc, 'board').getContext()._stack === 0);
  ok('ステータスに Cpk', /Cpk/.test($(doc, 'statRight').textContent));

  const inputs = $(doc, 'designForm').querySelectorAll('input');
  inputs[0].value = '50'; inputs[0].fire('change'); win.flush();
  eq('FIT を数値で変えた', S.design.fitr, 50);
  const bad = $(doc, 'designForm').querySelectorAll('input')[0];
  bad.value = 'abc'; bad.fire('change'); win.flush();
  ok('読めない値は赤くなる', bad.classList.contains('bad'));
  eq('読めない値では変わらない', S.design.fitr, 50);
  const in2 = $(doc, 'designForm').querySelectorAll('input');
  in2[4].value = '999'; in2[4].fire('change'); win.flush();
  eq('範囲の外は端に丸める（試験温度 ≤ 300℃）', S.design.tstr, 300);
});

T('課題の一巡', () => {
  const { doc, S, win, QA } = boot({ search: '?fresh=1' });
  QA.quest.LIST.forEach((q) => {
    QA.ui.selectQuest(q.id); win.flush();
    ok(`${q.id}: 説明が出る`, $(doc, 'qName').textContent === q.name);
    $(doc, 'btnAnswer').fire('click'); win.flush();
    $(doc, 'btnGrade').fire('click'); win.flush();
    ok(`画面ごしに ${q.id} が通る`, /通った/.test($(doc, 'qResult').textContent));
  });
  eq('全部 ✓', Object.keys(S.cleared).length, QA.quest.LIST.length);

  /* わざと崩すと落ちる */
  QA.ui.selectQuest('tec'); win.flush();
  S.design.dtc = 65;
  $(doc, 'btnGrade').fire('click'); win.flush();
  ok('崩した設計は落ちる', /まだ/.test($(doc, 'qResult').textContent));
});

T('保存', () => {
  const { win, S } = boot({ seed: '{壊れ' });
  ok('壊れていても起動する', !!S.design);
  ok('壊れた中身は退避', win.localStorage.getItem('QALab.broken') !== null);
  const g = boot({ seed: JSON.stringify({ v: 1, design: { fitr: 7 } }) });
  eq('保存から復元（FIT）', g.S.design.fitr, 7);
  ok('足りない項目は既定で埋まる', typeof g.S.design.sigma === 'number');
});

T('ランチャと README', () => {
  const vbs = path.join(ROOT, '起動.vbs');
  ok('vbs がある', fs.existsSync(vbs));
  if (fs.existsSync(vbs)) {
    const raw = fs.readFileSync(vbs);
    eq('BOM が FF FE', raw[0] + ',' + raw[1], '255,254');
    const text = raw.toString('utf16le').replace(/^﻿/, '');
    ok('起動行の引用符が生きている', text.indexOf('shell.Run """" & target & """", 1, False') >= 0);
    ok('日本語が壊れていない', /品質ラボ/.test(text));
  }
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  ok('launch の先が実在する', fs.existsSync(path.join(ROOT, app.launch)));
  const rd = path.join(ROOT, 'README.md');
  ok('README がある', fs.existsSync(rd) && fs.readFileSync(rd, 'utf8').length > 2000);
});

report();
