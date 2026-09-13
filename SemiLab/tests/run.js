/* 物理とソルバの検査
 *
 * 数値解が「それらしい」だけでは意味がない。**解析解と突き合わせる**。
 * 合わないところは、合わない理由が分かっていて、その理由ごと検査に書いてある。
 *
 *   node tests/run.js
 */
'use strict';
const { load, T, eq, near, within, ok, report } = require('./harness.js');
const SL = load();
const P = SL.phys, ST = SL.stack, PS = SL.poisson, BAND = SL.band, DEV = SL.dev, LIGHT = SL.light;

const EPS_SI = P.SI.epsR * P.EPS0;
const T300 = 300;

function diodeStack(na, nd, tl, tr) {
  const st = ST.create();
  ST.addLayer(st, 'si', tl, { na });
  ST.addLayer(st, 'si', tr, { nd });
  return st;
}
function mosStack(toxNm, na, tSi) {
  const st = ST.create();
  ST.addLayer(st, 'ox', toxNm);
  ST.addLayer(st, 'si', tSi || 500, { na });
  return st;
}
function analyticW(na, nd, V, vbi) {
  return Math.sqrt(2 * EPS_SI * (vbi - V) / P.Q * (1 / na + 1 / nd));
}

/* ================= 1. 物理定数 ================= */

T('物理', () => {
  near('Vt(300K)', P.vt(300), 0.02585, 1e-5);
  near('Eg(300K)', P.eg(300), 1.1245, 1e-3);
  near('ni(300K)', P.ni(300), 1.0e10, 1e8);
  ok('ni は温度で上がる', P.ni(350) > P.ni(300) * 10);
  ok('ni は温度で下がる', P.ni(250) < P.ni(300) / 10);
  near('Dn(1e15)', P.diff(P.muN(1e15, 300), 300), 32.4, 1.0);
  ok('µ は濃度が上がると落ちる', P.muN(1e19) < P.muN(1e15) / 5);
  ok('τ は濃度が上がると縮む', P.tau(1e19) < P.tau(1e14) / 100);
  /* 吸収は波長で単調に落ちる（間接遷移の裾） */
  for (let nm = 400; nm < 1100; nm += 50) {
    ok(`α(${nm}) > α(${nm + 50})`, P.alpha(nm) > P.alpha(nm + 50));
  }
  near('α(800nm)', P.alpha(800), 850, 1);
  near('裸シリコンの反射(600nm)', P.reflect(600), 0.355, 0.01);
  /* バンドギャップの端 ― 1100nm の光子は Eg とほぼ同じ */
  near('1100nm の光子エネルギー', LIGHT.HC_EV_NM / 1100, P.eg(300), 0.01);
  /* 中性の電位 */
  near('n型1e16 の電位', P.neutralPsi(1e16, 300), P.vt(300) * Math.log(1e16 / P.ni(300)), 1e-4);
  near('p型1e16 の電位', P.neutralPsi(-1e16, 300), -P.vt(300) * Math.log(1e16 / P.ni(300)), 1e-4);
});

/* ================= 2. 格子 ================= */

T('格子', () => {
  const st = diodeStack(1e19, 1e16, 300, 2000);
  const m = ST.mesh(st, T300);

  /* 刻みの合計が厚みとぴったり合う */
  near('全体の厚み', m.x[m.n - 1], 2300 * ST.NM, 1e-12);
  ok('点は左から右へ並んでいる', m.x.every((v, i) => i === 0 || v > m.x[i - 1]));

  /* 制御体積の合計＝厚み（半分ずつ足しても合う） */
  let sum = 0;
  for (let i = 0; i < m.n; i++) sum += m.dxL[i] + m.dxR[i];
  near('制御体積の合計', sum, m.x[m.n - 1], 1e-12);

  /* 接合は界面の上にぴったり乗る（格子の刻み半分ずれない） */
  const js = ST.junctions(m);
  eq('接合の数', js.length, 1);
  near('接合の位置', js[0], 300 * ST.NM, 1e-12);

  /* 界面の刻みは「両隣の細かいほう」に合わせる ― ここを外して電荷を2倍数えた */
  const j = ST.junctionNodes(m)[0];
  const hRight = m.x[j + 1] - m.x[j];
  const ldHeavy = ST.debye({ mat: 'si', na: 1e19, nd: 0, tnm: 300 }, T300);
  ok('接合の n 側の刻みは濃い側のデバイ長より細かい', hRight < ldHeavy);

  /* 半分ごとに濃度が分かれている */
  eq('接合ノードの左半分は p 側', m.netL[j] < 0, true);
  eq('接合ノードの右半分は n 側', m.netR[j] > 0, true);

  /* 点が増えすぎない */
  const thick = diodeStack(1e19, 1e14, 300, 300000);
  const m2 = ST.mesh(thick, T300);
  ok('点数に上限が効く', m2.n <= ST.MAX_NODES);
  near('厚い構造でも厚みは合う', m2.x[m2.n - 1], 300300 * ST.NM, 1e-10);

  /* 酸化膜を端に置くとゲートになる */
  const mm = ST.mesh(mosStack(5, 1e17), T300);
  eq('左はゲート', mm.left, ST.GATE);
  eq('右はオーミック', mm.right, ST.OHMIC);
});

