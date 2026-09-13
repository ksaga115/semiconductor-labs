/* 画面 ― このファイルだけがブラウザに触る（ほかのラボと同じ）
 *
 * 真ん中は2段:
 *   上  断面。膜は材料の色、シリコンは正味の濃度で塗る（赤=p、青=n、濃いほど明るい）。
 *       白い点が接合（列ごとに解いた位置を打っているだけ。線を引いたのではない）
 *   下  縦に切った1本の濃度分布（対数）。B / P / As を別々に、正味の濃度を白で
 *
 * 左はレシピ。工程を選ぶと、その工程の**直後**のウェーハが出る。
 * だから上から順にクリックしていけば、断面が1工程ずつ育つのが見える。
 *
 * 【編集欄は数値欄と選択肢だけ】摘みは使わない。SemiLab で「動かしている最中に一覧を
 * 作り直して摘みが消える」を踏んだので、変更は change（Enter か欄を離れたとき）でだけ反映する。
 * マスクの塗り絵だけは、塗っている間は絵だけを描き替え、指を離したときに反映する。
 */
(function (global) {
  'use strict';
  var PL = global.PL;
  var G = PL.grid, R = PL.recipe, M = PL.measure, Q = PL.quest, ANS = PL.answer, STORE = PL.store, IMP = PL.implant, DF = PL.diffuse, OX = PL.oxide;

  var S = null, cv, ctx, DPR = 1;
  var run = null, runMs = 0, dirty = true;
  var secBox = null;

  var MATCOL = { ox: '#c9a227', nit: '#6fbf73', poly: '#b07a4a', metal: '#9aa4b1', resist: '#d86fb0' };
  var KINDCOL = { depo: '#c9a227', mask: '#d86fb0', etch: '#e5686d', strip: '#8a94a3', imp: '#4dd0e1', heat: '#ffab40' };
  var SPCOL = { B: '#ff9e5e', P: '#4dd0e1', As: '#b388ff' };
  var COL = { bg: '#14171c', panel: '#191d24', line: '#2f3642', fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f' };

  /* ================= 起動 ================= */

  function mount(state) {
    S = state;
    cv = document.getElementById('board');
    ctx = cv.getContext('2d');
    bind();
    renderQuestList();
    syncControls();
    window.addEventListener('resize', resize);
    resize();
    persist();
  }

  var raf = 0;
  function requestDraw() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; draw(); });
  }
  function resize() {
    DPR = window.devicePixelRatio || 1;
    var r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * DPR));
    cv.height = Math.max(1, Math.round(r.height * DPR));
    requestDraw();
  }

  /** レシピが変わったら必ずここを通る */
  function touch() {
    dirty = true;
    renderSteps();
    requestDraw();
    persist();
  }

  function now() { return (global.performance || Date).now(); }

  function recompute() {
    var t0 = now();
    run = R.run(S.recipe, run);
    runMs = now() - t0;
    dirty = false;
  }

  /** 今見ているウェーハ（選んでいる工程の直後） */
  function wafer() {
    if (dirty || !run) recompute();
    if (S.sel < 0 || !run.snaps.length) return run.start;
    return run.snaps[Math.min(S.sel, run.snaps.length - 1)];
  }

  function cutCol() { return G.colAt(S.cutX * G.UM); }

  /* ================= 絵 ================= */

  function draw() {
    var W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(DPR, DPR);
    var w = W / DPR, h = H / DPR;
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h);

    var wf = wafer();
    var L = 58, Rm = 16;
    var secH = Math.max(150, Math.round((h - 60) * 0.58));
    var profH = Math.max(90, h - secH - 64);
    secBox = { x: L, y: 10, w: Math.max(60, w - L - Rm), h: secH };
    var prof = { x: L, y: 10 + secH + 34, w: Math.max(60, w - L - Rm), h: profH };

    drawSection(secBox, wf);
    drawProfile(prof, wf);
    updateStatus(wf);
  }

  /* ---- 断面 ---- */

  function drawSection(b, wf) {
    var depth = (S.view.depth || 2) * G.UM;
    var fe = 0, ix;
    for (ix = 0; ix < G.NX; ix++) fe = Math.max(fe, -G.surfaceZ(wf, ix));
    /* 膜が厚すぎると断面が潰れるので、上は深さの 6 割までしか見せない（はみ出た膜は上で切れる） */
    var zTop = -Math.min(Math.max(fe * 1.08, 0.03 * G.UM), depth * 0.6);
    var zBot = depth;
    var Y = function (z) { return b.y + b.h * (z - zTop) / (zBot - zTop); };
    var cw = b.w / G.NX;

    ctx.fillStyle = COL.panel; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();

    /* シリコン ― 1行ずつ、正味の濃度で色を塗った絵を作って引き伸ばす */
    var y0 = Math.max(Y(0), b.y), y1 = Y(zBot);
    var nR = Math.max(8, Math.min(900, Math.round(y1 - y0)));
    var off = document.createElement('canvas');
    off.width = G.NX; off.height = nR;
    var octx = off.getContext('2d');
    var img = octx.createImageData(G.NX, nR);
    var zAt = function (r) { return zTop + ((y0 - b.y) + (r + 0.5) * (y1 - y0) / nR) / b.h * (zBot - zTop); };
    for (var r = 0; r < nR; r++) {
      var z = zAt(r), iz = findCell(z);
      for (ix = 0; ix < G.NX; ix++) {
        var o = (r * G.NX + ix) * 4;
        if (iz < 0 || z < wf.siTop[ix]) { img.data[o + 3] = 0; continue; }
        var c = dopeColor(G.net(wf, ix, iz));
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, b.x, y0, b.w, y1 - y0);

    /* 膜 ― 同じ積み方の列はまとめて1枚で描く */
    var s = 0;
    while (s < G.NX) {
      var key = colKey(wf, s), e = s + 1;
      while (e < G.NX && colKey(wf, e) === key) e++;
      var cur = wf.siTop[s], films = wf.films[s];
      for (var k = 0; k < films.length; k++) {
        var top = cur - films[k].t;
        ctx.fillStyle = MATCOL[films[k].mat] || '#888';
        ctx.globalAlpha = films[k].mat === 'resist' ? 0.75 : 0.9;
        ctx.fillRect(b.x + s * cw, Y(top), (e - s) * cw + 0.5, Y(cur) - Y(top));
        ctx.globalAlpha = 1;
        cur = top;
      }
      /* シリコン表面 */
      ctx.strokeStyle = 'rgba(221,227,236,.55)'; ctx.lineWidth = 1;
      line(b.x + s * cw, Y(wf.siTop[s]), b.x + e * cw, Y(wf.siTop[s]));
      s = e;
    }
    /* 列の段差（エッチや LOCOS の縁）を縦線でつなぐ */
    for (ix = 1; ix < G.NX; ix++) {
      var a0 = G.surfaceZ(wf, ix - 1), a1 = G.surfaceZ(wf, ix);
      if (Math.abs(a0 - a1) > 1e-9) {
        ctx.strokeStyle = 'rgba(221,227,236,.35)';
        line(b.x + ix * cw, Y(a0), b.x + ix * cw, Y(a1));
      }
    }

    /* 接合 ― 列ごとに解いた位置に点を打つ */
    ctx.fillStyle = '#ffffff';
    for (ix = 0; ix < G.NX; ix++) {
      var js = M.junctions(M.profile(wf, ix));
      for (var j = 0; j < js.length; j++) {
        var yy = Y(wf.siTop[ix] + js[j]);
        if (yy > b.y && yy < b.y + b.h) ctx.fillRect(b.x + ix * cw, yy - 0.8, cw + 0.3, 1.6);
      }
    }

    /* 切る位置 */
    var xc = b.x + b.w * S.cutX / 10;
    ctx.strokeStyle = '#ffffff'; ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.7;
    line(xc, b.y, xc, b.y + b.h);
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    if (fe * 1.08 > depth * 0.6) label(b.x + 6, b.y + 12, '↑ 膜が厚いので上を切ってある', COL.fg3, 'left', '10px');
    ctx.restore();

    ctx.strokeStyle = COL.line; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);

    /* 目盛 */
    for (var xu = 0; xu <= 10; xu++) {
      var xx = b.x + b.w * xu / 10;
      ctx.strokeStyle = COL.line; line(xx, b.y + b.h, xx, b.y + b.h + 4);
      label(xx, b.y + b.h + 15, xu + (xu === 10 ? ' µm' : ''), COL.fg3, 'center', '10px');
    }
    var dt = niceStep((zBot - zTop) / G.UM / 5);
    for (var zu = Math.ceil(zTop / G.UM / dt) * dt; zu <= zBot / G.UM + 1e-9; zu += dt) {
      var y2 = Y(zu * G.UM);
      label(b.x - 6, y2 + 3, (Math.abs(zu) < 1e-9 ? '0' : fmtNum(zu)) + ' µm', COL.fg3, 'right', '10px');
      ctx.strokeStyle = COL.line; line(b.x - 3, y2, b.x, y2);
    }
    legendFilms(b, wf);
  }

  function colKey(wf, ix) {
    var c = wf.films[ix], s = wf.siTop[ix].toExponential(6);
    for (var k = 0; k < c.length; k++) s += '|' + c[k].mat + c[k].t.toExponential(6);
    return s;
  }

  function findCell(z) {
    if (z < 0 || z >= G.DEPTH) return -1;
    var lo = 0, hi = G.NZ - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (G.ZE[mid] <= z) lo = mid; else hi = mid - 1; }
    return lo;
  }

  /** 正味の濃度 → 色。p は赤、n は青。1e14 から 1e21 までを明るさにする */
  function dopeColor(net) {
    var bg = [24, 27, 33];
    if (net === 0) return bg;
    var f = (Math.log10(Math.abs(net)) - 14) / 7;
    f = 0.18 + 0.82 * Math.max(0, Math.min(1, f));
    var base = net > 0 ? [74, 158, 255] : [232, 96, 84];
    return [bg[0] + (base[0] - bg[0]) * f, bg[1] + (base[1] - bg[1]) * f, bg[2] + (base[2] - bg[2]) * f];
  }

  function legendFilms(b, wf) {
    var seen = {}, ix, k;
    for (ix = 0; ix < G.NX; ix++) for (k = 0; k < wf.films[ix].length; k++) seen[wf.films[ix][k].mat] = true;
    var items = Object.keys(seen).map(function (m) { return [G.MAT[m].name, MATCOL[m]]; });
    items.push(['p 型', '#e86054'], ['n 型', '#4a9eff'], ['接合', '#ffffff']);
    var x = b.x + b.w - 6;
    ctx.font = '10px "Yu Gothic UI", Meiryo, sans-serif';
    for (var i = items.length - 1; i >= 0; i--) {
      var tw = ctx.measureText(items[i][0]).width;
      x -= tw;
      ctx.fillStyle = COL.fg2; ctx.textAlign = 'left'; ctx.fillText(items[i][0], x, b.y - 1);
      ctx.fillStyle = items[i][1]; ctx.fillRect(x - 11, b.y - 9, 8, 8);
      x -= 20;
    }
  }

  /* ---- 縦の分布 ---- */

  function drawProfile(b, wf) {
    var ix = cutCol(), p = M.profile(wf, ix);
    var depth = (S.view.depth || 2) * G.UM;
    ctx.fillStyle = COL.panel; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COL.line; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    label(b.x + 6, b.y - 6, S.cutX.toFixed(2) + ' µm で縦に切った濃度 [cm⁻³]（対数）', COL.fg2, 'left', '11px');

    var lo = 13, hi = 21;
    var X = function (z) { return b.x + b.w * z / depth; };
    var Yc = function (v) {
      var e = v > 0 ? Math.log10(v) : lo;
      e = Math.max(lo, Math.min(hi, e));
      return b.y + b.h * (1 - (e - lo) / (hi - lo));
    };
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    for (var e = lo; e <= hi; e++) {
      ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.5; line(b.x, Yc(Math.pow(10, e)), b.x + b.w, Yc(Math.pow(10, e))); ctx.globalAlpha = 1;
    }
    /* 基板 */
    ctx.strokeStyle = COL.fg3; ctx.setLineDash([3, 4]);
    line(b.x, Yc(wf.sub.N), b.x + b.w, Yc(wf.sub.N)); ctx.setLineDash([]);

    var js = M.junctions(p);
    js.forEach(function (zj) {
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.5; line(X(zj), b.y, X(zj), b.y + b.h); ctx.globalAlpha = 1;
    });

    var curve = function (arr, col, lw) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      var st = false;
      for (var k = 0; k < p.n; k++) {
        if (p.z[k] > depth * 1.02) break;
        var xx = X(p.z[k]), yy = Yc(arr[k]);
        if (!st) { ctx.moveTo(xx, yy); st = true; } else ctx.lineTo(xx, yy);
      }
      ctx.stroke(); ctx.lineWidth = 1;
    };
    var absNet = new Float64Array(p.n);
    for (var k = 0; k < p.n; k++) absNet[k] = Math.abs(p.net[k]);
    G.SPECIES.forEach(function (sp) { if (p[sp].some(function (v) { return v > wf.sub.N * 1e-3; })) curve(p[sp], SPCOL[sp], 1.6); });
    curve(absNet, '#ffffff', 1);
    ctx.restore();

    for (var e2 = lo; e2 <= hi; e2 += 2) label(b.x - 5, Yc(Math.pow(10, e2)) + 3, '1e' + e2, COL.fg3, 'right', '9px');
    var dt = niceStep(depth / G.UM / 5);
    for (var zu = 0; zu <= depth / G.UM + 1e-9; zu += dt) {
      label(X(zu * G.UM), b.y + b.h + 13, (zu === 0 ? '0' : fmtNum(zu)) + (zu === 0 ? '' : ' µm'), COL.fg3, 'center', '10px');
    }
    label(b.x - 5, b.y + b.h + 13, '表面から', COL.fg3, 'right', '10px');

    /* 右上に数字 */
    var sf = M.surface(wf, ix), rs = M.sheet(wf, ix), ox = M.oxideOn(wf, ix);
    var lines = [
      '表面 ' + (sf ? (sf.type === 'i' ? '真性' : sf.type + ' 型 ' + Math.abs(sf.net).toExponential(1)) : '―'),
      '接合 ' + (js.length ? js.map(function (z) { return fmtLen(z); }).join(', ') : 'なし'),
      'シート抵抗 ' + (rs === null ? '―' : (isFinite(rs) ? rs.toFixed(1) + ' Ω/□' : '∞')),
      '酸化膜 ' + (ox > 0 ? fmtLen(ox) : 'なし') + '　膜 ' + (wf.films[ix].length ? wf.films[ix].map(function (f) { return G.MAT[f.mat].name.split(' ')[0] + ' ' + fmtLen(f.t); }).join(' / ') : 'なし')
    ];
    lines.forEach(function (t, i) { label(b.x + b.w - 8, b.y + 16 + i * 15, t, COL.fg, 'right', '11px'); });
    var leg = ['B', 'P', 'As'].map(function (sp) { return [sp, SPCOL[sp]]; }).concat([['|正味|', '#ffffff'], ['基板', COL.fg3]]);
    var lx = b.x + 8;
    leg.forEach(function (it) { label(lx, b.y + 16, it[0], it[1], 'left', '11px'); lx += ctx.measureText(it[0]).width + 12; });
  }

  /* ---- 道具 ---- */

  function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  function label(x, y, t, col, align, size) {
    ctx.font = (size || '11px') + ' "Yu Gothic UI", Meiryo, sans-serif';
    ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
  }
  function fmtNum(v) { var a = Math.abs(v); return a >= 1 ? +v.toFixed(2) + '' : +v.toFixed(3) + ''; }
  function fmtLen(cm) {
    var nm = cm / G.NM;
    if (nm >= 1000) return (nm / 1000).toFixed(nm >= 10000 ? 1 : 2) + ' µm';
    return (nm >= 10 ? nm.toFixed(0) : nm.toFixed(1)) + ' nm';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

  /* ---- 下のバー ---- */

  function updateStatus(wf) {
    var n = S.recipe.steps.length;
    var at = S.sel < 0 ? '最初のウェーハ' : '工程 ' + (S.sel + 1) + ' / ' + n + ' の直後';
    var sub = S.recipe.sub;
    document.getElementById('statLeft').textContent =
      at + '　基板 ' + sub.type + ' 型 ' + (+sub.N).toExponential(1) + ' cm⁻³';
    document.getElementById('statRight').textContent =
      '格子 ' + G.NX + '×' + G.NZ + '　レシピ全体の計算 ' + runMs.toFixed(0) + ' ms';
    var wb = document.getElementById('warnbar');
    var notes = wf.notes || [];
    if (notes.length) {
      wb.innerHTML = notes.map(function (t) { return '⚠ ' + esc(t); }).join('<br>');
      if (wb.classList.contains('hidden')) { wb.classList.remove('hidden'); resize(); }
    } else if (!wb.classList.contains('hidden')) {
      wb.innerHTML = ''; wb.classList.add('hidden'); resize();
    }
  }

  /* ================= レシピの一覧と編集 ================= */

  function renderSteps() {
    var ul = document.getElementById('stepList');
    ul.innerHTML = '';
    if (dirty || !run) recompute();
    var steps = S.recipe.steps;
    document.getElementById('stepsEmpty').classList.toggle('hidden', steps.length > 0);

    var li0 = document.createElement('li');
    li0.className = 'start' + (S.sel < 0 ? ' sel' : '');
    li0.innerHTML = '<div class="shead"><span class="sno">0</span><span class="stext">最初のウェーハ（'
      + S.recipe.sub.type + ' 型 ' + (+S.recipe.sub.N).toExponential(0) + '）</span></div>';
    li0.querySelector('.shead').addEventListener('click', function () { S.sel = -1; renderSteps(); requestDraw(); persist(); });
    ul.appendChild(li0);

    steps.forEach(function (s, i) {
      var li = document.createElement('li');
      if (i === S.sel) li.className = 'sel';
      var warn = run.snaps[i] && run.snaps[i].notes.length ? ' <span class="swarn">⚠</span>' : '';
      var head = document.createElement('div');
      head.className = 'shead';
      head.innerHTML = '<span class="sno">' + (i + 1) + '</span>'
        + '<span class="sico" style="background:' + KINDCOL[s.t] + '"></span>'
        + '<span class="stext">' + esc(R.describe(s)) + warn + '</span>'
        + '<span class="smove"><button data-mv="-1" title="上へ">▲</button><button data-mv="1" title="下へ">▼</button></span>';
      head.addEventListener('click', function (e) {
        var mv = e.target && e.target.dataset && e.target.dataset.mv;
        if (mv) { moveStep(i, +mv); return; }
        S.sel = i; renderSteps(); requestDraw(); persist();
      });
      li.appendChild(head);
      if (i === S.sel) li.appendChild(editor(s, i));
      ul.appendChild(li);
    });
  }

  function moveStep(i, d) {
    var j = i + d, st = S.recipe.steps;
    if (j < 0 || j >= st.length) return;
    var t = st[i]; st[i] = st[j]; st[j] = t;
    S.sel = j; touch();
  }

  function addStep(kind) {
    var s = defaults(kind);
    S.recipe.steps.splice(S.sel + 1, 0, s);
    S.sel = S.sel + 1;
    touch();
  }

  function defaults(kind) {
    switch (kind) {
      case 'depo': return { t: 'depo', mat: 'ox', nm: 100 };
      case 'mask': return { t: 'mask', open: R.maskRanges([[0, 5]]), nm: 1000 };
      case 'etch': return { t: 'etch', mat: 'ox', nm: 0 };
      case 'strip': return { t: 'strip' };
      case 'imp': return { t: 'imp', ion: 'P', keV: 50, dose: 1e15 };
      case 'heat': return { t: 'heat', C: 1000, min: 30, amb: 'N2' };
    }
    return { t: kind };
  }

  /* ---- 編集欄 ---- */

  var LIM = {
    nm: [1, 5000], resist: [100, 5000], etch: [1, 10000],
    keV: [1, 400], dose: [1e9, 1e17], C: [600, 1250], min: [0.01, 1440], subN: [1e12, 1e19], cut: [0, 10]
  };
  function clampv(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function editor(s, i) {
    var d = document.createElement('div');
    d.className = 'ed';
    var add = function (el) { d.appendChild(el); return el; };

    if (s.t === 'depo') {
      add(selRow('材料', [['ox', '酸化膜（CVD）'], ['nit', '窒化膜'], ['poly', 'ポリシリコン'], ['metal', '金属 Al']], s.mat,
        function (v) { s.mat = v; touch(); }));
      add(numRow('厚み', s.nm, 'nm', function (t) { var v = parseNum(t); if (!isFinite(v)) return false; s.nm = clampv(v, LIM.nm[0], LIM.nm[1]); touch(); return true; }));
      add(hint('全面に同じ厚みで積む（側壁には付かない）。'));
    } else if (s.t === 'mask') {
      d.appendChild(maskEditor(s));
      add(numRow('レジスト', s.nm || 1000, 'nm', function (t) { var v = parseNum(t); if (!isFinite(v)) return false; s.nm = clampv(v, LIM.resist[0], LIM.resist[1]); touch(); return true; }));
      add(hint('明るい所が開口（レジストが無い所）。クリック・ドラッグで塗る。'));
    } else if (s.t === 'etch') {
      add(selRow('材料', [['ox', '酸化膜'], ['nit', '窒化膜'], ['poly', 'ポリシリコン'], ['metal', '金属'], ['si', 'シリコン（溝を掘る）']], s.mat,
        function (v) { s.mat = v; touch(); }));
      var r = numRow('量', +s.nm > 0 ? s.nm : '', 'nm', function (t) {
        var tt = String(t).trim();
        if (tt === '' || tt === '全部') { s.nm = 0; touch(); return true; }
        var v = parseNum(tt); if (!isFinite(v)) return false; s.nm = clampv(v, LIM.etch[0], LIM.etch[1]); touch(); return true;
      });
      r.querySelector('input').placeholder = '全部';
      add(r);
      add(hint('上から、その材料だけ削る。別の材料に当たったら止まる。一番上がレジストの所は削られない。'));
    } else if (s.t === 'strip') {
      add(hint('レジストを全部はがす。設定は無い。'));
    } else if (s.t === 'imp') {
      add(selRow('イオン', [['B', 'B（ホウ素 → p 型）'], ['P', 'P（リン → n 型）'], ['As', 'As（ヒ素 → n 型）']], s.ion,
        function (v) { s.ion = v; touch(); }));
      add(numRow('エネルギー', s.keV, 'keV', function (t) { var v = parseNum(t); if (!isFinite(v)) return false; s.keV = clampv(v, LIM.keV[0], LIM.keV[1]); touch(); return true; }));
      add(numRow('ドーズ', (+s.dose).toExponential(1), 'cm⁻²', function (t) { var v = parseSci(t); if (!isFinite(v) || v <= 0) return false; s.dose = clampv(v, LIM.dose[0], LIM.dose[1]); touch(); return true; }));
      var rg = IMP.range(s.ion, +s.keV);
      add(hint('この条件の飛程: 平均 ' + fmtLen(rg.rp) + '・ばらつき ' + fmtLen(rg.dr)
        + '。止めるにはレジストで約 ' + fmtLen((rg.rp + 4 * rg.dr) / IMP.STOP.resist) + ' 要る。'));
    } else if (s.t === 'heat') {
      add(numRow('温度', s.C, '℃', function (t) { var v = parseNum(t); if (!isFinite(v)) return false; s.C = clampv(v, LIM.C[0], LIM.C[1]); touch(); return true; }));
      add(numRow('時間', s.min, '分', function (t) { var v = parseNum(t); if (!isFinite(v)) return false; s.min = clampv(v, LIM.min[0], LIM.min[1]); touch(); return true; }));
      add(selRow('雰囲気', [['N2', '窒素（拡散だけ）'], ['dry', 'ドライ酸化（O₂）'], ['wet', 'ウェット酸化（H₂O）']], s.amb,
        function (v) { s.amb = v; touch(); }));
      var sec = (+s.min) * 60, parts = [];
      ['B', 'P', 'As'].forEach(function (sp) { parts.push(sp + ' ' + fmtLen(Math.sqrt(DF.D(sp, +s.C) * sec))); });
      var hv = '拡散距離 √(Dt): ' + parts.join('・') + '。';
      if (s.amb !== 'N2') hv += '裸のシリコンなら酸化膜 ' + fmtLen(OX.grow(s.amb, +s.C, 0, sec / 3600) * G.UM) + '。';
      add(hint(hv));
    }

    var acts = document.createElement('div');
    acts.className = 'acts';
    acts.appendChild(btn('複製', function () {
      S.recipe.steps.splice(i + 1, 0, JSON.parse(JSON.stringify(s))); S.sel = i + 1; touch();
    }));
    acts.appendChild(btn('消す', function () {
      S.recipe.steps.splice(i, 1); S.sel = Math.min(i, S.recipe.steps.length - 1); touch();
    }, 'danger'));
    d.appendChild(acts);
    return d;
  }

  function selRow(name, opts, val, onChange) {
    var row = document.createElement('div'); row.className = 'row';
    var n = document.createElement('span'); n.textContent = name;
    var sel = document.createElement('select');
    sel.innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('');
    sel.value = val;
    sel.addEventListener('change', function () { onChange(sel.value); });
    row.appendChild(n); row.appendChild(sel);
    return row;
  }

  function numRow(name, val, unit, onEnter) {
    var row = document.createElement('div'); row.className = 'row';
    var n = document.createElement('span'); n.textContent = name;
    var inp = document.createElement('input'); inp.type = 'text'; inp.value = String(val);
    var u = document.createElement('span'); u.className = 'u'; u.textContent = unit;
    inp.addEventListener('change', function () {
      if (onEnter(inp.value) === false) inp.classList.add('bad');
    });
    row.appendChild(n); row.appendChild(inp); row.appendChild(u);
    return row;
  }

  function hint(t) { var p = document.createElement('div'); p.className = 'hint'; p.textContent = t; return p; }

  function btn(text, fn, cls) {
    var b = document.createElement('button');
    b.className = 'tb' + (cls ? ' ' + cls : ''); b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  /* ---- マスクの塗り絵 ---- */

  function maskEditor(s) {
    var wrap = document.createElement('div');
    var c = document.createElement('canvas');
    c.className = 'maskbar'; c.width = G.NX * 2; c.height = 26;
    wrap.appendChild(c);
    var paintVal = null;
    var cellAt = function (e) {
      var r = c.getBoundingClientRect();
      return Math.max(0, Math.min(G.NX - 1, Math.floor((e.clientX - r.left) / r.width * G.NX)));
    };
    var paint = function (ix) {
      if (s.open.charAt(ix) === paintVal) return;
      s.open = s.open.substr(0, ix) + paintVal + s.open.substr(ix + 1);
      drawMask(c, s.open);
    };
    c.addEventListener('mousedown', function (e) {
      var ix = cellAt(e);
      paintVal = s.open.charAt(ix) === '1' ? '0' : '1';
      paint(ix);
    });
    c.addEventListener('mousemove', function (e) { if (paintVal !== null) paint(cellAt(e)); });
    /* 塗っている間は絵だけ。指を離したときに反映する（一覧を作り直すと塗り絵ごと消える） */
    var finish = function () { if (paintVal !== null) { paintVal = null; touch(); } };
    c.addEventListener('mouseup', finish);
    c.addEventListener('mouseleave', finish);
    drawMask(c, s.open);

    var pr = document.createElement('div'); pr.className = 'presets';
    [['全部開ける', function () { return R.maskAll(true); }],
     ['全部閉じる', function () { return R.maskAll(false); }],
     ['左半分', function () { return R.maskRanges([[0, 5]]); }],
     ['右半分', function () { return R.maskRanges([[5, 10]]); }],
     ['真ん中', function () { return R.maskRanges([[3.5, 6.5]]); }],
     ['反転', function () { return s.open.replace(/./g, function (ch) { return ch === '1' ? '0' : '1'; }); }]
    ].forEach(function (p) {
      var b = btn(p[0], function () { s.open = p[1](); touch(); });
      b.className = 'tb mini';
      pr.appendChild(b);
    });
    wrap.appendChild(pr);
    return wrap;
  }

  function drawMask(c, open) {
    var g = c.getContext('2d'), cw = c.width / G.NX;
    g.fillStyle = MATCOL.resist; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e8edf3';
    for (var ix = 0; ix < G.NX; ix++) if (open.charAt(ix) === '1') g.fillRect(ix * cw, 0, cw + 0.5, c.height);
    g.fillStyle = 'rgba(20,23,28,.6)';
    for (var xu = 1; xu < 10; xu++) g.fillRect(xu * c.width / 10, c.height - 5, 1, 5);
  }

  /* ---- 数値の読み取りは SemiLab の parse.js を共用する（読めなければ NaN、勝手に 0 にしない） ---- */
  var SLP = global.SL.parse;
  var parseNum = SLP.num, parseSci = SLP.sci;

  /* ================= 上のバーと表示の摘み ================= */

  function bind() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-add]'), function (b) {
      b.addEventListener('click', function () { addStep(b.dataset.add); });
    });
    var st = document.getElementById('subType');
    st.addEventListener('change', function () { S.recipe.sub.type = st.value === 'n' ? 'n' : 'p'; touch(); });
    var sn = document.getElementById('subN');
    sn.addEventListener('change', function () {
      var v = parseSci(sn.value);
      if (!isFinite(v) || v <= 0) { sn.classList.add('bad'); return; }
      sn.classList.remove('bad');
      S.recipe.sub.N = clampv(v, LIM.subN[0], LIM.subN[1]);
      syncControls(); touch();
    });
    var ds = document.getElementById('depthSel');
    ds.addEventListener('change', function () { S.view.depth = parseFloat(ds.value) || 2; requestDraw(); persist(); });
    var cvl = document.getElementById('cutVal');
    cvl.addEventListener('change', function () {
      var v = parseNum(cvl.value);
      if (!isFinite(v)) { cvl.classList.add('bad'); return; }
      cvl.classList.remove('bad');
      S.cutX = clampv(v, LIM.cut[0], LIM.cut[1]);
      syncControls(); requestDraw(); persist();
    });
    cv.addEventListener('click', function (e) {
      if (!secBox) return;
      var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      if (mx < secBox.x || mx > secBox.x + secBox.w || my < secBox.y || my > secBox.y + secBox.h) return;
      S.cutX = Math.round(clampv((mx - secBox.x) / secBox.w * 10, 0, 10) * 20) / 20;
      syncControls(); requestDraw(); persist();
    });

    document.getElementById('btnSemiDiode').addEventListener('click', function () { openSemi('diode'); });
    document.getElementById('btnSemiMos').addEventListener('click', function () { openSemi('mos'); });
    document.getElementById('btnClear').addEventListener('click', function () {
      if (!S.recipe.steps.length || confirm('レシピを全部消しますか？（課題の記録は消えません）')) {
        S.recipe.steps = []; S.sel = -1; touch();
      }
    });
    document.getElementById('btnExport').addEventListener('click', openExport);
    document.getElementById('btnImport').addEventListener('click', openImport);

    document.getElementById('btnGrade').addEventListener('click', function () {
      if (!S.quest) return;
      var r = Q.grade(S.quest, S.recipe);
      showResult(r);
      if (r.ok) { S.cleared[S.quest] = true; renderQuestList(); }
      persist();
    });
    document.getElementById('btnAnswer').addEventListener('click', function () {
      if (!S.quest) return;
      var a = ANS.get(S.quest);
      if (!a) return;
      if (!confirm('お手本のレシピを出します。今のレシピは置き換わります。よろしいですか？')) return;
      S.recipe = a.make();
      S.sel = S.recipe.steps.length - 1;
      document.getElementById('qResult').innerHTML = '<p class="mnote">' + esc(a.note) + '</p>';
      syncControls(); touch();
    });
  }

  function syncControls() {
    document.getElementById('subType').value = S.recipe.sub.type;
    var sn = document.getElementById('subN'); sn.value = (+S.recipe.sub.N).toExponential(1); sn.classList.remove('bad');
    document.getElementById('depthSel').value = String(S.view.depth || 2);
    var cvl = document.getElementById('cutVal'); cvl.value = S.cutX.toFixed(2); cvl.classList.remove('bad');
    renderSteps();
    renderCalc();
  }

  /* ================= SemiLab へ ================= */

  function openSemi(mode) {
    var wf = wafer(), t = M.toSemi(wf, cutCol(), mode);
    var from = 'プロセスラボ x=' + S.cutX.toFixed(2) + 'µm（' + (mode === 'mos' ? 'MOS' : 'ダイオード') + '）';
    var url = '../SemiLab/index.html?stack=' + encodeURIComponent(JSON.stringify(t.layers))
            + '&from=' + encodeURIComponent(from);
    if (t.note) alert(t.note);
    window.open(url, '_blank');
    return url;
  }

  /* ================= 課題 ================= */

  function renderQuestList() {
    var host = document.getElementById('questList');
    host.innerHTML = '';
    Q.CH.forEach(function (ch) {
      var div = document.createElement('div'); div.className = 'chapter';
      var h = document.createElement('div'); h.className = 'ctitle'; h.textContent = ch.name; div.appendChild(h);
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
    S.quest = id;
    var q = Q.byId(id);
    renderQuestList();
    var body = document.getElementById('questBody');
    if (!q) { body.classList.add('hidden'); return; }
    body.classList.remove('hidden');
    document.getElementById('qName').textContent = q.name;
    document.getElementById('qDesc').innerHTML = md(q.desc);
    document.getElementById('qWhy').innerHTML = md(q.why);
    document.getElementById('qHint').textContent = q.hint;
    document.getElementById('qResult').innerHTML = '';
    renderCalc();
    persist();
  }

  /* ---- 第5章の計算の欄 ― 工程は使わず、この数字だけで採点する（quest.js の calc） ---- */
  var CALC_FIELDS = [
    ['dose', '露光量', 'mJ/cm²', 1, 1000],
    ['side', '正方形の一辺', 'nm', 1, 100],
    ['lam', '露光の波長', 'nm', 5, 400],
    ['d0', '欠陥密度 D₀', '/cm²', 0.001, 5],
    ['alpha', '固まり具合 α', '', 0.1, 100],
    ['area', '回路の面積', 'cm²', 0.01, 20],
    ['nsplit', '分ける個数', '個', 1, 50, true],
    ['over', '1 個あたりの接続の面積', 'cm²', 0, 2]
  ];
  function renderCalc() {
    var box = document.getElementById('calcBox');
    var q = Q.byId(S.quest), on = !!(q && q.ch === 5);
    box.classList.toggle('hidden', !on);
    if (!on) return;
    var c = Q.calc.of(S.recipe), host = document.getElementById('calcForm');
    host.innerHTML = '';
    CALC_FIELDS.forEach(function (fd) {
      host.appendChild(numRow(fd[1], c[fd[0]], fd[2], function (t) {
        var v = parseNum(t);
        if (!isFinite(v)) return false;
        v = clampv(v, fd[3], fd[4]);
        if (fd[5]) v = Math.round(v);
        S.recipe.calc = Q.calc.of(S.recipe);
        S.recipe.calc[fd[0]] = v;
        renderCalc(); persist();
        return true;
      }));
    });
    var e = Q.calc.evaluate(c);
    document.getElementById('calcOut').innerHTML =
      '光子 ' + esc(e.n.toFixed(0)) + ' 個・揺らぎ ' + esc((e.rel * 100).toFixed(2)) + ' %（1 個 ' + esc(e.eph.toFixed(1)) + ' eV）<br>'
      + '分けたとき: 1 個 ' + esc(e.chipA.toFixed(3)) + ' cm²・歩留まり ' + esc((e.chipY * 100).toFixed(2)) + ' %（負の二項）・総面積 ' + esc(e.totalA.toFixed(2)) + ' cm²<br>'
      + '分けないとき: 負の二項 ' + esc((e.bigY * 100).toFixed(1)) + ' %・ポアソン ' + esc((e.bigYP * 100).toFixed(1)) + ' %・マーフィー ' + esc((e.bigYM * 100).toFixed(1)) + ' %';
  }

  function showResult(r) {
    var h = '<div class="verdict ' + (r.ok ? 'ok' : 'ng') + '">' + (r.ok ? '✓ 通った' : '✗ まだ') + '</div><div class="grid">';
    (r.rows || []).forEach(function (x) {
      h += '<span class="k">' + esc(x.label) + '</span><span class="v ' + (x.ok ? 'ok' : 'ng') + '">' + esc(x.value) + '</span>';
      if (x.want) h += '<span class="want">→ ' + esc(x.want) + '</span>';
    });
    document.getElementById('qResult').innerHTML = h + '</div>';
  }

  /* ================= 書き出し・読み込み ================= */

  function modal(html, after) {
    var ov = document.getElementById('overlay'), m = document.getElementById('modal');
    m.innerHTML = html; ov.classList.remove('hidden');
    ov.onclick = function (e) { if (e.target === ov) closeModal(); };
    if (after) after(m);
  }
  function closeModal() { document.getElementById('overlay').classList.add('hidden'); }

  function openExport() {
    modal('<h3>書き出し</h3><textarea id="expText" readonly></textarea><div class="mrow"><button class="tb" id="expClose">閉じる</button></div>', function (m) {
      m.querySelector('#expText').value = STORE.toJSON(S);
      m.querySelector('#expClose').onclick = closeModal;
    });
  }
  function openImport() {
    modal('<h3>読み込み</h3><textarea id="impText" placeholder="書き出した JSON を貼る"></textarea>'
      + '<div class="mrow"><button class="tb primary" id="impGo">読み込む</button><button class="tb" id="impClose">やめる</button>'
      + '<span id="impErr" style="color:var(--ng)"></span></div>', function (m) {
      m.querySelector('#impGo').onclick = function () {
        var r = STORE.fromJSON(m.querySelector('#impText').value);
        if (r.error) { m.querySelector('#impErr').textContent = r.error; return; }
        S.recipe = r.state.recipe; S.sel = r.state.sel; S.cutX = r.state.cutX; S.view = r.state.view;
        closeModal(); syncControls(); touch();
      };
      m.querySelector('#impClose').onclick = closeModal;
    });
  }

  function persist() {
    if (!STORE.save(S)) document.getElementById('statRight').textContent = '（保存できませんでした）';
  }

  PL.ui = {
    mount: mount, get state() { return S; }, selectQuest: selectQuest, renderSteps: renderSteps,
    wafer: wafer, openSemi: openSemi, parseNum: parseNum, parseSci: parseSci, dopeColor: dopeColor, touch: touch
  };
})(typeof window !== 'undefined' ? window : globalThis);
