/* アナログ ― 0 と 1 の下にある連続量
 *
 * mos.js は「通じている / 切れている」の2値でトランジスタを見せた。
 * それは嘘ではないが、実物のスイッチはそこまで潔くない。
 * ここでは電圧を連続量として扱い、**0 と 1 が「切り方」でしかない**ことを見せる。
 *
 * 【なぜデジタルが成立するのか】これがこの層のいちばんの答え。
 * 入力電圧をゆっくり上げていくと、出力はしきい値の近くで**急な坂**を下る。
 * 坂の傾き（利得）が 1 より大きいので、
 *
 *   入力が少し汚れていても、出力はきれいな 0 か 1 へ押し戻される。
 *
 * だから何千段積み上げても信号が濁らない。これが「雑音余裕」で、
 * デジタル回路が成り立っている理由そのもの。3値の X は、
 * 実物ではこの坂の途中（どちらとも言えない電圧）に居る状態のこと。
 *
 * 【使っているモデル】教科書の一番素朴なもの（二乗則・level 1）。
 * 実物の細かい振る舞いは出ないが、「坂ができる」「利得が 1 を超える」
 * 「上と下の釣り合いで出力が決まる」という肝は同じものが出る。
 * n と p の強さは等しいものとして扱う ― そうするとしきい値がちょうど真ん中に来て、
 * 話が余計なもので濁らない（実物は p が弱いので、少し右にずれる）。
 *
 *   遮断    Vgs <= Vth          電流は流れない
 *   飽和    Vds >= Vgs - Vth    I = k/2 (Vgs-Vth)^2       ドレイン電圧に依らない
 *   線形    それ以外            I = k ((Vgs-Vth)Vds - Vds^2/2)
 *
 * 【解き方】上の p 網と下の n 網に流れる電流が釣り合う電圧が出力。
 * 単調なので二分法で解ける（下の n が直列なので、中間の電圧も同じやり方で内側で解く）。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});

  var VDD = 3.3;        /* 電源電圧 */
  var VTH = 0.7;        /* しきい値電圧。n も p も同じ大きさとして扱う */
  var K = 1;            /* 強さ。比だけが効くので 1 でよい */
  var STEPS = 60;       /* 二分法の刻み。3.3V を 60 回割ると 1nV 未満まで詰まる */

  var CUT = 'cut', LIN = 'lin', SAT = 'sat';

  /** その働き方（遮断 / 線形 / 飽和）。名前を出したいので電流とは別に返す */
  function region(vgs, vds) {
    if (vgs <= VTH) return CUT;
    return vds >= vgs - VTH ? SAT : LIN;
  }

  /** ソースから見た電流。vgs, vds はソース基準の大きさ（p 型は呼ぶ側で裏返す） */
  function current(vgs, vds) {
    if (vgs <= VTH) return 0;
    if (vds < 0) return 0;
    var ov = vgs - VTH;
    if (vds >= ov) return K / 2 * ov * ov;
    return K * (ov * vds - vds * vds / 2);
  }

  /** 上の p 網（並列）。ソースは電源側なので、電圧をすべて電源から測り直す */
  function pullUp(va, vb, vout) {
    return current(VDD - va, VDD - vout) + current(VDD - vb, VDD - vout);
  }

  /* 下の n 網（直列）。中間の電圧 vmid は、上下の電流が等しくなる点。
   * vmid を上げると上の n の電流は減り、下の n の電流は増えるので、必ず1点で交わる */
  function pullDownMid(va, vb, vout) {
    var lo = 0, hi = Math.max(0, vout), mid, i;
    for (i = 0; i < STEPS; i++) {
      mid = (lo + hi) / 2;
      if (current(va - mid, vout - mid) > current(vb, mid)) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function pullDown(va, vb, vout) {
    var mid = pullDownMid(va, vb, vout);
    return current(vb, mid);
  }

  /**
   * 入力 va, vb（ボルト）に対して落ち着く出力電圧。
   * 戻り値 { vout, vmid, ip, region:{pa,pb,na,nb} }
   */
  function solve(va, vb) {
    var lo = 0, hi = VDD, mid, i;
    /* vout を上げると上の電流は減り、下の電流は増える。ここも1点で交わる */
    for (i = 0; i < STEPS; i++) {
      mid = (lo + hi) / 2;
      if (pullUp(va, vb, mid) > pullDown(va, vb, mid)) lo = mid; else hi = mid;
    }
    var vout = (lo + hi) / 2;
    var vmid = pullDownMid(va, vb, vout);
    return {
      vout: vout,
      vmid: vmid,
      ip: pullUp(va, vb, vout),
      region: {
        pa: region(VDD - va, VDD - vout),
        pb: region(VDD - vb, VDD - vout),
        na: region(va - vmid, vout - vmid),
        nb: region(vb, vmid)
      }
    };
  }

  /** 片方を固定して、もう片方を 0V から電源まで掃く。伝達特性の曲線 */
  function curve(vb, n) {
    n = n || 100;
    var out = [], i, va;
    for (i = 0; i <= n; i++) {
      va = VDD * i / n;
      out.push({ va: va, vout: solve(va, vb).vout });
    }
    return out;
  }

  /* 坂の傾き（利得）が -1 になる2点が、0 と 1 の境目の目安。
   * ここより外側では、入力の汚れが出力で小さくなる＝押し戻される */
  function margins(vb) {
    var c = curve(vb, 300), i, g;
    var vil = null, vih = null;
    for (i = 1; i < c.length; i++) {
      g = (c[i].vout - c[i - 1].vout) / (c[i].va - c[i - 1].va);
      if (g <= -1 && vil === null) vil = c[i - 1].va;
      if (g <= -1) vih = c[i].va;
    }
    if (vil === null) return null;
    return {
      vil: vil, vih: vih,
      voh: solve(vil, vb).vout,
      vol: solve(vih, vb).vout,
      /* 雑音余裕。これだけ汚れても、次の段が読み違えない */
      nml: vil - solve(vih, vb).vout,
      nmh: solve(vil, vb).vout - vih
    };
  }

  /** その電圧をデジタルとしてどう読むか。境目は margins の2点 */
  function asDigit(v, m) {
    if (!m) return v > VDD / 2 ? 1 : 0;
    if (v <= m.vil) return 0;
    if (v >= m.vih) return 1;
    return null;                       /* どちらとも言えない ＝ 3値の X が居る場所 */
  }

  function volts(v) { return v.toFixed(2) + 'V'; }

  var REGION_NAME = {};
  REGION_NAME[CUT] = '遮断';
  REGION_NAME[LIN] = '線形';
  REGION_NAME[SAT] = '飽和';

  var FACTS = [
    '0 と 1 は、連続した電圧をしきい値で切っただけのもの。回路の中を流れているのは電圧。',
    '入力を上げていくと、出力はしきい値の近くで急な坂を下る。この坂が 1 より急なのが要。',
    '坂が急だから、入力が少し汚れても出力はきれいな 0 か 1 へ押し戻される。だから何段積んでも濁らない。'
  ];

  NL.analog = {
    VDD: VDD, VTH: VTH, CUT: CUT, LIN: LIN, SAT: SAT, REGION_NAME: REGION_NAME, FACTS: FACTS,
    current: current, region: region, solve: solve, curve: curve, margins: margins,
    asDigit: asDigit, volts: volts, pullUp: pullUp, pullDown: pullDown
  };
})(typeof window !== 'undefined' ? window : globalThis);
