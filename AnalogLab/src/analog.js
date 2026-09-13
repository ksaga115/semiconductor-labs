/* アナログ設計 ― W/L と電流から、利得・帯域・雑音まで
 *
 * 第6部『アナログ回路』（基準書: ラザビー）の式を、そのまま計算で踏むモデル。
 * トランジスタは NandLab「電圧で見る」と同じ**二乗則（level 1）**:
 *
 *   Vov = √(2·Id / (µCox·W/L))     オーバードライブ電圧
 *   gm  = 2·Id / Vov = √(2·µCox·(W/L)·Id)
 *   ro  = 1 / (λ·Id)
 *
 * 設計で決めるもの（画面の左）:
 *   vdd    電源 [V]
 *   lam    チャネル長変調 λ [1/V]      短いほど大きい（＝ro が小さい）
 *   wl     W/L
 *   idua   ドレイン電流 [µA]           差動対の課題では「片側の電流」
 *   rdk    負荷抵抗 RD [kΩ]
 *   clpf   負荷容量 CL [pF]
 *   rfk    TIA の帰還抵抗 Rf [kΩ]
 *   cpdpf  PD の容量 [pF]
 *   cffF   チャージアンプの帰還容量 Cf [fF]
 *   qe     入力電荷 [e−]
 *   fsmhz  SC のクロック [MHz]          スイッチトキャパシタの等価抵抗 R = 1/(f·C)
 *   cscpf  SC の容量 [pF]              1サンプルごとの雑音 √(kT/C)
 *   idua2  第2段の電流 [µA]            2段OTA。gm2 も同じ二乗則から
 *   wl2    第2段の W/L
 *   ccpf   ミラー補償 Cc [pF]          GBW = gm1/2πCc、第2極 gm2/2πCL、右半面ゼロ gm2/2πCc
 *   nbit   ADC のビット数・fsv 満量程 [V]・cadcpf 標本化の容量 [pF]   LSB/√12 と √(kT/C)、SN 比と ENOB
 *   vin, vout  降圧 DC-DC の入力・出力 [V]・fswmhz スイッチの周波数 [MHz]・luh コイル [µH]  ΔI = (Vin−Vout)D/(Lf)
 *
 * 仮想プロセス: µCox = 200 µA/V²（0.18µm 級 nMOS の代表値）、γ = 2/3（長チャネルの熱雑音係数）。
 * 【モデルの外】ボディ効果・1/f 雑音・速度飽和・ミラー効果・ループの安定性は入れていない。
 * 乱数は使わない ― 同じ設計は必ず同じ数字になり、採点も毎回同じ。
 */
