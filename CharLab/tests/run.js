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

/* ---- 第4章。SemiLab の物理（phys・dev）とも突き合わせる（SemiLab の src は読むだけ） ---- */
function loadSemi() {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const sb = { console }; sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  for (const n of ['phys', 'stack', 'poisson', 'dev']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'SemiLab', 'src', n + '.js'), 'utf8'), sb, { filename: n });
  }
  return sb.SL;
}
const SL = loadSemi();

T('第4章 TD ― 温度を振った Is とアレニウス', () => {
  /* Eg(T) は SemiLab の Varshni と同じ */
  [250, 300, 350, 400].forEach((t) => near(`Eg(${t}K) が SemiLab と同じ`, M.egT(t), SL.phys.eg(t), 1e-12));
  near('300 K の Eg = 1.1245', M.egT(300), 1.1245, 5e-4);
  /* Is の温度依存は ni² の比そのもの（SemiLab の ni(T) ∝ T^1.5·exp(−Eg(T)/2kT)） */
  [250, 350, 400].forEach((t) => within(`Is(${t})/Is(300) = (ni(${t})/ni(300))²`,
    M.tegIs(t) / M.tegIs(300), Math.pow(SL.phys.ni(t) / SL.phys.ni(300), 2), 1.002));
  near('300 K の Is = 1×10⁻¹² A', M.tegIs(300), 1e-12, 1e-24);
  /* 抽出の往復: 2点法でも最小二乗でも見かけの Eg ≈ 1.203 eV */
  const y = (t) => Math.log(M.tegIs(t) / t ** 3);
  const two = -M.KB_EV * (y(400) - y(250)) / (1 / 400 - 1 / 250);
  near('最小二乗の見かけの Eg ≈ 1.203', DEV.teg.ea, 1.2027, 5e-4);
  near('2点（250・400 K）でも同じ', two, DEV.teg.ea, 2e-3);
  /* 見かけの Eg は Eg(T) の接線を 0 K へ延ばした値に近い（300 K の Eg とは違う） */
  const d = (M.egT(326) - M.egT(324)) / 2;
  near('見かけの Eg ≈ 325 K の接線の 0 K 切片', DEV.teg.ea, M.egT(325) - d * 325, 5e-3);
  ok('見かけの Eg は 300 K の Eg より 0.07 eV 以上大きい', DEV.teg.ea - M.egT(300) > 0.07);
  /* T³ で割り忘れると 3kT ぶん大きく出る */
  const naive = -M.KB_EV * (Math.log(M.tegIs(400)) - Math.log(M.tegIs(250))) / (1 / 400 - 1 / 250);
  ok('T³ で割り忘れた値は 0.06 eV 以上ずれる', naive - DEV.teg.ea > 0.06);
  /* 室温で Is が倍になる温度の幅（約 4 K） */
  const dbl = Math.log(2) / ((Math.log(M.tegIs(301)) - Math.log(M.tegIs(299))) / 2);
  near('Is は 300 K での微分で約 4.2 K ごとに倍（実際に 2 倍になる幅は 4.3 K）', dbl, 4.2, 0.1);
});

