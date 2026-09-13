/* 物理の検査 ― 教科書の式と突き合わせる
 *
 *   node tests/run.js
 */
'use strict';
const { load, T, ok, eq, near, within, report } = require('./harness.js');
const { PL, SL } = load();
const G = PL.grid, IMP = PL.implant, OX = PL.oxide, DF = PL.diffuse, R = PL.recipe, M = PL.measure;

function rc(sub, steps) { const r = R.create(sub); r.steps = steps; return r; }
const P15 = { type: 'p', N: 1e15 };

T('格子', () => {
  near('深さの格子は 8µm まで', G.ZE[G.NZ], 8 * G.UM, 1e-12);
  ok('表面は 4nm 刻み', Math.abs(G.DZ[0] - 4 * G.NM) < 1e-15);
  ok('深い所は 100nm まで粗くなる', Math.max(...Array.from(G.DZ)) <= 100 * G.NM + 1e-15);
  /* 最後の1つだけは 8µm で切るので短い。それ以外は単調に粗くなる */
  ok('刻みは単調に粗くなる（最後の端数を除く）', Array.from(G.DZ).slice(0, -1).every((v, i, a) => i === 0 || v >= a[i - 1] - 1e-15));
  eq('列の数', G.NX, 200);
  ok('格子点は多すぎない', G.NX * G.NZ < 60000);
});

T('酸化', () => {
  /* ウェットと厚いドライは Deal-Grove そのもの */
  [['wet', 900, 1], ['wet', 1000, 1], ['wet', 1100, 2], ['dry', 1000, 1], ['dry', 1100, 1], ['dry', 1000, 4]].forEach(([a, T_, h]) => {
    within(`${a} ${T_}℃ ${h}h が Deal-Grove と合う`, OX.grow(a, T_, 0, h), OX.dealGrove(a, T_, h, a === 'dry' ? OX.XI_DRY : 0), 1.01);
  });
  /* 教科書の数字そのもの */
  near('ドライ 1000℃ 1h ≒ 47nm', OX.grow('dry', 1000, 0, 1) * 1000, 47.5, 1.5);
  near('ウェット 1000℃ 1h ≒ 390nm', OX.grow('wet', 1000, 0, 1) * 1000, 388, 5);
  /* ドライの薄い領域では数 nm が作れる（x_i のごまかしでは作れない） */
  const thin = OX.grow('dry', 800, 0, 10 / 60) * 1000;
  ok('800℃ 10分で数 nm のゲート酸化膜', thin > 2 && thin < 8);
  /* 厚いほど遅い（放物線則） */
  ok('厚くなると遅くなる', OX.grow('wet', 1000, 0, 4) < 4 * OX.grow('wet', 1000, 0, 1));
  ok('ウェットはドライより速い', OX.grow('wet', 1000, 0, 1) > 5 * OX.grow('dry', 1000, 0, 1));
  ok('温度が高いほど速い', OX.grow('dry', 1100, 0, 1) > OX.grow('dry', 1000, 0, 1));

  /* 酸化はシリコンを食う（0.44） */
  const w = R.run(rc(P15, [{ t: 'heat', C: 1000, min: 60, amb: 'wet' }])).wafer;
  within('食われたシリコン = 0.44 × 酸化膜', w.siTop[100], 0.44 * M.oxideOn(w, 100), 1.001);
  /* 窒化膜の下は酸化されない */
  const w2 = R.run(rc(P15, [{ t: 'depo', mat: 'nit', nm: 100 }, { t: 'heat', C: 1000, min: 60, amb: 'wet' }])).wafer;
  eq('窒化膜の下は酸化されない', M.oxideOn(w2, 100), 0);
  eq('窒化膜の下のシリコンは食われない', w2.siTop[100], 0);
});

