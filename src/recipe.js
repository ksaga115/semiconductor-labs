/* レシピ ― 工程の並び。このアプリの「回路」にあたるもの
 *
 * 原始部品は工程だけ:
 *
 *     depo   成膜     { mat: 'ox'|'nit'|'poly'|'metal', nm }
 *     mask   露光     { open: '0011…'（列ごと、1 が開ける）, nm: レジストの厚み }
 *     etch   エッチ   { mat: 'ox'|'nit'|'poly'|'metal'|'si', nm（0 か空は「全部」） }
 *     strip  レジスト除去
 *     imp    イオン注入 { ion: 'B'|'P'|'As', keV, dose }
 *     heat   熱処理   { C: ℃, min: 分, amb: 'N2'|'dry'|'wet' }
 *
 * **LOCOS も、ウェルも、ソース・ドレインも部品ではない。** 工程を並べた結果として出てくる。
 * 窒化膜で守った所が酸化されないのは、酸化の工程が「上に窒化膜がある列は飛ばす」
 * という物理の約束を守っているだけ ― LOCOS という名前はどこにも書いていない。
 *
 * レシピは頭から毎回実行し直す（決定的）。途中の状態は snaps に全部残すので、
 * 画面で「k 番目の工程の後」を見るのはそこを引くだけ。
 */
