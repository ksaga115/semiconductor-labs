/* モデルの単体検査 ― 測定が教科書どおりで、かつ「表から抽出できる」こと
 *
 * ここが特性ラボの心臓: 課題が教える抽出手順を機械が実際にやり、真値が返ることを確かめる。
 *
 *   node tests/run.js
 */
'use strict';
const { load, T, ok, eq, near, within, report } = require('./harness.js');
const { CL } = load();
const M = CL.char, DEV = M.DEV;
const VT = M.VT;

T('ダイオード ― I-V と3つの数字', () => {
  /* 中域は理想式そのもの */
  near('I(0.5V) ≒ 3.00×10⁻⁷', M.diodeI(0.5), 3.003e-7, 3e-10);
  /* n の抽出: 2点法 */
  const i1 = M.diodeI(0.45), i2 = M.diodeI(0.55);
  const nX = 0.10 / (VT * Math.log(i2 / i1));
  within('表から n が返る', nX, DEV.dio.n, 1.005);
  /* Is の抽出: 切片 */
  const isX = M.diodeI(0.5) / Math.exp(0.5 / (nX * VT));
  within('表から Is が返る', isX, DEV.dio.is, 1.05);
  /* Rs の抽出: てっぺんの寝た分 */
  const i9 = M.diodeI(0.9);
  const rsX = (0.9 - DEV.dio.n * VT * Math.log(i9 / DEV.dio.is)) / i9;
  within('表から Rs が返る', rsX, DEV.dio.rs, 1.05);
  /* Rs の曲がりが見えている（理想の半分以下） */
  const ideal9 = DEV.dio.is * Math.exp(0.9 / (DEV.dio.n * VT));
  ok('0.9V では理想より 1/2 以下に寝る', i9 < ideal9 / 2);
  /* 単調 */
  ok('I-V は単調', M.diodeI(0.6) > M.diodeI(0.5) && M.diodeI(0.8) > M.diodeI(0.7));
});

T('MOSFET ― 外挿と裾', () => {
  /* 強反転の直線: 傾き = kwl·Vd、切片 = Vth */
  const iA = M.mosId(1.0), iB = M.mosId(1.4);
  const slope = (iB - iA) / 0.4;
  near('傾き = µCoxW/L × Vd', slope, DEV.mos.kwl * DEV.mos.vd, DEV.mos.kwl * DEV.mos.vd * 1e-3);
  const vthX = 1.4 - iB / slope;
  near('外挿の切片 = Vth', vthX, DEV.mos.vth, 0.002);
  /* 裾: 100mV あたりの桁数から S 値 */
  const dec = Math.log10(M.mosId(0.4) / M.mosId(0.3));
  near('裾から S = 92 が返る', 100 / dec, DEV.mos.ss, 0.5);
  /* Vth の 200mV 下では nA 級 */
  ok('しきい値の下は指数で小さい', M.mosId(0.42) < M.mosId(1.0) / 100);
});

T('MOS 容量 ― 2つの棚', () => {
  /* 蓄積の棚 = Cox = εox/tox */
  near('C(-2V) = Cox', M.mosC(-2), M.EPS_OX / (DEV.cap.tox * 1e-7), 1e-12);
  within('Cox ≒ 821 nF/cm²', M.mosC(-2) * 1e9, 821.4, 1.005);
  /* 反転の棚 = Cmin（Cox と Wdmax の直列） */
  near('C(+2V) = Cmin', M.mosC(2), M.cminOf(), 1e-13);
  within('Cmin ≒ 139 nF/cm²', M.mosC(2) * 1e9, 138.9, 1.01);
  within('Wdmax ≒ 62 nm', M.wdmaxOf() * 1e7, 61.9, 1.005);
  /* 棚を離れるのは Vfb */
  near('Vfb までは棚', M.mosC(DEV.cap.vfb), M.mosC(-2), 1e-15);
  ok('Vfb を超えると落ち始める', M.mosC(DEV.cap.vfb + 0.05) < M.mosC(-2) * 0.999);
  /* Na の抽出: Wdmax → φF を1回まわす */
  const cox = M.mosC(-2), cmin = M.mosC(2);
  const wdX = M.EPS_S * (1 / cmin - 1 / cox);
  let naX = 4 * M.EPS_S * 0.44 / (M.QEL * wdX * wdX);
  naX = 4 * M.EPS_S * M.phifOf(naX) / (M.QEL * wdX * wdX);
  within('表から Na が返る（1回の反復で）', naX, DEV.cap.na, 1.02);
});

T('測定表 ― 画面が見るものと同じ', () => {
  const t = M.tables();
  eq('ダイオード 13 点', t.dio.length, 13);
  eq('MOSFET 13 点', t.mos.length, 13);
  eq('C-V 17 点', t.cv.length, 17);
  near('表の I(0.5)', t.dio[4].i, M.diodeI(0.5), 1e-18);
  near('表の Id(1.0)', t.mos[8].id, M.mosId(1.0), 1e-18);
  near('表の C(0)', t.cv[8].c, M.mosC(0), 1e-20);
});

report();
