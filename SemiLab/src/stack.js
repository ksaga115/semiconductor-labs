/* 構造 ― 一片を積んだもの と、その上に張る格子
 *
 * このアプリの作業台は「左から右へ並んだ一片の列」。それだけ。
 * 一片は2種類しかない:
 *
 *     si  … シリコン。アクセプタ Na とドナー Nd を塗れる
 *     ox  … 酸化膜。キャリアは居ない。電気を通さないが電界は通す
 *
 * **接合は部品ではない。** 濃度の違う一片を隣に置いた結果として勝手に立つ。
 * ここがこのアプリの本体で、だから「pn接合」という部品は存在しない。
 *
 * 【電極】両端には必ず電極が付く。付け方は自分で決めない ―
 *
 *     電極がシリコンに触れている  → オーミック電極（中性の電位に固定）
 *     電極が酸化膜に触れている    → ゲート（仕事関数ぶんずれた電位に固定）
 *
 * 酸化膜を端に置いた瞬間、その電極はゲートになる。MOS を「作った」のではなく、
 * 酸化膜を挟んだらそうなった、という順番にしてある。
 *
 * 【格子 ― このファイルで一番大事なところ】
 *
 * 一様格子にすると破綻する。濃度 1e17 のデバイ長は 13nm、1e19 なら 1.3nm、
 * 反転層に至っては 1nm 未満。一方でシリコン全体は数 µm ある。
 * 同じ刻みで刻めば点が百万個要る。だから界面の近くだけ細かくする。
 *
 * **刻みの細かさは「その層の濃度」ではなく「界面の両隣の細かいほう」で決める。**
 * ここを層ごとに独立に決めて一度やらかした:
 *
 *     p+(1e19) ― n(1e16) を隣り合わせると、
 *     p+ 側から染み出した正孔は 1.3nm で減衰するのに、
 *     n 層の刻みは自分の濃度から 10nm と決まる。
 *     その1点の箱で電荷を2倍以上多く数え、空乏層幅が4倍になった。
 *
 * 酸化膜に接するシリコン面はさらに細かくする（反転層が 1nm 以下にできるため）。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});
  var P = SL.phys;

  var NM = 1e-7;                    /* nm → cm */
  var SURF_STEP = 5e-9;             /* 酸化膜に接するシリコン面の刻み = 0.05nm */
  var MAX_NODES = 4000;             /* これを超えたら刻みを粗くしてやり直す */

  /* ---- 構造 ---- */

  function create() {
    return { layers: [], seq: 1 };
  }

  /** 層を末尾に足す。tnm は nm、na/nd は cm^-3 */
  function addLayer(st, mat, tnm, opt) {
    opt = opt || {};
    var L = {
      id: st.seq++,
      mat: mat,                     /* 'si' | 'ox' */
      tnm: tnm,
      na: mat === 'si' ? (opt.na || 0) : 0,
      nd: mat === 'si' ? (opt.nd || 0) : 0
    };
    st.layers.push(L);
    return L;
  }

  function insertLayer(st, index, mat, tnm, opt) {
    var L = addLayer(st, mat, tnm, opt);
    st.layers.pop();
    st.layers.splice(Math.max(0, Math.min(index, st.layers.length)), 0, L);
    return L;
  }

  function removeLayer(st, id) {
    var i = indexOf(st, id);
    if (i >= 0) st.layers.splice(i, 1);
    return i >= 0;
  }

  function indexOf(st, id) {
    for (var i = 0; i < st.layers.length; i++) if (st.layers[i].id === id) return i;
    return -1;
  }

  function get(st, id) { var i = indexOf(st, id); return i < 0 ? null : st.layers[i]; }

  /** 全体の厚み [cm] */
  function thickness(st) {
    var t = 0;
    for (var i = 0; i < st.layers.length; i++) t += st.layers[i].tnm * NM;
    return t;
  }

  function clone(st) { return JSON.parse(JSON.stringify(st)); }

  /* ---- 電極の種類 ― 端の一片が何かで決まる ---- */

  var OHMIC = 'ohmic', GATE = 'gate', NONE = 'none';

  function contactKind(st, side) {
    if (!st.layers.length) return NONE;
    var L = side === 'left' ? st.layers[0] : st.layers[st.layers.length - 1];
    return L.mat === 'si' ? OHMIC : GATE;
  }

  /* ---- 刻みの決め方 ---- */

  /** その層のデバイ長 [cm] */
  function debye(L, T) {
    if (L.mat !== 'si') return null;
    var ntot = Math.max(L.na + L.nd, 1e12);
    return Math.sqrt(P.SI.epsR * P.EPS0 * P.vt(T) / (P.Q * ntot));
  }

  /** その層が単独で決める細かい刻み [cm] */
  function fineStep(L, T) {
    var t = L.tnm * NM;
    if (L.mat === 'ox') return Math.max(t / 12, 1e-9);
    return Math.max(Math.min(debye(L, T) / 4, t / 6, 5e-7), 1e-8);
  }

  /** 層の真ん中で許す粗い刻み [cm] */
  function coarseStep(L, T) {
    var t = L.tnm * NM;
    if (L.mat === 'ox') return fineStep(L, T);
    return Math.max(fineStep(L, T), Math.min(2 * debye(L, T), t / 8, 2e-5));
  }

  /**
   * 層 L の、隣 nb と接する側の刻み [cm]。
   * 隣がどれだけ急に変わるかで決まる ― 自分の濃度だけで決めてはいけない。
   */
  function edgeStep(L, nb, T) {
    var h = fineStep(L, T);
    if (!nb) return h;
    if (L.mat === 'si' && nb.mat === 'ox') return Math.min(h, SURF_STEP);
    if (L.mat === 'si' && nb.mat === 'si') return Math.min(h, fineStep(nb, T));
    if (L.mat === 'ox' && nb.mat === 'si') return Math.min(h, fineStep(nb, T) * 4);
    return h;
  }

  /**
   * 厚み t を、左端 hL・右端 hR から等比で広げて（上限 hmax）刻む。
   * 戻り値は刻み幅の配列（合計はちょうど t）。左右で細かさが違ってよい。
   */
  function grade(t, hL, hR, hmax, r) {
    if (t <= 0) return [];
    hL = Math.min(hL, t / 2); hR = Math.min(hR, t / 2);
    var left = [], right = [], sl = 0, sr = 0, a = hL, b = hR, i;
    for (var guard = 0; guard < 100000; guard++) {
      var toLeft = sl <= sr;
      var h = toLeft ? a : b;
      if (sl + sr + h > t) break;
      if (toLeft) { left.push(h); sl += h; a = Math.min(a * r, hmax); }
      else { right.push(h); sr += h; b = Math.min(b * r, hmax); }
    }
    var rest = t - sl - sr;
    var out = left.slice();
    if (out.length === 0 && right.length === 0) return [t];
    if (rest > t * 1e-9) out.push(rest);
    else if (out.length) out[out.length - 1] += rest;
    else right[right.length - 1] += rest;
    for (i = right.length - 1; i >= 0; i--) out.push(right[i]);
    return out;
  }

  /* ---- 格子を張る ---- */

  /**
   * 【制御体積は左右の半分に割る ― ここも一度間違えた】
   *
   * 界面の点は左右の層で共有される。その点の制御体積を (hl+hr)/2 とひとまとめにして
   * 片方の層の濃度を掛けると、**隣の層の体積ぶんまでその濃度で数えてしまう**。
   * p+(1e19) と n(1e16) を隣り合わせたとき、n 層に居るはずの電荷が
   * 層の全ドーパント量を超えるという、あり得ない値が出た。
   *
   * だから点ごとに「左半分」と「右半分」を別々に持つ:
   *
   *     dxL / dxR     半分ずつの体積
   *     matL / matR   その半分の材質
   *     netL / netR   その半分の不純物
   *     siDx          シリコンである半分の合計（キャリアが居られる体積）
   *
   * 戻り値のうち mat[] / net[] / na[] / nd[] は**表示と初期値のためだけ**の
   * 均した値。物理の計算には使わないこと。
   */
  function mesh(st, T) {
    T = T || P.T300;
    if (!st.layers.length) return null;

    var r = 1.15, m = null;
    /* 点が増えすぎたら等比を大きくしてやり直す（細かさより落ちないことを優先） */
    for (var attempt = 0; attempt < 6; attempt++) {
      m = build(st, T, r);
      if (m.n <= MAX_NODES) break;
      r *= 1.25;
    }
    return m;
  }

  function build(st, T, r) {
    var xs = [0], owner = [], iface = [], i, j;
    var x = 0;

    for (i = 0; i < st.layers.length; i++) {
      var L = st.layers[i];
      var t = L.tnm * NM;
      var hL = edgeStep(L, i > 0 ? st.layers[i - 1] : null, T);
      var hR = edgeStep(L, i < st.layers.length - 1 ? st.layers[i + 1] : null, T);
      var hs = grade(t, hL, hR, coarseStep(L, T), r);
      for (j = 0; j < hs.length; j++) {
        x += hs[j];
        xs.push(x);
        owner.push(i);              /* 区間 j（点 j と j+1 のあいだ）の持ち主 */
      }
      if (i < st.layers.length - 1) iface.push(xs.length - 1);
    }

    var n = xs.length;
    var dxL = new Float64Array(n), dxR = new Float64Array(n), dx = new Float64Array(n);
    var matL = new Array(n), matR = new Array(n);
    var netL = new Float64Array(n), netR = new Float64Array(n), siDx = new Float64Array(n);
    var mat = new Array(n), net = new Float64Array(n);
    var na = new Float64Array(n), nd = new Float64Array(n);
    var eps = new Float64Array(n), layer = new Int32Array(n);

    /* 区間ごとの誘電率。点ではなく区間で持つ ― 界面をまたぐ流束はこれで決まる */
    var epsEdge = new Float64Array(n - 1);
    for (i = 0; i < n - 1; i++) {
      epsEdge[i] = (st.layers[owner[i]].mat === 'ox' ? P.OX.epsR : P.SI.epsR) * P.EPS0;
    }

    for (i = 0; i < n; i++) {
      var hl = i > 0 ? xs[i] - xs[i - 1] : 0;
      var hr = i < n - 1 ? xs[i + 1] - xs[i] : 0;
      dxL[i] = hl / 2; dxR[i] = hr / 2; dx[i] = dxL[i] + dxR[i];

      var A = i > 0 ? st.layers[owner[i - 1]] : null;      /* 左の区間の層 */
      var B = i < n - 1 ? st.layers[owner[i]] : null;      /* 右の区間の層 */
      matL[i] = A ? A.mat : null;
      matR[i] = B ? B.mat : null;
      netL[i] = (A && A.mat === 'si') ? A.nd - A.na : 0;
      netR[i] = (B && B.mat === 'si') ? B.nd - B.na : 0;
      siDx[i] = (matL[i] === 'si' ? dxL[i] : 0) + (matR[i] === 'si' ? dxR[i] : 0);

      /* ---- ここから下は表示と初期値のためだけ ---- */
      var pick = (A && A.mat === 'si') ? A : (B && B.mat === 'si') ? B : (A || B);
      layer[i] = (A && A.mat === 'si') ? owner[i - 1] : (i < n - 1 ? owner[i] : owner[n - 2]);
      mat[i] = (matL[i] === 'si' || matR[i] === 'si') ? 'si' : 'ox';
      na[i] = pick.mat === 'si' ? pick.na : 0;
      nd[i] = pick.mat === 'si' ? pick.nd : 0;
      net[i] = siDx[i] > 0
        ? (netL[i] * (matL[i] === 'si' ? dxL[i] : 0) + netR[i] * (matR[i] === 'si' ? dxR[i] : 0)) / siDx[i]
        : 0;
      eps[i] = (mat[i] === 'ox' ? P.OX.epsR : P.SI.epsR) * P.EPS0;
    }

    return {
      x: xs, dx: dx, dxL: dxL, dxR: dxR, siDx: siDx,
      matL: matL, matR: matR, netL: netL, netR: netR,
      mat: mat, na: na, nd: nd, net: net, eps: eps, epsEdge: epsEdge,
      layer: layer, iface: iface, n: n, T: T, ratio: r,
      left: contactKind(st, 'left'), right: contactKind(st, 'right')
    };
  }

  /** 位置 [cm] から一番近い格子点の番号 */
  function nodeAt(m, xcm) {
    var lo = 0, hi = m.n - 1, mid;
    while (lo < hi) {
      mid = (lo + hi) >> 1;
      if (m.x[mid] < xcm) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(m.x[lo - 1] - xcm) < Math.abs(m.x[lo] - xcm)) return lo - 1;
    return lo;
  }

  /* 冶金的接合（net の符号が変わるところ）。
   *
   * 濃度は一片ごとに一定なので、**接合は必ず界面の上にある**。
   * 符号が変わった区間を線形に内挿すると、格子の刻みの半分だけずれた位置が返る
   * （実際に踏んだ: 0.5µm のはずが 0.5016µm になった）。界面の点そのものを返すこと。
   */
  function junctionNodes(m) {
    var out = [], k, i;
    for (k = 0; k < m.iface.length; k++) {
      i = m.iface[k];
      if (m.matL[i] !== 'si' || m.matR[i] !== 'si') continue;
      if (m.netL[i] === 0 || m.netR[i] === 0) continue;
      if ((m.netL[i] > 0) !== (m.netR[i] > 0)) out.push(i);
    }
    return out;
  }

  function junctions(m) {
    return junctionNodes(m).map(function (i) { return m.x[i]; });
  }

  SL.stack = {
    NM: NM, OHMIC: OHMIC, GATE: GATE, NONE: NONE, MAX_NODES: MAX_NODES,
    create: create, addLayer: addLayer, insertLayer: insertLayer, removeLayer: removeLayer,
    indexOf: indexOf, get: get, thickness: thickness, clone: clone,
    contactKind: contactKind, grade: grade, fineStep: fineStep, edgeStep: edgeStep,
    coarseStep: coarseStep, debye: debye,
    mesh: mesh, nodeAt: nodeAt, junctions: junctions, junctionNodes: junctionNodes
  };
})(typeof window !== 'undefined' ? window : globalThis);
