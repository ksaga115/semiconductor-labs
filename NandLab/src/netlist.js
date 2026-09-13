/* 回路のデータ構造
 *
 * 原始部品は NAND だけ。AND も OR も XOR も、使う側が NAND から組んでチップにする。
 * それ以外にあるのは「外から値を入れる/外へ値を出す」ための端子と、定数とクロックだけ。
 * 例外は第6章 ― 原始部品を NOR に取り替えた世界。素子は混ぜない（quest.js が採点で断る）。
 *
 *   nand   入力2 出力1   ― 論理素子（第1〜5章）
 *   nor    入力2 出力1   ― 論理素子（第6章だけ）
 *   in     入力0 出力1   ― 外部入力。この回路をチップにしたとき入力端子になる
 *   out    入力1 出力0   ― 外部出力。同上
 *   const  入力0 出力1   ― 0 か 1 を出しっぱなし
 *   clock  入力0 出力1   ― 進めるたびに反転する
 *   ram16  入力7 出力1   ― 16語×1bit の RAM。【実装部品】NAND からは組んでいない
 *                          （A0..A3 番地, D 書く値, W 書き込み許可, C クロック → Q 読み出し。
 *                           README「メモリ」の節を参照。課題の採点では使えない）
 *   chip   ライブラリの定義しだい ― ユーザーが作った部品
 *
 * 配線は「出力ポート → 入力ポート」の有向。入力ポートに繋がる線は高々1本
 * （2本目を繋いだら1本目を外す）。出力からは何本でも分岐してよい。
 *
 * 部品も配線も id をキーにした連想配列で持つ。配列にすると削除のたびに
 * 添字がずれて、配線が指す先を全部書き換える羽目になる。
 *
 * 【外部端子の順序】in / out 部品の並び順は「名前の自然順」で決める。
 * 座標順にすると、部品をちょっと動かしただけで端子の順番が入れ替わり、
 * その回路をチップにして使っている側の配線が黙って繋ぎ変わる。名前なら動かない。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});

  /* 原始部品の端子数。chip だけはライブラリを見ないと決まらないのでここには無い */
  var PRIM = {
    nand:  { in: 2, out: 1 },
    nor:   { in: 2, out: 1 },         /* 第6章の原始部品 */
    in:    { in: 0, out: 1 },
    out:   { in: 1, out: 0 },
    'const': { in: 0, out: 1 },
    clock: { in: 0, out: 1 },
    ram16: { in: 7, out: 1 }          /* A0,A1,A2,A3,D,W,C → Q（実装部品） */
  };

  /* ram16 の端子の並び。lib.js の展開・ui.js の描画・README が全部これに従う */
  var RAM_PORTS = ['A0', 'A1', 'A2', 'A3', 'D', 'W', 'C'];

  function create() {
    return { parts: {}, wires: {}, seq: 1 };
  }

  /** 部品 p の端子数。chip はライブラリ lib を引く（未知のチップは 0/0 扱い） */
  function portsOf(p, lib) {
    if (p.kind !== 'chip') return PRIM[p.kind] || { in: 0, out: 0 };
    var def = lib && lib[p.chip];
    if (!def) return { in: 0, out: 0 };
    return { in: def.inputs.length, out: def.outputs.length };
  }

  /* "A1" < "A2" < "A10" になる自然順。A10 が A2 より前に来ると
   * 4bit 加算器の端子の並びが人間の直感とずれる */
  function natCmp(a, b) {
    var ra = /(\d+)|(\D+)/g, rb = /(\d+)|(\D+)/g, ma, mb;
    for (;;) {
      ma = ra.exec(a); mb = rb.exec(b);
      if (!ma) return mb ? -1 : 0;
      if (!mb) return 1;
      if (ma[1] && mb[1]) { var d = +ma[1] - +mb[1]; if (d) return d; }
      else if (ma[0] !== mb[0]) return ma[0] < mb[0] ? -1 : 1;
    }
  }

  /** 種類 kind の部品を名前順に並べて返す */
  function partsOfKind(c, kind) {
    var out = [];
    for (var id in c.parts) if (c.parts[id].kind === kind) out.push(c.parts[id]);
    out.sort(function (a, b) { return natCmp(a.name || '', b.name || '') || (a.id - b.id); });
    return out;
  }

  function externalInputs(c) { return partsOfKind(c, 'in'); }
  function externalOutputs(c) { return partsOfKind(c, 'out'); }

  /** その種類でまだ使われていない名前を作る。in は A,B,C…、out は Y,Z,W… */
  function freshName(c, kind) {
    var used = {}, list = partsOfKind(c, kind), i;
    for (i = 0; i < list.length; i++) used[list[i].name] = true;
    var pool = kind === 'in' ? 'ABCDEFGHIJKLMN' : 'YZWVUTS';
    for (i = 0; i < pool.length; i++) if (!used[pool[i]]) return pool[i];
    for (i = 0; ; i++) if (!used['P' + i]) return 'P' + i;
  }

  function addPart(c, kind, x, y, opt) {
    var p = { id: c.seq++, kind: kind, x: Math.round(x), y: Math.round(y) };
    if (kind === 'in' || kind === 'out') p.name = (opt && opt.name) || freshName(c, kind);
    if (kind === 'in') p.value = 0;
    if (kind === 'const') p.value = (opt && opt.value) ? 1 : 0;
    if (kind === 'clock') p.value = 0;
    if (kind === 'chip') p.chip = opt.chip;
    c.parts[p.id] = p;
    return p;
  }

  /** 部品を消すと、その部品に繋がっていた配線も道連れにする */
  function removePart(c, id) {
    if (!c.parts[id]) return false;
    delete c.parts[id];
    for (var w in c.wires) {
      if (c.wires[w].from.part === id || c.wires[w].to.part === id) delete c.wires[w];
    }
    return true;
  }

  function wireAtInput(c, partId, port) {
    for (var w in c.wires) {
      var t = c.wires[w].to;
      if (t.part === partId && t.port === port) return c.wires[w];
    }
    return null;
  }

  /** 出力(fromPart,fromPort) を 入力(toPart,toPort) に繋ぐ。繋げなければ null */
  function connect(c, fromPart, fromPort, toPart, toPort, lib) {
    var a = c.parts[fromPart], b = c.parts[toPart];
    if (!a || !b) return null;
    if (fromPart === toPart) return null;                 /* 自分の出力を自分の入力へ、は禁止 */
    if (fromPort >= portsOf(a, lib).out) return null;
    if (toPort >= portsOf(b, lib).in) return null;
    var old = wireAtInput(c, toPart, toPort);             /* 入力は1本だけ。後から繋いだ方が勝つ */
    if (old) delete c.wires[old.id];
    var w = { id: c.seq++, from: { part: fromPart, port: fromPort }, to: { part: toPart, port: toPort } };
    c.wires[w.id] = w;
    return w;
  }

  function disconnect(c, wireId) {
    if (!c.wires[wireId]) return false;
    delete c.wires[wireId];
    return true;
  }

  function clone(c) { return JSON.parse(JSON.stringify(c)); }

  /** 保存前に呼ぶ整合性検査。人に見せる日本語の指摘を並べて返す */
  function validate(c, lib) {
    var msgs = [], id, p, n;
    var seen = { in: {}, out: {} };
    for (id in c.parts) {
      p = c.parts[id];
      if (p.kind === 'in' || p.kind === 'out') {
        if (seen[p.kind][p.name]) msgs.push((p.kind === 'in' ? '入力' : '出力') + ' 「' + p.name + '」が重複しています');
        seen[p.kind][p.name] = true;
      }
      if (p.kind === 'chip' && !(lib && lib[p.chip])) msgs.push('チップ 「' + p.chip + '」が見つかりません');
      n = portsOf(p, lib);
      for (var k = 0; k < n.in; k++) {
        if (!wireAtInput(c, p.id, k)) msgs.push(labelOf(p) + ' の入力 ' + (k + 1) + ' が繋がっていません');
      }
    }
    /* 端子数が変わったチップに繋ぎっぱなしの線 */
    for (var w in c.wires) {
      var wr = c.wires[w], a = c.parts[wr.from.part], b = c.parts[wr.to.part];
      if (!a || !b) { msgs.push('行き先の無い配線があります'); continue; }
      if (wr.from.port >= portsOf(a, lib).out || wr.to.port >= portsOf(b, lib).in) {
        msgs.push(labelOf(a) + ' → ' + labelOf(b) + ' の配線が、存在しない端子を指しています');
      }
    }
    return msgs;
  }

  function labelOf(p) {
    if (!p) return '(不明)';
    if (p.kind === 'in' || p.kind === 'out') return '「' + p.name + '」';
    if (p.kind === 'chip') return '「' + p.chip + '」';
    return p.kind.toUpperCase();
  }

  NL.netlist = {
    PRIM: PRIM, RAM_PORTS: RAM_PORTS,
    create: create, clone: clone,
    portsOf: portsOf, natCmp: natCmp, labelOf: labelOf,
    partsOfKind: partsOfKind, externalInputs: externalInputs, externalOutputs: externalOutputs,
    freshName: freshName,
    addPart: addPart, removePart: removePart,
    connect: connect, disconnect: disconnect, wireAtInput: wireAtInput,
    validate: validate
  };
})(typeof window !== 'undefined' ? window : globalThis);
