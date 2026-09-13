/* 画面 ― ブラウザに触るのはこのファイルと main.js だけ
 *
 * 真ん中は2枚の図（どちらも analog.evaluate と同じ式から描く。図に嘘はない）:
 *   左  |利得| と RD（両対数）― RD を上げても gm·ro の壁で頭打ちになる
 *   右  GBW と 電力（両対数）― W/L 固定なら傾き 1/2。電力4倍で帯域2倍しか買えない
 */
(function (global) {
  'use strict';
  var AN = global.AN;
  var A = AN.analog, Q = AN.quest, ANS = AN.answer, STORE = AN.store;

  var S = null, cv, ctx, DPR = 1;
  var COL = { bg: '#14171c', panel: '#191d24', line: '#2f3642', fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f',
              light: '#5aa9e6', now: '#ffffff', wall: '#ffab40' };

  /* ---- 設計の欄 [key, 名前, 単位, min, max, 整数?] ---- */
  var FIELDS = [
    ['vdd', '電源', 'V', 1.0, 3.3],
    ['lam', 'チャネル長変調 λ', '/V', 0.02, 0.5],
    ['wl', 'W/L', '', 1, 2000],
    ['idua', 'ドレイン電流', 'µA（差動は片側）', 1, 2000],
    ['rdk', '負荷抵抗 RD', 'kΩ', 0.1, 1000],
    ['clpf', '負荷容量 CL', 'pF', 0.05, 100],
    ['rfk', 'TIA の帰還抵抗 Rf', 'kΩ', 0.1, 100000],
    ['cpdpf', 'PD の容量', 'pF', 0.1, 50],
    ['cffF', 'チャージアンプの Cf', 'fF', 0.5, 50],
    ['qe', '入力電荷', 'e−', 100, 100000, true],
    ['fsmhz', 'SC のクロック', 'MHz', 0.01, 100],
    ['cscpf', 'SC の容量', 'pF', 0.05, 50],
    ['idua2', '第2段の電流', 'µA', 1, 2000],
    ['wl2', '第2段の W/L', '', 1, 2000],
    ['ccpf', 'ミラー補償 Cc', 'pF', 0.1, 50],
    ['nbit', 'ADC のビット数', 'bit', 4, 24, true],
    ['fsv', 'ADC の満量程', 'V', 0.1, 5],
    ['cadcpf', '標本化の容量', 'pF', 0.01, 1000],
    ['vin', 'DC-DC の入力', 'V', 1, 60],
    ['vout', 'DC-DC の出力', 'V', 0.5, 60],
    ['fswmhz', 'スイッチの周波数', 'MHz', 0.01, 10],
    ['luh', 'コイル', 'µH', 0.1, 1000],
    ['tcinpf', 'TIA の入力の容量 Cin', 'pF', 0.1, 100],
    ['tgbwmhz', '増幅器の GBW', 'MHz', 0.1, 10000],
    ['tcffF', 'TIA の帰還容量 Cf', 'fF', 0, 10000],
    ['mref', 'ミラーの基準電流', 'µA', 1, 1000],
    ['mratio', 'ミラーの W/L の比', '倍', 0.1, 20],
    ['mdvds', 'ドレイン電圧の差', 'V', 0, 3],
    ['mcasc', 'ミラーの種類', '0 単純 / 1 カスコード', 0, 1, true],
    ['bgn', 'バンドギャップの面積比 n', '', 2, 64, true],
    ['bgm', 'PTAT の倍率 m', '', 0, 50],
    ['vbe0', 'V_BE（300 K）', 'V', 0.3, 1.0],
    ['dvbe', 'V_BE の温度係数', 'mV/K', -3, -0.5]
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
    var pw = Math.max(80, colW - Lm - Rm);
    /* 高さがあれば 2 段: 上に利得と GBW、下に第5章の TIA の周波数特性とバンドギャップ */
    var rows = h >= 380 ? 2 : 1, rowH = (h - (rows - 1) * 8) / rows;
    var ph = Math.max(60, rowH - top - bottom);
    drawGainR({ x: Lm, y: top, w: pw, h: ph });
    drawGbwP({ x: colW + gap + Lm, y: top, w: pw, h: ph });
    if (rows === 2) {
      var y2 = rowH + 8 + top;
      drawTia({ x: Lm, y: y2, w: pw, h: ph });
      drawBg({ x: colW + gap + Lm, y: y2, w: pw, h: ph });
    }
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

  function drawGainR(b) {
    frameBox(b, '|利得| と RD ― 上げても gm·ro の壁（橙）で頭打ち');
    var pts = A.gainSweep(S.design, 1, 1000, 90);
    var ev = A.evaluate(S.design);
    var ymax = Math.max(ev.avint * 1.5, 10);
    var Ax = axes(b, [1, 1000], [0.1, ymax], 'RD [kΩ]', '|Av|');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.strokeStyle = COL.wall; ctx.setLineDash([4, 4]);
    line(b.x, Ax.Y(ev.avint), b.x + b.w, Ax.Y(ev.avint)); ctx.setLineDash([]);
    ctx.strokeStyle = COL.light; ctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(Ax.X(p.rdk), Ax.Y(p.av)); else ctx.lineTo(Ax.X(p.rdk), Ax.Y(p.av)); });
    ctx.stroke();
    dot(Ax.X(S.design.rdk), Ax.Y(ev.avr), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '橙 = gm·ro（素の利得）・白 = 今の設計', COL.fg3, 'right', '10px', b.w - 12);
  }

  function drawGbwP(b) {
    frameBox(b, 'GBW と 電力（W/L は今の値のまま Id を掃く）― 傾き 1/2');
    var pts = A.gbwSweep(S.design, 1, 2000, 90);
    var ev = A.evaluate(S.design);
    var ys = pts.map(function (p) { return p.gbw; });
    var Ax = axes(b, [pts[0].p, pts[pts.length - 1].p], [Math.min.apply(null, ys) / 2, Math.max.apply(null, ys) * 2], '電力 [W]', 'GBW [Hz]');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.strokeStyle = COL.light; ctx.beginPath();
    pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(Ax.X(p.p), Ax.Y(p.gbw)); else ctx.lineTo(Ax.X(p.p), Ax.Y(p.gbw)); });
    ctx.stroke();
    dot(Ax.X(ev.p), Ax.Y(ev.gbw), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '電力4倍 → 帯域2倍（√）・白 = 今の設計', COL.fg3, 'right', '10px', b.w - 12);
  }

  function drawTia(b) {
    frameBox(b, 'TIA の |Z|/Rf ― Cf が小さいと山が立つ（第6部 16）');
    var pts = A.tiaSweep(S.design, 160), ev = A.evaluate(S.design);
    var Ax = axes(b, [1e4, 1e8], [0.01, 100], '周波数 [Hz]', '|Z| / Rf');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.strokeStyle = COL.wall; ctx.setLineDash([4, 4]);
    line(b.x, Ax.Y(Math.SQRT1_2), b.x + b.w, Ax.Y(Math.SQRT1_2)); ctx.setLineDash([]);
    ctx.strokeStyle = COL.light; ctx.beginPath();
    pts.forEach(function (p, i) {
      var y = Ax.Y(Math.max(0.01, Math.min(100, p.h)));
      if (i === 0) ctx.moveTo(Ax.X(p.f), y); else ctx.lineTo(Ax.X(p.f), y);
    });
    ctx.stroke();
    if (isFinite(ev.tbw) && ev.tbw >= 1e4 && ev.tbw <= 1e8) dot(Ax.X(ev.tbw), Ax.Y(Math.SQRT1_2), COL.now, 3.5);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '橙 = −3 dB・白 = 帯域 ' + (isFinite(ev.tbw) ? (ev.tbw / 1e6).toFixed(2) + ' MHz' : '―') + '・山 ' + ev.tpeak.toFixed(2) + ' 倍', COL.fg3, 'right', '10px', b.w - 12);
  }

  /* 線形の目盛り（バンドギャップの図の用） */
  function linAxes(b, xr, yr, xl, yl, nx, ny) {
    var X = function (v) { return b.x + b.w * (v - xr[0]) / (xr[1] - xr[0] || 1); };
    var Y = function (v) { return b.y + b.h * (1 - (v - yr[0]) / (yr[1] - yr[0] || 1)); };
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    var i, v;
    for (i = 0; i <= nx; i++) { v = xr[0] + (xr[1] - xr[0]) * i / nx; line(X(v), b.y, X(v), b.y + b.h); label(X(v), b.y + b.h + 12, v.toFixed(0), COL.fg3, 'center', '9px'); }
    for (i = 0; i <= ny; i++) { v = yr[0] + (yr[1] - yr[0]) * i / ny; line(b.x, Y(v), b.x + b.w, Y(v)); label(b.x - 4, Y(v) + 3, v.toFixed(2), COL.fg3, 'right', '9px'); }
    ctx.globalAlpha = 1;
    label(b.x + b.w / 2, b.y + b.h + 26, xl, COL.fg3, 'center', '10px');
    ctx.save(); ctx.translate(b.x - 44, b.y + b.h / 2); ctx.rotate(-Math.PI / 2); label(0, 0, yl, COL.fg3, 'center', '10px'); ctx.restore();
    return { X: X, Y: Y };
  }

  function drawBg(b) {
    frameBox(b, 'バンドギャップ ― V_BE（橙）＋ m·V_T·ln n（青）＝ 和（白）');
    var pts = A.bgSweep(S.design, 60), ev = A.evaluate(S.design), ys = [];
    pts.forEach(function (p) { ys.push(p.vbe, p.ptat, p.v); });
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), pad = (y1 - y0) * 0.12 || 0.1;
    var Ax = linAxes(b, [-40, 125], [y0 - pad, y1 + pad], '温度 [℃]', '電圧 [V]', 5, 4);
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    [['vbe', COL.wall], ['ptat', COL.light], ['v', COL.now]].forEach(function (s) {
      ctx.strokeStyle = s[1]; ctx.beginPath();
      pts.forEach(function (p, i) { if (i === 0) ctx.moveTo(Ax.X(p.tc), Ax.Y(p[s[0]])); else ctx.lineTo(Ax.X(p.tc), Ax.Y(p[s[0]])); });
      ctx.stroke();
    });
    ctx.restore();
    label(b.x + b.w - 6, b.y + b.h - 8, '和の傾き ' + ev.bgTC.toFixed(3) + ' mV/K・Vref ' + ev.bgV.toFixed(3) + ' V', COL.fg3, 'right', '10px', b.w - 12);
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
    var ev = A.evaluate(S.design);
    document.getElementById('statLeft').textContent =
      'Vov ' + ev.Vov.toFixed(3) + ' V　gm ' + (ev.gm * 1000).toFixed(2) + ' mS　|Av| ' + ev.avr.toFixed(1);
    document.getElementById('statRight').textContent =
      'GBW ' + (ev.gbw / 1e6).toFixed(0) + ' MHz　P ' + (ev.p * 1000).toFixed(2) + ' mW';
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
    try { ev = A.evaluate(S.design); } catch (e) { document.getElementById('derived').textContent = '計算できませんでした: ' + e.message; return; }
    var rows = [
      ['Vov', ev.Vov.toFixed(3) + ' V'],
      ['gm', (ev.gm * 1000).toFixed(3) + ' mS（gm/Id ' + ev.gmid.toFixed(1) + ' S/A）'],
      ['ro', (ev.ro / 1000).toFixed(0) + ' kΩ'],
      ['|利得|（抵抗負荷）', ev.avr.toFixed(2) + '（gm·RD∥ro）'],
      ['素の利得 gm·ro', ev.avint.toFixed(1) + '（= 2/(λVov)）'],
      ['出力の動作点', ev.voutdc.toFixed(2) + ' V（下余裕 ' + ev.headLo.toFixed(2) + ' / 上 ' + ev.headHi.toFixed(2) + '）', ev.headLo < 0],
      ['差動利得 gm·RD', ev.adm.toFixed(2)],
      ['GBW', (ev.gbw / 1e6).toFixed(1) + ' MHz（CL ' + S.design.clpf + ' pF）'],
      ['消費電力', (ev.p * 1000).toFixed(3) + ' mW'],
      ['入力換算の熱雑音', (ev.vnmos * 1e9).toFixed(2) + ' nV/√Hz'],
      ['TIA: 帯域 / Rf 雑音', (ev.btia / 1e6).toFixed(2) + ' MHz / ' + (ev.irf * 1e12).toFixed(2) + ' pA/√Hz'],
      ['チャージアンプ: Q/Cf', (ev.vq * 1000).toFixed(1) + ' mV（kTC ' + ev.ktc.toFixed(1) + ' e−）'],
      ['SC: 等価抵抗 1/(fC)', (ev.reqsc / 1e6).toFixed(2) + ' MΩ（√(kT/C) ' + (ev.vktcsc * 1e6).toFixed(1) + ' µV）'],
      ['2段OTA: GBW / PM', (ev.gbw2 / 1e6).toFixed(1) + ' MHz / ' + ev.pm.toFixed(1) + '°（全体 ' + (ev.ptot * 1000).toFixed(2) + ' mW）', ev.pm < 45],
      ['ADC: 量子化 / kT/C', (ev.vqadc * 1e6).toFixed(1) + ' / ' + (ev.vktcadc * 1e6).toFixed(1) + ' µV（ENOB ' + ev.enob.toFixed(2) + '）', ev.vktcadc > ev.vqadc],
      ['DC-DC: D / ΔI', ev.duty.toFixed(3) + ' / ' + ev.dIbuck.toFixed(3) + ' A'],
      ['TIA: ζ / 山 / 帯域', ev.tzeta.toFixed(3) + ' / ' + ev.tpeak.toFixed(2) + ' 倍 / ' + (isFinite(ev.tbw) ? (ev.tbw / 1e6).toFixed(3) + ' MHz' : '―') + '（Rf ' + S.design.rfk + ' kΩ）', ev.tpeak > 1.05],
      ['ミラー: 誤差 / 出力に要る電圧', (ev.mErr * 100).toFixed(3) + ' % / ' + ev.mHead.toFixed(3) + ' V（' + (S.design.mcasc ? 'カスコード' : '単純') + '・gm·ro ' + ev.mgmro.toFixed(0) + '）'],
      ['バンドギャップ: 傾き / Vref', ev.bgTC.toFixed(3) + ' mV/K / ' + ev.bgV.toFixed(3) + ' V（傾きが消える m ' + ev.bgMzero.toFixed(2) + '）', Math.abs(ev.bgTC) > 0.05]
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

  AN.ui = { mount: mount, get state() { return S; }, selectQuest: selectQuest };
})(typeof window !== 'undefined' ? window : globalThis);
