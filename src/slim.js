/* 小さくする ― 素子を減らす手がかりを、今の回路から見つける
 *
 * 「NAND を減らすにはどうしたらいいか」に、一般論ではなく
 * **その人が今組んでいる回路を指さして**答えるためのもの。
 *
 * 出すのは、機械が確かめられることだけに絞る:
 *
 *   1. 同じものを2つ作っている   ― 入力が同じ素子は、出力も必ず同じ。片方で足りる
 *   2. どこにも届いていない素子   ― 出力部品まで辿り着かない。消しても動きは変わらない
 *   3. 打ち消し合う NOT が2つ     ― ひっくり返して、また戻している
 *
 * 「ド・モルガンでこう変形できる」の類は出さない。機械が式を睨んで出す助言は、
 * 当たっていても人が納得できず、外れていると回路を壊す。
 * 考え方のほうは ADVICE に文章で置いて、指さす助言と分けてある。
 *
 * 【順序回路の落とし穴】入力が同じでも、記憶を持つチップ（ラッチ・フリップフロップ）は
 * まとめてはいけない。中身の状態がたまたま違うことがあり、まとめると別の回路になる。
 * だから「輪のあるチップ」は 1. の対象から外す。NAND そのものは記憶を持たないので安全。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});
  var N = NL.netlist;

  /** その部品の入力に来ているもの。1つでも繋がっていなければ null（比べようがない） */
  function sources(circuit, p, lib) {
    var n = N.portsOf(p, lib).in, out = [], k, w;
    if (!n) return null;
    for (k = 0; k < n; k++) {
      w = N.wireAtInput(circuit, p.id, k);
      if (!w) return null;
      out.push(w.from.part + ':' + w.from.port);
    }
    return out;
  }

  /** 中に輪があるチップ（記憶を持つ）は、入力が同じでもまとめてはいけない */
  function remembers(name, lib, memo) {
    if (memo[name] !== undefined) return memo[name];
    var def = lib[name];
    if (!def) return (memo[name] = false);
    var flat = NL.lib.flatten(def.circuit, lib);
    return (memo[name] = !flat.error && NL.truth.hasFeedback(flat));
  }

  /** その部品を消したら NAND が何個減るか */
  function weight(p, lib) {
    if (p.kind === 'nand') return 1;
    if (p.kind !== 'chip') return 0;
    var def = lib && lib[p.chip];
    if (!def) return 0;
    var g = NL.truth.gateCount(def.circuit, lib);
    return g.error ? 0 : g.nand;
  }

  /**
   * 手がかりを並べて返す。
   * 各要素 { kind, msg, parts:[部品id], save:減る NAND の数 }
   * parts は画面が「選択」して指させるようにするためのもの。
   */
  function hints(circuit, lib) {
    lib = lib || {};
    var out = [], id, p, memo = {};

    /* ---- 1. 同じものを2つ作っている ---- */
    var byKey = {};
    for (id in circuit.parts) {
      p = circuit.parts[id];
      if (p.kind !== 'nand' && p.kind !== 'chip') continue;
      if (p.kind === 'chip' && remembers(p.chip, lib, memo)) continue;
      var src = sources(circuit, p, lib);
      if (!src) continue;
      /* NAND は2つの入力を入れ替えても同じ。チップは端子ごとに意味が違うので並べ替えない */
      var key = p.kind === 'nand' ? 'nand|' + src.slice().sort().join(',')
                                  : 'chip|' + p.chip + '|' + src.join(',');
      (byKey[key] || (byKey[key] = [])).push(p);
    }
    for (var k in byKey) {
      var g = byKey[k];
      if (g.length < 2) continue;
      var each = weight(g[0], lib);
      out.push({
        kind: 'same',
        parts: g.map(function (q) { return q.id; }),
        save: each * (g.length - 1),
        msg: N.labelOf(g[0]) + ' を ' + g.length + ' 個、同じ入力で置いている。'
           + '入力が同じなら出力も必ず同じなので、1個にまとめて、そこから枝分かれさせれば足りる。'
      });
    }

    /* ---- 2. どこにも届いていない ---- */
    var alive = {}, stack = [];
    for (id in circuit.parts) if (circuit.parts[id].kind === 'out') stack.push(+id);
    while (stack.length) {
      var cur = stack.pop();
      if (alive[cur]) continue;
      alive[cur] = true;
      for (var w in circuit.wires) {
        if (circuit.wires[w].to.part === cur) stack.push(circuit.wires[w].from.part);
      }
    }
    var dead = [], deadSave = 0;
    for (id in circuit.parts) {
      p = circuit.parts[id];
      if (alive[p.id] || p.kind === 'out') continue;
      dead.push(p.id);
      deadSave += weight(p, lib);
    }
    if (dead.length) {
      out.push({
        kind: 'dead',
        parts: dead,
        save: deadSave,
        msg: dead.length + ' 個が、どの出力にも届いていない。'
           + '消しても回路の動きは変わらない（作りかけを置き忘れていることが多い）。'
      });
    }

    /* ---- 3. 打ち消し合う NOT ---- */
    for (id in circuit.parts) {
      p = circuit.parts[id];
      if (p.kind !== 'nand') continue;
      var s1 = sources(circuit, p, lib);
      if (!s1 || s1[0] !== s1[1]) continue;              /* NAND(x,x) ＝ NOT でなければ関係ない */
      var users = consumers(circuit, p.id);
      if (users.length !== 2 || users[0].id !== users[1].id) continue;
      var q = users[0];
      if (q.kind !== 'nand') continue;
      var s2 = sources(circuit, q, lib);
      if (!s2 || s2[0] !== s2[1]) continue;              /* その先も NOT */
      out.push({
        kind: 'twice',
        parts: [p.id, q.id],
        save: 2,
        msg: 'NOT を2回かけていて、元に戻っている。この2個を消して、手前の線を直接その先へ繋げばよい。'
      });
    }

    out.sort(function (a, b) { return b.save - a.save; });
    return out;
  }

  /** その部品の出力を受け取っている部品（同じ相手が2回来ることもある） */
  function consumers(circuit, id) {
    var out = [];
    for (var w in circuit.wires) {
      if (circuit.wires[w].from.part === id) out.push(circuit.parts[circuit.wires[w].to.part]);
    }
    return out.filter(Boolean);
  }

  /* 指させない類の、考え方のほう。ここは人が読んで使う */
  var ADVICE = [
    ['途中の信号を使い回す',
     '半加算器なら、XOR を作る途中の NAND(A,B) がそのまま桁上げ（AND の元）になる。'
     + '「同じ組み合わせをもう一度作っていないか」を疑うのが、いちばん効く。'],
    ['NOT を最後まで持っていかない',
     'ド・モルガン。NOT した2つを AND するのと、OR して NOT するのは同じもの。'
     + '否定を回路の端に寄せると、途中の NOT がまとめて消えることがある。'],
    ['チップを使う',
     '同じ形が4桁ぶん並ぶなら、1桁ぶんをチップにしてから4つ置く。素子の数は減らないが、'
     + '配線の間違いが減り、直すのが1箇所で済む。'],
    ['小さいほうが偉いとは限らない',
     '全加算器は最小 9 個にできるが、半加算器チップ2つの素直な組み方だと 13 個。'
     + '後者のほうが読める。競うのは、詰まったときの遊びとして。']
  ];

  NL.slim = { hints: hints, ADVICE: ADVICE };
})(typeof window !== 'undefined' ? window : globalThis);
