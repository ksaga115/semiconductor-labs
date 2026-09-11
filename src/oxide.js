/* 熱酸化 ― Deal-Grove モデル
 *
 * シリコンを酸素（ドライ）か水蒸気（ウェット）の中で熱すると、表面が酸化膜になる。
 * 酸化剤は**できた酸化膜を通り抜けて**シリコンとの界面まで届き、そこで反応する。
 * だから膜が厚くなるほど遅くなる:
 *
 *     x² + A x = B (t + τ)
 *
 *     B/A … 界面での反応の速さ（薄いうちはこれで決まる ― 直線則）
 *     B   … 膜の中を拡散で抜ける速さ（厚くなるとこれで決まる ― 放物線則）
 *
 * 係数は Deal & Grove (1965) の値。面方位 <100> は B/A を <111> の 1/1.68 にする。
 *
 * 【ドライの薄い領域】Deal-Grove はドライ酸化の最初の 25nm を説明できない
 * （実際はもっと速く育つ）。教科書は「最初から 25nm あったことにする（x_i）」でごまかす。
 * それだと 1 秒酸化しても 25nm になり、**数 nm のゲート酸化膜が作れない**。
 *
 * そこで Massoud の考え方で、薄いうちだけ速くなる項を掛ける:
 *
 *     dx/dt = B / (A + 2x) · (1 + g·exp(-x/L))       L = 7nm
 *
 * g は「1000℃ 1時間で、x_i=25nm の Deal-Grove と同じ厚みになる」ように合わせた
 * （tests/run.js がその一致を見ている）。厚い領域では元の Deal-Grove と同じになる。
 *
 * 【酸化はシリコンを食う】できた酸化膜の厚みの 0.44 倍のシリコンが消える。
 * 表面は下へ 0.44x 動き、膜の上面は上へ 0.56x 動く。recipe.js がこれを行う。
 *
 * 単位はこのファイルの中だけ µm と時間（h）。外へ出すときに cm に直す。
 */
(function (global) {
  'use strict';
  var PL = global.PL || (global.PL = {});

  var KB = 8.617333262e-5;          /* eV/K */
  var DG = {
    dry: { B0: 772, EB: 1.23, BA0: 3.71e6 / 1.68, EBA: 2.00 },   /* µm²/h, µm/h, eV */
    wet: { B0: 386, EB: 0.78, BA0: 1.63e8 / 1.68, EBA: 2.05 }
  };
  var XI_DRY = 0.025;               /* 教科書の x_i [µm] ― 検査で比べるためだけに使う */
  var THIN_L = 0.007;               /* 薄い領域の長さ [µm] */
  /* 薄い領域の強さ。「1000℃ 1h のドライ酸化が x_i=25nm の Deal-Grove（47.5nm）と一致する」
   * ように二分法で合わせた値。最初 4.0 と見当で置いたら半分の厚みしか出なかった ― 見当で置かないこと */
  var THIN_G = 34.38;

  function params(amb, Tc) {
    var p = DG[amb];
    if (!p) return null;
    var kT = KB * (Tc + 273.15);
    var B = p.B0 * Math.exp(-p.EB / kT);
    var BA = p.BA0 * Math.exp(-p.EBA / kT);
    return { B: B, BA: BA, A: B / BA };
  }

  /** 育つ速さ [µm/h]（今の厚み x [µm]） */
  function rate(amb, p, x) {
    var r = p.B / (p.A + 2 * x);
    if (amb === 'dry') r *= 1 + THIN_G * Math.exp(-x / THIN_L);
    return r;
  }

  /**
   * 厚み x0 [µm] から hours 時間で何 µm になるか。
   * 薄い領域は速さが急に変わるので、刻みは厚みに合わせて細かくする（RK4）。
   */
  function grow(amb, Tc, x0, hours) {
    var p = params(amb, Tc);
    if (!p || hours <= 0) return x0;
    var x = x0, t = 0, guard = 0;
    while (t < hours && guard++ < 100000) {
      /* 1歩で厚みが 1nm 程度しか変わらないように刻む */
      var h = Math.min(hours - t, Math.max(0.001 / rate(amb, p, x), 1e-6));
      var k1 = rate(amb, p, x);
      var k2 = rate(amb, p, x + h * k1 / 2);
      var k3 = rate(amb, p, x + h * k2 / 2);
      var k4 = rate(amb, p, x + h * k3);
      x += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
      t += h;
    }
    return x;
  }

  /** 教科書の閉じた式（検査と説明のため）。xi は最初からあったことにする厚み [µm] */
  function dealGrove(amb, Tc, hours, xi) {
    var p = params(amb, Tc);
    xi = xi || 0;
    var tau = (xi * xi + p.A * xi) / p.B;
    return (-p.A + Math.sqrt(p.A * p.A + 4 * p.B * (hours + tau))) / 2;
  }

  PL.oxide = {
    DG: DG, XI_DRY: XI_DRY, THIN_L: THIN_L, THIN_G: THIN_G,
    params: params, rate: rate, grow: grow, dealGrove: dealGrove,
    CONSUME: 0.44                   /* 酸化膜 1 に対して消えるシリコンの厚み */
  };
})(typeof window !== 'undefined' ? window : globalThis);
