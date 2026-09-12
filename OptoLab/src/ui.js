/* 画面 ― ブラウザに触るのはこのファイルと main.js だけ
 *
 * 真ん中は2枚の図（どちらも opto.evaluate と同じ式から描く。図に嘘はない）:
 *   左  F値を掃く（両対数）― センサ照度は 1/N² で落ち、エアリー径は N に比例して太る。
 *       明るさと解像の綱引きが1枚で見える（縦軸は対数の「値」。単位は凡例のとおり別物）
 *   右  入射ビーム半径を掃く ― 集光スポットは細くなるが、ビームの NA が開く。
 *       ファイバ結合の窓が両側から閉じる様子（破線 = コア径と NA の壁）
 */
(function (global) {
  'use strict';
  var OP = global.OP;
  var O = OP.opto, Q = OP.quest, ANS = OP.answer, STORE = OP.store;

  var S = null, cv, ctx, DPR = 1;
  var COL = { bg: '#14171c', panel: '#191d24', line: '#2f3642', fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f',
              light: '#5aa9e6', warm: '#ffab40', green: '#4cc38a', now: '#ffffff' };

  var FIELDS = [
    ['lx', '被写体の照度', 'lx', 1, 100000],
    ['rho', '反射率', '（0〜1）', 0.01, 1],
    ['T', 'レンズの透過率', '（0〜1）', 0.1, 1],
    ['N', 'F値', '', 0.95, 22],
    ['nm', '波長', 'nm', 200, 2000, true],
    ['cd', '点光源の光度', 'cd', 0.1, 100000],
    ['rm', '距離', 'm', 0.1, 100],
    ['fmm', '焦点距離', 'mm', 1, 1000],
    ['amm', '物体距離', 'mm', 1, 100000],
    ['naobj', '対物の NA', '（乾燥系〜0.95）', 0.05, 1.4],
    ['winmm', '入射ビーム半径', 'mm', 0.1, 10],
    ['m2', 'ビーム品質 M²', '', 1, 10],
    ['ncoat', 'コートの屈折率', '', 1.2, 2.5],
    ['nsub', '基板の屈折率', '', 1.3, 4.2],
    ['coreu', 'ファイバのコア径', 'µm', 3, 400, true],
    ['naf', 'ファイバの NA', '', 0.05, 0.5],
    ['bin', '信号の元の帯域', 'Hz', 1, 1000000],
    ['blk', 'ロックインの帯域', 'Hz', 0.01, 1000],
    ['srcum', '面光源の径', 'µm（LED など）', 1, 10000],
    ['srcna', '面光源の NA', '（ランベルトなら〜1）', 0.05, 1]
  ];

  function num(t) {
    var v = parseFloat(String(t).replace(/[,，\s]/g, ''));
    return isFinite(v) ? v : NaN;
  }

  /* ================= 起動 ================= */

  function mount(state) {
    S = state;
    cv = document.getElementById('board');
    ctx = cv.getContext('2d');
    bind();
    renderDesign();
    renderQuestList();
    window.addEventListener('resize', resize);
    resize();
    persist();
  }

  var raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }
  function resize() {
    DPR = window.devicePixelRatio || 1;
    var r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * DPR));
    cv.height = Math.max(1, Math.round(r.height * DPR));
    requestDraw();
  }

  /* ================= 絵 ================= */

  function draw() {
    var W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(DPR, DPR);
    var w = W / DPR, h = H / DPR;
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h);

    var gap = 16, Lm = 56, Rm = 10, top = 22, bottom = 40;
    var colW = (w - gap) / 2;
    var pw = Math.max(80, colW - Lm - Rm), ph = Math.max(60, h - top - bottom);
    drawNSweep({ x: Lm, y: top, w: pw, h: ph });
    drawFiber({ x: colW + gap + Lm, y: top, w: pw, h: ph });
    updateStatus();
  }

  function frameBox(b, title) {
    ctx.fillStyle = COL.panel; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COL.line; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    label(b.x, b.y - 6, title, COL.fg2, 'left', '11px', b.w);
  }

  function axes(b, xr, yr, xl, yl) {
    var x0 = Math.log10(xr[0]), x1 = Math.log10(xr[1]);
    var y0 = Math.log10(yr[0]), y1 = Math.log10(yr[1]);
    var X = function (v) { return b.x + b.w * (Math.log10(v) - x0) / (x1 - x0 || 1); };
    var Y = function (v) { return b.y + b.h * (1 - (Math.log10(v) - y0) / (y1 - y0 || 1)); };
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    var i;
    for (i = Math.ceil(x0); i <= x1; i++) { var xx = X(Math.pow(10, i)); line(xx, b.y, xx, b.y + b.h); label(xx, b.y + b.h + 12, '1e' + i, COL.fg3, 'center', '9px'); }
    for (i = Math.ceil(y0); i <= y1; i++) { var yy = Y(Math.pow(10, i)); line(b.x, yy, b.x + b.w, yy); label(b.x - 4, yy + 3, '1e' + i, COL.fg3, 'right', '9px'); }
    ctx.globalAlpha = 1;
    label(b.x + b.w / 2, b.y + b.h + 26, xl, COL.fg3, 'center', '10px');
    ctx.save(); ctx.translate(b.x - 44, b.y + b.h / 2); ctx.rotate(-Math.PI / 2); label(0, 0, yl, COL.fg3, 'center', '10px'); ctx.restore();
    return { X: X, Y: Y };
  }

  function poly(pts, X, Y, gx, gy, col) {
    ctx.strokeStyle = col; ctx.beginPath();
    var started = false;
    pts.forEach(function (p) {
      var vx = gx(p), vy = gy(p);
      if (!(vy > 0) || !isFinite(vy)) return;
      if (!started) { ctx.moveTo(X(vx), Y(vy)); started = true; } else ctx.lineTo(X(vx), Y(vy));
    });
    ctx.stroke();
  }

  function drawNSweep(b) {
    frameBox(b, 'F値を掃く ― 明るさは 1/N²・回折は N（縦軸は対数の値。単位は凡例）');
    var pts = O.nSweep(S.design, 1, 22, 80);
    var A = axes(b, [1, 22], [0.1, 1000], 'F値', '値（対数）');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    poly(pts, A.X, A.Y, function (p) { return p.N; }, function (p) { return p.eimg; }, COL.light);
    poly(pts, A.X, A.Y, function (p) { return p.N; }, function (p) { return p.airy; }, COL.warm);
    var ev = O.evaluate(S.design);
    if (ev.Eimg > 0.1) dot(A.X(S.design.N), A.Y(ev.Eimg), COL.now, 3.5);
    if (ev.airyUm > 0.1) dot(A.X(S.design.N), A.Y(ev.airyUm), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '青 = センサ照度[lx]・橙 = エアリー径[µm]・白 = 今の設計', COL.fg3, 'right', '10px', b.w - 12);
  }

  function drawFiber(b) {
    frameBox(b, 'ビーム半径を掃く ― スポットは細く、NA は開く（ファイバの窓）');
    var pts = O.wSweep(S.design, 0.1, 10, 80);
    var A = axes(b, [0.1, 10], [0.001, 1000], '入射ビーム半径 [mm]', '値（対数）');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = COL.light; line(b.x, A.Y(S.design.coreu), b.x + b.w, A.Y(S.design.coreu));
    ctx.strokeStyle = COL.green; line(b.x, A.Y(S.design.naf), b.x + b.w, A.Y(S.design.naf));
    ctx.setLineDash([]);
    poly(pts, A.X, A.Y, function (p) { return p.w; }, function (p) { return p.spot; }, COL.light);
    poly(pts, A.X, A.Y, function (p) { return p.w; }, function (p) { return p.na; }, COL.green);
    var ev = O.evaluate(S.design);
    dot(A.X(S.design.winmm), A.Y(ev.spotUm), COL.now, 3.5);
    dot(A.X(S.design.winmm), A.Y(ev.naBeam), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '青 = スポット[µm]と壁(コア径)・緑 = ビームNAと壁(ファイバNA)', COL.fg3, 'right', '10px', b.w - 12);
  }

  function dot(x, y, col, r) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r || 2.4, 0, Math.PI * 2); ctx.fill(); }
  function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  function label(x, y, t, col, align, size, maxW) {
    ctx.font = (size || '11px') + ' "Yu Gothic UI", Meiryo, sans-serif';
    t = String(t);
    if (maxW > 0 && ctx.measureText(t).width > maxW) {
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      t += '…';
    }
    ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

  function updateStatus() {
    var ev = O.evaluate(S.design);
    document.getElementById('statLeft').textContent =
      'センサ照度 ' + ev.Eimg.toFixed(2) + ' lx　エアリー ' + ev.airyUm.toFixed(2) + ' µm';
    document.getElementById('statRight').textContent =
      '集光径 ' + ev.spotUm.toFixed(1) + ' µm　残留反射 ' + (ev.Rar * 100).toFixed(2) + ' %';
  }

  /* ================= 左のパネル ================= */

  function renderDesign() {
    var host = document.getElementById('designForm');
    host.innerHTML = '';
    host.className = 'df';
    FIELDS.forEach(function (fd) {
      host.appendChild(numRow(fd[1], S.design[fd[0]], fd[2], function (t) {
        var v = num(t);
        if (!isFinite(v)) return false;
        v = Math.min(fd[4], Math.max(fd[3], v));
        if (fd[5]) v = Math.round(v);
        S.design[fd[0]] = v;
        designChanged();
        return true;
      }));
    });
    renderDerived();
  }

  function designChanged() {
    renderDesign();
    requestDraw();
    persist();
  }

  function renderDerived() {
    var ev;
    try { ev = O.evaluate(S.design); } catch (e) { document.getElementById('derived').textContent = '計算できませんでした: ' + e.message; return; }
    var rows = [
      ['被写体（W/m² 換算）', ev.Ew.toFixed(3) + '（555nm 単色として）'],
      ['輝度 L = ρE/π', ev.L.toFixed(1) + ' cd/m²'],
      ['センサ照度 ρET/4N²', ev.Eimg.toFixed(2) + ' lx'],
      ['同・光子束', ev.phiUm.toExponential(2) + ' /µm²/s'],
      ['逆二乗 I/r²', ev.Einv.toFixed(2) + ' lx'],
      ['像距離 / 倍率', (isFinite(ev.bmm) ? ev.bmm.toFixed(1) + ' mm / ' + ev.mag.toFixed(3) : '虚像（a > f に）'), !isFinite(ev.bmm)],
      ['エアリー径 2.44λN', ev.airyUm.toFixed(2) + ' µm'],
      ['分解能 0.61λ/NA', ev.resUm.toFixed(3) + ' µm'],
      ['集光径 2w₀', ev.spotUm.toFixed(1) + ' µm（ビームNA ' + ev.naBeam.toFixed(3) + '）'],
      ['ファイバ結合', ev.fibOk ? '入る（場所も角度も）' : '入らない', !ev.fibOk],
      ['素の反射 / λ/4 後', (ev.Rfres * 100).toFixed(1) + ' % / ' + (ev.Rar * 100).toFixed(2) + ' %（理想 n=' + ev.nIdeal.toFixed(2) + '）'],
      ['ロックインの改善', ev.snrGain.toFixed(1) + ' 倍'],
      ['エテンデュ結合の上限', (ev.etaMax * 100).toFixed(ev.etaMax < 0.01 ? 3 : 1) + ' %（面光源→ファイバ）', ev.etaMax < 0.01]
    ];
    document.getElementById('derived').innerHTML = '<div class="dv">' + rows.map(function (r) {
      return '<span class="k">' + esc(r[0]) + '</span><span class="v' + (r[2] ? ' warn' : '') + '">' + esc(r[1]) + '</span>';
    }).join('') + '</div>';
  }

  function numRow(name, val, unit, onEnter) {
    var row = document.createElement('div'); row.className = 'row';
    var n = document.createElement('span'); n.textContent = name;
    var inp = document.createElement('input'); inp.type = 'text'; inp.value = String(val);
    var u = document.createElement('span'); u.className = 'u'; u.textContent = unit;
    inp.addEventListener('change', function () { if (onEnter(inp.value) === false) inp.classList.add('bad'); });
    row.appendChild(n); row.appendChild(inp); row.appendChild(u);
    return row;
  }

  /* ================= 課題 ================= */

  function bind() {
    document.getElementById('btnGrade').addEventListener('click', grade);
    document.getElementById('btnAnswer').addEventListener('click', showAnswer);
  }

  function renderQuestList() {
    var host = document.getElementById('questList');
    host.innerHTML = '';
    Q.CH.forEach(function (ch) {
      var div = document.createElement('div'); div.className = 'chapter';
      var t = document.createElement('div'); t.className = 'ctitle'; t.textContent = ch.name; div.appendChild(t);
      var l = document.createElement('p'); l.className = 'clead'; l.textContent = ch.lead; div.appendChild(l);
      Q.LIST.filter(function (q) { return q.ch === ch.id; }).forEach(function (q) {
        var it = document.createElement('div');
        it.className = 'qitem' + (S.cleared[q.id] ? ' done' : '') + (S.quest === q.id ? ' sel' : '');
        it.innerHTML = '<span class="mark">' + (S.cleared[q.id] ? '✓' : '○') + '</span><span>' + esc(q.name) + '</span>';
        it.addEventListener('click', function () { selectQuest(q.id); });
        div.appendChild(it);
      });
      host.appendChild(div);
    });
  }

  function selectQuest(id) {
    var q = Q.byId(id);
    S.quest = id;
    renderQuestList();
    var body = document.getElementById('questBody');
    if (!q) { body.classList.add('hidden'); return; }
    body.classList.remove('hidden');
    document.getElementById('qName').textContent = q.name;
    document.getElementById('qDesc').innerHTML = md(q.desc);
    document.getElementById('qWhy').innerHTML = md(q.why);
    document.getElementById('qHint').textContent = q.hint;
    document.getElementById('qResult').innerHTML = '';
    persist();
  }

  function grade() {
    if (!S.quest) return;
    var r = Q.grade(S.quest, { design: S.design });
    var h = '<div class="verdict ' + (r.ok ? 'ok' : 'ng') + '">' + (r.ok ? '✓ 通った' : '✗ まだ') + '</div><div class="grid">';
    (r.rows || []).forEach(function (x) {
      h += '<span class="k">' + esc(x.label) + '</span><span class="v ' + (x.ok ? 'ok' : 'ng') + '">' + esc(x.value) + '</span>';
      if (x.want) h += '<span class="want">→ ' + esc(x.want) + '</span>';
    });
    document.getElementById('qResult').innerHTML = h + '</div>';
    if (r.ok) { S.cleared[S.quest] = true; renderQuestList(); }
    persist();
  }

  function showAnswer() {
    var q = Q.byId(S.quest), a = ANS.get(S.quest);
    if (!q || !a) return;
    if (!confirm('お手本の設計を出します。今の設計は置き換わります。よろしいですか？')) return;
    S.design = a.design();
    renderDesign();
    requestDraw();
    document.getElementById('qResult').innerHTML = '<p class="mnote"><b>お手本の手順</b>: ' + esc(a.note) + '</p>';
    persist();
  }

  function persist() { if (!STORE.save(S)) document.getElementById('statRight').textContent = '（保存できませんでした）'; }

  OP.ui = { mount: mount, get state() { return S; }, selectQuest: selectQuest };
})(typeof window !== 'undefined' ? window : globalThis);
