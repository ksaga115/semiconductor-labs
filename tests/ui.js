/* 画面の検査
 *
 * **本物の index.html から DOM を組んで、本物の ui.js を Node の中で動かす。**
 * だから id の書き間違いはここで落ちる ― ブラウザを開いて気付く必要がない。
 *
 * 見ているのは主に3つ:
 *   ・ui.js が触る id が index.html に全部あるか
 *   ・「置く → 解く → 描く → 採点する」の一巡が例外なく回るか
 *   ・vbs ランチャが壊れていないか（文字コードと、中身の引用符）
 *
 * 【vbs は文字コードだけ見て中身を見ないと、一度やらかす】
 * CoinLab で踏んだ。UTF-16LE であることは確かめたのに、
 * 起動行の """" が潰れていたのを見落として「正しい」と言った。
 * ここでは中身も読む。
 *
 *   node tests/ui.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { T, ok, eq, near, within, report, ROOT } = require('./harness.js');
const { fromIndexHtml, makeWindow } = require('./dom.js');

const SRC = ['phys', 'stack', 'poisson', 'band', 'dev', 'light', 'parse', 'quest', 'answer', 'store', 'ui', 'chart', 'main'];
/* ブラウザに触ってよいのはこの3つだけ（ほかは Node で検査するため触らない） */
const DOM_FILES = ['ui', 'chart', 'main'];

function boot(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const doc = fromIndexHtml(html);
  const win = makeWindow(doc);
  if (opts.search) win.location.search = opts.search;
  if (opts.seed) win.localStorage.setItem('SemiLab.v1', opts.seed);
  vm.createContext(win);
  for (const n of SRC) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8'), win,
                    { filename: 'src/' + n + '.js' });
  }
  win.flush();
  return { win, doc, SL: win.SL, S: win.SL.ui.state };
}

const $ = (doc, id) => doc.getElementById(id);

/* ================= 1. index.html と src の対応 ================= */

T('つなぎ目', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  /* script の src が全部ある。しかも読む順が依存の順になっている */
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  eq('読み込む src の数', srcs.length, SRC.length);
  srcs.forEach((s, i) => {
    ok(`${s} が存在する`, fs.existsSync(path.join(ROOT, s)));
    eq(`${i} 番目は ${SRC[i]}.js`, s, 'src/' + SRC[i] + '.js');
  });
  ok('ui.js は main.js より先', srcs.indexOf('src/ui.js') < srcs.indexOf('src/main.js'));
  ok('phys.js が一番先', srcs[0] === 'src/phys.js');

  /* ui.js / main.js が触る id が index.html に全部あるか ― 書き間違い検出 */
  const doc = fromIndexHtml(html);
  ['ui', 'main'].forEach((f) => {
    const code = fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8');
    const ids = new Set([...code.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]));
    ids.forEach((id) => ok(`${f}.js が触る #${id} が index.html にある`, $(doc, id) !== null));
    ok(`${f}.js は id を触っている`, f === 'main' || ids.size > 10);
  });

  /* getElementsByName で引くものもある */
  ok('fieldView のラジオが3つある', doc.getElementsByName('fieldView').length === 3);

  /* style.css がある / タイトルが日本語 */
  ok('style.css がある', fs.existsSync(path.join(ROOT, 'style.css')));
  ok('タイトルが半導体ラボ', /<title>半導体ラボ<\/title>/.test(html));
  ok('文字コードの宣言がある', /<meta charset="utf-8">/.test(html));

  /* ui.js 以外はブラウザに触らないこと ― これがテストを Node だけで走らせる前提 */
  SRC.filter((n) => DOM_FILES.indexOf(n) < 0).forEach((n) => {
    const code = fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8');
    ok(`${n}.js は document を触らない`, !/\bdocument\./.test(code));
    ok(`${n}.js は canvas を触らない`, !/getContext\(/.test(code));
    /* store.js だけは localStorage を触ってよい */
    if (n !== 'store') ok(`${n}.js は localStorage を触らない`, !/localStorage/.test(code));
  });
});

/* ================= 2. 起動 ================= */