/* ================= 3. ポアソン ================= */

T('ポアソン', () => {
  /* --- 一片だけ。中性になるはず --- */
  const bulk = ST.create();
  ST.addLayer(bulk, 'si', 1000, { nd: 1e16 });
  const mb = ST.mesh(bulk, T300);
  const sb = PS.solve(mb, { left: 0, right: 0 });
  ok('一片は収束する', sb.ok);
  within('一片の電子', sb.n[Math.floor(mb.n / 2)], 1e16, 1.001);
  within('一片の n·p', sb.n[5] * sb.p[5], P.ni(300) ** 2, 1.01);
  ok('一片には電界が立たない', Math.max(...Array.from(sb.E).map(Math.abs)) < 1);

  /* --- pn 接合。ビルトイン電位は厳密に一致するはず --- */
  const cases = [
    [1e17, 1e17, 0, 500, 500], [1e17, 1e17, -2, 1000, 1000],
    [1e15, 1e15, 0, 4000, 4000], [1e19, 1e16, 0, 300, 2000],
    [1e19, 1e16, -10, 300, 4000], [1e18, 1e15, -5, 300, 12000],
    [1e20, 1e14, -20, 200, 60000]
  ];
  for (const [na, nd, V, tl, tr] of cases) {
    const m = ST.mesh(diodeStack(na, nd, tl, tr), T300);
    const sol = PS.solve(m, { left: V, right: 0 });
    const tag = `Na=${na.toExponential(0)} Nd=${nd.toExponential(0)} V=${V}`;
    ok(`${tag} 収束`, sol.ok);

    const vbiAn = P.vt(300) * Math.log(na * nd / P.ni(300) ** 2);
    const drop = sol.psi[m.n - 1] - sol.psi[0];
    near(`${tag} 全体の電位差`, drop, vbiAn - V, 2e-3);

    const dep = PS.depletionByCharge(sol);
    const wAn = analyticW(na, nd, V, vbiAn);
    /* 空乏近似との差は「デバイ長ぶんの裾」。逆バイアスが深いほど縮む ―
     * だから許容は 7%。ここを 1% にすると、正しい解が落ちる */
    within(`${tag} 空乏層幅`, dep.w, wAn, 1.07);
    ok(`${tag} 空乏層は片側の合計`, Math.abs(dep.wp + dep.wn - dep.w) < 1e-12);
    /* 【Na·Wp = Nd·Wn を課さないこと】
     * wp / wn は「多数キャリアの欠損」で測っている（poisson.js の注記）。
     * 片側接合では、濃い側の欠損はデバイ長ぶんの遮蔽で決まっていて、
     * 空乏近似の Wp とは別物。電荷が釣り合っているかは charge() が別に見ている。
     * 課すべきなのは「濃い側ほど狭い」という向きだけ。 */
    if (na > nd) ok(`${tag} 濃い側のほうが狭い`, dep.wp < dep.wn);
    if (nd > na) ok(`${tag} 濃い側のほうが狭い`, dep.wn < dep.wp);
    if (na === nd) within(`${tag} 対称なら両側同じ`, dep.wp, dep.wn, 1.02);
  }

  /* --- 逆バイアスを深くすると空乏近似に近づく（裾の効きが相対的に減る） --- */
  const m3 = ST.mesh(diodeStack(1e17, 1e17, 3000, 3000), T300);
  const vbi3 = P.vt(300) * Math.log(1e34 / P.ni(300) ** 2);
  const err = (V) => {
    const d = PS.depletionByCharge(PS.solve(m3, { left: V, right: 0 }));
    return Math.abs(d.w - analyticW(1e17, 1e17, V, vbi3)) / analyticW(1e17, 1e17, V, vbi3);
  };
  ok('逆バイアスが深いほど空乏近似に近づく', err(-10) < err(0));

  /* --- 電界と電位のつじつま（∫E dx = 電位差） --- */
  const m4 = ST.mesh(diodeStack(1e17, 1e16, 1000, 3000), T300);
  const s4 = PS.solve(m4, { left: -3, right: 0 });
  let integ = 0;
  for (let i = 0; i < m4.n - 1; i++) {
    integ += (s4.E[i] + s4.E[i + 1]) / 2 * (m4.x[i + 1] - m4.x[i]);
  }
  /* E は「区間で出して点に均した」表示用の量なので、台形で積むと
   * 電界の尖ったところでわずかにずれる。1% 以内なら健全 */
  within('∫E dx = −(電位差)', -integ, s4.psi[m4.n - 1] - s4.psi[0], 1.01);

  /* --- ガウスの法則: 最大電界 = 空乏電荷/ε --- */
  const dep4 = PS.depletionByCharge(s4);
  within('ε·Emax は片側の全電荷に等しい', dep4.qDep, EPS_SI * Math.abs(dep4.emax), 1.001);

  /* --- 全体は中性 --- */
  ok('半導体全体は電気的に中性', Math.abs(PS.charge(s4)) < 1e-12);

  /* --- 準フェルミ電位の置き方（ショックレーの境界条件が出てくる） --- */
  for (const V of [-0.3, 0, 0.3, 0.5]) {
    const m5 = ST.mesh(diodeStack(1e18, 1e16, 2000, 4000), T300);
    const s5 = PS.solve(m5, { left: V, right: 0 });
    const dep5 = PS.depletionByCharge(s5);
    /* n 側の空乏層の端の、少数キャリア（正孔）は (ni²/Nd)·exp(V/Vt) のはず */
    const iEdge = ST.nodeAt(m5, dep5.xj + dep5.wn * 1.6);
    const want = P.ni(300) ** 2 / 1e16 * Math.exp(V / P.vt(300));
    within(`V=${V} で n 側の少数キャリアがショックレー式に合う`, s5.p[iEdge], want, 1.35);
  }

  /* --- 真性層（pin）は電荷で測れないので電界で測る --- */
  const pin = ST.create();
  ST.addLayer(pin, 'si', 500, { na: 1e19 });
  ST.addLayer(pin, 'si', 3000, {});
  ST.addLayer(pin, 'si', 500, { nd: 1e19 });
  const sp = PS.solve(ST.mesh(pin, T300), { left: 0, right: 0 });
  const span = PS.fieldSpan(sp, 0.05);
  ok('pin の電界は i 層をまたいで立つ', span.w >= 2900 * ST.NM);
  /* i 層の中では電界がほぼ一定（電荷が無いので傾かない） */
  const mp = sp.mesh;
  const inI = [];
  for (let i = 0; i < mp.n; i++) {
    if (mp.x[i] > 700 * ST.NM && mp.x[i] < 3300 * ST.NM) inI.push(Math.abs(sp.E[i]));
  }
  /* 【平衡では完全には平らにならない】i 層といっても、p+ 側の端では
   * ψ が −0.5V あたりまで下がっていて、正孔が 1e18 台まで染み出している。
   * その電荷のぶんだけ電界が傾く。逆バイアスをかけて掃き出すと平らになる ―
   * そこまで込みで見るのが正しい検査。 */
  within('i 層の電界は pn 接合よりずっと平ら', Math.max(...inI), Math.min(...inI), 1.6);
  const spRev = PS.solve(sp.mesh, { left: -5, right: 0 });
  const inIR = [];
  for (let i = 0; i < mp.n; i++) {
    if (mp.x[i] > 700 * ST.NM && mp.x[i] < 3300 * ST.NM) inIR.push(Math.abs(spRev.E[i]));
  }
  const flat = (a) => Math.max(...a) / Math.min(...a);
  ok('逆バイアスをかけると i 層の電界はもっと平らになる', flat(inIR) < flat(inI));
});

