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
  /* HAST: 130℃/85% は AF ≒ 1,960 → 45h。85/85 に対する温度の上乗せは 17.4 倍 */
  const h = evalWith({ thu: 40, rhu: 60, ths: 130, rhs: 85, npeck: 3, eah: 0.79, lifey: 10 }).ev;
  within('HAST の AF ≒ 1,960', h.afh, 1958, 1.01);
  within('10年 ≒ 45 h', h.testHh, 44.7, 1.01);
  const thb = evalWith({ thu: 40, rhu: 60, ths: 85, rhs: 85, npeck: 3, eah: 0.79 }).ev;
  within('HAST/THB の比は 17.4（JEDEC 96h↔1000h の中身）', h.afh / thb.afh, 17.4, 1.01);
});

T('GR&R ― 物差しの取り分', () => {
  const { ev } = evalWith({ srpt: 0.007, srpd: 0.006, tol: 0.3 });
  near('σ合成は二乗和', ev.sgrr, Math.sqrt(0.007 * 0.007 + 0.006 * 0.006), 1e-12);
  near('%GR&R = 6σ/(2·tol)', ev.pgrr, 6 * ev.sgrr / 0.6, 1e-12);
  within('9.2 %', ev.pgrr, 0.0922, 1.01);
  /* 繰り返しをゼロにしても再現性の床が残る */
  const floor2 = evalWith({ srpt: 0.0001, srpd: 0.006, tol: 0.3 }).ev;
  within('床は 6 %', floor2.pgrr, 0.06, 1.01);
  ok('床より下には行けない', floor2.pgrr > 0.0599);
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

T('管理図と不確かさ ― 第8部 09・10 の数字', () => {
  const a = evalWith({ klim: 3, ngrp: 1, shsig: 1 }).ev;
  within('3σ の空振りは 370 群に 1 回', a.arl0, 370.4, 1.01);
  within('1 個ずつでは 1σ のずれに 44 点', a.arl1, 43.9, 1.01);
  const b = evalWith({ klim: 3, ngrp: 5, shsig: 1 }).ev;
  within('n = 5 なら 4.5 群（第8部 09 の例題）', b.arl1, 4.5, 1.01);
  const g = evalWith({ ucal: 2, resd: 0.5, srep: 0.5, nrep: 10, tco: 0.2 }).ev;
  within('光パワーメータの予算 u_c = 1.06%（第8部 10）', g.ucg, 1.06, 1.005);
  within('U = 2.1%（k = 2）', g.Ug, 2.12, 1.005);
  const g2 = evalWith({ ucal: 2, resd: 0.5, srep: 0.5, nrep: 1000, tco: 0.2 }).ev;
  ok('校正 2% では平均を増やしても U は 2.08% を切れない', g2.Ug > 2.08);
});

T('Norris-Landzberg ― 周波数と最高温度の補正', () => {
  const base = { dtu: 30, dts: 165, cyd: 1, lifey: 10, tmu: 55, tms: 125, nnl: 1.9, mnl: 1 / 3, eknl: 1414 };
  const same = evalWith(Object.assign({}, base, { cfs: 1 })).ev;
  near('ΔT の項 5.5^1.9', Math.pow(5.5, 1.9), 25.51, 0.01);
  near('最高温度の項 exp(1414(1/328.15−1/398.15))', Math.exp(1414 * (1 / 328.15 - 1 / 398.15)), 2.133, 0.002);
  within('同じ周波数なら AF ≒ 54.4', same.afnl, 54.41, 1.002);
  const h24 = evalWith(Object.assign({}, base, { cfs: 24 })).ev;
  within('24 回/日で AF ≒ 18.9', h24.afnl, 18.86, 1.002);
  within('24 回/日で 194 回', h24.cycNl, 193.5, 1.002);
  within('24 回/日で 8.1 日', h24.daysNl, 8.06, 1.002);
  near('周波数を 8 倍にすると AF は 1/2', evalWith(Object.assign({}, base, { cfs: 8 })).ev.afnl / same.afnl, 0.5, 1e-9);
  near('べき 0・Ea 0・同じ最高温度なら純 C-M', evalWith(Object.assign({}, base, { nnl: 2, mnl: 0, eknl: 0, cfs: 24 })).ev.afnl, 30.25, 1e-9);
});

T('ndc ― 有効区分数（AIAG MSA）', () => {
  const a = evalWith({ tol: 0.3, srpd: 0.006, srpt: 0.005, spv: 0.03 }).ev;
  within('σ測定 0.0078', a.sgrr, 0.00781, 1.002);
  within('ndc 切り捨て前 5.41', a.ndcRaw, 5.416, 1.002);
  eq('ndc は切り捨てて 5', a.ndc, 5);
  within('全変動比 25.2 %', a.pgrrTv, 0.252, 1.005);
  near('ndc ≈ 1.41·√(1−x²)/x（x = 全変動比）', a.ndcRaw, 1.41 * Math.sqrt(1 - a.pgrrTv * a.pgrrTv) / a.pgrrTv, 1e-9);
  const b = evalWith({ tol: 0.3, srpd: 0.006, srpt: 0.007, spv: 0.03 }).ev;
  eq('公差比 9.2 % の物差しでも ndc は 4', b.ndc, 4);
  ok('その物差しは公差比では合格', b.pgrr <= 0.10);
});

T('抜き取りの OC 曲線 ― 二項分布', () => {
  near('Pa(p=0) = 1', M.binCdf(3, 132, 0), 1, 1e-12);
  near('c ≥ n なら必ず合格', M.binCdf(10, 10, 0.3), 1, 1e-12);
  near('c = 0 は (1−p)^n', M.binCdf(0, 50, 0.02), Math.pow(0.98, 50), 1e-12);
  /* 小さな場合を手で: n = 3, c = 1, p = 0.1 → 0.9³ + 3·0.1·0.9² = 0.972 */
  near('n = 3・c = 1・p = 0.1 は 0.972', M.binCdf(1, 3, 0.1), 0.972, 1e-12);
  const a = evalWith({ nsmp: 132, cacc: 3, aql: 1, ltpd: 5 }).ev;
  within('(132, 3) の α 4.43 %', a.alphaAct, 0.0443, 1.01);
  within('(132, 3) の β 9.92 %', a.betaAct, 0.0992, 1.01);
  const sw = M.ocSweep({ nsmp: 132, cacc: 3 }, 0.1, 50);
  ok('OC 曲線は p とともに単調に下がる', sw.every((q, i) => i === 0 || q.pa <= sw[i - 1].pa + 1e-12));
  /* c ≤ 2 はどの n でも両立しない（全探索） */
  let any = false;
  for (let c = 0; c <= 2; c++) for (let n = c + 1; n <= 1000; n++) {
    if (1 - M.binCdf(c, n, 0.01) <= 0.05 && M.binCdf(c, n, 0.05) <= 0.10) any = true;
  }
  ok('c ≤ 2 ではどの n でも α 5%・β 10% を両立しない', !any);
});

report();
