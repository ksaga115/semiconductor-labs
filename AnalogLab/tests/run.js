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

report();
