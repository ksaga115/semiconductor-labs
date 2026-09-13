/* 物理と測り方の検査
 *
 *   node tests/run.js
 *
 * 一番大事なのは「PTC の差分法で、カメラの真の値が当たる」こと。
 * ここがずれていたら、測る課題は全部当て推量になる。
 */
'use strict';
const { load, T, ok, eq, near, within, report } = require('./harness.js');
const { PX, SL } = load();
const R = PX.rng, PIX = PX.pixel, CAM = PX.camera, PTC = PX.ptc;

T('乱数', () => {
  const a = R.make(5), b = R.make(5);
  eq('同じ種なら同じ列', a.next(), b.next());
  const r = R.make(99);
  [0.5, 3, 29, 30, 500].forEach((lam) => {
    let s = 0, s2 = 0; const n = 60000;
    for (let i = 0; i < n; i++) { const x = r.poisson(lam); s += x; s2 += x * x; }
    const m = s / n, v = s2 / n - m * m;
    within(`ポアソン λ=${lam} の平均`, m, lam, 1.02);
    within(`ポアソン λ=${lam} の分散 ＝ 平均（ショットノイズ）`, v, lam, 1.04);
  });
  eq('λ=0 は 0', r.poisson(0), 0);
});

T('カメラ', () => {
  const cam = CAM.MYSTERY.B;
  const f1 = CAM.frame(cam, 0.1, true, 42), f2 = CAM.frame(cam, 0.1, true, 42);
  eq('同じ種なら同じ画像', f1.join(','), f2.join(','));
  eq('画素の数', f1.length, CAM.W * CAM.H);
  /* 平均は QE × 光子束 × 面積 × 露光 / K + オフセット（暗電流も足す） */
  const want = (cam.qe * cam.flux * cam.area * 0.1 + cam.dark * 0.1) / cam.K + cam.offset;
  within('明るい画像の平均が式と合う', CAM.stats(f1).mean, want, 1.01);
  /* 暗い画像はオフセット＋暗電流 */
  within('暗い画像の平均はオフセット＋暗電流', CAM.stats(CAM.frame(cam, 1, false, 7)).mean, cam.offset + cam.dark / cam.K, 1.005);
  /* 井戸があふれると頭打ち */
  const sat = CAM.stats(CAM.frame(cam, 10, true, 3));
  near('あふれると FW/K＋オフセットに張り付く', sat.mean, cam.fw / cam.K + cam.offset, 1.5);
  /* 【ばらつきは 0 にはならない ― 一度そう書いて外した】井戸は電子のところで頭打ちになり、
   * 読み出し雑音はその後で足される。だから飽和するとばらつきは読み出し雑音の床まで戻る */
  const readDN2 = (cam.read / cam.K) ** 2;
  within('あふれるとばらつきは読み出し雑音の床に戻る', sat.var, readDN2 + 1 / 12, 1.15);
  /* AD が先に振り切れるカメラ（C） */
  const c = CAM.MYSTERY.C, satC = CAM.stats(CAM.frame(c, 10, true, 3));
  near('C は AD の上限（4095）に張り付く', satC.mean, 4095, 0.5);
  ok('C は井戸より先に AD が振り切れる（課題の前提）', c.fw / c.K + c.offset > 4095);
  ['A', 'B'].forEach((k) => {
    const m = CAM.MYSTERY[k];
    ok(`${k} は AD より先に井戸があふれる（課題の前提）`, m.fw / m.K + m.offset < Math.pow(2, m.bits) - 1);
  });
  /* 固定パターンはカメラごとに決まっている */
  ok('固定パターンは撮り直しても同じ', CAM.maps(cam) === CAM.maps(cam));
});

T('PTC の差分法', () => {
  ['A', 'B'].forEach((k) => {
    const cam = CAM.MYSTERY[k], pts = PTC.sweep(cam, 1e-4, 5, 40, 3);
    const f = PTC.fitK(pts);
    within(`${k}: K が当たる`, f.K, cam.K, 1.04);
    within(`${k}: 読み出し雑音が当たる`, PTC.readNoise(pts, f.K), cam.read, 1.06);
    within(`${k}: 飽和電荷が当たる`, PTC.fullWell(pts, f.K), cam.fw, 1.05);
    within(`${k}: 暗電流が当たる`, PTC.darkCurrent(pts, f.K), cam.dark, 1.08);
    within(`${k}: PRNU が当たる`, PTC.prnu(pts), cam.prnu, 1.10);
  });
  /* 差分を取らずに1枚の分散で当てはめると、固定パターンで傾きが歪む（差分法が要る理由） */
  const cam = CAM.MYSTERY.C, pts = PTC.sweep(cam, 1e-4, 5, 40, 3), ip = PTC.peakIndex(pts);
  const xs = [], ys = [];
  pts.forEach((p, i) => { if (i < ip && p.mean > 50) { xs.push(p.mean); ys.push(p.tvar * 1 + p.fpn * 1); } });
  const naive = 1 / PTC.line(xs, ys).b;
  ok('1枚の分散で当てはめると K が小さく出る（固定パターンが混ざる）', naive < cam.K * 0.9);
});