T('起動', () => {
  const { doc, S, win } = boot();

  /* 初回は空ではなく「一片が1枚ある」状態から始まる（main.js の starter） */
  eq('最初から一片が1枚ある', S.stack.layers.length, 1);
  eq('それはシリコン', S.stack.layers[0].mat, 'si');
  ok('n 型で始まる', S.stack.layers[0].nd > 0);

  /* 描けている */
  const c = $(doc, 'board').getContext();
  ok('canvas に何か描かれた', c.calls > 50);
  ok('save と restore が釣り合っている', c._stack === 0);

  /* 下のバーに素性が出る */
  ok('下のバーに何か出ている', $(doc, 'statLeft').textContent.length > 0);
  ok('格子の点数が出ている', /格子 \d+ 点/.test($(doc, 'statRight').textContent));

  /* 課題の一覧が組まれている */
  const items = $(doc, 'questList').querySelectorAll('.qitem');
  eq('課題の数だけ並んでいる', items.length, win.SL.quest.LIST.length);
  ok('章の見出しがある', $(doc, 'questList').querySelectorAll('.ctitle').length === 5);

  /* 層の一覧が組まれている */
  eq('層の行がある', $(doc, 'layerList').children.length, 1);
  ok('空の案内は隠れている', $(doc, 'layersEmpty').classList.contains('hidden'));

  /* 保存されている */
  ok('localStorage に保存された', win.localStorage.getItem('SemiLab.v1') !== null);
});

/* ================= 3. 触ってみる ================= */