/* ================= 4. MOS ================= */

T('MOS', () => {
  const st = mosStack(5, 1e17);
  const mm = DEV.mos(st, T300);

  near('φF', mm.phiF, P.vt(300) * Math.log(1e17 / P.ni(300)), 1e-6);
  near('Cox', mm.Cox, P.OX.epsR * P.EPS0 / (5e-7), 1e-12);

  /* しきい値とフラットバンドは、ポアソンで探した値と教科書の式が一致する */
  near('VFB（数値 vs 式）', mm.vfb, mm.vfbAnalytic, 5e-3);
  near('Vth（数値 vs 式）', mm.vth, mm.vthAnalytic, 5e-3);

  /* フラットバンドでは表面ポテンシャルがゼロ */
  near('VFB で φs = 0', PS.surfacePsi(mm.at(mm.vfb)), 0, 2e-3);
  /* しきい値では φs = 2φF */
  near('Vth で φs = 2φF', PS.surfacePsi(mm.at(mm.vth)), 2 * mm.phiF, 5e-3);

  /* 蓄積 → 空乏 → 反転 の順に並ぶ */
  const acc = PS.surfacePsi(mm.at(mm.vfb - 1.5));
  const depl = PS.surfacePsi(mm.at((mm.vfb + mm.vth) / 2));
  const inv = PS.surfacePsi(mm.at(mm.vth + 1.5));
  ok('蓄積では φs < 0', acc < 0);
  ok('空乏では 0 < φs < 2φF', depl > 0 && depl < 2 * mm.phiF);
  ok('反転では φs > 2φF', inv > 2 * mm.phiF);
  /* 強反転に入ると φs はほとんど動かない（反転層が電界を受け止める） */
  ok('強反転で φs は頭打ち', Math.abs(PS.surfacePsi(mm.at(mm.vth + 3)) - inv) < 0.12);

  /* 反転電荷はしきい値の上で急に立ち上がる */
  ok('Vth の下では反転電荷が小さい', mm.qinv(mm.vth - 0.3) < mm.qinv(mm.vth) / 100);
  ok('Vth の上では反転電荷が育つ', mm.qinv(mm.vth + 1) > 1e12);

  /* S 値は室温の下限を割らない */
  const floor = Math.LN10 * P.vt(300);
  ok('S 値は 60mV/dec を割らない', mm.swing > floor);
  ok('S 値は下限からそう遠くない', mm.swing < floor * 2);

  /* 酸化膜を薄くすると Vth が下がり S も良くなる */
  const thin = DEV.mos(mosStack(2, 1e17), T300);
  ok('酸化膜が薄いと Vth が下がる', thin.vth < mm.vth);
  ok('酸化膜が薄いと S 値が良くなる', thin.swing < mm.swing);

  /* 基板を濃くすると Vth が上がる */
  const heavy = DEV.mos(mosStack(5, 1e18), T300);
  ok('基板が濃いと Qdep/Cox が増える', heavy.qdep > mm.qdep);

  /* C-V は蓄積で Cox に張り付く */
  const cvs = DEV.cv(st, [mm.vfb - 2, (mm.vfb + mm.vth) / 2, mm.vth + 2], T300);
  within('蓄積の容量は Cox', cvs[0].c, mm.Cox, 1.15);
  ok('空乏で容量が下がる', cvs[1].c < cvs[0].c * 0.8);
  ok('反転でまた上がる', cvs[2].c > cvs[1].c);

  /* MOSFET は仮定なしに飽和する */
  const r = DEV.idvd(st, mm.vth + 1.0, 2.0, T300, 20);
  const pts = r.points;
  ok('Id は単調に増える', pts.every((p, i) => i === 0 || p.idPerWL >= pts[i - 1].idPerWL - 1e-18));
  const slopeEarly = pts[3].idPerWL - pts[2].idPerWL;
  const slopeLate = pts[pts.length - 1].idPerWL - pts[pts.length - 2].idPerWL;
  ok('Vd を上げると傾きが寝る（飽和する）', slopeLate < slopeEarly * 0.35);
});

