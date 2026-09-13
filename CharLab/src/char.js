/* 特性ラボ ― 謎の素子を測って、パラメータを当てる
 *
 * 第2部『デバイスの基礎』の逆問題。SemiLab が「作る」なら、ここは「測る」。
 * 3つの謎の素子（ダイオード D・MOSFET M・MOS 容量 C）の測定表と特性曲線から、
 * 中のパラメータを自分の手で抽出して、答案の欄に書く。採点は真の値との差だけを見る
 * （PixelLab の「謎のカメラ」と同じ流儀。真値はこのファイルにある ― 見たければ見ればいい。
 * 　課題の価値は答えではなく、曲線から数字を取り出す手つきにある）。
 *
 * measurement の物理（すべて教科書の式。乱数なし ― 測定は毎回同じ）:
 *   ダイオード   I = Is·(exp((V − I·Rs)/(n·Vt)) − 1)   … Rs 込みの陰関数を二分法で解く
 *   MOSFET      Id = µCox(W/L)·Vd·ζ、ζ = m·Vt·ln(1+exp((Vg−Vth)/(m·Vt)))、m = S/(Vt·ln10)
 *               （Vd=50mV の深い線形領域。ζ は強反転で Vg−Vth、弱反転で指数につながる補間）
 *   MOS 容量     蓄積で Cox = εox/tox、空乏で Cox/√(1+2Cox²(Vg−Vfb)/(q·Na·εs))、
 *               強反転（高周波）で Cmin に張り付く。Wdmax = √(4εs·φF/(q·Na))、φF = Vt·ln(Na/ni)
 *
 * 定数は 300K・Si の教科書値: Vt=25.852mV、ni=1×10¹⁰ cm⁻³、εs=11.7ε₀、εox=3.9ε₀。
 * 【モデルの外】ダイオードの並列抵抗と高注入、MOSFET の移動度劣化と −Vd²/2、
 * C-V の界面準位・少数キャリア応答（低周波C-V）・多結晶Si空乏は入れていない。
 *
 * ---- 第4章の謎の素子（温度と分布）----
 *   TD  温度を振ったダイオード  Is(T) = C0·T³·exp(−Eg(T)/kT)（拡散電流 ∝ ni² ∝ T³·exp(−Eg/kT)）
 *       Eg(T) は SemiLab と同じ Varshni（1.17 − 4.73×10⁻⁴T²/(T+636)、300K で 1.1245 eV）。
 *       ln(Is/T³) を 1/T に対して引いた傾きの「見かけの Eg」は、300K の Eg ではなく
 *       Eg(T) の接線を 0 K へ延ばした値（≈1.20 eV）になる ― それを当てさせる。
 *       【仮定】D/L（拡散係数と拡散長）の温度依存は入れていない。入れると T の指数が 3 からずれ、
 *       読める値が数十 meV 動く。生成電流（ni ∝ exp(−Eg/2kT)）が支配する低温の域も入れていない。
 *   P   不純物が段になった p⁺n 接合  n 側の濃度は接合から x1 まで N1、その先 N2（段）。
 *       片側階段接合の空乏近似: 電位差 = (q/εs)∫₀ᵂ x·N(x) dx、C = εs/W、d(1/C²)/dV = −2/(q·εs·N(W))。
 *       【モデルの外】デバイ長ぶんのぼけ（実測の C-V プロファイルは段を数 L_D の幅でなまらせる。
 *       1×10¹⁶ で L_D ≈ 41 nm）と、p⁺ 側の空乏（Na = 10¹⁹ なので 0.1% 級）。
 *   R   2 つの成分を持つダイオード  I = Is1(e^(V/Vt) − 1) + Is2(e^(V/2Vt) − 1)
 *       （拡散 n=1 ＋ 空乏層再結合 n=2 の「2 ダイオードモデル」。直列抵抗は無視できる小ささと仮定）
 */
