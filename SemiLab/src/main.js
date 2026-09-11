/* 起動
 *
 *   ?fresh=1      保存を無視して空から始める
 *   ?quest=vth    最初から選んでおく課題
 *   ?demo=photo   その課題のお手本を作業台に置く（画面の確認・スクリーンショット用）
 */
(function (global) {
  'use strict';
  var SL = global.SL;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') SL.store.clear();

    var r = SL.store.load();
    var state = r.state;
    if (r.fresh && params.get('fresh') !== '1') state.stack = starter();
    if (params.get('quest')) state.quest = params.get('quest');
    if (state.sel === undefined) state.sel = 0;

    /* お手本を置いた状態で開く。中身は画面の「お手本を見る」と同じものなので、
     * ここが動かなくなればテストの側でも気付ける */
    var demo = params.get('demo');
    if (demo && SL.answer.get(demo)) {
      var a = SL.answer.get(demo);
      state.stack = a.make();
      if (a.ar !== undefined) state.light.ar = a.ar;
      if (!params.get('quest')) state.quest = demo;
      state.sel = -1;
      if (params.get('bias')) {
        var b = params.get('bias').split(',');
        state.bias = { left: parseFloat(b[0]) || 0, right: parseFloat(b[1]) || 0 };
      }
      if (params.get('light') === '1') state.light.on = true;
      if (params.get('nm')) state.light.nm = parseInt(params.get('nm'), 10);
      if (params.get('view')) state.view.field = params.get('view');
      if (params.get('zoom')) state.view.zoom = parseFloat(params.get('zoom'));
      if (params.get('sel')) state.sel = parseInt(params.get('sel'), 10);
    }

    /* プロセスラボの「SemiLab で開く」から来たとき。?stack= に層の並び（JSON）が入っている。
     * 工程で作ったなだらかな分布を、濃度がほぼ一定の薄い層に区切ったもの。
     * **今の作業台は黙って捨てない** ― 空でなければ「残した素子」に退避してから置き換える */
    var importNote = null;
    var sq = params.get('stack');
    if (sq) {
      try {
        var ls = JSON.parse(sq), st2 = SL.stack.create();
        ls.forEach(function (L) {
          if ((L.mat === 'si' || L.mat === 'ox') && +L.tnm > 0) {
            SL.stack.addLayer(st2, L.mat, +L.tnm, { na: +L.na || 0, nd: +L.nd || 0 });
          }
        });
        if (st2.layers.length) {
          if (state.stack.layers.length) {
            state.lib['前の作業台（' + new Date().toLocaleString('ja-JP') + '）'] = state.stack;
          }
          state.stack = st2;
          state.sel = -1;
          var from = params.get('from');
          if (from) state.lib[from] = SL.stack.clone(st2);
        }
      } catch (e) {
        importNote = 'プロセスラボから渡された層の並びが読めませんでした: ' + (e && e.message || e);
      }
    }

    SL.ui.mount(state);
    if (importNote) setTimeout(function () { alert(importNote); }, 200);
    if (state.quest) SL.ui.selectQuest(state.quest);

    if (r.broken) {
      /* 壊れた保存は捨てずに別のキーへ移してある。上書きして失わせない */
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、空の状態で始めました。\n'
            + '壊れた中身は消さずに localStorage の "' + SL.store.BACKUP + '" に残してあります。');
      }, 200);
    }

    global.sl = { state: SL.ui.state, SL: SL };   /* 開発中にコンソールから触れるように */
  }

  /* 初めて開いたときは、空の盤面ではなく「一片が1枚ある状態」から始める。
   *
   * ドーピングが何かは、説明を読むより Nd のつまみを動かすほうが早い。
   * 「電子が10桁増える」と読むのではなく、増えるところがその場で見える。
   * 2枚目を置いて片方を p 型にすれば、そこで接合が勝手に立つ。
   * 消したければ「作業台を消す」。次からは保存された状態で始まる。 */
  function starter() {
    var st = SL.stack.create();
    SL.stack.addLayer(st, 'si', 1000, { nd: 1e16 });
    return st;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