/* ================= 4.5 pMOS（n 基板）とゲートの材料 =================
 *
 * 【n 基板で一度まちがえていた】 dev.js の二分法が n 基板のとき向きを逆にしていて、
 * VFB も Vth も探索範囲の端（+5.4 V）を返していた。式（−1.22 V）と突き合わせる検査が
 * 無かったので気付かなかった ― ここがその見張り。
 */

function pmosStack(toxNm, nd, gate) {
  const st = ST.create();
  ST.addLayer(st, 'ox', toxNm);
  ST.addLayer(st, 'si', 500, { nd });
  if (gate) st.gate = gate;
  return st;
}

T('pMOS', () => {
  const st = pmosStack(5, 1e17, 'p+poly');
  const mp = DEV.mos(st, T300);
  ok('n 基板は pMOS と見分ける', !mp.pType);
  eq('ゲートの材料が構造から来る', mp.gate, 'p+poly');
  near('φF は負', mp.phiF, -P.vt(300) * Math.log(1e17 / P.ni(300)), 1e-6);

  /* 数値と式が一致する（nMOS と同じ 5mV） */
  near('pMOS の VFB（数値 vs 式）', mp.vfb, mp.vfbAnalytic, 5e-3);
  near('pMOS の Vth（数値 vs 式）', mp.vth, mp.vthAnalytic, 5e-3);
  near('VFB で φs = 0', PS.surfacePsi(mp.at(mp.vfb)), 0, 2e-3);
  near('Vth で φs = 2φF（負）', PS.surfacePsi(mp.at(mp.vth)), 2 * mp.phiF, 5e-3);

  /* 並びが鏡写し ― 蓄積は正のゲート側、反転は負の側 */
  const acc = PS.surfacePsi(mp.at(mp.vfb + 1.5));
  const depl = PS.surfacePsi(mp.at((mp.vfb + mp.vth) / 2));
  const inv = PS.surfacePsi(mp.at(mp.vth - 1.5));
  ok('蓄積では φs > 0', acc > 0);
  ok('空乏では 2φF < φs < 0', depl < 0 && depl > 2 * mp.phiF);
  ok('反転では φs < 2φF', inv < 2 * mp.phiF);
  ok('Vth より上では反転電荷（正孔）が小さい', mp.qinv(mp.vth + 0.3) < mp.qinv(mp.vth) / 100);
  ok('Vth より下では反転電荷（正孔）が育つ', mp.qinv(mp.vth - 1) > 1e12);

  /* 以前の誤りの見張り: n+ ポリの n 基板は Vth が負で、式と一致する */
  const np = DEV.mos(pmosStack(5, 1e17), T300);
  ok('n+ ポリの n 基板は Vth が負（探索の端 +5.4V を返さない）', np.vth < 0);
  near('n+ ポリの n 基板の Vth（数値 vs 式）', np.vth, np.vthAnalytic, 5e-3);
  /* 式の形 Vth = −ψB − (χ+Eg/2 − φm) − Qdep/Cox ― 1e15 以上なら −0.86 V より深い */
  ok('n+ ポリのままでは 1e15 の基板でも −0.86 V より深い', DEV.mos(pmosStack(5, 1e15), T300).vth < -0.86);

  /* 鏡写し: 同じ濃度・同じ酸化膜の nMOS（n+ ポリ）と、Vth は符号が逆で
   * 大きさの差はゲートの非対称（n+ ポリは中央から 0.5623 V、p+ ポリは 0.5577 V）だけ */
  const mn = DEV.mos(mosStack(5, 1e17), T300);
  const mid = P.SI.chi + P.eg(300) / 2;
  const asym = (mid - P.WORKFN['n+poly']) - (P.WORKFN['p+poly'] - mid);
  near('鏡写し: Vth_p = −Vth_n − 非対称', mp.vth, -mn.vth - asym, 2e-3);
  near('鏡写し: S 値は同じ', mp.swing, mn.swing, 1e-9);

  /* ゲートの材料: p 基板のまま n+ → p+ ポリで Vth は仕事関数の差（1.12 eV）だけずれる */
  const pp = DEV.mos(Object.assign(mosStack(5, 1e17), { gate: 'p+poly' }), T300);
  near('ゲートの材料で Vth が Δφm だけずれる', pp.vth - mn.vth, P.WORKFN['p+poly'] - P.WORKFN['n+poly'], 3e-3);
  eq('ゲートを書かなければ n+ ポリ', ST.mesh(mosStack(5, 1e17), T300).gate, 'n+poly');
  near('solve も構造のゲートを使う', PS.surfacePsi(PS.solve(ST.mesh(st, T300), { left: 0, right: 0 })),
       PS.surfacePsi(mp.at(0)), 1e-6);

  /* C-V も鏡写し ― 蓄積（正の側）で Cox、空乏で下がり、反転（負の側）でまた上がる */
  const cvs = DEV.cv(st, [mp.vfb + 2, (mp.vfb + mp.vth) / 2, mp.vth - 2], T300);
  within('pMOS の蓄積の容量は Cox', cvs[0].c, mp.Cox, 1.15);
  ok('pMOS も空乏で容量が下がる', cvs[1].c < cvs[0].c * 0.8);
  ok('pMOS も反転でまた上がる', cvs[2].c > cvs[1].c);

  /* Id-Vd: Vd は負へ掃き、正孔で飽和する。同じオーバードライブなら電流比は µn/µp */
  const rp = DEV.idvd(st, mp.vth - 1.0, 2.0, T300, 20);
  const rn = DEV.idvd(mosStack(5, 1e17), mn.vth + 1.0, 2.0, T300, 20);
  const pts = rp.points;
  ok('pMOS の Vd は負の側', pts[pts.length - 1].vd < 0);
  near('pMOS の Vd は −2 V まで', pts[pts.length - 1].vd, -2, 1e-12);
  ok('pMOS の |Id| は単調に増える', pts.every((p, i) => i === 0 || p.idPerWL >= pts[i - 1].idPerWL - 1e-18));
  ok('pMOS も |Vd| を上げると飽和する',
     pts[pts.length - 1].idPerWL - pts[pts.length - 2].idPerWL < (pts[3].idPerWL - pts[2].idPerWL) * 0.35);
  near('pMOS の移動度は µp', rp.mu, P.muP(1e17, 300), 1e-9);
  within('電流比 nMOS/pMOS は µn/µp', rn.points[20].idPerWL / pts[20].idPerWL, P.muN(1e17, 300) / P.muP(1e17, 300), 1.02);
});

