/* 回路を論理式として読む
 *
 * 見せるものは2段構え。
 *
 *   過程   NAND を上流から順に1行ずつ。「回路のとおり」に書き下したものと、
 *          それを整理したものを並べる。s1 が ¬A になり、s2 が A·B になり……と
 *          式が育っていく様子がそのまま出る。
 *   まとめ 各出力の、最後まで整理した式。
 *
 * 【ループがあると式にならない】順序回路の出力は「今の入力」だけでは決まらない。
 * SR ラッチの Q は S と R の式では書けない（同じ入力に対して答えが2つある）。
 * 無理に何かを出すより、順序回路であることをはっきり言う。
 *
 * 【整理の規則】NAND 直訳（¬(x·y)）のままでは読めないので、次の書き換えを繰り返す。
 *
 *   ¬¬x            → x
 *   x·x            → x                （同じものは1つにまとめる）
 *   x·¬x           → 0,  x+¬x → 1
 *   ¬(¬a · ¬b)     → a + b            （ド・モルガン）
 *   a·t + b·t      → (a+b)·t          （共通因子でくくる）
 *   ¬(a·b) · (a+b) → a ⊕ b
 *   a·¬b + ¬a·b    → a ⊕ b
 *
 * この規則だけで、NAND で組んだ NOT・AND・OR・XOR・セレクタ・加算器は
 * 人が書くのと同じ形まで戻る。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});

  /* ---------------- 式の木 ---------------- */

  function V(name) { return { op: 'var', name: name }; }
  function K(v) { return { op: 'const', v: v ? 1 : 0 }; }
  function XU() { return { op: 'x' }; }
  function NOT(a) { return { op: 'not', a: a }; }
  function AND(xs) { return { op: 'and', xs: xs }; }
  function OR(xs) { return { op: 'or', xs: xs }; }
  function XOR(xs) { return { op: 'xor', xs: xs }; }

  /* 同じ式かどうかを比べるための正規形。and/or/xor は順序を無視したいので子を並べ替える */
  function key(n) {
    switch (n.op) {
      case 'var': return 'v:' + n.name;
      case 'const': return 'k' + n.v;
      case 'x': return 'X';
      case 'not': return '!' + key(n.a);
      default: return n.op + '(' + n.xs.map(key).sort().join(',') + ')';
    }
  }

  function isNot(n) { return n.op === 'not'; }
  function same(a, b) { return key(a) === key(b); }

  /* ---------------- 整理 ---------------- */

  var MAX_DEPTH = 400;

  function simp(n, depth) {
    depth = depth || 0;
    if (depth > MAX_DEPTH) return n;

    if (n.op === 'var' || n.op === 'const' || n.op === 'x') return n;

    if (n.op === 'not') {
      var a = simp(n.a, depth + 1);
      if (a.op === 'not') return a.a;
      if (a.op === 'const') return K(a.v ? 0 : 1);
      /* ド・モルガン。全部の子が否定のときだけ使う（そうでないと式が長くなる） */
      if (a.op === 'and' && a.xs.length > 1 && a.xs.every(isNot)) {
        return simp(OR(a.xs.map(function (t) { return t.a; })), depth + 1);
      }
      if (a.op === 'or' && a.xs.length > 1 && a.xs.every(isNot)) {
        return simp(AND(a.xs.map(function (t) { return t.a; })), depth + 1);
      }
      return NOT(a);
    }

    if (n.op === 'and' || n.op === 'or') {
      var isAnd = n.op === 'and';
      var xs = [], i;
      /* 入れ子の同じ演算をならす: a·(b·c) → a·b·c */
      n.xs.forEach(function (c) {
        var s = simp(c, depth + 1);
        if (s.op === n.op) xs = xs.concat(s.xs); else xs.push(s);
      });

      /* 定数を吸収する */
      var out = [], zero = false, one = false;
      xs.forEach(function (c) {
        if (c.op === 'const') { if (c.v === (isAnd ? 0 : 1)) (isAnd ? zero = true : one = true); return; }
        out.push(c);
      });
      if (isAnd && zero) return K(0);
      if (!isAnd && one) return K(1);

      /* 同じものを1つにまとめる */
      var seen = {}, uniq = [];
      out.forEach(function (c) { var k = key(c); if (!seen[k]) { seen[k] = 1; uniq.push(c); } });

      /* x と ¬x が同居していたら 0 / 1 に潰れる */
      for (i = 0; i < uniq.length; i++) {
        if (uniq[i].op !== 'not') continue;
        if (uniq.some(function (c) { return same(c, uniq[i].a); })) return K(isAnd ? 0 : 1);
      }

      if (!uniq.length) return K(isAnd ? 1 : 0);
      if (uniq.length === 1) return uniq[0];

      var node = { op: n.op, xs: uniq };
      var f = isAnd ? null : factor(node, depth);
      if (f) return f;
      var x = asXor(node);
      return x || node;
    }

    if (n.op === 'xor') return { op: 'xor', xs: n.xs.map(function (c) { return simp(c, depth + 1); }) };
    return n;
  }

  /** a·t + b·t → (a+b)·t 。共通因子でくくると、その先で XOR に気づけるようになる */
  function factor(orNode, depth) {
    if (!orNode.xs.every(function (c) { return c.op === 'and'; })) return null;
    var first = orNode.xs[0].xs;
    var common = first.filter(function (t) {
      return orNode.xs.every(function (c) { return c.xs.some(function (u) { return same(u, t); }); });
    });
    if (!common.length) return null;

    var ck = common.map(key);
    var rests = orNode.xs.map(function (c) {
      var r = c.xs.filter(function (u) { return ck.indexOf(key(u)) < 0; });
      return r.length === 0 ? K(1) : (r.length === 1 ? r[0] : AND(r));
    });
    /* 全部が共通因子だけなら、くくっても何も減らない */
    if (rests.every(function (r) { return r.op === 'const' && r.v === 1; })) return null;
    return simp(AND(common.concat([OR(rests)])), (depth || 0) + 1);
  }

  /** XOR に見える形を XOR にする */
  function asXor(node) {
    var xs = node.xs;
    if (xs.length !== 2) return null;

    if (node.op === 'and') {
      /* ¬(a·b) · (a+b) */
      var neg = xs.find(function (c) { return c.op === 'not' && c.a.op === 'and' && c.a.xs.length === 2; });
      var dis = xs.find(function (c) { return c.op === 'or' && c.xs.length === 2; });
      if (neg && dis && neg !== dis && key(AND(neg.a.xs)) === key(AND(dis.xs))) {
        return XOR(dis.xs.slice());
      }
      return null;
    }

    /* a·¬b + ¬a·b */
    if (xs[0].op !== 'and' || xs[1].op !== 'and') return null;
    if (xs[0].xs.length !== 2 || xs[1].xs.length !== 2) return null;
    var p = xs[0].xs, q = xs[1].xs;
    for (var i = 0; i < 2; i++) {
      var a = p[i], nb = p[1 - i];
      if (nb.op !== 'not') continue;
      var b = nb.a;
      var wantA = NOT(a), wantB = b;
      var kq = q.map(key).sort().join('|');
      if (kq === [key(wantA), key(wantB)].sort().join('|')) return XOR([a, b]);
    }
    return null;
  }

  /* ---------------- 文字にする ---------------- */

  var PREC = { or: 1, xor: 2, and: 3, not: 4, var: 5, 'const': 5, x: 5 };
  var JOIN = { and: ' · ', or: ' + ', xor: ' ⊕ ' };

  function text(n, names) {
    var sub = names && names[key(n)];
    if (sub) return sub;
    switch (n.op) {
      case 'var': return n.name;
      case 'const': return String(n.v);
      case 'x': return 'X';
      case 'not': return '¬' + wrap(n.a, PREC.not, names);
      default: return n.xs.map(function (c) { return wrap(c, PREC[n.op], names); }).join(JOIN[n.op]);
    }
  }
  function wrap(n, prec, names) {
    var t = text(n, names);
    return (PREC[n.op] < prec && !(names && names[key(n)])) ? '(' + t + ')' : t;
  }

  /* ---------------- 回路を読む ---------------- */

  var INLINE_LIMIT = 180;   /* これを超えたら中間信号の名前を使って縮める */

  /**
   * 戻り値
   *   { error }                                     … 展開できない
   *   { sequential: true, loops }                   … ループがあるので式にならない
   *   { vars, steps:[{name,raw,simple}], outputs:[{name,text}] }
   */
  function analyze(circuit, lib) {
    var flat = NL.lib.flatten(circuit, lib);
    if (flat.error) return { error: flat.error };
    if (!flat.outputs.length) return { error: '出力部品がありません' };
    if (NL.truth.hasRam(flat)) return { error: 'RAM16（記憶を持つ実装部品）を含む回路は、論理式にできません' };

    var loops = NL.truth.cycles(flat);
    if (loops.length) return { sequential: true, loops: loops, error: null };

    var g = flat.gates;

    /* buf（チップの境目・出力部品）は素通しなので、実体まで辿る */
    function resolve(gi) {
      var guard = 0;
      while (gi >= 0 && g[gi].kind === 'buf' && guard++ < 10000) gi = g[gi].ins[0];
      return gi;
    }

    /* 出力から遡って、使われている NAND だけを上流順に並べる */
    var order = [], mark = {};
    (function () {
      var stack = flat.outputs.map(resolve).filter(function (i) { return i >= 0; });
      var state = {};
      function visit(gi) {
        if (gi < 0 || state[gi] === 2) return;
        state[gi] = 1;
        if (g[gi].kind === 'nand' || g[gi].kind === 'nor') {
          g[gi].ins.forEach(function (i) { visit(resolve(i)); });
          order.push(gi);
        }
        state[gi] = 2;
      }
      stack.forEach(visit);
    })();
    order.forEach(function (gi, i) { mark[gi] = 's' + (i + 1); });

    /* どの素子が2箇所以上から使われているか（中間信号に名前を付ける基準） */
    var used = {};
    order.forEach(function (gi) {
      g[gi].ins.forEach(function (i) { var r = resolve(i); if (r >= 0) used[r] = (used[r] || 0) + 1; });
    });
    flat.outputs.forEach(function (i) { var r = resolve(i); if (r >= 0) used[r] = (used[r] || 0) + 1; });

    function leafName(gi) {
      if (gi < 0) return 'X';
      var p = g[gi].part;
      if (g[gi].kind !== 'src') return mark[gi] || '?';
      if (p.kind === 'const') return p.value ? '1' : '0';
      if (p.kind === 'clock') return 'CLK';
      return p.name;
    }
    function leafExpr(gi) {
      if (gi < 0) return XU();
      if (g[gi].kind === 'src') {
        var p = g[gi].part;
        if (p.kind === 'const') return K(p.value);
        if (p.kind === 'clock') return V('CLK');
        return V(p.name);
      }
      return exprOf[gi];
    }

    /* 上流から順に、その素子の式を組み立てて整理する */
    var exprOf = {}, steps = [], names = {};
    order.forEach(function (gi) {
      var a = resolve(g[gi].ins[0]), b = resolve(g[gi].ins[1]);
      /* NAND は ¬(a·b)、NOR（第6章）は ¬(a+b) */
      var isNor = g[gi].kind === 'nor';
      exprOf[gi] = simp(NOT((isNor ? OR : AND)([leafExpr(a), leafExpr(b)])));
      var raw = '¬(' + leafName(a) + (isNor ? ' + ' : ' · ') + leafName(b) + ')';
      steps.push({ name: mark[gi], raw: raw, simple: text(exprOf[gi], names), gate: gi });
      /* 2箇所以上から使われる素子は、以降の式でこの名前に置き換えて短くする */
      if ((used[gi] || 0) >= 2 && exprOf[gi].op !== 'var' && exprOf[gi].op !== 'const') {
        names[key(exprOf[gi])] = mark[gi];
      }
    });

    var outputs = flat.outputs.map(function (oi, k) {
      var r = resolve(oi);
      var e = r < 0 ? XU() : leafExpr(r);
      var full = text(e, null);
      return { name: flat.outNames[k], text: full.length <= INLINE_LIMIT ? full : text(e, names) };
    });

    var vars = flat.inNames.slice();
    if (flat.clocks.length) vars.push('CLK');

    return { vars: vars, steps: steps, outputs: outputs, error: null, sequential: false };
  }

  NL.expr = {
    analyze: analyze, simp: simp, text: text, key: key,
    V: V, K: K, NOT: NOT, AND: AND, OR: OR, XOR: XOR
  };
})(typeof window !== 'undefined' ? window : globalThis);
