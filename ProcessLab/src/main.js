/* 起動
 *
 *   ?fresh=1       保存を無視して最初から
 *   ?quest=locos   最初から選んでおく課題
 *   ?demo=locos    その課題のお手本のレシピを置く（画面の確認用）
 *   &sel=3         そのとき見ている工程
 *   &depth=0.3     断面で見る深さ [µm]
 */
(function (global) {
  'use strict';
  var PL = global.PL;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') PL.store.clear();

    var r = PL.store.load();
    var state = r.state;
    if (r.fresh && params.get('fresh') !== '1') state.recipe = starter();
    if (params.get('quest')) state.quest = params.get('quest');

    var demo = params.get('demo');
    if (demo && PL.answer.get(demo)) {
      state.recipe = PL.answer.make(demo);
      if (!params.get('quest')) state.quest = demo;
      state.sel = state.recipe.steps.length - 1;
    }
    if (params.get('sel') !== null && params.get('sel') !== '') state.sel = parseInt(params.get('sel'), 10);
    if (params.get('depth')) state.view.depth = parseFloat(params.get('depth'));
    if (params.get('cut')) state.cutX = parseFloat(params.get('cut'));

    PL.ui.mount(state);
    if (state.quest) PL.ui.selectQuest(state.quest);

    if (r.broken) {
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、最初から始めました。\n'
            + '壊れた中身は消さずに localStorage の "' + PL.store.BACKUP + '" に残してあります。');
      }, 200);
    }
    global.pl = { state: PL.ui.state, PL: PL };
  }

  /* 初めて開いたときは「注入して焼いた」だけの2工程から始める。
   * 断面が青く染まり、接合の線が出る ― 工程を足すと何が起きるかが最初から見える */
  function starter() {
    var rc = PL.recipe.create({ type: 'p', N: 1e15 });
    rc.steps.push({ t: 'imp', ion: 'P', keV: 50, dose: 1e15 });
    rc.steps.push({ t: 'heat', C: 1000, min: 20, amb: 'N2' });
    return rc;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
