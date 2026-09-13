/* モデルの単体検査 ― 式がラザビー（level 1）どおりであること
 *
 *   node tests/run.js
 */
'use strict';
const { load, T, ok, eq, near, within, report } = require('./harness.js');
const { AN } = load();
const A = AN.analog;

function evalWith(patch) {
  const d = A.defaults();
  for (const k in patch) d[k] = patch[k];
  return { d, ev: A.evaluate(d) };
}

T('二乗則 ― Vov・gm・ro', () => {
  const { ev } = evalWith({ wl: 25, idua: 100 });
  near('Vov = √(2Id/(µCox·W/L))', ev.Vov, 0.2, 1e-9);
  near('gm = 2Id/Vov', ev.gm, 1e-3, 1e-9);
  near('gm/Id = 2/Vov', ev.gmid, 10, 1e-6);
  near('ro = 1/(λId)', ev.ro, 1e5, 1e-3);
  /* gm のもう一つの顔: √(2·µCox·W/L·Id) と一致する */
  near('gm の2つの式が一致', ev.gm, Math.sqrt(2 * 200e-6 * 25 * 100e-6), 1e-12);
  /* W/L を4倍にすると Vov は半分、gm は2倍（Id 固定） */
  const w4 = evalWith({ wl: 100, idua: 100 }).ev;
  near('W/L ×4 で Vov ×1/2', w4.Vov / ev.Vov, 0.5, 1e-9);
  near('W/L ×4 で gm ×2', w4.gm / ev.gm, 2, 1e-9);
  /* Id を4倍にすると gm は2倍（W/L 固定）― 電力で√でしか買えない */
  const i4 = evalWith({ wl: 25, idua: 400 }).ev;
  near('Id ×4 で gm ×2', i4.gm / ev.gm, 2, 1e-9);
});

T('一段の利得 ― RD∥ro と素の利得', () => {
  const { ev } = evalWith({ wl: 25, idua: 100, rdk: 12 });
  near('|Av| = gm·(RD∥ro)', ev.avr, 1e-3 * (12e3 * 1e5) / (12e3 + 1e5), 1e-6);
  near('素の利得 gm·ro = 2/(λVov)', ev.avint, 2 / (0.1 * 0.2), 1e-6);
  /* RD を無限に上げても壁を超えない */
  const big = evalWith({ wl: 25, idua: 100, rdk: 1e6 }).ev;
  ok('RD→大 でも gm·ro 未満', big.avr < big.avint);
  ok('壁の 99% には届く', big.avr > big.avint * 0.99);
  /* 動作点と余裕 */
  near('動作点 = VDD − Id·RD', ev.voutdc, 1.8 - 1.2, 1e-9);
  near('下の余裕 = 動作点 − Vov', ev.headLo, 0.4, 1e-9);
});

T('GBW・電力・雑音', () => {
  const { ev } = evalWith({ wl: 25, idua: 100, clpf: 1 });
  near('GBW = gm/(2πCL)', ev.gbw, 1e-3 / (2 * Math.PI * 1e-12), 1);
  near('P = VDD·Id', ev.p, 1.8 * 100e-6, 1e-12);
  /* 熱雑音 √(4kTγ/gm): gm=1mS で 3.32nV/√Hz（4kT=1.66e-20, γ=2/3） */
  within('√(4kTγ/gm) @1mS', ev.vnmos, 3.32e-9, 1.02);
  /* gm 4倍で雑音半分 */
  const g4 = evalWith({ wl: 100, idua: 400 }).ev;
  near('gm ×4 で雑音 ×1/2', g4.vnmos / ev.vnmos, 0.5, 1e-9);
});

T('TIA とチャージアンプ ― 第4部・第5部と同じ算数', () => {
  const t = evalWith({ rfk: 8, cpdpf: 2 }).ev;
  near('TIA 帯域 = 1/(2πRfC)', t.btia, 1 / (2 * Math.PI * 8e3 * 2e-12), 1);
  within('√(4kT/Rf) @8kΩ', t.irf, 1.44e-12, 1.02);
  /* Rf を4倍にすると雑音電流は半分（利得は4倍）― 第5部 07 の「下がるのに」 */
  const t4 = evalWith({ rfk: 32, cpdpf: 2 }).ev;
  near('Rf ×4 で雑音電流 ×1/2', t4.irf / t.irf, 0.5, 1e-9);
  /* チャージアンプ: PixelLab の変換ゲインと同じ q/C */
  const c = evalWith({ cffF: 2, qe: 1 }).ev;
  within('1e− を 2fF で受けると 80µV', c.vq, 80e-6, 1.01);
  const k = evalWith({ cffF: 2 }).ev;
  within('kTC @2fF ≒ 18e−', k.ktc, 18, 1.03);
});

