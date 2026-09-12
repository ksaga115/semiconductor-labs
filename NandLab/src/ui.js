/* 画面 ― 回路の描画と操作
 *
 * 回路そのものは canvas に手で描く。SVG にすると部品ひとつひとつが DOM になり、
 * 4ビット加算器あたりで要素が数百個になって、値の色を毎フレーム塗り替えるのが重くなる。
 *
 * 【時間の進め方】既定は「流しっぱなし」。毎フレーム、落ち着くまで（上限つきで）進める。
 * 「止める」と時間が凍り、「1歩」で単位時間ずつ進む。伝播が波のように広がる様子と、
 * 発振がどこで暴れているかを目で見るための機能なので、止めているときは
 * スイッチを動かしても勝手に落ち着かせない。
 *
 * 【値の読み方】素子の値は経路（"12/7/3" のような部品IDの連なり）で引く。
 * トップの回路もチップの中身も同じ関数で描けるようにするため。
 */
(function (global) {
  'use strict';
  var NL = global.NL;
  var N = NL.netlist, L = NL.lib, SIM = NL.sim, T = NL.truth, Q = NL.quest, ST = NL.store, EX = NL.expr;
  var LAY = NL.layout;
  var X = SIM.X;

  /* ---------------- 見た目の寸法 ---------------- */

  /* 【端子は必ず格子の上に載せる】
   * 端子の y が半端な値だと、部品の高さが違うだけで配線が斜めになり、
   * どう動かしても直線にできない（46/3 = 15.33… のような座標が出るため）。
   *
   * そこで寸法を次の規則で決める:
   *   - 端子の間隔 PITCH は GRID の偶数倍（20）
   *   - 部品の高さは必ず 20 の倍数 → 中心 h/2 は 10 の倍数
   *   - 端子は中心から上下に対称に置く → ずれは (端子数-1)×10 で 10 の倍数
   * よって端子の y は常に 10 の倍数。部品は格子に吸い付くので、
   * 上下に動かせば任意の2端子をぴったり揃えられる。
   */
  var PITCH = 20;
  function heightFor(n) { return Math.max(2, n + 1) * PITCH; }   /* 1端子→40, 2→60, 3→80 */
  function round10(v) { return Math.ceil(v / 10) * 10; }

  var GEO = {
    nand:  { w: 60, h: heightFor(2) },
    'in':  { w: 60, h: heightFor(1) },
    out:   { w: 60, h: heightFor(1) },
    'const': { w: 40, h: heightFor(1) },
    clock: { w: 60, h: heightFor(1) },
    ram16: { w: 100, h: heightFor(7) }   /* 実装部品。入力7（A0..A3,D,W,C）→ 出力 Q */
  };
  var GRID = 10;
  var PORT_R = 5;
  var HIT_R = 9;

  function sizeOf(p, lib) {
    if (p.kind !== 'chip') return GEO[p.kind] || { w: 60, h: heightFor(1) };
    var n = N.portsOf(p, lib);
    return {
      w: round10(Math.max(80, String(p.chip).length * 9 + 34)),
      h: heightFor(Math.max(n.in, n.out, 1))
    };
  }

  function portXY(p, lib, side, i) {
    var s = sizeOf(p, lib), n = N.portsOf(p, lib);
    var count = Math.max(1, side === 'in' ? n.in : n.out);
    var cy = p.y + s.h / 2;
    return { x: side === 'in' ? p.x : p.x + s.w, y: cy - (count - 1) * PITCH / 2 + i * PITCH };
  }

  /* 値を引くための経路。チップの出力ポートは、中の out 部品まで潜って初めて実体に届く */
  function outPath(prefix, part, k, lib) {
    if (part.kind !== 'chip') return prefix + part.id;
    var def = lib[part.chip];
    if (!def || def.outputs[k] === undefined) return null;
    var inner = def.circuit.parts[def.outputs[k]];
    if (!inner) return null;
    return outPath(prefix + part.id + '/', inner, 0, lib);
  }

  /* ---------------- 全体の状態 ---------------- */

  var S = {
    circuit: null, lib: null, cleared: {}, questId: null,
    flat: null, sim: null,
    running: true, frame: 0, clockDiv: 12,
    view: { ox: 40, oy: 40, s: 1 },
    sel: { parts: {}, wires: {} },
    place: null,          /* { kind, chip } 配置待ち */
    act: null,            /* 進行中の操作 */
    peek: null,           /* { chip, prefix, view } */
    undo: [], redo: [],
    msg: '', msgAt: 0, editing: null, showBus: true,   /* 作業台に取り出しているチップの名前 */
    saveTimer: null, nandCount: 0, ramCount: 0
  };

  var el = {}, cv, ctx, pcv, pctx;

  /* ---------------- 起動 ---------------- */

  function mount(state) {
    S.circuit = state.circuit;
    S.lib = state.lib || {};
    S.cleared = state.cleared || {};
    S.questId = state.quest || null;

    ['prims', 'chips', 'libEmpty', 'questList', 'questBody', 'qName', 'qDesc', 'qWhy', 'qPorts', 'qHint',
      'qSpec', 'qResult', 'statLeft', 'statRight', 'overlay', 'modal', 'peek', 'peekName',
      'peekBoard', 'btnRun', 'btnStep', 'btnReset', 'clockSpeed', 'btnTruth', 'btnExpr', 'btnSlim', 'btnChip',
      'btnTidy', 'btnPath', 'btnSaveChip', 'btnNew', 'btnExport', 'btnImport', 'btnGrade', 'btnAnswer', 'peekEdit', 'peekClose',
      'peekVolt'
    ].forEach(function (id) { el[id] = document.getElementById(id); });

    cv = document.getElementById('board');
    ctx = cv.getContext('2d');
    pcv = el.peekBoard;
    pctx = pcv.getContext('2d');

    buildPalette();
    setEditing(null);
    buildQuestList();
    selectQuest(S.questId);
    bindEvents();
    rebuild();
    resize();
    requestAnimationFrame(loop);
    say('パレットから部品を選んで、盤面をクリックすると置ける。出力の丸から入力の丸へドラッグで配線。');
  }

  /* ---------------- 回路を組み直す ---------------- */

  /** 構造をいじったら必ず呼ぶ。展開し直してシミュレータを作り直す */
  function rebuild() {
    S.flat = L.flatten(S.circuit, S.lib);
    /* 素子数はここで数えて覚えておく。ステータス行のために毎フレーム
     * T.gateCount を呼ぶと、そのたびに回路を展開し直すことになる */
    S.nandCount = 0; S.ramCount = 0;
    for (var i = 0; i < S.flat.gates.length; i++) {
      if (S.flat.gates[i].kind === 'nand') S.nandCount++;
      else if (S.flat.gates[i].kind === 'ram16') S.ramCount++;
    }
    S.sim = new SIM.Sim(S.flat);
    if (S.running) S.sim.settle();
    refreshQuestPorts();
    scheduleSave();
  }

  function snapshot() {
    S.undo.push(JSON.stringify({ circuit: S.circuit, lib: S.lib }));
    if (S.undo.length > 60) S.undo.shift();
    S.redo.length = 0;
  }

  function restore(json) {
    var o = JSON.parse(json);
    S.circuit = o.circuit; S.lib = o.lib;
    S.sel = { parts: {}, wires: {} };
    buildPalette();
    rebuild();
  }

  function undo() {
    if (!S.undo.length) return say('これ以上戻せない');
    S.redo.push(JSON.stringify({ circuit: S.circuit, lib: S.lib }));
    restore(S.undo.pop());
    say('元に戻した');
  }
  function redo() {
    if (!S.redo.length) return say('やり直せる操作がない');
    S.undo.push(JSON.stringify({ circuit: S.circuit, lib: S.lib }));
    restore(S.redo.pop());
    say('やり直した');
  }

  function scheduleSave() {
    if (S.saveTimer) clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(function () {
      S.saveTimer = null;
      if (!ST.save({ circuit: S.circuit, lib: S.lib, cleared: S.cleared, quest: S.questId })) {
        say('保存できなかった（ブラウザの保存容量がいっぱいかもしれない）');
      }
    }, 400);
  }

  function say(m) { S.msg = m; S.msgAt = Date.now(); }

  /* ---------------- 座標 ---------------- */

  function toWorld(e, view) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s };
  }
  function snap(v) { return Math.round(v / GRID) * GRID; }

  /* ---------------- 当たり判定 ---------------- */

  function partsInDrawOrder(c) {
    var out = [];
    for (var id in c.parts) out.push(c.parts[id]);
    return out;
  }

  function partAt(c, wx, wy) {
    var list = partsInDrawOrder(c);
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i], s = sizeOf(p, S.lib);
      if (wx >= p.x && wx <= p.x + s.w && wy >= p.y && wy <= p.y + s.h) return p;
    }
    return null;
  }

  function portAt(c, wx, wy) {
    var list = partsInDrawOrder(c);
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i], n = N.portsOf(p, S.lib), k, q;
      for (k = 0; k < n.out; k++) {
        q = portXY(p, S.lib, 'out', k);
        if (Math.abs(q.x - wx) < HIT_R && Math.abs(q.y - wy) < HIT_R) return { part: p, side: 'out', port: k };
      }
      for (k = 0; k < n.in; k++) {
        q = portXY(p, S.lib, 'in', k);
        if (Math.abs(q.x - wx) < HIT_R && Math.abs(q.y - wy) < HIT_R) return { part: p, side: 'in', port: k };
      }
    }
    return null;
  }

  /** 配線の折れ線。描画にも当たり判定にも同じものを使う */
  function wirePath(c, w) {
    var a = c.parts[w.from.part], b = c.parts[w.to.part];
    if (!a || !b) return null;
    var p1 = portXY(a, S.lib, 'out', w.from.port);
    var p2 = portXY(b, S.lib, 'in', w.to.port);
    /* 「整える」が決めた通り道が、まだ端子とぴったり合っていればそれを使う。
     * 部品を動かした瞬間に合わなくなるので、そのときは素直な折れ線に戻る。
     * 覚えた道が古いかどうかを、別の印ではなく端の一致で判定するのがミソ
     * （印を消し忘れると、部品と繋がっていない線が残る） */
    var q = w.pts;
    if (q && q.length >= 2 &&
        q[0].x === p1.x && q[0].y === p1.y &&
        q[q.length - 1].x === p2.x && q[q.length - 1].y === p2.y) return q;
    return routePath(p1, p2, w.to.port);
  }

  /* 【曲がるのは行き先の直前】真ん中で曲がると、その縦棒が列の真ん中に立って
   * 途中の部品を突き抜ける。出た高さのまま真横に走り、行き先の手前 ―
   * 整列した盤面では列と列のすきま ― で初めて縦に折れる。
   * その走路ぶんの隙間は layout.js の「通し道」が空けてくれる。
   *
   * 【入る端子ごとに折れる位置をずらす】同じ部品の入力2本が同じ x で縦に折れると、
   * 線どうしが重なって1本に見える。端子の番号ぶん左へずらす（列のすきま 60 に収まる範囲で）。 */
  function routePath(p1, p2, port) {
    if (p2.x > p1.x + 24) {
      if (p1.y === p2.y) return [p1, p2];
      var bx = Math.max(p1.x + 12, p2.x - 20 - Math.min(port || 0, 3) * 10);
      return [p1, { x: bx, y: p1.y }, { x: bx, y: p2.y }, p2];
    }
    /* 右から左へ戻る配線。まっすぐ引くと部品を突っ切るので、いったん上下に逃がす */
    var ax = p1.x + 18, bx = p2.x - 18, my = (p1.y + p2.y) / 2 + 34;
    return [p1, { x: ax, y: p1.y }, { x: ax, y: my }, { x: bx, y: my }, { x: bx, y: p2.y }, p2];
  }

  function distToSeg(px, py, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    var t = len ? ((px - a.x) * dx + (py - a.y) * dy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    var qx = a.x + t * dx, qy = a.y + t * dy;
    return Math.hypot(px - qx, py - qy);
  }

  function wireAt(c, wx, wy) {
    for (var id in c.wires) {
      var pts = wirePath(c, c.wires[id]);
      if (!pts) continue;
      for (var i = 0; i + 1 < pts.length; i++) {
        if (distToSeg(wx, wy, pts[i], pts[i + 1]) < 6) return c.wires[id];
      }
    }
    return null;
  }

  /* ---------------- 描画 ---------------- */

  function resize() {
    fit(cv, ctx);
    if (S.peek) fit(pcv, pctx);
  }
  function fit(canvas, c2) {
    var dpr = global.devicePixelRatio || 1;
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function sigColor(v, hot) {
    if (hot) return '#ff5d6c';
    if (v === 1) return '#35e0c8';
    if (v === 0) return '#37506a';
    return '#6b7688';
  }

  function loop() {
    tick();
    render();
    requestAnimationFrame(loop);
  }

  var FRAME_STEPS = 600;   /* 発振している回路でフレームを食い潰さないための上限 */

  var HOT_WINDOW = 40;    /* 直近この歩数のあいだに動いた素子を「暴れている」とみなす */

  function tick() {
    if (!S.running || !S.sim) return;
    var n = 0, recent = [];
    while (S.sim.q.length && n < FRAME_STEPS) {
      recent.push(S.sim.step());
      if (recent.length > HOT_WINDOW) recent.shift();
      n++;
    }
    /* 上限まで回しても計算待ちが残っていたら発振。sim.settle は流しっぱなしの
     * 経路では呼ばれないので、暴れている素子はここで割り出す */
    if (S.sim.q.length) {
      var hot = {};
      recent.forEach(function (a) { a.forEach(function (i) { hot[i] = 1; }); });
      S.sim.hot = Object.keys(hot).map(Number);
    } else if (S.sim.hot.length) {
      S.sim.hot = [];
    }
    S.frame++;
    if (S.flat.clocks.length && S.frame % S.clockDiv === 0) S.sim.clockEdge();
  }

  function render() {
    var r = cv.getBoundingClientRect();
    if (Math.abs(r.width - cv.width / (global.devicePixelRatio || 1)) > 1 ||
        Math.abs(r.height - cv.height / (global.devicePixelRatio || 1)) > 1) resize();

    ctx.save();
    ctx.fillStyle = '#12151a';
    ctx.fillRect(0, 0, r.width, r.height);
    drawGrid(ctx, S.view, r);
    ctx.translate(S.view.ox, S.view.oy);
    ctx.scale(S.view.s, S.view.s);
    drawCircuit(ctx, S.circuit, '', true);
    drawOverlays(ctx);
    ctx.restore();

    if (S.showBus) drawBuses(ctx, r);
    if (S.peek) renderPeek();
    updateStatus();
  }

  /* ---------------- 数として読む（束） ---------------- */

  /* 名前が「同じ語幹＋数字」の入力・出力をひとまとめにして、数として読む。
   * A0..A3 と B0..B3 を足して S0..S3 が出る回路を組んだとき、
   * 光の並びを目で二進に直すのは慣れるまで本当にできない。
   * 「7 + 5 = 12」と出て初めて、自分が足し算機を作ったことが分かる。
   *
   * 添字 0 が最下位。課題の端子の付け方（S0 が最下位）と同じにしてある。 */
  function busesOf(circuit) {
    var out = [];
    ['in', 'out'].forEach(function (kind) {
      var g = {}, stem;
      N.partsOfKind(circuit, kind).forEach(function (p) {
        var m = /^(.*?)(\d+)$/.exec(p.name || '');
        if (!m || !m[1]) return;
        (g[m[1]] || (g[m[1]] = [])).push({ p: p, i: +m[2] });
      });
      for (stem in g) {
        if (g[stem].length < 2) continue;
        g[stem].sort(function (a, b) { return a.i - b.i; });
        out.push({ kind: kind, name: stem, bits: g[stem] });
      }
    });
    return out;
  }

  /** 束の今の値。1ビットでも X なら数にできないので null を返す（0 で埋めない） */
  function busValue(bus) {
    var v = 0, i, b;
    for (i = 0; i < bus.bits.length; i++) {
      b = valueOf('', bus.bits[i].p, 0);
      if (b === X) return null;
      if (b === 1) v += Math.pow(2, i);
    }
    return v;
  }

  function busBits(bus) {
    var s = '', i;
    for (i = bus.bits.length - 1; i >= 0; i--) s += SIM.show(valueOf('', bus.bits[i].p, 0));
    return s;
  }

  function drawBuses(c2, rect) {
    var list = busesOf(S.circuit);
    if (!list.length) return;

    c2.save();
    c2.font = '12px Consolas, "Courier New", monospace';
    var rows = list.map(function (b) {
      return { b: b, name: b.name, bits: busBits(b), val: busValue(b) };
    });
    var wName = 0, wBits = 0;
    rows.forEach(function (r) {
      wName = Math.max(wName, c2.measureText(r.name).width);
      wBits = Math.max(wBits, c2.measureText(r.bits).width);
    });
    var pad = 10, lh = 18;
    var w = pad * 2 + wName + 12 + wBits + 12 + c2.measureText('=  888').width;
    var h = pad * 2 + rows.length * lh;
    var x = rect.width - w - 12, y = 12;

    c2.fillStyle = 'rgba(26,31,39,.92)';
    c2.strokeStyle = '#2e3745';
    c2.lineWidth = 1;
    roundRect(c2, x, y, w, h, 7);
    c2.fill(); c2.stroke();

    c2.textBaseline = 'middle';
    rows.forEach(function (r, i) {
      var cy = y + pad + i * lh + lh / 2;
      c2.textAlign = 'left';
      c2.fillStyle = r.b.kind === 'out' ? '#d7dee8' : '#8492a6';
      c2.fillText(r.name, x + pad, cy);
      c2.fillStyle = /X/.test(r.bits) ? '#6b7688' : '#9fb6cf';
      c2.fillText(r.bits, x + pad + wName + 12, cy);
      c2.textAlign = 'right';
      c2.fillStyle = r.val === null ? '#6b7688' : (r.b.kind === 'out' ? '#35e0c8' : '#b9c4d2');
      c2.fillText(r.val === null ? '―' : String(r.val), x + w - pad, cy);
    });
    c2.restore();
  }

  function drawGrid(c2, view, r) {
    var step = GRID * view.s;
    while (step < 14) step *= 2;
    c2.save();
    c2.strokeStyle = '#1b2029';
    c2.lineWidth = 1;
    c2.beginPath();
    for (var x = view.ox % step; x < r.width; x += step) { c2.moveTo(Math.round(x) + .5, 0); c2.lineTo(Math.round(x) + .5, r.height); }
    for (var y = view.oy % step; y < r.height; y += step) { c2.moveTo(0, Math.round(y) + .5); c2.lineTo(r.width, Math.round(y) + .5); }
    c2.stroke();
    c2.restore();
  }

  /** 回路を1枚描く。prefix を変えればチップの中身も同じ関数で描ける */
  function drawCircuit(c2, circuit, prefix, live) {
    var hot = {};
    if (live && S.sim) S.sim.hot.forEach(function (g) { hot[g] = 1; });

    /* 配線が先。部品の下に潜らせる */
    for (var id in circuit.wires) {
      var w = circuit.wires[id];
      var pts = wirePath(circuit, w);
      if (!pts) continue;
      var from = circuit.parts[w.from.part];
      var v = valueOf(prefix, from, w.from.port);
      var isHot = live && S.sim && hotAt(prefix, from, w.from.port, hot);
      strokePath(c2, pts, sigColor(v, isHot), S.sel.wires[id] ? 3.4 : (v === 1 ? 2.4 : 1.8), v === X);
    }
    for (var pid in circuit.parts) drawPart(c2, circuit, circuit.parts[pid], prefix, hot, live);

    /* 配線の名前は部品より上に。線に埋もれると読めない */
    for (var wid in circuit.wires) {
      var wr = circuit.wires[wid];
      if (!wr.name) continue;
      var q = wirePath(circuit, wr);
      if (q) drawWireName(c2, q, wr.name, valueOf(prefix, circuit.parts[wr.from.part], wr.from.port));
    }
  }

  /* 名前は、その線の一番長い横棒の真ん中に置く。斜めの所に置くと線と字が重なって読めない */
  function drawWireName(c2, pts, name, v) {
    var best = null, bestLen = 0, i;
    for (i = 0; i + 1 < pts.length; i++) {
      if (pts[i].y !== pts[i + 1].y) continue;
      var len = Math.abs(pts[i + 1].x - pts[i].x);
      if (len > bestLen) { bestLen = len; best = { x: (pts[i].x + pts[i + 1].x) / 2, y: pts[i].y }; }
    }
    if (!best || bestLen < 24) return;
    c2.save();
    c2.font = '11px "Yu Gothic UI", Meiryo, system-ui, sans-serif';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    var w = c2.measureText(name).width + 10;
    c2.fillStyle = '#12151a';
    roundRect(c2, best.x - w / 2, best.y - 8, w, 16, 5);
    c2.fill();
    c2.fillStyle = sigColor(v, false);
    c2.fillText(name, best.x, best.y);
    c2.restore();
  }

  function valueOf(prefix, part, port) {
    if (!S.sim) return X;
    var path = outPath(prefix, part, port, S.lib);
    return path === null ? X : S.sim.atPath(path);
  }
  function hotAt(prefix, part, port, hot) {
    var path = outPath(prefix, part, port, S.lib);
    if (path === null) return false;
    var gi = S.flat.byPath[path];
    return gi !== undefined && hot[gi];
  }

  function strokePath(c2, pts, color, width, dashed) {
    c2.save();
    c2.strokeStyle = color;
    c2.lineWidth = width;
    c2.lineJoin = 'round';
    c2.lineCap = 'round';
    if (dashed) c2.setLineDash([5, 5]);
    c2.beginPath();
    c2.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) c2.lineTo(pts[i].x, pts[i].y);
    c2.stroke();
    c2.restore();
  }

  function roundRect(c2, x, y, w, h, r) {
    c2.beginPath();
    c2.moveTo(x + r, y);
    c2.arcTo(x + w, y, x + w, y + h, r);
    c2.arcTo(x + w, y + h, x, y + h, r);
    c2.arcTo(x, y + h, x, y, r);
    c2.arcTo(x, y, x + w, y, r);
    c2.closePath();
  }

  function drawPart(c2, circuit, p, prefix, hot, live) {
    var s = sizeOf(p, S.lib), n = N.portsOf(p, S.lib);
    var selected = prefix === '' && S.sel.parts[p.id];
    var outV = n.out ? valueOf(prefix, p, 0) : X;

    c2.save();
    c2.lineWidth = selected ? 2 : 1.2;
    c2.strokeStyle = selected ? '#4ea1ff' : '#4a5768';
    c2.fillStyle = '#222a35';
    c2.font = '600 12px "Yu Gothic UI", Meiryo, sans-serif';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';

    if (p.kind === 'nand') {
      roundRect(c2, p.x, p.y, s.w - 8, s.h, 6);
      c2.fill(); c2.stroke();
      /* 出力側の否定の丸 */
      c2.beginPath();
      c2.arc(p.x + s.w - 4, p.y + s.h / 2, 4.5, 0, Math.PI * 2);
      c2.fillStyle = '#12151a'; c2.fill(); c2.stroke();
      c2.fillStyle = '#c3cfdd';
      c2.fillText('NAND', p.x + (s.w - 8) / 2, p.y + s.h / 2);

    } else if (p.kind === 'in') {
      roundRect(c2, p.x, p.y, s.w, s.h, s.h / 2);
      c2.fillStyle = outV === 1 ? '#16463f' : '#222a35';
      c2.fill();
      c2.strokeStyle = selected ? '#4ea1ff' : (outV === 1 ? '#35e0c8' : '#4a5768');
      c2.stroke();
      /* つまみ */
      c2.beginPath();
      c2.arc(p.x + (outV === 1 ? s.w - 12 : 12), p.y + s.h / 2, 8, 0, Math.PI * 2);
      c2.fillStyle = sigColor(outV); c2.fill();
      c2.fillStyle = '#dbe4ef';
      c2.textAlign = outV === 1 ? 'left' : 'right';
      c2.fillText(p.name, p.x + (outV === 1 ? 6 : s.w - 6), p.y + s.h / 2);

    } else if (p.kind === 'out') {
      var inV = inValueOf(prefix, circuit, p, 0);
      roundRect(c2, p.x, p.y, s.w, s.h, 6);
      c2.fill(); c2.stroke();
      c2.beginPath();
      c2.arc(p.x + 15, p.y + s.h / 2, 8, 0, Math.PI * 2);
      c2.fillStyle = sigColor(inV); c2.fill();
      c2.strokeStyle = '#12151a'; c2.lineWidth = 1; c2.stroke();
      c2.fillStyle = '#dbe4ef';
      c2.textAlign = 'left';
      c2.fillText(p.name, p.x + 28, p.y + s.h / 2);

    } else if (p.kind === 'const') {
      roundRect(c2, p.x, p.y, s.w, s.h, 5);
      c2.fill(); c2.stroke();
      c2.fillStyle = sigColor(p.value ? 1 : 0);
      c2.font = '700 15px Consolas, monospace';
      c2.fillText(p.value ? '1' : '0', p.x + s.w / 2, p.y + s.h / 2);

    } else if (p.kind === 'clock') {
      roundRect(c2, p.x, p.y, s.w, s.h, 5);
      c2.fill(); c2.stroke();
      c2.strokeStyle = sigColor(outV);
      c2.lineWidth = 2;
      c2.beginPath();
      var bx = p.x + 10, by = p.y + s.h / 2;
      c2.moveTo(bx, by + 7); c2.lineTo(bx, by - 7); c2.lineTo(bx + 9, by - 7);
      c2.lineTo(bx + 9, by + 7); c2.lineTo(bx + 18, by + 7); c2.lineTo(bx + 18, by - 7);
      c2.stroke();
      c2.fillStyle = '#8492a6';
      c2.font = '600 10px sans-serif';
      c2.textAlign = 'right';
      c2.fillText('CLK', p.x + s.w - 5, p.y + s.h - 8);

    } else if (p.kind === 'ram16') {
      /* 実装部品。チップと違う色にして「NAND から組んだものではない」ことを見た目でも示す */
      roundRect(c2, p.x, p.y, s.w, s.h, 5);
      c2.fillStyle = '#332b1d';
      c2.fill();
      c2.strokeStyle = selected ? '#4ea1ff' : '#a8823f';
      c2.stroke();
      c2.fillStyle = '#e8c880';
      c2.fillText('RAM16', p.x + s.w / 2, p.y + 16);
      c2.font = '9px sans-serif';
      c2.fillStyle = '#b09a6a';
      c2.fillText('16語×1bit', p.x + s.w / 2, p.y + 30);
      c2.fillText('実装部品', p.x + s.w / 2, p.y + s.h - 12);
      c2.font = '10px sans-serif';
      c2.fillStyle = '#c9b586';
      c2.textAlign = 'left';
      N.RAM_PORTS.forEach(function (nm, i) {
        var q = portXY(p, S.lib, 'in', i);
        c2.fillText(nm, p.x + 6, q.y);
      });
      c2.textAlign = 'right';
      c2.fillText('Q', p.x + s.w - 6, portXY(p, S.lib, 'out', 0).y);

    } else if (p.kind === 'chip') {
      var def = S.lib[p.chip];
      roundRect(c2, p.x, p.y, s.w, s.h, 5);
      c2.fillStyle = def ? '#273448' : '#3a2530';
      c2.fill();
      c2.strokeStyle = selected ? '#4ea1ff' : (def ? '#4d6489' : '#8a4a5a');
      c2.stroke();
      c2.fillStyle = def ? '#cfe0f5' : '#f0a7b4';
      c2.fillText(p.chip, p.x + s.w / 2, p.y + s.h / 2);
      /* 端子名を小さく添える */
      if (def) {
        c2.font = '10px sans-serif';
        c2.fillStyle = '#7f8fa4';
        c2.textAlign = 'left';
        def.inNames.forEach(function (nm, i) {
          var q = portXY(p, S.lib, 'in', i);
          c2.fillText(nm, p.x + 6, q.y);
        });
        c2.textAlign = 'right';
        def.outNames.forEach(function (nm, i) {
          var q = portXY(p, S.lib, 'out', i);
          c2.fillText(nm, p.x + s.w - 6, q.y);
        });
      }
    }
    c2.restore();

    /* 端子の丸 */
    var k, q2;
    for (k = 0; k < n.in; k++) {
      q2 = portXY(p, S.lib, 'in', k);
      var v = inValueOf(prefix, circuit, p, k);
      dot(c2, q2, sigColor(v), N.wireAtInput(circuit, p.id, k) ? null : '#ff9f43');
    }
    for (k = 0; k < n.out; k++) {
      q2 = portXY(p, S.lib, 'out', k);
      dot(c2, q2, sigColor(valueOf(prefix, p, k), live && hotAt(prefix, p, k, hot)), null);
    }
  }

  /** 入力ポートに来ている値。繋がっていなければ X */
  function inValueOf(prefix, circuit, p, port) {
    var w = N.wireAtInput(circuit, p.id, port);
    if (!w) return X;
    var from = circuit.parts[w.from.part];
    return from ? valueOf(prefix, from, w.from.port) : X;
  }

  function dot(c2, q, color, ring) {
    c2.save();
    c2.beginPath();
    c2.arc(q.x, q.y, PORT_R, 0, Math.PI * 2);
    c2.fillStyle = color; c2.fill();
    c2.lineWidth = 1.4;
    c2.strokeStyle = ring || '#12151a';
    c2.stroke();
    c2.restore();
  }

  /** 配線中の線・矩形選択の枠など、操作中だけ出るもの */
  function drawOverlays(c2) {
    var a = S.act;
    if (!a) return;
    if (a.type === 'wire') {
      var p1 = portXY(a.from.part, S.lib, 'out', a.from.port);
      strokePath(c2, routePath(p1, a.cur), '#4ea1ff', 2, true);
    } else if (a.type === 'rect') {
      c2.save();
      c2.strokeStyle = '#4ea1ff'; c2.lineWidth = 1;
      c2.fillStyle = 'rgba(78,161,255,.10)';
      var x = Math.min(a.x0, a.x1), y = Math.min(a.y0, a.y1);
      c2.fillRect(x, y, Math.abs(a.x1 - a.x0), Math.abs(a.y1 - a.y0));
      c2.strokeRect(x, y, Math.abs(a.x1 - a.x0), Math.abs(a.y1 - a.y0));
      c2.restore();
    }
  }

  /* ---------------- 状態表示 ---------------- */

  function updateStatus() {
    var left = [];
    if (S.flat && S.flat.error) left.push('⚠ ' + S.flat.error);
    else left.push('NAND ' + S.nandCount + '個' + (S.ramCount ? '＋RAM16 ' + S.ramCount + '個（実装部品）' : ''));
    var selN = Object.keys(S.sel.parts).length;
    if (selN) left.push(selN + '個 選択中');
    if (S.place) left.push('配置: ' + (S.place.chip || kindLabel(S.place.kind)) + '（Esc でやめる）');
    if (S.msg && Date.now() - S.msgAt < 7000) left.push(S.msg);
    el.statLeft.textContent = left.join('　／　');

    var right;
    if (!S.sim) right = '';
    else if (S.sim.q.length && !S.running) right = '止まっている（待ち ' + S.sim.q.length + ' 素子）― Space で1歩';
    else if (S.sim.q.length) right = '発振中';
    else if (!S.running) right = '止まっている';
    else right = '動作中　t=' + S.sim.time;
    el.statRight.textContent = right;
    el.statRight.classList.toggle('warn', !!(S.sim && S.sim.q.length && S.running));
  }

  function kindLabel(k) {
    return { nand: 'NAND', 'in': '入力', out: '出力', 'const': '定数', clock: 'クロック', ram16: 'RAM16（実装部品）' }[k] || k;
  }

  /* ---------------- パレット ---------------- */

  function buildPalette() {
    el.prims.innerHTML = '';
    [['nand', 'NAND', '唯一の素子'],
     ['in', '入力', 'スイッチ'],
     ['out', '出力', 'ランプ'],
     ['const', '定数', '0 / 1'],
     ['clock', 'クロック', '反転し続ける'],
     ['ram16', 'RAM16', '実装部品。NAND からは組んでいない']
    ].forEach(function (row) {
      var d = document.createElement('div');
      d.className = 'pitem';
      d.dataset.kind = row[0];
      d.innerHTML = '<span class="k"></span><span class="d"></span>';
      d.querySelector('.k').textContent = row[1];
      d.querySelector('.d').textContent = row[2];
      if (row[0] === 'ram16') {
        d.title = '16語×1bit の RAM。ここだけは実装部品（NAND からは組んでいない）。\n'
                + 'A0..A3 番地, D 書く値, W 書き込み許可, C クロック → Q 読み出し。\n'
                + 'C の立ち上がりで W=1 なら書き込む。電源投入直後は全セル X。\n'
                + '課題の採点では使えない（課題は NAND から組むのが主題）。\n'
                + 'ダブルクリックで中身の16セルを見られる。';
      }
      d.onclick = function () { setPlace({ kind: row[0] }); };
      el.prims.appendChild(d);
    });

    el.chips.innerHTML = '';
    var namesList = Object.keys(S.lib).sort(N.natCmp);
    el.libEmpty.classList.toggle('hidden', namesList.length > 0);
    namesList.forEach(function (nm) {
      var def = S.lib[nm];
      /* 中身の素子数と深さ。パレットは中身が変わったときにしか作り直さないので、
       * ここで展開しても毎フレームの負担にはならない */
      var g = T.gateCount(def.circuit, S.lib), dep = L.depth(nm, S.lib);
      var d = document.createElement('div');
      d.className = 'pitem';
      d.dataset.chip = nm;
      d.title = nm + '（入力 ' + def.inNames.join(',') + ' → 出力 ' + def.outNames.join(',') + '）\n'
              + 'ばらすと NAND ' + g.nand + '個・NOT から数えて ' + dep + ' 段目\n'
              + 'ダブルクリックで中身を作業台に取り出す';
      d.innerHTML = '<span class="k"></span><span class="cnt"></span><span class="x" title="削除">×</span>';
      d.querySelector('.k').textContent = nm;
      d.querySelector('.cnt').textContent = g.error ? '?' : g.nand;
      d.onclick = function (e) {
        if (e.target.className === 'x') { e.stopPropagation(); removeChip(nm); return; }
        setPlace({ kind: 'chip', chip: nm });
      };
      d.ondblclick = function () { openChipForEdit(nm); };
      el.chips.appendChild(d);
    });
    markPlace();
  }

  function setPlace(p) {
    S.place = (S.place && S.place.kind === p.kind && S.place.chip === p.chip) ? null : p;
    markPlace();
  }
  function markPlace() {
    [].forEach.call(document.querySelectorAll('.pitem'), function (d) {
      var on = !!S.place && ((S.place.chip && d.dataset.chip === S.place.chip) ||
                             (!S.place.chip && d.dataset.kind === S.place.kind));
      d.classList.toggle('on', on);
    });
  }

  /* ---------------- 部品の操作 ---------------- */

  function addPartAt(kind, chip, wx, wy) {
    snapshot();
    var s = kind === 'chip' ? sizeOf({ kind: 'chip', chip: chip }, S.lib) : GEO[kind];
    var p = N.addPart(S.circuit, kind, snap(wx - s.w / 2), snap(wy - s.h / 2), { chip: chip });
    rebuild();
    return p;
  }

  function deleteSelection() {
    var ids = Object.keys(S.sel.parts), wids = Object.keys(S.sel.wires);
    if (!ids.length && !wids.length) return;
    snapshot();
    wids.forEach(function (w) { N.disconnect(S.circuit, +w); });
    ids.forEach(function (i) { N.removePart(S.circuit, +i); });
    S.sel = { parts: {}, wires: {} };
    rebuild();
    say('消した');
  }

  /* 盤面を整える。選んでいるものが2つ以上あればその中だけ、なければ全体。
   *
   * 位置は回路の意味に関わらないので rebuild() は呼ばない。呼ぶとシミュレータが
   * 作り直されて、ラッチが覚えていた値まで消える（整えただけで記憶が飛ぶのは嘘）。 */
  function doArrange() {
    var ids = Object.keys(S.sel.parts).filter(function (i) { return S.circuit.parts[i]; });
    var part = ids.length >= 2;
    var r = LAY.arrange(S.circuit, S.lib, { sizeOf: sizeOf, portXY: portXY }, part ? { ids: ids } : null);
    if (!r) {
      return say(ids.length === 1 ? '1つだけ選んでいると整えようがない。選択を解くと盤面ぜんぶを整える'
                                  : '盤面に部品が足りない');
    }
    snapshot();
    var id;
    for (id in r.parts) { S.circuit.parts[id].x = r.parts[id].x; S.circuit.parts[id].y = r.parts[id].y; }
    /* 覚えていた古い通り道は捨ててから入れ直す（残しておくと、整え直したのに
     * 前の道のままの線が混ざる） */
    for (id in S.circuit.wires) {
      var w = S.circuit.wires[id];
      if (!r.parts[w.from.part] || !r.parts[w.to.part]) continue;
      if (r.wires[id]) w.pts = r.wires[id]; else delete w.pts;
    }
    scheduleSave();
    say((part ? '選んだ ' + ids.length + ' 個を整えた' : '盤面を整えた') + '（Ctrl+Z で元に戻せる）');
  }

  /* ---------------- チップの上書き保存 ---------------- */

  /* 「作業台に取り出す」で開いたチップを覚えておき、そのまま上書きできるようにする。
   * 毎回「チップにする」→名前を打ち直す、をやらせないため。
   * 名前を打ち直させる方式だと、打ち間違えて別のチップが増えていることに気づかない */
  function setEditing(name) {
    S.editing = name || null;
    if (!el.btnSaveChip) return;
    el.btnSaveChip.classList.toggle('hidden', !S.editing);
    el.btnSaveChip.textContent = S.editing ? '「' + S.editing + '」 を上書き保存' : '上書き保存';
    el.btnSaveChip.title = S.editing
      ? 'Ctrl+S。このチップを使っている回路すべてが、新しい中身に入れ替わる' : '';
  }

  function saveChip() {
    if (!S.editing) return say('上書きするチップがない。「チップにする」で名前を付けて登録する');
    var name = S.editing;
    var made = L.makeChip(name, S.circuit, S.lib);
    if (made.error) return say(made.error);
    snapshot();
    S.lib[name] = made.chip;
    var users = L.dependents(S.lib, name);
    buildPalette();
    rebuild();
    var g = T.gateCount(S.lib[name].circuit, S.lib);
    say('「' + name + '」 を上書きした ― NAND ' + g.nand + '個'
      + (users.length ? '。' + users.join('・') + ' も新しい中身に入れ替わった' : ''));
  }

  function clearSel() { S.sel = { parts: {}, wires: {} }; }

  /* ---------------- マウス ---------------- */

  function bindEvents() {
    cv.addEventListener('mousedown', onDown);
    global.addEventListener('mousemove', onMove);
    global.addEventListener('mouseup', onUp);
    cv.addEventListener('dblclick', onDbl);
    cv.addEventListener('contextmenu', onContext);
    cv.addEventListener('wheel', onWheel, { passive: false });
    global.addEventListener('keydown', onKey);
    global.addEventListener('resize', resize);

    el.btnRun.onclick = function () {
      S.running = !S.running;
      syncRunButton();
      say(S.running ? '時間を流している' : '時間を止めた。1歩ずつ進めて伝播を追える');
    };
    el.btnStep.onclick = function () { if (!S.sim) return; S.sim.step(); S.running = false; syncRunButton(); };
    el.btnReset.onclick = function () { if (S.sim) { S.sim.reset(); say('全部を未定に戻した'); } };
    el.clockSpeed.oninput = function () { S.clockDiv = 61 - (+el.clockSpeed.value); };
    S.clockDiv = 61 - (+el.clockSpeed.value);

    el.btnTruth.onclick = showTruth;
    el.btnExpr.onclick = showExpr;
    el.btnSlim.onclick = showSlim;
    el.btnChip.onclick = askChipName;
    el.btnTidy.onclick = doArrange;
    el.btnPath.onclick = showPath;
    el.btnSaveChip.onclick = saveChip;
    el.btnNew.onclick = askClear;
    el.btnExport.onclick = showExport;
    el.btnImport.onclick = showImport;
    el.btnGrade.onclick = doGrade;
    el.btnAnswer.onclick = openAnswer;
    el.peekClose.onclick = function () { closePeek(); };
    el.peekEdit.onclick = function () { var nm = S.peek && S.peek.chip; closePeek(); if (nm) openChipForEdit(nm); };
    el.peekVolt.onclick = function () {
      if (!S.peek || S.peek.kind !== 'mos') return;
      S.peek.volt = !S.peek.volt;
      el.peekVolt.textContent = S.peek.volt ? '0 / 1 で見る' : '電圧で見る';
      say(S.peek.volt ? '0 と 1 は、この坂をしきい値で切っただけのもの。盤面の入力を切り替えると点が動く'
                      : 'スイッチの絵に戻した');
    };
    el.overlay.onclick = function (e) { if (e.target === el.overlay) closeModal(); };
    syncRunButton();
  }

  /* ボタンには「今このボタンを押すと何が起きるか」を書く。今の状態ではなく */
  function syncRunButton() {
    el.btnRun.textContent = S.running ? '⏸ 止める' : '▶ 動かす';
    el.btnRun.classList.toggle('on', !S.running);
  }

  function onDown(e) {
    if (e.button === 1) {                        /* 中ボタンで画面を掴んで動かす */
      S.act = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: S.view.ox, oy: S.view.oy };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    var w = toWorld(e, S.view);

    if (S.place) {
      var p = addPartAt(S.place.kind, S.place.chip, w.x, w.y);
      clearSel();
      S.sel.parts[p.id] = true;
      if (!e.shiftKey) { S.place = null; markPlace(); }
      return;
    }

    var port = portAt(S.circuit, w.x, w.y);
    if (port) {
      if (port.side === 'out') {
        S.act = { type: 'wire', from: { part: port.part, port: port.port }, cur: w };
      } else {
        /* 入力の丸を掴んだら、既にある線を外して繋ぎ直す */
        var ex = N.wireAtInput(S.circuit, port.part.id, port.port);
        if (ex) {
          snapshot();
          var src = S.circuit.parts[ex.from.part], sp = ex.from.port;
          N.disconnect(S.circuit, ex.id);
          rebuild();
          S.act = { type: 'wire', from: { part: src, port: sp }, cur: w };
        }
      }
      return;
    }

    var part = partAt(S.circuit, w.x, w.y);
    if (part) {
      if (!S.sel.parts[part.id]) {
        if (!e.shiftKey) clearSel();
        S.sel.parts[part.id] = true;
      }
      var ids = Object.keys(S.sel.parts);
      S.act = {
        type: 'drag', moved: false, hit: part,
        start: w,
        base: ids.map(function (i) { return { p: S.circuit.parts[i], x: S.circuit.parts[i].x, y: S.circuit.parts[i].y }; })
      };
      return;
    }

    var wire = wireAt(S.circuit, w.x, w.y);
    if (wire) {
      if (!e.shiftKey) clearSel();
      S.sel.wires[wire.id] = true;
      return;
    }

    if (!e.shiftKey) clearSel();
    S.act = { type: 'rect', x0: w.x, y0: w.y, x1: w.x, y1: w.y };
  }

  function onMove(e) {
    var a = S.act;
    if (!a) return;
    if (a.type === 'pan') {
      S.view.ox = a.ox + (e.clientX - a.sx);
      S.view.oy = a.oy + (e.clientY - a.sy);
      return;
    }
    var w = toWorld(e, S.view);
    if (a.type === 'wire') { a.cur = w; return; }
    if (a.type === 'rect') { a.x1 = w.x; a.y1 = w.y; return; }
    if (a.type === 'drag') {
      var dx = w.x - a.start.x, dy = w.y - a.start.y;
      if (!a.moved && Math.hypot(dx, dy) > 3) { a.moved = true; snapshot(); }
      if (!a.moved) return;
      a.base.forEach(function (b) { b.p.x = snap(b.x + dx); b.p.y = snap(b.y + dy); });
    }
  }

  function onUp(e) {
    var a = S.act;
    S.act = null;
    if (!a) return;

    if (a.type === 'wire') {
      var w = toWorld(e, S.view);
      var port = portAt(S.circuit, w.x, w.y);
      if (port && port.side === 'in') {
        snapshot();
        if (N.connect(S.circuit, a.from.part.id, a.from.port, port.part.id, port.port, S.lib)) rebuild();
        else say('そこには繋げない');
      } else if (port && port.side === 'out') {
        say('配線は「出力の丸 → 入力の丸」の向きに引く');
      } else {
        rebuild();      /* 繋ぎ直しを途中でやめた場合、外したままを確定させる */
      }
      return;
    }

    if (a.type === 'rect') {
      var x0 = Math.min(a.x0, a.x1), x1 = Math.max(a.x0, a.x1);
      var y0 = Math.min(a.y0, a.y1), y1 = Math.max(a.y0, a.y1);
      if (Math.abs(x1 - x0) > 3 || Math.abs(y1 - y0) > 3) {
        for (var id in S.circuit.parts) {
          var p = S.circuit.parts[id], s = sizeOf(p, S.lib);
          if (p.x + s.w > x0 && p.x < x1 && p.y + s.h > y0 && p.y < y1) S.sel.parts[id] = true;
        }
      }
      return;
    }

    if (a.type === 'drag') {
      if (a.moved) { rebuild(); return; }
      /* 動かさずに離した＝クリック。スイッチと定数はここで切り替える */
      var p2 = a.hit;
      if (p2.kind === 'in') {
        snapshot();
        p2.value = p2.value ? 0 : 1;
        if (S.sim) S.sim.setInput(p2.name, p2.value);
        scheduleSave();
        if (!S.running) say('止まっているので、値はまだ広がらない。Space で1歩');
      } else if (p2.kind === 'const') {
        snapshot();
        p2.value = p2.value ? 0 : 1;
        rebuild();
      }
    }
  }

  /* ダブルクリックで名前を変えるのはやめた。入力スイッチはクリックで 0/1 が
   * 切り替わるので、かちゃかちゃ切り替えているだけで名前の窓が開いてしまう。
   * 名前は F2（か Enter）。ここでは、その場で「どうすれば変えられるか」だけ言う。 */
  function onDbl(e) {
    var w = toWorld(e, S.view);
    var p = partAt(S.circuit, w.x, w.y);
    if (!p) return;
    if (p.kind === 'chip') { openPeek(p); return; }
    if (p.kind === 'nand') { openMos(p); return; }
    if (p.kind === 'ram16') { showRamCells(p); return; }
    if (p.kind === 'in' || p.kind === 'out') say('名前を変えるには、選んでから F2');
  }

  /** RAM16 の16セルをステータス行に出す。X＝まだ書かれていない（読めない） */
  function showRamCells(p) {
    var gi = S.flat && S.flat.byPath[String(p.id)];
    var m = (gi !== undefined && S.sim && S.sim.mem) ? S.sim.mem[gi] : null;
    if (!m) { say('RAM16 の中身がまだ読めない（回路を組み直した直後かもしれない）'); return; }
    var cells = [];
    for (var k = 0; k < 16; k++) cells.push(k + ':' + SIM.show(m.cells[k]));
    say('RAM16 の中身 ― ' + cells.join(' '));
  }

  /** 選んでいるものの名前を変える（F2 / Enter）。入力・出力のほか、配線にも付けられる */
  function renameSelected() {
    var ids = Object.keys(S.sel.parts).filter(function (i) { return S.circuit.parts[i]; });
    var wids = Object.keys(S.sel.wires).filter(function (i) { return S.circuit.wires[i]; });
    if (!ids.length && wids.length === 1) return renameWire(S.circuit.wires[wids[0]]);
    if (ids.length !== 1) return say('名前を変えたい入力・出力・配線を1つだけ選んで F2');
    var p = S.circuit.parts[ids[0]];
    if (p.kind !== 'in' && p.kind !== 'out') return say('名前が付けられるのは入力・出力・配線');
    renamePart(p);
  }

  /* 配線の名前。回路の意味は何も変わらない ― 読む人（自分）のための札。
   * 名前を付けたい線は、たいてい「あとで自分が探す線」（桁上がり、書き込み許可、クロック）。
   * 端子と違って重複を禁じないのは、同じ信号から分かれた枝に同じ名前を付けたいから */
  function renameWire(w) {
    dialog({
      title: '配線に名前を付ける',
      hint: N.labelOf(S.circuit.parts[w.from.part]) + ' → ' + N.labelOf(S.circuit.parts[w.to.part])
          + '\n空にすると名前を消す。回路の動きは変わらない。',
      input: { value: w.name || '', placeholder: '例: 桁上がり / C / W' },
      ok: '付ける',
      onOk: function (name) {
        snapshot();
        name = String(name).trim();
        if (name) w.name = name; else delete w.name;
        scheduleSave();
        say(name ? '配線に 「' + name + '」 と名前を付けた' : '配線の名前を消した');
        return true;
      }
    });
  }

  function onContext(e) {
    e.preventDefault();
    var w = toWorld(e, S.view);
    if (S.place) { S.place = null; markPlace(); return; }
    var p = partAt(S.circuit, w.x, w.y);
    if (p) { clearSel(); S.sel.parts[p.id] = true; deleteSelection(); return; }
    var wire = wireAt(S.circuit, w.x, w.y);
    if (wire) { snapshot(); N.disconnect(S.circuit, wire.id); rebuild(); say('配線を消した'); }
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      var r = cv.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var before = { x: (mx - S.view.ox) / S.view.s, y: (my - S.view.oy) / S.view.s };
      var k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      S.view.s = Math.max(.35, Math.min(2.6, S.view.s * k));
      S.view.ox = mx - before.x * S.view.s;
      S.view.oy = my - before.y * S.view.s;
    } else if (e.shiftKey) {
      S.view.ox -= e.deltaY;
    } else {
      S.view.oy -= e.deltaY;
      S.view.ox -= e.deltaX;
    }
  }

  function onKey(e) {
    if (/input|textarea/i.test((e.target.tagName || ''))) return;
    if (!el.overlay.classList.contains('hidden')) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    var ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); saveChip(); return; }
    if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      for (var id in S.circuit.parts) S.sel.parts[id] = true;
      return;
    }
    switch (e.key) {
      case 'Delete': case 'Backspace': e.preventDefault(); deleteSelection(); break;
      case 'Escape':
        if (S.peek) { closePeek(); }
        else if (S.place) { S.place = null; markPlace(); }
        else clearSel();
        break;
      case ' ': e.preventDefault(); el.btnStep.onclick(); break;
      case 'r': case 'R': el.btnReset.onclick(); break;
      case 'n': case 'N': setPlace({ kind: 'nand' }); break;
      case 'i': case 'I': setPlace({ kind: 'in' }); break;
      case 'o': case 'O': setPlace({ kind: 'out' }); break;
      case 'c': case 'C': setPlace({ kind: 'const' }); break;
      case 'k': case 'K': setPlace({ kind: 'clock' }); break;
      case 'l': case 'L': doArrange(); break;
      case 'v': case 'V':
        S.showBus = !S.showBus;
        say(S.showBus ? '束を数として表示する' : '数の表示を消した');
        break;
      case 'F2': case 'Enter': e.preventDefault(); renameSelected(); break;
    }
  }

  /* ---------------- チップの中を覗く ---------------- */

  function openPeek(part) {
    var def = S.lib[part.chip];
    if (!def) return say('チップ 「' + part.chip + '」 が見つからない');
    S.peek = { kind: 'chip', chip: part.chip, def: def, prefix: part.id + '/', view: { ox: 0, oy: 0, s: 1 } };
    el.peekName.textContent = part.chip + '　― 中身（値は今そこに来ているもの）';
    el.peek.classList.remove('hidden');
    el.peek.classList.remove('small');
    el.peekEdit.classList.remove('hidden');
    fit(pcv, pctx);
    fitView(S.peek.view, def.circuit, pcv.getBoundingClientRect());
  }

  function fitView(view, circuit, rect, lib) {
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, any = false;
    for (var id in circuit.parts) {
      var p = circuit.parts[id], s = sizeOf(p, lib || S.lib);
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + s.w); maxY = Math.max(maxY, p.y + s.h);
      any = true;
    }
    if (!any) { view.ox = 20; view.oy = 20; view.s = 1; return; }
    var pad = 30;
    var sx = (rect.width - pad * 2) / Math.max(1, maxX - minX);
    var sy = (rect.height - pad * 2) / Math.max(1, maxY - minY);
    view.s = Math.max(.35, Math.min(1.6, Math.min(sx, sy)));
    view.ox = pad - minX * view.s + Math.max(0, (rect.width - pad * 2 - (maxX - minX) * view.s) / 2);
    view.oy = pad - minY * view.s + Math.max(0, (rect.height - pad * 2 - (maxY - minY) * view.s) / 2);
  }

  /* ---------------- NAND の中身（物理層） ---------------- */

  /* NAND をダブルクリックすると、その NAND の中身をトランジスタで見せる。
   * 値は「今その素子に来ているもの」。盤面のスイッチを切り替えると、
   * ここのトランジスタが開け閉めされる ― 説明を読むより速い。
   * 窓を小さくしてあるのは、盤面のスイッチを触りながら見るため。 */
  function openMos(part) {
    S.peek = { kind: 'mos', part: part, prefix: '', volt: false };
    el.peekName.textContent = 'NAND の中身　― トランジスタ4個でできている';
    el.peek.classList.remove('hidden');
    el.peek.classList.add('small');
    el.peekEdit.classList.add('hidden');
    el.peekVolt.textContent = '電圧で見る';
    fit(pcv, pctx);
    say('盤面の入力を切り替えると、中のトランジスタが開け閉めされる');
  }

  /* 【この絵で伝えたいこと】
   *   1. トランジスタは3本足のスイッチで、ゲート（横から来る棒）で開け閉めされる
   *   2. どこが入力か  ― A と B は左右の端から入り、ゲートにだけ繋がる
   *   3. どこが同じ電位か ― 繋がっている線は1本の太線として、その電位の色で描く
   *
   * 色の役割を2つに分けてある。混ぜると読めない:
   *   線の色   = その節点の電位（1 は緑 / 0 は青 / 未定は灰）＝ 盤面と同じ約束
   *   縦棒の色 = そのトランジスタが通っているか（黄＝通っている / 沈んだ色＝切れている）
   */
  var MOS_W = 560, MOS_H = 470;

  /* 節点（同じ電位で繋がっている一続きの線）ごとの色。盤面の信号色と同じものを使う */
  function netColor(v) { return v === 1 ? '#35e0c8' : v === 0 ? '#4a6b91' : '#6b7688'; }

  function drawMos(c2, rect) {
    var M = NL.mos;
    var p = S.peek.part;
    var a = inValueOf('', S.circuit, p, 0), b = inValueOf('', S.circuit, p, 1);
    var m = M.nand(a, b);
    var s = Math.min(rect.width / MOS_W, rect.height / MOS_H);

    c2.save();
    c2.translate((rect.width - MOS_W * s) / 2, (rect.height - MOS_H * s) / 2);
    c2.scale(s, s);

    function line(x1, y1, x2, y2, col, w) {
      c2.strokeStyle = col; c2.lineWidth = w || 2; c2.lineCap = 'round';
      c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke();
    }
    function text(t, x, y, col, size, align) {
      c2.fillStyle = col; c2.textAlign = align || 'center'; c2.textBaseline = 'middle';
      c2.font = (size || 12) + 'px "Yu Gothic UI", Meiryo, system-ui, sans-serif';
      c2.fillText(t, x, y);
    }
    function chanColor(st) {
      return st === M.ON ? '#ffcc5c' : st === M.OFF ? '#33445c' : '#6b7688';
    }

    /* トランジスタ1つ。
     * 縦の太い棒が通り道（ドレイン―ソース）、その脇の細い棒がゲート。
     * 間の隙間が「ゲートは通り道に直接くっついていない」ことを表している（それが MOS）。
     * p 型はゲートに丸を付ける ― 0 で効く、の印。 */
    function mosfet(x, cy, side, st, kind, label, lx, ly) {
      var half = 19, gx = x + side * 10, bx = gx + side * 7;
      line(x, cy - half, x, cy + half, chanColor(st), 6);          /* 通り道 */
      line(gx, cy - half, gx, cy + half, '#c7d4e4', 2.5);          /* ゲートの板 */
      if (kind === 'p') {
        c2.beginPath();
        c2.arc(bx, cy, 4.5, 0, Math.PI * 2);
        c2.fillStyle = '#0f1218'; c2.fill();
        c2.strokeStyle = '#c7d4e4'; c2.lineWidth = 2; c2.stroke();
        bx += side * 4.5;                                          /* 丸の外側で線を止める */
      }
      /* 名札の場所は呼ぶ側が決める。近くに寄せると、どれの札か分かる代わりに線と重なる */
      text(kind + '型（' + label + '）', lx, ly - 9, '#8492a6', 11);
      text(st === M.ON ? '通じている' : st === M.OFF ? '切れている' : 'どちらとも言えない',
        lx, ly + 9, chanColor(st), 11);
      return bx;                                                   /* ゲートの線を繋ぐ端 */
    }

    /* 入力の札。盤面のスイッチと同じ見た目にして「これが入力」と分かるように */
    function pill(cx, cy, name, v) {
      var w = 74, h = 34;
      c2.fillStyle = '#1a1f27';
      c2.strokeStyle = v === 1 ? '#35e0c8' : '#3a4759';
      c2.lineWidth = 2;
      roundRect(c2, cx - w / 2, cy - h / 2, w, h, 8);
      c2.fill(); c2.stroke();
      text(name, cx - 14, cy, '#d7dee8', 14);
      text(SIM.show(v), cx + 16, cy, sigColor(v, false), 17);
    }

    /* ---- 節点の電位 ---- */
    var vdd = 1, gnd = 0;
    var mid = m.n[1] === M.ON ? 0 : X;      /* n どうしの間。下が切れていれば宙に浮く */

    text(M.FACTS[0], MOS_W / 2, 22, '#8492a6', 11);

    /* ---- 電源と地面のレール ---- */
    line(170, 70, 350, 70, netColor(vdd), 3);
    text('電源', 160, 62, '#8492a6', 11, 'right');
    text('1', 160, 79, netColor(vdd), 14, 'right');
    line(170, 350, 350, 350, netColor(gnd), 3);
    text('地面', 160, 342, '#8492a6', 11, 'right');
    text('0', 160, 359, netColor(gnd), 14, 'right');

    /* ---- 上段: p 型2つを並べる（並列）---- */
    var pA = mosfet(200, 121, -1, m.p[0], 'p', 'A', 108, 90);
    var pB = mosfet(320, 121, 1, m.p[1], 'p', 'B', 412, 90);
    line(200, 70, 200, 102, netColor(vdd), 3);       /* 電源からの足 */
    line(320, 70, 320, 102, netColor(vdd), 3);

    /* ---- Y の節点（p の足元・合流点・n の頭・出口が全部ひと続き）---- */
    var yc = netColor(m.y);
    line(200, 140, 200, 172, yc, 3);
    line(320, 140, 320, 172, yc, 3);
    line(200, 172, 380, 172, yc, 3);                 /* 合流してそのまま出口へ */
    line(260, 172, 260, 198, yc, 3);
    c2.beginPath(); c2.arc(260, 172, 4, 0, Math.PI * 2); c2.fillStyle = yc; c2.fill();
    c2.beginPath(); c2.arc(380, 172, 4, 0, Math.PI * 2); c2.fillStyle = yc; c2.fill();
    text('Y = ' + SIM.show(m.y), 368, 151, yc, 14);

    /* ---- 下段: n 型2つを縦に積む（直列）---- */
    var nA = mosfet(260, 217, -1, m.n[0], 'n', 'A', 342, 217);
    var nB = mosfet(260, 283, 1, m.n[1], 'n', 'B', 150, 283);
    line(260, 236, 260, 264, netColor(mid), 3);      /* n どうしの間 */
    text(mid === X ? '宙に浮いている' : '地面と同じ 0', 285, 250, netColor(mid), 11, 'left');
    line(260, 302, 260, 350, netColor(gnd), 3);      /* 地面へ */

    /* ---- 入力 A（左）と B（右）。ゲートにだけ繋がる ---- */
    var ac = sigColor(a, false), bc = sigColor(b, false);
    pill(70, 217, 'A', a);
    line(107, 217, 140, 217, ac, 2.5);
    line(140, 121, 140, 217, ac, 2.5);
    line(140, 121, pA, 121, ac, 2.5);
    line(140, 217, nA, 217, ac, 2.5);
    c2.beginPath(); c2.arc(140, 217, 3.5, 0, Math.PI * 2); c2.fillStyle = ac; c2.fill();

    pill(490, 217, 'B', b);
    line(453, 217, 420, 217, bc, 2.5);
    line(420, 121, 420, 283, bc, 2.5);
    line(420, 121, pB, 121, bc, 2.5);
    line(420, 283, nB, 283, bc, 2.5);
    c2.beginPath(); c2.arc(420, 217, 3.5, 0, Math.PI * 2); c2.fillStyle = bc; c2.fill();

    text('入力', 70, 190, '#8492a6', 11);
    text('入力', 490, 190, '#8492a6', 11);
    text('ゲートにだけ繋がる。通り道には触れていない', MOS_W / 2, 382, '#7f93ab', 11);

    /* ---- いま起きていること ---- */
    text(m.story[0], MOS_W / 2, 410, '#d7dee8', 12);
    text(m.story[1], MOS_W / 2, 430, '#8492a6', 12);
    text('太い線は繋がっていて同じ電位（緑=1 / 青=0 / 灰=未定）。黄色い縦棒は通じているトランジスタ。',
      MOS_W / 2, 456, '#6b7688', 10.5);

    c2.restore();
  }

  /* 0 と 1 の下にある連続量（analog.js）。
   * 同じ NAND を、スイッチの絵ではなく「入力 A の電圧 → 出力の電圧」の坂で見せる。
   * 盤面の A・B は 0 → 0V、1 → 電源 に置き換えて、今どこに居るかを点で出す。
   * X は坂の途中の電圧のことなので、点は打たない（どこか決められない）。 */
  function drawAnalog(c2, rect) {
    var A = NL.analog;
    if (!A) return drawMos(c2, rect);
    var p = S.peek.part;
    var a = inValueOf('', S.circuit, p, 0), b = inValueOf('', S.circuit, p, 1);
    var s = Math.min(rect.width / MOS_W, rect.height / MOS_H);
    var VDD = A.VDD;

    c2.save();
    c2.translate((rect.width - MOS_W * s) / 2, (rect.height - MOS_H * s) / 2);
    c2.scale(s, s);

    function line(x1, y1, x2, y2, col, w, dash) {
      c2.strokeStyle = col; c2.lineWidth = w || 2; c2.lineCap = 'round';
      c2.setLineDash(dash || []);
      c2.beginPath(); c2.moveTo(x1, y1); c2.lineTo(x2, y2); c2.stroke();
      c2.setLineDash([]);
    }
    function text(t, x, y, col, size, align) {
      c2.fillStyle = col; c2.textAlign = align || 'center'; c2.textBaseline = 'middle';
      c2.font = (size || 12) + 'px "Yu Gothic UI", Meiryo, system-ui, sans-serif';
      c2.fillText(t, x, y);
    }

    /* B は「もう片方の入力」。X なら 1 として坂を描き、そのことを書く */
    var vb = b === 0 ? 0 : VDD;
    var cur = A.curve(vb, 110), m = A.margins(vb);

    var gx = 70, gy = 62, gw = 440, gh = 250;
    function PX(v) { return gx + v / VDD * gw; }
    function PY(v) { return gy + gh - v / VDD * gh; }

    text(A.FACTS[0], MOS_W / 2, 22, '#8492a6', 11);
    text('もう片方の入力 B = ' + (b === X ? 'X（1 として描いている）' : SIM.show(b) + '（' + A.volts(vb) + '）'),
      MOS_W / 2, 42, sigColor(b, false), 11.5);

    /* 枠と目盛り */
    c2.strokeStyle = '#3a4759'; c2.lineWidth = 1; c2.strokeRect(gx, gy, gw, gh);
    var v;
    for (v = 0; v <= VDD + 1e-9; v += 1) {
      line(PX(v), gy + gh, PX(v), gy + gh + 4, '#3a4759', 1);
      text(v.toFixed(0) + 'V', PX(v), gy + gh + 14, '#6b7688', 10.5);
      line(gx - 4, PY(v), gx, PY(v), '#3a4759', 1);
      text(v.toFixed(0) + 'V', gx - 8, PY(v), '#6b7688', 10.5, 'right');
    }
    text('入力 A の電圧', MOS_W / 2, gy + gh + 30, '#8492a6', 11);
    text('出力 Y', gx - 8, gy - 12, '#8492a6', 11, 'right');

    /* 坂の途中 ― どちらとも言えない電圧。3値の X が居る場所 */
    if (m) {
      c2.fillStyle = 'rgba(107,118,136,.22)';
      c2.fillRect(PX(m.vil), gy, PX(m.vih) - PX(m.vil), gh);
      text('X の居場所', (PX(m.vil) + PX(m.vih)) / 2, gy + 12, '#8492a6', 10.5);
      /* 0 と読める範囲・1 と読める範囲 */
      line(gx, PY(m.vol), PX(m.vih), PY(m.vol), netColor(0), 1, [4, 4]);
      line(PX(m.vil), PY(m.voh), gx + gw, PY(m.voh), netColor(1), 1, [4, 4]);
      text('0 と読める上限 ' + A.volts(m.vil), PX(m.vil) - 6, PY(0.35), netColor(0), 10.5, 'right');
      text('1 と読める下限 ' + A.volts(m.vih), PX(m.vih) + 6, PY(VDD - 0.35), netColor(1), 10.5, 'left');
    }

    /* 坂 */
    c2.strokeStyle = '#c7d4e4'; c2.lineWidth = 2.5; c2.lineJoin = 'round';
    c2.beginPath();
    var i;
    for (i = 0; i < cur.length; i++) {
      if (i) c2.lineTo(PX(cur[i].va), PY(cur[i].vout)); else c2.moveTo(PX(cur[i].va), PY(cur[i].vout));
    }
    c2.stroke();

    /* 今どこに居るか */
    var story;
    if (a === X) {
      story = ['A が X ― 坂の途中のどこかに居て、電圧を決められない。', '点は打たない。0 で埋めると、この絵は嘘になる。'];
    } else {
      var va = a === 1 ? VDD : 0;
      var sol = A.solve(va, vb);
      var d = A.asDigit(sol.vout, m);
      var col = sigColor(d === null ? X : d, false);
      line(PX(va), gy + gh, PX(va), PY(sol.vout), col, 1, [3, 4]);
      line(gx, PY(sol.vout), PX(va), PY(sol.vout), col, 1, [3, 4]);
      c2.beginPath(); c2.arc(PX(va), PY(sol.vout), 6, 0, Math.PI * 2); c2.fillStyle = col; c2.fill();
      /* 札は点の反対側へ。A=0 の点は左上に居るので右下へ、A=1 の点は右下に居るので左上へ（軸の目盛りと重ねない） */
      text('A = ' + SIM.show(a) + '（' + A.volts(va) + '） → Y = ' + A.volts(sol.vout) + ' ＝ ' + (d === null ? 'X' : d),
        PX(va) + (a === 1 ? -12 : 12), PY(sol.vout) + (a === 1 ? -16 : 16), col, 12, a === 1 ? 'right' : 'left');
      story = [
        (a === 1 && b !== 0) ? '下の n が2つとも通じて、Y は地面へ引き下げられている。'
                             : '上の p のどちらかが通じて、Y は電源へ引き上げられている。',
        'p(A) ' + A.REGION_NAME[sol.region.pa] + ' · p(B) ' + A.REGION_NAME[sol.region.pb]
          + ' · n(A) ' + A.REGION_NAME[sol.region.na] + ' · n(B) ' + A.REGION_NAME[sol.region.nb]
          + (b !== 0 ? '　n の間の電圧 ' + A.volts(sol.vmid) : '')
      ];
    }

    /* 雑音余裕 ― これだけ汚れても次の段は読み違えない */
    if (m) {
      text('雑音余裕　0 側 ' + A.volts(m.nml) + ' ／ 1 側 ' + A.volts(m.nmh)
        + '　（坂の利得が 1 を超えるから、汚れは押し戻される）', MOS_W / 2, 356, '#d7dee8', 11.5);
    }
    text(story[0], MOS_W / 2, 386, '#d7dee8', 12);
    text(story[1], MOS_W / 2, 406, '#8492a6', 11.5);
    text(A.FACTS[2], MOS_W / 2, 436, '#6b7688', 10.5);
    text('二乗則の一番素朴なモデル。n と p は同じ強さ、しきい値 ' + A.volts(A.VTH) + '、電源 ' + A.volts(VDD),
      MOS_W / 2, 456, '#6b7688', 10.5);

    c2.restore();
  }

  /* お手本を見る。見るだけで、作業台には触らない。
   * お手本の実体は src/answer.js にあり、検査（tests/quest.js）が採点を通ることを
   * 確かめているものと同じ。画面用に別に持つと、通っていないお手本を見せてしまう */
  function openAnswer() {
    var q = Q.BY_ID[S.questId];
    if (!q) return;
    confirmBox('「' + q.name + '」 のお手本を見る',
      '先に自分で組んでみるほうが、身につく。それでも見る？\n'
      + '（見るだけ。今の作業台はそのまま残る）',
      function () {
        var r = NL.answer.build(q.id);
        if (!r) return say('この課題のお手本が見つからない');

        /* お手本は組んだ順に置いてあるだけなので、見せる前に整える */
        var got = LAY.arrange(r.circuit, r.lib, { sizeOf: sizeOf, portXY: portXY }, null);
        if (got) {
          var id;
          for (id in got.parts) { r.circuit.parts[id].x = got.parts[id].x; r.circuit.parts[id].y = got.parts[id].y; }
          for (id in got.wires) r.circuit.wires[id].pts = got.wires[id];
        }
        var sim = new SIM.Sim(L.flatten(r.circuit, r.lib));
        sim.settle();

        S.peek = { kind: 'answer', circuit: r.circuit, lib: r.lib, sim: sim, view: { ox: 0, oy: 0, s: 1 } };
        el.peekName.textContent = q.name + ' のお手本　― NAND ' + q.goal + '個'
          + (r.uses.length ? '（' + r.uses.join('・') + ' を使っている）' : '（NAND だけで組んである）');
        el.peek.classList.remove('hidden');
        el.peek.classList.remove('small');
        el.peekEdit.classList.add('hidden');
        fit(pcv, pctx);
        fitView(S.peek.view, r.circuit, pcv.getBoundingClientRect(), r.lib);
        say('お手本を出した。同じ形にする必要はない ― 通ればどう組んでもよい');
      });
  }

  function closePeek() {
    S.peek = null;
    el.peek.classList.add('hidden');
    el.peek.classList.remove('small');
    el.peekEdit.classList.remove('hidden');
    el.peekVolt.classList.add('hidden');
  }

  function renderPeek() {
    var r = pcv.getBoundingClientRect();
    if (Math.abs(r.width - pcv.width / (global.devicePixelRatio || 1)) > 1) fit(pcv, pctx);
    pctx.save();
    pctx.fillStyle = '#0f1218';
    pctx.fillRect(0, 0, r.width, r.height);
    /* 「電圧で見る」は NAND の中身のときだけ意味がある */
    el.peekVolt.classList.toggle('hidden', S.peek.kind !== 'mos');
    if (S.peek.kind === 'mos') {
      if (S.peek.volt) drawAnalog(pctx, r); else drawMos(pctx, r);
    } else if (S.peek.kind === 'answer') {
      /* お手本は、盤面とは別の回路・別のチップ束・別のシミュレータで動いている。
       * 描く関数は「今の状態」を見に行くので、描くあいだだけ差し替える。
       * 描画をもう一組作るより、ここで貸し借りするほうが嘘が入らない */
      var keepSim = S.sim, keepLib = S.lib, keepSel = S.sel;
      S.sim = S.peek.sim; S.lib = S.peek.lib; S.sel = { parts: {}, wires: {} };
      pctx.translate(S.peek.view.ox, S.peek.view.oy);
      pctx.scale(S.peek.view.s, S.peek.view.s);
      drawCircuit(pctx, S.peek.circuit, '', true);
      S.sim = keepSim; S.lib = keepLib; S.sel = keepSel;
    } else {
      pctx.translate(S.peek.view.ox, S.peek.view.oy);
      pctx.scale(S.peek.view.s, S.peek.view.s);
      drawCircuit(pctx, S.peek.def.circuit, S.peek.prefix, true);
    }
    pctx.restore();
  }

  /* ---------------- チップにする ---------------- */

  function askChipName() {
    var ins = N.externalInputs(S.circuit).map(function (p) { return p.name; });
    var outs = N.externalOutputs(S.circuit).map(function (p) { return p.name; });
    if (!outs.length) return alertBox('チップにできない', '出力部品がありません。出力を1つ以上置いてください。');

    dialog({
      title: '今の回路をチップにする',
      hint: '入力 ' + (ins.join(', ') || 'なし') + '　→　出力 ' + outs.join(', ')
          + '\n同じ名前で登録し直すと、そのチップを使っている回路すべてが新しい中身に入れ替わる。',
      input: { value: '', placeholder: '例: XOR' },
      ok: '登録する',
      onOk: function (name, setMsg) {
        var made = L.makeChip(name, S.circuit, S.lib);
        if (made.error) { setMsg(made.error); return false; }
        snapshot();
        var exists = !!S.lib[made.chip.name];
        S.lib[made.chip.name] = made.chip;
        buildPalette();
        rebuild();
        /* 何の上に積み上がったのかを、登録した瞬間に見せる */
        var nm = made.chip.name, g = T.gateCount(S.lib[nm].circuit, S.lib), dep = L.depth(nm, S.lib);
        setEditing(nm);            /* 続けて直して Ctrl+S できるように */
        say('「' + nm + '」 を' + (exists ? '上書きした' : 'チップにした') + '　― ばらすと NAND '
          + g.nand + '個、NOT から数えて ' + dep + ' 段目');
        return true;
      }
    });
  }

  function removeChip(name) {
    var used = L.dependents(S.lib, name);
    if (L.usesChip(S.circuit, S.lib, name)) used.unshift('作業台の回路');
    if (used.length) {
      return alertBox('消せない', '「' + name + '」 は ' + used.join('・') + ' が使っています。先にそちらから外してください。');
    }
    confirmBox('「' + name + '」 を消す', 'このチップの定義を消します。元に戻すには Ctrl+Z。', function () {
      snapshot();
      delete S.lib[name];
      buildPalette();
      rebuild();
      say('「' + name + '」 を消した');
    });
  }

  function openChipForEdit(name) {
    var def = S.lib[name];
    if (!def) return;
    confirmBox('「' + name + '」 を作業台に取り出す',
      '今の作業台の回路は置き換わります（Ctrl+Z で戻せる）。\n'
      + '直したあと、同じ名前で「チップにする」と定義が更新されます。',
      function () {
        snapshot();
        S.circuit = N.clone(def.circuit);
        clearSel();
        setEditing(name);
        rebuild();
        say('「' + name + '」 の中身を作業台に出した。直したら 上書き保存（Ctrl+S）');
      });
  }

  function askClear() {
    confirmBox('作業台を消す', '今の回路を空にします。チップの定義は残ります。（Ctrl+Z で戻せる）', function () {
      snapshot();
      S.circuit = N.create();
      clearSel();
      setEditing(null);
      rebuild();
      say('作業台を空にした');
    });
  }

  function renamePart(p) {
    dialog({
      title: (p.kind === 'in' ? '入力' : '出力') + 'の名前',
      hint: '課題の採点はこの名前で照合します。端子の並び順も名前の順です。',
      input: { value: p.name },
      ok: '変更',
      onOk: function (name, setMsg) {
        name = name.trim();
        if (!name) { setMsg('名前を入れてください'); return false; }
        var dup = N.partsOfKind(S.circuit, p.kind).some(function (q) { return q !== p && q.name === name; });
        if (dup) { setMsg('同じ名前の' + (p.kind === 'in' ? '入力' : '出力') + 'がすでにあります'); return false; }
        snapshot();
        p.name = name;
        rebuild();
        return true;
      }
    });
  }

  /* ---------------- 真理値表 ---------------- */

  function showTruth() {
    var t = T.table(S.circuit, S.lib);
    if (t.error) return alertBox('真理値表', t.error);
    var html = '';
    if (t.sequential) {
      html += '<p class="hintline">この回路にはループ（フィードバック）があります。つまり順序回路で、'
            + '出力は「今の入力」だけでは決まりません。下の表は毎回リセットしてから測ったものなので、'
            + '記憶の様子は出てきません。X は「決まらない」という意味です。</p>';
    }
    html += '<div class="tt-scroll">' + tableHTML(t) + '</div>';
    dialog({ title: '真理値表　（NAND ' + T.gateCount(S.circuit, S.lib).nand + '個）', html: html, ok: null, cancel: '閉じる' });
  }

  /* ---------------- 小さくする ---------------- */

  /* 「NAND を減らすには」に、一般論ではなく今の回路を指さして答える。
   * 手がかりをクリックすると、その素子が盤面で選ばれる ―
   * 読んで終わりにせず、直す所まで連れて行くため */
  function showSlim() {
    var list = NL.slim.hints(S.circuit, S.lib);
    var q = Q.BY_ID[S.questId];
    var now = T.gateCount(S.circuit, S.lib);
    var can = list.reduce(function (a, h) { return a + h.save; }, 0);

    var html = '<p class="hintline">いまの回路は <b>NAND ' + now.nand + '個</b>'
      + (q ? '。この課題のお手本は ' + q.goal + '個' : '')
      + (can ? '。下の手がかりを全部片づけると <b>' + can + '個</b> 減る。' : '。') + '</p>';

    if (!list.length) {
      html += '<p class="hintline">機械に分かる無駄は見つからなかった。'
        + 'ここから先は下の考え方のほうで。</p>';
    } else {
      html += '<div class="slim-list">';
      list.forEach(function (h, i) {
        html += '<div class="slim" data-i="' + i + '">'
          + '<span class="save">−' + h.save + '</span>'
          + '<span class="t">' + esc(h.msg) + '</span></div>';
      });
      html += '</div><p class="hintline">手がかりをクリックすると、その素子を盤面で選ぶ。</p>';
    }

    html += '<h4>考え方</h4>';
    NL.slim.ADVICE.forEach(function (a) {
      html += '<div class="advice"><b>' + esc(a[0]) + '</b><span>' + esc(a[1]) + '</span></div>';
    });

    dialog({ title: '小さくする', html: html, ok: null, cancel: '閉じる' });
    [].forEach.call(document.querySelectorAll('.slim'), function (d) {
      d.onclick = function () {
        var h = list[+d.dataset.i];
        clearSel();
        h.parts.forEach(function (id) { if (S.circuit.parts[id]) S.sel.parts[id] = true; });
        closeModal();
        say(h.parts.length + ' 個を選んだ。― ' + h.msg);
      };
    });
  }

  /* ---------------- 論理式 ---------------- */

  function showExpr() {
    var r = EX.analyze(S.circuit, S.lib);
    if (r.error) return alertBox('論理式', r.error);

    if (r.sequential) {
      var n = r.loops.reduce(function (a, c) { return a + c.length; }, 0);
      return dialog({
        title: '論理式',
        html: '<p class="hintline">この回路にはループ（フィードバック）があります。'
            + '関わっている素子は ' + n + '個。<br><br>'
            + '順序回路の出力は「今の入力」だけでは決まりません。SR ラッチの Q は '
            + 'S と R の式では書けない（同じ入力に対して答えが2つある）ので、論理式にはなりません。'
            + '動きを見たいときは「止める」＋「1歩」で追ってください。</p>',
        ok: null, cancel: '閉じる'
      });
    }

    var h = '<p class="hintline">入力 ' + esc(r.vars.join('、') || 'なし')
          + '　／　NAND ' + S.nandCount + '個</p>';

    h += '<h4>まとめ</h4><table class="tt"><tbody>';
    r.outputs.forEach(function (o) {
      h += '<tr><td class="sig">' + esc(o.name) + '</td><td class="fx">= ' + esc(o.text) + '</td></tr>';
    });
    h += '</tbody></table>';

    if (r.steps.length) {
      h += '<h4>過程（上流から順に）</h4><div class="tt-scroll"><table class="tt">'
         + '<thead><tr><th>信号</th><th class="fx">回路のとおり</th><th class="fx">整理すると</th></tr></thead><tbody>';
      r.steps.forEach(function (st) {
        h += '<tr><td class="sig">' + esc(st.name) + '</td>'
           + '<td class="fx raw">' + esc(st.raw) + '</td>'
           + '<td class="fx">' + esc(st.simple) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    dialog({ title: '論理式', html: h, ok: null, cancel: '閉じる' });
  }

  function tableHTML(t, markRow) {
    var h = '<table class="tt"><thead><tr>';
    t.inNames.forEach(function (n2) { h += '<th>' + esc(n2) + '</th>'; });
    h += '<th style="border-left-width:2px"></th>';
    t.outNames.forEach(function (n2) { h += '<th>' + esc(n2) + '</th>'; });
    h += '</tr></thead><tbody>';
    t.rows.forEach(function (r, i) {
      h += '<tr' + (markRow === i ? ' class="miss"' : '') + '>';
      r.in.forEach(function (v) { h += '<td class="i">' + v + '</td>'; });
      h += '<td style="border-left-width:2px"></td>';
      r.out.forEach(function (v) { h += '<td class="' + vClass(v) + '">' + SIM.show(v) + '</td>'; });
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }
  function vClass(v) { return v === 1 ? 'v1' : v === 0 ? 'v0' : 'vx'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ---------------- 課題 ---------------- */

  /* 課題は「章」の順に並べる。QUESTS の配列は後から足した課題が末尾に付くので、
   * 並び順は配列ではなく stage で決める（同じ章の中では配列の順＝作るべき順） */
  function questsInOrder() {
    return Q.QUESTS.map(function (q, i) { return { q: q, i: i }; })
      .sort(function (a, b) { return (a.q.stage - b.q.stage) || (a.i - b.i); })
      .map(function (e) { return e.q; });
  }

  function buildQuestList() {
    el.questList.innerHTML = '';
    var stage = 0, n = 0;
    questsInOrder().forEach(function (q) {
      if (q.stage !== stage) {
        stage = q.stage;
        var s = Q.STAGES.filter(function (x) { return x.n === stage; })[0];
        var head = document.createElement('li');
        head.className = 'sec';
        head.textContent = stage + '. ' + (s ? s.name : '');
        el.questList.appendChild(head);
      }
      var li = document.createElement('li');
      li.dataset.id = q.id;
      li.innerHTML = '<span class="n"></span><span class="t"></span><span class="c"></span>';
      li.querySelector('.n').textContent = (++n);
      li.querySelector('.t').textContent = q.name;
      li.querySelector('.c').textContent = S.cleared[q.id] ? '✓' : '';
      li.classList.toggle('done', !!S.cleared[q.id]);
      li.onclick = function () { selectQuest(q.id); };
      el.questList.appendChild(li);
    });
  }

  /* ---------------- 道のり ---------------- */

  /* 積み上げた量。合計は「今あるチップを全部ばらしたら NAND 何個ぶんか」。
   * 同じチップを何度も使っていればそのぶん重ねて数える（それが積み上げた量そのものなので） */
  function pathStats() {
    var names = Object.keys(S.lib), total = 0, deep = 0, deepest = '';
    names.forEach(function (nm) {
      var g = T.gateCount(S.lib[nm].circuit, S.lib);
      total += g.nand;
      var d = L.depth(nm, S.lib);
      if (d > deep) { deep = d; deepest = nm; }
    });
    var done = Q.QUESTS.filter(function (q) { return S.cleared[q.id]; }).length;
    return { chips: names.length, nand: total, depth: deep, deepest: deepest, done: done, all: Q.QUESTS.length };
  }

  function showPath() {
    var st = pathStats();
    var order = questsInOrder(), byStage = {}, i;
    order.forEach(function (q) { (byStage[q.stage] || (byStage[q.stage] = [])).push(q); });

    /* 箱の大きさ。1章6問が横に並んでも #modal（最大 860px）に収まる幅にしてある */
    var BW = 100, BH = 46, GX = 12, GY = 84, LEFT = 110, TOP = 16;
    var cols = 0;
    Q.STAGES.forEach(function (s) { cols = Math.max(cols, (byStage[s.n] || []).length); });
    var W = LEFT + cols * (BW + GX), H = TOP + Q.STAGES.length * GY;

    var pos = {};
    Q.STAGES.forEach(function (s, r) {
      (byStage[s.n] || []).forEach(function (q, c) {
        pos[q.id] = { x: LEFT + c * (BW + GX), y: TOP + r * GY };
      });
    });

    /* 先に線。あとで箱を上に重ねる */
    var svg = '<svg class="path-svg" width="' + W + '" height="' + H + '">';
    order.forEach(function (q) {
      (q.needs || []).forEach(function (nd) {
        var a = pos[nd], b = pos[q.id];
        if (!a || !b) return;
        var x1 = a.x + BW / 2, y1 = a.y + BH, x2 = b.x + BW / 2, y2 = b.y;
        var on = S.cleared[nd] && S.cleared[q.id];
        svg += '<path d="M' + x1 + ' ' + y1 + ' C' + x1 + ' ' + (y1 + 26) + ' ' + x2 + ' ' + (y2 - 26) + ' ' + x2 + ' ' + y2 + '"'
             + ' class="' + (on ? 'e on' : 'e') + '"/>';
      });
    });
    svg += '</svg>';

    var html = '<div class="path-sum">'
      + '<b>' + st.done + ' / ' + st.all + '</b> 問クリア　・　作ったチップ <b>' + st.chips + '</b>個'
      + (st.chips ? '　・　全部ばらすと NAND <b>' + st.nand + '</b>個ぶん　・　一番深いのは <b>'
          + esc(st.deepest) + '</b>（NOT から数えて ' + st.depth + ' 段目）' : '')
      + '</div>';
    html += '<div class="path-wrap" style="width:' + W + 'px;height:' + H + 'px">' + svg;

    Q.STAGES.forEach(function (s, r) {
      html += '<div class="path-stage" style="top:' + (TOP + r * GY) + 'px">'
            + '<b>' + esc(s.name) + '</b><span>' + esc(s.note) + '</span></div>';
    });
    order.forEach(function (q) {
      var p = pos[q.id];
      var open = (q.needs || []).every(function (nd) { return S.cleared[nd]; });
      var cls = S.cleared[q.id] ? 'done' : (open ? 'open' : 'locked');
      html += '<div class="path-node ' + cls + '" data-q="' + esc(q.id) + '"'
           + ' style="left:' + p.x + 'px;top:' + p.y + 'px;width:' + BW + 'px;height:' + BH + 'px"'
           + ' title="' + esc(q.desc.slice(0, 60)) + '">'
           + '<span class="nm">' + esc(q.name) + '</span>'
           + '<span class="sub">' + (S.cleared[q.id] ? '✓ ' : '') + 'NAND ' + q.goal + '</span></div>';
    });
    html += '</div>';
    html += '<p class="hintline">箱をクリックするとその課題を選ぶ。線は「先に作っておくと楽な課題」。'
          + 'NAND の数はお手本の実測値で、上の段ほど大きくなる ― それが積み上がっているということ。</p>';

    dialog({ title: '道のり', html: html, ok: null, cancel: '閉じる' });
    [].forEach.call(document.querySelectorAll('.path-node'), function (d) {
      d.onclick = function () { selectQuest(d.dataset.q); closeModal(); };
    });
  }

  function selectQuest(id) {
    S.questId = id;
    [].forEach.call(el.questList.children, function (li) { li.classList.toggle('on', li.dataset.id === id); });
    var q = Q.BY_ID[id];
    el.questBody.classList.toggle('hidden', !q);
    if (!q) return;
    el.qName.textContent = q.name;
    el.qDesc.textContent = q.desc;
    el.qWhy.textContent = q.why ? 'これができると ― ' + q.why : '';
    el.qHint.textContent = q.hint;
    el.qResult.innerHTML = '';
    el.qSpec.innerHTML = specHTML(q);
    refreshQuestPorts();
    scheduleSave();
  }

  function specHTML(q) {
    if (q.kind === 'comb') {
      return '<div class="tt-scroll">' + tableHTML({
        inNames: q.inputs, outNames: q.outputs,
        rows: q.rows.map(function (r) { return { in: r.slice(0, q.inputs.length), out: r.slice(q.inputs.length) }; })
      }) + '</div>';
    }
    var h = '<table class="tt"><thead><tr><th>手順</th>';
    q.inputs.forEach(function (n2) { h += '<th>' + esc(n2) + '</th>'; });
    q.outputs.forEach(function (n2) { h += '<th>' + esc(n2) + '</th>'; });
    h += '<th style="text-align:left">意味</th></tr></thead><tbody>';
    q.steps.forEach(function (st, i) {
      h += '<tr><td class="i">' + (i + 1) + '</td>';
      q.inputs.forEach(function (n2) { h += '<td class="' + vClass(st.in[n2]) + '">' + (st.in[n2] === undefined ? '-' : st.in[n2]) + '</td>'; });
      q.outputs.forEach(function (n2) {
        var v = st.want[n2];
        h += '<td class="' + (v === null || v === undefined ? 'i' : vClass(v)) + '">' + (v === null || v === undefined ? '―' : v) + '</td>';
      });
      h += '<td style="text-align:left;color:#8492a6">' + esc(st.note || '') + '</td></tr>';
    });
    return h + '</tbody></table>';
  }

  /** 課題が求める端子が、今の回路にあるかどうかを見せる */
  function refreshQuestPorts() {
    var q = Q.BY_ID[S.questId];
    if (!q || !el.qPorts) return;
    var have = {};
    N.externalInputs(S.circuit).forEach(function (p) { have['in:' + p.name] = true; });
    N.externalOutputs(S.circuit).forEach(function (p) { have['out:' + p.name] = true; });
    var h = '';
    q.inputs.forEach(function (n2) {
      h += '<span class="port-tag' + (have['in:' + n2] ? ' has' : '') + '">入力 <b>' + esc(n2) + '</b></span>';
    });
    q.outputs.forEach(function (n2) {
      h += '<span class="port-tag' + (have['out:' + n2] ? ' has' : '') + '">出力 <b>' + esc(n2) + '</b></span>';
    });
    el.qPorts.innerHTML = h;
  }

  function doGrade() {
    var q = Q.BY_ID[S.questId];
    if (!q) return;
    var problems = N.validate(S.circuit, S.lib);
    var unconnected = problems.filter(function (m) { return m.indexOf('繋がっていません') >= 0; });

    var r = Q.grade(q, S.circuit, S.lib);
    var h = '';
    if (r.ok) {
      S.cleared[q.id] = true;
      buildQuestList();
      selectQuestKeep(q.id);
      h = '<div class="good">◎ 合格　NAND ' + r.gates + '個（お手本は ' + r.goal + '個）</div>';
      if (q.why) h += '<div class="why">これで ' + esc(q.why) + '</div>';
      var next = Q.QUESTS[Q.QUESTS.indexOf(q) + 1];
      h += '<div class="why">「チップにする」で登録しておくと、次から部品として使える。'
         + (next ? '次は 「' + esc(next.name) + '」。' : 'ここまでで一巡。README の続きに CPU までの道順がある。') + '</div>';
    } else {
      h = '<div class="bad">✕ まだ合っていない</div>';
      if (r.error) h += '<div class="why">' + esc(r.error) + '</div>';
      if (r.bad && q.kind === 'comb') {
        h += '<div class="why">'
          + q.inputs.map(function (n2, i) { return n2 + '=' + r.bad.in[i]; }).join(', ')
          + ' のとき　期待 ' + r.bad.want.map(SIM.show).join(',')
          + '　実際 ' + r.bad.got.map(SIM.show).join(',') + '</div>';
      }
      if (r.bad && q.kind === 'seq') {
        h += '<div class="why">手順 ' + (r.step + 1) + '（' + esc(r.note || '') + '）で、'
          + r.bad.name + ' は ' + SIM.show(r.bad.want) + ' のはずが ' + SIM.show(r.bad.got) + ' だった</div>';
      }
      if (unconnected.length) h += '<div class="why">なお、' + esc(unconnected[0]) + '</div>';
    }
    el.qResult.innerHTML = h;
    scheduleSave();
  }

  /* 一覧を作り直したあとも選択状態と結果表示を保つ */
  function selectQuestKeep(id) {
    [].forEach.call(el.questList.children, function (li) { li.classList.toggle('on', li.dataset.id === id); });
  }

  /* ---------------- 書き出し・読み込み ---------------- */

  function showExport() {
    var text = ST.toJSON({ circuit: S.circuit, lib: S.lib, cleared: S.cleared, quest: S.questId });
    dialog({
      title: '書き出し',
      hint: '下の中身をコピーして、テキストファイルに貼り付けて保存してください。',
      textarea: text,
      ok: 'すべて選択',
      onOk: function (_v, _m, box) { box.select(); return false; },
      cancel: '閉じる'
    });
  }

  function showImport() {
    dialog({
      title: '読み込み',
      hint: '書き出した JSON を貼り付けてください。今の回路とチップはすべて置き換わります（Ctrl+Z で戻せる）。',
      textarea: '',
      ok: '読み込む',
      onOk: function (_v, setMsg, box) {
        var r = ST.fromJSON(box.value);
        if (r.error) { setMsg(r.error); return false; }
        snapshot();
        setEditing(null);
        S.circuit = r.state.circuit;
        S.lib = r.state.lib;
        S.cleared = r.state.cleared;
        S.questId = r.state.quest;
        clearSel();
        buildPalette();
        buildQuestList();
        selectQuest(S.questId);
        rebuild();
        say('読み込んだ');
        return true;
      }
    });
  }

  /* ---------------- かぶせる窓 ---------------- */

  function closeModal() { el.overlay.classList.add('hidden'); el.modal.innerHTML = ''; }

  function dialog(o) {
    var h = '<h3>' + esc(o.title) + '</h3>';
    if (o.hint) h += '<p class="hintline">' + esc(o.hint).replace(/\n/g, '<br>') + '</p>';
    if (o.html) h += o.html;
    if (o.input) h += '<input type="text" id="mIn" value="' + esc(o.input.value || '') + '" placeholder="' + esc(o.input.placeholder || '') + '">';
    if (o.textarea !== undefined) h += '<textarea id="mIn" spellcheck="false">' + esc(o.textarea) + '</textarea>';
    h += '<div class="msg" id="mMsg"></div><div class="row">';
    h += '<button class="tb" id="mCancel">' + esc(o.cancel || 'やめる') + '</button>';
    if (o.ok) h += '<button class="tb primary" id="mOk">' + esc(o.ok) + '</button>';
    h += '</div>';
    el.modal.innerHTML = h;
    el.overlay.classList.remove('hidden');

    var box = document.getElementById('mIn');
    var msg = document.getElementById('mMsg');
    var setMsg = function (m) { msg.textContent = m; };
    if (box) { box.focus(); if (box.tagName === 'INPUT') box.select(); }

    document.getElementById('mCancel').onclick = closeModal;
    var okBtn = document.getElementById('mOk');
    if (okBtn) {
      okBtn.onclick = function () { if (o.onOk(box ? box.value : '', setMsg, box) !== false) closeModal(); };
      if (box && box.tagName === 'INPUT') {
        box.onkeydown = function (e) { if (e.key === 'Enter') okBtn.onclick(); };
      }
    }
  }

  function alertBox(title, body) { dialog({ title: title, hint: body, ok: null, cancel: '閉じる' }); }
  function confirmBox(title, body, onYes) {
    dialog({ title: title, hint: body, ok: 'はい', onOk: function () { onYes(); return true; } });
  }

  /* geom はテストが端子の座標を出すために使う。画面の当たり判定と同じ関数でないと意味がない */
  NL.ui = {
    mount: mount, state: S,
    geom: { sizeOf: sizeOf, portXY: portXY, outPath: outPath, routePath: routePath },
    /* 束（同じ語幹＋数字の端子のまとまり）の読み取り。検査から数として確かめるため */
    bus: { of: busesOf, value: busValue, bits: busBits }
  };
})(typeof window !== 'undefined' ? window : globalThis);
