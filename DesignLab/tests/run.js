/* モデルの単体検査 ― 式が第10部の数字どおりであること
 *
 *   node tests/run.js
 */
'use strict';
const { load, T, ok, near, within, report } = require('./harness.js');
const { DG } = load();
const M = DG.sys;

function d(patch) { return Object.assign(M.defaults(), patch || {}); }
const cam = (p) => M.camera(d(p)), lid = (p) => M.lidar(d(p)), sp = (p) => M.spectro(d(p));

T('A-1 光の予算 ― 第10部 02', () => {
  const c = cam();
  near('受け入れの半角 67.3°', c.thetaDeg, 67.26, 0.05);
  near('集める割合 30.7%', c.collect, 0.307, 0.001);
  within('10 ms で 245 電子', c.S, 245, 1.005);
  near('例題: NA 0.95 の乾燥系は 34.4%', cam({ na: 0.95, nimm: 1 }).collect, 0.344, 0.001);
  ok('集める割合は 1/2 を超えない', cam({ na: 1.518, nimm: 1.518 }).collect <= 0.5 + 1e-12);
});

T('A-2 雑音と選定 ― 第10部 03', () => {
  const c = cam();
  near('背景 9 画素ぶん 45 e⁻（暗電流は 0.04 e⁻）', c.B, 45.04, 0.01);
  near('読み出し 9 × 1.6² = 23.04', c.rn2, 23.04, 1e-9);
  near('sCMOS の SN 比 13.9', c.snrS, 13.9, 0.05);
  near('EM-CCD の SN 比 10.2', c.snrE, 10.2, 0.05);
  const ex = cam({ phot: 2e4, texp: 1, bgr: 0 });
  near('例題: 2.45 e⁻ の sCMOS 0.49', ex.snrS, 0.49, 0.006);
  near('例題: 2.45 e⁻ の EM-CCD 1.11', ex.snrE, 1.11, 0.005);
  near('交差点 9σr² ≈ 23 e⁻', c.cross, 23.04, 1e-9);
  near('くわしく: σr 1.0 で交差点 9', cam({ sigr: 1 }).cross, 9, 1e-9);
  near('くわしく: 25 画素で交差点 64', cam({ npix: 25 }).cross, 64, 1e-9);
  /* 交差点の定義どおり、S + B = 画素数·σr² で 2 つの SN 比が等しい */
  const x = cam({ bgr: 0, phot: 23.04 / (0.3067 * 0.5 * 0.8 * 0.01) });
  within('交差点で sCMOS と EM-CCD が等しい', x.snrS, x.snrE, 1.01);
  ok('センサの種類で snr が切り替わる', cam({ emccd: 1 }).snr === cam({ emccd: 1 }).snrE && cam().snr === cam().snrS);
});

T('A-3 読み出し・データ・冷却 ― 第10部 04', () => {
  const c = cam();
  near('ダイナミックレンジ 85.5 dB', c.drDb, 85.5, 0.05);
  near('16 ビットの 1 LSB 0.46 e⁻', c.lsb, 0.458, 0.001);
  near('量子化の雑音 0.13 e⁻', c.qnoise, 0.132, 0.001);
  near('2048² × 16 × 100 = 6.7 Gb/s', c.gbps, 6.71, 0.01);
  near('1 分で 50 GB', c.gbPerMin, 50.3, 0.1);
  near('TEC 10 W・70 K で 40 K 冷やすと 4.3 W', c.qc, 4.29, 0.01);
  near('40 K 冷やすと暗電流 0.46 e⁻/s（本文の仮定 0.5 と同じ桁）', c.darkRate, 0.459, 0.002);
  within('暗電流は 9 K で半分', cam({ dtc: 49 }).darkRate, c.darkRate / 2, 1.0001);
});

T('B-1 戻る光子 ― 第10部 05', () => {
  const l = lid();
  near('940 nm の光子 1.32 eV', l.hvEv, 1.319, 0.001);
  within('100 nJ は 4.73×10¹¹ 個', l.nph, 4.73e11, 1.002);
  near('受光口 4.91 cm²', l.areaCm2, 4.909, 0.001);
  within('戻る割合 3.9×10⁻¹⁰', l.geo, 3.906e-10, 1.002);
  within('200 m で 29.6 個', l.nsig, 29.6, 1.003);
  within('100 m で 118 個', lid({ rng: 100 }).nsig, 118.3, 1.003);
  within('50 m で 473 個', lid({ rng: 50 }).nsig, 473, 1.003);
  within('例題: 反射率 80% で 237 個', lid({ rho: 0.8 }).nsig, 236.7, 1.003);
  within('例題: 300 m に 2.25 倍のエネルギー（225 nJ）で 29.6 個のまま', lid({ rng: 300, ppk: 45 }).nsig, 29.6, 1.003);
  near('往復 1.33 µs', l.tofUs, 1.334, 0.001);
  near('1 ns は 15 cm', l.binCm, 14.99, 0.01);
  within('100 kHz であいまいさのない距離 1.5 km', l.runambM, 1499, 1.001);
});

