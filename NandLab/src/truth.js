/* 真理値表の抽出と、組み合わせ回路かどうかの判定
 *
 * 1行ごとに必ず reset() してから入力を与える。前の行の状態を引きずったまま
 * 次の行を測ると、組み合わせ回路のつもりの回路に順序回路の挙動が混ざり、
 * 表が「そのとき測った順番」に依存する。表は順番に依存してはいけない。
 *
 * ループ（フィードバック）があるかどうかは素子のつながりから直接調べる。
 * ループがあれば順序回路なので、真理値表は X だらけか、行の意味が薄くなる。
 * 「表がおかしい」ではなく「これは順序回路です」と言えるようにするための判定。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});
  var X = NL.sim.X;

  var MAX_INPUTS = 12;    /* 2^12 = 4096 行。これ以上は現実的な待ち時間で出せない */

  /* 素子のつながりの強連結成分を求める（Tarjan）。再帰だと大きな回路で
   * スタックが溢れるので、明示的なスタックで回す */
  function cycles(flat) {
    var g = flat.gates, n = g.length;
    var index = new Int32Array(n).fill(-1);
    var low = new Int32Array(n);
    var onStk = new Uint8Array(n);
    var stk = [], counter = 0, result = [];
    var work = [];

    for (var root = 0; root < n; root++) {
      if (index[root] >= 0) continue;
      work.push([root, 0]);
      while (work.length) {
        var top = work[work.length - 1], v = top[0], pi = top[1];
        if (pi === 0) { index[v] = low[v] = counter++; stk.push(v); onStk[v] = 1; }

        var advanced = false;
        while (pi < g[v].ins.length) {
          var w = g[v].ins[pi++];
          if (w < 0) continue;
          if (index[w] < 0) { top[1] = pi; work.push([w, 0]); advanced = true; break; }
          if (onStk[w] && low[v] > index[w]) low[v] = index[w];
        }
        if (advanced) continue;
        top[1] = pi;

        if (low[v] === index[v]) {
          var comp = [], w2;
          do { w2 = stk.pop(); onStk[w2] = 0; comp.push(w2); } while (w2 !== v);
          /* 大きさ1でも、自分の入力が自分なら立派なループ */
          if (comp.length > 1 || g[v].ins.indexOf(v) >= 0) result.push(comp);
        }
        work.pop();
        if (work.length) {
          var par = work[work.length - 1][0];
          if (low[par] > low[v]) low[par] = low[v];
        }
      }
    }
    return result;
  }

  function hasFeedback(flat) { return cycles(flat).length > 0; }

  /**
   * 真理値表を作る。
   * 戻り値 { inNames, outNames, rows:[{in:[],out:[],settled}], sequential, error }
   */
  function table(circuit, lib, opt) {
    var flat = NL.lib.flatten(circuit, lib);
    if (flat.error) return { error: flat.error, rows: [], inNames: [], outNames: [] };

    var inNames = flat.inNames, outNames = flat.outNames;
    var n = inNames.length;
    if (!outNames.length) return { error: '出力部品がありません', rows: [], inNames: inNames, outNames: outNames };
    if (n > MAX_INPUTS) {
      return { error: '入力が ' + n + ' 個あります。真理値表を出せるのは ' + MAX_INPUTS + ' 個までです',
               rows: [], inNames: inNames, outNames: outNames };
    }

    var loops = cycles(flat);
    var sim = new NL.sim.Sim(flat);
    var rows = [], total = 1 << n, m, i;

    for (m = 0; m < total; m++) {
      sim.reset();
      var bits = [];
      for (i = 0; i < n; i++) { bits.push((m >> (n - 1 - i)) & 1); sim.setInputAt(i, bits[i]); }
      var r = sim.settle(opt && opt.max);
      rows.push({ in: bits, out: sim.outputs(), settled: r.settled });
    }
    return {
      inNames: inNames, outNames: outNames, rows: rows,
      sequential: loops.length > 0, loops: loops, gates: flat.gates.length, error: null
    };
  }

  /** NAND の数（チップを展開したあとの正味の素子数）。回路の"重さ"の指標 */
  function gateCount(circuit, lib) {
    var flat = NL.lib.flatten(circuit, lib);
    if (flat.error) return { error: flat.error, nand: 0, total: 0 };
    var nand = 0;
    for (var i = 0; i < flat.gates.length; i++) if (flat.gates[i].kind === 'nand') nand++;
    return { nand: nand, total: flat.gates.length, error: null };
  }

  /**
   * 期待する表と突き合わせる。
   * spec = { inputs:['A','B'], outputs:['Y'], rows:[[a,b, y], ...] }（入力の次に出力を並べる）
   * 戻り値 { ok, error, bad:{in:[],want:[],got:[]} }
   */
  function check(circuit, lib, spec) {
    var t = table(circuit, lib);
    if (t.error) return { ok: false, error: t.error };

    var miss = spec.inputs.filter(function (nm) { return t.inNames.indexOf(nm) < 0; });
    if (miss.length) return { ok: false, error: '入力 ' + miss.map(q).join('・') + ' がありません' };
    var missO = spec.outputs.filter(function (nm) { return t.outNames.indexOf(nm) < 0; });
    if (missO.length) return { ok: false, error: '出力 ' + missO.map(q).join('・') + ' がありません' };

    var extra = t.inNames.filter(function (nm) { return spec.inputs.indexOf(nm) < 0; });
    if (extra.length) return { ok: false, error: '余分な入力 ' + extra.map(q).join('・') + ' があります' };
    var extraO = t.outNames.filter(function (nm) { return spec.outputs.indexOf(nm) < 0; });
    if (extraO.length) return { ok: false, error: '余分な出力 ' + extraO.map(q).join('・') + ' があります' };

    /* 課題の並び順と回路の並び順が違っていてもよいように、名前で対応づける */
    var iMap = spec.inputs.map(function (nm) { return t.inNames.indexOf(nm); });
    var oMap = spec.outputs.map(function (nm) { return t.outNames.indexOf(nm); });
    var byKey = {};
    t.rows.forEach(function (row) { byKey[row.in.join('')] = row; });

    for (var r = 0; r < spec.rows.length; r++) {
      var want = spec.rows[r];
      var key = [], i;
      for (i = 0; i < t.inNames.length; i++) key[i] = 0;
      for (i = 0; i < iMap.length; i++) key[iMap[i]] = want[i];
      var row = byKey[key.join('')];
      if (!row) return { ok: false, error: '対応する行が見つかりません' };

      var got = oMap.map(function (k) { return row.out[k]; });
      var wantOut = want.slice(spec.inputs.length);
      for (i = 0; i < got.length; i++) {
        if (got[i] !== wantOut[i]) {
          return {
            ok: false,
            bad: { in: want.slice(0, spec.inputs.length), want: wantOut, got: got, settled: row.settled },
            error: row.settled ? null : '発振しています（値が落ち着きません）'
          };
        }
      }
    }
    return { ok: true, gates: t.gates, sequential: t.sequential };
  }

  function q(s) { return '「' + s + '」'; }

  NL.truth = {
    MAX_INPUTS: MAX_INPUTS,
    cycles: cycles, hasFeedback: hasFeedback,
    table: table, gateCount: gateCount, check: check
  };
})(typeof window !== 'undefined' ? window : globalThis);