T('注入', () => {
  /* 表の値そのもの */
  near('B 100keV の Rp', IMP.range('B', 100).rp / G.NM, 307, 0.5);
  near('As 100keV の Rp', IMP.range('As', 100).rp / G.NM, 62, 0.5);
  ok('同じエネルギーなら重いほど浅い', IMP.range('As', 50).rp < IMP.range('P', 50).rp && IMP.range('P', 50).rp < IMP.range('B', 50).rp);
  ok('エネルギーで単調に深くなる', [10, 30, 100, 300].every((e, i, a) => i === 0 || IMP.range('P', e).rp > IMP.range('P', a[i - 1]).rp));
  ok('誤差関数', Math.abs(IMP.erf(1) - 0.8427008) < 2e-7 && Math.abs(IMP.Phi(0) - 0.5) < 1e-9);

  /* ドーズがそのまま入る（表面より上に出る裾のぶんだけ減る） */
  const w = G.create(P15);
  const r = IMP.implant(w, 'P', 100, 1e14);
  const inSi = G.inventory(w, 'P') / G.WIDTH;
  within('深い注入はドーズがほぼ全部入る', inSi, 1e14 * (1 - IMP.Phi(-r.rp / r.dr)), 1.002);
  /* ピークの深さは Rp */
  let best = 0, at = 0;
  for (let iz = 0; iz < G.NZ; iz++) { const c = w.C.P[G.idx(100, iz)]; if (c > best) { best = c; at = G.ZC[iz]; } }
  near('ピークの深さ = Rp', at / G.NM, r.rp / G.NM, 4);
  within('ピークの濃さ = Q/(√2π ΔRp)', best, 1e14 / (Math.sqrt(2 * Math.PI) * r.dr), 1.03);

  /* マスクで止まる／薄いと突き抜ける */
  const w2 = G.create(P15);
  R.DO.mask(w2, { open: R.maskRanges([[0, 5]]), nm: 1000 });
  const i2 = IMP.implant(w2, 'B', 100, 1e15);
  ok('開けた所には全部届く', i2.reached[20] > 0.999);
  ok('レジスト 1µm は B 100keV をほぼ止める', i2.reached[180] < 1e-3);
  const w3 = G.create(P15);
  R.DO.mask(w3, { open: R.maskRanges([[0, 5]]), nm: 300 });
  ok('レジスト 300nm は B 200keV に突き抜かれる', IMP.implant(w3, 'B', 200, 1e15).reached[180] > 0.9);
  /* 酸化膜越しは浅くなる */
  const w4 = G.create(P15);
  R.DO.depo(w4, { mat: 'ox', nm: 50 });
  IMP.implant(w4, 'P', 50, 1e14);
  let b4 = 0, a4 = 0;
  for (let iz = 0; iz < G.NZ; iz++) { const c = w4.C.P[G.idx(100, iz)]; if (c > b4) { b4 = c; a4 = G.ZC[iz]; } }
  ok('膜越しに打つと浅くなる', a4 < IMP.range('P', 50).rp - 30 * G.NM);
});

T('拡散', () => {
  /* 量は保存される */
  const w = G.create(P15);
  IMP.implant(w, 'B', 300, 1e14);
  const q0 = G.inventory(w, 'B');
  R.DO.heat(w, { C: 1000, min: 60, amb: 'N2' });
  within('熱処理で量が保存される', G.inventory(w, 'B'), q0, 1 + 1e-10);

  /* 表面から離れた深い注入なら、広がりは σ² = ΔRp² + 2Dt */
  const r = IMP.range('B', 300), Dt = DF.D('B', 1000) * 3600;
  let m0 = 0, m1 = 0, m2 = 0;
  for (let iz = 0; iz < G.NZ; iz++) { const c = w.C.B[G.idx(100, iz)] * G.DZ[iz]; m0 += c; m1 += c * G.ZC[iz]; }
  const mean = m1 / m0;
  for (let iz = 0; iz < G.NZ; iz++) { const c = w.C.B[G.idx(100, iz)] * G.DZ[iz]; m2 += c * (G.ZC[iz] - mean) ** 2; }
  within('広がりが解析解と合う（σ² = ΔRp² + 2Dt）', Math.sqrt(m2 / m0), Math.sqrt(r.dr ** 2 + 2 * Dt), 1.03);
  near('中心は動かない', mean / G.NM, r.rp / G.NM, 3);

  /* 係数 */
  within('D_B(1000℃) ≒ 1.5e-14', DF.D('B', 1000), 1.5e-14, 1.1);
  ok('As は B より1桁遅い', DF.D('As', 1000) < DF.D('B', 1000) / 5);
  ok('100℃ 上げると1桁近く速い', DF.D('P', 1100) > 5 * DF.D('P', 1000));

  /* 横にも広がる ― マスクの端で接合が回り込む */
  const w2 = R.run(rc(P15, [
    { t: 'mask', open: R.maskRanges([[0, 5]]), nm: 1500 }, { t: 'imp', ion: 'P', keV: 100, dose: 1e15 },
    { t: 'strip' }, { t: 'heat', C: 1100, min: 60, amb: 'N2' }
  ])).wafer;
  const edge = G.colAt(5.2 * G.UM);
  ok('マスクの外（5.2µm）にも接合が回り込む', M.xj(w2, edge) !== null);
  ok('マスクから十分離れれば回り込まない', M.xj(w2, G.colAt(8 * G.UM)) === null);
});