T('画素の設計', () => {
  const d = PIX.defaults(), ev = PIX.evaluate(d);
  /* 量子効率は SemiLab で解いている。赤外は厚みで決まる */
  ok('550nm の量子効率は高い', ev.qeSi > 0.7);
  ok('850nm は薄いと拾えない', PIX.qeSilicon(850, 3) < 0.2);
  ok('850nm は厚くすると拾える', PIX.qeSilicon(850, 10) > 1.8 * PIX.qeSilicon(850, 3));
  /* 変換ゲイン q/C */
  near('変換ゲイン = q / C', ev.cg, 1.602176634e-19 / 2e-15 * 1e6, 0.01);
  /* 井戸は PD か浮遊拡散の小さいほう */
  eq('既定では PD が井戸を決める', ev.limit, 'PD');
  const small = PIX.evaluate(Object.assign({}, d, { cfd: 0.5 }));
  eq('浮遊拡散を小さくすると浮遊拡散が井戸を決める', small.limit, '浮遊拡散');
  ok('そのとき飽和電荷は減る', small.fw < ev.fw);
  ok('でも読み出し雑音は減る', small.read < ev.read);
  /* kTC は CDS で消える */
  const noCds = PIX.evaluate(Object.assign({}, d, { cds: false }));
  near('kTC = √(kTC)/q', noCds.kTC, Math.sqrt(1.380649e-23 * 298.15 * 2e-15) / 1.602176634e-19, 0.01);
  ok('CDS を外すと kTC が読み出し雑音に入る', noCds.read > 10 * ev.read);
  /* 暗電流は ni に比例 → 約 9℃（300 K 付近で 8.6 K）で倍（決め打ちではなく ni(T) から出る） */
  const dk = PIX.doublingK(25);
  ok('暗電流が倍になる温度幅は 8〜10K', dk > 8 && dk < 10);
  /* 倍になる幅は温度とともに広がるので、25℃ の幅だけ上げるとわずかに 2 に届かない（1.97） */
  within('倍になる幅だけ上げると約2倍', PIX.evaluate(Object.assign({}, d, { T: 25 + dk })).dark / ev.dark, 2, 1.03);
  /* ダイナミックレンジ = 20 log(FW / 雑音の底) */
  near('ダイナミックレンジの式', ev.dr, 20 * Math.log10(ev.fw / Math.sqrt(ev.read ** 2 + ev.quant ** 2)), 1e-9);
  /* 桁を1つ上げると K と量子化が半分 */
  const b13 = PIX.evaluate(Object.assign({}, d, { bits: 13 }));
  within('1 bit 上げると量子化雑音はほぼ半分', b13.quant, ev.quant / 2, 1.03);
  /* S/N: ショットノイズだけなら √S */
  const ideal = Object.assign({}, ev, { read: 0, quant: 0, dark: 0, prnu: 0 });
  within('雑音が光子だけなら S/N = √S', PIX.snr(ideal, 10000, 1), 100, 1 + 1e-12);
  /* 設計したカメラを撮って測ると、設計の数字が当たる（設計と撮影がつじつまが合っている） */
  const cam = PIX.toCamera(d, 99); cam.flux = 500;
  const tsat = ev.fw / (ev.qe * 500 * ev.area);
  const pts = PTC.sweep(cam, tsat / 3000, tsat * 3, 40, 5);
  within('設計したカメラの K を PTC で測ると設計どおり', PTC.fitK(pts).K, ev.K, 1.05);
});