(function (global) {
  'use strict';
  var AN = global.AN || (global.AN = {});

  var QEL = 1.602176634e-19, KB = 1.380649e-23, TK = 300;
  var KP = 200e-6;        /* µCox [A/V²] */
  var GAMMA = 2 / 3;      /* 熱雑音係数 */

  function defaults() {
    return {
      vdd: 1.8, lam: 0.1, wl: 20, idua: 100,
      rdk: 12, clpf: 1, rfk: 20, cpdpf: 2, cffF: 10, qe: 1000,
      fsmhz: 1, cscpf: 1,
      idua2: 100, wl2: 20, ccpf: 1,
      nbit: 12, fsv: 1, cadcpf: 0.2,
      vin: 12, vout: 3.3, fswmhz: 1, luh: 2
    };
  }

  /**
   * 設計 → 数字。
   * 戻り値 {
   *   Id, Vov, gm, gmid, ro,
   *   rout（RD∥ro）, avr（抵抗負荷CSの|利得|）, voutdc, headLo, headHi,
   *   avint（gm·ro＝電流源負荷の上限）, adm（差動 gm·RD）,
   *   gbw（gm/2πCL）, p（VDD·Id）, vnmos（√(4kTγ/gm)）,
   *   btia（1/2πRfCpd）, irf（√(4kT/Rf)）,
   *   vq（Q/Cf）, ktc（√(kTCf)/q [e−]）
   * }
   */
  function evaluate(d) {
    var Id = d.idua * 1e-6;
    var Vov = Math.sqrt(2 * Id / (KP * d.wl));
    var gm = 2 * Id / Vov;
    var gmid = gm / Id;
    var ro = 1 / (d.lam * Id);

    var RD = d.rdk * 1e3;
    var rout = RD * ro / (RD + ro);
    var avr = gm * rout;
    var voutdc = d.vdd - Id * RD;
    var headLo = voutdc - Vov;            /* 下の余裕（飽和領域に留まる） */
    var headHi = d.vdd - voutdc;          /* 上の余裕（RD の電圧降下） */

    var avint = gm * ro;                  /* = 2/(λ·Vov) */
    var adm = gm * RD;                    /* 差動対（抵抗負荷・片側 Id） */

    var CL = d.clpf * 1e-12;
    var gbw = gm / (2 * Math.PI * CL);
    var p = d.vdd * Id;
    var vnmos = Math.sqrt(4 * KB * TK * GAMMA / gm);

    var Rf = d.rfk * 1e3, Cpd = d.cpdpf * 1e-12;
    var btia = 1 / (2 * Math.PI * Rf * Cpd);
    var irf = Math.sqrt(4 * KB * TK / Rf);

    var Cf = d.cffF * 1e-15;
    var vq = d.qe * QEL / Cf;
    var ktc = Math.sqrt(KB * TK * Cf) / QEL;

    /* スイッチトキャパシタ: 1クロックで q=C·V を運ぶ → 平均電流 fCV → 等価抵抗 1/(fC)。
       スイッチが開くたびに √(kT/C) の雑音が1回サンプルされる */
    var fsc = (d.fsmhz || 0) * 1e6, Csc = (d.cscpf || 0) * 1e-12;
    var reqsc = (fsc > 0 && Csc > 0) ? 1 / (fsc * Csc) : Infinity;
    var vktcsc = Csc > 0 ? Math.sqrt(KB * TK / Csc) : Infinity;

    /* 2段OTA（ミラー補償）: GBW は gm1 と Cc で決まり、第2極 gm2/CL と
       右半面ゼロ gm2/Cc（打ち消し抵抗なし）が位相を削る */
    var Id2 = (d.idua2 || 0) * 1e-6;
    var vov2 = Id2 > 0 ? Math.sqrt(2 * Id2 / (KP * (d.wl2 || 1))) : 0;
    var gm2v = Id2 > 0 ? 2 * Id2 / vov2 : 0;
    var Cc = (d.ccpf || 0) * 1e-12;
    var gbw2 = Cc > 0 ? gm / (2 * Math.PI * Cc) : Infinity;
    var fp2 = gm2v / (2 * Math.PI * CL);
    var fz = Cc > 0 ? gm2v / (2 * Math.PI * Cc) : Infinity;
    var pm = 90 - Math.atan(gbw2 / fp2) * 180 / Math.PI - Math.atan(gbw2 / fz) * 180 / Math.PI;
    var ptot = d.vdd * (Id + Id2);

    /* AD 変換: 1 LSB = 満量程/2^N、量子化の雑音 LSB/√12、標本化の容量の kT/C。
       満量程の正弦波（実効値 FS/2√2）に対する SN 比と実効ビット数（第6部 09） */
    var nb = d.nbit || 12, fs = d.fsv || 1, Cad = (d.cadcpf || 0) * 1e-12;
    var lsb = fs / Math.pow(2, nb), vqadc = lsb / Math.sqrt(12);
    var vktcadc = Cad > 0 ? Math.sqrt(KB * TK / Cad) : Infinity;
    var vnadc = Math.sqrt(vqadc * vqadc + vktcadc * vktcadc);
    var snradc = 20 * Math.log10((fs / (2 * Math.SQRT2)) / vnadc);
    var enob = (snradc - 1.76) / 6.02;

    /* 降圧 DC-DC（理想・連続モード）: D = Vout/Vin、コイル電流の三角波 ΔI = (Vin−Vout)·D/(L·f)（第6部 10） */
    var duty = (d.vin > 0) ? d.vout / d.vin : 0;
    var Lb = (d.luh || 0) * 1e-6, fsw = (d.fswmhz || 0) * 1e6;
    var dIbuck = (Lb > 0 && fsw > 0) ? (d.vin - d.vout) * duty / (Lb * fsw) : Infinity;

    return {
      lsb: lsb, vqadc: vqadc, vktcadc: vktcadc, vnadc: vnadc, snradc: snradc, enob: enob,
      duty: duty, dIbuck: dIbuck,
      Id: Id, Vov: Vov, gm: gm, gmid: gmid, ro: ro,
      rout: rout, avr: avr, voutdc: voutdc, headLo: headLo, headHi: headHi,
      avint: avint, adm: adm,
      gbw: gbw, p: p, vnmos: vnmos,
      btia: btia, irf: irf, vq: vq, ktc: ktc,
      reqsc: reqsc, vktcsc: vktcsc,
      gm2v: gm2v, vov2: vov2, gbw2: gbw2, fp2: fp2, fz: fz, pm: pm, ptot: ptot
    };
  }

  /** RD を掃いて |Av| を返す（ro の壁が見える図の用） */
  function gainSweep(d, rMin, rMax, n) {
    rMin = rMin || 1; rMax = rMax || 1e3; n = n || 80;   /* kΩ */
    var out = [];
    for (var i = 0; i <= n; i++) {
      var r = rMin * Math.pow(rMax / rMin, i / n);
      var dd = {}; for (var k in d) dd[k] = d[k];
      dd.rdk = r;
      out.push({ rdk: r, av: evaluate(dd).avr });
    }
    return out;
  }

  /** Id を掃いて（W/L はそのまま）電力と GBW を返す（√ でしか伸びない図の用） */
  function gbwSweep(d, iMin, iMax, n) {
    iMin = iMin || 1; iMax = iMax || 2000; n = n || 80;  /* µA */
    var out = [];
    for (var i = 0; i <= n; i++) {
      var iu = iMin * Math.pow(iMax / iMin, i / n);
      var dd = {}; for (var k in d) dd[k] = d[k];
      dd.idua = iu;
      var ev = evaluate(dd);
      out.push({ p: ev.p, gbw: ev.gbw });
    }
    return out;
  }

  AN.analog = {
    QEL: QEL, KB: KB, TK: TK, KP: KP, GAMMA: GAMMA,
    defaults: defaults, evaluate: evaluate, gainSweep: gainSweep, gbwSweep: gbwSweep
  };
})(typeof window !== 'undefined' ? window : globalThis);
