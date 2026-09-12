/* 起動
 *
 *   ?fresh=1      保存を無視して最初から
 *   ?quest=accel  最初から選んでおく課題
 */
(function (global) {
  'use strict';
  var QA = global.QA;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') QA.store.clear();
    var r = QA.store.load();
    QA.ui.mount(r.state);
    if (params.get('quest')) QA.ui.selectQuest(params.get('quest'));
    if (r.broken) {
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、最初から始めました。\n壊れた中身は localStorage の "' + QA.store.BACKUP + '" に残してあります。');
      }, 200);
    }
    global.qa = { state: QA.ui.state, QA: QA };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
