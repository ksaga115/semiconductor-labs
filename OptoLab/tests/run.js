/* モデルの単体検査 ― 式が教科書どおりであること
 *
 *   node tests/run.js
 */
'use strict';
const { load, T, ok, eq, near, within, report } = require('./harness.js');
const { OP } = load();
const O = OP.opto;

function evalWith(patch) {
  const d = O.defaults();
  for (const k in patch) d[k] = patch[k];
  return { d, ev: O.evaluate(d) };
}

T('明るさの会計 ― 683 とカメラ方程式', () => {
  const { ev } = evalWith({ lx: 1, N: 2.8 });
  near('1lx = 1/683 W/m²（555nm）', ev.Ew, 1 / 683, 1e-9);
  /* 第4部の「数字の根拠」との突き合わせ: ρ0.18・T0.9・F2.8 でセンサ面は 0.52% */
  near('カメラ方程式 = 第4部の 0.52%', ev.Eimg / 1, 0.18 * 0.9 / (4 * 2.8 * 2.8), 1e-9);
  /* 1000lx・F2.8 → 3.0µm 画素の光子束が第4部の 190/px/s/lx ×1000 と合う */
  const c = evalWith({ lx: 1000, N: 2.8 }).ev;
  within('光子束が第4部と桁で一致（2.1e4 /µm²/s）', c.phiUm, 2.11e4, 1.02);
  /* 逆二乗 */
  const i = evalWith({ cd: 100, rm: 2 }).ev;
  near('E = I/r²', i.Einv, 25, 1e-9);
  const i2 = evalWith({ cd: 100, rm: 4 }).ev;
  near('距離2倍で 1/4', i2.Einv / i.Einv, 0.25, 1e-12);
});

T('結像 ― レンズの公式と回折', () => {
  const { ev } = evalWith({ fmm: 50, amm: 100 });
  near('a=2f で b=2f', ev.bmm, 100, 1e-6);
  near('等倍', ev.mag, 1, 1e-9);
  const far = evalWith({ fmm: 50, amm: 50000 }).ev;
  near('遠方では b→f', far.bmm, 50.05, 0.01);
  ok('a<f は虚像（Infinity で返す）', !isFinite(evalWith({ fmm: 50, amm: 30 }).ev.bmm));
  /* 回折: 第4部と同じ 2.44λN、顕微鏡側 0.61λ/NA */
  const a = evalWith({ nm: 550, N: 2.8 }).ev;
  near('エアリー径 2.44λN（第4部の 3.76µm）', a.airyUm, 2.44 * 0.55 * 2.8, 1e-9);
  const r = evalWith({ nm: 555, naobj: 0.61 }).ev;
  near('0.61λ/NA', r.resUm, 0.555, 1e-9);
});

T('ガウスビームとファイバ', () => {
  const { ev } = evalWith({ nm: 1064, fmm: 50, winmm: 2, m2: 1 });
  near('w0 = λf/(πw)', ev.w0um, 1.064 * 50 * 1000 / (Math.PI * 2000), 1e-6);
  const m = evalWith({ nm: 1064, fmm: 50, winmm: 2, m2: 3 }).ev;
  near('M²=3 で 3 倍絞れない', m.w0um / ev.w0um, 3, 1e-9);
  const w4 = evalWith({ nm: 1064, fmm: 50, winmm: 4 }).ev;
  near('ビーム2倍でスポット半分', w4.spotUm / ev.spotUm, 0.5, 1e-9);
  near('ビームNA = w/f', w4.naBeam, 4 / 50, 1e-12);
  ok('太すぎると角度で入らない', !evalWith({ nm: 1064, winmm: 8, coreu: 10, naf: 0.14 }).ev.fibOk);
  ok('細すぎるとスポットで入らない', !evalWith({ nm: 1064, winmm: 1, coreu: 10, naf: 0.14 }).ev.fibOk);
  ok('窓の中なら入る', evalWith({ nm: 1064, winmm: 4, coreu: 10, naf: 0.14 }).ev.fibOk);
});

T('反射とロックイン', () => {
  const g = evalWith({ nsub: 1.5 }).ev;
  near('ガラスの 4%', g.Rfres, 0.04, 0.0005);
  const s = evalWith({ nsub: 3.9 }).ev;
  within('シリコンの 35%', s.Rfres, 0.35, 1.02);
  const ideal = evalWith({ nsub: 3.9, ncoat: Math.sqrt(3.9) }).ev;
  ok('n=√(n1n3) で残留反射ほぼゼロ', ideal.Rar < 1e-9);
  near('理想屈折率', ideal.nIdeal, Math.sqrt(3.9), 1e-12);
  const l = evalWith({ bin: 1000, blk: 0.1 }).ev;
  near('ロックイン √(B/B)', l.snrGain, 100, 1e-9);
});

T('エテンデュ ― 増やせない会計', () => {
  /* G = (πD²/4)(πNA²)。LED 100µm・NA0.9 → 2.0×10⁴ µm²·sr */
  const { ev } = evalWith({ srcum: 100, srcna: 0.9, coreu: 150, naf: 0.45 });
  near('光源の G', ev.gsrc, Math.PI * Math.PI * 100 * 100 * 0.81 / 4, 1e-6);
  near('上限 = (コアNA/光源NA·径比)²', ev.etaMax, Math.pow(150 * 0.45 / (100 * 0.9), 2), 1e-12);
  near('56% の検算', ev.etaMax, 0.5625, 1e-9);
  /* コア×NA 積が同じなら上限も同じ */
  const same = evalWith({ srcum: 100, srcna: 0.9, coreu: 300, naf: 0.225 }).ev;
  near('コア×NA が同じなら上限は同じ', same.etaMax, ev.etaMax, 1e-12);
  /* シングルモード級には桁で入らない */
  const sm = evalWith({ srcum: 100, srcna: 0.9, coreu: 10, naf: 0.14 }).ev;
  ok('LED は SM ファイバにほぼ入らない（0.03% 未満）', sm.etaMax < 3e-4);
  /* 受けが光源より大きければ上限 1 で頭打ち */
  const big = evalWith({ srcum: 10, srcna: 0.1, coreu: 400, naf: 0.5 }).ev;
  near('受けが余れば上限 100%', big.etaMax, 1, 1e-12);
});

report();
