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

  /* 章。道のりの節目。tree で段に分けて見せる */
  var STAGES = [
    { n: 1, name: '論理をつくる',   note: 'NAND だけから、基本の論理を全部組み立てる' },
    { n: 2, name: '選ぶ・見分ける', note: '信号を選ぶ。同じかどうかを見る' },
    { n: 3, name: '計算する',       note: '足す・引く・かける' },
    { n: 4, name: '記憶する',       note: '値を覚える。ここから時間が関わる' },
    { n: 5, name: '組み上げる',     note: '計算機の部品そのもの。この先はもう CPU' }
  ];

  var QUESTS = [
    {
      id: 'not', name: 'NOT', goal: 1, stage: 1, needs: [],
      desc: '入力をひっくり返す。NAND の2つの入力に同じものを繋ぐとどうなるか。',
      why: '信号をひっくり返せる。「〜でない」が言えると、条件を裏返して調べられる。この先ほぼ全部の回路で使う。',
      hint: 'NAND(A, A) を書き下してみる。A=0 なら 1、A=1 なら 0。それが NOT。',
      kind: 'comb', inputs: ['A'], outputs: ['Y'],
      rows: build(1, function (b) { return [b[0] ? 0 : 1]; })
    },
    {
      id: 'and', name: 'AND', goal: 2, stage: 1, needs: ['not'],
      desc: '両方 1 のときだけ 1。',
      why: '「両方そろったら」が作れる。鍵と暗証番号の両方が合ったら開く ― 条件を重ねるのはこれ。',
      hint: 'NAND は「AND の否定」。否定をもう一度かければ AND に戻る。作った NOT チップを使ってよい。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['Y'],
      rows: build(2, function (b) { return [b[0] & b[1]]; })
    },
    {
      id: 'or', name: 'OR', goal: 3, stage: 1, needs: ['not'],
      desc: 'どちらかが 1 なら 1。',
      why: '「どちらかが来たら」が作れる。非常ボタンが何個あっても、どれか押されたら鳴る。',
      hint: 'ド・モルガン。A + B = NOT(NOT A かつ NOT B)。両方の入力を先に反転して NAND に入れる。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['Y'],
      rows: build(2, function (b) { return [b[0] | b[1]]; })
    },
    {
      id: 'xor', name: 'XOR', goal: 4, stage: 1, needs: ['and', 'or'],
      desc: '違うときだけ 1。',
      why: '「違っていたら」が作れる。これは1桁の足し算の答えそのもの（1+1 は 0 で桁上がり）。通信の誤り検出（パリティ）もこれ。',
      hint: 'NAND 4個で組める。t = NAND(A,B) を作り、NAND(A,t) と NAND(B,t) をもう一度 NAND にかける。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['Y'],
      rows: build(2, function (b) { return [b[0] ^ b[1]]; })
    },
    {
      id: 'mux', name: '2:1 セレクタ', goal: 4, stage: 2, needs: ['and', 'or'],
      desc: 'S が 0 なら A を、1 なら B を出す。「どちらかを選ぶ」を回路にしたもの。',
      why: '信号の交通整理。「どちらの値を使うか」を1本の線で切り替えられる。CPU が「計算した結果」と「読んできた値」を選ぶのはこれ。',
      hint: 'Y =（A かつ S でない）または（B かつ S）。NAND だけなら NAND(NAND(A, NOT S), NAND(B, S)) にまとまる。',
      kind: 'comb', inputs: ['A', 'B', 'S'], outputs: ['Y'],
      rows: build(3, function (b) { return [b[2] ? b[1] : b[0]]; })
    },
    {
      id: 'half', name: '半加算器', goal: 5, stage: 3, needs: ['xor', 'and'],
      desc: '1桁の足し算。S は和（XOR）、Y は桁上げ（AND）。',
      why: '1桁の足し算ができた。ここから電卓までは、同じものを並べていくだけ。',
      hint: '中身は XOR と AND を並べただけ。XOR の途中で作る NAND(A,B) は桁上げにも使い回せる。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['S', 'Y'],
      rows: build(2, function (b) {
        var s = b[0] + b[1];
        return [s & 1, s >> 1];
      })
    },
    {
      id: 'full', name: '全加算器', goal: 13, stage: 3, needs: ['half', 'or'],
      desc: '下の桁からの繰り上がり C も足す。S は和、Y は上の桁への繰り上がり。',
      why: '桁上がりを受け取れる。これを並べれば何桁でも足せる。実物の加算器もこの形。',
      hint: '半加算器を2つ縦に繋ぎ、2つの桁上げを OR でまとめる。ここまで来たら半加算器チップを使うのが早い。',
      kind: 'comb', inputs: ['A', 'B', 'C'], outputs: ['S', 'Y'],
      rows: build(3, function (b) {
        var s = b[0] + b[1] + b[2];
        return [s & 1, s >> 1];
      })
    },
    {
      id: 'dec24', name: '2→4 デコーダ', goal: 10, stage: 2, needs: ['and', 'not'],
      desc: '2ビットの数（A が上位、B が下位）を受けて、その番号の出力だけを 1 にする。',
      why: '番号を「その1本だけ 1」に変える。命令の番号から「この装置を動かせ」を作る、CPU の命令デコーダの原型。',
      hint: 'Y0 は A も B も 0 のとき。4通りそれぞれに「その組み合わせのときだけ 1 になる AND」を作る。',
      kind: 'comb', inputs: ['A', 'B'], outputs: names('Y', 4),
      rows: build(2, function (b) {
        var k = b[0] * 2 + b[1], out = [0, 0, 0, 0];
        out[k] = 1;
        return out;
      })
    },
    {
      id: 'add4', name: '4ビット加算器', goal: 52, stage: 3, needs: ['full'],
      desc: '4桁どうしの足し算。A3A2A1A0 + B3B2B1B0 を計算して S3S2S1S0 と桁上げ Y を出す。添字 0 が最下位の桁。',
      why: '本当に足し算ができる。7 + 5 が 12 になるところを、自分で組んだ回路で見られる。',
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
      id: 'mul2', name: '2ビット乗算器', goal: 18, stage: 3, needs: ['half', 'and'],
      desc: '2桁どうしの掛け算。A1A0 × B1B0 を計算して4桁の P3P2P1P0 を出す。添字 0 が最下位。',
      why: '掛け算ができる。筆算とまったく同じことを回路がやっている。',
      hint: '筆算のとおり。部分積 Ai・Bj を AND で作り、桁ごとに足す。足し算には半加算器チップが使える。',
      kind: 'comb', inputs: names('A', 2).concat(names('B', 2)), outputs: names('P', 4),
      rows: build(4, function (b) {
        var a = b[1] * 2 + b[0], c = b[3] * 2 + b[2];
        return numToBits(a * c, 4);
      })
    },
    {
      id: 'srlatch', name: 'SR ラッチ', goal: 2, stage: 4, needs: [],
      desc: 'ここから記憶。NAND 2個を互い違いに繋ぐと、入力を戻しても直前の値を覚えている。'
          + 'S・R はどちらも「0 で効く」（負論理）。S=0 で Q が 1 に、R=0 で Q が 0 になり、'
          + 'S=R=1 のあいだは前の値を保つ。',
      why: '電源が入っているあいだ、値を覚えていられる。ここで初めて回路に「時間」が入った。記憶装置の最小単位。',
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
      id: 'dlatch', name: 'D ラッチ', goal: 5, stage: 4, needs: ['srlatch', 'not'],
      desc: 'SR ラッチは「セットと解除」という不便な入れ物だった。E が 1 のあいだは D の値をそのまま通し、'
          + 'E を 0 にした瞬間の値を保つ。これで「1ビット覚える箱」になる。',
      why: '1ビットの記憶箱になった。これを並べればメモリになる。',
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
    },
    {
      id: 'nor', name: 'NOR', goal: 4, stage: 1, needs: ['or'],
      desc: 'どちらも 0 のときだけ 1。NAND と並ぶもう1つの万能ゲートで、'
          + '実は NOR だけからでも全部の論理が作れる（このアプリが NAND から始めたのと同じ理由）。',
      why: 'NAND と同じで、これ1つからでも全部が作れる。アポロ誘導計算機は NOR だけで組まれていた。',
      hint: 'OR を作ってひっくり返すだけ。OR チップと NOT チップを並べる。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['Y'],
      rows: build(2, function (b) { return [(b[0] | b[1]) ? 0 : 1]; })
    },
    {
      id: 'xnor', name: '一致（XNOR）', goal: 5, stage: 1, needs: ['xor'],
      desc: '2つが同じときだけ 1。「等しいか」を見る回路の1桁ぶんで、比較器の材料になる。',
      why: '「同じかどうか」が分かる。比較器の1桁ぶん。数どうしを見比べる回路の材料になる。',
      hint: 'XOR は「違うときだけ 1」だった。ひっくり返せばよい。',
      kind: 'comb', inputs: ['A', 'B'], outputs: ['Y'],
      rows: build(2, function (b) { return [b[0] === b[1] ? 1 : 0]; })
    },
    {
      id: 'mux4', name: '4:1 セレクタ', goal: 12, stage: 2, needs: ['mux'],
      desc: 'S1S0 が指す番号の入力を出す。4つの中から1つを選ぶ。'
          + 'この先 ALU で「どの演算の答えを出すか」を選ぶのに、同じ形が要る。',
      why: '4つから1つ選べる。ALU が4種類の計算結果から1つを出すのはこれ。',
      hint: '2:1 セレクタを3つ。まず S0 で (D0,D1) と (D2,D3) をそれぞれ選び、'
          + 'その2つの結果を S1 で選ぶ。木の形になる。',
      kind: 'comb', inputs: names('D', 4).concat(['S0', 'S1']), outputs: ['Y'],
      rows: build(6, function (b) { return [b[b[5] * 2 + b[4]]]; })
    },
    {
      id: 'eq4', name: '4ビット比較器', goal: 26, stage: 2, needs: ['xnor', 'and'],
      desc: '2つの4ビットの数が等しいときだけ 1。添字 0 が最下位。',
      why: '2つの数が等しいか分かる。「この番地を指定されたときだけ反応する」＝メモリの番地選択や、プログラムの if の比較。',
      hint: '桁ごとに一致（XNOR）を取り、4つ全部が 1 かどうかを AND でまとめる。'
          + 'AND は2入力なので、3つ使って木にする。',
      kind: 'comb', inputs: names('A', 4).concat(names('B', 4)), outputs: ['Y'],
      rows: build(8, function (b) {
        for (var i = 0; i < 4; i++) if (b[i] !== b[i + 4]) return [0];
        return [1];
      })
    },
    {
      id: 'sub4', name: '4ビット減算器', goal: 56, stage: 3, needs: ['add4', 'not'],
      desc: '引き算。A から B を引いて D3D2D1D0 を出す。C は「借りが出なかった」印で、A ≥ B なら 1。',
      why: '引き算ができる。しかも足し算と同じ回路で。負の数を2の補数で表すと引き算が足し算になる ― コンピュータが引き算専用の回路を持たない理由。',
      hint: '2の補数。B を全部ひっくり返して足し、一番下の桁の繰り上がりに 1 を入れる。'
          + 'それだけで足し算の回路が引き算になる。上へ出た繰り上がりがそのまま C。'
          + '（4ビット加算器チップは一番下の繰り上がりが 0 に固定してあるので、全加算器を4つ並べ直す）',
      kind: 'comb', inputs: names('A', 4).concat(names('B', 4)), outputs: names('D', 4).concat(['C']),
      rows: build(8, function (b) {
        var a = bitsToNum(b.slice(0, 4).reverse());
        var c = bitsToNum(b.slice(4, 8).reverse());
        var v = a - c;
        return numToBits(v & 15, 4).concat([v >= 0 ? 1 : 0]);
      })
    },
    {
      id: 'dff', name: 'D フリップフロップ', goal: 11, stage: 4, needs: ['dlatch', 'not'],
      desc: 'D ラッチは E が 1 のあいだ中身が動き続ける（素通し）。これだと出力を自分の入力へ'
          + '戻したとき、値が輪を何周も駆け抜けてしまう。C が 0→1 に変わった「瞬間」だけ'
          + '取り込むようにする。ここから先の部品は全部これでできている。',
      why: 'クロックに合わせて「せーの」で取り込める。全部の部品が同じ拍で動くから、大きな回路でも破綻せず組める。CPU の「◯ GHz」はこの拍の速さのこと。',
      hint: 'D ラッチを2段（主従）。前段の E には NOT C を、後段の E には C をそのまま入れる。'
          + '前段は C が 0 のとき開き、後段は 1 のとき開くので、両方が同時に開くことがない。'
          + '値は1回の上げ下げで1段しか進めない。',
      kind: 'seq', inputs: ['D', 'C'], outputs: ['Q'],
      steps: [
        { in: { D: 0, C: 0 }, want: { Q: null }, note: '電源投入直後。C が 0 のあいだに前段が D を取り込む' },
        { in: { D: 0, C: 1 }, want: { Q: 0 }, note: '立ち上がり。取り込んだ 0 が後段へ渡って出てくる' },
        { in: { D: 1, C: 1 }, want: { Q: 0 }, note: 'C が 1 のあいだは D を変えても動かない。D ラッチとの決定的な違い' },
        { in: { D: 1, C: 0 }, want: { Q: 0 }, note: 'C を下げても出力はそのまま。前段が 1 を取り込む' },
        { in: { D: 1, C: 1 }, want: { Q: 1 }, note: '次の立ち上がりで、はじめて 1 が出る' },
        { in: { D: 0, C: 1 }, want: { Q: 1 }, note: 'また動かない' },
        { in: { D: 0, C: 0 }, want: { Q: 1 }, note: '下げる' },
        { in: { D: 0, C: 1 }, want: { Q: 0 }, note: '立ち上がりで 0 に' }
      ]
    },
    {
      id: 'reg4', name: '4ビットレジスタ', goal: 60, stage: 5, needs: ['dff', 'mux'],
      desc: '4ビットを覚える箱。W が 1 のときだけ、C の立ち上がりで D3D2D1D0 を取り込む。'
          + 'W が 0 なら、クロックが何度来ても中身は変わらない。CPU のレジスタそのもの。',
      why: '4ビットを保管できる。CPU のレジスタそのもの。プログラムでいう変数を1つ持てるようになった。',
      hint: 'D フリップフロップを4つ。それぞれの D の手前に 2:1 セレクタを置き、'
          + 'W が 0 なら自分の Q を、1 なら外から来た D を選ばせる。'
          + '「覚え続ける」は「自分自身を書き戻し続ける」こと。',
      kind: 'seq', inputs: names('D', 4).concat(['C', 'W']), outputs: names('Q', 4),
      steps: [
        { in: { D0: 1, D1: 0, D2: 1, D3: 0, W: 1, C: 0 }, want: {}, note: '書き込みを許可し、クロックは下げておく' },
        { in: { D0: 1, D1: 0, D2: 1, D3: 0, W: 1, C: 1 }, want: { Q0: 1, Q1: 0, Q2: 1, Q3: 0 }, note: '立ち上がりで取り込む（Q3Q2Q1Q0 = 0101）' },
        { in: { D0: 0, D1: 1, D2: 0, D3: 1, W: 0, C: 0 }, want: { Q0: 1, Q1: 0, Q2: 1, Q3: 0 }, note: '許可を下げ、入力を裏返す' },
        { in: { D0: 0, D1: 1, D2: 0, D3: 1, W: 0, C: 1 }, want: { Q0: 1, Q1: 0, Q2: 1, Q3: 0 }, note: '許可が無ければ、クロックが来ても中身は変わらない' },
        { in: { D0: 0, D1: 1, D2: 0, D3: 1, W: 1, C: 0 }, want: { Q0: 1, Q1: 0, Q2: 1, Q3: 0 }, note: '許可を上げる。まだ立ち上がっていない' },
        { in: { D0: 0, D1: 1, D2: 0, D3: 1, W: 1, C: 1 }, want: { Q0: 0, Q1: 1, Q2: 0, Q3: 1 }, note: '今度は入る（1010）' },
        { in: { D0: 1, D1: 1, D2: 1, D3: 1, W: 0, C: 0 }, want: { Q0: 0, Q1: 1, Q2: 0, Q3: 1 }, note: '保持' },
        { in: { D0: 1, D1: 1, D2: 1, D3: 1, W: 0, C: 1 }, want: { Q0: 0, Q1: 1, Q2: 0, Q3: 1 }, note: '保持したまま' }
      ]
    },
    {
      id: 'shift4', name: '4ビットシフトレジスタ', goal: 44, stage: 5, needs: ['dff'],
      desc: 'クロックが来るたびに、中身が1つ隣へずれる。D から入れた 0/1 の列が'
          + 'Q0 → Q1 → Q2 → Q3 と行進していく。掛け算や割り算、直列の通信はこれで作る。',
      why: '値をずらせる。2倍と半分（シフト）、直列の通信、掛け算の筆算は、みなこれで作る。',
      hint: 'D フリップフロップを4つ数珠つなぎ。前の Q を次の D へ、クロックは全部に配る。'
          + 'D ラッチで組むと、C が 1 のあいだに値が最後まで突き抜けて全部同じになる。'
          + 'エッジトリガが要るのはこのため。',
      kind: 'seq', inputs: ['D', 'C'], outputs: names('Q', 4),
      steps: [
        { in: { D: 1, C: 0 }, want: {}, note: '1 を入れて、クロックは下げたまま' },
        { in: { D: 1, C: 1 }, want: { Q0: 1 }, note: '立ち上がりで Q0 に 1 が入る。奥はまだ未定（X）' },
        { in: { D: 0, C: 0 }, want: { Q0: 1 }, note: '次は 0 を用意' },
        { in: { D: 0, C: 1 }, want: { Q0: 0, Q1: 1 }, note: '1 が Q1 へ進み、新しい 0 が Q0 に入る' },
        { in: { D: 1, C: 0 }, want: { Q0: 0, Q1: 1 }, note: '次は 1' },
        { in: { D: 1, C: 1 }, want: { Q0: 1, Q1: 0, Q2: 1 }, note: '行進' },
        { in: { D: 0, C: 0 }, want: { Q0: 1, Q1: 0, Q2: 1 }, note: '最後は 0' },
        { in: { D: 0, C: 1 }, want: { Q0: 0, Q1: 1, Q2: 0, Q3: 1 }, note: '最初に入れた 1 が Q3 まで届いた。入れた順に並んでいる' }
      ]
    },
    {
      id: 'count4', name: '4ビットカウンタ', goal: 70, stage: 5, needs: ['dff', 'xor', 'and'],
      desc: 'クロックが来るたびに1つ増える。0,1,2,…,15 と数えて 0 に戻る。R を 1 にすると 0 に戻す。'
          + 'クロック部品を繋いで「動かす」と、自分で作った回路が勝手に数えはじめる。',
      why: '勝手に数える。時計、プログラムカウンタ（次に実行する命令の番地）、周波数の分周 ― 数えるものは全部これ。',
      hint: '「自分より下の桁が全部 1 なら、その桁は反転する」。'
          + 'Q0 は毎回反転（NOT）、Q1 は Q0 と XOR、Q2 は Q0·Q1 と XOR、Q3 は Q0·Q1·Q2 と XOR。'
          + 'その結果を D フリップフロップへ戻す。R は取り込む値を 0 に潰す AND で作る。'
          + '（R が無いと、電源投入直後の X から一生抜け出せない）',
      kind: 'seq', inputs: ['C', 'R'], outputs: names('Q', 4),
      steps: (function () {
        function bits4(v) { var o = {}; for (var i = 0; i < 4; i++) o['Q' + i] = (v >> i) & 1; return o; }
        var st = [
          { in: { C: 0, R: 1 }, want: {}, note: 'R を上げる。中身はまだ未定（X）' },
          { in: { C: 1, R: 1 }, want: bits4(0), note: '最初の立ち上がりで 0 に揃う。ここで X から抜け出す' }
        ];
        for (var v = 1; v <= 16; v++) {
          st.push({ in: { C: 0, R: 0 }, want: bits4(v - 1), note: 'クロックを下げる（値は動かない）' });
          st.push({ in: { C: 1, R: 0 }, want: bits4(v & 15),
            note: v === 16 ? '15 の次は 0 に戻る（4桁で数えられるのはここまで）' : (v - 1) + ' の次は ' + v });
        }
        return st;
      })()
    },
    {
      id: 'alu4', name: '4ビット ALU', goal: 124, stage: 5, needs: ['add4', 'mux', 'xor'],
      desc: '計算機の心臓。S1S0 で演算を切り替える。00 足す / 01 引く / 10 かつ（AND）/ 11 排他的論理和（XOR）。'
          + 'ここまで来たら、あとはレジスタと繋ぎ、「何をするか」を順に指示する仕掛けを足せば CPU。',
      why: '計算機の心臓。足す・引く・論理演算を、1つの回路で切り替えられる。あとは「次に何をするか」を順に指示する仕掛けを足せば CPU。',
      hint: 'B の各桁を XOR(Bi, S0) に通すと、S0 が 1 のときだけ B が反転する。'
          + '一番下の繰り上がりにも S0 を入れれば、同じ加算器が引き算になる（2の補数）。'
          + 'AND と XOR は別に作っておき、最後に 4:1 セレクタ（か 2:1 を2段）で選ぶ。'
          + '桁ごとに同じものを4つ並べるだけなので、1桁ぶんをチップにしてから4つ置くのが早い。',
      kind: 'comb',
      inputs: names('A', 4).concat(names('B', 4)).concat(['S0', 'S1']), outputs: names('Y', 4),
      rows: build(10, function (b) {
        var a = bitsToNum(b.slice(0, 4).reverse());
        var c = bitsToNum(b.slice(4, 8).reverse());
        var k = b[9] * 2 + b[8];
        var v = k === 0 ? a + c : k === 1 ? a - c : k === 2 ? (a & c) : (a ^ c);
        return numToBits(v & 15, 4);
      })
    }
  ];

  var BY_ID = {};
  QUESTS.forEach(function (q) { BY_ID[q.id] = q; });

  /**
   * 採点する。戻り値 { ok, error, bad, gates, goal }
   * bad は最初に食い違った場所（組み合わせなら行、順序なら手順）
   */
  function grade(quest, circuit, lib) {
    /* ram16 は NAND から組んでいない実装部品。課題は「NAND から組み上げる」ことが
     * 主題なので、含まれていたら振る舞いを見る前に正直に断る */
    var f0 = NL.lib.flatten(circuit, lib);
    if (!f0.error && NL.truth.hasRam(f0)) {
      return { ok: false, error: 'RAM16 は実装部品（NAND から組んでいない）なので、課題の採点では使えません。NAND から組んでください' };
    }
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

  NL.quest = { QUESTS: QUESTS, STAGES: STAGES, BY_ID: BY_ID, grade: grade, build: build, numToBits: numToBits };
})(typeof window !== 'undefined' ? window : globalThis);