T('測る', () => {
  /* 接合深さ ― 深いガウス＋拡散を、解析解（鏡像込み）の接合と比べる */
  const w = R.run(rc(P15, [{ t: 'imp', ion: 'P', keV: 50, dose: 1e15 }, { t: 'heat', C: 1000, min: 30, amb: 'N2' }])).wafer;
  const r = IMP.range('P', 50), s2 = r.dr ** 2 + 2 * DF.D('P', 1000) * 1800;
  const C = (z) => 1e15 / Math.sqrt(2 * Math.PI * s2) * (Math.exp(-((z - r.rp) ** 2) / (2 * s2)) + Math.exp(-((z + r.rp) ** 2) / (2 * s2)));
  let lo = r.rp, hi = 4 * G.UM;
  for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (C(mid) > 1e15) lo = mid; else hi = mid; }
  within('接合深さが解析解と合う', M.xj(w, 100), lo, 1.04);

  /* シート抵抗: 一様な層なら 1/(q µ N t) */
  const w2 = G.create({ type: 'p', N: 1e15 });
  for (let iz = 0; iz < G.NZ; iz++) if (G.ZC[iz] < 0.5 * G.UM) w2.C.P[G.idx(100, iz)] = 1e18;
  const t = G.ZE[G.ZE.findIndex((z) => z >= 0.5 * G.UM - 1e-12)];
  const want = 1 / (1.602176634e-19 * SL.phys.muN(1e18 + 1e15, 300) * (1e18 - 1e15) * t);
  within('一様な層のシート抵抗が式と合う', M.sheet(w2, 100), want, 1.03);
  within('移動度は SemiLab のものをそのまま使う', M.mu(true, 3e16), SL.phys.muN(3e16, 300), 1 + 1e-12);

  /* SemiLab へ ― 量が保存され、接合が層の境目に来る */
  const semi = M.toSemi(w, 100, 'diode');
  ok('層の数は多すぎない', semi.layers.length <= 62);
  let qn = 0; semi.layers.forEach((L) => { qn += L.nd * L.tnm * G.NM; });
  const p = M.profile(w, 100);
  let qp = 0; for (let k = 0; k < p.n; k++) qp += p.nd[k] * p.dz[k];
  qp += 6000 * G.NM * 0;   /* 足した基板は n 型の分を持たない（p 基板） */
  within('ドナーの総量が保存される', qn, qp, 1.01);
  const st = SL.stack.create();
  semi.layers.forEach((L) => SL.stack.addLayer(st, L.mat, L.tnm, { na: L.na, nd: L.nd }));
  const m = SL.stack.mesh(st, 300);
  eq('SemiLab でも接合は1つ', SL.stack.junctionNodes(m).length, 1);
  within('SemiLab の接合位置 = プロセスラボの接合深さ', SL.stack.junctions(m)[0], M.xj(w, 100), 1.05);
  /* MOS として渡すと先頭が酸化膜 */
  const wm = R.run(rc(P15, [{ t: 'heat', C: 900, min: 10, amb: 'dry' }])).wafer;
  const sm = M.toSemi(wm, 100, 'mos');
  eq('MOS なら先頭は酸化膜', sm.layers[0].mat, 'ox');
  near('ゲート酸化膜の厚み', sm.layers[0].tnm, M.oxideOn(wm, 100) / G.NM, 0.01);
  ok('酸化膜が無ければダイオードとして渡したと言う', M.toSemi(w, 100, 'mos').note.length > 0);
});

