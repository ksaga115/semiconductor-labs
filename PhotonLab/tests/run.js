/* モデルの単体検査 ― 式が教科書どおりであること
 *
 *   node tests/run.js
 */
'use strict';
const { load, T, ok, eq, near, report } = require('./harness.js');
const { PH } = load();
const P = PH.photon;
const Q = 1.602176634e-19;

function evalWith(patch) {
  const d = P.defaults();
  for (const k in patch) d[k] = patch[k];
  return { d, ev: P.evaluate(d) };
}

T('感度と光子数 ― R = ηλ/1240', () => {
  const { ev } = evalWith({ nm: 660, eta: 0.85 });
  near('R(0.85, 660nm)', ev.R, 0.4524, 1e-3);
  /* PMT の教科書の検算: 80mA/W @400nm は QE 25% */
  const c = evalWith({ nm: 400, eta: 0.248 });
  near('陰極感度 80mA/W の検算', c.ev.R, 0.080, 2e-3);
  /* 光子数: 1pW・650nm ≒ 3.27e6 個/s */
  const r = evalWith({ pw: -12, nm: 650 });
  near('1pW・650nm の光子数', r.ev.phi, 1e-12 / ((1240 / 650) * Q), 100);
  ok('波長を伸ばすと同じ 1pW でも個数が増える', evalWith({ pw: -12, nm: 900 }).ev.phi > r.ev.phi);
});

T('過剰雑音 F(M) ― マッキンタイア', () => {
  eq('M=1 なら F=1', P.excess(1, 0.3), 1);
  near('k=0 の極限は 2−1/M', P.excess(100, 0), 2 - 1 / 100, 1e-12);
  near('F(80, 0.02)', P.excess(80, 0.02), 0.02 * 80 + 0.98 * (2 - 1 / 80), 1e-12);
  ok('k が大きいほどうるさい', P.excess(50, 0.4) > P.excess(50, 0.02));
  ok('M を上げると F も上がる', P.excess(200, 0.02) > P.excess(20, 0.02));
});

T('NEP と D* ― 床の算数', () => {
  /* 第5部 04 の手計算: Id=10pA, R=0.5 → NEP ≒ 3.6e-15 */
  const { ev } = evalWith({ nm: 775, eta: 0.8, M: 1, idpa: 10, ifa: 0.001 });
  near('手計算の NEP（10pA, R=0.5）', ev.NEP, Math.sqrt(2 * Q * 10e-12) / 0.5, 1e-3);
  /* 暗電流1桁で NEP は √10 */
  const a = evalWith({ M: 1, idpa: 10, ifa: 0.001 }).ev.NEP;
  const b = evalWith({ M: 1, idpa: 100, ifa: 0.001 }).ev.NEP;
  near('暗電流 ×10 で NEP ×√10', b / a, Math.sqrt(10), 1e-6);
  /* D* は面積の平方根 */
  const d1 = evalWith({ amm2: 1 }).ev.Dstar, d4 = evalWith({ amm2: 4 }).ev.Dstar;
  near('面積 ×4 で D* ×2', d4 / d1, 2, 1e-9);
  /* M でアンプの床が沈む（暗電流を無視できる条件で） */
  const m1 = evalWith({ M: 1, idpa: 0.01, ifa: 100 }).ev.NEP;
  const m10 = evalWith({ M: 10, idpa: 0.01, ifa: 100, k: 0 }).ev.NEP;
  ok('M=10 でアンプ律速の NEP が下がる', m10 < m1 / 3);
});

T('SNR ― 最適な M の山', () => {
  const base = { nm: 900, eta: 0.9, pw: -9, ifa: 1000, bmhz: 100, k: 0.02, idpa: 10 };
  const s1 = evalWith(Object.assign({ M: 1 }, base)).ev.SNR;
  const s80 = evalWith(Object.assign({ M: 80 }, base)).ev.SNR;
  const s300 = evalWith(Object.assign({ M: 300 }, base)).ev.SNR;
  ok('M=1 では埋もれる', s1 < 0.1);
  ok('M=80 で山の上', s80 >= 2);
  ok('M=300 では過剰雑音で下がる', s300 < s80 && s300 < 2);
  /* 掃引でも山が内側にある */
  const sw = P.snrSweep(Object.assign(P.defaults(), base), 1, 300, 60);
  const peak = sw.reduce((a, p) => (p.snr > a.snr ? p : a));
  ok('山の頂上は端ではない', peak.M > 5 && peak.M < 250);
});

