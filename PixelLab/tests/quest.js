/* 課題の検査 ― お手本（の手順）で通る／通ってはいけないものが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, eq, report } = require('./harness.js');
const { PX } = load();
const Q = PX.quest, A = PX.answer, PIX = PX.pixel, CAM = PX.camera;

T('課題の形', () => {
  ok('課題がある', Q.LIST.length >= 10);
  const seen = new Set();
  Q.LIST.forEach((q) => {
    ok(`${q.id}: 重複しない`, !seen.has(q.id)); seen.add(q.id);
    ok(`${q.id}: 説明・理由・ヒント`, q.desc.length > 10 && q.why.length > 20 && q.hint.length > 5);
    ok(`${q.id}: 章がある`, !!Q.chapterOf(q));
    ok(`${q.id}: お手本がある`, !!A.get(q.id));
    if (q.kind !== 'design') ok(`${q.id}: カメラが決まっている`, !!CAM.MYSTERY[q.cam]);
    if (q.kind === 'measure') ok(`${q.id}: 単位と許容がある`, !!q.unit && q.tol > 0 && q.tol < 0.3);
  });
  A.ids().forEach((id) => ok(`お手本 ${id} に課題がある`, !!Q.byId(id)));
});

T('お手本で通る', () => {
  Q.LIST.forEach((q) => {
    const a = A.get(q.id);
    let st;
    if (q.kind === 'design') st = { answers: {}, design: a.design() };
    else { const r = a.solve(); st = { answers: { [q.id]: r.value }, design: PIX.defaults() }; }
    const g = Q.grade(q.id, st);
    const why = (g.rows || []).filter((x) => !x.ok).map((x) => `${x.label}=${x.value}`).join(' / ');
    ok(`${q.id} のお手本が通る` + (g.ok ? '' : '　― ' + why), g.ok);
  });
});

T('落ちるべきもの', () => {
  const base = { answers: {}, design: PIX.defaults() };
  /* 既定の設計のままでは、設計の課題はどれも通らない（何もしなくて通る課題は無い） */
  Q.LIST.filter((q) => q.kind === 'design').forEach((q) => ok(`${q.id}: 既定の設計では通らない`, !Q.grade(q.id, base).ok));
  /* 答えを入れていなければ通らない */
  Q.LIST.filter((q) => q.kind !== 'design').forEach((q) => ok(`${q.id}: 答えが無ければ通らない`, !Q.grade(q.id, base).ok));
  /* 真の値から許容の外にずらすと落ちる（許容が緩すぎない） */
  Q.LIST.filter((q) => q.kind === 'measure').forEach((q) => {
    const t = q.truth(CAM.MYSTERY[q.cam]);
    ok(`${q.id}: 許容の外（+${Math.round(q.tol * 150)}%）は落ちる`, !Q.grade(q.id, { answers: { [q.id]: t * (1 + q.tol * 1.5) } }).ok);
    ok(`${q.id}: 許容の内は通る`, Q.grade(q.id, { answers: { [q.id]: t * (1 + q.tol * 0.5) } }).ok);
  });
  /* 飽和の課題: 井戸と答えたら落ちる */
  ok('limit: 「井戸」は落ちる', !Q.grade('limit', { answers: { limit: 'well' } }).ok);
  /* 外れたときは真の値を見せない */
  const miss = Q.grade('k', { answers: { k: 99 } });
  ok('外れたとき真の値を見せない', !miss.rows.some((r) => /真の値/.test(r.label)));
  /* 設計の課題どうしで、他のお手本では通らないものがある（課題ごとに違うことを見ている） */
  const ds = Q.LIST.filter((q) => q.kind === 'design');
  ds.forEach((q) => {
    const others = ds.filter((o) => o.id !== q.id).filter((o) => Q.grade(q.id, { design: A.get(o.id).design() }).ok).length;
    ok(`${q.id}: 他の設計のお手本の全部では通らない`, others < ds.length - 1);
  });
});

report();