T('触る', () => {
  const { doc, S, win, SL } = boot();
  const c = $(doc, 'board').getContext();

  /* 一片を足す → 2層になり、接合ができる */
  $(doc, 'addSi').fire('click');
  win.flush();
  eq('一片が増えた', S.stack.layers.length, 2);

  /* 2枚目を p 型にする ― 層の編集欄が開いているはず */
  const sel = S.sel;
  ok('足した層が選ばれている', sel === 1);
  const rows = $(doc, 'layerList').querySelectorAll('.lbody .row');
  ok('厚み・Nd・Na の3つの摘みがある', rows.length === 3);

  /* Na のスライダを動かす（3行目） */
  const naRange = rows[2].querySelectorAll('input')[0];
  naRange.value = String(SL.ui.logToSlider(1e17, 1e13, 1e21));
  naRange.fire('input');
  win.flush();
  ok('Na が入った', S.stack.layers[1].na > 1e16);
  /* 動かしている最中に一覧を作り直すと、つかんでいる摘みが消えてドラッグが切れる（実際に踏んだ）。
   * 同じ摘みがまだ画面に残っていて、続けて動かせること */
  const still = $(doc, 'layerList').querySelectorAll('.lbody .row')[2].querySelectorAll('input')[0];
  ok('動かした摘みがそのまま画面に残っている', still === naRange);
  naRange.value = String(SL.ui.logToSlider(1e18, 1e13, 1e21));
  naRange.fire('input');
  win.flush();
  ok('続けて動かせる', S.stack.layers[1].na > 5e17);
  ok('値の表示も追いつく', /e\+18/.test(naRange.parentNode.querySelector('.val').value));
  ok('見出しも追いつく', /10¹⁸/.test($(doc, 'layerList').children[1].querySelector('.lname').textContent));
  /* Nd も消す */
  const ndRange = $(doc, 'layerList').querySelectorAll('.lbody .row')[1].querySelectorAll('input')[0];
  ndRange.value = '-1';
  ndRange.fire('input');
  win.flush();
  eq('Nd を抜いた', S.stack.layers[1].nd, 0);

  /* 接合が立った */
  const m = SL.stack.mesh(S.stack, S.T);
  eq('接合が1つできた', SL.stack.junctionNodes(m).length, 1);
  ok('下のバーに Vbi が出る', /Vbi/.test($(doc, 'statLeft').textContent));

  /* バイアスを動かす */
  const before = c.calls;
  const vl = $(doc, 'vlSlider');
  vl.value = '-2000'; vl.fire('input');
  win.flush();
  near('バイアスが反映された', S.bias.left, -2, 1e-9);
  ok('描き直された', c.calls > before);
  ok('表示も変わった', $(doc, 'vlVal').value === '-2.00');

  /* 平衡へ戻す */
  $(doc, 'btnZeroBias').fire('click');
  win.flush();
  near('平衡に戻った', S.bias.left, 0, 1e-12);

  /* 温度 */
  const t = $(doc, 'tempSlider');
  t.value = '350'; t.fire('input');
  win.flush();
  eq('温度が変わった', S.T, 350);
  ok('温度の表示', $(doc, 'tempVal').value === '350');
  t.value = '300'; t.fire('input'); win.flush();

  /* 光を点ける */
  const lo = $(doc, 'lightOn');
  lo.checked = true; lo.fire('change');
  win.flush();
  ok('光が点いた', S.light.on === true);
  const nm = $(doc, 'nmSlider');
  nm.value = '450'; nm.fire('input'); win.flush();
  eq('波長が変わった', S.light.nm, 450);
  ok('波長の表示', $(doc, 'nmVal').value === '450');

  /* 反射防止 */
  const ar = $(doc, 'arSlider');
  ar.value = '5'; ar.fire('input'); win.flush();
  near('反射が 5%', S.light.ar, 0.05, 1e-9);
  ar.value = '-1'; ar.fire('input'); win.flush();
  eq('裸に戻る', S.light.ar, null);

  /* 下の段の切り替え */
  const radios = doc.getElementsByName('fieldView');
  radios.forEach((r) => { r.checked = false; });
  radios[1].checked = true; radios[1].fire('change');
  win.flush();
  eq('電荷表示に切り替わった', S.view.field, 'rho');
  ok('描けている', c._stack === 0);

  /* 拡大 */
  const z = $(doc, 'zoomSlider');
  z.value = '50'; z.fire('input'); win.flush();
  ok('拡大がかかった', S.view.zoom < 1);
  ok('拡大しても描ける', c._stack === 0);

  /* 層を消す */
  const acts = $(doc, 'layerList').querySelectorAll('.lbody .acts .tb');
  ok('複製と消すのボタンがある', acts.length === 2);
  acts[1].fire('click');   /* 消す */
  win.flush();
  eq('層が減った', S.stack.layers.length, 1);

  /* 酸化膜を足すと左がゲートになる */
  $(doc, 'addOx').fire('click');
  win.flush();
  eq('先頭が酸化膜', S.stack.layers[0].mat, 'ox');
  const m2 = SL.stack.mesh(S.stack, S.T);
  eq('左がゲートになった', m2.left, SL.stack.GATE);
  ok('MOS と見分けた', /MOS/.test($(doc, 'statLeft').textContent));

  /* 作業台を消す */
  win._confirm = true;
  $(doc, 'btnNew').fire('click');
  win.flush();
  eq('空になった', S.stack.layers.length, 0);
  ok('空でも落ちない', c._stack === 0);
  ok('空の案内が出る', !$(doc, 'layersEmpty').classList.contains('hidden'));
});

/* ================= 3.5 数値で打ち込む ================= */

