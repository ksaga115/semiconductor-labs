/* 画面の検査 ― 本物の index.html と本物の ui.js を Node で動かす（DOM の模型は SemiLab と共用）
 *
 *   node tests/ui.js
 *
 * 見た目の崩れはここでは落ちない。headless Chrome で 1280px と 1024px を撮って確かめる。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { T, ok, eq, near, report, ROOT, SEMI, SEMI_FILES } = require('./harness.js');
const { fromIndexHtml, makeWindow } = require(path.join(ROOT, '..', 'SemiLab', 'tests', 'dom.js'));

const OWN = ['rng', 'pixel', 'camera', 'ptc', 'quest', 'answer', 'store', 'ui', 'main'];

function boot(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const doc = fromIndexHtml(html), win = makeWindow(doc);
  if (opts.search) win.location.search = opts.search;
  if (opts.seed) win.localStorage.setItem('PixelLab.v1', opts.seed);
  vm.createContext(win);
  for (const n of SEMI_FILES) vm.runInContext(fs.readFileSync(path.join(SEMI, n + '.js'), 'utf8'), win, { filename: 'SemiLab/src/' + n + '.js' });
  for (const n of OWN) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8'), win, { filename: 'src/' + n + '.js' });
  win.flush();
  return { win, doc, PX: win.PX, S: win.PX.ui.state };
}
const $ = (doc, id) => doc.getElementById(id);

T('つなぎ目', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  srcs.forEach((s) => ok(`${s} が存在する`, fs.existsSync(path.join(ROOT, s))));
  eq('読む順', srcs.join(','), SEMI_FILES.map((n) => '../SemiLab/src/' + n + '.js').concat(OWN.map((n) => 'src/' + n + '.js')).join(','));
  const doc = fromIndexHtml(html);
  ['ui', 'main'].forEach((f) => {
    const code = fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8');
    new Set([...code.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]))
      .forEach((id) => ok(`${f}.js が触る #${id} が index.html にある`, $(doc, id) !== null));
  });
  OWN.filter((n) => n !== 'ui' && n !== 'main').forEach((n) => {
    const code = fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8');
    ok(`${n}.js は document を触らない`, !/\bdocument\./.test(code));
    /* 呼び出しだけを探す（rng.js の注記「Math.random は使わない」に反応して一度誤判定した） */
    ok(`${n}.js は Math.random を使わない（種を決められないので）`, !/Math\.random\s*\(/.test(code));
  });
});

T('起動と撮影', () => {
  const { doc, S, win, PX } = boot({ search: '?fresh=1' });
  eq('最初は設計したカメラ', S.cam, 'design');
  ok('設計の欄がある', $(doc, 'designForm').querySelectorAll('input').length >= 12);
  ok('設計から出る数字がある', /ダイナミックレンジ/.test($(doc, 'derived').textContent));
  ok('謎のカメラの説明は隠れている', $(doc, 'mysteryBox').classList.contains('hidden'));

  $(doc, 'btnShot').fire('click'); win.flush();
  eq('撮ると1点増える', S.points.design.length, 1);
  ok('点の表が出る', $(doc, 'pointsBox').querySelectorAll('tr').length === 2);
  $(doc, 'btnSweep').fire('click'); win.flush();
  eq('掃くと40点', S.points.design.length, 40);
  ok('描けている', $(doc, 'board').getContext()._stack === 0);

  /* 設計を変えると点は消える（別のカメラになるので） */
  const inputs = $(doc, 'designForm').querySelectorAll('input');
  inputs[0].value = '2.0'; inputs[0].fire('change'); win.flush();
  eq('ピッチを数値で変えた', S.design.pitch, 2);
  eq('設計を変えたら点が消える', S.points.design.length, 0);
  const bad = $(doc, 'designForm').querySelectorAll('input')[0];
  bad.value = 'abc'; bad.fire('change'); win.flush();
  ok('読めない値は赤くなる', bad.classList.contains('bad'));
  eq('読めない値では変わらない', S.design.pitch, 2);

  /* 謎のカメラへ */
  const cs = $(doc, 'camSel'); cs.value = 'B'; cs.fire('change'); win.flush();
  eq('カメラを切り替えた', S.cam, 'B');
  ok('設計の欄は隠れる', $(doc, 'designBox').classList.contains('hidden'));
  ok('謎のカメラの説明が出る', /謎のカメラ B/.test($(doc, 'mysteryName').textContent));
  ok('謎のカメラの中身の数字は画面に出さない', !/0\.83|6100|1\.9 e/.test($(doc, 'mysteryBox').textContent));
  const ex = $(doc, 'expVal'); ex.value = '100'; ex.fire('change'); win.flush();
  eq('露光を数値で', S.expMs, 100);
  $(doc, 'lightOn').checked = false; $(doc, 'lightOn').fire('change'); win.flush();
  $(doc, 'btnShot').fire('click'); win.flush();
  eq('光を消して撮っても点は増えない（暗い画像だけ見る）', S.points.B.length, 0);
});

T('課題の一巡', () => {
  const { doc, S, win, PX } = boot({ search: '?fresh=1' });
  PX.quest.LIST.forEach((q) => {
    PX.ui.selectQuest(q.id); win.flush();
    eq(`${q.id}: 課題に合わせてカメラが切り替わる`, S.cam, q.kind === 'design' ? 'design' : q.cam);
    $(doc, 'btnAnswer').fire('click'); win.flush();
    $(doc, 'btnGrade').fire('click'); win.flush();
    ok(`画面ごしに ${q.id} が通る`, /通った/.test($(doc, 'qResult').textContent));
  });
  eq('全部 ✓', Object.keys(S.cleared).length, PX.quest.LIST.length);

  /* 答えを手で入れて採点 */
  PX.ui.selectQuest('k'); win.flush();
  const inp = $(doc, 'qAnswer'); inp.value = '9.9'; inp.fire('change'); win.flush();
  $(doc, 'btnGrade').fire('click'); win.flush();
  ok('外れた答えは落ちる', /まだ/.test($(doc, 'qResult').textContent));
  ok('外れたときに真の値を見せない', !/真の値/.test($(doc, 'qResult').textContent));
});

T('保存', () => {
  const { win, S } = boot({ seed: '{壊れ' });
  ok('壊れていても起動する', !!S.design);
  ok('壊れた中身は退避', win.localStorage.getItem('PixelLab.broken') !== null);
  const g = boot({ seed: JSON.stringify({ v: 1, design: { pitch: 4.2 }, points: {}, cam: 'A' }) });
  eq('保存から復元（ピッチ）', g.S.design.pitch, 4.2);
  ok('足りない項目は既定で埋まる', typeof g.S.design.cfd === 'number');
  eq('カメラも復元', g.S.cam, 'A');
});

T('ランチャと README', () => {
  const vbs = path.join(ROOT, '起動.vbs');
  ok('vbs がある', fs.existsSync(vbs));
  if (fs.existsSync(vbs)) {
    const raw = fs.readFileSync(vbs);
    eq('BOM が FF FE', raw[0] + ',' + raw[1], '255,254');
    const text = raw.toString('utf16le').replace(/^﻿/, '');
    ok('起動行の引用符が生きている', text.indexOf('shell.Run """" & target & """", 1, False') >= 0);
    ok('日本語が壊れていない', /画素ラボ/.test(text));
  }
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  ok('launch の先が実在する', fs.existsSync(path.join(ROOT, app.launch)));
  const rd = path.join(ROOT, 'README.md');
  ok('README がある', fs.existsSync(rd) && fs.readFileSync(rd, 'utf8').length > 2000);
});

report();
