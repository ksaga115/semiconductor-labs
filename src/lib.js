/* チップライブラリと、シミュレーション前の展開（フラット化）
 *
 * ユーザーが作ったチップは「その時点の回路まるごとのコピー」として登録する。
 * 参照ではなくコピーなのは、作業台をいじるたびに登録済みチップの中身が
 * 勝手に変わると、何を測っているのか分からなくなるから。
 * 逆に、同じ名前で登録し直すと定義が置き換わり、それを使っている側は全部そちらに従う。
 * （部品は名前で参照しているので、これは意図した挙動。README にも書いてある）
 *
 * 【展開】シミュレータは階層を知らない。回す前にチップを再帰的に潰して、
 * nand と値の源（src）と中継（buf）だけの平らなゲート配列にする。
 *
 *   src  値を自分で持つ（トップの入力スイッチ・定数・クロック）
 *   buf  入力をそのまま出す中継（チップの内側の in / out 部品、全階層の out 部品）
 *   nand 唯一の論理素子
 *
 * チップの境界を buf として残すのがミソ。境界のネットを消して両側を直結する
 * （union-find で同一視する）方が速いが、そうすると「このチップのこの端子には
 * 今なにが来ているか」を画面に出せなくなる。遅延が1段増えるだけなので buf を残す。
 *
 * ゲート i の出力ネットの番号は i と同じ。ネットとゲートを別々に採番すると
 * 対応表を持ち歩くことになるので、最初から一致させておく。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});
  var N = NL.netlist;

  var MAX_GATES = 200000;   /* 展開が爆発したときに固まる前に止める */

  /* ---------------- チップの登録 ---------------- */

  /** 回路まるごとを名前つきのチップ定義にする。作れなければ {error} を返す */
  function makeChip(name, circuit, lib, opt) {
    name = String(name || '').trim();
    if (!name) return { error: 'チップの名前を入れてください' };

    var ins = N.externalInputs(circuit), outs = N.externalOutputs(circuit);
    if (!outs.length) return { error: '出力部品が1つも無いので、チップにしても何も取り出せません' };

    /* 自分自身（または自分を使うチップ）を含んでいたら、展開が無限に続く */
    if (usesChip(circuit, lib, name)) return { error: '「' + name + '」自身を含む回路は、同じ名前のチップにできません' };

    var problems = N.validate(circuit, lib).filter(function (m) { return m.indexOf('繋がっていません') < 0; });
    if (problems.length) return { error: problems[0] };

    return {
      chip: {
        name: name,
        color: (opt && opt.color) || null,
        inputs: ins.map(function (p) { return p.id; }),
        outputs: outs.map(function (p) { return p.id; }),
        inNames: ins.map(function (p) { return p.name; }),
        outNames: outs.map(function (p) { return p.name; }),
        circuit: N.clone(circuit)
      }
    };
  }

  /** circuit（とその中のチップ）が name のチップを使っているか */
  function usesChip(circuit, lib, name, seen) {
    seen = seen || {};
    for (var id in circuit.parts) {
      var p = circuit.parts[id];
      if (p.kind !== 'chip') continue;
      if (p.chip === name) return true;
      if (seen[p.chip]) continue;
      seen[p.chip] = true;
      var def = lib && lib[p.chip];
      if (def && usesChip(def.circuit, lib, name, seen)) return true;
    }
    return false;
  }

  /** チップの深さ。NAND だけでできているチップが 1、それを使うチップが 2…。
   * 「これは NOT から数えて何段の上に建っているか」を見せるための数。
   * 素子の数と違って、こちらは積み上げた回数そのものを表す */
  function depth(name, lib, path) {
    var def = lib && lib[name];
    if (!def) return 0;
    path = path || {};
    if (path[name]) return 0;            /* 循環は makeChip が止めているが、数えるほうでも止めておく */
    path[name] = true;
    var d = 0;
    for (var id in def.circuit.parts) {
      var p = def.circuit.parts[id];
      if (p.kind === 'chip') d = Math.max(d, depth(p.chip, lib, path));
    }
    delete path[name];
    return d + 1;
  }

  /** name を使っているチップの名前を並べる（削除してよいかの判断用） */
  function dependents(lib, name) {
    var out = [];
    for (var k in lib) {
      if (k === name) continue;
      if (usesChip(lib[k].circuit, lib, name)) out.push(k);
    }
    return out.sort(N.natCmp);
  }

  /* ---------------- 展開 ---------------- */

  /**
   * 回路を平らなゲート配列にする。
   * 戻り値 { gates, inputs, inNames, outputs, outNames, clocks, fanout }
   * gates[i] = { kind:'nand'|'src'|'buf', ins:[gate番号 or -1], init, path, part, kindOf }
   */
  function flatten(circuit, lib) {
    var flat = {
      gates: [], inputs: [], inNames: [], outputs: [], outNames: [],
      clocks: [], fanout: null, error: null,
      topOuts: {},     /* トップの部品ID → その出力ポートのゲート番号（画面の配線に色を付けるのに使う） */
      byPath: {}       /* "3/12" のような経路 → ゲート番号（チップの中を覗くときに使う） */
    };
    try {
      var slot = expand(circuit, lib || {}, '', true, [], flat);
      for (var pid in slot) flat.topOuts[pid] = slot[pid].outs;
      var tops = N.externalInputs(circuit), i;
      for (i = 0; i < tops.length; i++) {
        flat.inputs.push(slot[tops[i].id].outs[0]);
        flat.inNames.push(tops[i].name);
      }
      var touts = N.externalOutputs(circuit);
      for (i = 0; i < touts.length; i++) {
        flat.outputs.push(slot[touts[i].id].outs[0]);
        flat.outNames.push(touts[i].name);
      }
    } catch (e) {
      flat.error = e && e.message ? e.message : String(e);
    }
    flat.fanout = buildFanout(flat.gates);
    return flat;
  }

  function gate(flat, kind, nIn, path, part) {
    if (flat.gates.length >= MAX_GATES) throw new Error('回路が大きすぎます（' + MAX_GATES + '素子を超えました）');
    var ins = [];
    for (var i = 0; i < nIn; i++) ins.push(-1);
    var g = { kind: kind, ins: ins, init: -1, path: path, part: part };
    flat.gates.push(g);
    flat.byPath[path] = flat.gates.length - 1;
    return flat.gates.length - 1;
  }

  /* prefix は "3/12/" のような部品IDの連なり。画面で「どのチップの中の誰か」を辿るのに使う */
  function expand(circuit, lib, prefix, isTop, stack, flat) {
    var slot = {}, id, p, gi;

    for (id in circuit.parts) {
      p = circuit.parts[id];
      var path = prefix + p.id;

      if (p.kind === 'nand') {
        gi = gate(flat, 'nand', 2, path, p);
        slot[p.id] = { outs: [gi], inTargets: [[gi, 0], [gi, 1]] };

      } else if (p.kind === 'in') {
        /* トップの入力はスイッチ（値を自分で持つ）。チップの内側の入力は外から来る線の中継 */
        gi = gate(flat, isTop ? 'src' : 'buf', isTop ? 0 : 1, path, p);
        if (isTop) flat.gates[gi].init = (p.value ? 1 : 0);
        slot[p.id] = { outs: [gi], inTargets: isTop ? [] : [[gi, 0]] };

      } else if (p.kind === 'out') {
        gi = gate(flat, 'buf', 1, path, p);
        slot[p.id] = { outs: [gi], inTargets: [[gi, 0]] };

      } else if (p.kind === 'const') {
        gi = gate(flat, 'src', 0, path, p);
        flat.gates[gi].init = (p.value ? 1 : 0);
        slot[p.id] = { outs: [gi], inTargets: [] };

      } else if (p.kind === 'clock') {
        gi = gate(flat, 'src', 0, path, p);
        flat.gates[gi].init = (p.value ? 1 : 0);
        flat.clocks.push(gi);
        slot[p.id] = { outs: [gi], inTargets: [] };

      } else if (p.kind === 'chip') {
        var def = lib[p.chip];
        if (!def) throw new Error('チップ 「' + p.chip + '」 が見つかりません');
        if (stack.indexOf(p.chip) >= 0) {
          throw new Error('チップ 「' + p.chip + '」 が自分自身を含んでいます（' + stack.concat(p.chip).join(' → ') + '）');
        }
        var sub = expand(def.circuit, lib, path + '/', false, stack.concat(p.chip), flat);
        slot[p.id] = {
          outs: def.outputs.map(function (pid) { return sub[pid] ? sub[pid].outs[0] : -1; }),
          inTargets: def.inputs.map(function (pid) { return sub[pid] ? [sub[pid].outs[0], 0] : null; })
        };

      } else {
        throw new Error('知らない部品です: ' + p.kind);
      }
    }

    /* この階層の配線を繋ぐ。端子数が変わったチップに繋ぎっぱなしの線は黙って捨てる
     * （未接続＝X として扱われる。指摘は netlist.validate が出す） */
    for (var w in circuit.wires) {
      var wire = circuit.wires[w];
      var a = slot[wire.from.part], b = slot[wire.to.part];
      if (!a || !b) continue;
      var src = a.outs[wire.from.port], tgt = b.inTargets[wire.to.port];
      if (src == null || src < 0 || !tgt) continue;
      flat.gates[tgt[0]].ins[tgt[1]] = src;
    }
    return slot;
  }

  function buildFanout(gates) {
    var fan = new Array(gates.length), i, k;
    for (i = 0; i < gates.length; i++) fan[i] = [];
    for (i = 0; i < gates.length; i++) {
      for (k = 0; k < gates[i].ins.length; k++) {
        var s = gates[i].ins[k];
        if (s >= 0) fan[s].push(i);
      }
    }
    return fan;
  }

  NL.lib = {
    MAX_GATES: MAX_GATES,
    makeChip: makeChip, usesChip: usesChip, dependents: dependents, depth: depth,
    flatten: flatten
  };
})(typeof window !== 'undefined' ? window : globalThis);
