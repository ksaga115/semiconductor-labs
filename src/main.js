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
    if (r.fresh && params.get('fresh') !== '1') state.circuit = starter();
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

  /* 初めて開いたときは、空の盤面ではなく「NAND 1個に触れる状態」から始める。
   *
   * NAND が何かは、説明を読むより A と B を押してみるほうが早い。
   * 両方 1 のときだけ出力が消える ― それが全部の始まりで、
   * このアプリでできることは全部これの積み重ねでしかない。
   * 消したければ「作業台を消す」。次からは保存された状態で始まる。 */
  function starter() {
    var N = NL.netlist, c = N.create();
    var a = N.addPart(c, 'in', 80, 80, { name: 'A' });
    var b = N.addPart(c, 'in', 80, 180, { name: 'B' });
    var g = N.addPart(c, 'nand', 240, 110);
    var y = N.addPart(c, 'out', 400, 120, { name: 'Y' });
    N.connect(c, a.id, 0, g.id, 0);
    N.connect(c, b.id, 0, g.id, 1);
    N.connect(c, g.id, 0, y.id, 0);
    return c;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
