/* 画面 ― ブラウザに触るのはこのファイルと main.js だけ
 *
 * 真ん中は2枚の図（どちらも laser.evaluate と同じ式から描く。図に嘘はない）:
 *   左  L-I を掃く ― 25 ℃（青）と動作温度（橙）。しきい値の折れ目が温度で右へ動く
 *   右  黒体のスペクトル ― 今の温度の形（山を 1 とする）と、可視の帯（400〜700 nm）
 */
(function (global) {
  'use strict';
  var LS = global.LS;
  var M = LS.laser, Q = LS.quest, ANS = LS.answer, STORE = LS.store;

  var S = null, cv, ctx, DPR = 1;
  var COL = { bg: '#14171c', panel: '#191d24', line: '#2f3642', fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f',
              light: '#5aa9e6', warm: '#ffab40', green: '#4cc38a', now: '#ffffff', vis: 'rgba(255,171,64,0.12)' };

  /* ---- 設計の欄 [key, 名前, 単位, min, max, 整数?] ---- */
  var FIELDS = [
    ['tk', '黒体の温度', 'K', 500, 4000],
    ['etainj', 'LED の注入効率', '（0〜1）', 0.01, 1],
    ['iqe', 'LED の内部量子効率', '（0〜1）', 0.01, 1],
    ['extr', 'LED の取り出し効率', '（0〜1）', 0.01, 1],
    ['vf', 'LED の順電圧', 'V', 1, 6],
    ['lednm', 'LED の波長', 'nm', 200, 2000],
    ['r1', '前の端面の反射率 R₁', '（0〜1）', 0.001, 0.999],
    ['r2', '後ろの端面の反射率 R₂', '（0〜1）', 0.001, 0.999],
    ['lum', '共振器の長さ', 'µm', 50, 3000],
    ['ai', '内部の損失 α_i', 'cm⁻¹', 0.1, 100],
    ['etai', '注入効率 η_i', '（0〜1）', 0.1, 1],
    ['lasnm', 'レーザーの波長', 'nm', 300, 3000],
    ['ith25', '25 ℃ のしきい値', 'mA', 0.1, 500],
    ['t0', '特性温度 T₀', 'K', 20, 300],
    ['tempc', '動作温度', '℃', -40, 125],
    ['iop', '駆動の電流', 'mA', 0, 1000],
    ['ng', '群屈折率 n_g', '', 1, 5],
    ['neff', 'DFB の実効屈折率', '', 1, 5],
    ['pitchnm', 'DFB の格子の周期', 'nm', 50, 1000],
    ['dldt', 'DFB の温度係数', 'nm/K', 0, 1],
    ['lcavm', 'モード同期の共振器', 'm', 0.01, 20],
    ['mlnm', 'モード同期の中心', 'nm', 300, 3000],
    ['dlnm', 'スペクトルの幅', 'nm', 0.01, 300],
    ['pavg', '平均の出力', 'W', 0.001, 50],
    ['dfac', '緩和振動の係数 D', 'GHz/√mA', 0.1, 10],
    ['gbps', 'ビットレート', 'Gb/s', 0.1, 100],
    ['shgL', 'SHG の結晶の長さ', 'cm', 0.05, 10],
    ['shgP', 'SHG の励起', 'W', 0.001, 20],
    ['shgK', 'SHG の効率の係数', '%/(W·cm)', 0.01, 100],
    ['shgA', '温度の許容幅 × 長さ', '℃·cm', 0.01, 100],
    ['shgdT', '温度の揺れ', '±℃', 0, 10],
    ['fibw', 'ファイバのモード半径', 'µm', 0.5, 50],
    ['ldw', 'LD のモード半径', 'µm', 0.1, 50],
    ['mag', 'レンズの倍率', '倍', 0.1, 20],
    ['offum', '横ずれ', 'µm', 0, 20]
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
    drawLI({ x: Lm, y: top, w: pw, h: ph });
    drawPlanck({ x: colW + gap + Lm, y: top, w: pw, h: ph });
    updateStatus();
  }

  function frameBox(b, title) {
    ctx.fillStyle = COL.panel; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COL.line; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    label(b.x, b.y - 6, title, COL.fg2, 'left', '11px', b.w);
  }

  function linAxes(b, xr, yr, xl, yl, nx, ny) {
    var X = function (v) { return b.x + b.w * (v - xr[0]) / (xr[1] - xr[0] || 1); };
    var Y = function (v) { return b.y + b.h * (1 - (v - yr[0]) / (yr[1] - yr[0] || 1)); };
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    var i, v;
    for (i = 0; i <= nx; i++) { v = xr[0] + (xr[1] - xr[0]) * i / nx; line(X(v), b.y, X(v), b.y + b.h); label(X(v), b.y + b.h + 12, fmt(v), COL.fg3, 'center', '9px'); }
    for (i = 0; i <= ny; i++) { v = yr[0] + (yr[1] - yr[0]) * i / ny; line(b.x, Y(v), b.x + b.w, Y(v)); label(b.x - 4, Y(v) + 3, fmt(v), COL.fg3, 'right', '9px'); }
    ctx.globalAlpha = 1;
    label(b.x + b.w / 2, b.y + b.h + 26, xl, COL.fg3, 'center', '10px');
    ctx.save(); ctx.translate(b.x - 44, b.y + b.h / 2); ctx.rotate(-Math.PI / 2); label(0, 0, yl, COL.fg3, 'center', '10px'); ctx.restore();
    return { X: X, Y: Y };
  }
  function fmt(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)); }

  function poly(pts, X, Y, gx, gy, col) {
    ctx.strokeStyle = col; ctx.beginPath();
    pts.forEach(function (p, i) { var vx = gx(p), vy = gy(p); if (i === 0) ctx.moveTo(X(vx), Y(vy)); else ctx.lineTo(X(vx), Y(vy)); });
    ctx.stroke();
  }

  function drawLI(b) {
    frameBox(b, 'L-I ― 25 ℃（青）と動作温度（橙）。しきい値は exp(T/T₀) で右へ');
    var pts = M.liSweep(S.design, 80);
    var iMax = pts[pts.length - 1].i;
    var pMax = 1;
    pts.forEach(function (p) { pMax = Math.max(pMax, p.p25, p.pT); });
    var A = linAxes(b, [0, iMax], [0, pMax * 1.05], '駆動の電流 [mA]', '出力 [mW]', 4, 4);
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    poly(pts, A.X, A.Y, function (p) { return p.i; }, function (p) { return p.p25; }, COL.light);
    poly(pts, A.X, A.Y, function (p) { return p.i; }, function (p) { return p.pT; }, COL.warm);
    var ev = M.evaluate(S.design);
    dot(A.X(Math.min(S.design.iop, iMax)), A.Y(Math.min(ev.pmw, pMax * 1.05)), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '白 = 今の設計（動作温度・駆動の電流）', COL.fg3, 'right', '10px', b.w - 12);
  }

  function drawPlanck(b) {
    frameBox(b, '黒体のスペクトル ― 山を 1 とした形と、可視の帯');
    var pts = M.planckSweep(S.design, 140);
    var A = linAxes(b, [0.2, 3.0], [0, 1.05], '波長 [µm]', '相対の強さ', 7, 4);
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.fillStyle = COL.vis; ctx.fillRect(A.X(0.4), b.y, A.X(0.7) - A.X(0.4), b.h);
    poly(pts, A.X, A.Y, function (p) { return p.um; }, function (p) { return p.b; }, COL.warm);
    var ev = M.evaluate(S.design);
    if (ev.lamMaxUm <= 3) dot(A.X(ev.lamMaxUm), A.Y(1), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '帯 = 可視 0.4〜0.7 µm・白 = 山（2898/T µm）', COL.fg3, 'right', '10px', b.w - 12);
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
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/&lt;(\/?)(b|sub|sup)&gt;/g, '<$1$2>'); }

  function updateStatus() {
    var ev = M.evaluate(S.design);
    document.getElementById('statLeft').textContent =
      '出力 ' + ev.pmw.toFixed(2) + ' mW　しきい値 ' + ev.ith.toFixed(2) + ' mA（' + S.design.tempc + ' ℃）';
    document.getElementById('statRight').textContent =
      '黒体の山 ' + ev.lamMaxUm.toFixed(3) + ' µm　可視 ' + (ev.vis * 100).toFixed(1) + ' %';
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
    try { ev = M.evaluate(S.design); } catch (e) { document.getElementById('derived').textContent = '計算できませんでした: ' + e.message; return; }
    var rows = [
      ['黒体の山 / 可視の割合', ev.lamMaxUm.toFixed(3) + ' µm / ' + (ev.vis * 100).toFixed(2) + ' %（σT⁴ ' + ev.Mwcm2.toFixed(0) + ' W/cm²）'],
      ['LED: EQE / 電力の効率', (ev.eqe * 100).toFixed(1) + ' % / ' + (ev.wpe * 100).toFixed(1) + ' %（hν ' + ev.hvLed.toFixed(3) + ' eV）'],
      ['鏡の損失 / しきい値の利得', ev.am.toFixed(1) + ' / ' + ev.gth.toFixed(1) + ' cm⁻¹'],
      ['微分量子効率 / スロープ効率', ev.etad.toFixed(3) + ' / ' + ev.slope.toFixed(3) + ' W/A（両端面）'],
      ['前から出る割合', (ev.front * 100).toFixed(1) + ' %'],
      ['しきい値 / 出力', ev.ith.toFixed(2) + ' mA / ' + ev.pmw.toFixed(2) + ' mW（' + S.design.tempc + ' ℃・' + S.design.iop + ' mA）', ev.pmw <= 0],
      ['縦モードの間隔', ev.fsrNm.toFixed(3) + ' nm'],
      ['DFB の波長', ev.lamT.toFixed(3) + ' nm（25 ℃ で ' + ev.lamB.toFixed(2) + '）'],
      ['モード同期: 繰り返し / 最短のパルス', (ev.frep / 1e6).toFixed(2) + ' MHz / ' + ev.tauFs.toFixed(1) + ' fs'],
      ['パルス: エネルギー / 尖頭値', ev.epNj.toFixed(2) + ' nJ / ' + ev.ppeakKw.toFixed(1) + ' kW'],
      ['緩和振動 / 変調の帯域', ev.fR.toFixed(2) + ' / ' + ev.f3.toFixed(2) + ' GHz（要る ' + ev.fNeed.toFixed(2) + '）', ev.f3 < ev.fNeed],
      ['SHG: 出力 / 揺れでの低下', ev.p2wMw.toFixed(2) + ' mW / ' + (ev.shgDrop * 100).toFixed(1) + ' %（許容幅 ' + ev.shgTol.toFixed(3) + ' ℃）'],
      ['ファイバへの結合', (ev.eta * 100).toFixed(2) + ' %（大きさ ' + (ev.etaMM * 100).toFixed(1) + ' % × 横ずれ ' + (ev.etaOff * 100).toFixed(1) + ' %）']
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

  LS.ui = { mount: mount, get state() { return S; }, selectQuest: selectQuest };
})(typeof window !== 'undefined' ? window : globalThis);