T('工程', () => {
  /* エッチは選択的 ― 窒化膜で止まる */
  const w = R.run(rc(P15, [{ t: 'depo', mat: 'nit', nm: 50 }, { t: 'depo', mat: 'ox', nm: 100 }, { t: 'etch', mat: 'ox', nm: 0 }])).wafer;
  eq('酸化膜だけ取れて窒化膜で止まる', w.films[100].map((f) => f.mat).join(','), 'nit');
  /* レジストの下は削られない */
  const w2 = R.run(rc(P15, [{ t: 'depo', mat: 'ox', nm: 100 }, { t: 'mask', open: R.maskRanges([[0, 5]]), nm: 1000 }, { t: 'etch', mat: 'ox', nm: 0 }, { t: 'strip' }])).wafer;
  eq('開けた所の酸化膜は無い', M.oxideOn(w2, 20), 0);
  near('閉じた所の酸化膜は残る', M.oxideOn(w2, 180) / G.NM, 100, 1e-6);
  /* シリコンを掘ると不純物ごと無くなる */
  const w3 = R.run(rc(P15, [{ t: 'imp', ion: 'As', keV: 10, dose: 1e15 }, { t: 'etch', mat: 'si', nm: 100 }])).wafer;
  ok('掘ったぶんの不純物は無くなる', G.inventory(w3, 'As') < 1e15 * G.WIDTH * 1e-3);
  /* 注意書き */
  const w4 = R.run(rc(P15, [{ t: 'mask', open: R.maskAll(false), nm: 1000 }, { t: 'heat', C: 1000, min: 10, amb: 'N2' }])).wafer;
  ok('レジストのまま炉に入れると注意される', w4.notes.some((n) => /レジスト/.test(n)));
  ok('レジストは無くなっている', w4.films[100].length === 0);
  /* 途中を使い回しても結果は同じ */
  const r1 = rc(P15, [{ t: 'imp', ion: 'P', keV: 50, dose: 1e15 }, { t: 'heat', C: 1000, min: 20, amb: 'N2' }]);
  const a = R.run(r1);
  r1.steps.push({ t: 'heat', C: 900, min: 10, amb: 'dry' });
  const b = R.run(r1, a), c = R.run(JSON.parse(JSON.stringify(r1)));
  near('使い回した結果と、頭から計算した結果が同じ', M.xj(b.wafer, 100), M.xj(c.wafer, 100), 1e-12);
  ok('使い回したとき、変わっていない途中は同じもの', b.snaps[0] === a.snaps[0]);
});

T('第5章の計算 ― 第1部 14・16 の数字', () => {
  const C = PL.quest.calc;
  near('EUV の光子 1 個は 91.8 eV', 1239.84 / 13.5, 91.84, 0.01);
  within('30 mJ/cm²・一辺 10 nm で約 2,040 個', C.photons(30, 10, 13.5), 2039, 1.001);
  within('ArF なら約 29,100 個', C.photons(30, 10, 193), 29148, 1.001);
  near('揺らぎ 2.2%', 1 / Math.sqrt(C.photons(30, 10, 13.5)), 0.02215, 0.0001);
  near('2% に要る露光量 36.8 mJ/cm²', 2500 / C.photons(1, 10, 13.5), 36.79, 0.01);
  near('7.5 cm²・D₀ 0.1: ポアソン 47.2%', C.poisson(0.75), 0.4724, 0.0005);
  near('マーフィー 49.5%', C.murphy(0.75), 0.4949, 0.0005);
  near('負の二項 α 2 で 52.9%', C.negbin(0.75, 2), 0.5289, 0.0005);
  near('4 分割のポアソン 82.9%', C.poisson(0.1875), 0.8290, 0.0005);
  near('表: A·D₀ 1 の Seeds 50%', C.seeds(1), 0.5, 1e-12);
  near('表: A·D₀ 2 の負の二項 α 0.5 で 44.7%', C.negbin(2, 0.5), 0.4472, 0.0005);
  near('表: A·D₀ 0.5 のマーフィー 61.9%', C.murphy(0.5), 0.6193, 0.0005);
  ok('α が大きいとポアソンに近づく', Math.abs(C.negbin(0.75, 1e6) - C.poisson(0.75)) < 1e-5);
  const e = C.evaluate(C.of({ calc: { nsplit: 9 } }));
  near('9 分割で 1 個 0.933 cm²', e.chipA, 7.5 / 9 + 0.1, 1e-12);
  near('9 分割の歩留まり 91.3%', e.chipY, 0.9128, 0.0005);
  ok('計算の欄が無ければ既定値', C.of({}).dose === 30 && C.of(null).nsplit === 1);
  ok('壊れた値は既定値に戻す', C.of({ calc: { dose: 'x', d0: NaN } }).dose === 30 && C.of({ calc: { d0: NaN } }).d0 === 0.1);
});

report();
