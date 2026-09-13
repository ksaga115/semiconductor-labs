/* シミュレータ ― 3値・単位遅延・イベント駆動
 *
 * 【なぜ3値なのか】0 と 1 だけだと、電源を入れた瞬間のフリップフロップが 0 から
 * 始まってしまう。実物はどちらに転ぶか分からない。X（未定）を入れておくと
 * 「リセットを入れるまで中身は読めない」という本当の挙動になり、リセット線を
 * 忘れた回路がちゃんと動かない。嘘をつかないための X。
 *
 *   NAND の3値表 ― 片方が 0 なら、もう片方が未定でも出力は 1 で確定する。
 *
 *        b=0  b=1  b=X
 *   a=0    1    1    1
 *   a=1    1    0    X
 *   a=X    1    X    X
 *
 * 【なぜ収束反復ではなくイベント駆動なのか】「出力が変わらなくなるまで全ゲートを
 * 計算し直す」方式は、フィードバックのある回路＝ラッチで原理的に破綻する。
 * SR ラッチは同じ入力に対して答えが2つあるので、不動点は一意に決まらない。
 * 全ゲートに遅延1を与えて時間を1歩ずつ進めれば、ラッチは「前の状態を保つ」ようになり、
 * 禁止入力から抜けたときの発振も、発振として素直に観測できる。
 *
 * 1歩 = キューに入っている全ゲートを一斉に評価し、一斉に反映する。
 * 反映を1つずつやると評価の順番で答えが変わる（同じ回路が実行のたびに違う挙動になる）。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});

  var X = -1;

  function nand3(a, b) {
    if (a === 0 || b === 0) return 1;      /* 0 が1つあれば、もう片方が何でも 1 */
    if (a === 1 && b === 1) return 0;
    return X;
  }

  /* NOR の3値表（第6章の原始部品）― NAND の表の 0 と 1 を入れ替えたもの（双対）。
   * 片方が 1 なら、もう片方が未定でも出力は 0 で確定する。
   *
   *        b=0  b=1  b=X
   *   a=0    1    0    X
   *   a=1    0    0    0
   *   a=X    X    0    X
   */
  function nor3(a, b) {
    if (a === 1 || b === 1) return 0;      /* 1 が1つあれば、もう片方が何でも 0 */
    if (a === 0 && b === 0) return 1;
    return X;
  }

  var SETTLE_MAX = 2000;   /* これを超えたら発振とみなす */
  var PROBE = 40;          /* 発振している素子を特定するために追加で回す歩数 */

  function Sim(flat) {
    var n = flat.gates.length;
    this.flat = flat;
    this.v = new Int8Array(n);
    this.queued = new Uint8Array(n);
    this.q = [];
    this.time = 0;
    this.hot = [];          /* 発振している素子 */
    this.settled = true;
    this.reset();
  }

  /** 全部を未定に戻し、値の源だけ初期値を入れて、全素子を計算待ちに積む */
  Sim.prototype.reset = function () {
    var g = this.flat.gates, i;
    this.q = [];
    /* ram16（実装部品）の中身。flat は複数の Sim で共有されるので、状態は Sim 側に持つ。
     * reset ＝ 電源投入。セルは全部 X から始まる（書くまで読めない、が本当の挙動） */
    this.mem = {};
    for (i = 0; i < g.length; i++) {
      this.v[i] = (g[i].kind === 'src') ? g[i].init : X;
      if (g[i].kind === 'ram16') {
        var cells = new Int8Array(16);
        cells.fill(X);
        this.mem[i] = { cells: cells, prevC: X };
      }
      this.queued[i] = 1;
      this.q.push(i);
    }
    this.time = 0;
    this.hot = [];
    this.settled = true;
    return this;
  };

  Sim.prototype.val = function (i) { return i < 0 ? X : this.v[i]; };

  Sim.prototype.evalGate = function (i) {
    var g = this.flat.gates[i];
    if (g.kind === 'src') return this.v[i];             /* 源は外から書かれるまで動かない */
    if (g.kind === 'buf') return this.val(g.ins[0]);
    if (g.kind === 'ram16') return this.evalRam(i, g);
    if (g.kind === 'nor') return nor3(this.val(g.ins[0]), this.val(g.ins[1]));
    return nand3(this.val(g.ins[0]), this.val(g.ins[1]));
  };

  /* ram16 ―【実装部品】16語×1bit。端子は A0..A3（ins 0..3）, D(4), W(5), C(6) → Q。
   *
   * 書き込みは C の立ち上がりで。W=1 かつ番地が全部確定していれば cells[番地] = D。
   * X が絡むときは「書いたかもしれない」ので、書かれたかもしれないセルは
   * いまの値と書かれる値が違えば X にする（NAND の3値表と同じで、嘘をつかないため）:
   *   - C が 0→X や X→1 …… 立ち上がったかもしれない
   *   - W が X            …… 書き込みが有効だったかもしれない
   *   - 番地に X          …… 16 セルのどれに書いたか分からない → 全セルが対象
   * 読み出しは組み合わせ（遅延1歩）。番地に X があるときは、全セルが同じ値の
   * ときだけその値、そうでなければ X */
  Sim.prototype.evalRam = function (i, g) {
    var m = this.mem[i], k;
    var a0 = this.val(g.ins[0]), a1 = this.val(g.ins[1]);
    var a2 = this.val(g.ins[2]), a3 = this.val(g.ins[3]);
    var d = this.val(g.ins[4]), w = this.val(g.ins[5]), c = this.val(g.ins[6]);
    var addrOk = (a0 !== X && a1 !== X && a2 !== X && a3 !== X);
    var addr = addrOk ? (a0 | (a1 << 1) | (a2 << 2) | (a3 << 3)) : -1;

    var was = m.prevC;
    m.prevC = c;
    if (c !== was) {
      var sure = (was === 0 && c === 1);
      var maybe = (was === 0 && c === X) || (was === X && c === 1);
      if ((sure || maybe) && w !== 0) {
        if (sure && w === 1 && addrOk) m.cells[addr] = d;
        else if (addrOk) { if (m.cells[addr] !== d) m.cells[addr] = X; }
        else { for (k = 0; k < 16; k++) if (m.cells[k] !== d) m.cells[k] = X; }
      }
    }

    if (addrOk) return m.cells[addr];
    var v0 = m.cells[0];
    for (k = 1; k < 16; k++) if (m.cells[k] !== v0) return X;
    return v0;
  };

  /** 時間を1歩進める。値が変わった素子の番号を返す */
  Sim.prototype.step = function () {
    var q = this.q, fan = this.flat.fanout, i, k, gi;
    this.q = [];
    var idx = [], nv = [];
    for (k = 0; k < q.length; k++) {
      gi = q[k];
      this.queued[gi] = 0;
      var nextV = this.evalGate(gi);
      if (nextV !== this.v[gi]) { idx.push(gi); nv.push(nextV); }
    }
    /* 反映はまとめて。1つずつ書くと、同じ歩の中で他の素子が新しい値を読んでしまう */
    for (k = 0; k < idx.length; k++) this.v[idx[k]] = nv[k];
    for (k = 0; k < idx.length; k++) {
      var f = fan[idx[k]];
      for (i = 0; i < f.length; i++) {
        if (!this.queued[f[i]]) { this.queued[f[i]] = 1; this.q.push(f[i]); }
      }
    }
    this.time++;
    return idx;
  };

  /** 落ち着くまで進める。落ち着かなければ発振とみなし、暴れている素子を hot に入れる */
  Sim.prototype.settle = function (max) {
    max = max || SETTLE_MAX;
    var steps = 0;
    while (this.q.length && steps < max) { this.step(); steps++; }
    if (this.q.length) {
      var hot = {};
      for (var k = 0; k < PROBE; k++) {
        var ch = this.step();
        for (var i = 0; i < ch.length; i++) hot[ch[i]] = 1;
      }
      this.hot = Object.keys(hot).map(Number);
      this.settled = false;
    } else {
      this.hot = [];
      this.settled = true;
    }
    return { steps: steps, settled: this.settled };
  };

  /** 値の源に値を書く（入力スイッチ・定数・クロック） */
  Sim.prototype.setGate = function (gi, val) {
    if (gi < 0 || gi >= this.v.length) return this;
    if (this.v[gi] === val) return this;
    this.v[gi] = val;
    var f = this.flat.fanout[gi];
    for (var i = 0; i < f.length; i++) {
      if (!this.queued[f[i]]) { this.queued[f[i]] = 1; this.q.push(f[i]); }
    }
    return this;
  };

  Sim.prototype.setInputAt = function (k, val) { return this.setGate(this.flat.inputs[k], val); };

  Sim.prototype.setInput = function (name, val) {
    var k = this.flat.inNames.indexOf(name);
    return k < 0 ? this : this.setInputAt(k, val);
  };

  /** 入力名 → 値 のまとめ書き */
  Sim.prototype.setInputs = function (obj) {
    for (var k in obj) this.setInput(k, obj[k]);
    return this;
  };

  Sim.prototype.readAt = function (k) { return this.v[this.flat.outputs[k]]; };

  Sim.prototype.read = function (name) {
    var k = this.flat.outNames.indexOf(name);
    return k < 0 ? X : this.readAt(k);
  };

  Sim.prototype.outputs = function () {
    var out = [];
    for (var k = 0; k < this.flat.outputs.length; k++) out.push(this.readAt(k));
    return out;
  };

  /** クロックを反転させる。半周期ぶん */
  Sim.prototype.clockEdge = function () {
    var c = this.flat.clocks;
    for (var i = 0; i < c.length; i++) {
      var cur = this.v[c[i]];
      this.setGate(c[i], cur === 1 ? 0 : 1);
    }
    return this;
  };

  /** 立ち上げて落とすまでで1周期。落ち着かせながら進める */
  Sim.prototype.clockCycle = function (max) {
    this.clockEdge(); this.settle(max);
    this.clockEdge(); this.settle(max);
    return this;
  };

  /** 経路（"3/12"）で素子の値を読む。チップの中を覗くときに使う */
  Sim.prototype.atPath = function (path) {
    var gi = this.flat.byPath[path];
    return gi === undefined ? X : this.v[gi];
  };

  /** トップの部品の出力ポートの値。画面の配線に色を付けるのに使う */
  Sim.prototype.portValue = function (partId, port) {
    var outs = this.flat.topOuts[partId];
    if (!outs || outs[port] === undefined || outs[port] < 0) return X;
    return this.v[outs[port]];
  };

  /** 入力を与えて落ち着かせるまでを一息で。組み合わせ回路の評価用 */
  function evaluate(flat, inputs, opt) {
    var sim = new Sim(flat);
    sim.reset();
    if (Array.isArray(inputs)) { for (var i = 0; i < inputs.length; i++) sim.setInputAt(i, inputs[i]); }
    else sim.setInputs(inputs || {});
    var r = sim.settle(opt && opt.max);
    return { sim: sim, out: sim.outputs(), settled: r.settled, steps: r.steps };
  }

  function show(v) { return v === X ? 'X' : String(v); }

  NL.sim = {
    X: X, nand3: nand3, nor3: nor3, SETTLE_MAX: SETTLE_MAX,
    Sim: Sim, evaluate: evaluate, show: show
  };
})(typeof window !== 'undefined' ? window : globalThis);
