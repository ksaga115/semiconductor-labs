/* 画面の検査 ― 本物の index.html と本物の ui.js を Node で動かす
 *
 *   node tests/ui.js
 *
 * 見た目の崩れ（見切れ・重なり）はここでは落ちない。headless Chrome で
 * 1280px と 1024px のスクリーンショットを撮って確かめること（SemiLab で踏んだ）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { T, ok, eq, near, report, ROOT, SEMI, SEMI_FILES } = require('./harness.js');
const { fromIndexHtml, makeWindow } = require('./dom.js');

const OWN = ['grid', 'implant', 'oxide', 'diffuse', 'recipe', 'measure', 'quest', 'answer', 'store', 'ui', 'main'];

function boot(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const doc = fromIndexHtml(html);
  const win = makeWindow(doc);
  if (opts.search) win.location.search = opts.search;
  if (opts.seed) win.localStorage.setItem('ProcessLab.v1', opts.seed);
  vm.createContext(win);
  for (const n of SEMI_FILES) vm.runInContext(fs.readFileSync(path.join(SEMI, n + '.js'), 'utf8'), win, { filename: 'SemiLab/src/' + n + '.js' });
  for (const n of OWN) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8'), win, { filename: 'src/' + n + '.js' });
  win.flush();
  return { win, doc, PL: win.PL, S: win.PL.ui.state };
}
const $ = (doc, id) => doc.getElementById(id);
const steps = (doc) => $(doc, 'stepList').children;

T('つなぎ目', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  srcs.forEach((s) => ok(`${s} が存在する`, fs.existsSync(path.join(ROOT, s))));
  eq('SemiLab の物理を先に読む', srcs.slice(0, SEMI_FILES.length).join(','), SEMI_FILES.map((n) => '../SemiLab/src/' + n + '.js').join(','));
  eq('自分の src はこの順', srcs.slice(SEMI_FILES.length).join(','), OWN.map((n) => 'src/' + n + '.js').join(','));

  const doc = fromIndexHtml(html);
  ['ui', 'main'].forEach((f) => {
    const code = fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8');
    new Set([...code.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]))
      .forEach((id) => ok(`${f}.js が触る #${id} が index.html にある`, $(doc, id) !== null));
  });
  eq('工程のボタンが6つ', doc.querySelectorAll('[data-add]').length, 6);

  OWN.filter((n) => n !== 'ui' && n !== 'main').forEach((n) => {
    const code = fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8');
    ok(`${n}.js は document を触らない`, !/\bdocument\./.test(code));
    if (n !== 'store') ok(`${n}.js は localStorage を触らない`, !/localStorage/.test(code));
  });
});

T('起動', () => {
  const { doc, S, win } = boot();
  eq('最初は2工程のレシピ', S.recipe.steps.length, 2);
  eq('一覧は「最初のウェーハ」＋2工程', steps(doc).length, 3);
  const c = $(doc, 'board').getContext();
  ok('断面が描かれた', c.calls > 100);
  ok('シリコンは画素で塗った', c.calls > 0 && c._stack === 0);
  ok('下のバーに素性', /基板 p 型/.test($(doc, 'statLeft').textContent));
  eq('課題が並ぶ', $(doc, 'questList').querySelectorAll('.qitem').length, win.PL.quest.LIST.length);
  ok('保存された', win.localStorage.getItem('ProcessLab.v1') !== null);
});

T('触る', () => {
  const { doc, S, win, PL } = boot({ search: '?fresh=1' });
  eq('fresh=1 は空のレシピ', S.recipe.steps.length, 0);

  const add = (k) => { doc.querySelector('[data-add="' + k + '"]').fire('click'); win.flush(); };
  add('imp');
  eq('注入が足された', S.recipe.steps[0].t, 'imp');
  eq('足した工程が選ばれる', S.sel, 0);

  /* 編集欄 ― ドーズを数値で */
  let ed = steps(doc)[1].querySelector('.ed');
  ok('編集欄が開いている', ed !== null);
  let inputs = ed.querySelectorAll('input');
  inputs[1].value = '3×10^14'; inputs[1].fire('change'); win.flush();
  near('ドーズを数値で入れた', S.recipe.steps[0].dose, 3e14, 1);
  inputs = steps(doc)[1].querySelector('.ed').querySelectorAll('input');
  inputs[0].value = 'abc'; inputs[0].fire('change'); win.flush();
  ok('読めない値は赤くなる', inputs[0].classList.contains('bad'));
  eq('読めない値では変わらない', S.recipe.steps[0].keV, 50);
  const sel = steps(doc)[1].querySelector('.ed').querySelector('select');
  sel.value = 'B'; sel.fire('change'); win.flush();
  eq('イオンを変えた', S.recipe.steps[0].ion, 'B');

  add('heat');
  eq('熱処理は選んでいる工程の後ろに入る', S.recipe.steps[1].t, 'heat');
  const hs = steps(doc)[2].querySelector('.ed').querySelector('select');
  hs.value = 'dry'; hs.fire('change'); win.flush();
  eq('雰囲気を変えた', S.recipe.steps[1].amb, 'dry');
  ok('酸化膜が育った', PL.measure.oxideOn(PL.ui.wafer(), 100) > 0);

  /* 工程を選ぶと、その直後のウェーハになる */
  steps(doc)[1].querySelector('.shead').fire('click'); win.flush();
  eq('1 番目を選んだ', S.sel, 0);
  eq('1 番目の直後はまだ酸化膜が無い', PL.measure.oxideOn(PL.ui.wafer(), 100), 0);
  steps(doc)[0].querySelector('.shead').fire('click'); win.flush();
  eq('最初のウェーハを選べる', S.sel, -1);

  /* マスク ― 塗り絵とプリセット */
  add('mask');
  const mk = steps(doc)[1].querySelector('.ed');
  const bar = mk.querySelector('canvas');
  ok('マスクの塗り絵がある', bar !== null);
  const open0 = S.recipe.steps[0].open;
  bar.fire('mousedown', { clientX: 850 }); bar.fire('mousemove', { clientX: 880 }); bar.fire('mouseup'); win.flush();
  ok('塗ると開口が変わる', S.recipe.steps[0].open !== open0);
  const pre = steps(doc)[1].querySelector('.ed').querySelectorAll('.presets .tb');
  pre.filter((b) => b.textContent === '全部開ける')[0].fire('click'); win.flush();
  eq('全部開ける', S.recipe.steps[0].open.indexOf('0'), -1);

  /* 並べ替え・消す */
  /* 【この DOM の模型はイベントを親へ伝えない】ブラウザでは ▼ を押すとクリックが行（.shead）まで
   * 上がってきて、e.target が ▼ になる。模型ではそれが起きないので、行に「▼ から来た」として撃つ
   * （ボタンそのものに撃って「動かない」と一度誤判定した） */
  const down = steps(doc)[1].querySelector('[data-mv="1"]');
  steps(doc)[1].querySelector('.shead').fire('click', { target: down }); win.flush();
  eq('下へ動いた', S.recipe.steps[1].t, 'mask');
  const del = steps(doc)[2].querySelector('.ed').querySelectorAll('.acts .tb')[1];
  del.fire('click'); win.flush();
  eq('消えた', S.recipe.steps.length, 2);

  /* 基板・見る深さ・切る位置 */
  const st = $(doc, 'subType'); st.value = 'n'; st.fire('change'); win.flush();
  eq('基板を n 型に', S.recipe.sub.type, 'n');
  const sn = $(doc, 'subN'); sn.value = '5e14'; sn.fire('change'); win.flush();
  near('基板の濃度', S.recipe.sub.N, 5e14, 1);
  const ds = $(doc, 'depthSel'); ds.value = '0.3'; ds.fire('change'); win.flush();
  eq('見る深さ', S.view.depth, 0.3);
  const cvl = $(doc, 'cutVal'); cvl.value = '7.5'; cvl.fire('change'); win.flush();
  near('切る位置を数値で', S.cutX, 7.5, 1e-9);
  $(doc, 'board').fire('click', { clientX: 58 + (900 - 58 - 16) * 0.25, clientY: 50 }); win.flush();
  near('断面をクリックすると切る位置が変わる', S.cutX, 2.5, 0.06);
  ok('描けている', $(doc, 'board').getContext()._stack === 0);
});

