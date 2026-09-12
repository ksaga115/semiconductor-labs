/* モデルの単体検査 ― 式が教科書どおりであること
 *
 *   node tests/run.js
 */
'use strict';
const { load, T, ok, eq, near, within, report } = require('./harness.js');
const { QA } = load();
const M = QA.qa;

function evalWith(patch) {
  const d = M.defaults();
  for (const k in patch) d[k] = patch[k];
  return { d, ev: M.evaluate(d) };
}

T('FIT と MTTF', () => {
  const { ev } = evalWith({ fitr: 100, nser: 100 });
  near('系の FIT は足し算', ev.lamFit, 10000, 1e-9);
  near('MTTF = 1e9/λ', ev.mttfH, 1e5, 1e-6);
  within('年に直すと 11.4', ev.mttfY, 11.4, 1.01);
  const half = evalWith({ fitr: 50, nser: 100 }).ev;
  near('FIT 半分で MTTF 2倍', half.mttfY / ev.mttfY, 2, 1e-9);
});

T('アレニウス加速', () => {
  /* 0.7eV・55→125℃ の定番: AF ≒ 78 */
  const { ev } = evalWith({ ea: 0.7, tuse: 55, tstr: 125 });
  within('AF(0.7eV, 55→125) ≒ 78', ev.af, 78, 1.02);
  const hot = evalWith({ ea: 0.7, tuse: 55, tstr: 150 }).ev;
  within('150℃ なら ≒ 260', hot.af, 260, 1.03);
  /* Ea が大きいほど加速が効く */
  ok('Ea 1.0eV の方が加速が効く', evalWith({ ea: 1.0 }).ev.af > ev.af);
  /* 試験時間 = 寿命/AF */
  near('10年/AF', hot.testH, 10 * 8760 / hot.af, 1e-6);
  /* 同温なら AF=1 */
  near('同温で AF=1', evalWith({ tstr: 55 }).ev.af, 1, 1e-9);
});

T('ワイブル', () => {
  const m1 = evalWith({ mweib: 1, etah: 10000 }).ev;
  near('m=1 の B10 = 0.105η', m1.b10H, 10000 * 0.1053605, 1);
  const m2 = evalWith({ mweib: 2, etah: 10000 }).ev;
  near('m=2 の B10 = 0.325η', m2.b10H, 10000 * Math.sqrt(0.1053605), 1);
  ok('同じ η でも m が大きいほど B10 は長い', m2.b10H > m1.b10H);
});

T('熱と TEC', () => {
  const { ev } = evalWith({ pwr: 2, tamb: 40, thjc: 1.5, thcs: 0.5, thsa: 20.5 });
  near('Tj = Tamb + PΣθ', ev.tj, 40 + 2 * 22.5, 1e-9);
  const t = evalWith({ qmax: 5, dtmax: 70, dtc: 50 }).ev;
  near('Qc = Qmax(1−ΔT/ΔTmax)', t.qc, 5 * (1 - 50 / 70), 1e-9);
  near('ΔTmax で吸熱ゼロ', evalWith({ dtc: 70 }).ev.qc, 0, 1e-9);
  ok('負荷を超えれば冷える判定', evalWith({ dtc: 50, qload: 1.2 }).ev.tecOk);
  ok('負荷を下回れば負け判定', !evalWith({ dtc: 60, qload: 1.2 }).ev.tecOk);
});

T('Peck と Coffin-Manson', () => {
  /* 85/85 の定番: 40℃60% 使用・n=3・Ea0.79 → AF ≒ 113、10年 ≒ 778h */
  const { ev } = evalWith({ thu: 40, rhu: 60, ths: 85, rhs: 85, npeck: 3, eah: 0.79, lifey: 10 });
  within('85/85 の AF ≒ 113', ev.afh, 113, 1.02);
  within('10年 ≒ 778 h', ev.testHh, 778, 1.02);
  /* 湿度が同じなら純アレニウス */
  const t = evalWith({ thu: 40, rhu: 60, ths: 85, rhs: 60, npeck: 3, eah: 0.79 }).ev;
  near('RH 同じなら AF = exp 項のみ', t.afh, Math.exp(0.79 / M.KB_EV * (1 / 313.15 - 1 / 358.15)), 1e-6);
  /* RH 比のべき乗 */
  near('湿度の分は (85/60)³', ev.afh / t.afh, Math.pow(85 / 60, 3), 1e-9);
  /* C-M: (165/30)² = 30.25、3650回 → 120.7回 */
  const c = evalWith({ dtu: 30, dts: 165, ncm: 2, cyd: 1, lifey: 10 }).ev;
  near('AF = (165/30)²', c.afcm, 30.25, 1e-9);
  near('使用サイクル = 10年×365', c.cycUse, 3650, 1e-9);
  within('必要 121 回', c.testCyc, 120.7, 1.01);
  /* ΔT を倍にすると回数は 1/4 */
  const c2 = evalWith({ dtu: 30, dts: 120, ncm: 2, cyd: 1 }).ev;
  const c1 = evalWith({ dtu: 30, dts: 60, ncm: 2, cyd: 1 }).ev;
  near('ΔT ×2 で回数 1/4', c2.testCyc / c1.testCyc, 0.25, 1e-9);
});

T('Cpk と ppm ― 正規分布の検算', () => {
  /* Φ の実装が正しいことを既知の点で確かめる */
  near('Φ(0) = 0.5', M.phi(0), 0.5, 1e-7);
  near('Φ(3) = 0.99865', M.phi(3), 0.99865, 2e-5);
  near('Φ(1.96) = 0.975', M.phi(1.96), 0.975, 2e-4);
  /* Cpk=1（ずれ0・±3σ）→ 両側 2700 ppm という教科書の数字 */
  const c1 = evalWith({ sigma: 0.1, muoff: 0, tol: 0.3 }).ev;
  near('Cpk=1', c1.cpk, 1, 1e-9);
  within('2700 ppm', c1.ppm, 2700, 1.05);
  /* Cpk=1.33（±4σ）→ 63 ppm */
  const c2 = evalWith({ sigma: 0.1, muoff: 0, tol: 0.4 }).ev;
  within('Cpk 1.33（±4σ）で 63ppm', c2.ppm, 63, 1.1);
  /* 誤差伝播: 3-4-5 */
  near('√(0.3²+0.4²)=0.5', evalWith({ s1: 0.3, s2: 0.4 }).ev.stot, 0.5, 1e-9);
});

report();