/* ================= 5. ダイオード ================= */

T('ダイオード', () => {
  const st = diodeStack(1e18, 1e16, 1000, 3000);
  const d = DEV.diode(st, T300);

  near('Vbi', d.Vbi, P.vt(300) * Math.log(1e18 * 1e16 / P.ni(300) ** 2), 1e-9);

  /* 空乏近似の W が、ポアソンを解いた W と 7% 以内 ―
   * I-V の中で解析式を使っている根拠がこれ */
  const m = ST.mesh(st, T300);
  for (const V of [0, -1, -5]) {
    const dep = PS.depletionByCharge(PS.solve(m, { left: V, right: 0 }));
    within(`W(${V}V) 解析 vs ポアソン`, d.width(V), dep.w, 1.07);
  }

  /* 整流 */
  ok('順方向と逆方向で百万倍以上ちがう',
     Math.abs(d.iv(0.6).j) / Math.abs(d.iv(-0.6).j) > 1e6);
  ok('0V では電流が流れない', Math.abs(d.iv(0).j) < 1e-20);
  ok('逆方向は負', d.iv(-2).j < 0);

  /* 理想係数 ― 低電圧は再結合(n→2)、中ほどは拡散(n=1)、高電流は直列抵抗 */
  const n = (v) => 0.01 / (P.vt(300) * Math.log(d.iv(v + 0.01).j / d.iv(v).j));
  ok('中ほどの理想係数は 1 に近い', Math.abs(n(0.45) - 1) < 0.08);
  ok('低い電圧では 1 より大きい', n(0.15) > 1.2);
  ok('高い電流では直列抵抗で n が大きくなる', n(0.85) > 1.5);

  /* 濃くすると J0 が下がる */
  const heavy = DEV.diode(diodeStack(1e19, 1e19, 20000, 20000), T300);
  ok('濃いほど J0 が小さい', heavy.j0 < d.j0 / 10);

  /* 薄くすると J0 が上がる（短基底） */
  const short_ = DEV.diode(diodeStack(1e19, 1e16, 10000, 1000), T300);
  const long_ = DEV.diode(diodeStack(1e19, 1e16, 10000, 400000), T300);
  ok('中性領域が薄いほど J0 が大きい', short_.j0 > long_.j0 * 5);

  /* 温度を上げると漏れが増える（ni² が効く） */
  const hot = DEV.diode(st, 350);
  ok('温度が上がると J0 が桁で増える', hot.j0 > d.j0 * 50);

  /* 容量は逆バイアスで下がる */
  ok('逆バイアスで接合容量が下がる', d.cap(-5) < d.cap(0));
  within('C = ε/W', d.cap(-3), EPS_SI / d.width(-3), 1.0001);

  /* 見分け */
  eq('pn 接合と見分ける', DEV.identify(st).kind, DEV.KIND.DIODE);
  eq('MOS と見分ける', DEV.identify(mosStack(5, 1e17)).kind, DEV.KIND.MOS);
  const pin = ST.create();
  ST.addLayer(pin, 'si', 500, { na: 1e19 });
  ST.addLayer(pin, 'si', 3000, {});
  ST.addLayer(pin, 'si', 500, { nd: 1e19 });
  eq('pin と見分ける', DEV.identify(pin).kind, DEV.KIND.PIN);
});

