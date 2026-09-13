/* 画面 ― ブラウザに触るのはこのファイルと main.js だけ
 *
 * 真ん中は2枚の図（どちらも qa.evaluate と同じ式から描く。図に嘘はない）:
 *   左  試験温度を掃く ― 必要な試験時間が指数で落ちる（アレニウス加速の相場観）
 *   右  ΔT を掃く ― TEC の吸熱が直線で減る（冷却の請求書。破線 = 熱負荷）
 */
(function (global) {
  'use strict';
  var QA = global.QA;
  var M = QA.qa, Q = QA.quest, ANS = QA.answer, STORE = QA.store;

  var S = null, cv, ctx, DPR = 1;
  var COL = { bg: '#14171c', panel: '#191d24', line: '#2f3642', fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f',
              light: '#5aa9e6', warm: '#ffab40', now: '#ffffff' };

  var FIELDS = [
    ['fitr', '部品の故障率', 'FIT', 0.1, 10000],
    ['nser', '直列の部品数', '個', 1, 10000, true],
    ['ea', '活性化エネルギー', 'eV', 0.1, 1.5],
    ['tuse', '使用温度', '℃', -40, 125, true],
    ['tstr', '試験温度', '℃', 25, 300, true],
    ['lifey', '実証したい寿命', '年', 1, 30, true],
    ['mweib', 'ワイブル形状 m', '', 0.2, 5],
    ['etah', 'ワイブル尺度 η', 'h', 100, 1000000],
    ['pwr', '発熱', 'W', 0.01, 50],
    ['thjc', 'θjc', 'K/W', 0.1, 20],
    ['thcs', 'θcs', 'K/W', 0.05, 5],
    ['thsa', 'θsa（放熱器）', 'K/W', 0.1, 100],
    ['tamb', '周囲温度', '℃', -20, 60, true],
    ['qmax', 'TEC の Qmax', 'W', 0.5, 50],
    ['dtmax', 'TEC の ΔTmax', 'K', 30, 130],
    ['dtc', '使う温度差 ΔT', 'K', 0, 120],
    ['qload', '熱負荷', 'W', 0.01, 20],
    ['sigma', '工程の σ', '', 0.001, 1],
    ['muoff', '中心のずれ', '', 0, 1],
    ['tol', '規格の片幅 ±', '', 0.05, 2],
    ['s1', '誤差 A', '%', 0.01, 5],
    ['s2', '誤差 B', '%', 0.01, 5],
    ['rhu', '使用の湿度', '%RH', 10, 100, true],
    ['rhs', '湿度試験の湿度', '%RH', 10, 100, true],
    ['thu', '湿度試験の使用温度', '℃', 0, 60, true],
    ['ths', '湿度試験の温度', '℃', 25, 130, true],
    ['npeck', 'Peck のべき n', '（原典 2.7・慣例 3）', 1, 5],
    ['eah', '湿度側の Ea', 'eV', 0.3, 1.2],
    ['dtu', '使用のΔT', 'K（1日の温度振幅）', 5, 100],
    ['dts', '試験のΔT', 'K', 30, 250],
    ['ncm', 'Coffin-Manson の n', '（はんだ ≈ 2）', 1, 6],
    ['cyd', '使用のサイクル', '回/日', 0.1, 100],
    ['srpt', '測定の繰り返し σ', '', 0.0001, 0.5],
    ['srpd', '測定の再現性 σ', '（人・日・器差）', 0.0001, 0.5],
    ['klim', '管理限界の幅 k', 'σ', 1, 5],
    ['ngrp', '群の大きさ n', '個', 1, 25, true],
    ['shsig', '見つけたい平均のずれ', 'σ', 0.1, 5],
    ['ucal', '校正の拡張不確かさ U', '%（k = 2）', 0.1, 10],
    ['resd', '表示の分解能（半幅）', '%', 0, 5],
    ['srep', '1 回の読みの繰り返し', '%', 0, 5],
    ['nrep', '平均の回数', '回', 1, 1000, true],
    ['tco', '温度の影響（半幅）', '%', 0, 5]
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
    drawAccel({ x: Lm, y: top, w: pw, h: ph });
    drawTec({ x: colW + gap + Lm, y: top, w: pw, h: ph });
    updateStatus();
  }

  function frameBox(b, title) {
    ctx.fillStyle = COL.panel; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COL.line; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    label(b.x, b.y - 6, title, COL.fg2, 'left', '11px', b.w);
  }

  function drawAccel(b) {
    frameBox(b, '試験温度と、必要な試験時間（縦は対数）― アレニウスの割引');
    var pts = M.afSweep(S.design, 60, 200, 80);
    var ys = pts.map(function (p) { return p.testH; }).filter(function (v) { return v > 0 && isFinite(v); });
    var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    var y0 = Math.log10(Math.max(ymin / 2, 1e-2)), y1 = Math.log10(ymax * 2);
    var X = function (t) { return b.x + b.w * (t - 60) / 140; };
    var Y = function (v) { return b.y + b.h * (1 - (Math.log10(v) - y0) / (y1 - y0 || 1)); };
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    var i;
    for (i = 60; i <= 200; i += 20) { line(X(i), b.y, X(i), b.y + b.h); label(X(i), b.y + b.h + 12, i + '', COL.fg3, 'center', '9px'); }
    for (i = Math.ceil(y0); i <= y1; i++) { var yy = Y(Math.pow(10, i)); line(b.x, yy, b.x + b.w, yy); label(b.x - 4, yy + 3, '1e' + i, COL.fg3, 'right', '9px'); }
    ctx.globalAlpha = 1;
    label(b.x + b.w / 2, b.y + b.h + 26, '試験温度 [℃]', COL.fg3, 'center', '10px');
    ctx.save(); ctx.translate(b.x - 44, b.y + b.h / 2); ctx.rotate(-Math.PI / 2); label(0, 0, '必要な試験時間 [h]', COL.fg3, 'center', '10px'); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.strokeStyle = COL.light; ctx.beginPath();
    var started = false;
    pts.forEach(function (p) {
      if (!(p.testH > 0)) return;
      if (!started) { ctx.moveTo(X(p.t), Y(p.testH)); started = true; } else ctx.lineTo(X(p.t), Y(p.testH));
    });
    ctx.stroke();
    var ev = M.evaluate(S.design);
    if (S.design.tstr >= 60 && S.design.tstr <= 200) dot(X(S.design.tstr), Y(ev.testH), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, 'Ea ' + S.design.ea + ' eV・白 = 今の設計', COL.fg3, 'right', '10px', b.w - 12);
  }

  function drawTec(b) {
    frameBox(b, 'ΔT と TEC の吸熱 ― 深く冷やすほど吸えない（冷却の請求書）');
    var pts = M.tecSweep(S.design, 80);
    var qmax = S.design.qmax;
    var X = function (dt) { return b.x + b.w * dt / S.design.dtmax; };
    var Y = function (q) { return b.y + b.h * (1 - q / (qmax * 1.1)); };
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    var i;
    for (i = 0; i <= S.design.dtmax; i += 10) { line(X(i), b.y, X(i), b.y + b.h); label(X(i), b.y + b.h + 12, i + '', COL.fg3, 'center', '9px'); }
    for (i = 0; i <= qmax; i += Math.max(1, Math.round(qmax / 5))) { var yy = Y(i); line(b.x, yy, b.x + b.w, yy); label(b.x - 4, yy + 3, i + '', COL.fg3, 'right', '9px'); }
    ctx.globalAlpha = 1;
    label(b.x + b.w / 2, b.y + b.h + 26, 'ΔT [K]', COL.fg3, 'center', '10px');
    ctx.save(); ctx.translate(b.x - 44, b.y + b.h / 2); ctx.rotate(-Math.PI / 2); label(0, 0, '吸熱 Qc [W]', COL.fg3, 'center', '10px'); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.strokeStyle = COL.warm; ctx.setLineDash([4, 4]);
    line(b.x, Y(S.design.qload), b.x + b.w, Y(S.design.qload)); ctx.setLineDash([]);
    ctx.strokeStyle = COL.light; ctx.beginPath();
    pts.forEach(function (p, k) { if (k === 0) ctx.moveTo(X(p.dt), Y(p.qc)); else ctx.lineTo(X(p.dt), Y(p.qc)); });
    ctx.stroke();
    var ev = M.evaluate(S.design);
    dot(X(Math.min(S.design.dtc, S.design.dtmax)), Y(ev.qc), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '橙の破線 = 熱負荷・白 = 今の設計', COL.fg3, 'right', '10px', b.w - 12);
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
    var ev = M.evaluate(S.design);
    document.getElementById('statLeft').textContent =
      'MTTF ' + ev.mttfY.toFixed(1) + ' 年　Tj ' + ev.tj.toFixed(1) + ' ℃';
    document.getElementById('statRight').textContent =
      'Cpk ' + ev.cpk.toFixed(2) + '（' + (ev.ppm < 1 ? ev.ppm.toExponential(1) : ev.ppm.toFixed(0)) + ' ppm）';
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
      ['系の故障率', ev.lamFit.toFixed(0) + ' FIT'],
      ['MTTF', ev.mttfY.toFixed(1) + ' 年（' + (ev.mttfH / 1000).toFixed(0) + ' kh）'],
      ['加速係数 AF', ev.af.toFixed(1) + '（' + S.design.tuse + '→' + S.design.tstr + '℃・Ea ' + S.design.ea + 'eV）'],
      ['必要な試験時間', ev.testH.toFixed(0) + ' h（寿命 ' + S.design.lifey + ' 年ぶん）'],
      ['ワイブル B10', ev.b10H.toFixed(0) + ' h（m=' + S.design.mweib + '）'],
      ['湿度加速（Peck）', 'AF ' + ev.afh.toFixed(1) + ' → ' + ev.testHh.toFixed(0) + ' h（' + S.design.ths + '℃/' + S.design.rhs + '%RH）'],
      ['温度サイクル（C-M）', 'AF ' + ev.afcm.toFixed(1) + ' → ' + ev.testCyc.toFixed(0) + ' 回（ΔT ' + S.design.dts + ' K）'],
      ['θ合計 / Tj', ev.thTot.toFixed(1) + ' K/W / ' + ev.tj.toFixed(1) + ' ℃', ev.tj > 85],
      ['TEC の吸熱 Qc(ΔT)', ev.qc.toFixed(2) + ' W（負荷 ' + S.design.qload + ' W）', !ev.tecOk],
      ['Cpk', ev.cpk.toFixed(3)],
      ['予想不良率', (ev.ppm < 1 ? ev.ppm.toExponential(2) : ev.ppm.toFixed(1)) + ' ppm'],
      ['合成誤差 √(A²+B²)', ev.stot.toFixed(3) + ' %'],
      ['%GR&R（公差比）', (ev.pgrr * 100).toFixed(1) + ' %', ev.pgrr > 0.3],
      ['管理図 ARL₀ / ARL₁', ev.arl0.toFixed(0) + ' 群 / ' + ev.arl1.toFixed(1) + ' 群（空振り / 見逃し）', ev.arl0 < 100],
      ['不確かさ u_c / U（k=2）', ev.ucg.toFixed(3) + ' % / ' + ev.Ug.toFixed(3) + ' %']
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

  QA.ui = { mount: mount, get state() { return S; }, selectQuest: selectQuest };
})(typeof window !== 'undefined' ? window : globalThis);