T('PMT と MPPC', () => {
  const p = evalWith({ delta: 4, nstg: 10 }).ev;
  near('δ=4・10段の利得', p.pmtM, Math.pow(4, 10), 1e-9);
  near('PMT の過剰雑音 δ/(δ−1)', p.pmtF, 4 / 3, 1e-12);
  ok('δ を上げると F は 1 に近づく', evalWith({ delta: 6, nstg: 10 }).ev.pmtF < p.pmtF);
  const m = evalWith({ ncell: 8000, nph: 2000, eta: 0.4 }).ev;
  near('μ = 光子数 × PDE', m.mu, 800, 1e-9);
  near('発火セル N(1−e^(−μ/N))', m.fired, 8000 * (1 - Math.exp(-0.1)), 1e-6);
  ok('目減りは 5% 弱', m.linerr > 0.04 && m.linerr < 0.05);
  const sat = evalWith({ ncell: 100, nph: 100000, eta: 0.4 }).ev;
  ok('強い光では発火はセル数に張り付く', sat.fired < 100 + 1e-9 && sat.fired > 99);
});

T('RC 帯域', () => {
  const { ev } = evalWith({ cpf: 0.45 });
  near('50Ω・0.45pF ≒ 7.1GHz', ev.fRC, 7.074e9, 1e7);
  near('C を半分にすると帯域は倍', evalWith({ cpf: 0.225 }).ev.fRC / ev.fRC, 2, 1e-9);
});

T('背景光 ― ショット床と BLIP', () => {
  const base = { nm: 900, eta: 0.9, pw: -9, bgnw: 1000, idpa: 10, ifa: 100, k: 0.02, M: 1 };
  const { ev } = evalWith(Object.assign({ bmhz: 0.015 }, base));
  near('背景光の電流 = R×Pbg', ev.Ibg, 0.9 * 900 / 1240 * 1e-6, 1e-12);
  near('SNR（15kHz）≒ 11.38', ev.SNR, 11.38, 0.02);
  /* SNR は 1/√B */
  const w = evalWith(Object.assign({}, base, { bmhz: 0.06 })).ev;
  near('帯域 ×4 で SNR は半分', ev.SNR / w.SNR, 2, 1e-6);
  /* 背景があると M は損（F のぶん） */
  const m = evalWith(Object.assign({}, base, { bmhz: 0.015, M: 100 })).ev;
  ok('背景光律速では M=100 が M=1 に負ける', m.SNR < ev.SNR);
  /* NEP も背景の床まで上がる（BLIP。アンプ律速でない条件で見る） */
  const dark = evalWith({ nm: 900, eta: 0.9, idpa: 10, ifa: 1, M: 1 }).ev.NEP;
  const blip = evalWith({ nm: 900, eta: 0.9, idpa: 10, ifa: 1, M: 1, bgnw: 1000 }).ev.NEP;
  ok('背景光で NEP が2桁上がる', blip > dark * 100);
  near('BLIP の NEP = √(2q·Ibg)/R', blip, Math.sqrt(2 * Q * ev.Ibg) / ev.R, 1e-15);
});

T('走行と RC の綱引き', () => {
  /* w=1µm・φ30µm: C = εA/w ≒ 73 fF、f_RC ≒ 44 GHz、f_tr = 0.44v/w = 44 GHz */
  const { ev } = evalWith({ wum: 1, diamum: 30 });
  const A = Math.PI * (15e-6) ** 2, eps = 11.7 * 8.854e-12;
  near('C = εA/w', ev.cw, eps * A / 1e-6, 1e-18);
  near('f_tr = 0.44·v/w', ev.ftr, 0.44 * 1e5 / 1e-6, 1);
  ok('釣り合いの近く（走行≒RC）', Math.abs(ev.ftr / ev.fRCw - 1) < 0.05);
  near('合成は 1/√2 側', ev.ftot, ev.ftr / Math.sqrt(1 + (ev.ftr / ev.fRCw) ** 2), 1);
  /* 両側で落ちる形 */
  const thick = evalWith({ wum: 3, diamum: 30 }).ev;
  ok('厚いと走行が足を引く', thick.ftr < thick.fRCw && thick.ftot < ev.ftot);
  const thin = evalWith({ wum: 0.4, diamum: 30 }).ev;
  ok('薄いと RC が足を引く', thin.fRCw < thin.ftr && thin.ftot < ev.ftot);
  /* 径を倍にすると C は4倍 → RC 帯域 1/4 */
  const big = evalWith({ wum: 1, diamum: 60 }).ev;
  near('径 ×2 で f_RC ×1/4', big.fRCw / ev.fRCw, 0.25, 1e-9);
});