T('数値で打ち込む', () => {
  const { doc, S, win, SL } = boot();
  const U = SL.ui;

  /* --- 読み取り --- */
  eq('1e17', U.parseDope('1e17'), 1e17);
  eq('1.5E16', U.parseDope('1.5E16'), 1.5e16);
  eq('1×10^17', U.parseDope('1×10^17'), 1e17);
  eq('2.5x10^16', U.parseDope('2.5x10^16'), 2.5e16);
  eq('10¹⁷（画面の見出しと同じ書き方）', U.parseDope('10¹⁷'), 1e17);
  near('3.6×10¹⁷', U.parseDope('3.6×10¹⁷'), 3.6e17, 1e3);
  eq('全角 １ｅ１６', U.parseDope('１ｅ１６'), 1e16);
  eq('1017 は 10^17 ではなく 1017', U.parseDope('1017'), 1017);
  eq('空は「入れない」', U.parseDope(''), 0);
  eq('0 は「入れない」', U.parseDope('0'), 0);
  ok('読めないものは NaN（勝手に 0 にしない）', isNaN(U.parseDope('abc')));
  ok('負の濃度は NaN', isNaN(U.parseDope('-1e16')));

  near('300（単位なしは nm）', U.parseLen('300'), 300, 1e-9);
  near('2.5um', U.parseLen('2.5um'), 2500, 1e-9);
  near('2 µm', U.parseLen('2 µm'), 2000, 1e-9);
  near('0.2mm', U.parseLen('0.2mm'), 2e5, 1e-6);
  near('5nm', U.parseLen('5nm'), 5, 1e-9);
  ok('厚み 0 は NaN', isNaN(U.parseLen('0')));
  ok('厚みの負は NaN', isNaN(U.parseLen('-3')));

  near('−5（全角マイナス）', U.parseNum('−5'), -5, 1e-12);
  near('-12.5V', U.parseNum('-12.5V'), -12.5, 1e-12);
  ok('空は NaN', isNaN(U.parseNum('')));

  /* --- 層に打ち込む（起動時の一片が選ばれている） --- */
  const vals = () => $(doc, 'layerList').querySelectorAll('.lbody input.val');
  eq('厚み・Nd・Na の3つの数値欄がある', vals().length, 3);

  let v = vals()[1];
  v.value = '3.6e17'; v.fire('change'); win.flush();
  near('Nd を数値で入れた', S.stack.layers[0].nd, 3.6e17, 1);
  ok('摘みもその位置に動いた', +vals()[1].parentNode.querySelector('input').value > 500);

  v = vals()[0];
  v.value = '2.5um'; v.fire('change'); win.flush();
  near('厚みを数値で入れた', S.stack.layers[0].tnm, 2500, 1e-9);
  ok('見出しにも出た', /2\.50 µm/.test($(doc, 'layerList').children[0].querySelector('.lname').textContent));

  v = vals()[1];
  v.value = 'あいう'; v.fire('change'); win.flush();
  ok('読めない値は欄が赤くなる', v.classList.contains('bad'));
  near('読めない値では変わらない', S.stack.layers[0].nd, 3.6e17, 1);

  v.value = '1e25'; v.fire('change'); win.flush();
  near('大きすぎる濃度は上限に寄せる', S.stack.layers[0].nd, 1e21, 1e6);

  v = vals()[1];
  v.value = ''; v.fire('change'); win.flush();
  eq('空にすると「入れない」', S.stack.layers[0].nd, 0);

  /* --- 上のバーに打ち込む --- */
  const vl = $(doc, 'vlVal');
  vl.value = '-150'; vl.fire('change'); win.flush();
  near('摘みの外（−150V）まで入る', S.bias.left, -150, 1e-9);
  eq('数値欄が整って出る', vl.value, '-150.00');
  eq('摘みは端に張り付く', +$(doc, 'vlSlider').value, -50000);

  vl.value = '-999'; vl.fire('change'); win.flush();
  near('−200V より深くは入らない', S.bias.left, -200, 1e-9);
  vl.value = 'x'; vl.fire('change'); win.flush();
  ok('読めない電圧は赤くなる', vl.classList.contains('bad'));
  near('読めない電圧では変わらない', S.bias.left, -200, 1e-9);

  const vr = $(doc, 'vrVal');
  vr.value = '12V'; vr.fire('change'); win.flush();
  near('単位つきでも読む', S.bias.right, 12, 1e-9);

  const tv = $(doc, 'tempVal');
  tv.value = '77'; tv.fire('change'); win.flush();
  eq('温度は 150K より下げない', S.T, 150);
  tv.value = '400'; tv.fire('change'); win.flush();
  eq('温度 400K', S.T, 400);

  const nv = $(doc, 'nmVal');
  nv.value = '1000'; nv.fire('change'); win.flush();
  eq('波長 1000nm', S.light.nm, 1000);

  const av = $(doc, 'arVal');
  av.value = '2'; av.fire('change'); win.flush();
  near('反射 2%', S.light.ar, 0.02, 1e-12);
  av.value = ''; av.fire('change'); win.flush();
  eq('空にすると裸', S.light.ar, null);
});

/* ================= 3.6 モデルの外の知らせ ================= */