T('第4章 動き・細かさ・時間（第4部の数字と突き合わせる）', () => {
  const d = PIX.defaults(), ev = PIX.evaluate(d);
  const W = (p) => PIX.evaluate(Object.assign({}, d, p));
  /* ローリングシャッタ: 単一傾斜の AD は 2^bits 回数える */
  near('12 bit・1 GHz の AD は 4.096 µs', ev.tAdc, 4096e-9, 1e-15);
  near('3000 行で上下の時間差 12.288 ms', ev.tRead, 3000 * 4096e-9, 1e-12);
  near('600 画素/s なら横ずれ 7.37 画素', ev.skew, 600 * 3000 * 4096e-9, 1e-9);
  near('4 行同時に読むと 1.84 画素', W({ colpar: 4 }).skew, 600 * 3000 * 1024e-9, 1e-9);
  ok('1 bit 増やすと 1 行が倍遅い', Math.abs(W({ bits: 13 }).tRow / ev.tRow - 2) < 1e-12);
  /* 第4部の例: 3000 行を 1/60 秒で読むと 1 行 5.6 µs、上下で 16.7 ms */
  const f60 = 4096 / (1e6 / 60 / 3000);            /* 1 行 = (1/60)/3000 s になるクロック [MHz] */
  const e60 = W({ fclk: f60 });
  near('第4部: 1 行 5.56 µs', e60.tRow * 1e6, 5.556, 0.001);
  near('第4部: 上下で 16.7 ms', e60.tRead * 1e3, 16.667, 0.001);
  /* グローバルシャッタの分離比（第4部: 10⁻⁴ ＝ 80 dB、10⁻⁵ ＝ 100 dB） */
  near('80 dB は 10⁻⁴', W({ pls: 80 }).plsRatio, 1e-4, 1e-18);
  near('100 dB は 10⁻⁵', W({ pls: 100 }).plsRatio, 1e-5, 1e-18);
  near('寄生の電子 = QE × 光 × 面積 × 分離比 × 待ち時間', PIX.parasitic(ev, 1e6), ev.qe * 1e6 * 9 * 1e-4 * ev.tRead, 1e-9);
  ok('読み出しを 4 倍速くすると寄生も 1/4', Math.abs(PIX.parasitic(W({ colpar: 4 }), 1e6) / PIX.parasitic(ev, 1e6) - 0.25) < 1e-12);
  /* 回折（第4部: F2.8 でエアリー円板 3.76 µm、3.0 µm の画素は F10.9 から回折で決まる） */
  near('F2.8・550 nm のエアリー円板 3.76 µm', W({ fnum: 2.8 }).airy, 2.44 * 0.55 * 2.8, 1e-12);
  ok('第4部の 3.76 µm と一致', Math.abs(W({ fnum: 2.8 }).airy - 3.76) < 0.005);
  near('λN/2 = 3.0 µm になるのは F10.9', 2 * 3.0 / 0.55, 10.909, 0.001);
  near('F8 の回折の限界 2.2 µm', W({ fnum: 8 }).pDiff, 2.2, 1e-12);
  near('3.0 µm のナイキスト 166.7 本/mm（標本化 333 本/mm の半分）', ev.nyqLpmm, 1000 / 6, 1e-9);
  /* TDI: 電荷で足すと読み出し雑音は 1 回、デジタルで足すと N 回 */
  const r2 = ev.read * ev.read;
  near('電荷で足す S/N = 5N/√(5N + σ²)', W({ tdiMode: 1, tdiN: 90 }).tdiSnr, 450 / Math.sqrt(450 + r2), 1e-12);
  near('デジタルで足す S/N = 5N/√(5N + Nσ²)', W({ tdiMode: 0, tdiN: 90 }).tdiSnr, 450 / Math.sqrt(450 + 90 * r2), 1e-12);
  ok('電荷で足すなら 81 段で 20 に届き、80 段では届かない', W({ tdiMode: 1, tdiN: 81 }).tdiSnr >= 20 && W({ tdiMode: 1, tdiN: 80 }).tdiSnr < 20);
  ok('デジタルで足すと 100 段でも 20 に届かない', W({ tdiMode: 0, tdiN: 100 }).tdiSnr < 20);
  ok('1 段なら足し方で差は無い', Math.abs(W({ tdiMode: 0 }).tdiSnr - W({ tdiMode: 1 }).tdiSnr) < 1e-12);
  near('ずれ 1% で 100 段なら にじみ 1 画素', W({ tdiN: 100 }).tdiSmear, 1, 1e-12);
});


T('第5章 ― つなぎ目・欠陥の成分・SPAD（第4部の例題の数字）', () => {
  const PIX5 = PX.pixel;
  /* 第4部「ダイナミックレンジを広げる」の例題: 12,000 e⁻・1:16・読み出し 2.5 e⁻ */
  const sm = PIX5.seamSnr(12000, 16, 2.5);
  ok('つなぎ目の長い側 109.5', Math.abs(sm.long - 109.5) < 0.05);
  ok('つなぎ目の短い側 27.3', Math.abs(sm.short - 27.3) < 0.05);
  ok('つなぎ目の段差 −12.1 dB', Math.abs(20 * Math.log10(sm.short / sm.long) + 12.1) < 0.05);
  /* 第4部 付録C の例題: E_a 0.35 eV の欠陥の成分は 27℃ → −5℃ で約 1/5（0.199） */
  ok('欠陥の成分 27→−5℃ で 0.199', Math.abs(PIX5.arrScale(0.35, -5, 27) - 0.199) < 0.001);
  ok('欠陥の成分が無ければ暗電流は今までと同じ', PIX5.evaluate(PIX5.defaults()).darkDef === 0);
  /* 第4部 SPAD の例題: 10⁷ /s・20 ns で 16.7%、100 ps で 1.5 cm、100 光子で 1.5 mm */
  const sp = PIX5.evaluate(Object.assign(PIX5.defaults(), { spadN: 100 }));
  ok('SPAD 数え落とし 16.7%', Math.abs(sp.spadLoss - 1 / 6) < 1e-9);
  ok('SPAD 1 光子 1.5 cm', Math.abs(sp.spadSig1 - 1.499) < 0.001);
  ok('SPAD 100 光子 1.5 mm', Math.abs(sp.spadSigN * 10 - 1.499) < 0.001);
});

report();