T('スイッチトキャパシタ ― 抵抗を時間で作る', () => {
  /* R = 1/(fC): 1MHz・1pF は 1MΩ */
  const s = evalWith({ fsmhz: 1, cscpf: 1 }).ev;
  near('1MHz・1pF = 1MΩ', s.reqsc, 1e6, 1);
  /* f を1桁下げると R は1桁上がる */
  const slow = evalWith({ fsmhz: 0.1, cscpf: 1 }).ev;
  near('f 1/10 で R ×10', slow.reqsc / s.reqsc, 10, 1e-9);
  /* kT/C: 1pF は 64µV、0.25pF で倍 */
  within('√(kT/C) @1pF ≒ 64µV', s.vktcsc, 64.4e-6, 1.01);
  const q = evalWith({ fsmhz: 1, cscpf: 0.25 }).ev;
  near('C 1/4 で雑音 2 倍', q.vktcsc / s.vktcsc, 2, 1e-9);
  /* お手本の窓: 0.1MHz・0.6pF */
  const a = evalWith({ fsmhz: 0.1, cscpf: 0.6 }).ev;
  ok('16.7MΩ・83µV の窓', a.reqsc > 1e7 && a.vktcsc < 1e-4);
});

T('2段OTA ― ミラー補償と位相余裕', () => {
  /* お手本: gm1 0.894mS・gm2 2.68mS・Cc 3pF */
  const { ev } = evalWith({ idua2: 500, wl2: 36, ccpf: 3, clpf: 1 });
  near('gm2（二乗則）', ev.gm2v, 2.683e-3, 2e-6);
  near('GBW = gm1/2πCc ≒ 47.4MHz', ev.gbw2, 4.745e7, 5e4);
  near('第2極 = gm2/2πCL ≒ 427MHz', ev.fp2, 4.27e8, 1e6);
  near('ゼロ = gm2/2πCc ≒ 142MHz', ev.fz, 1.423e8, 5e5);
  near('PM ≒ 65°', ev.pm, 65.2, 0.2);
  /* Cc を小さくすると速いが崩れる ― GBW/fz は Cc に依らない */
  const fast = evalWith({ idua2: 500, wl2: 36, ccpf: 1, clpf: 1 }).ev;
  ok('Cc 1pF は速い（142MHz）が PM 53° に崩れる', fast.gbw2 > 1.4e8 && fast.pm < 55);
  near('GBW/fz = gm1/gm2 は Cc に依らない', fast.gbw2 / fast.fz, ev.gbw2 / ev.fz, 1e-9);
  /* gm2 = gm1 の対称構成は PM 0°（極とゼロが GBW に重なる） */
  const sym = evalWith({ idua2: 100, wl2: 20, ccpf: 1, clpf: 1 }).ev;
  near('gm2=gm1・Cc=CL なら PM = 0°', sym.pm, 0, 0.01);
});

T('AD 変換と DC-DC ― 第6部 09・10 の数字', () => {
  const a = evalWith({ nbit: 12, fsv: 1, cadcpf: 1e6 }).ev;
  near('12 ビット・1 V の LSB = 244 µV', a.lsb, 1 / 4096, 1e-12);
  within('量子化の雑音 LSB/√12 = 70.5 µV', a.vqadc * 1e6, 70.5, 1.001);
  within('容量が十分大きければ SN 比は 6.02N+1.76 = 74.0 dB', a.snradc, 74.0, 1.001);
  within('そのとき ENOB は 12', a.enob, 12, 1.001);
  const c = evalWith({ nbit: 12, fsv: 1, cadcpf: 0.833 }).ev;
  within('0.83 pF で kT/C が量子化と並ぶ', c.vktcadc / c.vqadc, 1, 1.002);
  const c16 = evalWith({ nbit: 16, fsv: 1, cadcpf: 213 }).ev;
  within('16 ビットでは 213 pF で並ぶ', c16.vktcadc / c16.vqadc, 1, 1.003);
  const b = evalWith({ vin: 12, vout: 3.3, fswmhz: 1, luh: 10 }).ev;
  near('D = 0.275', b.duty, 0.275, 1e-12);
  within('ΔI = 0.239 A（第6部 10 の例題）', b.dIbuck, 0.239, 1.002);
});

