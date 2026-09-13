/* 課題の検査 ― お手本で通る／通ってはいけないものが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, report } = require('./harness.js');
const { DG } = load();
const Q = DG.quest, A = DG.answer, M = DG.sys;

T('課題の形', () => {
  ok('課題が 16 問', Q.LIST.length === 16);
  ok('章が 4 つ', Q.CH.length === 4);
  const seen = new Set();
  Q.LIST.forEach((q) => {
    ok(`${q.id}: 重複しない`, !seen.has(q.id)); seen.add(q.id);
    ok(`${q.id}: 説明・理由・ヒント`, q.desc.length > 10 && q.why.length > 20 && q.hint.length > 5);
    ok(`${q.id}: 章がある`, !!Q.chapterOf(q));
    ok(`${q.id}: お手本がある`, !!A.get(q.id));
    ok(`${q.id}: design 型`, q.kind === 'design');
  });
  Q.CH.forEach((c) => ok(`第${c.id}章に 4 問`, Q.LIST.filter((q) => q.ch === c.id).length === 4));
  A.ids().forEach((id) => ok(`お手本 ${id} に課題がある`, !!Q.byId(id)));
  ok('無い課題は断る', !Q.grade('nothing', { design: M.defaults() }).ok);
});

T('お手本で通る', () => {
  Q.LIST.forEach((q) => {
    const g = Q.grade(q.id, { design: A.get(q.id).design() });
    const why = (g.rows || []).filter((x) => !x.ok).map((x) => `${x.label}=${x.value}`).join(' / ');
    ok(`${q.id} のお手本が通る` + (g.ok ? '' : '　― ' + why), g.ok);
    ok(`${q.id}: 通ったら ✗ の行が無い`, !g.ok || g.rows.every((x) => x.ok));
  });
});

const with_ = (id, patch) => Q.grade(id, { design: Object.assign({}, A.get(id).design(), patch) }).ok;

T('落ちるべきもの ― 既定の設計・他のお手本', () => {
  const base = { design: M.defaults() };
  Q.LIST.forEach((q) => ok(`${q.id}: 既定の設計では通らない`, !Q.grade(q.id, base).ok));
  Q.LIST.forEach((q) => {
    const others = Q.LIST.filter((o) => o.id !== q.id)
      .filter((o) => Q.grade(q.id, { design: A.get(o.id).design() }).ok).length;
    ok(`${q.id}: 他の設計のお手本の全部では通らない`, others < Q.LIST.length - 1);
  });
});

T('窓の両側 ― 第1章 カメラ', () => {
  ok('fast: 5.1 ms は露光の上限破り', !with_('fast', { texp: 5.1 }));
  ok('fast: 量子効率 0.95・透過 0.45 は SN 比が足りない', !with_('fast', { topt: 0.45 }));
  ok('fast: 透過 0.47 なら通る（しきい 0.460）', with_('fast', { topt: 0.47 }));
  ok('fast: 量子効率 0.96 は上限破り', !with_('fast', { qe: 0.96 }));
  ok('fast: 透過 0.71 は上限破り', !with_('fast', { topt: 0.71, qe: 0.9 }));
  ok('dark: EM-CCD 13.0 ms は届かない（しきい 13.13）', !with_('dark', { texp: 13.0 }));
  ok('dark: EM-CCD 13.2 ms なら通る', with_('dark', { texp: 13.2 }));
  ok('dark: 15.5 ms は露光の上限破り', !with_('dark', { texp: 15.5 }));
  ok('dark: sCMOS は 15 ms でも届かない', !with_('dark', { emccd: 0, texp: 15 }));
  ok('data: 15 ビットは細かさが足りない', !with_('data', { nbit: 15 }));
  ok('data: 186 枚/秒まで収まる', with_('data', { fps: 186 }));
  ok('data: 187 枚/秒は 12.5 Gb/s を超える', !with_('data', { fps: 187 }));
  ok('data: 179 枚/秒は足りない', !with_('data', { fps: 179 }));
  ok('data: 17 ビットは 180 枚/秒で帯域を超える', !with_('data', { nbit: 17 }));
  ok('tec: 47 K は暗電流が床を超える', !with_('tec', { dtc: 47 }));
  ok('tec: 48 K なら通る', with_('tec', { dtc: 48 }));
  ok('tec: 59 K まで通る', with_('tec', { dtc: 59 }));
  ok('tec: 60 K は TEC の吸熱が足りない', !with_('tec', { dtc: 60 }));
});

T('窓の両側 ― 第2章 LiDAR', () => {
  ok('range: 37.5 mm は 30 個に届かない（しきい 37.77）', !with_('range', { dap: 37.5 }));
  ok('range: 38 mm なら通る', with_('range', { dap: 38 }));
  ok('range: 51 mm は受光口の上限破り', !with_('range', { dap: 51 }));
  ok('sun: 5 nm・0.074° は通る', with_('sun', { dlf: 5, ifov: 0.074 }));
  ok('sun: 5 nm・0.076° は飽和', !with_('sun', { dlf: 5, ifov: 0.076 }));
  ok('sun: 11 nm・0.05° は通る', with_('sun', { dlf: 11, ifov: 0.05 }));
  ok('sun: 11.2 nm・0.05° は飽和', !with_('sun', { dlf: 11.2, ifov: 0.05 }));
  ok('sun: 4 nm は波長の余裕が足りない', !with_('sun', { dlf: 4, ifov: 0.03 }));
  ok('sun: 0.02° は位置合わせの余裕が足りない', !with_('sun', { dlf: 10, ifov: 0.02 }));
  ok('dead: 11 ns は通る', with_('dead', { taud: 11 }));
  ok('dead: 11.2 ns は飽和', !with_('dead', { taud: 11.2 }));
  ok('dead: 5 ns は通る', with_('dead', { taud: 5 }));
  ok('dead: 4.9 ns はアフターパルスの下限破り', !with_('dead', { taud: 4.9 }));
  ok('prec: 8 パルスは 2.07 cm で届かない', !with_('prec', { npulse: 8 }));
  ok('prec: 9 パルスを 80 kHz は 0.1 ms を超える', !with_('prec', { frep: 80 }));
  ok('prec: 50 パルスを 600 kHz はあいまいさのない距離 250 m', !with_('prec', { npulse: 50, frep: 600 }));
  ok('prec: 45 パルスを 499 kHz なら通る', with_('prec', { npulse: 45, frep: 499 }));
  ok('prec: 500 kHz は c/2f = 299.8 m で 300 m に届かない', !with_('prec', { npulse: 45, frep: 500 }));
});

T('窓の両側 ― 第3章 分光器', () => {
  ok('grat: 405 本/mm は分解能が足りない', !with_('grat', { lpmm: 405 }));
  ok('grat: 410 本/mm なら通る', with_('grat', { lpmm: 410 }));
  ok('grat: 421 本/mm まで収まる', with_('grat', { lpmm: 421 }));
  ok('grat: 422 本/mm は 1,000 nm がはみ出す', !with_('grat', { lpmm: 422 }));
  ok('slit: 48.5 µm は光が足りない', !with_('slit', { slitum: 48.5 }));
  ok('slit: 49 µm なら通る', with_('slit', { slitum: 49 }));
  ok('slit: 50.5 µm は分解能が悪くなる', !with_('slit', { slitum: 50.5 }));
  ok('absorb: 188 回は雑音が大きい', !with_('absorb', { navg: 188 }));
  ok('absorb: 189 回なら通る', with_('absorb', { navg: 189 }));
  ok('absorb: 200 回まで 1 秒', with_('absorb', { navg: 200 }));
  ok('absorb: 201 回は 1 秒を超える', !with_('absorb', { navg: 201 }));
  ok('calib: 傾き 0.0034 は通る', with_('calib', { slope: 0.0034 }));
  ok('calib: 傾き 0.0036 は不確かさが大きい', !with_('calib', { slope: 0.0036 }));
  ok('calib: 201 回は 1 秒を超える', !with_('calib', { navg: 201 }));
});

T('窓の両側 ― 第4章 PET と蛍光寿命', () => {
  ok('petwin: 450 keV は 30.2° までしか落とせない（しきい 450.6）', !with_('petwin', { lwin: 450 }));
  ok('petwin: 451 keV なら通る', with_('petwin', { lwin: 451 }));
  ok('petwin: 458.5 keV まで本物を 99% 残す', with_('petwin', { lwin: 458.5 }));
  ok('petwin: 459.5 keV は本物を削りすぎる（しきい 459.0）', !with_('petwin', { lwin: 459.5 }));
  ok('tof: 窓 2.3 ns は視野の端の組を取り逃す（2.33 ns）', !with_('tof', { wcoin: 2.3 }));
  ok('tof: 窓 2.4 ns なら通る', with_('tof', { wcoin: 2.4 }));
  ok('tof: 窓 3.1 ns は偶発 31 /s', !with_('tof', { wcoin: 3.1 }));
  ok('tof: 170 ps は 2.55 cm で届かない（しきい 166.8）', !with_('tof', { ctr: 170 }));
  ok('tof: 165 ps なら通る', with_('tof', { ctr: 165 }));
  ok('tof: 90 ps は時刻の分解能の下限（100 ps）破り', !with_('tof', { ctr: 90 }));
  ok('flrep: 14.6 MHz は持ち越しが 0.1% を超える（しきい 14.47）', !with_('flrep', { fflim: 14.6 }));
  ok('flrep: 14.4 MHz なら通る', with_('flrep', { fflim: 14.4 }));
  ok('flrep: 12.3 MHz なら 90 分に収まる', with_('flrep', { fflim: 12.3 }));
  ok('flrep: 12.1 MHz は 90 分を超える（しきい 12.20）', !with_('flrep', { fflim: 12.1 }));
  ok('flmu: µ 0.040 は通る', with_('flmu', { mu: 0.040 }));
  ok('flmu: µ 0.041 はパイルアップが 2% を超える（しきい 0.0403）', !with_('flmu', { mu: 0.041 }));
  ok('flmu: µ 0.019 なら 15 分に収まる', with_('flmu', { mu: 0.019 }));
  ok('flmu: µ 0.018 は 15 分を超える（しきい 0.0184）', !with_('flmu', { mu: 0.018 }));
});

T('条件固定を破ったら、数字が届いていても落ちる', () => {
  ok('petwin: 固有の分解能を良くするのは反則', !with_('petwin', { rint: 4, lwin: 470 }));
  ok('petwin: 集光を上げるのは反則', !with_('petwin', { lcol: 0.45 }));
  ok('tof: 単独の計数を減らすのは反則', !with_('tof', { sing: 5e4, wcoin: 4 }));
  ok('tof: 視野を狭くするのは反則', !with_('tof', { fov: 50, wcoin: 2 }));
  ok('flrep: 寿命の短い試料に替えるのは反則', !with_('flrep', { tauf: 2.5, fflim: 40 }));
  ok('flrep: µ を上げて時間を稼ぐのは反則', !with_('flrep', { mu: 0.05, fflim: 8 }));
  ok('flmu: 繰り返しを上げるのは反則', !with_('flmu', { fflim: 80, mu: 0.01 }));
  ok('flmu: 1 画素の光子を減らすのは反則', !with_('flmu', { nphf: 5e3, mu: 0.01 }));
  ok('fast: 分子の光を盛るのは反則', !with_('fast', { phot: 3e5 }));
  ok('fast: EM-CCD に替えるのは反則（sCMOS の課題）', !with_('fast', { emccd: 1, texp: 5 }));
  ok('fast: 背景を減らすのは反則', !with_('fast', { bgr: 100 }));
  ok('dark: 明るい色素に替えるのは反則', !with_('dark', { phot: 1e4 }));
  ok('dark: 読み出し雑音を下げるのは反則', !with_('dark', { emccd: 0, sigr: 0.5 }));
  ok('data: 伝送を 2 本にするのは反則', !with_('data', { link: 25, fps: 300 }));
  ok('data: 飽和電荷を減らしてビットを浮かすのは反則', !with_('data', { fwc: 15000, nbit: 15 }));
  ok('tec: TEC を大きくするのは反則', !with_('tec', { qmax: 20, dtc: 65 }));
  ok('tec: 露光を短くするのは反則', !with_('tec', { texp: 1000, dtc: 20 }));
  ok('range: 尖頭値を上げるのは反則', !with_('range', { ppk: 40, dap: 30 }));
  ok('range: 距離を縮めるのは反則', !with_('range', { rng: 200, dap: 25 }));
  ok('sun: 不感時間を縮めるのは反則', !with_('sun', { dlf: 20, ifov: 0.1, taud: 1 }));
  ok('sun: 受光口を変えるのは反則', !with_('sun', { dap: 10 }));
  ok('dead: 視野を変えるのは反則', !with_('dead', { ifov: 0.03 }));
  ok('prec: 揺らぎを 0 にするのは反則', !with_('prec', { jit: 0 }));
  ok('prec: 物体を明るくするのは反則', !with_('prec', { rho: 0.5, npulse: 2 }));
  ok('grat: スリットを細くするのは反則', !with_('grat', { slitum: 20, lpmm: 400 }));
  ok('grat: 入射角を変えるのは反則', !with_('grat', { alpha: 20 }));
  ok('slit: F 数を明るくするのは反則', !with_('slit', { fnum: 3, slitum: 40 }));
  ok('absorb: 電子を多く貯めるのは反則', !with_('absorb', { ne: 2e5, navg: 100 }));
  ok('calib: 校正の残差を詰めるのは反則', !with_('calib', { dlcal: 0.01, slope: 0.01 }));
});

report();
