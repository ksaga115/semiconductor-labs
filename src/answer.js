/* お手本 ― 22問それぞれを実際に組んだ回路
 *
 * 課題の「お手本の NAND 数」は、ここで組んだ回路の実測値。
 * **画面の「お手本を見る」と、検査（tests/quest.js）は同じこれを使う。**
 * 別々に持つと、検査を通っているお手本と、人が見るお手本が食い違う。
 *
 * 下から順に積み上げる。NOT を組んでチップにし、それで AND を組んで…と、
 * 人がやるのと同じ手順を踏む。だからここが通ることは、
 * チップ機構（階層・展開・境界をまたぐフィードバック）が本当に動く証拠でもある。
 *
 * 【端子の順番】チップの端子は「名前の自然順」に並ぶ。作った順ではない。
 * SR ラッチを S,R の順で作っても入力は R,S の順になる。
 * 添字で繋ぐと黙って取り違えるので、紛らわしいものは chipn()（名前で指定）を使う。
 *
 * 【置き場所】ここでは座標を適当にしか置かない。見せる前に layout で整える。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});
  var N = NL.netlist, L = NL.lib;

  /* 信号 = { part, port }。nand(a,b) は信号を2つ受けて信号を1つ返す。
   * こう書けると、お手本の回路が数式そのままの見た目になる */
  function sig(part, port) { return { part: part, port: port || 0 }; }

  function Builder(lib) { this.c = N.create(); this.lib = lib || {}; this.x = 0; }

  Builder.prototype.link = function (s, part, port) {
    if (!N.connect(this.c, s.part.id, s.port, part.id, port, this.lib)) {
      throw new Error('繋げなかった: ' + N.labelOf(s.part) + '[' + s.port + '] → ' + N.labelOf(part) + '[' + port + ']');
    }
  };
  Builder.prototype.place = function (kind, opt) {
    this.x += 60;
    return N.addPart(this.c, kind, this.x % 900, 60 + (this.x % 400), opt);
  };
  Builder.prototype.input = function (name) { return sig(this.place('in', { name: name }), 0); };
  Builder.prototype.output = function (name, s) { var p = this.place('out', { name: name }); this.link(s, p, 0); return p; };
  Builder.prototype.konst = function (v) { return sig(this.place('const', { value: v }), 0); };
  /** 入力を後から繋ぎたいとき（フィードバックの輪を作るときに使う） */
  Builder.prototype.openNand = function () { return this.place('nand'); };
  Builder.prototype.nand = function (a, b) {
    var g = this.place('nand');
    this.link(a, g, 0); this.link(b, g, 1);
    return sig(g, 0);
  };
  /** チップを1つ置いて、出力の信号を並べて返す */
  Builder.prototype.chip = function (name, args) {
    var def = this.lib[name];
    if (!def) throw new Error('チップが無い: ' + name);
    var p = this.place('chip', { chip: name }), self = this;
    args.forEach(function (s, i) { if (s) self.link(s, p, i); });
    return def.outputs.map(function (_, i) { return sig(p, i); });
  };
  /** 端子を名前で指定してチップを置く。戻り値も出力名をキーにした連想配列 */
  Builder.prototype.chipn = function (name, argsByName) {
    var def = this.lib[name];
    if (!def) throw new Error('チップが無い: ' + name);
    var args = def.inNames.map(function (nm) { return argsByName[nm]; });
    var outs = this.chip(name, args), byName = {};
    def.outNames.forEach(function (nm, i) { byName[nm] = outs[i]; });
    return byName;
  };
  /** 出力を自分の入力へ戻すチップ（レジスタ・カウンタ）。端子は必ず名前で指定する */
  Builder.prototype.openChip = function (name) {
    var def = this.lib[name];
    if (!def) throw new Error('チップが無い: ' + name);
    var p = this.place('chip', { chip: name }), self = this;
    return {
      part: p,
      to: function (portName, s) {
        var i = def.inNames.indexOf(portName);
        if (i < 0) throw new Error(name + ' に入力 ' + portName + ' は無い');
        self.link(s, p, i);
      },
      out: function (portName) {
        var i = def.outNames.indexOf(portName);
        if (i < 0) throw new Error(name + ' に出力 ' + portName + ' は無い');
        return sig(p, i);
      }
    };
  };

  function four(b, prefix) {
    return [0, 1, 2, 3].map(function (i) { return b.input(prefix + i); });
  }

  /* 組む順。chip はこの回路を登録するときの名前（次の課題から部品として使える） */
  var STEPS = [
    { id: 'not', chip: 'NOT', build: function (b) {
      var a = b.input('A');
      b.output('Y', b.nand(a, a));
    } },
    { id: 'and', chip: 'AND', build: function (b) {
      var a = b.input('A'), c = b.input('B');
      b.output('Y', b.chip('NOT', [b.nand(a, c)])[0]);
    } },
    { id: 'or', chip: 'OR', build: function (b) {
      var a = b.input('A'), c = b.input('B');
      /* ド・モルガン: A + B = NOT(NOT A ・ NOT B) = NAND(NOT A, NOT B) */
      b.output('Y', b.nand(b.chip('NOT', [a])[0], b.chip('NOT', [c])[0]));
    } },
    { id: 'xor', chip: 'XOR', build: function (b) {
      var a = b.input('A'), c = b.input('B');
      var t = b.nand(a, c);
      b.output('Y', b.nand(b.nand(a, t), b.nand(c, t)));
    } },
    { id: 'nor', chip: 'NOR', build: function (b) {
      var a = b.input('A'), c = b.input('B');
      b.output('Y', b.chip('NOT', [b.chip('OR', [a, c])[0]])[0]);
    } },
    { id: 'xnor', chip: 'XNOR', build: function (b) {
      var a = b.input('A'), c = b.input('B');
      b.output('Y', b.chip('NOT', [b.chip('XOR', [a, c])[0]])[0]);
    } },
    { id: 'mux', chip: 'MUX', build: function (b) {
      var a = b.input('A'), c = b.input('B'), s = b.input('S');
      var ns = b.chip('NOT', [s])[0];
      b.output('Y', b.nand(b.nand(a, ns), b.nand(c, s)));
    } },
    { id: 'dec24', chip: 'DEC24', build: function (b) {
      var a = b.input('A'), c = b.input('B');
      var na = b.chip('NOT', [a])[0], nc = b.chip('NOT', [c])[0];
      b.output('Y0', b.chip('AND', [na, nc])[0]);
      b.output('Y1', b.chip('AND', [na, c])[0]);
      b.output('Y2', b.chip('AND', [a, nc])[0]);
      b.output('Y3', b.chip('AND', [a, c])[0]);
    } },
    { id: 'mux4', chip: 'MUX4', build: function (b) {
      var d = four(b, 'D'), s0 = b.input('S0'), s1 = b.input('S1');
      var lo = b.chipn('MUX', { A: d[0], B: d[1], S: s0 }).Y;
      var hi = b.chipn('MUX', { A: d[2], B: d[3], S: s0 }).Y;
      b.output('Y', b.chipn('MUX', { A: lo, B: hi, S: s1 }).Y);
    } },
    { id: 'eq4', chip: 'EQ4', build: function (b) {
      var A = four(b, 'A'), B = four(b, 'B');
      var same = A.map(function (a, i) { return b.chipn('XNOR', { A: a, B: B[i] }).Y; });
      var t1 = b.chipn('AND', { A: same[0], B: same[1] }).Y;
      var t2 = b.chipn('AND', { A: same[2], B: same[3] }).Y;
      b.output('Y', b.chipn('AND', { A: t1, B: t2 }).Y);
    } },
    { id: 'half', chip: 'HALF', build: function (b) {
      var a = b.input('A'), c = b.input('B');
      /* XOR の途中で作る NAND(A,B) が、そのまま桁上げの元にもなる */
      var t = b.nand(a, c);
      b.output('S', b.nand(b.nand(a, t), b.nand(c, t)));
      b.output('Y', b.nand(t, t));
    } },
    { id: 'full', chip: 'FULL', build: function (b) {
      var a = b.input('A'), c = b.input('B'), ci = b.input('C');
      var h1 = b.chip('HALF', [a, c]);          /* [S, Y] */
      var h2 = b.chip('HALF', [h1[0], ci]);
      b.output('S', h2[0]);
      b.output('Y', b.chip('OR', [h1[1], h2[1]])[0]);
    } },
    { id: 'add4', chip: 'ADD4', build: function (b) {
      var A = four(b, 'A'), B = four(b, 'B'), carry = b.konst(0), i;
      for (i = 0; i < 4; i++) {
        var f = b.chip('FULL', [A[i], B[i], carry]);   /* [S, Y] */
        b.output('S' + i, f[0]);
        carry = f[1];
      }
      b.output('Y', carry);
    } },
    { id: 'mul2', chip: 'MUL2', build: function (b) {
      var a0 = b.input('A0'), a1 = b.input('A1'), b0 = b.input('B0'), b1 = b.input('B1');
      /* 筆算そのまま
       *        a1 a0
       *   ×    b1 b0
       *   ------------
       *     a1b0 a0b0
       *  a1b1 a0b1
       */
      var p00 = b.chip('AND', [a0, b0])[0];
      var p10 = b.chip('AND', [a1, b0])[0];
      var p01 = b.chip('AND', [a0, b1])[0];
      var p11 = b.chip('AND', [a1, b1])[0];
      var h1 = b.chip('HALF', [p10, p01]);       /* [S, Y] */
      var h2 = b.chip('HALF', [p11, h1[1]]);
      b.output('P0', p00);
      b.output('P1', h1[0]);
      b.output('P2', h2[0]);
      b.output('P3', h2[1]);
    } },
    { id: 'sub4', chip: 'SUB4', build: function (b) {
      var A = four(b, 'A'), B = four(b, 'B'), i;
      /* 2の補数: A + (B をひっくり返したもの) + 1 */
      var carry = b.konst(1);
      for (i = 0; i < 4; i++) {
        var f = b.chipn('FULL', { A: A[i], B: b.chip('NOT', [B[i]])[0], C: carry });
        b.output('D' + i, f.S);
        carry = f.Y;
      }
      b.output('C', carry);      /* 上へ出た繰り上がり＝借りが出なかった印 */
    } },
    { id: 'srlatch', chip: 'SRLATCH', build: function (b) {
      var s = b.input('S'), r = b.input('R');
      /* 互い違いに繋ぐので、先にゲートを置いてから配線する */
      var g1 = b.openNand(), g2 = b.openNand();
      b.link(s, g1, 0);
      b.link(sig(g2, 0), g1, 1);
      b.link(r, g2, 0);
      b.link(sig(g1, 0), g2, 1);
      b.output('Q', sig(g1, 0));
      b.output('P', sig(g2, 0));
    } },
    { id: 'dlatch', chip: 'DLATCH', build: function (b) {
      var d = b.input('D'), e = b.input('E');
      var nd = b.chip('NOT', [d])[0];
      var s = b.nand(d, e);
      var r = b.nand(nd, e);
      b.output('Q', b.chipn('SRLATCH', { S: s, R: r }).Q);
    } },
    { id: 'dff', chip: 'DFF', build: function (b) {
      var d = b.input('D'), c = b.input('C');
      /* 主従。前段は C が 0 のとき開き、後段は 1 のとき開く。
       * 同時に開かないので、値は1回の上げ下げで1段しか進まない */
      var master = b.chipn('DLATCH', { D: d, E: b.chip('NOT', [c])[0] }).Q;
      b.output('Q', b.chipn('DLATCH', { D: master, E: c }).Q);
    } },
    { id: 'reg4', chip: 'REG4', build: function (b) {
      var D = four(b, 'D'), c = b.input('C'), w = b.input('W'), i;
      for (i = 0; i < 4; i++) {
        /* Q をセレクタ経由で自分の D に戻すので、先に置いてから繋ぐ */
        var ff = b.openChip('DFF');
        var q = ff.out('Q');
        ff.to('C', c);
        ff.to('D', b.chipn('MUX', { A: q, B: D[i], S: w }).Y);   /* W=0 なら自分自身を書き戻す */
        b.output('Q' + i, q);
      }
    } },
    { id: 'shift4', chip: 'SHIFT4', build: function (b) {
      var d = b.input('D'), c = b.input('C'), prev = d, i;
      for (i = 0; i < 4; i++) {
        prev = b.chipn('DFF', { D: prev, C: c }).Q;
        b.output('Q' + i, prev);
      }
    } },
    { id: 'count4', chip: 'COUNT4', build: function (b) {
      var c = b.input('C'), r = b.input('R'), i;
      var keep = b.chip('NOT', [r])[0];                     /* R=1 なら取り込む値を 0 に潰す */
      var ff = [0, 1, 2, 3].map(function () { return b.openChip('DFF'); });
      var q = ff.map(function (f) { return f.out('Q'); });

      /* 下の桁が全部 1 のとき、その桁は反転する */
      var c01 = b.chipn('AND', { A: q[0], B: q[1] }).Y;
      var c012 = b.chipn('AND', { A: c01, B: q[2] }).Y;
      var next = [
        b.chip('NOT', [q[0]])[0],
        b.chipn('XOR', { A: q[1], B: q[0] }).Y,
        b.chipn('XOR', { A: q[2], B: c01 }).Y,
        b.chipn('XOR', { A: q[3], B: c012 }).Y
      ];
      for (i = 0; i < 4; i++) {
        ff[i].to('C', c);
        ff[i].to('D', b.chipn('AND', { A: next[i], B: keep }).Y);
        b.output('Q' + i, q[i]);
      }
    } },
    { id: 'alu4', chip: 'ALU4', build: function (b) {
      var A = four(b, 'A'), B = four(b, 'B'), s0 = b.input('S0'), s1 = b.input('S1'), i;
      /* S0 は「B を反転して 1 を足す」＝引き算のスイッチ。同じ加算器が引き算にもなる */
      var carry = s0;
      for (i = 0; i < 4; i++) {
        var bi = b.chipn('XOR', { A: B[i], B: s0 }).Y;
        var f = b.chipn('FULL', { A: A[i], B: bi, C: carry });
        carry = f.Y;
        var and = b.chipn('AND', { A: A[i], B: B[i] }).Y;
        var xor = b.chipn('XOR', { A: A[i], B: B[i] }).Y;
        var logic = b.chipn('MUX', { A: and, B: xor, S: s0 }).Y;
        b.output('Y' + i, b.chipn('MUX', { A: f.S, B: logic, S: s1 }).Y);
      }
    } }
  ];

  var BY_ID = {};
  STEPS.forEach(function (st) { BY_ID[st.id] = st; });

  /**
   * 全部を下から組み上げる。
   * 戻り値 { lib, circuits:{id: 回路}, errors:{id: 理由} }
   */
  function buildAll() {
    var lib = {}, circuits = {}, errors = {};
    STEPS.forEach(function (st) {
      var b = new Builder(lib);
      try { st.build(b); } catch (e) { errors[st.id] = e.message; return; }
      circuits[st.id] = b.c;
      if (!st.chip) return;
      var made = L.makeChip(st.chip, b.c, lib);
      if (made.error) errors[st.id] = made.error; else lib[st.chip] = made.chip;
    });
    return { lib: lib, circuits: circuits, errors: errors };
  }

  /** 課題1つぶんのお手本。{ circuit, lib, uses:[使っているチップ名] } / 無ければ null */
  function build(id) {
    if (!BY_ID[id]) return null;
    var all = buildAll();
    var c = all.circuits[id];
    if (!c) return null;
    var uses = {}, list = [];
    for (var pid in c.parts) if (c.parts[pid].kind === 'chip') uses[c.parts[pid].chip] = true;
    for (var nm in uses) list.push(nm);
    return { circuit: c, lib: all.lib, uses: list.sort(N.natCmp) };
  }

  NL.answer = { STEPS: STEPS, BY_ID: BY_ID, build: build, buildAll: buildAll, Builder: Builder, sig: sig };
})(typeof window !== 'undefined' ? window : globalThis);
