/* 起動
 *
 *   ?fresh=1       保存を無視して最初から
 *   ?quest=slope   最初から選んでおく課題
 */
(function (global) {
  'use strict';
  var LS = global.LS;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') LS.store.clear();
    var r = LS.store.load();
    LS.ui.mount(r.state);
    if (params.get('quest')) LS.ui.selectQuest(params.get('quest'));
    if (r.broken) {
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、最初から始めました。\n壊れた中身は localStorage の "' + LS.store.BACKUP + '" に残してあります。');
      }, 200);
    }
    global.ls = { state: LS.ui.state, LS: LS };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
