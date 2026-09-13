/* 起動
 *
 *   ?fresh=1       保存を無視して最初から
 *   ?quest=fast    最初から選んでおく課題
 */
(function (global) {
  'use strict';
  var DG = global.DG;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') DG.store.clear();
    var r = DG.store.load();
    DG.ui.mount(r.state);
    if (params.get('quest')) DG.ui.selectQuest(params.get('quest'));
    if (r.broken) {
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、最初から始めました。\n壊れた中身は localStorage の "' + DG.store.BACKUP + '" に残してあります。');
      }, 200);
    }
    global.dg = { state: DG.ui.state, DG: DG };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
