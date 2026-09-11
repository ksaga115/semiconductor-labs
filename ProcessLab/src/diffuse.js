/* 熱拡散 ― フィックの第2法則を2次元で解く
 *
 *     ∂C/∂t = ∇·( D ∇C )        D = D0 exp(-Ea / kT)
 *
 * 熱を加えると不純物は濃いほうから薄いほうへ広がる。D は温度に指数で効くので、
 * 1000℃ と 1100℃ で約10倍ちがう（B も P も）。**熱予算（温度×時間）が接合の深さを決める**。
 *
 * 係数は真性拡散の値（Sze）。B と P は同じくらい、As は1桁遅い ―
 * だから浅い n+ には As を使う。
 *
 * 【解き方】陰解法（後退オイラー）を x 方向 → z 方向の順に1回ずつ（分割法）。
 * 陰解法なので刻みを大きくしても発散しない。どちらの向きも三重対角なので
 * Thomas 法で一瞬（SemiLab の poisson.js と同じ道具）。
 *
 * 境界はすべて「流れない」（量が保存される）。シリコン表面から酸化膜へ逃げる分と、
 * 酸化で食われるときの偏析は recipe.js の酸化のところで別に扱う。
 *
 * 【入れていないもの】濃度に依る拡散（高濃度の As・P は速くなる）、
 * 注入の損傷による一時的な増速（TED）、酸化で速くなる効果（OED）。
 * どれも実物では効くが、ここでは真性拡散だけ。README に書いてある。
 */
