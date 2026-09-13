/* モデルの単体検査 ― 式が第9部の数字どおりであること
 *
 *   node tests/run.js
 */
'use strict';
const { load, T, ok, near, within, report } = require('./harness.js');
const { LS } = load();
const M = LS.laser;

function evalWith(patch) {
  const d = M.defaults();
  for (const k in patch) d[k] = patch[k];
  return { d, ev: M.evaluate(d) };
}

T('熱放射 ― 第9部 01 の数字', () => {
  near('2,856 K の山は 1.01 µm', evalWith({ tk: 2856 }).ev.lamMaxUm, 1.0146, 0.001);
  near('300 K の山は 9.66 µm', evalWith({ tk: 300 }).ev.lamMaxUm, 9.659, 0.002);
  within('2,856 K の可視は 6.5%', evalWith({ tk: 2856 }).ev.vis, 0.0654, 1.01);
  within('3,200 K の可視は 10.5%', evalWith({ tk: 3200 }).ev.vis, 0.1047, 1.01);
  within('5,778 K の可視は 37%', evalWith({ tk: 5778 }).ev.vis, 0.367, 1.01);
  within('σT⁴（2,856 K で 377 W/cm²）', evalWith({ tk: 2856 }).ev.Mwcm2, 377, 1.005);
  ok('温度を上げると可視が増える', evalWith({ tk: 3400 }).ev.vis > evalWith({ tk: 3200 }).ev.vis);
});

T('LED ― 効率の掛け算（第9部 03 の例題）', () => {
  const { ev } = evalWith({ etainj: 0.95, iqe: 0.8, extr: 0.6, lednm: 450, vf: 3.0 });
  near('EQE = 0.95 × 0.8 × 0.6', ev.eqe, 0.456, 1e-12);
  within('電力の効率 0.42', ev.wpe, 0.42, 1.005);
  near('hν = 1239.84/450', ev.hvLed, 1239.84 / 450, 1e-12);
});

T('しきい値とスロープ効率 ― 第9部 04・05 の例題', () => {
  const { ev } = evalWith({ r1: 0.31, r2: 0.31, lum: 300, ai: 10, etai: 0.9, lasnm: 850 });
  within('鏡の損失 39 cm⁻¹', ev.am, 39.0, 1.003);
  within('しきい値の利得 49 cm⁻¹', ev.gth, 49.0, 1.003);
  within('微分量子効率 0.72', ev.etad, 0.7165, 1.002);
  within('スロープ効率 1.05 W/A', ev.slope, 1.045, 1.002);
  near('両端が同じなら前から半分', ev.front, 0.5, 1e-12);
  const hr = evalWith({ r1: 0.31, r2: 0.95, lum: 300, ai: 10 }).ev;
  within('後ろ 95% でしきい値 30 cm⁻¹（例題）', hr.gth, 30.4, 1.003);
  ok('後ろを高反射にすると前から多く出る', hr.front > 0.9);
  const hot = evalWith({ ith25: 10, t0: 60, tempc: 85 }).ev;
  within('T₀ 60 K で 85 ℃ のしきい値 27 mA', hot.ith, 27.18, 1.001);
  within('T₀ 150 K なら 15 mA', evalWith({ ith25: 10, t0: 150, tempc: 85 }).ev.ith, 14.92, 1.001);
  near('しきい値より下では出力ゼロ', evalWith({ iop: 5, tempc: 25, ith25: 10 }).ev.pmw, 0, 1e-12);
});

T('縦モード・DFB・パルス ― 第9部 06・07・09 の数字', () => {
  within('1550 nm・n_g 3.6・300 µm で 1.11 nm', evalWith({ lasnm: 1550, ng: 3.6, lum: 300 }).ev.fsrNm, 1.112, 1.002);
  near('ブラッグ波長 2 × 3.2 × 242 = 1548.8 nm', evalWith({ neff: 3.2, pitchnm: 242, tempc: 25 }).ev.lamB, 1548.8, 1e-9);
  near('13.2 K 上げて 1550.12 nm', evalWith({ neff: 3.2, pitchnm: 242, dldt: 0.1, tempc: 38.2 }).ev.lamT, 1550.12, 1e-9);
  within('1.875 m で 80 MHz', evalWith({ lcavm: 1.875 }).ev.frep, 79.94e6, 1.001);
  within('800 nm・9.41 nm で 100 fs', evalWith({ mlnm: 800, dlnm: 9.41 }).ev.tauFs, 100, 1.002);
  const p = evalWith({ lcavm: 1.875, mlnm: 800, dlnm: 9.41, pavg: 1 }).ev;
  within('1 W で 12.5 nJ', p.epNj, 12.5, 1.002);
  within('尖頭値は約 117 kW（0.94E/Δt）', p.ppeakKw, 117.5, 1.01);
});

