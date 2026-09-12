/* 画面 ― ブラウザに触るのはこのファイルと main.js だけ
 *
 * 真ん中は3枚の測定図（すべて char.js の同じ式から描く。図に嘘はない）:
 *   左   謎のダイオード D の I-V（縦は対数）― 直線・傾き・てっぺんの曲がり
 *   中   謎の MOSFET M の Id-Vg（青=線形・橙=対数）― 外挿の直線と裾の傾き
 *   右   謎の MOS 容量 C の C-V ― 2つの棚と肩
 * 左の欄は「答案」。測定表から自分で計算した値を書き込んで、採点にかける。
 */
(function (global) {
  'use strict';
  var CL = global.CL;
  var M = CL.char, Q = CL.quest, ANS = CL.answer, STORE = CL.store;

  var S = null, cv, ctx, DPR = 1;
  var COL = { bg: '#14171c', panel: '#191d24', line: '#2f3642', fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f',
              light: '#5aa9e6', warm: '#ffab40', now: '#ffffff' };

  var FIELDS = [
    ['nfit', 'D: 理想係数 n', '', 0.5, 5],
    ['isfit', 'D: 飽和電流 Is', 'A', 1e-18, 1e-6],
    ['rsfit', 'D: 直列抵抗 Rs', 'Ω', 0.01, 1000],
    ['vthfit', 'M: しきい値 Vth', 'V', 0, 3],
    ['kwlfit', 'M: µCox·W/L', 'A/V²', 1e-6, 1e-1],
    ['ssfit', 'M: S 値', 'mV/dec', 55, 500],
    ['toxfit', 'C: 酸化膜厚 tox', 'nm', 0.5, 100],
    ['nafit', 'C: 基板濃度 Na', 'cm⁻³', 1e14, 1e19],
    ['vfbfit', 'C: フラットバンド Vfb', 'V', -3, 3]
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

    var gap = 14, Lm = 50, Rm = 8, top = 22, bottom = 40;
    var colW = (w - gap * 2) / 3;
    var pw = Math.max(70, colW - Lm - Rm), ph = Math.max(60, h - top - bottom);
    var T = M.tables();
    drawDiode({ x: Lm, y: top, w: pw, h: ph }, T.dio);
    drawMos({ x: colW + gap + Lm, y: top, w: pw, h: ph }, T.mos);
    drawCv({ x: 2 * (colW + gap) + Lm, y: top, w: pw, h: ph }, T.cv);
    updateStatus();
  }

  function frameBox(b, title) {
    ctx.fillStyle = COL.panel; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COL.line; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    label(b.x, b.y - 6, title, COL.fg2, 'left', '11px', b.w);
  }

  function drawDiode(b, pts) {
    frameBox(b, '謎のダイオード D ― I-V（縦は対数）');
    var y0 = -13, y1 = -1;
    var X = function (v) { return b.x + b.w * (v - 0.3) / 0.6; };
    var Y = function (i) { return b.y + b.h * (1 - (Math.log10(Math.max(i, 1e-14)) - y0) / (y1 - y0)); };
    grid(b, [0.3, 0.5, 0.7, 0.9], function (v) { return X(v); }, function (v) { return v.toFixed(1); },
      [-12, -9, -6, -3], function (e) { return Y(Math.pow(10, e)); }, function (e) { return '1e' + e; });
    label(b.x + b.w / 2, b.y + b.h + 26, 'V [V]', COL.fg3, 'center', '10px');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.strokeStyle = COL.light; ctx.beginPath();
    pts.forEach(function (p, k) { if (k === 0) ctx.moveTo(X(p.v), Y(p.i)); else ctx.lineTo(X(p.v), Y(p.i)); });
    ctx.stroke();
    pts.forEach(function (p) { dot(X(p.v), Y(p.i), COL.now, 2); });
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '上で寝るのが Rs', COL.fg3, 'right', '10px', b.w - 12);
  }

  function drawMos(b, pts) {
    frameBox(b, '謎の MOSFET M ― Id-Vg（青=線形・橙=対数）');
    var idMax = pts[pts.length - 1].id;
    var X = function (vg) { return b.x + b.w * (vg - 0.2) / 1.2; };
    var Yl = function (i) { return b.y + b.h * (1 - i / (idMax * 1.1)); };
    var Yg = function (i) { return b.y + b.h * (1 - (Math.log10(Math.max(i, 1e-12)) - (-11)) / 7); };
    grid(b, [0.2, 0.6, 1.0, 1.4], function (v) { return X(v); }, function (v) { return v.toFixed(1); },
      [], null, null);
    label(b.x + b.w / 2, b.y + b.h + 26, 'Vg [V]（Vd = 50 mV）', COL.fg3, 'center', '10px');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.strokeStyle = COL.warm; ctx.beginPath();
    pts.forEach(function (p, k) { if (k === 0) ctx.moveTo(X(p.vg), Yg(p.id)); else ctx.lineTo(X(p.vg), Yg(p.id)); });
    ctx.stroke();
    ctx.strokeStyle = COL.light; ctx.beginPath();
    pts.forEach(function (p, k) { if (k === 0) ctx.moveTo(X(p.vg), Yl(p.id)); else ctx.lineTo(X(p.vg), Yl(p.id)); });
    ctx.stroke();
    pts.forEach(function (p) { dot(X(p.vg), Yl(p.id), COL.now, 2); });
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '青の直線の外挿が Vth', COL.fg3, 'right', '10px', b.w - 12);
  }

  function drawCv(b, pts) {
    frameBox(b, '謎の MOS 容量 C ― C-V（高周波）');
    var cox = pts[0].c;
    var X = function (vg) { return b.x + b.w * (vg + 2) / 4; };
    var Y = function (c) { return b.y + b.h * (1 - c / (cox * 1.1)); };
    grid(b, [-2, -1, 0, 1, 2], function (v) { return X(v); }, function (v) { return v + ''; },
      [], null, null);
    label(b.x + b.w / 2, b.y + b.h + 26, 'Vg [V]', COL.fg3, 'center', '10px');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    ctx.strokeStyle = COL.light; ctx.beginPath();
    pts.forEach(function (p, k) { if (k === 0) ctx.moveTo(X(p.vg), Y(p.c)); else ctx.lineTo(X(p.vg), Y(p.c)); });
    ctx.stroke();
    pts.forEach(function (p) { dot(X(p.vg), Y(p.c), COL.now, 2); });
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '棚が Cox と Cmin', COL.fg3, 'right', '10px', b.w - 12);
  }

  function grid(b, xs, X, xf, ys, Y, yf) {
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    xs.forEach(function (v) { line(X(v), b.y, X(v), b.y + b.h); label(X(v), b.y + b.h + 12, xf(v), COL.fg3, 'center', '9px'); });
    if (ys && ys.length) ys.forEach(function (v) { var yy = Y(v); line(b.x, yy, b.x + b.w, yy); label(b.x - 4, yy + 3, yf(v), COL.fg3, 'right', '9px'); });
    ctx.globalAlpha = 1;
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
    var done = Object.keys(S.cleared).length;
    document.getElementById('statLeft').textContent =
      '謎の素子 D・M・C ― 測定表は左の下';
    document.getElementById('statRight').textContent =
      '当てたパラメータ ' + done + ' / ' + Q.LIST.length;
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

  /* 測定表 ― 真の素子から出た数字そのもの（答案とは独立。ここに嘘はない） */
  function renderDerived() {
    var T;
    try { T = M.tables(); } catch (e) { document.getElementById('derived').textContent = '計算できませんでした: ' + e.message; return; }
    var rows = [];
    rows.push(['― ダイオード D ―', 'V → I']);
    T.dio.forEach(function (p) { rows.push([p.v.toFixed(2) + ' V', p.i.toExponential(3) + ' A']); });
    rows.push(['― MOSFET M ―', 'Vg → Id（Vd 50mV）']);
    T.mos.forEach(function (p) { rows.push([p.vg.toFixed(1) + ' V', p.id.toExponential(3) + ' A']); });
    rows.push(['― MOS 容量 C ―', 'Vg → C']);
    T.cv.forEach(function (p) { rows.push([p.vg.toFixed(2) + ' V', (p.c * 1e9).toFixed(1) + ' nF/cm²']); });
    document.getElementById('derived').innerHTML = '<div class="dv">' + rows.map(function (r) {
      return '<span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span>';
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
    if (!confirm('お手本（抽出の手順と正しい読み）を出します。答案は置き換わります。よろしいですか？')) return;
    S.design = a.design();
    renderDesign();
    requestDraw();
    document.getElementById('qResult').innerHTML = '<p class="mnote"><b>お手本の手順</b>: ' + esc(a.note) + '</p>';
    persist();
  }

  function persist() { if (!STORE.save(S)) document.getElementById('statRight').textContent = '（保存できませんでした）'; }

  CL.ui = { mount: mount, get state() { return S; }, selectQuest: selectQuest };
})(typeof window !== 'undefined' ? window : globalThis);