(function (global) {
  'use strict';
  var PL = global.PL || (global.PL = {});
  var G = PL.grid;

  var KB = 8.617333262e-5;
  var DIFF = {
    B:  { D0: 0.76, Ea: 3.46 },     /* cm²/s, eV */
    P:  { D0: 3.85, Ea: 3.66 },
    As: { D0: 22.9, Ea: 4.10 }
  };

  /** 拡散係数 [cm²/s] */
  function D(ion, Tc) {
    var p = DIFF[ion];
    return p.D0 * Math.exp(-p.Ea / (KB * (Tc + 273.15)));
  }

  function thomas(a, b, c, d, n) {
    var i, m;
    for (i = 1; i < n; i++) { m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; d[i] -= m * d[i - 1]; }
    d[n - 1] /= b[n - 1];
    for (i = n - 2; i >= 0; i--) d[i] = (d[i] - c[i] * d[i + 1]) / b[i];
    return d;                       /* d に解が入る */
  }

  /* 作業用の配列を使い回す（毎回 new すると重い） */
  var NMAX = Math.max(G.NX, G.NZ);
  var A_ = new Float64Array(NMAX), B_ = new Float64Array(NMAX), C_ = new Float64Array(NMAX), D_ = new Float64Array(NMAX);
  var first = new Int32Array(G.NX);

  /**
   * 1刻み dt [s] だけ拡散させる。濃度 arr（その種類の配列）を上書きする。
   *
   * theta … 1 なら後退オイラー、0.5 ならクランク・ニコルソン。
   *
   * 【後退オイラーだけでは接合が深く出た ― 実際に踏んだ】
   * 後退オイラーの1刻みは、分布の裾をガウスではなく**指数関数**で広げる。
   * 接合はピークの5桁下、まさに裾にあるので、刻み 6 で接合深さが 16% 深く出た。
   * 誤差は刻み数に反比例でしか減らない（100 刻みでも 1.5%）。
   * そこで 2 次精度のクランク・ニコルソンにする。ただし CN は尖った分布（注入直後）で
   * 振動するので、最初の1刻みだけ後退オイラーを細かく重ねて均す（Rannacher の始動）。
   * heat() 側がその順番で呼ぶ。
   *
   * 【一様なら計算しない】横に一様な行は x 方向を解いても変わらないので飛ばす。
   * 隣と同じ列は z 方向の答えも同じなので写すだけにする。マスクを使わない熱処理が桁で速くなる。
   */
  var OLD = new Float64Array(Math.max(G.NX, G.NZ));
  var PREV = new Float64Array(G.NZ), PREVNEW = new Float64Array(G.NZ);

  function step(w, arr, Dc, dt, theta) {
    if (theta === undefined) theta = 1;
    var th = theta, ex = 1 - theta;
    var NX = G.NX, NZ = G.NZ, ix, iz, k, n;
    for (ix = 0; ix < NX; ix++) first[ix] = G.firstSi(w, ix);

    /* ---- x 方向（同じ深さの行ごと。シリコンが続く区間だけ） ---- */
    var r = Dc * dt / (G.DX * G.DX);
    for (iz = 0; iz < NZ; iz++) {
      ix = 0;
      while (ix < NX) {
        while (ix < NX && iz < first[ix]) ix++;
        var s = ix;
        while (ix < NX && iz >= first[ix]) ix++;
        n = ix - s;
        if (n < 2) continue;
        /* 一様な区間は解いても変わらない */
        var v0 = arr[G.idx(s, iz)], uni = true;
        for (k = 1; k < n && uni; k++) if (arr[G.idx(s + k, iz)] !== v0) uni = false;
        if (uni) continue;
        for (k = 0; k < n; k++) OLD[k] = arr[G.idx(s + k, iz)];
        for (k = 0; k < n; k++) {
          var left = k > 0, right = k < n - 1;
          A_[k] = left ? -th * r : 0;
          C_[k] = right ? -th * r : 0;
          B_[k] = 1 + th * r * ((left ? 1 : 0) + (right ? 1 : 0));
          var lap = (left ? OLD[k - 1] - OLD[k] : 0) + (right ? OLD[k + 1] - OLD[k] : 0);
          D_[k] = OLD[k] + ex * r * lap;
        }
        thomas(A_, B_, C_, D_, n);
        for (k = 0; k < n; k++) arr[G.idx(s + k, iz)] = D_[k];
      }
    }

    /* ---- z 方向（列ごと。格子は非一様なので体積で重みを付ける） ---- */
    var havePrev = false, prevI0 = -1;
    for (ix = 0; ix < NX; ix++) {
      var i0 = first[ix];
      n = NZ - i0;
      if (n < 2) { havePrev = false; continue; }
      /* 隣の列と同じ表面・同じ中身なら、答えも同じ */
      if (havePrev && i0 === prevI0) {
        var same = true;
        for (k = 0; k < n && same; k++) if (arr[G.idx(ix, i0 + k)] !== PREV[k]) same = false;
        if (same) { for (k = 0; k < n; k++) arr[G.idx(ix, i0 + k)] = PREVNEW[k]; continue; }
      }
      for (k = 0; k < n; k++) OLD[k] = arr[G.idx(ix, i0 + k)];
      for (k = 0; k < n; k++) {
        iz = i0 + k;
        var gm = k > 0 ? Dc * dt / (G.ZC[iz] - G.ZC[iz - 1]) : 0;
        var gp = k < n - 1 ? Dc * dt / (G.ZC[iz + 1] - G.ZC[iz]) : 0;
        A_[k] = -th * gm; C_[k] = -th * gp;
        B_[k] = G.DZ[iz] + th * (gm + gp);
        var flux = (k < n - 1 ? gp * (OLD[k + 1] - OLD[k]) : 0) - (k > 0 ? gm * (OLD[k] - OLD[k - 1]) : 0);
        D_[k] = G.DZ[iz] * OLD[k] + ex * flux;
      }
      thomas(A_, B_, C_, D_, n);
      for (k = 0; k < n; k++) { PREV[k] = OLD[k]; PREVNEW[k] = D_[k]; arr[G.idx(ix, i0 + k)] = D_[k]; }
      havePrev = true; prevI0 = i0;
    }
  }

  /**
   * 熱処理の k 番目の刻みを進める（Rannacher 始動つきのクランク・ニコルソン）。
   * 最初の刻み（k = 0）だけ後退オイラーを4つに割って均し、あとは CN。
   * 酸化と交互に進めるので「全部まとめて進める」関数にはしない（recipe.js の heat が1刻みずつ呼ぶ）。
   */
  function advance(w, arr, Dc, dt, k) {
    if (k === 0) { for (var q = 0; q < 4; q++) step(w, arr, Dc, dt / 4, 1); }
    else step(w, arr, Dc, dt, 0.5);
  }

  /** その種類がどこかに入っているか（入っていなければ計算を飛ばす） */
  function present(arr) {
    for (var i = 0; i < arr.length; i++) if (arr[i] > 0) return true;
    return false;
  }

  PL.diffuse = { DIFF: DIFF, D: D, step: step, advance: advance, present: present, thomas: thomas };
})(typeof window !== 'undefined' ? window : globalThis);
