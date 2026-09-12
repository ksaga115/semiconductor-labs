/* 起動
 *
 *   ?fresh=1      保存を無視して最初から
 *   ?quest=lux    最初から選んでおく課題
 */
(function (global) {
  'use strict';
  var OP = global.OP;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') OP.store.clear();
    var r = OP.store.load();
    OP.ui.mount(r.state);
    if (params.get('quest')) OP.ui.selectQuest(params.get('quest'));
    if (r.broken) {
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、最初から始めました。\n壊れた中身は localStorage の "' + OP.store.BACKUP + '" に残してあります。');
      }, 200);
    }
    global.op = { state: OP.ui.state, OP: OP };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