T('B-2 背景光と SPAD ― 第10部 06', () => {
  const l = lid();
  within('背景の電力 2.9×10⁻¹⁰ W', l.pbg, 2.856e-10, 1.003);
  within('背景 2.16×10⁸ /s', l.rbg, 2.16e8, 1.003);
  near('r·τd 2.16', l.rtd, 2.16, 0.005);
  within('数えられるのは 6.8×10⁷ /s', l.counted, 6.8e7, 1.01);
  near('最初の設計の床 1.08 個（5 ns の窓）', l.bgWin, 1.08, 0.005);
  const im = lid({ dlf: 10, ifov: 0.05 });
  within('改善後 2.7×10⁷ /s', im.rbg, 2.7e7, 1.003);
  near('改善後 r·τd 0.27', im.rtd, 0.27, 0.001);
  near('改善後の床 0.135 個', im.bgWin, 0.135, 0.001);
  near('1 パルスの SN 比 5.4', im.snr1, 5.4, 0.05);
  near('100 パルスで 54', lid({ dlf: 10, ifov: 0.05, npulse: 100 }).snrN, 54, 0.5);
  near('信号は視野とフィルタで変わらない', im.nsig, l.nsig, 1e-9);
  near('例題: 40 ns で r·τd 1.08', lid({ dlf: 10, ifov: 0.05, taud: 40 }).rtd, 1.08, 0.005);
  near('例題: 夜（背景 1/1000）は 0.001', lid({ dlf: 10, ifov: 0.05, taud: 40, esun: 0.0003 }).rtd, 0.00108, 0.0001);
});

T('B-3 精度と速さ ― 第10部 07', () => {
  const l = lid();
  near('1 光子のばらつき 2.13 ns', l.sig1ns, 2.125, 0.002);
  near('距離で 32 cm', l.sig1cm, 31.9, 0.1);
  near('30 個で 5.8 cm', l.sig1cm / Math.sqrt(30), 5.82, 0.02);
  near('300 個で 1.8 cm', l.sig1cm / Math.sqrt(300), 1.84, 0.01);
  near('3000 個で 0.58 cm', l.sig1cm / Math.sqrt(3000), 0.582, 0.003);
  ok('例題: 2 cm には 256 個 → 9 パルス（8 では足りない）',
     lid({ npulse: 9 }).sigNcm <= 2 && lid({ npulse: 8 }).sigNcm > 2);
  near('9 パルスを 100 kHz で 0.09 ms', lid({ npulse: 9 }).tptMs, 0.09, 1e-12);
  near('100 パルスで 1 点 1 ms', lid({ npulse: 100 }).tptMs, 1, 1e-12);
});

T('C-1 分光器の光学 ― 第10部 08', () => {
  const p = sp();
  near('d = 2,500 nm', p.dnm, 2500, 1e-9);
  near('400 nm の回折角 −5.7°', p.betaLo, -5.67, 0.02);
  near('700 nm の回折角 1.2°', p.betaC, 1.21, 0.02);
  near('1,000 nm の回折角 8.1°', p.betaHi, 8.12, 0.02);
  near('400 nm は −6.04 mm', p.xlo, -6.04, 0.01);
  near('1,000 nm は +6.05 mm', p.xhi, 6.05, 0.01);
  near('全長 12.1 mm', p.span, 12.09, 0.01);
  ok('12.8 mm に収まる', p.fits);
  near('逆線分散 50 nm/mm', p.recip, 50, 0.05);
  near('1 画素 1.25 nm', p.pxnm, 1.25, 0.002);
  near('分解能の目安 2.5 nm', p.res, 2.5, 0.002);
  ok('400〜1,000 nm は 2 次が重なる', p.overlap);
  ok('500〜900 nm なら重ならない', !sp({ lamlo: 500, lamhi: 900 }).overlap);
  near('スリットが切り出す 16%', p.slitFrac, 0.159, 0.001);
  near('角度で 32%', p.angFrac, 0.323, 0.001);
  near('合わせて約 5%', p.thru, 0.0514, 0.0005);
  ok('入る光は 100% を超えない', sp({ slitum: 2000, fnum: 0.5 }).thru <= 1 + 1e-12);
  ok('格子方程式が解けない本数は収まらない扱い', !sp({ lpmm: 5000 }).fits);
});

T('C-2 吸光度の雑音 ― 第10部 09', () => {
  const p = sp();
  near('10⁵ 電子で δA 0.0014', p.dA1, 0.00137, 0.00001);
  near('100 回で 1.4×10⁻⁴', p.dAavg, 1.37e-4, 1e-6);
  near('例題: 0.01 AU/nm × 0.1 nm = 0.001', p.calErr, 0.001, 1e-12);
  ok('例題: 波長のずれはショット雑音の約 7 倍', p.calErr / p.dAavg > 7 && p.calErr / p.dAavg < 7.5);
  near('100 回 × 5 ms = 0.5 s', p.tmeasS, 0.5, 1e-12);
});

T('図のための掃引', () => {
  const s = M.snrSweep(d(), 40);
  ok('SN 比の掃引は 41 点', s.length === 41);
  ok('信号が増えると SN 比も増える', s.every((p, i) => i === 0 || p.s > s[i - 1].s));
  const r = M.rangeSweep(d(), 20);
  ok('距離が増えると検出数は減る', r.every((p, i) => i === 0 || p.n < r[i - 1].n));
  within('距離の掃引は 1/R²', r[0].n * Math.pow(r[0].R / r[20].R, 2), r[20].n, 1.0001);
});

report();
