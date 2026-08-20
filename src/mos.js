/* NAND の中身 ― CMOS のトランジスタ4個
 *
 * このアプリの原始部品である NAND が、実際の石の上で何でできているか。
 * ここだけは論理より下の層で、「なぜ NAND なのか」の答えでもある。
 *
 * トランジスタは、ゲートに電圧をかけると通り道が繋がる（切れる）だけのスイッチ。
 *
 *   pMOS（上・電源側）  ゲートが 0 のとき繋がる
 *   nMOS（下・接地側）  ゲートが 1 のとき繋がる
 *
 * 上の2つは並列、下の2つは直列に置く。それだけで:
 *
 *   A も B も 1  → 下が2つとも繋がり、Y は地面（0）へ引き下げられる
 *   どちらかが 0 → 上のどちらかが繋がり、Y は電源（1）へ引き上げられる
 *
 * これがそのまま NAND の表になっている。**上と下が同時に繋がることは無い**ので、
 * 電源から地面へ電流が流れ続けない。CMOS が発熱しない理由がこの形。
 *
 * AND を作るには、この後ろに NOT（さらに2個）を足して6個要る。
 * NAND のほうが AND より部品が少なく、しかも速い ―
 * 原始部品を NAND にした物理的な理由がここにある。
 *
 * 【3値】ゲートに来ている値が X なら、そのスイッチは「繋がるかどうか分からない」。
 * 0 で埋めない。分からないものを分かったことにすると、
 * 「繋ぎ忘れているのに動いて見える」回路ができてしまう。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});
  var X = NL.sim.X;

  var ON = 'on', OFF = 'off', UNK = 'x';

  /** pMOS は 0 で繋がる。nMOS は 1 で繋がる */
  function gate(v, openAt) {
    if (v === X) return UNK;
    return v === openAt ? ON : OFF;
  }

  /** 並列（どちらか繋がれば通る） */
  function anyOn(a, b) {
    if (a === ON || b === ON) return ON;
    if (a === OFF && b === OFF) return OFF;
    return UNK;
  }

  /** 直列（両方繋がって初めて通る） */
  function allOn(a, b) {
    if (a === OFF || b === OFF) return OFF;
    if (a === ON && b === ON) return ON;
    return UNK;
  }

  /**
   * 今の A・B に対する中身の状態。
   * 戻り値 { p:[上2つ], n:[下2つ], up, down, y, story:[説明の行] }
   */
  function nand(a, b) {
    var p = [gate(a, 0), gate(b, 0)];
    var n = [gate(a, 1), gate(b, 1)];
    var up = anyOn(p[0], p[1]);         /* 電源へ繋がっているか */
    var down = allOn(n[0], n[1]);       /* 地面へ繋がっているか */
    var y = up === ON ? 1 : down === ON ? 0 : X;
    return { p: p, n: n, up: up, down: down, y: y, story: story(a, b, up, down) };
  }

  function name(v) { return v === X ? 'X' : String(v); }

  function story(a, b, up, down) {
    if (a === X || b === X) {
      var who = a === X && b === X ? 'A も B も' : (a === X ? 'A が' : 'B が');
      return [
        who + 'まだ決まっていない（X）。そのゲートのスイッチは、繋がるとも切れるとも言えない。',
        up === ON ? '― ただし、もう片方が 0 なので上はもう繋がっている。それだけで Y は 1 に決まる。'
                  : '通り道が決められないので、Y も決まらない。0 で埋めたりはしない。'
      ];
    }
    if (a === 1 && b === 1) {
      return [
        'A も B も 1。下の n が2つとも繋がり、Y は地面まで一本道 ― 引き下げられて 0。',
        '上の p は2つとも切れている。だから電源から地面へ電流は流れない。'
      ];
    }
    var zero = a === 0 && b === 0 ? 'A も B も 0 なので、上の p は2つとも' : (a === 0 ? 'A が 0 なので、上の p（A）が' : 'B が 0 なので、上の p（B）が');
    return [
      zero + '繋がる。Y は電源まで届いて 1 に引き上げられる。',
      '下の n は直列なので、片方でも切れていれば地面には落ちない。'
    ];
  }

  /* 画面に出す固定の説明。長い文章は README に置き、ここは目の前の絵に付く分だけ */
  var FACTS = [
    'トランジスタは「ゲートに電圧をかけると通り道が繋がる」だけのスイッチ。p は 0 で、n は 1 で繋がる。',
    '上は並列・下は直列。この置き方だけで NAND の表になる。',
    'NAND はトランジスタ4個。AND にするには NOT を足して6個 ― NAND のほうが安くて速い。'
  ];

  NL.mos = { nand: nand, FACTS: FACTS, ON: ON, OFF: OFF, UNK: UNK, name: name };
})(typeof window !== 'undefined' ? window : globalThis);
