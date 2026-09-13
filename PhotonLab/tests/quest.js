/* 課題の検査 ― お手本で通る／通ってはいけないものが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, report } = require('./harness.js');
const { PH } = load();
const Q = PH.quest, A = PH.answer, P = PH.photon;

T('課題の形', () => {
  ok('課題がある', Q.LIST.length >= 8);
  const seen = new Set();
  Q.LIST.forEach((q) => {
    ok(`${q.id}: 重複しない`, !seen.has(q.id)); seen.add(q.id);
    ok(`${q.id}: 説明・理由・ヒント`, q.desc.length > 10 && q.why.length > 20 && q.hint.length > 5);
    ok(`${q.id}: 章がある`, !!Q.chapterOf(q));
    ok(`${q.id}: お手本がある`, !!A.get(q.id));
    ok(`${q.id}: design 型`, q.kind === 'design');
  });
  A.ids().forEach((id) => ok(`お手本 ${id} に課題がある`, !!Q.byId(id)));
});

T('お手本で通る', () => {
  Q.LIST.forEach((q) => {
    const g = Q.grade(q.id, { design: A.get(q.id).design() });
    const why = (g.rows || []).filter((x) => !x.ok).map((x) => `${x.label}=${x.value}`).join(' / ');
    ok(`${q.id} のお手本が通る` + (g.ok ? '' : '　― ' + why), g.ok);
  });
});

T('落ちるべきもの', () => {
  const base = { design: P.defaults() };
  /* 既定の設計のままでは、どの課題も通らない */
  Q.LIST.forEach((q) => ok(`${q.id}: 既定の設計では通らない`, !Q.grade(q.id, base).ok));
  /* 設計の課題どうしで、他のお手本の全部では通らない（課題ごとに違うことを見ている） */
  Q.LIST.forEach((q) => {
    const others = Q.LIST.filter((o) => o.id !== q.id)
      .filter((o) => Q.grade(q.id, { design: A.get(o.id).design() }).ok).length;
    ok(`${q.id}: 他の設計のお手本の全部では通らない`, others < Q.LIST.length - 1);
  });

  /* 山の両側で落ちる ― 最適な M の課題 */
  const opt = A.get('apdopt').design();
  const lo = Object.assign({}, opt, { M: 1 });
  const hi = Object.assign({}, opt, { M: 300 });
  ok('apdopt: M=1 では落ちる', !Q.grade('apdopt', { design: lo }).ok);
  ok('apdopt: M=300 では落ちる', !Q.grade('apdopt', { design: hi }).ok);

  /* 条件固定を破ったら、数字が届いていても落ちる */
  const cheat = Object.assign({}, A.get('apdopt').design(), { ifa: 1 });
  ok('apdopt: アンプ雑音を勝手に下げるのは反則', !Q.grade('apdopt', { design: cheat }).ok);
  const cheat2 = Object.assign({}, A.get('mppc').design(), { nph: 10 });
  ok('mppc: 光子数を勝手に減らすのは反則', !Q.grade('mppc', { design: cheat2 }).ok);
  const cheat3 = Object.assign({}, A.get('nep').design(), { M: 100 });
  ok('nep: M=1 の縛りを破ると落ちる', !Q.grade('nep', { design: cheat3 }).ok);

  /* しきいの少し外は落ちる（採点が緩すぎない） */
  const pmtLow = Object.assign({}, A.get('pmt').design(), { delta: 3 });
  ok('pmt: δ=3 の10段（5.9万）は落ちる', !Q.grade('pmt', { design: pmtLow }).ok);
  const mppcLow = Object.assign({}, A.get('mppc').design(), { ncell: 6000 });
  ok('mppc: セル 6000 個（目減り 5.5%）は落ちる', !Q.grade('mppc', { design: mppcLow }).ok);
  const fastLow = Object.assign({}, A.get('fast').design(), { cpf: 0.5 });
  ok('fast: 0.5pF（6.4GHz）は落ちる', !Q.grade('fast', { design: fastLow }).ok);
  const nepmHi = Object.assign({}, A.get('nepm').design(), { M: 300 });
  ok('nepm: M=300（Fが伸びる）は落ちる', !Q.grade('nepm', { design: nepmHi }).ok);

  /* 背景光: M では逃げられず、帯域を広げすぎても落ちる。背景を消すのは反則 */
  const bgWide = Object.assign({}, A.get('bg').design(), { bmhz: 0.05 });
  ok('bg: 帯域 50kHz（SNR 6.2）は落ちる', !Q.grade('bg', { design: bgWide }).ok);
  const bgM = Object.assign({}, A.get('bg').design(), { M: 100 });
  ok('bg: M=100（F=3.95 で損）は落ちる', !Q.grade('bg', { design: bgM }).ok);
  const bgCheat = Object.assign({}, A.get('bg').design(), { bgnw: 0 });
  ok('bg: 背景光を消すのは反則', !Q.grade('bg', { design: bgCheat }).ok);

  /* 計数: 待たなければ届かず、待ちすぎは時間の縛りに当たる。PDE を盛るのは反則 */
  const cShort = Object.assign({}, A.get('count').design(), { tsec: 1 });
  ok('count: 1 秒（SNR 5.5）は落ちる', !Q.grade('count', { design: cShort }).ok);
  const cLong = Object.assign({}, A.get('count').design(), { tsec: 20 });
  ok('count: 20 秒は時間の縛りで落ちる', !Q.grade('count', { design: cLong }).ok);
  const cCheat = Object.assign({}, A.get('count').design(), { eta: 0.9 });
  ok('count: PDE を勝手に盛るのは反則', !Q.grade('count', { design: cCheat }).ok);

  /* 走行×RC: 両側で落ち、径を小さくするのは反則 */
  const tr1 = Object.assign({}, A.get('transit').design(), { wum: 3 });
  ok('transit: 厚い（走行 14.7GHz）と落ちる', !Q.grade('transit', { design: tr1 }).ok);
  const tr2 = Object.assign({}, A.get('transit').design(), { wum: 0.4 });
  ok('transit: 薄い（RC 17.5GHz）と落ちる', !Q.grade('transit', { design: tr2 }).ok);
  const tr3 = Object.assign({}, A.get('transit').design(), { diamum: 10 });
  ok('transit: 受光径を勝手に小さくするのは反則', !Q.grade('transit', { design: tr3 }).ok);

  /* TCSPC: 窓の両側と、光を勝手に絞る反則 */
  const pl1 = Object.assign({}, A.get('pile').design(), { freps: 50 });
  ok('pile: 50MHz（p=2.8%）は落ちる', !Q.grade('pile', { design: pl1 }).ok);
  const pl2 = Object.assign({}, A.get('pile').design(), { freps: 120 });
  ok('pile: 120MHz（尻尾を踏む）は落ちる', !Q.grade('pile', { design: pl2 }).ok);
  const pl3 = Object.assign({}, A.get('pile').design(), { pw: -13 });
  ok('pile: 光を勝手に絞るのは反則', !Q.grade('pile', { design: pl3 }).ok);

  /* 第4章: k=0.4 の山の両側と、k を小さくする反則 */
  const g = (id, patch) => Q.grade(id, { design: Object.assign({}, A.get(id).design(), patch) }).ok;
  ok('ingaas: M=10（4.8）は落ちる', !g('ingaas', { M: 10 }));
  ok('ingaas: M=30（4.5）は落ちる', !g('ingaas', { M: 30 }));
  ok('ingaas: M=12 と M=21 は山の内側', g('ingaas', { M: 12 }) && g('ingaas', { M: 21 }));
  ok('ingaas: k を 0.02 にするのは反則', !g('ingaas', { k: 0.02 }));
  ok('ingaas: アンプ雑音を下げるのは反則', !g('ingaas', { ifa: 1000 }));

  /* しきい値: 窓は 5〜6 p.e. */
  ok('thresh: 4 p.e.（偽 500 cps）は落ちる', !g('thresh', { thr: 4 }));
  ok('thresh: 6 p.e.（5 cps・93.3%）は通る', g('thresh', { thr: 6 }));
  ok('thresh: 7 p.e.（検出率 87%）は落ちる', !g('thresh', { thr: 7 }));
  ok('thresh: クロストークを勝手に下げるのは反則', !g('thresh', { thr: 3, pct: 0.01 }));
  ok('thresh: 信号を勝手に明るくするのは反則', !g('thresh', { thr: 7, mupe: 20 }));

  /* シンチ: 光電子が足りない側と、集めすぎて飽和する側 */
  ok('scint: 集光 × PDE 0.075（1,150 p.e.）は分解能で落ちる', !g('scint', { lce: 0.3, eta: 0.25 }));
  ok('scint: 集光 × PDE 0.105（1,610 p.e.）は飽和で落ちる', !g('scint', { lce: 0.3, eta: 0.35 }));
  ok('scint: 固有分解能を下げるのは反則', !g('scint', { rint: 4, lce: 0.2, eta: 0.2 }));
  ok('scint: クロストークを消すのは反則', !g('scint', { pct: 0 }));
  ok('scint: セル数を増やすのは反則', !g('scint', { ncell: 40000, lce: 0.5, eta: 0.5 }));
  ok('scint: PDE 0.6 は上限破り', !g('scint', { lce: 0.15, eta: 0.6 }));

  /* 第5章: X 線の分解能・不感時間・PD の直線性 ― 窓の両側と反則 */
  ok('xres: ENC 7 e⁻（131 eV）は落ちる', !g('xres', { enc: 7 }));
  ok('xres: ENC 6.5 e⁻（129 eV）は通る', g('xres', { enc: 6.5 }));
  ok('xres: ENC 3 e⁻ は回路の下限破り', !g('xres', { enc: 3 }));
  ok('xres: ファノ因子を下げるのは反則', !g('xres', { fano: 0.05, enc: 8 }));
  ok('xres: エネルギーを変えるのは反則', !g('xres', { ekev: 20 }));
  ok('dead: 30 ns（5.66%）は落ちる', !g('dead', { dtau: 30 }));
  ok('dead: 26 ns（4.94%）は通る', g('dead', { dtau: 26 }));
  ok('dead: 8 ns はパルスの幅の下限破り', !g('dead', { dtau: 8 }));
  ok('dead: 率を下げるのは反則', !g('dead', { ntrue: 1e6, dtau: 40 }));
  ok('dead: 型を変えるのは反則', !g('dead', { dtype: 1 }));
  ok('pdlin: 零バイアスは直線性で落ちる', !g('pdlin', { vr: 0 }));
  ok('pdlin: 0.6 V も直線性で落ちる', !g('pdlin', { vr: 0.6 }));
  ok('pdlin: 4.5 V は通る', g('pdlin', { vr: 4.5 }));
  ok('pdlin: 6 V は定格破り', !g('pdlin', { vr: 6 }));
  ok('pdlin: TIA に替えるのはこの課題では反則', !g('pdlin', { rlk: 0 }));
  ok('pdlin: 光電流を減らすのは反則', !g('pdlin', { pdua: 20, vr: 0 }));
});

report();
