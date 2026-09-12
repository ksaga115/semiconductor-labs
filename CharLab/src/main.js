/* 起動
 *
 *   ?fresh=1    保存を無視して最初から
 *   ?quest=dn   最初から選んでおく課題
 */
(function (global) {
  'use strict';
  var CL = global.CL;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') CL.store.clear();
    var r = CL.store.load();
    CL.ui.mount(r.state);
    if (params.get('quest')) CL.ui.selectQuest(params.get('quest'));
    if (r.broken) {
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、最初から始めました。\n壊れた中身は localStorage の "' + CL.store.BACKUP + '" に残してあります。');
      }, 200);
    }
    global.charlab = { state: CL.ui.state, CL: CL };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
