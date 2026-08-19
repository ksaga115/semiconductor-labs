/* 起動
 *
 *   ?fresh=1     保存を無視して空から始める
 *   ?quest=xor   最初から選んでおく課題
 */
(function (global) {
  'use strict';
  var NL = global.NL;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') NL.store.clear();

    var r = NL.store.load();
    var state = r.state;
    if (params.get('quest')) state.quest = params.get('quest');

    NL.ui.mount(state);

    if (r.broken) {
      /* 壊れた保存は捨てずに別のキーへ移してある。上書きして失わせない */
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、空の状態で始めました。\n'
            + '壊れた中身は消さずに localStorage の "' + NL.store.BACKUP + '" に残してあります。');
      }, 200);
    }

    global.nl = { state: NL.ui.state, NL: NL };   /* 開発中にコンソールから触れるように */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
