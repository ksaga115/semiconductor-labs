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

T('モード結合 ― 重なり積分', () => {
  /* w₁ = w₂ で 100% */
  const eq2 = evalWith({ nm: 1064, winmm: 53.2 / (Math.PI * 3.1) * 1e-0, mfdum: 6.2 });
  ok('w₁=w₂ でほぼ 100%', eq2.ev.etaMode > 0.9999);
  /* お手本: w=5.5mm → w₀=3.08µm、η≈100% */
  const a = evalWith({ nm: 1064, winmm: 5.5, mfdum: 6.2 }).ev;
  near('w₀ = 16.9/5.5 µm', a.w0um, 1.064 * 50 / (Math.PI * 5.5), 1e-6);
  ok('お手本は 99.9% 以上', a.etaMode > 0.999);
  /* 式の対称性: w₁ を w₂ に合わせておけば、w₂ 半分と倍で同じ η（比 r と 1/r） */
  const wEq = 53.2 / (Math.PI * 3.1);
  const half = evalWith({ nm: 1064, winmm: wEq, mfdum: 3.1 }).ev;
  const dbl = evalWith({ nm: 1064, winmm: wEq, mfdum: 12.4 }).ev;
  near('w₂ を 1/2 と 2倍で同じ η（比の対称性）', half.etaMode, dbl.etaMode, 1e-9);
  /* fiber の入場券とは別物: winmm=4 は fiber には入るが η は 91% */
  const w4 = evalWith({ nm: 1064, winmm: 4, mfdum: 6.2 }).ev;
  ok('w=4mm は入場（fibOk）するがモードは 91%', w4.fibOk && w4.etaMode > 0.90 && w4.etaMode < 0.92);
});

T('斜めの反射 ― s と p', () => {
  const n0 = evalWith({ nsub: 1.5, incdeg: 0 }).ev;
  near('垂直入射では s = p = 4%', n0.Rs, 0.04, 1e-12);
  near('垂直入射では s = p', n0.Rp, n0.Rs, 1e-12);
  const a45 = evalWith({ nsub: 1.5, incdeg: 45 }).ev;
  near('45° の s は 9.2%（第7部 09）', a45.Rs, 0.0920, 0.0002);
  near('45° の p は 0.85%', a45.Rp, 0.00847, 0.00002);
  const b = evalWith({ nsub: 1.5, incdeg: Math.atan(1.5) * 180 / Math.PI }).ev;
  ok('ブルースター角で p はゼロ', b.Rp < 1e-20);
  near('ブルースター角 = arctan n（56.3°）', b.brewDeg, 56.31, 0.01);
  near('シリコンのブルースター角 75.6°', evalWith({ nsub: 3.9 }).ev.brewDeg, 75.62, 0.01);
  near('ブルースター角の s は 14.8%', b.Rs, 0.1479, 0.0002);
});

T('格子の分光器 ― 逆線分散と範囲', () => {
  const g = evalWith({ glmm: 400, fsp: 50, pxum: 25, slitum: 25, lamlo: 400, lamhi: 1000 }).ev;
  near('400 本/mm・f50 で 50 nm/mm（第10部 08）', g.rld, 50, 1e-9);
  near('600 nm は 12 mm（cosβ≈1）', g.spanMm, 12, 1e-9);
  near('分解能は 2 画素で 2.5 nm', g.bpNm, 2.5, 1e-9);
  const wide = evalWith({ glmm: 400, fsp: 50, pxum: 25, slitum: 100 }).ev;
  near('スリットが 2 画素より広ければスリットで決まる', wide.bpNm, 5, 1e-9);
  const fine = evalWith({ glmm: 1200, fsp: 50, lamlo: 400, lamhi: 1000 }).ev;
  ok('1200 本/mm では範囲がセンサからはみ出す', fine.spanMm > 12.8);
});

T('ファイバの回線 ― dB の足し算と分散の掛け算', () => {
  const l = evalWith({ linkkm: 80, dbkm: 0.2, extdb: 1, pdbm: 0, dlnm: 0.1, dps: 17, gbps: 10 }).ev;
  near('80 km で受信 −17 dBm', l.rxdbm, -17, 1e-12);
  near('幅 0.1 nm で 136 ps（第7部 12）', l.spreadPs, 136, 1e-9);
  near('10 Gb/s の 1 ビットは 100 ps', l.bitPs, 100, 1e-12);
});

