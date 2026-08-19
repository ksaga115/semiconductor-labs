/* 課題 ― NAND だけの世界から順に積み上げるための道順
 *
 * 採点は2通り。
 *
 *   comb  組み合わせ回路。真理値表を総当りで取って期待表と突き合わせる。
 *   seq   順序回路。入力を順に与えて、そのつど出力が期待どおりかを見る。
 *         こちらは途中で reset しない。前の状態を保っていること自体が確認したい性質だから。
 *
 * 課題の入出力は「名前」で照合する。並べた順ではない。回路の中で部品を動かしても
 * 採点結果が変わらないようにするため。
 *
 * goal は「お手本の解答が使った NAND の数」。少なければ偉いという話ではなく目安。
 * tests/quest.js のお手本回路から実測した数を入れてある。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});

  /* ---- 表を作るための小道具 ---- */

  /** n 入力の全パターンに f を適用して表を作る。f は 0/1 の配列を受けて 0/1 の配列を返す */
  function build(n, f) {
    var rows = [];
    for (var m = 0; m < (1 << n); m++) {
      var bits = [];
      for (var i = 0; i < n; i++) bits.push((m >> (n - 1 - i)) & 1);
      rows.push(bits.concat(f(bits)));
    }
    return rows;
  }

  function bitsToNum(b) { return b.reduce(function (a, x) { return a * 2 + x; }, 0); }

  /** 数を n ビットの配列にする。添字 0 が最下位（S0, S1… の並びに合わせる） */
  function numToBits(v, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push((v >> i) & 1);
    return out;
  }

  function names(prefix, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(prefix + i);
    return out;
  }

  var QUESTS = [
    {
      id: 'not', name: 'NOT', goal: 1,
      desc: '入力をひっくり返す。NAND の2つの入力に同じものを繋ぐとどうなるか。',
      hint: 'NAND(A, A) を書き下してみる。A=0 なら 1、A=1 なら 0。それが NOT。',
      kind: 'comb', inputs: ['A'], outputs: ['Y'],
      rows: build(1, function (b) { return [b[0] ? 0 : 1]; })
    },
    {
      id: 'and', name: 'AND', goal: 2,
      desc: '両方 1 のときだけ 1。',
      hint: 'NAND は「AND の否定」。否定をもう一度かければ AND に戻る。作った NOT チップを使ってよい。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['Y'],
      rows: build(2, function (b) { return [b[0] & b[1]]; })
    },
    {
      id: 'or', name: 'OR', goal: 3,
      desc: 'どちらかが 1 なら 1。',
      hint: 'ド・モルガン。A + B = NOT(NOT A かつ NOT B)。両方の入力を先に反転して NAND に入れる。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['Y'],
      rows: build(2, function (b) { return [b[0] | b[1]]; })
    },
    {
      id: 'xor', name: 'XOR', goal: 4,
      desc: '違うときだけ 1。',
      hint: 'NAND 4個で組める。t = NAND(A,B) を作り、NAND(A,t) と NAND(B,t) をもう一度 NAND にかける。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['Y'],
      rows: build(2, function (b) { return [b[0] ^ b[1]]; })
    },
    {
      id: 'mux', name: '2:1 セレクタ', goal: 4,
      desc: 'S が 0 なら A を、1 なら B を出す。「どちらかを選ぶ」を回路にしたもの。',
      hint: 'Y =（A かつ S でない）または（B かつ S）。NAND だけなら NAND(NAND(A, NOT S), NAND(B, S)) にまとまる。',
      kind: 'comb', inputs: ['A', 'B', 'S'], outputs: ['Y'],
      rows: build(3, function (b) { return [b[2] ? b[1] : b[0]]; })
    },
    {
      id: 'half', name: '半加算器', goal: 5,
      desc: '1桁の足し算。S は和（XOR）、Y は桁上げ（AND）。',
      hint: '中身は XOR と AND を並べただけ。XOR の途中で作る NAND(A,B) は桁上げにも使い回せる。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['S', 'Y'],
      rows: build(2, function (b) {
        var s = b[0] + b[1];
        return [s & 1, s >> 1];
      })
    },
    {
      id: 'full', name: '全加算器', goal: 13,
      desc: '下の桁からの繰り上がり C も足す。S は和、Y は上の桁への繰り上がり。',
      hint: '半加算器を2つ縦に繋ぎ、2つの桁上げを OR でまとめる。ここまで来たら半加算器チップを使うのが早い。',
      kind: 'comb', inputs: ['A', 'B', 'C'], outputs: ['S', 'Y'],
      rows: build(3, function (b) {
        var s = b[0] + b[1] + b[2];
        return [s & 1, s >> 1];
      })
    },
    {
      id: 'dec24', name: '2→4 デコーダ', goal: 10,
      desc: '2ビットの数（A が上位、B が下位）を受けて、その番号の出力だけを 1 にする。',
      hint: 'Y0 は A も B も 0 のとき。4通りそれぞれに「その組み合わせのときだけ 1 になる AND」を作る。',
      kind: 'comb', inputs: ['A', 'B'], outputs: names('Y', 4),
      rows: build(2, function (b) {
        var k = b[0] * 2 + b[1], out = [0, 0, 0, 0];
        out[k] = 1;
        return out;
      })
    },
    {
      id: 'add4', name: '4ビット加算器', goal: 52,
      desc: '4桁どうしの足し算。A3A2A1A0 + B3B2B1B0 を計算して S3S2S1S0 と桁上げ Y を出す。添字 0 が最下位の桁。',
      hint: '全加算器チップを4つ並べ、桁上げを数珠つなぎにするだけ。一番下の桁の C には定数 0 を繋ぐ。',
      kind: 'comb', inputs: names('A', 4).concat(names('B', 4)), outputs: names('S', 4).concat(['Y']),
      rows: build(8, function (b) {
        /* inputs の並びは A0,A1,A2,A3,B0,B1,B2,B3。添字 0 が最下位なので逆順にして数にする */
        var a = bitsToNum(b.slice(0, 4).reverse());
        var c = bitsToNum(b.slice(4, 8).reverse());
        var s = a + c;
        return numToBits(s & 15, 4).concat([s >> 4]);
      })
    },
    {
      id: 'mul2', name: '2ビット乗算器', goal: 18,
      desc: '2桁どうしの掛け算。A1A0 × B1B0 を計算して4桁の P3P2P1P0 を出す。添字 0 が最下位。',
      hint: '筆算のとおり。部分積 Ai・Bj を AND で作り、桁ごとに足す。足し算には半加算器チップが使える。',
      kind: 'comb', inputs: names('A', 2).concat(names('B', 2)), outputs: names('P', 4),
      rows: build(4, function (b) {
        var a = b[1] * 2 + b[0], c = b[3] * 2 + b[2];
        return numToBits(a * c, 4);
      })
    },
    {
      id: 'srlatch', name: 'SR ラッチ', goal: 2,
      desc: 'ここから記憶。NAND 2個を互い違いに繋ぐと、入力を戻しても直前の値を覚えている。'
          + 'S・R はどちらも「0 で効く」（負論理）。S=0 で Q が 1 に、R=0 で Q が 0 になり、'
          + 'S=R=1 のあいだは前の値を保つ。',
      hint: 'NAND を2つ置き、片方の出力をもう片方の入力へ、逆も同じように繋ぐ。'
          + '空いた入力が S と R。出力 Q は S 側の NAND の出力から取る。',
      kind: 'seq', inputs: ['R', 'S'], outputs: ['Q'],
      steps: [
        { in: { S: 1, R: 1 }, want: { Q: null }, note: '電源投入直後。まだ何も決まっていない（X でよい）' },
        { in: { S: 0, R: 1 }, want: { Q: 1 }, note: 'S を効かせる → Q が 1' },
        { in: { S: 1, R: 1 }, want: { Q: 1 }, note: '両方戻しても 1 のまま。これが記憶' },
        { in: { S: 1, R: 0 }, want: { Q: 0 }, note: 'R を効かせる → Q が 0' },
        { in: { S: 1, R: 1 }, want: { Q: 0 }, note: '戻しても 0 のまま' },
        { in: { S: 0, R: 1 }, want: { Q: 1 }, note: 'もう一度 S' },
        { in: { S: 1, R: 1 }, want: { Q: 1 }, note: '保持' }
      ]
    },
    {
      id: 'dlatch', name: 'D ラッチ', goal: 5,
      desc: 'SR ラッチは「セットと解除」という不便な入れ物だった。E が 1 のあいだは D の値をそのまま通し、'
          + 'E を 0 にした瞬間の値を保つ。これで「1ビット覚える箱」になる。',
      hint: 'SR ラッチの手前に門を付ける。S = NAND(D, E)、R = NAND(NOT D, E)。'
          + 'E が 0 なら S も R も 1 になり、ラッチは自動的に保持へ入る。',
      kind: 'seq', inputs: ['D', 'E'], outputs: ['Q'],
      steps: [
        { in: { D: 1, E: 1 }, want: { Q: 1 }, note: '門を開けて 1 を通す' },
        { in: { D: 1, E: 0 }, want: { Q: 1 }, note: '門を閉じる' },
        { in: { D: 0, E: 0 }, want: { Q: 1 }, note: 'D を変えても効かない。覚えている' },
        { in: { D: 0, E: 1 }, want: { Q: 0 }, note: '門を開けると 0 が通る' },
        { in: { D: 0, E: 0 }, want: { Q: 0 }, note: '閉じる' },
        { in: { D: 1, E: 0 }, want: { Q: 0 }, note: 'やはり効かない' },
        { in: { D: 1, E: 1 }, want: { Q: 1 }, note: '開ければ通る' }
      ]
    }
  ];

  var BY_ID = {};
  QUESTS.forEach(function (q) { BY_ID[q.id] = q; });

  /**
   * 採点する。戻り値 { ok, error, bad, gates, goal }
   * bad は最初に食い違った場所（組み合わせなら行、順序なら手順）
   */
  function grade(quest, circuit, lib) {
    if (quest.kind === 'seq') return gradeSeq(quest, circuit, lib);
    var r = NL.truth.check(circuit, lib, quest);
    if (!r.ok) return r;
    return { ok: true, gates: NL.truth.gateCount(circuit, lib).nand, goal: quest.goal };
  }

  function gradeSeq(quest, circuit, lib) {
    var flat = NL.lib.flatten(circuit, lib);
    if (flat.error) return { ok: false, error: flat.error };

    var miss = quest.inputs.filter(function (n) { return flat.inNames.indexOf(n) < 0; })
      .concat(quest.outputs.filter(function (n) { return flat.outNames.indexOf(n) < 0; }));
    if (miss.length) {
      return { ok: false, error: '端子 ' + miss.map(function (s) { return '「' + s + '」'; }).join('・') + ' がありません' };
    }

    /* reset のあとに settle しない。落ち着かせてしまうと、スイッチが置かれている
     * 値（課題とは無関係な位置）で一度回路が動いてしまい、そこが禁止入力だと
     * 手順1で発振する。最初の入力を与えてから初めて時間を進める。 */
    var sim = new NL.sim.Sim(flat);
    sim.reset();

    for (var i = 0; i < quest.steps.length; i++) {
      var st = quest.steps[i];
      sim.setInputs(st.in);
      var res = sim.settle();
      if (!res.settled) {
        return { ok: false, step: i, note: st.note, error: '手順 ' + (i + 1) + ' で発振しました（値が落ち着きません）' };
      }
      for (var k in st.want) {
        if (st.want[k] === null || st.want[k] === undefined) continue;
        var got = sim.read(k);
        if (got !== st.want[k]) {
          return { ok: false, step: i, note: st.note, bad: { in: st.in, want: st.want[k], got: got, name: k } };
        }
      }
    }
    return { ok: true, gates: NL.truth.gateCount(circuit, lib).nand, goal: quest.goal };
  }

  NL.quest = { QUESTS: QUESTS, BY_ID: BY_ID, grade: grade, build: build, numToBits: numToBits };
})(typeof window !== 'undefined' ? window : globalThis);
