/* 起動
 *
 *   ?fresh=1      保存を無視して最初から
 *   ?quest=k      最初から選んでおく課題
 */
(function (global) {
  'use strict';
  var PH = global.PH;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') PH.store.clear();
    var r = PH.store.load();
    PH.ui.mount(r.state);
    if (params.get('quest')) PH.ui.selectQuest(params.get('quest'));
    if (r.broken) {
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、最初から始めました。\n壊れた中身は localStorage の "' + PH.store.BACKUP + '" に残してあります。');
      }, 200);
    }
    global.ph = { state: PH.ui.state, PH: PH };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