T('第5章 ― ミラー・バンドギャップ・TIA の帰還容量（第6部 03・08・16 の数字）', () => {
  /* 03 の例題: 基準 50 µA・1:2・ΔV 0.5 V・λ 0.1 */
  const m0 = evalWith({ mcasc: 0 }).ev, m1 = evalWith({ mcasc: 1 }).ev;
  near('ミラーの出力 = 50 µA × 2', m0.mIout, 100e-6, 1e-15);
  near('単純なミラーの誤差 λΔV = 5%', m0.mErr, 0.05, 1e-12);
  within('gm·ro ≈ 89（W/L 20・100 µA）', m1.mgmro, 89.44, 1.001);
  within('カスコードの出力抵抗 8.9 MΩ', m1.mRout, 8.944e6, 1.001);
  within('カスコードの誤差 0.056%（0.5 V / 8.9 MΩ = 56 nA）', m1.mErr, 5.59e-4, 1.002);
  near('カスコードは Vov 2 個ぶんの電圧が要る', m1.mHead, 2 * m0.mHead, 1e-12);

  /* 08 の例題: n = 8 で (k/q)·ln 8 = 179 µV/K、m = 11.2、Vref = 1.25 V */
  within('PTAT の係数 (k/q)·ln 8 = 179 µV/K', evalWith({ bgn: 8, bgm: 1 }).ev.bgTC + 2, 0.1792, 1.001);
  const b = evalWith({ bgn: 8, bgm: 11.2 }).ev;
  within('傾きが消える m = 11.2', b.bgMzero, 11.16, 1.002);
  within('Vref = 0.65 + 11.2 × 0.02585 × 2.08 = 1.25 V', b.bgV, 1.252, 1.001);
  ok('m = 11.2 で傾きはほぼ 0（|傾き| < 0.01 mV/K）', Math.abs(b.bgTC) < 0.01);
  near('−40〜125 ℃ の変化 = |傾き| × 165 K', evalWith({ bgn: 8, bgm: 5 }).ev.bgDrift, Math.abs(evalWith({ bgn: 8, bgm: 5 }).ev.bgTC) * 165, 1e-9);

  /* 16: Rf 1 MΩ・Cin 10 pF・GBW 100 MHz */
  const t = (cf) => evalWith({ rfk: 1000, tcinpf: 10, tgbwmhz: 100, tcffF: cf }).ev;
  const z0 = t(0).tzeta;
  within('Cf 0 で ζ = 0.0063', z0, 0.006308, 1.002);
  within('Cf 0 の山は 2 次系の 1/(2ζ√(1−ζ²)) ― 79.3 倍', t(0).tpeak, 1 / (2 * z0 * Math.sqrt(1 - z0 * z0)), 1.0005);
  within('Cf 125 fF（ζ 0.5）の山 15.7%', t(125).tpeak, 1.157, 1.002);
  within('Cf 125 fF の帯域 1.60 MHz', t(125).tbw, 1.597e6, 1.002);
  within('Cf 178 fF（最大平坦）の帯域 1.25 MHz', t(178).tbw, 1.253e6, 1.002);
  ok('Cf 178 fF は山がない（1.0005 倍未満）', t(178).tpeak < 1.0005);
  within('Cf 0.5 pF の帯域 0.34 MHz', t(500).tbw, 0.340e6, 1.003);
  near('帯域の目安 √(GBW/(2πRf·CT)) と一致', t(178).tbw, Math.sqrt(1e8 / (2 * Math.PI * 1e6 * 10.178e-12)), 0.02e6);
  ok('Cf を大きくすると帯域は下がる', t(250).tbw < t(178).tbw && t(500).tbw < t(250).tbw);
});

report();
