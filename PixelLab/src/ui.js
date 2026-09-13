/* 画面 ― ブラウザに触るのはこのファイルと main.js だけ
 *
 * 真ん中は4枚の図:
 *   左上  最後に撮った1枚（平らな光なのに、ざらついている ― それが雑音）
 *   右上  PTC（時間の分散 vs 平均、両対数）。傾き 1/2 の坂がショットノイズ、平らな所が読み出し、頂点が飽和
 *   左下  分散 − 暗い分散 vs 平均（線形）。直線の傾きが 1/K
 *   右下  暗い画像の平均 vs 露光。傾きが暗電流（DN/s）
 *
 * 【当てはめの線は既定で出さない】測る課題の練習にならないので、「当てはめを見せる」を付けたときだけ。
 * 設計したカメラのときは、設計から出る理論の線（PTC の予想）も重ねる。
 *
 * 【設計の欄は数値欄と選択肢だけ】摘みは使わない（SemiLab で踏んだ）。変更は change でだけ反映する。
 */
(function (global) {
  'use strict';
  var PX = global.PX, SL = global.SL;
  var PIX = PX.pixel, CAM = PX.camera, PTC = PX.ptc, Q = PX.quest, ANS = PX.answer, STORE = PX.store;
  var PARSE = SL.parse;

  var S = null, cv, ctx, DPR = 1, lastFrame = null, lastCam = null;
  var COL = { bg: '#14171c', panel: '#191d24', line: '#2f3642', fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f',
              light: '#5aa9e6', dark: '#ffab40', fit: '#ffffff', theory: '#4cc38a' };

  /* ---- 設計の欄 ---- */
  var FIELDS = [
    ['pitch', '画素ピッチ', 'µm', 0.8, 20],
    ['pdFrac', 'PD の面積の割合', '（0〜1）', 0.1, 0.95],
    ['epi', '光を集める層', 'µm', 1, 20],
    ['nm', '見る波長', 'nm', 350, 1100],
    ['fwd', '井戸の深さ', 'e⁻/µm²', 200, 5000],
    ['cfd', '浮遊拡散の容量', 'fF', 0.2, 20],
    ['sf', '読み出し回路の雑音', 'µV rms', 10, 2000],
    ['jd', '暗電流密度（60℃）', 'pA/cm²', 0.1, 5000],
    ['T', '温度', '℃', -60, 80],
    ['bits', 'AD の桁', 'bit', 8, 16],
    ['prnu', '感度のむら', '%', 0, 10],
    ['offset', 'オフセット', 'DN', 0, 1000],
    ['hdrR', '長短の露光比（HDR）', '：1（1＝合成なし）', 1, 32],
    /* 第4章: 動き・細かさ・時間（6 番目が true なら整数） */
    ['rows', '行の数', '行', 100, 20000, true],
    ['vpx', '動く物体の速さ', '画素/s', 0, 1e6],
    ['fclk', 'AD のクロック', 'MHz', 10, 5000],
    ['colpar', '同時に読む行', '組', 1, 16, true],
    ['pls', '寄生感度の分離比', 'dB', 40, 140],
    ['fnum', 'レンズの F 値', '', 0.7, 32],
    ['tdiN', 'TDI の段数', '段', 1, 512, true],
    ['tdiMode', 'TDI の足し方', '（0 デジタル・1 電荷）', 0, 1, true],
    ['tdiS1', 'TDI の 1 段の信号', 'e⁻', 0.1, 1e5],
    ['tdiSync', '速さのずれ', '%', 0, 20]
  ];

  /* ================= 起動 ================= */

  function mount(state) {
    S = state;
    cv = document.getElementById('board');
    ctx = cv.getContext('2d');
    bind();
    renderQuestList();
    sync();
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

  /** 今のカメラ（撮れる形） */
  function camera() {
    if (S.cam === 'design') {
      var c = PIX.toCamera(S.design, 1234);
      c.flux = S.flux;
      return c;
    }
    return CAM.MYSTERY[S.cam];
  }

  function pts() { return S.points[S.cam] || (S.points[S.cam] = []); }

  /* ================= 撮る ================= */

  function shoot() {
    var cam = camera(), t = S.expMs / 1000, seed = (S.seq++) * 7919 + S.cam.charCodeAt(0);
    if (S.light) {
      var p = PTC.point(cam, t, seed);
      pts().push(p);
      pts().sort(function (a, b) { return a.t - b.t; });
    }
    lastFrame = CAM.frame(cam, t, S.light, seed + 1);
    lastCam = cam;
    after();
  }

  function sweep() {
    var cam = camera(), seed = (S.seq++) * 31;
    var tMin = 1e-4, tMax = 5;
    if (S.cam === 'design') {
      var ev = PIX.evaluate(S.design), tsat = ev.fw / Math.max(ev.qe * S.flux * ev.area, 1e-9);
      tMin = Math.max(tsat / 3000, 1e-6); tMax = tsat * 3;
    }
    S.points[S.cam] = PTC.sweep(cam, tMin, tMax, 40, seed);
    var last = S.points[S.cam][Math.floor(S.points[S.cam].length * 0.6)];
    lastFrame = CAM.frame(cam, last.t, true, seed + 5);
    lastCam = cam;
    after();
  }

  function after() { renderPoints(); requestDraw(); persist(); }

  /* ================= 絵 ================= */

  function draw() {
    var W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(DPR, DPR);
    var w = W / DPR, h = H / DPR;
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h);

    /* 2×2。各図は自分の左に縦軸の目盛りの幅（Lm）を持つ。列の幅からそれを引いて並べる。
     * 【最初は2列目の位置を決め打ちで詰めていて、1024px で隣の図の見出しと重なった】 */
    var gap = 16, Lm = 56, Rm = 10, top = 22, bottom = 34;
    var colW = (w - gap) / 2;
    var pw = Math.max(80, colW - Lm - Rm), ph = Math.max(60, (h - top * 2 - bottom * 2) / 2);
    var b1 = { x: Lm, y: top, w: pw, h: ph };
    var b2 = { x: colW + gap + Lm, y: top, w: pw, h: ph };
    var b3 = { x: Lm, y: top * 2 + ph + bottom, w: pw, h: ph };
    var b4 = { x: b2.x, y: b3.y, w: pw, h: ph };

    drawImage(b1);
    drawPTC(b2);
    drawLinear(b3);
    drawDark(b4);
    updateStatus();
  }

  function frameBox(b, title) {
    ctx.fillStyle = COL.panel; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COL.line; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    label(b.x, b.y - 6, title, COL.fg2, 'left', '11px', b.w);
  }

  function drawImage(b) {
    frameBox(b, '撮った1枚' + (lastFrame ? '（' + (lastCam ? lastCam.name : '') + '）' : ''));
    if (!lastFrame) { label(b.x + b.w / 2, b.y + b.h / 2, '「撮る」か「掃く」を押す', COL.fg3, 'center', '12px'); return; }
    var n = CAM.W, lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < lastFrame.length; i++) { if (lastFrame[i] < lo) lo = lastFrame[i]; if (lastFrame[i] > hi) hi = lastFrame[i]; }
    if (hi - lo < 1) hi = lo + 1;
    var off = document.createElement('canvas'); off.width = n; off.height = CAM.H;
    var oc = off.getContext('2d'), img = oc.createImageData(n, CAM.H);
    for (i = 0; i < lastFrame.length; i++) {
      var v = Math.round(255 * (lastFrame[i] - lo) / (hi - lo));
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    oc.putImageData(img, 0, 0);
    var s = Math.min(b.w, b.h) - 20;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, b.x + (b.w - s) / 2, b.y + 10, s, s);
    var st = CAM.stats(lastFrame);
    label(b.x + b.w - 6, b.y + b.h - 6, '平均 ' + st.mean.toFixed(1) + ' DN・標準偏差 ' + Math.sqrt(st.var).toFixed(2) + ' DN（明るさは引き伸ばし）', COL.fg3, 'right', '10px', b.w - 12);
  }

  /** 軸つきの図の枠。log なら 10 の累乗の目盛り */
  function axes(b, xr, yr, logx, logy, xl, yl) {
    var tx = function (v) { return logx ? Math.log10(v) : v; }, ty = function (v) { return logy ? Math.log10(v) : v; };
    var x0 = tx(xr[0]), x1 = tx(xr[1]), y0 = ty(yr[0]), y1 = ty(yr[1]);
    var X = function (v) { return b.x + b.w * (tx(v) - x0) / (x1 - x0 || 1); };
    var Y = function (v) { return b.y + b.h * (1 - (ty(v) - y0) / (y1 - y0 || 1)); };
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    var i;
    if (logx) for (i = Math.ceil(x0); i <= x1; i++) { var xx = X(Math.pow(10, i)); line(xx, b.y, xx, b.y + b.h); label(xx, b.y + b.h + 12, '1e' + i, COL.fg3, 'center', '9px'); }
    /* 目盛りの数は図の幅で決める（1024px で数字どうしが繋がって読めなかった） */
    else ticks(xr[0], xr[1], Math.max(2, Math.floor(b.w / 55))).forEach(function (v) { var xx = X(v); line(xx, b.y, xx, b.y + b.h); label(xx, b.y + b.h + 12, fmt(v), COL.fg3, 'center', '9px'); });
    if (logy) for (i = Math.ceil(y0); i <= y1; i++) { var yy = Y(Math.pow(10, i)); line(b.x, yy, b.x + b.w, yy); label(b.x - 4, yy + 3, '1e' + i, COL.fg3, 'right', '9px'); }
    else ticks(yr[0], yr[1], Math.max(2, Math.floor(b.h / 30))).forEach(function (v) { var yy = Y(v); line(b.x, yy, b.x + b.w, yy); label(b.x - 4, yy + 3, fmt(v), COL.fg3, 'right', '9px'); });
    ctx.globalAlpha = 1;
    label(b.x + b.w / 2, b.y + b.h + 24, xl, COL.fg3, 'center', '10px');
    ctx.save(); ctx.translate(b.x - 44, b.y + b.h / 2); ctx.rotate(-Math.PI / 2); label(0, 0, yl, COL.fg3, 'center', '10px'); ctx.restore();
    return { X: X, Y: Y };
  }

  /** 1・2・5 刻みで、多くても max 本の目盛り */
  function ticks(a, z, max) {
    max = max || 10;
    var span = z - a, step = Math.pow(10, Math.floor(Math.log10(span / max || 1)));
    [2, 2.5, 2].forEach(function (m) { if (span / step > max) step *= m; });
    var out = [];
    for (var v = Math.ceil(a / step) * step; v <= z + 1e-12 && out.length < 12; v += step) out.push(v);
    return out;
  }

  function dot(x, y, col, r) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r || 2.4, 0, Math.PI * 2); ctx.fill(); }

  function drawPTC(b) {
    frameBox(b, 'PTC ― 時間でゆらぐ分散 と 平均（両対数）');
    var P = pts().filter(function (p) { return p.mean > 0 && p.tvar > 0; });
    if (!P.length) { label(b.x + b.w / 2, b.y + b.h / 2, 'まだ点が無い', COL.fg3, 'center', '12px'); return; }
    var xs = P.map(function (p) { return p.mean; }), ys = P.map(function (p) { return p.tvar; });
    var xr = [Math.max(0.1, Math.min.apply(null, xs) / 2), Math.max.apply(null, xs) * 2];
    var yr = [Math.max(0.01, Math.min.apply(null, ys.concat(P.map(function (p) { return p.dark.tvar; }))) / 2), Math.max.apply(null, ys) * 3];
    var A = axes(b, xr, yr, true, true, '平均（暗さを引いた信号）[DN]', '分散 [DN²]');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    /* 設計したカメラなら理論の線（分散 = 平均/K + 読出²/K² + (PRNU は差分で消えるので入れない)） */
    if (S.cam === 'design') {
      var ev = PIX.evaluate(S.design);
      ctx.strokeStyle = COL.theory; ctx.globalAlpha = 0.6; ctx.beginPath();
      for (var k = 0; k <= 60; k++) {
        var m = xr[0] * Math.pow(xr[1] / xr[0], k / 60);
        if (m * ev.K > ev.fw) break;
        var v = m / ev.K + (ev.read * ev.read) / (ev.K * ev.K) + 1 / 12;
        if (k === 0) ctx.moveTo(A.X(m), A.Y(v)); else ctx.lineTo(A.X(m), A.Y(v));
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    P.forEach(function (p) { dot(A.X(p.mean), A.Y(p.tvar), COL.light); });
    var dfl = P.reduce(function (a, p) { return a + p.dark.tvar; }, 0) / P.length;
    ctx.strokeStyle = COL.dark; ctx.setLineDash([4, 4]); line(b.x, A.Y(dfl), b.x + b.w, A.Y(dfl)); ctx.setLineDash([]);
    ctx.restore();
    label(b.x + b.w - 6, b.y + 14, '青 明るい2枚の差・橙 読み出しの床' + (S.cam === 'design' ? '・緑 設計の線' : ''), COL.fg3, 'right', '10px', b.w - 12);
  }

  function drawLinear(b) {
    frameBox(b, '分散 − 暗い分散 と 平均（線形）― 傾きが 1/K');
    var P = pts();
    if (!P.length) return;
    var ip = PTC.peakIndex(P), xs = [], ys = [];
    P.forEach(function (p, i) { if (i <= ip) { xs.push(p.mean); ys.push(p.tvar - p.dark.tvar); } });
    if (!xs.length) return;
    var xr = [0, Math.max.apply(null, xs) * 1.05 || 1], yr = [Math.min(0, Math.min.apply(null, ys)), Math.max.apply(null, ys) * 1.1 || 1];
    var A = axes(b, xr, yr, false, false, '平均 [DN]', '分散 − 暗い分散 [DN²]');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    xs.forEach(function (x, i) { dot(A.X(x), A.Y(ys[i]), COL.light); });
    if (S.showFit) {
      var f = PTC.fitK(P);
      if (f) {
        ctx.strokeStyle = COL.fit; ctx.setLineDash([5, 4]);
        line(A.X(0), A.Y(f.fit.a), A.X(xr[1]), A.Y(f.fit.a + f.fit.b * xr[1])); ctx.setLineDash([]);
        label(b.x + 8, b.y + 16, '当てはめ: 傾き ' + f.fit.b.toExponential(3) + ' → K = ' + f.K.toFixed(3) + ' e⁻/DN', COL.fit, 'left', '11px', b.w - 16);
      }
    }
    ctx.restore();
  }

  function drawDark(b) {
    frameBox(b, '暗い画像の平均 と 露光（線形）― 傾きが暗電流');
    var P = pts();
    if (!P.length) return;
    var xs = P.map(function (p) { return p.t; }), ys = P.map(function (p) { return p.dark.mean; });
    var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    if (ymax - ymin < 1) { ymax += 0.5; ymin -= 0.5; }
    var A = axes(b, [0, Math.max.apply(null, xs) * 1.05], [ymin - (ymax - ymin) * 0.1, ymax + (ymax - ymin) * 0.1], false, false, '露光 [s]', '暗い平均 [DN]');
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    xs.forEach(function (x, i) { dot(A.X(x), A.Y(ys[i]), COL.dark); });
    if (S.showFit && P.length > 2) {
      var f = PTC.line(xs, ys);
      ctx.strokeStyle = COL.fit; ctx.setLineDash([5, 4]);
      line(A.X(0), A.Y(f.a), A.X(Math.max.apply(null, xs)), A.Y(f.a + f.b * Math.max.apply(null, xs))); ctx.setLineDash([]);
      label(b.x + 8, b.y + 16, '当てはめ: 傾き ' + f.b.toFixed(3) + ' DN/s（× K で e⁻/s）', COL.fit, 'left', '11px', b.w - 16);
    }
    ctx.restore();
  }

  function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  /** 文字を置く。maxW を渡すと、はみ出すぶんを「…」で切る（狭い画面で図の外へ出ないように） */
  function label(x, y, t, col, align, size, maxW) {
    ctx.font = (size || '11px') + ' "Yu Gothic UI", Meiryo, sans-serif';
    t = String(t);
    if (maxW > 0 && ctx.measureText(t).width > maxW) {
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      t += '…';
    }
    ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.fillText(t, x, y); ctx.textAlign = 'left';
  }
  function fmt(v) { var a = Math.abs(v); return a >= 1e5 ? v.toExponential(1) : a >= 1000 ? +(v / 1000).toFixed(1) + 'k' : a >= 10 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : v.toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

  function updateStatus() {
    var P = pts();
    document.getElementById('statLeft').textContent =
      (S.cam === 'design' ? '設計したカメラ（光 ' + S.flux + ' 光子/µm²/s）' : CAM.MYSTERY[S.cam].name) + '　測った点 ' + P.length;
    document.getElementById('statRight').textContent = '1枚 ' + CAM.W + '×' + CAM.H + ' 画素　1点 = 明るい2枚＋暗い2枚';
  }

  /* ================= 左のパネル ================= */

  function renderDesign() {
    var host = document.getElementById('designForm');
    host.innerHTML = '';
    host.className = 'df';
    FIELDS.forEach(function (fd) {
      host.appendChild(numRow(fd[1], S.design[fd[0]], fd[2], function (t) {
        var v = PARSE.num(t);
        if (!isFinite(v)) return false;
        v = Math.min(fd[4], Math.max(fd[3], v));
        if (fd[0] === 'bits' || fd[5]) v = Math.round(v);
        S.design[fd[0]] = v;
        designChanged();
        return true;
      }));
    });
    host.appendChild(checkRow('マイクロレンズ', S.design.ml, function (v) { S.design.ml = v; designChanged(); }));
    host.appendChild(checkRow('相関二重サンプリング（CDS）', S.design.cds, function (v) { S.design.cds = v; designChanged(); }));
    host.appendChild(numRow('当てる光', S.flux, '光子/µm²/s', function (t) {
      var v = PARSE.num(t); if (!isFinite(v) || v < 0) return false; S.flux = Math.min(v, 1e7); designChanged(); return true;
    }));
    renderDerived();
  }

  function designChanged() {
    S.points.design = [];
    lastFrame = null;
    renderDesign();
    after();
  }

  function renderDerived() {
    var ev;
    try { ev = PIX.evaluate(S.design); } catch (e) { document.getElementById('derived').textContent = '計算できませんでした: ' + e.message; return; }
    var rows = [
      ['シリコンの量子効率', (ev.qeSi * 100).toFixed(1) + ' %（' + S.design.nm + 'nm、SemiLab）'],
      ['画素の量子効率', (ev.qe * 100).toFixed(1) + ' %'],
      ['飽和電荷', ev.fw.toFixed(0) + ' e⁻（決めたのは ' + ev.limit + '）', ev.limit !== 'PD'],
      ['変換ゲイン', ev.cg.toFixed(1) + ' µV/e⁻'],
      ['読み出し雑音', ev.read.toFixed(2) + ' e⁻'],
      ['kTC（リセット雑音）', ev.kTC.toFixed(1) + ' e⁻' + (S.design.cds ? '（CDS で消える）' : '（効いている）'), !S.design.cds],
      ['K', ev.K.toFixed(3) + ' e⁻/DN'],
      ['量子化雑音', ev.quant.toFixed(2) + ' e⁻'],
      ['暗電流', ev.dark.toPrecision(3) + ' e⁻/s'],
      ['暗電流が倍になる幅', PIX.doublingK(S.design.T).toFixed(1) + ' K'],
      ['ダイナミックレンジ', ev.dr.toFixed(1) + ' dB'],
      ['HDR 合成（' + ev.hdrR.toFixed(0) + ':1）', ev.hdrR > 1 ? ev.drH.toFixed(1) + ' dB（+' + (20 * Math.log10(ev.hdrR)).toFixed(1) + '）' : '合成なし'],
      ['1 行 / 上下の時間差', (ev.tRow * 1e6).toFixed(3) + ' µs / ' + (ev.tRead * 1e3).toFixed(2) + ' ms'],
      ['ローリングの横ずれ', ev.skew.toFixed(2) + ' 画素'],
      ['寄生感度の分離比', ev.plsRatio.toExponential(2) + '（' + S.design.pls + ' dB）'],
      ['回折の限界 λN/2 / エアリー円板', ev.pDiff.toFixed(2) + ' µm / ' + ev.airy.toFixed(2) + ' µm', S.design.pitch < ev.pDiff],
      ['ナイキスト / 回折の遮断', ev.nyqLpmm.toFixed(0) + ' / ' + ev.cutLpmm.toFixed(0) + ' 本/mm'],
      ['TDI の S/N / にじみ', ev.tdiSnr.toFixed(2) + ' / ' + ev.tdiSmear.toFixed(2) + ' 画素']
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

  function checkRow(name, val, onChange) {
    var row = document.createElement('div'); row.className = 'row ck';
    var n = document.createElement('span'); n.textContent = name;
    var c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!val;
    c.addEventListener('change', function () { onChange(!!c.checked); });
    row.appendChild(n); row.appendChild(c);
    return row;
  }

  function renderPoints() {
    var P = pts(), host = document.getElementById('pointsBox');
    if (!P.length) { host.innerHTML = '<p class="empty">まだ無い。「撮る」で1点、「掃く」で40点。</p>'; return; }
    var show = P.length > 14 ? P.filter(function (p, i) { return i % Math.ceil(P.length / 14) === 0 || i === P.length - 1; }) : P;
    host.innerHTML = '<table><tr><th>露光 s</th><th>信号 DN</th><th>分散 DN²</th><th>暗い平均</th><th>生の平均</th></tr>'
      + show.map(function (p) {
        return '<tr><td>' + p.t.toPrecision(3) + '</td><td>' + p.mean.toFixed(1) + '</td><td>' + p.tvar.toFixed(2)
          + '</td><td>' + p.dark.mean.toFixed(2) + '</td><td>' + p.raw.toFixed(1) + '</td></tr>';
      }).join('') + '</table>'
      + (P.length > show.length ? '<p class="empty">（' + P.length + ' 点のうち ' + show.length + ' 点を表示）</p>' : '');
  }

  /* ================= 上のバー ================= */

  function bind() {
    var cs = document.getElementById('camSel');
    cs.addEventListener('change', function () { S.cam = cs.value; lastFrame = null; sync(); after(); });
    var ex = document.getElementById('expVal');
    ex.addEventListener('change', function () {
      var v = PARSE.num(ex.value);
      if (!isFinite(v) || v <= 0) { ex.classList.add('bad'); return; }
      ex.classList.remove('bad');
      S.expMs = Math.min(Math.max(v, 0.01), 60000);
      ex.value = String(S.expMs);
      persist();
    });
    document.getElementById('lightOn').addEventListener('change', function () { S.light = !!this.checked; persist(); });
    document.getElementById('btnShot').addEventListener('click', shoot);
    document.getElementById('btnSweep').addEventListener('click', sweep);
    document.getElementById('btnClear').addEventListener('click', function () { S.points[S.cam] = []; lastFrame = null; after(); });
    document.getElementById('showFit').addEventListener('change', function () { S.showFit = !!this.checked; requestDraw(); persist(); });

    document.getElementById('btnGrade').addEventListener('click', grade);
    document.getElementById('btnAnswer').addEventListener('click', showAnswer);
    document.getElementById('qAnswer').addEventListener('change', function () {
      var v = PARSE.num(this.value);
      if (!isFinite(v)) { this.classList.add('bad'); return; }
      this.classList.remove('bad');
      S.answers[S.quest] = v; persist();
    });
    document.getElementById('qChoice').addEventListener('change', function () { S.answers[S.quest] = this.value; persist(); });
  }

  function sync() {
    document.getElementById('camSel').value = S.cam;
    document.getElementById('expVal').value = String(S.expMs);
    document.getElementById('lightOn').checked = !!S.light;
    document.getElementById('showFit').checked = !!S.showFit;
    var isDesign = S.cam === 'design';
    document.getElementById('designBox').classList.toggle('hidden', !isDesign);
    document.getElementById('mysteryBox').classList.toggle('hidden', isDesign);
    if (!isDesign) document.getElementById('mysteryName').textContent = CAM.MYSTERY[S.cam].name;
    if (isDesign) renderDesign();
    renderPoints();
  }

  /* ================= 課題 ================= */

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
    document.getElementById('qAnswerRow').classList.toggle('hidden', q.kind !== 'measure');
    document.getElementById('qChoiceRow').classList.toggle('hidden', q.kind !== 'choice');
    if (q.kind === 'measure') {
      document.getElementById('qUnit').textContent = q.unit;
      document.getElementById('qAnswer').value = S.answers[id] !== undefined ? String(S.answers[id]) : '';
    }
    if (q.kind === 'choice') {
      var sel = document.getElementById('qChoice');
      sel.innerHTML = '<option value="">（選ぶ）</option>' + q.options.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('');
      sel.value = S.answers[id] || '';
    }
    /* 測る課題を選んだら、そのカメラに切り替える。設計の課題なら設計したカメラ */
    var want = q.kind === 'design' ? 'design' : q.cam;
    if (S.cam !== want) { S.cam = want; lastFrame = null; sync(); requestDraw(); }
    persist();
  }

  function grade() {
    if (!S.quest) return;
    var r = Q.grade(S.quest, { answers: S.answers, design: S.design });
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
    var html = '<p class="mnote"><b>お手本の手順</b>: ' + esc(a.note) + '</p>';
    if (a.solve) {
      var r = a.solve();
      html += '<p class="mnote">' + esc(r.text) + '</p>';
      S.answers[q.id] = r.value;
      if (q.kind === 'measure') document.getElementById('qAnswer').value = String(+r.value.toPrecision(4));
      if (q.kind === 'choice') document.getElementById('qChoice').value = r.value;
      S.points[q.cam] = ANS.sweepMystery(q.cam);
      lastFrame = null;
      S.showFit = true; document.getElementById('showFit').checked = true;
    } else if (a.design) {
      if (!confirm('お手本の設計を出します。今の設計は置き換わります。よろしいですか？')) return;
      S.design = a.design();
      S.cam = 'design';
      sync();
    }
    document.getElementById('qResult').innerHTML = html;
    after();
  }

  function persist() { if (!STORE.save(S)) document.getElementById('statRight').textContent = '（保存できませんでした）'; }

  PX.ui = { mount: mount, get state() { return S; }, selectQuest: selectQuest, shoot: shoot, sweep: sweep, camera: camera };
})(typeof window !== 'undefined' ? window : globalThis);