T('モデルの外の知らせ', () => {
  const { doc, S, win, SL } = boot();
  const wb = () => $(doc, 'warnbar');
  const put = (id, left, right) => {
    S.stack = SL.answer.make(id);
    S.bias = { left: left, right: right || 0 };
    SL.ui.invalidate(); win.flush();
    return SL.ui.compute();
  };

  put('onesided', 0);
  ok('平衡では知らせが出ない', wb().classList.contains('hidden'));
  put('onesided', -3);
  ok('ふつうの逆バイアスでも出ない', wb().classList.contains('hidden'));

  put('onesided', -150);
  ok('−150V では降伏の知らせが出る', !wb().classList.contains('hidden') && /降伏/.test(wb().textContent));

  put('onesided', 1.2);
  ok('順方向で Vbi を超えると大注入の知らせ', /大注入/.test(wb().textContent));

  put('moscap', 15);
  ok('ゲート 15V（5nm）で絶縁破壊の知らせ', /絶縁破壊/.test(wb().textContent));
  ok('MOS の表面は降伏と言わない', !/降伏/.test(wb().textContent));

  put('moscap', 1);
  ok('ふつうのゲート電圧では出ない', wb().classList.contains('hidden'));

  /* 直接だと収束しない −500V も、0V から段階的に上げれば解ける */
  const c = put('photo', -500);
  ok('−500V でも収束する（段階的に上げる）', c.sol.ok);
  ok('何段で上げたかが下のバーに出る', /段で上げた/.test($(doc, 'statRight').textContent));

  /* 温度を 150K まで下げても解ける */
  S.T = 150;
  const c2 = put('onesided', -3);
  ok('150K でも収束する', c2.sol.ok);
  S.T = 300;

  /* 降伏の目安は、薄いほど高い電界まで耐える（Sze の近似の向き） */
  ok('濃いほど降伏電界が高い', SL.ui.breakdownField(1e18) > SL.ui.breakdownField(1e15));
});

/* ================= 4. 課題を解く一巡 ================= */

T('課題の一巡', () => {
  const { doc, S, win, SL } = boot();

  /* 課題を選ぶ */
  const items = $(doc, 'questList').querySelectorAll('.qitem');
  items[0].fire('click');
  win.flush();
  eq('最初の課題が選ばれた', S.quest, SL.quest.LIST[0].id);
  ok('課題の欄が開いた', !$(doc, 'questBody').classList.contains('hidden'));
  ok('名前が出た', $(doc, 'qName').textContent.length > 0);
  ok('説明が出た', $(doc, 'qDesc').innerHTML.length > 10);
  ok('なぜやるかが出た', $(doc, 'qWhy').innerHTML.length > 10);
  ok('**強調** が太字になっている', /<b>/.test($(doc, 'qDesc').innerHTML));

  /* まだ通らない（起動時の一片は 1e16 なので ntype は通る ― 別の課題で見る） */
  SL.ui.selectQuest('vth');
  win.flush();
  $(doc, 'btnGrade').fire('click');
  win.flush();
  ok('落ちたと出る', /まだ/.test($(doc, 'qResult').textContent));
  ok('理由が並ぶ', $(doc, 'qResult').querySelectorAll('.k').length > 0);
  ok('この課題はまだ ✓ になっていない', !S.cleared['vth']);

  /* お手本を出して採点すると通る */
  win._confirm = true;
  $(doc, 'btnAnswer').fire('click');
  win.flush();
  ok('お手本が作業台に出た', S.stack.layers.length >= 2);
  ok('お手本の一言が出た', $(doc, 'qResult').textContent.length > 0);

  $(doc, 'btnGrade').fire('click');
  win.flush();
  ok('通ったと出る', /通った/.test($(doc, 'qResult').textContent));
  ok('✓ が付いた', S.cleared['vth'] === true);

  /* 一覧の印も変わる */
  const done = $(doc, 'questList').querySelectorAll('.qitem.done');
  ok('一覧に ✓ が反映される', done.length >= 1);

  /* お手本を断ると構造が変わらない */
  SL.ui.selectQuest('photo');
  win.flush();
  const before = JSON.stringify(S.stack);
  win._confirm = false;
  $(doc, 'btnAnswer').fire('click');
  win.flush();
  eq('断ったら構造はそのまま', JSON.stringify(S.stack), before);
  win._confirm = true;

  /* 全部の課題でお手本 → 採点が通る（画面ごしの一巡） */
  SL.quest.LIST.forEach((q) => {
    SL.ui.selectQuest(q.id);
    win.flush();
    $(doc, 'btnAnswer').fire('click');
    win.flush();
    $(doc, 'btnGrade').fire('click');
    win.flush();
    ok(`画面ごしに ${q.id} が通る`, /通った/.test($(doc, 'qResult').textContent));
  });
  eq('全部 ✓ になった', Object.keys(S.cleared).length, SL.quest.LIST.length);
});