(function (global) {
  'use strict';
  var PL = global.PL || (global.PL = {});
  var G = PL.grid, IMP = PL.implant, OX = PL.oxide, DF = PL.diffuse;

  var KIND = {
    depo:  { name: '成膜' },
    mask:  { name: '露光・現像' },
    etch:  { name: 'エッチング' },
    strip: { name: 'レジスト除去' },
    imp:   { name: 'イオン注入' },
    heat:  { name: '熱処理' }
  };
  var AMB = { N2: '窒素（拡散だけ）', dry: 'ドライ酸化', wet: 'ウェット酸化' };

  /* 熱処理の刻み。拡散距離 50nm ごとに1刻み、ただし 20〜60 刻み。
   * クランク・ニコルソンなら 20 刻みで接合深さの誤差 0.6% 以下（tests/run.js が見ている）。
   * 後退オイラーのままだと同じ精度に 400 刻み要った */
  var HEAT_LEN = 50, HEAT_MIN = 20, HEAT_MAX = 60;

  function create(sub) {
    return { sub: { type: sub && sub.type === 'n' ? 'n' : 'p', N: sub && sub.N > 0 ? sub.N : 1e15 }, steps: [] };
  }

  /* ---- マスク（列ごとの 0/1 の文字列） ---- */

  function maskAll(v) { return new Array(G.NX + 1).join(v ? '1' : '0'); }

  /** x の範囲 [µm] の組から開口の文字列を作る。ranges = [[0,5],[7,8]] */
  function maskRanges(ranges) {
    var s = '', ix;
    for (ix = 0; ix < G.NX; ix++) {
      var x = G.XC[ix] / G.UM, on = false;
      for (var k = 0; k < ranges.length; k++) if (x >= ranges[k][0] && x < ranges[k][1]) on = true;
      s += on ? '1' : '0';
    }
    return s;
  }

  function isOpen(mask, ix) { return mask && mask.charAt(ix) === '1'; }

  /* ---- 1工程ずつ ---- */

  function hasResist(w) {
    for (var ix = 0; ix < G.NX; ix++) {
      var c = w.films[ix];
      for (var k = 0; k < c.length; k++) if (c[k].mat === 'resist') return true;
    }
    return false;
  }

  function note(w, text) { if (w.notes.indexOf(text) < 0) w.notes.push(text); }

  var DO = {};

  DO.depo = function (w, s) {
    var t = Math.max(0, +s.nm || 0) * G.NM;
    if (!(t > 0)) return;
    if (hasResist(w)) note(w, 'レジストの上に成膜した（リフトオフでなければ普通はしない）');
    for (var ix = 0; ix < G.NX; ix++) { w.films[ix].push({ mat: s.mat, t: t }); G.mergeFilms(w, ix); }
  };

  DO.mask = function (w, s) {
    if (hasResist(w)) {
      note(w, '前のレジストを剥がさずに次のマスクを掛けた。古いレジストは剥がしてから掛け直した');
      DO.strip(w);
    }
    var t = (+s.nm > 0 ? +s.nm : 1000) * G.NM;
    for (var ix = 0; ix < G.NX; ix++) {
      if (!isOpen(s.open, ix)) { w.films[ix].push({ mat: 'resist', t: t }); G.mergeFilms(w, ix); }
    }
  };

  /* エッチは「上から、その材料だけ」削る。別の材料に当たったら止まる（選択比は無限大）。
   * 一番上がレジストの列は守られる。**窒化膜をハードマスクにしてシリコンを掘る**のもこれで出る */
  DO.etch = function (w, s) {
    var all = !(+s.nm > 0);
    var amount0 = all ? Infinity : +s.nm * G.NM;
    if (s.mat === 'si' && all) { note(w, 'シリコンの「全部エッチ」はできないので、何もしなかった'); return; }
    for (var ix = 0; ix < G.NX; ix++) {
      var amount = amount0, c = w.films[ix];
      if (c.length && c[c.length - 1].mat === 'resist') continue;
      while (amount > 0) {
        var top = c.length ? c[c.length - 1] : null;
        if (!top) {
          if (s.mat !== 'si') break;
          var d = Math.min(amount, G.DEPTH * 0.9 - w.siTop[ix]);
          if (d <= 0) break;
          w.siTop[ix] += d;
          clearAbove(w, ix, null);
          amount = 0;
          break;
        }
        if (top.mat !== s.mat) break;
        var rm = Math.min(amount, top.t);
        top.t -= rm; amount -= rm;
        if (top.t <= 1e-12) c.pop();
      }
    }
  };

  DO.strip = function (w) {
    for (var ix = 0; ix < G.NX; ix++) {
      w.films[ix] = w.films[ix].filter(function (f) { return f.mat !== 'resist'; });
      G.mergeFilms(w, ix);
    }
  };

  DO.imp = function (w, s) {
    if (!(+s.dose > 0) || !(+s.keV > 0)) return;
    IMP.implant(w, s.ion, +s.keV, +s.dose);
  };

  /** 表面より上に出た格子点の不純物を片付ける。
   *  酸化で食われたときの偏析: B は酸化膜に取られて失われ、P・As は界面に押し寄せる（パイルアップ）。
   *  エッチで削られたときは（pileup=null）そのまま無くなる。 */
  function clearAbove(w, ix, pileup) {
    var i0 = G.firstSi(w, ix);
    for (var sp in w.C) {
      var a = w.C[sp], moved = 0;
      for (var iz = 0; iz < i0; iz++) {
        var i = G.idx(ix, iz);
        if (a[i]) { moved += a[i] * G.DZ[iz]; a[i] = 0; }
      }
      if (pileup && G.DONOR[sp] && moved > 0 && i0 < G.NZ) a[G.idx(ix, i0)] += moved / G.DZ[i0];
    }
  }

  /** 酸化できる列か。上に酸化膜以外が1枚でもあれば酸化剤が届かない */
  function canOxidize(w, ix) {
    var c = w.films[ix];
    for (var k = 0; k < c.length; k++) if (c[k].mat !== 'ox') return false;
    return true;
  }

  function oxidize(w, amb, Tc, hours) {
    for (var ix = 0; ix < G.NX; ix++) {
      if (!canOxidize(w, ix)) continue;
      var x0 = G.filmSum(w, ix, 'ox') / G.UM;
      var x1 = OX.grow(amb, Tc, x0, hours);
      var dx = x1 - x0;
      if (!(dx > 0)) continue;
      w.films[ix] = [{ mat: 'ox', t: x1 * G.UM }];
      w.siTop[ix] += OX.CONSUME * dx * G.UM;
      clearAbove(w, ix, true);
    }
  }

  DO.heat = function (w, s) {
    var Tc = +s.C, sec = (+s.min) * 60;
    if (!(sec > 0) || !(Tc > 0)) return;
    if (hasResist(w)) {
      note(w, 'レジストを付けたまま炉に入れた。レジストは焼けて無くなった（実際の工程ではやってはいけない）');
      DO.strip(w);
    }
    var sps = G.SPECIES.filter(function (sp) { return DF.present(w.C[sp]); });
    var Dmax = 0;
    sps.forEach(function (sp) { Dmax = Math.max(Dmax, DF.D(sp, Tc)); });
    var oxid = s.amb === 'dry' || s.amb === 'wet';
    /* 刻み数。クランク・ニコルソンは2次精度なので少なくて済む（diffuse.js の注記）。
     * 酸化するなら最低 20 刻み（酸化と拡散を交互に進めるため） */
    var n = Math.ceil(Math.sqrt(Dmax * sec) / (HEAT_LEN * G.NM));
    n = Math.max(oxid ? 20 : HEAT_MIN, Math.min(n, HEAT_MAX));
    if (!sps.length && !oxid) return;
    var dt = sec / n;
    for (var k = 0; k < n; k++) {
      if (oxid) oxidize(w, s.amb, Tc, dt / 3600);
      for (var j = 0; j < sps.length; j++) DF.advance(w, w.C[sps[j]], DF.D(sps[j], Tc), dt, k);
    }
  };

  /**
   * 実行する。戻り値 { wafer, snaps }。snaps[k] は k 番目の工程の後の状態
   * （snaps[-1] にあたる最初の状態は start）。
   * cache を渡すと、変わっていない頭の部分を使い回す。
   */
  function run(rc, cache) {
    var key0 = JSON.stringify(rc.sub);
    var start = G.create(rc.sub);
    var snaps = [], w = start, from = 0;

    if (cache && cache.key0 === key0 && cache.keys) {
      /* 頭から何工程まで同じか */
      while (from < rc.steps.length && from < cache.keys.length && cache.keys[from] === JSON.stringify(rc.steps[from])) from++;
      if (from > 0) { snaps = cache.snaps.slice(0, from); w = G.clone(snaps[from - 1]); }
    }

    for (var k = from; k < rc.steps.length; k++) {
      var s = rc.steps[k];
      w = G.clone(w);
      w.notes = [];
      if (DO[s.t]) DO[s.t](w, s);
      snaps.push(w);
    }
    return {
      start: start, snaps: snaps, wafer: snaps.length ? snaps[snaps.length - 1] : start,
      key0: key0, keys: rc.steps.map(function (s) { return JSON.stringify(s); })
    };
  }

  /** 工程の一行の説明（画面の一覧と、書き出しの注釈に使う） */
  function describe(s) {
    switch (s.t) {
      case 'depo': return '成膜 ' + (G.MAT[s.mat] || {}).name + ' ' + s.nm + ' nm';
      case 'mask': return '露光・現像（開口 ' + (s.open.split('1').length - 1) * 50 / 1000 + ' µm ぶん）';
      case 'etch': return 'エッチ ' + (s.mat === 'si' ? 'シリコン' : (G.MAT[s.mat] || {}).name) + ' ' + (+s.nm > 0 ? s.nm + ' nm' : '全部');
      case 'strip': return 'レジスト除去';
      case 'imp': return '注入 ' + s.ion + ' ' + s.keV + ' keV ' + (+s.dose).toExponential(1) + ' cm⁻²';
      case 'heat': return '熱処理 ' + s.C + '℃ ' + s.min + ' 分 ' + (AMB[s.amb] || s.amb);
    }
    return s.t;
  }

  PL.recipe = {
    KIND: KIND, AMB: AMB, create: create, run: run, describe: describe,
    maskAll: maskAll, maskRanges: maskRanges, isOpen: isOpen,
    canOxidize: canOxidize, DO: DO
  };
})(typeof window !== 'undefined' ? window : globalThis);
