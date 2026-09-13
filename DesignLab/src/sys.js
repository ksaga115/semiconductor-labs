/* 装置の設計 ― 微弱光カメラ・LiDAR・分光器の予算表
 *
 * 第10部『設計演習』の3つの題材の式を、そのまま計算で踏むモデル。
 * 既定値は第10部の基準の設計（245 e⁻・SNR 13.9・29.6 個・12.1 mm …）。
 *
 * ---- A 微弱光カメラ（第10部 02〜04）----
 *   phot   分子が 1 秒に出す光子 [/s]（仮定）
 *   na, nimm  対物レンズの NA と浸液の屈折率    集める割合 (1 − cos θ)/2、θ = asin(NA/n)
 *   topt   光学系の透過・qe 量子効率・texp 露光 [ms]    S = phot·集める·透過·QE·texp
 *   npix   輝点が広がる画素の数・sigr 読み出し雑音 [e⁻/画素]
 *   bgr    背景光 [e⁻/画素/s]・dark25 暗電流（冷やす前、仮定）[e⁻/画素/s]・dtc 冷やす温度差 [K]
 *                     暗電流 = dark25 · 2^(−dtc/9)（生成電流で約 9 ℃ ごとに 2 倍、第2部 03）
 *                     9 K は目安の値。300 K 付近の生成電流で実際に 2 倍になる幅は 8.6 K（拡散電流なら 4.3 K）。
 *                     課題 tec の窓はこの 9 K で決めてあるので、式は目安のまま使う。
 *   emccd  0 = sCMOS、1 = EM-CCD
 *                     sCMOS: SNR = S/√(S + B + npix·σr²)　EM-CCD: SNR = S/√(2(S + B))（F² = 2、読み出し雑音は消える）
 *   fwc    飽和電荷 [e⁻]・nbit ADC のビット数     1 LSB = fwc/2^nbit、ダイナミックレンジ 20 log(fwc/σr)
 *   pxw, pxh 画素の数・fps 枚/秒・link 伝送の帯域 [Gb/s]   データ = pxw·pxh·nbit·fps
 *   qmax, dtmax  TEC の最大吸熱 [W] と最大温度差 [K]・qload 熱負荷 [W]   吸える熱 = qmax(1 − dtc/dtmax)
 *
 * ---- B LiDAR（第10部 05〜07）----
 *   ppk 尖頭値 [W]・pw パルスの幅 [ns]・lnm 波長 [nm]      パルスの光子 = ppk·pw/(hc/λ)
 *   rho 反射率・dap 受光口の直径 [mm]・rng 距離 [m]・topt2 受光の透過・pde SPAD の検出効率
 *                     1 パルスの検出数 = 光子 × ρ/π · A/R² × 透過 × 検出効率（ランバート面）
 *   esun 太陽の分光放射照度 [W/(m²·nm)]（仮定）・dlf フィルタの幅 [nm]・ifov 瞬時視野 [度]（四方）
 *                     背景 = esun·Δλ · ρ/π · A · Ω / hν × 透過 × 検出効率、Ω = (ifov [rad])²
 *   taud SPAD の不感時間 [ns]        r·τd と数えられる率 r/(1 + r·τd)
 *   frep 繰り返し [kHz]・npulse 積むパルスの数・jit SPAD と TDC の揺らぎ [ns]
 *                     1 光子の距離のばらつき c·√((pw/2.355)² + jit²)/2、N 個で 1/√N
 *
 * ---- C 分光器（第10部 08・09）----
 *   lpmm 格子の本数 [本/mm]・alpha 入射角 [度]・fmm 焦点距離 [mm]
 *                     mλ = d(sin α + sin β)、センサの上の位置 x = f·tan(β − β中心)
 *   slitum スリットの幅 [µm]・pxum 画素の幅 [µm]・npx 画素の数・lamlo, lamhi 測る範囲 [nm]
 *                     逆線分散 d·cos β/f、分解能の目安 = 逆線分散 × max(スリットの像, 2 画素)
 *   fibum ファイバのコア [µm]・nafib ファイバの NA・fnum 分光器の F 数
 *                     入る割合 = スリットが切り出す面積の割合 × (NA分光器/NAファイバ)²
 *   ne 1 画素に貯める電子・navg 平均の回数・tint 1 回の露光 [ms]   δA = 0.434/√(ne·navg)
 *   slope 測る場所の吸収スペクトルの傾き [AU/nm]・dlcal 波長の校正の残差 [nm]
 *                     波長のずれの誤差 = slope × dlcal、合わせた不確かさは二乗和
 *
 * 【約束】数値はすべてこの式から導出できる。乱数は使わない。
 * 【モデルの外】点像の形・画素の間の電荷の漏れ・EM-CCD の増倍率の温度依存・クロック誘起電荷・
 * パイルアップの厳密な形・大気の減衰・物体の傾き・格子の効率の波長依存・迷光の分布は入れていない。
 * 目の安全（IEC 60825-1 の AEL）は計算しない ― 規格の手順で計算し直す項目（第8部 12）。
 */