/* ================= 6. 光 ================= */

T('光', () => {
  const st = ST.create();
  ST.addLayer(st, 'si', 300, { na: 1e19 });
  ST.addLayer(st, 'si', 10000, { nd: 1e15 });
  ST.addLayer(st, 'si', 2000, { nd: 1e19 });
  const m = ST.mesh(st, T300);
  const sol = PS.solve(m, { left: -5, right: 0 });

  const at = (nm, o) => LIGHT.photo(st, sol, Object.assign({ nm, power: 1e-3, sFront: 1e4 }, o || {}));

  /* 量子効率は 0〜1 の間 */
  for (let nm = 300; nm <= 1150; nm += 50) {
    const r = at(nm);
    ok(`QE(${nm}) は 0〜1`, r.qe >= 0 && r.qe <= 1);
    ok(`QE(${nm}) は反射のぶんを超えない`, r.qe <= 1 - r.reflect + 1e-9);
  }

  /* ピークは真ん中あたり */
  const peak = [400, 500, 600, 700, 800, 900, 1000].map(nm => [nm, at(nm).resp]);
  const best = peak.reduce((a, b) => (b[1] > a[1] ? b : a));
  ok('感度のピークは 500〜800nm', best[0] >= 500 && best[0] <= 800);
  near('ピークの感度は 0.3 A/W あたり', best[1], 0.30, 0.10);

  /* 青は表面のせいで落ちる ― S を変えると動く */
  const blueLowS = at(400, { sFront: 1e2 }).qe;
  const blueHighS = at(400, { sFront: 1e7 }).qe;
  ok('表面再結合が大きいと青が落ちる', blueHighS < blueLowS * 0.6);
  /* 赤は表面のせいでは落ちない ― 動かない */
  within('表面再結合は赤にほとんど効かない',
         at(900, { sFront: 1e2 }).qe, at(900, { sFront: 1e7 }).qe, 1.05);

  /* 赤は厚みのせいで落ちる */
  const thick = ST.create();
  ST.addLayer(thick, 'si', 300, { na: 1e19 });
  ST.addLayer(thick, 'si', 200000, { nd: 1e14 });
  ST.addLayer(thick, 'si', 2000, { nd: 1e19 });
  const solT = PS.solve(ST.mesh(thick, T300), { left: -5, right: 0 });
  const redThick = LIGHT.photo(thick, solT, { nm: 1000, power: 1e-3, sFront: 1e4 }).qe;
  ok('厚くすると赤が拾える', redThick > at(1000).qe * 3);
  /* 青は厚みでは変わらない */
  within('厚みは青にほとんど効かない',
         LIGHT.photo(thick, solT, { nm: 400, power: 1e-3, sFront: 1e4 }).qe, at(400).qe, 1.10);

  /* バンドギャップより長い波長は吸われない */
  ok('1200nm はほとんど拾えない', at(1200).qe < 0.01);
  ok('1200nm は Eg を割っている', at(1200).below);
  ok('900nm は Eg を割っていない', !at(900).below);

  /* 反射防止を効かせると素直に増える */
  const bare = at(700).qe, ar = at(700, { ar: 0.01 }).qe;
  within('反射を消したぶんだけ増える', ar / bare, (1 - 0.01) / (1 - P.reflect(700)), 1.06);

  /* 収支が合う ― 拾った量 + 逃した量 = 入った量 */
  const r = at(600);
  const sum = r.parts.dep + r.parts.front + r.parts.back
            + r.loss.surface + r.loss.bulk + r.loss.transmit + r.loss.reflect;
  within('光子の収支が合う', sum, r.flux, 1.02);

  /* 逆バイアスを深くすると空乏層が広がって拾えるようになる */
  const sol0 = PS.solve(m, { left: 0, right: 0 });
  const qe0 = LIGHT.photo(st, sol0, { nm: 800, power: 1e-3 }).qe;
  const qe5 = at(800).qe;
  ok('逆バイアスをかけると拾える量が増える', qe5 >= qe0);
});