T('SemiLab へ', () => {
  const { doc, S, win, PL } = boot({ search: '?fresh=1&demo=pd' });
  $(doc, 'btnSemiDiode').fire('click'); win.flush();
  eq('新しいタブを1つ開いた', win._opened.length, 1);
  const url = win._opened[0];
  ok('SemiLab の index.html を開く', url.startsWith('../SemiLab/index.html?stack='));
  const q = new URLSearchParams(url.split('?')[1]);
  const layers = JSON.parse(q.get('stack'));
  ok('層の並びが入っている', Array.isArray(layers) && layers.length > 5);
  ok('どれも SemiLab の一片', layers.every((L) => (L.mat === 'si' || L.mat === 'ox') && L.tnm > 0));
  ok('どこから来たかが書いてある', /プロセスラボ/.test(q.get('from')));
  ok('URL は長すぎない', url.length < 16000);

  const m = boot({ search: '?fresh=1&demo=mos' });
  m.doc.getElementById('btnSemiMos').fire('click'); m.win.flush();
  const l2 = JSON.parse(new URLSearchParams(m.win._opened[0].split('?')[1]).get('stack'));
  eq('MOS として渡すと先頭が酸化膜', l2[0].mat, 'ox');
});

T('課題の一巡', () => {
  const { doc, S, win, PL } = boot({ search: '?fresh=1' });
  PL.quest.LIST.forEach((q) => {
    PL.ui.selectQuest(q.id); win.flush();
    $(doc, 'btnAnswer').fire('click'); win.flush();
    $(doc, 'btnGrade').fire('click'); win.flush();
    ok(`画面ごしに ${q.id} が通る`, /通った/.test($(doc, 'qResult').textContent));
  });
  eq('全部 ✓', Object.keys(S.cleared).length, PL.quest.LIST.length);
  ok('描けている', $(doc, 'board').getContext()._stack === 0);
});

