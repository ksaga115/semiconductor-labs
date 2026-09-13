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

report();
