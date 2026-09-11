/* 起動
 *
 *   ?fresh=1      保存を無視して最初から
 *   ?quest=k      最初から選んでおく課題（そのカメラに切り替わる）
 *   ?sweep=1      開いたらすぐ掃く（画面の確認用）
 *   &fit=1        当てはめの線を出す
 */
(function (global) {
  'use strict';
  var PX = global.PX;

  function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get('fresh') === '1') PX.store.clear();
    var r = PX.store.load();
    var state = r.state;
    if (params.get('fit') === '1') state.showFit = true;
    PX.ui.mount(state);
    if (params.get('quest')) PX.ui.selectQuest(params.get('quest'));
    if (params.get('sweep') === '1') PX.ui.sweep();
    if (r.broken) {
      setTimeout(function () {
        alert('前回の保存データが読めなかったので、最初から始めました。\n壊れた中身は localStorage の "' + PX.store.BACKUP + '" に残してあります。');
      }, 200);
    }
    global.px = { state: PX.ui.state, PX: PX };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