/* ================= 4.5 測る ================= */

T('測る', () => {
  const { doc, S, win, SL } = boot();

  /* ダイオードを置く → I-V / C-V / QE が出せる */
  S.stack = SL.answer.make('photo');
  SL.ui.syncControls(); SL.ui.invalidate(); win.flush();

  $(doc, 'btnMeasure').fire('click');
  win.flush();
  const kinds = $(doc, 'modal').querySelectorAll('#mkinds .tb').filter((b) => b.dataset.k);
  const names = kinds.map((b) => b.dataset.k);
  ok('ダイオードでは I-V / C-V / QE が出せる',
     ['iv', 'cvd', 'qe'].every((k) => names.indexOf(k) >= 0));
  ok('MOS のものは出ない', names.indexOf('cv') < 0 && names.indexOf('idvd') < 0);

  const note = $(doc, 'modal').querySelector('#mnote');
  const mcv = $(doc, 'modal').querySelector('#mcv').getContext();
  kinds.forEach((btn) => {
    const before = mcv.calls;
    btn.fire('click');
    win.flush();
    ok(`${btn.dataset.k}: 例外を投げない`, !/計算できませんでした/.test(note.textContent));
    ok(`${btn.dataset.k}: 説明が出る`, note.textContent.length > 20);
    ok(`${btn.dataset.k}: 描かれた`, mcv.calls > before);
  });
  $(doc, 'modal').querySelector('#mClose').fire('click');
  ok('閉じた', $(doc, 'overlay').classList.contains('hidden'));

  /* 接合の C-V は、ポアソンを解いた dQ/dV から濃度と Vbi を「読み戻す」。
   * 層に塗った値と合っていなければ、測ったことにならない */
  const cvd = win.SL.chart.cvData(S.stack, S.T);
  within('C-V から読み戻した濃度が、層の値（Na·Nd/(Na+Nd)）と合う', cvd.nFit, cvd.nTrue, 1.15);
  /* 【「差は 2kT/q ほど」は両側とも薄い接合の話 ― 一度そう書いて外した】
   * p+(1e19)/n(1e15) では差が約 6.7kT/q（0.17V）。刻みも当てはめの範囲も厚みも変えて同じなので、
   * 数値の誤差ではない。濃い側から染み出した正孔が n 側の最初の約 0.2V の曲がりを受け持つので、
   * ドナーの 1/C² に見えない */
  const kT = win.SL.phys.vt(300);
  const off = (cvd.d.Vbi - cvd.vbiFit) / kT;
  ok('片側接合: 読み戻した Vbi は式より 2〜8 kT/q 低い（' + off.toFixed(1) + '）', off > 2 && off < 8);
  const sym = win.SL.stack.create();
  win.SL.stack.addLayer(sym, 'si', 2000, { na: 1e17 });
  win.SL.stack.addLayer(sym, 'si', 2000, { nd: 1e17 });
  const cs = win.SL.chart.cvData(sym, 300);
  const offs = (cs.d.Vbi - cs.vbiFit) / kT;
  ok('両側が同じ濃さなら差は約 2kT/q（' + offs.toFixed(1) + '）', offs > 1.5 && offs < 3.5);
  within('両側が同じ濃さでも濃度は読み戻せる', cs.nFit, cs.nTrue, 1.05);
  ok('容量は逆バイアスで単調に下がる', cvd.pts.every((p, i, a) => i === 0 || p.c < a[i - 1].c));

  /* MOS を置く → C-V と Id-Vd が出せる */
  S.stack = SL.answer.make('nand');
  SL.ui.syncControls(); SL.ui.invalidate(); win.flush();
  $(doc, 'btnMeasure').fire('click');
  win.flush();
  const k2 = $(doc, 'modal').querySelectorAll('#mkinds .tb').filter((b) => b.dataset.k);
  const n2 = k2.map((b) => b.dataset.k);
  ok('MOS では C-V と Id-Vd が出せる', n2.indexOf('cv') >= 0 && n2.indexOf('idvd') >= 0);

  const note2 = $(doc, 'modal').querySelector('#mnote');
  k2.forEach((btn) => {
    btn.fire('click');
    win.flush();
    ok(`${btn.dataset.k}: 例外を投げない`, !/計算できませんでした/.test(note2.textContent));
  });
  $(doc, 'modal').querySelector('#mClose').fire('click');

  /* 空の作業台では断る */
  S.stack = SL.stack.create();
  SL.ui.invalidate(); win.flush();
  win._alerts.length = 0;
  $(doc, 'btnMeasure').fire('click');
  win.flush();
  ok('空なら知らせて何もしない', win._alerts.length === 1);
});