T('第4章 ― 緩和振動・SHG・ファイバ結合', () => {
  /* 緩和振動: 減衰を無視した応答 f_R²/(f_R² − f²) の −3 dB は √(1+√2)·f_R */
  const r = evalWith({ tempc: 85, iop: 42 }).ev;
  near('f_3dB / f_R = √(1+√2)', r.f3 / r.fR, Math.sqrt(1 + Math.SQRT2), 1e-12);
  near('√(1+√2) = 1.5538', Math.sqrt(1 + Math.SQRT2), 1.55377, 1e-5);
  within('85 ℃・42 mA で f_R 5.77 GHz', r.fR, 5.774, 1.001);
  ok('√(I − I_th) に比例: 差を 4 倍にすると f_R は 2 倍',
     Math.abs(evalWith({ tempc: 25, iop: 10 + 36 }).ev.fR / evalWith({ tempc: 25, iop: 10 + 9 }).ev.fR - 2) < 1e-12);
  near('しきい値より下では f_R = 0', evalWith({ tempc: 85, iop: 20 }).ev.fR, 0, 1e-12);
  near('10 Gb/s の目安は 7 GHz', r.fNeed, 7, 1e-12);
  within('85 ℃ で帯域 7 GHz の電流は 36.2 mA', 10 * Math.E + Math.pow(7 / (1.5 * Math.sqrt(1 + Math.SQRT2)), 2), 36.20, 1.001);

  /* SHG: sinc² の半値と許容幅 */
  near('sinc²(1.39156) = 0.5', M.sinc2(M.SINC_HALF), 0.5, 1e-5);
  near('揺れ 0 なら sinc² = 1', evalWith({ shgdT: 0 }).ev.shgS2, 1, 1e-12);
  const a = evalWith({ shgL: 2.5, shgdT: 0.2 }).ev;
  near('許容幅 FWHM × 長さ = 1.0 ℃·cm', a.shgTol * 2.5, 1.0, 1e-12);
  near('揺れが半値幅の半分なら、ちょうど半分に落ちる', evalWith({ shgL: 2, shgdT: 0.25 }).ev.shgS2, 0.5, 1e-5);
  const p1 = evalWith({ shgP: 0.5 }).ev.p2wMw, p2 = evalWith({ shgP: 1.0 }).ev.p2wMw;
  near('弱い変換: 励起 2 倍で SHG 4 倍（第9部 10 の例題）', p2 / p1, 4, 1e-12);
  within('2.6 cm・1 W・±0.1 ℃ で 21.8 mW', evalWith({ shgL: 2.6, shgP: 1 }).ev.p2wMw, 21.77, 1.001);

  /* ガウスのモードの重なり */
  near('大きさが同じ・ずれなしなら 100%', evalWith({ ldw: 5.2, mag: 1, offum: 0 }).ev.eta, 1, 1e-12);
  within('大きさが同じ・横ずれ 1.5 µm で 92.0%', evalWith({ ldw: 5.2, mag: 1, offum: 1.5 }).ev.eta, 0.9202, 1.0005);
  within('倍率 1（1.6 µm のまま）では 27%', evalWith({ mag: 1 }).ev.eta, 0.2715, 1.001);
  const e1 = evalWith({ ldw: 1, mag: 5.2 * 2, offum: 0 }).ev.etaMM, e2 = evalWith({ ldw: 1, mag: 5.2 / 2, offum: 0 }).ev.etaMM;
  near('大きさの合い具合は、2 倍大きくても 2 倍小さくても同じ（0.64）', e1, e2, 1e-12);
  near('2 倍ずれると 0.64', e1, 0.64, 1e-12);
});

T('第5章 ― 二点の校正・量子欠損・輝度（第9部 02・08・11 の数字）', () => {
  const e = (a, b) => evalWith({ calA: a, calB: b, caltgt: 700, calsig: 0.02 }).ev;
  within('435.83・546.07 nm で 700 nm の誤差 0.0555 nm', e(435.833, 546.074).calErr, 0.05547, 1.002);
  within('365.02・579.07 nm で 0.0333 nm', e(365.015, 579.066).calErr, 0.03331, 1.002);
  ok('2 本の間（450 nm）は外（700 nm）より小さい', evalWith({ calA: 365.015, calB: 579.066, caltgt: 450 }).ev.calErr < e(365.015, 579.066).calErr);
  near('線の上では σ/√… ではなく σ そのもの（a で読む）', evalWith({ calA: 365.015, calB: 579.066, caltgt: 365.015 }).ev.calErr, 0.02, 1e-12);
  ok('輝線の一覧に 546.074 nm がある', M.hgLine(546.07) === 546.074);
  ok('輝線でない波長は線と見なさない', M.hgLine(560) === null);
  const y = evalWith({ pumpnm: 976, signm: 1070, pout: 100 }).ev;
  within('976→1,070 nm の欠損 8.79%', y.qd, 0.08785, 1.001);
  within('100 W で熱 9.63 W（第9部 08 の 9.6 W）', y.heatW, 9.631, 1.001);
  const n = evalWith({ pumpnm: 808, signm: 1064, pout: 100 }).ev;
  within('808→1,064 nm の欠損 24%', n.qd, 0.2406, 1.001);
  within('100 W で熱 31.7 W（第9部 08 の 32 W）', n.heatW, 31.68, 1.001);
  const b = evalWith({ ledP: 1, ledA: 1, fcore: 200, fna: 0.22 }).ev;
  within('1 W・1 mm² のランバート面の輝度 3.18×10⁵', b.radiance, 3.183e5, 1.001);
  within('コア 200 µm・NA 0.22 に 1.52 mW', b.pFibMw, 1.521, 1.001);
  within('NA 0.22 で 1 mW に要るコアは 162.2 µm', evalWith({ fcore: 162.19, fna: 0.22 }).ev.pFibMw, 1.0, 1.001);
  near('入る光はコアの面積に比例（2 倍の径で 4 倍）', evalWith({ fcore: 200 }).ev.pFibMw / evalWith({ fcore: 100 }).ev.pFibMw, 4, 1e-12);
  near('光源がコアより小さいと、光源の面積で頭打ち', evalWith({ ledA: 0.001, fcore: 1000 }).ev.etFib, 1e-9 * Math.PI * 0.22 * 0.22, 1e-20);
});

report();