(function (global) {
  'use strict';
  var DG = global.DG || (global.DG = {});

  var H = 6.62607015e-34, C = 2.99792458e8, HC_EVNM = 1239.84, QE_J = 1.602176634e-19;
  var RAD = Math.PI / 180;

  function defaults() {
    return {
      /* A カメラ */
      phot: 2e5, na: 1.4, nimm: 1.518, topt: 0.5, qe: 0.8, texp: 10,
      npix: 9, sigr: 1.6, bgr: 500, dark25: 10, dtc: 40, emccd: 0,
      fwc: 30000, nbit: 16, pxw: 2048, pxh: 2048, fps: 100, link: 12.5,
      qmax: 10, dtmax: 70, qload: 1.5,
      /* B LiDAR */
      ppk: 20, pw: 5, lnm: 940, rho: 0.1, dap: 25, rng: 200, topt2: 0.8, pde: 0.2,
      esun: 0.3, dlf: 20, ifov: 0.1, taud: 10, frep: 100, npulse: 1, jit: 0.1,
      /* C 分光器 */
      lpmm: 400, alpha: 15, fmm: 50, slitum: 25, pxum: 25, npx: 512, lamlo: 400, lamhi: 1000,
      fibum: 200, nafib: 0.22, fnum: 4,
      ne: 1e5, navg: 100, tint: 5, slope: 0.01, dlcal: 0.1,
      /* D PET（第10部 10）*/
      egam: 511, ly: 30, lcol: 0.3, pdep: 0.3, pct: 0.05, rint: 8, ncell: 14400,
      lwin: 425, latt: 12, lcr: 20, wcoin: 4, sing: 1e5, ctr: 200, fov: 70, tdec: 40, rch: 1e6,
      /* E 蛍光寿命（第10部 11）*/
      tauf: 2.5, fflim: 40, mu: 0.01, nphf: 1e4, npxl: 256, dcr: 100
    };
  }

  /* ---- A ---- */

  function camera(d) {
    var theta = Math.asin(Math.min(1, d.na / d.nimm));
    var collect = (1 - Math.cos(theta)) / 2;
    var t = d.texp / 1000;
    var S = d.phot * collect * d.topt * d.qe * t;
    var darkRate = d.dark25 * Math.pow(2, -d.dtc / 9);
    var B = d.npix * (d.bgr + darkRate) * t;           /* 背景と暗電流（どちらもショット雑音） */
    var rn2 = d.npix * d.sigr * d.sigr;
    var snrS = S / Math.sqrt(S + B + rn2);
    var snrE = S / Math.sqrt(2 * (S + B));
    var lsb = d.fwc / Math.pow(2, d.nbit);
    return {
      thetaDeg: theta / RAD, collect: collect, S: S, B: B, rn2: rn2,
      snrS: snrS, snrE: snrE, snr: d.emccd ? snrE : snrS,
      cross: rn2,                                        /* S + B = npix·σr² で入れ替わる */
      darkRate: darkRate, darkExp: darkRate * t,         /* 1 画素・1 露光の暗電流 [e⁻] */
      drDb: 20 * Math.log10(d.fwc / d.sigr), lsb: lsb, qnoise: lsb / Math.sqrt(12),
      gbps: d.pxw * d.pxh * d.nbit * d.fps / 1e9,
      gbPerMin: d.pxw * d.pxh * d.nbit * d.fps * 60 / 8 / 1e9,
      qc: d.qmax * (1 - d.dtc / d.dtmax)
    };
  }

  /* ---- B ---- */

  function lidar(d) {
    var hv = HC_EVNM / d.lnm * QE_J;                     /* J */
    var Ep = d.ppk * d.pw * 1e-9;
    var nph = Ep / hv;
    var A = Math.PI * Math.pow(d.dap / 2000, 2);         /* m² */
    var geo = d.rho / Math.PI * A / (d.rng * d.rng);
    var nsig = nph * geo * d.topt2 * d.pde;
    var omega = Math.pow(d.ifov * RAD, 2);
    var pbg = d.esun * d.dlf * d.rho / Math.PI * A * omega;
    var rbg = pbg / hv * d.topt2 * d.pde;               /* 検出される背景 [/s] */
    var rtd = rbg * d.taud * 1e-9;
    var bgWin = rbg * d.pw * 1e-9;                       /* 反射の山と同じ幅の窓の中の背景 */
    var sig1ns = Math.sqrt(Math.pow(d.pw / 2.355, 2) + d.jit * d.jit);
    var sig1cm = C * sig1ns * 1e-9 / 2 * 100;
    var ntot = nsig * d.npulse;
    return {
      hvEv: HC_EVNM / d.lnm, epNj: Ep * 1e9, nph: nph, areaCm2: A * 1e4, geo: geo, nsig: nsig,
      pbg: pbg, rbg: rbg, rtd: rtd, counted: rbg / (1 + rtd), bgWin: bgWin,
      snr1: nsig / Math.sqrt(nsig + bgWin),
      snrN: Math.sqrt(d.npulse) * nsig / Math.sqrt(nsig + bgWin),
      sig1ns: sig1ns, sig1cm: sig1cm, ntot: ntot, sigNcm: sig1cm / Math.sqrt(Math.max(ntot, 1e-30)),
      tptMs: d.npulse / d.frep,                          /* frep は kHz なので ms */
      runambM: C / (2 * d.frep * 1e3), tofUs: 2 * d.rng / C * 1e6, binCm: C * 1e-9 / 2 * 100
    };
  }

  /* ---- C ---- */

  function betaDeg(d, lamNm) {
    var dnm = 1e6 / d.lpmm;
    var s = lamNm / dnm - Math.sin(d.alpha * RAD);
    return Math.abs(s) <= 1 ? Math.asin(s) / RAD : NaN;
  }

  function spectro(d) {
    var dnm = 1e6 / d.lpmm;
    var lc = (d.lamlo + d.lamhi) / 2;
    var bc = betaDeg(d, lc);
    function xmm(l) { return d.fmm * Math.tan((betaDeg(d, l) - bc) * RAD); }
    var xlo = xmm(d.lamlo), xhi = xmm(d.lamhi);
    var sensor = d.npx * d.pxum / 1000;
    var recip = dnm * Math.cos(bc * RAD) / d.fmm;        /* nm/mm（中心の波長で） */
    var pxnm = recip * d.pxum / 1000;
    var res = recip * Math.max(d.slitum, 2 * d.pxum) / 1000;
    var core = Math.PI / 4 * d.fibum * d.fibum;
    var slitFrac = Math.min(1, d.slitum * d.fibum / core);
    var naSp = 1 / (2 * d.fnum);
    var angFrac = Math.min(1, Math.pow(naSp / d.nafib, 2));
    var dA1 = 0.4343 / Math.sqrt(d.ne);
    var dAavg = dA1 / Math.sqrt(d.navg);
    var calErr = d.slope * d.dlcal;
    return {
      dnm: dnm, lc: lc, betaC: bc, betaLo: betaDeg(d, d.lamlo), betaHi: betaDeg(d, d.lamhi),
      xlo: xlo, xhi: xhi, span: xhi - xlo, sensor: sensor,
      fits: isFinite(xlo) && isFinite(xhi) && Math.abs(xlo) <= sensor / 2 && Math.abs(xhi) <= sensor / 2,
      recip: recip, pxnm: pxnm, res: res,
      overlap: d.lamhi >= 2 * d.lamlo,                   /* 2 次の lamlo が 1 次の範囲に来る */
      slitFrac: slitFrac, angFrac: angFrac, thru: slitFrac * angFrac, naSp: naSp,
      dA1: dA1, dAavg: dAavg, tmeasS: d.navg * d.tint / 1000, calErr: calErr,
      uA: Math.sqrt(dAavg * dAavg + calErr * calErr),
      xmm: xmm
    };
  }

  /* ---- D PET の検出器モジュール（第10部 10）----
   *   光電子 = E·光量·集光·検出効率、統計 = 2.355√((1+P_ct)/N)、分解能 = 統計 ⊕ 固有（二乗和、FWHM）
   *   MPPC の飽和 = 1 − N_cell(1 − e^(−N/N_cell))/N
   *   窓の下限で落とせる散乱の角: cos θ = 1 − 511·(1/E_win − 1/E)（コンプトン）。本物を残す割合 = Φ((E − E_win)/σ)
   *   止まる = 1 − e^(−長さ/減衰長)、偶発同時計数 = W·S₁·S₂、窓の下限 = 視野の直径/c、TOF = c·Δt/2、
   *   パイルアップ = 1 − e^(−r·5τ)（発光の減衰の 5 倍を積分する）
   */
  function ncdf(z) {                                    /* 標準正規の累積（Abramowitz & Stegun 7.1.26、誤差 1.5×10⁻⁷） */
    var x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    var er = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return z >= 0 ? 0.5 * (1 + er) : 0.5 * (1 - er);
  }

  function pet(d) {
    var npe = d.egam * d.ly * d.lcol * d.pdep;
    var stat = 2.355 * Math.sqrt((1 + d.pct) / npe) * 100;          /* % FWHM */
    var res = Math.sqrt(stat * stat + d.rint * d.rint);
    var x = npe / d.ncell;
    var sat = 1 - (1 - Math.exp(-x)) / x;
    var sigma = res / 100 * d.egam / 2.355;                           /* keV */
    var cth = 1 - 511 * (1 / d.lwin - 1 / d.egam);
    var cns = C * 1e-7;                                               /* cm/ns */
    var stop1 = 1 - Math.exp(-d.lcr / d.latt);
    return {
      npe: npe, statPct: stat, resPct: res, satPct: sat * 100, sigmaKeV: sigma,
      keep: ncdf((d.egam - d.lwin) / sigma),
      thetaCut: Math.abs(cth) <= 1 ? Math.acos(cth) / RAD : NaN,
      stop1: stop1, stop2: stop1 * stop1,
      randoms: d.wcoin * 1e-9 * d.sing * d.sing, wminNs: d.fov / cns,
      tofCm: cns * d.ctr / 1000 / 2, pile: 1 - Math.exp(-d.rch * 5 * d.tdec * 1e-9)
    };
  }

  /* ---- E 蛍光寿命・TCSPC（第10部 11）----
   *   周期 T = 1/f、持ち越し = e^(−T/τ)/(1 − e^(−T/τ))
   *   1 パルスで検出がある確率 1 − e^(−µ)、計数 = f(1 − e^(−µ))、パイルアップ（2 個以上だった検出の割合）= (1 − e^(−µ) − µe^(−µ))/(1 − e^(−µ)) ≈ µ/2
   *   1 画素の時間 = 光子/計数、画像 = 画素数 × それ、寿命の精度 ≈ 1/√N（背景なし・IRF が細い理想）
   */
  function flim(d) {
    var T = 1000 / d.fflim;                                           /* ns */
    var r = Math.exp(-T / d.tauf);
    var pdet = 1 - Math.exp(-d.mu);
    var rate = d.fflim * 1e6 * pdet;
    var tpix = d.nphf / rate;
    return {
      Tns: T, carry: r / (1 - r), pdet: pdet, rate: rate,
      pile: (pdet - d.mu * Math.exp(-d.mu)) / pdet,
      tpixMs: tpix * 1000, timgS: tpix * d.npxl * d.npxl,
      prec: 1 / Math.sqrt(d.nphf), dcrRatio: d.dcr / rate
    };
  }

  function evaluate(d) {
    return { cam: camera(d), lid: lidar(d), sp: spectro(d), pe: pet(d), fl: flim(d) };
  }

  /** SNR と信号の関係（sCMOS と EM-CCD）。背景は今の設計の B をそのまま使う */
  function snrSweep(d, n) {
    n = n || 120;
    var c = camera(d), out = [];
    for (var i = 0; i <= n; i++) {
      var S = Math.pow(10, -1 + 5 * i / n);               /* 0.1〜10⁴ e⁻ */
      out.push({ S: S, s: S / Math.sqrt(S + c.B + c.rn2), e: S / Math.sqrt(2 * (S + c.B)) });
    }
    return out;
  }

  /** 距離と 1 パルスの検出数（信号は 1/R²、背景は距離によらない） */
  function rangeSweep(d, n) {
    n = n || 100;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var R = Math.pow(10, 1 + 1.5 * i / n);              /* 10〜316 m */
      var dd = {}, k; for (k in d) dd[k] = d[k];
      dd.rng = R;
      out.push({ R: R, n: lidar(dd).nsig });
    }
    return out;
  }

  DG.sys = {
    H: H, C: C, HC_EVNM: HC_EVNM,
    defaults: defaults, evaluate: evaluate, camera: camera, lidar: lidar, spectro: spectro,
    pet: pet, flim: flim, ncdf: ncdf,
    betaDeg: betaDeg, snrSweep: snrSweep, rangeSweep: rangeSweep
  };
})(typeof window !== 'undefined' ? window : globalThis);
