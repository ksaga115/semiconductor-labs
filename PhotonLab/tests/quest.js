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
});

report();