(function (global) {
  'use strict';
  var CL = global.CL || (global.CL = {});

  var QEL = 1.602176634e-19;
  var VT = 0.025852;              /* kT/q at 300K [V] */
  var NI = 1e10;                  /* Si の真性キャリア密度 [cm⁻³] */
  var EPS_S = 1.036e-12;          /* Si の誘電率 [F/cm] */
  var EPS_OX = 3.45e-13;          /* SiO₂ の誘電率 [F/cm] */

  /* 謎の素子（真の値）。採点はこれと比べる */
  var DEV = {
    dio: { is: 2e-13, n: 1.36, rs: 4.7 },              /* [A], [-], [Ω] */
    mos: { vth: 0.62, kwl: 3.2e-4, ss: 92, vd: 0.05 }, /* [V], [A/V²], [mV/dec], [V] */
    cap: { tox: 4.2, na: 3e17, vfb: -0.9 },            /* [nm], [cm⁻³], [V] */
    /* 第4章 */
    teg: { is300: 1e-12 },                             /* [A]（300K の Is）。見かけの Eg は下で表から計算 */
    prof: { na: 1e19, n1: 1e16, n2: 3e16, x1um: 0.6 }, /* [cm⁻³], [cm⁻³], [cm⁻³], [µm] */
    rec: { is1: 1e-14, is2: 2e-9 }                     /* [A], [A] */
  };

  var KB_EV = 8.617333e-5;                              /* [eV/K] */
  var TEG_T = [250, 275, 300, 325, 350, 375, 400];      /* 温度を振る点 [K] */

  /* 答案の欄（あなたの読み）。既定はどれも外れている */
  function defaults() {
    return {
      nfit: 1.0, isfit: 1e-15, rsfit: 0.1,
      vthfit: 0.3, kwlfit: 1e-4, ssfit: 60,
      toxfit: 1.0, nafit: 1e16, vfbfit: 0,
      egfit: 0.5,
      n1fit: 1e15, vbifit: 0.5, x1fit: 0.2, n2fit: 1e15,
      is1fit: 1e-12, is2fit: 1e-12, vxfit: 0.3
    };
  }

  /* ---- 第4章 TD: 温度を振った飽和電流 ---- */
  function egT(T) { return 1.17 - 4.73e-4 * T * T / (T + 636); }        /* SemiLab phys.eg と同じ Varshni */
  function tegIs(T, dev) {
    dev = dev || DEV.teg;
    var c0 = dev.is300 / (Math.pow(300, 3) * Math.exp(-egT(300) / (KB_EV * 300)));
    return c0 * Math.pow(T, 3) * Math.exp(-egT(T) / (KB_EV * T));
  }
  /** 表の全点で ln(Is/T³) を 1/T に最小二乗で当てた傾きから出す「見かけの Eg」[eV]（採点の真値） */
  function tegEa(dev) {
    var n = TEG_T.length, mx = 0, my = 0, sxy = 0, sxx = 0, i;
    var xs = TEG_T.map(function (T) { return 1 / T; });
    var ys = TEG_T.map(function (T) { return Math.log(tegIs(T, dev) / Math.pow(T, 3)); });
    for (i = 0; i < n; i++) { mx += xs[i] / n; my += ys[i] / n; }
    for (i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
    return -sxy / sxx * KB_EV;
  }

  /* ---- 第4章 P: 段になった n 側の C-V（片側階段接合・空乏近似） ---- */
  function profVbi(dev) { dev = dev || DEV.prof; return VT * Math.log(dev.na * dev.n1 / (NI * NI)); }
  function profVofW(W, dev) {                                            /* 空乏層 W [cm] での電位差 [V] */
    dev = dev || DEV.prof;
    var x1 = dev.x1um * 1e-4;
    var m = W <= x1 ? dev.n1 * W * W / 2 : dev.n1 * x1 * x1 / 2 + dev.n2 * (W * W - x1 * x1) / 2;
    return QEL / EPS_S * m;
  }
  function profW(v, dev) {                                               /* 端子電圧 v [V]（逆は負）→ W [cm] */
    dev = dev || DEV.prof;
    var need = profVbi(dev) - v, lo = 0, hi = 1e-2, k, mid;
    for (k = 0; k < 200; k++) { mid = (lo + hi) / 2; if (profVofW(mid, dev) < need) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function profC(v, dev) { return EPS_S / profW(v, dev); }               /* F/cm² */

  /* ---- 第4章 R: 2 ダイオード ---- */
  function recI(v, dev) {
    dev = dev || DEV.rec;
    return dev.is1 * (Math.exp(v / VT) - 1) + dev.is2 * (Math.exp(v / (2 * VT)) - 1);
  }
  function recVx(dev) { dev = dev || DEV.rec; return 2 * VT * Math.log(dev.is2 / dev.is1); }   /* 2 つの成分が等しい電圧 */

  /* ---- ダイオード: I を二分法で解く（Rs で電流が減る側にしか動かないので上限は理想電流） ---- */
  function diodeI(v, dev) {
    dev = dev || DEV.dio;
    var nvt = dev.n * VT;
    var ideal = dev.is * (Math.exp(v / nvt) - 1);
    if (ideal <= 0) return ideal;
    var lo = 0, hi = ideal, i, f, k;
    for (k = 0; k < 200; k++) {
      i = (lo + hi) / 2;
      f = dev.is * (Math.exp((v - i * dev.rs) / nvt) - 1) - i;
      if (f > 0) lo = i; else hi = i;
    }
    return (lo + hi) / 2;
  }

  /* ---- MOSFET: 弱反転↔強反転をつなぐ ζ 補間 ---- */
  function mosId(vg, dev) {
    dev = dev || DEV.mos;
    var m = dev.ss / (1000 * VT * Math.LN10);
    var x = (vg - dev.vth) / (m * VT);
    var zeta = m * VT * (x > 40 ? x : Math.log(1 + Math.exp(x)));
    return dev.kwl * dev.vd * zeta;
  }

  /* ---- MOS 容量（高周波・理想） ---- */
  function coxOf(dev) { dev = dev || DEV.cap; return EPS_OX / (dev.tox * 1e-7); }        /* F/cm² */
  function phifOf(na) { return VT * Math.log(na / NI); }
  function wdmaxOf(dev) {
    dev = dev || DEV.cap;
    return Math.sqrt(4 * EPS_S * phifOf(dev.na) / (QEL * dev.na));                        /* cm */
  }
  function cminOf(dev) {
    dev = dev || DEV.cap;
    var cox = coxOf(dev), cd = EPS_S / wdmaxOf(dev);
    return cox * cd / (cox + cd);
  }
  function mosC(vg, dev) {
    dev = dev || DEV.cap;
    var cox = coxOf(dev);
    if (vg <= dev.vfb) return cox;
    var cdep = cox / Math.sqrt(1 + 2 * cox * cox * (vg - dev.vfb) / (QEL * dev.na * EPS_S));
    return Math.max(cdep, cminOf(dev));
  }

  /* ---- 測定表（画面とテストが同じものを見る） ---- */
  function tables() {
    var dio = [], mos = [], cv = [], v;
    for (v = 0.30; v <= 0.901; v += 0.05) dio.push({ v: +v.toFixed(2), i: diodeI(+v.toFixed(2)) });
    for (v = 0.2; v <= 1.401; v += 0.1) mos.push({ vg: +v.toFixed(1), id: mosId(+v.toFixed(1)) });
    for (v = -2; v <= 2.001; v += 0.25) cv.push({ vg: +v.toFixed(2), c: mosC(+v.toFixed(2)) });
    var teg = TEG_T.map(function (T) { return { t: T, is: tegIs(T) }; });
    var prof = [0, -0.5, -1, -1.5, -2, -2.5, -3, -4, -5, -6, -8, -10, -12, -15, -20]
      .map(function (x) { return { v: x, c: profC(x) }; });
    var rec = [];
    for (v = 0.10; v <= 0.7501; v += 0.05) rec.push({ v: +v.toFixed(2), i: recI(+v.toFixed(2)) });
    return { dio: dio, mos: mos, cv: cv, teg: teg, prof: prof, rec: rec };
  }

  DEV.teg.ea = tegEa();                                  /* 見かけの Eg（≈1.203 eV）― 採点の真値 */

  CL.char = {
    QEL: QEL, VT: VT, NI: NI, EPS_S: EPS_S, EPS_OX: EPS_OX, KB_EV: KB_EV, TEG_T: TEG_T,
    DEV: DEV, defaults: defaults,
    diodeI: diodeI, mosId: mosId, mosC: mosC,
    coxOf: coxOf, cminOf: cminOf, wdmaxOf: wdmaxOf, phifOf: phifOf,
    egT: egT, tegIs: tegIs, tegEa: tegEa,
    profVbi: profVbi, profVofW: profVofW, profW: profW, profC: profC,
    recI: recI, recVx: recVx,
    tables: tables
  };
})(typeof window !== 'undefined' ? window : globalThis);