T('保存', () => {
  const { win, S, PL } = boot({ seed: '{壊れ' });
  ok('壊れていても起動する', S.recipe && Array.isArray(S.recipe.steps));
  ok('壊れた中身は退避', win.localStorage.getItem('ProcessLab.broken') !== null);
  const j = PL.store.toJSON(S), b = PL.store.fromJSON(j);
  ok('書き出し → 読み込みで戻る', !b.error && b.state.recipe.steps.length === S.recipe.steps.length);
  ok('他のアプリの JSON は断る', !!PL.store.fromJSON('{"v":1,"stack":{}}').error);
});

T('ランチャと README', () => {
  const vbs = path.join(ROOT, '起動.vbs');
  ok('vbs がある', fs.existsSync(vbs));
  if (fs.existsSync(vbs)) {
    const raw = fs.readFileSync(vbs);
    eq('BOM が FF FE', raw[0] + ',' + raw[1], '255,254');
    const text = raw.toString('utf16le').replace(/^\uFEFF/, '');
    ok('起動行の引用符が生きている', text.indexOf('shell.Run """" & target & """", 1, False') >= 0);
    ok('日本語が壊れていない', /プロセスラボ/.test(text));
    ok('絶対パスを埋め込んでいない', !/C:\\/.test(text));
  }
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  ok('launch の先が実在する', fs.existsSync(path.join(ROOT, app.launch)));
  const rd = path.join(ROOT, 'README.md');
  ok('README がある', fs.existsSync(rd) && fs.readFileSync(rd, 'utf8').length > 2000);
});

report();