/* ================= 5. 残す・書き出す ================= */

T('残す と 書き出し', () => {
  const { doc, S, win, SL } = boot();
  $(doc, 'addSi').fire('click'); win.flush();

  /* 残す */
  $(doc, 'btnSaveDev').fire('click');
  win.flush();
  const nameInput = $(doc, 'modal').querySelector('#devName');
  ok('名前の欄が出た', nameInput !== null);
  nameInput.value = 'テスト素子';
  $(doc, 'modal').querySelector('#devGo').fire('click');
  win.flush();
  ok('残った', S.lib['テスト素子'] !== undefined);
  ok('一覧に出た', $(doc, 'libList').querySelectorAll('.libitem').length === 1);
  ok('窓が閉じた', $(doc, 'overlay').classList.contains('hidden'));

  /* 呼び戻す */
  S.stack = SL.stack.create();
  $(doc, 'libList').querySelectorAll('.libitem')[0].fire('click');
  win.flush();
  eq('呼び戻せた', S.stack.layers.length, 2);

  /* 書き出し → 読み込みで往復する */
  const json = SL.store.toJSON(S);
  const back = SL.store.fromJSON(json);
  ok('読み戻せる', !back.error);
  eq('層の数が同じ', back.state.stack.layers.length, S.stack.layers.length);
  eq('残した素子も残る', Object.keys(back.state.lib).length, 1);

  /* 壊れた JSON は断る */
  ok('壊れた JSON は断る', !!SL.store.fromJSON('{{{').error);
  ok('別のアプリの JSON は断る', !!SL.store.fromJSON('{"v":1,"foo":1}').error);

  /* 書き出しの窓 */
  $(doc, 'btnExport').fire('click');
  win.flush();
  ok('書き出しの中身が入っている', $(doc, 'modal').querySelector('#expText').value.length > 50);
  $(doc, 'modal').querySelector('#expClose').fire('click');
  ok('閉じた', $(doc, 'overlay').classList.contains('hidden'));

  /* 道のり */
  $(doc, 'btnPath').fire('click');
  win.flush();
  ok('道のりに章が並ぶ', /第1章/.test($(doc, 'modal').textContent));
  ok('NandLab への言及がある', /NandLab/.test($(doc, 'modal').innerHTML));
});

/* ================= 5.5 プロセスラボから来る ================= */

