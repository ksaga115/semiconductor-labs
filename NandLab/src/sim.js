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
    for (i = 0; i < g.length; i++) {
      this.v[i] = (g[i].kind === 'src') ? g[i].init : X;
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
    return nand3(this.val(g.ins[0]), this.val(g.ins[1]));
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
    X: X, nand3: nand3, SETTLE_MAX: SETTLE_MAX,
    Sim: Sim, evaluate: evaluate, show: show
  };
})(typeof window !== 'undefined' ? window : globalThis);
