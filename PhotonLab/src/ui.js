/* 画面 ― ブラウザに触るのはこのファイルと main.js だけ
 *
 * 真ん中は2枚の図（どちらも photon.evaluate と同じ式から描く。図に嘘はない）:
 *   左  SNR と 増倍率 M（両対数）― APD の「最適な M」の山が見える
 *   右  MPPC の入出力（両対数）― 発火セル数が μ からずれていく（飽和）
 *
 * 【設計の欄は数値欄だけ】摘みは使わない（SemiLab で踏んだ）。変更は change でだけ反映する。
 */
(function (global) {
  'use strict';
  var PH = global.PH;
  var PHO = PH.photon, Q = PH.quest, ANS = PH.answer, STORE = PH.store;

  var S = null, cv, ctx, DPR = 1;
  var COL = { bg: '#14171c', panel: '#191d24', line: '#2f3642', fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f',
              light: '#5aa9e6', dark: '#ffab40', now: '#ffffff', ideal: '#4cc38a' };

  /* ---- 設計の欄 [key, 名前, 単位, min, max, 整数?] ---- */
  var FIELDS = [
    ['nm', '波長', 'nm', 200, 1700, true],
    ['pw', '光のパワー（10^x）', 'x（W の指数）', -15, -3, true],
    ['eta', '量子効率 / PDE', '（0〜1）', 0.01, 0.98],
    ['M', '増倍率 M', '（1 = PIN）', 1, 300],
    ['k', 'イオン化率比 k', '（Si は 0.1 以下）', 0, 0.5],
    ['delta', 'ダイノード δ', '（0 = PMT 換算なし）', 0, 6],
    ['nstg', 'ダイノードの段数', '段', 6, 14, true],
    ['idpa', '暗電流', 'pA', 0.01, 1e5],
    ['ifa', 'アンプ雑音', 'fA/√Hz', 1, 1e6],
    ['bmhz', '帯域', 'MHz', 1e-3, 1e5],
    ['amm2', '受光面積', 'mm²', 0.001, 100],
    ['cpf', '容量（50Ω 受け）', 'pF', 0.05, 100],
    ['ncell', 'MPPC のセル数', '個（0 = なし）', 0, 10000, true],
    ['nph', 'パルスの光子数', '個', 1, 1e6, true],
    ['bgnw', '背景光', 'nW（0 = 暗室）', 0, 1e6],
    ['dkcps', 'ダークカウント', 'counts/s', 0, 1e7],
    ['tsec', '積分時間（計数）', 's', 1e-4, 1000],
    ['wum', '空乏層の厚さ', 'µm', 0.1, 50],
    ['diamum', '受光部の直径', 'µm', 5, 1000]
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
    var b1 = { x: Lm, y: top, w: pw, h: ph };
    var b2 = { x: colW + gap + Lm, y: top, w: pw, h: ph };

    drawSnrM(b1);
    drawMppc(b2);
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

  function drawSnrM(b) {
    frameBox(b, 'SNR と 増倍率 M（他の欄は今の設計のまま）― 山の上が「最適な M」');
    var pts = PHO.snrSweep(S.design, 1, 300, 90).filter(function (p) { return p.snr > 0; });
    if (!pts.length) { label(b.x + b.w / 2, b.y + b.h / 2, 'SNR が 0（光を強くする）', COL.fg3, 'center', '12px'); return; }
    var ys = pts.map(function (p) { return p.snr; });
    var ymax = Math.max.apply(null, ys), ymin = Math.min.apply(null, ys);
    var A = axes(b, [1, 300], [Math.max(ymin / 2, ymax / 1e4), ymax * 2], '増倍率 M', 'SNR');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.strokeStyle = COL.light; ctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(A.X(p.M), A.Y(p.snr)); else ctx.lineTo(A.X(p.M), A.Y(p.snr)); });
    ctx.stroke();
    var ev = PHO.evaluate(S.design);
    if (ev.SNR > 0) { dot(A.X(Math.max(1, S.design.M)), A.Y(ev.SNR), COL.now, 3.5); }
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '白い点 = 今の設計', COL.fg3, 'right', '10px', b.w - 12);
  }

  function drawMppc(b) {
    frameBox(b, 'MPPC の入出力（発火セル数 と μ = 光子数×PDE）― 上限はセル数');
    if (!(S.design.ncell > 0)) {
      label(b.x + b.w / 2, b.y + b.h / 2, '「MPPC のセル数」を入れると出る', COL.fg3, 'center', '12px');
      return;
    }
    var N = S.design.ncell, eta = S.design.eta;
    var A = axes(b, [1, 1e6], [1, Math.max(N * 3, 10)], 'パルスの光子数', '発火セル数');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    /* 理想（μ のまま）と、実際（飽和） */
    ctx.strokeStyle = COL.ideal; ctx.globalAlpha = 0.6; ctx.setLineDash([4, 4]); ctx.beginPath();
    var m0 = false;
    for (var i = 0; i <= 60; i++) {
      var nph = Math.pow(10, 6 * i / 60);
      var mu = nph * eta; if (mu < 1) continue;
      if (!m0) { ctx.moveTo(A.X(nph), A.Y(mu)); m0 = true; } else ctx.lineTo(A.X(nph), A.Y(mu));
    }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.strokeStyle = COL.light; ctx.beginPath();
    var started = false;
    for (var j = 0; j <= 90; j++) {
      var np2 = Math.pow(10, 6 * j / 90);
      var mu2 = np2 * eta;
      var fired = N * (1 - Math.exp(-mu2 / N));
      if (fired < 1) continue;
      if (!started) { ctx.moveTo(A.X(np2), A.Y(fired)); started = true; } else ctx.lineTo(A.X(np2), A.Y(fired));
    }
    ctx.stroke();
    var ev = PHO.evaluate(S.design);
    if (ev.fired >= 1) dot(A.X(S.design.nph), A.Y(ev.fired), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '緑の破線 = 目減りなし・青 = 実際・白 = 今の設計', COL.fg3, 'right', '10px', b.w - 12);
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
    var ev = PHO.evaluate(S.design);
    document.getElementById('statLeft').textContent =
      'SNR ' + (ev.SNR >= 100 ? ev.SNR.toFixed(0) : ev.SNR.toFixed(2)) + '（帯域 ' + S.design.bmhz + ' MHz）';
    document.getElementById('statRight').textContent =
      'NEP ' + ev.NEP.toExponential(2) + ' W/√Hz　D* ' + ev.Dstar.toExponential(2);
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
    try { ev = PHO.evaluate(S.design); } catch (e) { document.getElementById('derived').textContent = '計算できませんでした: ' + e.message; return; }
    var rows = [
      ['光のパワー', ev.P.toExponential(1) + ' W'],
      ['光子の到着率', ev.phi.toExponential(2) + ' 個/s（1光子 ' + ev.Eph.toFixed(2) + ' eV）'],
      ['感度 R', ev.R.toFixed(3) + ' A/W'],
      ['光電流（M 倍前）', ev.Iph.toExponential(2) + ' A'],
      ['過剰雑音 F(M)', ev.F.toFixed(2) + (S.design.M > 1 ? '' : '（M=1 なので 1）')],
      ['ノイズ電流（出力）', ev.itot.toExponential(2) + ' A/√Hz'],
      ['SNR', ev.SNR >= 100 ? ev.SNR.toFixed(0) : ev.SNR.toFixed(2)],
      ['NEP', ev.NEP.toExponential(2) + ' W/√Hz'],
      ['D*', ev.Dstar.toExponential(2) + ' cm√Hz/W'],
      ['RC 帯域（50Ω）', (ev.fRC / 1e9).toFixed(2) + ' GHz'],
      ['数えるなら', ev.cps.toExponential(2) + ' counts/s']
    ];
    rows.push(['走行×RC の合成帯域', (ev.ftot / 1e9).toFixed(1) + ' GHz（走行 ' + (ev.ftr / 1e9).toFixed(1) + ' / RC ' + (ev.fRCw / 1e9).toFixed(1) + '）']);
    if (S.design.bgnw > 0) rows.push(['背景光の電流', ev.Ibg.toExponential(2) + ' A（ショット床の主）', ev.Ibg > ev.Iph]);
    if (S.design.dkcps > 0 || S.design.bgnw > 0) rows.push(['計数 SNR（' + S.design.tsec + ' s）', ev.snrCount >= 100 ? ev.snrCount.toFixed(0) : ev.snrCount.toFixed(2)]);
    if (ev.pmtM !== undefined) rows.push(['PMT 換算 δⁿ / F', ev.pmtM.toExponential(2) + ' / ' + ev.pmtF.toFixed(3)]);
    if (ev.fired !== undefined) rows.push(['MPPC 発火 / μ', ev.fired.toFixed(0) + ' / ' + ev.mu.toFixed(0) + '（目減り ' + (ev.linerr * 100).toFixed(2) + '%）', ev.linerr > 0.05]);
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

  PH.ui = { mount: mount, get state() { return S; }, selectQuest: selectQuest };
})(typeof window !== 'undefined' ? window : globalThis);