T('cos⁴則 ― 隅は4回割引', () => {
  /* 軸上は減光なし */
  near('像高 0 で 100%', evalWith({ hmm: 0, fmm: 50 }).ev.cos4, 1, 1e-12);
  /* 50mm・フルサイズの隅: θ=23.4°、cos⁴=71% */
  const { ev } = evalWith({ hmm: 21.6, fmm: 50 });
  near('θ = atan(21.6/50)', ev.thetaDeg, Math.atan(21.6 / 50) * 180 / Math.PI, 1e-9);
  near('50mm の隅は 71%', ev.cos4, 0.710, 0.002);
  /* 35mm では 52% 台 ― 広角ほど暗い */
  const w35 = evalWith({ hmm: 21.6, fmm: 35 }).ev;
  near('35mm の隅は 52%', w35.cos4, 0.525, 0.002);
  ok('広角ほど隅が暗い', w35.cos4 < ev.cos4);
  /* 定義どおり cos⁴ */
  near('cos⁴ の定義', ev.cos4, Math.pow(Math.cos(Math.atan(21.6 / 50)), 4), 1e-12);
});

T('MTF と焦点深度 ― 第7部 15', () => {
  const a = evalWith({ nm: 550, N: 2.8, ppum: 3.45 }).ev;
  near('ナイキスト 144.9 lp/mm', a.nuNyq, 144.93, 0.01);
  near('回折の遮断 649.4 lp/mm（F2.8・550nm）', a.nuc, 649.35, 0.05);
  near('画素の開口の MTF はナイキストで 2/π', a.mtfPix, 2 / Math.PI, 1e-9);
  near('F2.8 の系 0.457', a.mtfSys, 0.4572, 0.0005);
  near('F8 の系 0.157', evalWith({ nm: 550, N: 8, ppum: 3.45 }).ev.mtfSys, 0.1573, 0.0005);
  near('焦点深度 2Nc（F8・c 6.9µm）', evalWith({ N: 8, ppum: 3.45 }).ev.focusUm, 110.4, 1e-9);
  ok('遮断より細かい縞は 0', evalWith({ nm: 550, N: 22, ppum: 1 }).ev.mtfLens === 0);
  ok('絞るほど MTF は下がる', evalWith({ nm: 550, N: 5.6 }).ev.mtfSys < evalWith({ nm: 550, N: 4 }).ev.mtfSys);
});

T('多層膜 ― 第7部 16', () => {
  const R = (n) => evalWith({ npair: n }).ev.Rml;
  near('H 1 層 32.3%', R(0), 0.3230, 0.0001);
  near('N=4 で 97.6%', R(4), 0.97586, 0.0001);
  near('N=5 で 99.06%', R(5), 0.99061, 0.0001);
  near('N=8 で 99.95%', R(8), 0.99946, 0.0001);
  const e = evalWith({ lam0: 550 }).ev;
  near('帯の幅 Δg 0.300', e.dgml, 0.3002, 0.0001);
  near('帯の端 478 nm', e.bandLo, 478.2, 0.2);
  near('帯の端 647 nm', e.bandHi, 647.1, 0.2);
  eq('層の数は 2N+1', evalWith({ npair: 6 }).ev.layers, 13);
});

T('被写界深度と回折 ― 第7部 18', () => {
  const g = { fmm: 50, amm: 500, ppum: 3.45, nm: 550 };
  const e = evalWith(Object.assign({ N: 8 }, g)).ev;
  near('倍率 0.111', e.mag, 1 / 9, 1e-9);
  near('F8 で 9.94 mm', e.dofMm, 9.936, 0.002);
  const f46 = 6.9 / (2.44 * 0.55 * (1 + 1 / 9));
  near('回折が c に並ぶ F4.63', f46, 4.627, 0.001);
  near('F4.63 での深さ 5.75 mm', evalWith(Object.assign({ N: f46 }, g)).ev.dofMm, 5.747, 0.002);
  near('F4.63 で点像 = c', evalWith(Object.assign({ N: f46 }, g)).ev.diffUm, 6.9, 1e-9);
});

report();