/* ================= 7. バンド図 ================= */

T('バンド図', () => {
  const st = diodeStack(1e17, 1e17, 1000, 1000);
  const m = ST.mesh(st, T300);

  /* 平衡ではフェルミ準位が1本 */
  const s0 = PS.solve(m, { left: 0, right: 0 });
  ok('平衡では準フェルミ準位が重なる', BAND.splitEF(s0) < 1e-12);
  const b0 = BAND.bands(s0);
  for (let i = 0; i < m.n; i++) {
    ok('Ec は Ev より上', b0.ec[i] > b0.ev[i]);
  }
  near('禁制帯の幅', b0.ec[10] - b0.ev[10], P.eg(300), 1e-9);
  /* バンドの曲がり＝ビルトイン電位 */
  near('バンドの曲がりは Vbi', b0.ei[0] - b0.ei[m.n - 1],
       P.vt(300) * Math.log(1e34 / P.ni(300) ** 2), 2e-3);

  /* バイアスをかけると2本が離れ、その隔たりが印加電圧 */
  const s1 = PS.solve(m, { left: 0.4, right: 0 });
  near('準フェルミ準位の隔たり = 印加電圧', BAND.splitEF(s1), 0.4, 1e-9);

  /* 酸化膜は壁として立つ */
  const bm = BAND.bands(PS.solve(ST.mesh(mosStack(5, 1e17), T300), { left: 0, right: 0 }));
  /* 段差は界面で測る。酸化膜の反対の端（ゲート側）で測ると、
   * 酸化膜にかかっている電圧のぶんだけ引かれて 3.10 にならない */
  const iSi = bm.isOx.lastIndexOf(true) + 1;
  near('界面での伝導帯の段差', bm.ec[iSi - 1] - bm.ec[iSi], BAND.oxOffset(), 0.05);
  ok('酸化膜の Ec はシリコンより高い', bm.ec[iSi - 1] > bm.ec[iSi] + 2.5);
  near('伝導帯の段差は電子親和力の差', BAND.oxOffset(), P.SI.chi - P.OX.chi, 1e-9);
});

/* ================= 7.5 左右を入れ替えても同じ／容量は動く電荷で ================= */

T('左右と容量', () => {
  /* n を左に置いても、空乏層は同じ幅で立つ（以前は 0 になっていた） */
  const a = ST.create(); ST.addLayer(a, 'si', 1000, { na: 1e17 }); ST.addLayer(a, 'si', 1000, { nd: 1e16 });
  const b = ST.create(); ST.addLayer(b, 'si', 1000, { nd: 1e16 }); ST.addLayer(b, 'si', 1000, { na: 1e17 });
  const da = PS.depletionByCharge(PS.solve(ST.mesh(a, T300), { left: 0, right: 0 }));
  const db = PS.depletionByCharge(PS.solve(ST.mesh(b, T300), { left: 0, right: 0 }));
  ok('n が左でも空乏層が立つ', db.w > 0.1e-4);
  within('左右を入れ替えても幅は同じ', db.w, da.w, 1.001);
  within('型ごとの幅（n 側）も同じ', db.wn, da.wn, 1.001);
  within('位置の幅は入れ替わる（左 ↔ 右）', db.wL, da.wR, 1.001);
  ok('n が左なら leftIsP は偽', db.leftIsP === false && da.leftIsP === true);

  /* 光も、n が左の構造で拾える（空乏層の位置を型ではなく左右で出しているか） */
  const pd = ST.create();
  ST.addLayer(pd, 'si', 300, { nd: 1e19 }); ST.addLayer(pd, 'si', 10000, { na: 1e15 }); ST.addLayer(pd, 'si', 2000, { na: 1e19 });
  const spd = PS.solve(ST.mesh(pd, T300), { left: 0, right: -5 });
  ok('n+ を表に置いたフォトダイオードでも 600nm を拾う', LIGHT.photo(pd, spd, { nm: 600, power: 1e-3 }).qe > 0.4);

  /* 容量は「動く電荷」の微分。空乏近似の ε/W と合う。双極子電荷（ε·Emax）では1桁小さく出る */
  const st = diodeStack(1e19, 1e15, 300, 10000), m = ST.mesh(st, T300), d = DEV.diode(st, T300);
  const Q = (v, key) => PS.depletionByCharge(PS.solveRobust(m, { left: v, right: 0 }))[key];
  const cMove = (Q(-3.05, 'qMove') - Q(-2.95, 'qMove')) / 0.1;
  const cDip = (Q(-3.05, 'qDep') - Q(-2.95, 'qDep')) / 0.1;
  within('動く電荷の微分は ε/W と合う', cMove, d.cap(-3), 1.05);
  ok('双極子電荷の微分は容量にならない（片側接合）', cDip < d.cap(-3) / 3);
});

