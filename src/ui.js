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
    clock: { w: 60, h: heightFor(1) }
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
    msg: '', msgAt: 0,
    saveTimer: null, nandCount: 0
  };

  var el = {}, cv, ctx, pcv, pctx;

  /* ---------------- 起動 ---------------- */

  function mount(state) {
    S.circuit = state.circuit;
    S.lib = state.lib || {};
    S.cleared = state.cleared || {};
    S.questId = state.quest || null;

    ['prims', 'chips', 'libEmpty', 'questList', 'questBody', 'qName', 'qDesc', 'qPorts', 'qHint',
      'qSpec', 'qResult', 'statLeft', 'statRight', 'overlay', 'modal', 'peek', 'peekName',
      'peekBoard', 'btnRun', 'btnStep', 'btnReset', 'clockSpeed', 'btnTruth', 'btnExpr', 'btnChip',
      'btnNew', 'btnExport', 'btnImport', 'btnGrade', 'peekEdit', 'peekClose'
    ].forEach(function (id) { el[id] = document.getElementById(id); });

    cv = document.getElementById('board');
    ctx = cv.getContext('2d');
    pcv = el.peekBoard;
    pctx = pcv.getContext('2d');

    buildPalette();
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
    S.nandCount = 0;
    for (var i = 0; i < S.flat.gates.length; i++) if (S.flat.gates[i].kind === 'nand') S.nandCount++;
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
    return routePath(p1, p2);
  }

  function routePath(p1, p2) {
    if (p2.x > p1.x + 24) {
      var mx = (p1.x + p2.x) / 2;
      return [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
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

    if (S.peek) renderPeek();
    updateStatus();
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
    else left.push('NAND ' + S.nandCount + '個');
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
    return { nand: 'NAND', 'in': '入力', out: '出力', 'const': '定数', clock: 'クロック' }[k] || k;
  }

  /* ---------------- パレット ---------------- */

  function buildPalette() {
    el.prims.innerHTML = '';
    [['nand', 'NAND', '唯一の素子'],
     ['in', '入力', 'スイッチ'],
     ['out', '出力', 'ランプ'],
     ['const', '定数', '0 / 1'],
     ['clock', 'クロック', '反転し続ける']
    ].forEach(function (row) {
      var d = document.createElement('div');
      d.className = 'pitem';
      d.dataset.kind = row[0];
      d.innerHTML = '<span class="k"></span><span class="d"></span>';
      d.querySelector('.k').textContent = row[1];
      d.querySelector('.d').textContent = row[2];
      d.onclick = function () { setPlace({ kind: row[0] }); };
      el.prims.appendChild(d);
    });

    el.chips.innerHTML = '';
    var namesList = Object.keys(S.lib).sort(N.natCmp);
    el.libEmpty.classList.toggle('hidden', namesList.length > 0);
    namesList.forEach(function (nm) {
      var def = S.lib[nm];
      var d = document.createElement('div');
      d.className = 'pitem';
      d.dataset.chip = nm;
      d.title = nm + '（入力 ' + def.inNames.join(',') + ' → 出力 ' + def.outNames.join(',') + '）\n'
              + 'ダブルクリックで中身を作業台に取り出す';
      d.innerHTML = '<span class="k"></span><span class="x" title="削除">×</span>';
      d.querySelector('.k').textContent = nm;
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
    el.btnChip.onclick = askChipName;
    el.btnNew.onclick = askClear;
    el.btnExport.onclick = showExport;
    el.btnImport.onclick = showImport;
    el.btnGrade.onclick = doGrade;
    el.peekClose.onclick = function () { S.peek = null; el.peek.classList.add('hidden'); };
    el.peekEdit.onclick = function () { var nm = S.peek && S.peek.chip; S.peek = null; el.peek.classList.add('hidden'); if (nm) openChipForEdit(nm); };
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

  function onDbl(e) {
    var w = toWorld(e, S.view);
    var p = partAt(S.circuit, w.x, w.y);
    if (!p) return;
    if (p.kind === 'chip') { openPeek(p); return; }
    if (p.kind === 'in' || p.kind === 'out') renamePart(p);
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
    if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      for (var id in S.circuit.parts) S.sel.parts[id] = true;
      return;
    }
    switch (e.key) {
      case 'Delete': case 'Backspace': e.preventDefault(); deleteSelection(); break;
      case 'Escape':
        if (S.peek) { S.peek = null; el.peek.classList.add('hidden'); }
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
    }
  }

  /* ---------------- チップの中を覗く ---------------- */

  function openPeek(part) {
    var def = S.lib[part.chip];
    if (!def) return say('チップ 「' + part.chip + '」 が見つからない');
    S.peek = { chip: part.chip, def: def, prefix: part.id + '/', view: { ox: 0, oy: 0, s: 1 } };
    el.peekName.textContent = part.chip + '　― 中身（値は今そこに来ているもの）';
    el.peek.classList.remove('hidden');
    fit(pcv, pctx);
    fitView(S.peek.view, def.circuit, pcv.getBoundingClientRect());
  }

  function fitView(view, circuit, rect) {
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, any = false;
    for (var id in circuit.parts) {
      var p = circuit.parts[id], s = sizeOf(p, S.lib);
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

  function renderPeek() {
    var r = pcv.getBoundingClientRect();
    if (Math.abs(r.width - pcv.width / (global.devicePixelRatio || 1)) > 1) fit(pcv, pctx);
    pctx.save();
    pctx.fillStyle = '#0f1218';
    pctx.fillRect(0, 0, r.width, r.height);
    pctx.translate(S.peek.view.ox, S.peek.view.oy);
    pctx.scale(S.peek.view.s, S.peek.view.s);
    drawCircuit(pctx, S.peek.def.circuit, S.peek.prefix, true);
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
        say(exists ? '「' + made.chip.name + '」 を上書きした' : '「' + made.chip.name + '」 をチップにした');
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
        rebuild();
        say('「' + name + '」 の中身を作業台に出した');
      });
  }

  function askClear() {
    confirmBox('作業台を消す', '今の回路を空にします。チップの定義は残ります。（Ctrl+Z で戻せる）', function () {
      snapshot();
      S.circuit = N.create();
      clearSel();
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

  function buildQuestList() {
    el.questList.innerHTML = '';
    Q.QUESTS.forEach(function (q, i) {
      var li = document.createElement('li');
      li.dataset.id = q.id;
      li.innerHTML = '<span class="n"></span><span class="t"></span><span class="c"></span>';
      li.querySelector('.n').textContent = (i + 1);
      li.querySelector('.t').textContent = q.name;
      li.querySelector('.c').textContent = S.cleared[q.id] ? '✓' : '';
      li.classList.toggle('done', !!S.cleared[q.id]);
      li.onclick = function () { selectQuest(q.id); };
      el.questList.appendChild(li);
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
  NL.ui = { mount: mount, state: S, geom: { sizeOf: sizeOf, portXY: portXY, outPath: outPath } };
})(typeof window !== 'undefined' ? window : globalThis);