T('TCSPC パイルアップ ― 繰り返しの窓', () => {
  /* 1pW・550nm・PDE0.5 = 1.38×10⁶ c/s。80MHz で p=1.7% */
  const { ev } = evalWith({ nm: 550, eta: 0.5, pw: -12, freps: 80, taufl: 2 });
  near('p = 計数率/繰り返し', ev.pileP, 1.3842e6 / 8e7, 1e-5);
  near('周期 12.5 ns', ev.perNs, 12.5, 1e-9);
  near('測れる寿命は周期の 1/5', ev.tauMaxNs, 2.5, 1e-9);
  /* 両側 */
  const slow = evalWith({ nm: 550, eta: 0.5, pw: -12, freps: 50 }).ev;
  ok('50MHz は p=2.8% で歪む側', slow.pileP > 0.02);
  const fast2 = evalWith({ nm: 550, eta: 0.5, pw: -12, freps: 120 }).ev;
  ok('120MHz は寿命 2ns の尻尾を踏む', fast2.tauMaxNs < 2);
  /* 繰り返しを上げると p は反比例で下がる */
  near('frep ×2 で p ×1/2', evalWith({ nm: 550, eta: 0.5, pw: -12, freps: 160 }).ev.pileP / ev.pileP, 0.5, 1e-9);
});

T('計数モード ― √t で買う', () => {
  const base = { nm: 550, eta: 0.5, pw: -16, dkcps: 500, bgnw: 0 };
  const { ev } = evalWith(Object.assign({ tsec: 5 }, base));
  near('0.1fW・550nm は 277 光子/s', ev.phi, 276.8, 0.5);
  near('信号 138 c/s', ev.cps, 138.4, 0.3);
  near('床はダークカウントだけ', ev.bcps, 500, 1e-9);
  near('SNR(5s) ≒ 12.25', ev.snrCount, 12.25, 0.02);
  /* √t 則 */
  const t20 = evalWith(Object.assign({}, base, { tsec: 20 })).ev;
  near('t ×4 で SNR ×2', t20.snrCount / ev.snrCount, 2, 1e-9);
  /* 背景光も床に乗る（1e-6 nW = 1fW → 1384 counts/s） */
  const bg = evalWith(Object.assign({}, base, { tsec: 5, bgnw: 1e-6 })).ev;
  ok('背景光の光子も counts の床になる', bg.bcps > 1500 && bg.snrCount < ev.snrCount);
});

/* ================= 第4章 ================= */

T('第5部 03 の例題 ― Si APD の M（850 nm・1 nW・k 0.02・100 pA・2 pA/√Hz・100 MHz）', () => {
  const b = { nm: 850, eta: 0.8, pw: -9, k: 0.02, idpa: 100, ifa: 2000, bmhz: 100 };
  const s = (M) => evalWith(Object.assign({ M }, b)).ev.SNR;
  near('M=1 で 0.027', s(1), 0.027, 0.001);
  near('M=10 で 0.27', s(10), 0.273, 0.002);
  near('M=100 で 1.57', s(100), 1.570, 0.005);
  near('M=300 で 1.33', s(300), 1.331, 0.005);
  near('F(300, 0.02) ≒ 8.0', P.excess(300, 0.02), 7.96, 0.01);
  const sw = P.snrSweep(Object.assign(P.defaults(), b), 1, 300, 300);
  const peak = sw.reduce((a, p) => (p.snr > a.snr ? p : a));
  ok('山の頂上は M ≈ 120〜135（本文「≈130」）', peak.M > 115 && peak.M < 135);
  near('頂上の SNR ≈ 1.6', peak.snr, 1.596, 0.005);
  near('k=0.4: F(10) ≒ 5.1', P.excess(10, 0.4), 5.14, 0.005);
  near('k=0.4: F(100) ≒ 41', P.excess(100, 0.4), 41.2, 0.05);
});