/* ================= 8. 数値の読み取り（parse.js） ================= */

T('数値の読み取り', () => {
  const PR = SL.parse;
  eq('1e17', PR.dope('1e17'), 1e17);
  eq('1×10^17', PR.dope('1×10^17'), 1e17);
  eq('10¹⁷（上付き）', PR.dope('10¹⁷'), 1e17);
  eq('全角 １ｅ１６', PR.dope('１ｅ１６'), 1e16);
  eq('1017 は 1017', PR.dope('1017'), 1017);
  eq('空の濃度は「入れない」', PR.dope(''), 0);
  ok('負の濃度は NaN', isNaN(PR.dope('-1e16')));
  ok('読めない濃度は NaN（0 にしない）', isNaN(PR.dope('abc')));
  eq('ドーズは cm⁻² を付けても読む', PR.sci('5e14cm^-2'), 5e14);
  ok('ドーズの空は NaN（濃度と違って 0 にしない）', isNaN(PR.sci('')));
  eq('12V', PR.num('12V'), 12);
  eq('−5（全角マイナス）', PR.num('−5'), -5);
  eq('450nm', PR.num('450nm'), 450);
  eq('100keV を「100ke」にしない', PR.num('100keV'), 100);
  eq('900℃', PR.num('900℃'), 900);
  eq('30分', PR.num('30分'), 30);
  ok('空は NaN', isNaN(PR.num('')));
  eq('2.5um → 2500nm', PR.len('2.5um'), 2500);
  eq('0.2mm → 2e5nm', PR.len('0.2mm'), 2e5);
  ok('厚み 0 は NaN', isNaN(PR.len('0')));
});

/* ================= 9. なだらかな接合のダイオード ================= */

T('なだらかな接合', () => {
  /* 一様な2層は、以前と同じく隣の層の濃度を使う */
  const u = diodeStack(1e18, 1e16, 1000, 3000);
  const du = DEV.diode(u, T300);
  eq('一様な接合の Na は層の値のまま', du.Na, 1e18);
  eq('一様な接合の Nd は層の値のまま', du.Nd, 1e16);
  ok('一様な接合では空乏層の端を見に行かない', !du.edge);

  /* プロセスラボで作るような、なだらかな p+ を薄い層で近似する。
   * 接合の隣の層はアクセプタとドナーがほとんど打ち消し合っている */
  const g = ST.create();
  let z = 5, lastNet = 0;
  for (;;) {
    const na = 1e19 * Math.exp(-z / 40);
    if (na <= 1.1e15) break;
    ST.addLayer(g, 'si', 10, { na: na, nd: 1e15 });
    lastNet = na - 1e15;
    z += 10;
  }
  ST.addLayer(g, 'si', 5000, { nd: 1e15 });
  const dg = DEV.diode(g, T300);
  ok('なだらかな接合では空乏層の端の外の濃度を使う', dg.edge === true);
  ok('p 側の濃度は、打ち消し合った隣の層より 5 倍以上濃い', dg.Na > 5 * lastNet);
  ok('Vbi が 0.6V 以上に出る（隣の層で出すと 0.5V 台）', dg.Vbi > 0.6);
  near('n 側は一様なので層の値のまま', dg.Nd, 1e15, 1);
  /* 【両端の電位差と比べてはいけない ― 一度そう書いて外した】
   * なだらかな p 側の中には濃度の傾きによる内蔵電界があり、両端の電位差（0.83V）はそのぶん大きい。
   * 接合の障壁は「空乏層の両端の外」どうしの電位差。そこは中性なので ψ の差が Vt·ln(Na·Nd/ni²) になるはず */
  const m = ST.mesh(g, T300), sol = PS.solve(m, { left: 0, right: 0 });
  const dep = PS.depletionByCharge(sol);
  const ip = ST.nodeAt(m, dep.xj - dep.wp * 1.5 - 2e-7), inn = ST.nodeAt(m, dep.xj + dep.wn * 1.5 + 2e-7);
  near('Vbi は空乏層の両端の外どうしの電位差と合う', dg.Vbi, sol.psi[inn] - sol.psi[ip], 0.03);
  ok('接合の障壁は両端の電位差より小さい（なだらかな側の中にも内蔵電界がある）', dg.Vbi < sol.psi[m.n - 1] - sol.psi[0]);

  /* 同じ構造を2回呼んでもポアソンを解き直さない（同じものが返る） */
  ok('ダイオードの結果は使い回される', DEV.diode(g, T300) === dg);
});

report();