T('第4章 P ― 段のある接合の C-V プロファイル', () => {
  const P = DEV.prof;
  near('Vbi = Vt·ln(Na·N1/ni²) = 0.893', M.profVbi(), 0.8929, 5e-4);
  /* 一様な濃度なら SemiLab のダイオードの接合容量と一致する（p⁺ 側の空乏 0.1% の差だけ） */
  const uni = { na: 1e19, n1: 1e16, n2: 1e16, x1um: 0.6 };
  const st = SL.stack.create();
  SL.stack.addLayer(st, 'si', 1000, { na: 1e19 });
  SL.stack.addLayer(st, 'si', 8000, { nd: 1e16 });
  const d = SL.dev.diode(st, 300);
  [0, -1, -5, -10].forEach((v) => within(`一様なら SemiLab の C(${v}V) と一致`, M.profC(v, uni), d.cap(v), 1.003));
  /* 1/C² の直線の切片が Vbi（段より浅いバイアスで） */
  const c0 = M.profC(0), c1 = M.profC(-1);
  const sl = (1 / c1 ** 2 - 1 / c0 ** 2) / (-1);
  near('1/C² の切片が Vbi', 0 - (1 / c0 ** 2) / sl, M.profVbi(), 1e-6);
  within('浅い組の傾きから N1', -2 / (M.QEL * M.EPS_S * sl), P.n1, 1.0005);
  /* 深い組から N2、段は W が 0.556〜0.604 µm のあいだ */
  const c10 = M.profC(-10), c20 = M.profC(-20);
  const sl2 = (1 / c20 ** 2 - 1 / c10 ** 2) / (-10);
  within('深い組の傾きから N2', -2 / (M.QEL * M.EPS_S * sl2), P.n2, 1.0005);
  near('−1.5 V の W = 0.556 µm（段の手前）', M.EPS_S / M.profC(-1.5) * 1e4, 0.556, 2e-3);
  near('−2 V の W = 0.604 µm（段の先）', M.EPS_S / M.profC(-2) * 1e4, 0.604, 2e-3);
  /* 空乏近似の往復: 電位差と C の関係（dQ/dV = εs/W） */
  const w = M.profW(-3), dv = 1e-4;
  const dq = M.QEL * P.n2 * (M.profW(-3 - dv) - M.profW(-3 + dv));
  within('C = dQ/dV = εs/W', dq / (2 * dv), M.profC(-3), 1.001);
  ok('逆バイアスで W は単調に広がる', M.profW(-20) > M.profW(-10) && M.profW(-10) > w);
});

T('第4章 R ― 2 ダイオード', () => {
  near('Vx = 2Vt·ln(Is2/Is1) = 0.631', M.recVx(), 0.6311, 5e-4);
  /* 成分が等しい電圧で n=1 と n=2 の電流が一致する */
  const R = DEV.rec, v = M.recVx();
  within('Vx で 2 成分が等しい', R.is1 * Math.exp(v / VT), R.is2 * Math.exp(v / (2 * VT)), 1.000001);
  /* 局所の理想係数: 0.3 V で ≈2、0.75 V で ≈1.08 */
  const nloc = (a, b) => (b - a) / (VT * Math.log(M.recI(b) / M.recI(a)));
  near('0.30〜0.35 V の傾きは n ≈ 2', nloc(0.30, 0.35), 1.99, 0.02);
  near('0.70〜0.75 V の傾きは n ≈ 1.08', nloc(0.70, 0.75), 1.077, 0.01);
  /* 抽出の往復 */
  const is2 = M.recI(0.3) / (Math.exp(0.3 / (2 * VT)) - 1);
  within('0.30 V から Is2', is2, R.is2, 1.005);
  const is1 = (M.recI(0.7) - is2 * (Math.exp(0.7 / (2 * VT)) - 1)) / (Math.exp(0.7 / VT) - 1);
  within('0.70 V で Is2 を引いて Is1', is1, R.is1, 1.005);
  near('読んだ Is1・Is2 から Vx', 2 * VT * Math.log(is2 / is1), M.recVx(), 1e-3);
  /* Is2 を引かずに読むと 1.26 倍大きく出る（課題の許容 1.15 倍の外） */
  within('引き忘れた Is1 は 1.26 倍', M.recI(0.7) / Math.exp(0.7 / VT) / R.is1, 1.264, 1.003);
});

T('測定表 ― 画面が見るものと同じ', () => {
  const t = M.tables();
  eq('ダイオード 13 点', t.dio.length, 13);
  eq('MOSFET 13 点', t.mos.length, 13);
  eq('C-V 17 点', t.cv.length, 17);
  near('表の I(0.5)', t.dio[4].i, M.diodeI(0.5), 1e-18);
  near('表の Id(1.0)', t.mos[8].id, M.mosId(1.0), 1e-18);
  near('表の C(0)', t.cv[8].c, M.mosC(0), 1e-20);
  eq('TD 7 点', t.teg.length, 7);
  eq('P 15 点', t.prof.length, 15);
  eq('R 14 点', t.rec.length, 14);
  near('表の Is(300K)', t.teg[2].is, M.tegIs(300), 1e-24);
  near('表の I_R(0.70)', t.rec[12].i, M.recI(0.7), 1e-15);
});

report();