T('k = 0.4 の山は低くて狭い', () => {
  const b = { nm: 1550, eta: 0.8, pw: -7, k: 0.4, idpa: 10000, ifa: 5000, bmhz: 1000 };
  const s = (M, k) => evalWith(Object.assign({ M }, b, k === undefined ? {} : { k })).ev.SNR;
  ok('M=10 では 5 に届かない', s(10) < 5);
  ok('M=15 は山の上', s(15) >= 5);
  ok('M=30 では過剰雑音で 5 を割る', s(30) < 5);
  const sw = P.snrSweep(Object.assign(P.defaults(), b), 1, 300, 400);
  const peak = sw.reduce((a, p) => (p.snr > a.snr ? p : a));
  ok('k=0.4 の頂上は M ≈ 15', peak.M > 13 && peak.M < 18);
  const sw2 = P.snrSweep(Object.assign(P.defaults(), b, { k: 0.02 }), 1, 300, 400);
  const peak2 = sw2.reduce((a, p) => (p.snr > a.snr ? p : a));
  ok('同じ条件で k=0.02 なら頂上は高い M・高い SNR', peak2.M > 35 && peak2.snr > 9);
});

T('しきい値で数える ― クロストークとポアソンの裾', () => {
  near('P(n≥5 | μ=10)', P.poissonTail(10, 5), 0.97075, 1e-4);
  near('P(n≥7 | μ=10)', P.poissonTail(10, 7), 0.86986, 1e-4);
  eq('P(n≥1) は 1 − e^−μ', P.poissonTail(2, 1).toFixed(12), (1 - Math.exp(-2)).toFixed(12));
  const base = { dkcps: 5e5, pct: 0.1, mupe: 10 };
  near('しきい値 1 p.e. は暗計数そのもの', evalWith(Object.assign({ thr: 1 }, base)).ev.falseCps, 5e5, 1e-6);
  near('しきい値 2 p.e. は DCR·P_ct（定義）', evalWith(Object.assign({ thr: 2 }, base)).ev.falseCps, 5e4, 1e-6);
  near('しきい値 5 p.e. は DCR·P_ct⁴', evalWith(Object.assign({ thr: 5 }, base)).ev.falseCps, 50, 1e-9);
  const ap = evalWith({ pct: 0.05, pap: 0.03 }).ev;
  near('見かけの計数倍率 1 + P_ct + P_ap', ap.appar, 1.08, 1e-12);
  near('クロストークの ENF ≈ 1 + P_ct', ap.enfXt, 1.05, 1e-12);
});

T('シンチレータの分解能 ― 第5部 05 の PET', () => {
  /* 511 keV × 30 光子/keV ≒ 1.5×10⁴ 光子。2,000 光電子なら統計だけで 5.3% */
  const pet = evalWith({ ekev: 511, ly: 30, lce: 2000 / 15330, eta: 1, pct: 0, rint: 0 }).ev;
  near('511 × 30 = 15,330 光子', pet.scNph, 15330, 1e-9);
  near('2,000 光電子', pet.scNpe, 2000, 1e-6);
  near('2.355/√2000 = 5.27%', pet.scRes, 2.355 / Math.sqrt(2000), 1e-12);
  const withInt = evalWith({ ekev: 511, ly: 30, lce: 2000 / 15330, eta: 1, pct: 0, rint: 8 }).ev;
  near('固有 8% と二乗和で 9.6%（本文「10% 級」）', withInt.scRes, Math.sqrt(0.0527 ** 2 + 0.08 ** 2), 5e-4);
  const xt = evalWith({ ekev: 511, ly: 30, lce: 2000 / 15330, eta: 1, pct: 0.05, rint: 0 }).ev;
  near('クロストーク 5% で統計は √1.05 倍', xt.scStat / pet.scStat, Math.sqrt(1.05), 1e-12);
  const sat = evalWith({ ekev: 511, ly: 30, lce: 0.3, eta: 0.3, pct: 0.05, rint: 8, ncell: 14400 }).ev;
  near('飽和の線形誤差 = 1 − N(1−e^(−μ/N))/μ', sat.scLin, 1 - 14400 * (1 - Math.exp(-sat.scNpe / 14400)) / sat.scNpe, 1e-12);
  ok('光電子を増やすと飽和が増える', evalWith({ ekev: 511, ly: 30, lce: 0.5, eta: 0.5, ncell: 14400 }).ev.scLin > sat.scLin);
  ok('セル数を入れなければ飽和は出さない', evalWith({ ncell: 0 }).ev.scLin === undefined);
});

report();