T('プロセスラボから来る', () => {
  const layers = [
    { mat: 'si', tnm: 50, na: 1e19, nd: 0 },
    { mat: 'si', tnm: 200, na: 0, nd: 1e15 }
  ];
  const seed = JSON.stringify({ v: 1, stack: { layers: [{ id: 1, mat: 'si', tnm: 777, na: 0, nd: 1e16 }], seq: 2 }, lib: {} });
  const q = '?stack=' + encodeURIComponent(JSON.stringify(layers)) + '&from=' + encodeURIComponent('プロセスラボ x=5µm');
  const { S } = boot({ search: q, seed: seed });
  eq('渡された層が作業台に並ぶ', S.stack.layers.length, 2);
  eq('濃度もそのまま', S.stack.layers[0].na, 1e19);
  ok('どこから来たかの名前で残した素子にも入る', !!S.lib['プロセスラボ x=5µm']);
  const kept = Object.keys(S.lib).filter((k) => /前の作業台/.test(k));
  eq('前の作業台は黙って捨てず、残した素子に退避する', kept.length, 1);
  eq('退避した中身は前のもの', S.lib[kept[0]].layers[0].tnm, 777);

  /* 壊れた stack は知らせて、作業台は変えない */
  const b = boot({ search: '?stack=%7B%7Bbroken', seed: seed });
  eq('壊れていたら作業台はそのまま', b.S.stack.layers[0].tnm, 777);
  ok('知らせが出る', b.win._alerts.some((m) => /読めませんでした/.test(m)));
});

/* ================= 6. 壊れた保存 ================= */

T('壊れた保存', () => {
  const { win, S } = boot({ seed: '{壊れている' });
  ok('壊れていても起動する', S.stack !== undefined);
  ok('壊れた中身は退避されている', win.localStorage.getItem('SemiLab.broken') !== null);
  ok('知らせが出る', win._alerts.length === 0 || /読めなかった/.test(win._alerts[0]));

  /* ?fresh=1 は保存を無視して、最初の一片も置かずに空から始める */
  const seed = JSON.stringify({ v: 1, stack: { layers: [{ id: 1, mat: 'si', tnm: 9, na: 0, nd: 1e16 }], seq: 2 } });
  const f = boot({ search: '?fresh=1', seed: seed });
  eq('?fresh=1 は空から始まる', f.S.stack.layers.length, 0);
  /* 同じ保存を fresh 無しで読むと、そのまま復元される */
  const g2 = boot({ seed: seed });
  eq('保存から復元される', g2.S.stack.layers.length, 1);
  eq('厚みも復元される', g2.S.stack.layers[0].tnm, 9);

  /* ?quest= で課題を選んでおける */
  const g = boot({ search: '?quest=moscap' });
  eq('課題が選ばれている', g.S.quest, 'moscap');
});

/* ================= 7. ランチャと app.json ================= */

T('ランチャ', () => {
  const vbs = path.join(ROOT, '半導体ラボ.vbs');
  ok('vbs がある', fs.existsSync(vbs));

  const raw = fs.readFileSync(vbs);
  /* 文字コード ― UTF-16LE(BOM)。UTF-8 だと日本語が壊れて起動しない */
  eq('BOM が FF FE', raw[0] + ',' + raw[1], '255,254');
  ok('UTF-16 らしく偶数バイト', raw.length % 2 === 0);

  /* 中身 ― 文字コードだけ見て中身を見ないと、一度やらかす */
  const text = raw.toString('utf16le').replace(/^\uFEFF/, '');
  ok('Option Explicit がある', /Option Explicit/.test(text));
  ok('index.html を組み立てている', /BuildPath\(fso\.GetParentFolderName\(WScript\.ScriptFullName\), "index\.html"\)/.test(text));
  ok('無いときに知らせる', /MsgBox/.test(text) && /WScript\.Quit 1/.test(text));
  /* 起動行の引用符が潰れていないこと ― CoinLab で潰して起動しなくなった */
  ok('起動行の引用符が生きている', text.indexOf('shell.Run """" & target & """", 1, False') >= 0);
  ok('絶対パスを埋め込んでいない', !/C:\\/.test(text));
  ok('日本語が壊れていない', /半導体ラボ/.test(text));

  /* app.json */
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  eq('名前', app.name, 'SemiLab');
  eq('種類', app.kind, 'web');
  ok('launch の先が実在する', fs.existsSync(path.join(ROOT, app.launch)));
  ok('説明がある', app.description.length > 10);

  /* README */
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  ok('README がある', readme.length > 2000);
  ok('モデルの境目が書いてある', /どこまでが厳密/.test(readme));
  ok('落とし穴が書いてある', /落とし穴/.test(readme));
});

report();
