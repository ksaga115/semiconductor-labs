/* 起動
 *
 *   ?fresh=1      保存を無視して最初から
 *   ?quest=gain   最初から選んでおく課題
 */
(function (global) {
  'use strict';
  var AN = global.AN;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') AN.store.clear();
    var r = AN.store.load();
    AN.ui.mount(r.state);
    if (params.get('quest')) AN.ui.selectQuest(params.get('quest'));
    if (r.broken) {
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、最初から始めました。\n壊れた中身は localStorage の "' + AN.store.BACKUP + '" に残してあります。');
      }, 200);
    }
    global.an = { state: AN.ui.state, AN: AN };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
