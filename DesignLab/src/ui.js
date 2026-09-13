/* 画面 ― ブラウザに触るのはこのファイルと main.js だけ
 *
 * 真ん中は 2×2 の図（どれも sys.js の evaluate と同じ式から描く。図に嘘はない）。
 * 動きは「数字の意味を体でつかむ」ためのもので、動かしている量も式から出す:
 *   左上  光の予算 ― 各段の率（対数の棒）と、率に比例した密度で流れる粒
 *   右上  SN 比と信号 ― sCMOS と EM-CCD の曲線・交差点・今の設計の点（脈打つ）
 *   左下  LiDAR の到着時刻 ― 1 ns のビンに期待値が 1 パルスずつ積もる（√k で山が床から立つ）
 *   右下  分光器のセンサ ― 波長の位置 x(λ)・2 次の重なり・往復する走査線と、その 2 次の着地点
 * 粒の位置は決定的な数列（黄金比の低食い違い列）で作る。乱数は使わない。
 */
(function (global) {
  'use strict';
  var DG = global.DG;
  var M = DG.sys, Q = DG.quest, ANS = DG.answer, STORE = DG.store;

  var S = null, cv, ctx, DPR = 1, animOn = true, t0 = null;
  var COL = { bg: '#14171c', panel: '#191d24', line: '#2f3642', fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f',
              photon: '#ffcc66', electron: '#5aa9e6', warm: '#ffab40', green: '#4cc38a', red: '#e5686d',
              now: '#ffffff', band: 'rgba(255,171,64,0.18)' };
  var GOLD = 0.6180339887498949, PLAS = 0.7548776662466927;
  function frac(x) { return x - Math.floor(x); }

  /* ---- 設計の欄 [key, 名前, 単位, min, max, 整数?]。key が '#' の行は小見出し ---- */
  var FIELDS = [
    ['#', 'A 微弱光カメラ'],
    ['phot', '分子の光子', '/s', 1, 1e9],
    ['na', '対物レンズの NA', '', 0.05, 1.7],
    ['nimm', '浸液の屈折率', '', 1, 1.8],
    ['topt', '光学系の透過', '（0〜1）', 0.01, 1],
    ['qe', '量子効率', '（0〜1）', 0.01, 1],
    ['texp', '露光', 'ms', 0.01, 1e5],
    ['npix', '輝点の画素数', '画素', 1, 400, true],
    ['sigr', '読み出し雑音', 'e⁻/画素', 0, 100],
    ['bgr', '背景光', 'e⁻/画素/s', 0, 1e7],
    ['dark25', '暗電流（冷却前）', 'e⁻/画素/s', 0, 1e5],
    ['dtc', '冷やす温度差', 'K', 0, 100],
    ['emccd', 'EM-CCD にする', '0 か 1', 0, 1, true],
    ['fwc', '飽和電荷', 'e⁻', 100, 1e7],
    ['nbit', 'ADC のビット数', 'bit', 6, 24, true],
    ['pxw', '画素（横）', '画素', 1, 20000, true],
    ['pxh', '画素（縦）', '画素', 1, 20000, true],
    ['fps', '枚/秒', '/s', 0.1, 1e5],
    ['link', '伝送の帯域', 'Gb/s', 0.1, 1000],
    ['qmax', 'TEC の最大吸熱', 'W', 0.1, 500],
    ['dtmax', 'TEC の最大温度差', 'K', 1, 150],
    ['qload', '熱負荷', 'W', 0, 500],
    ['#', 'B LiDAR'],
    ['ppk', '尖頭値', 'W', 0.001, 1e4],
    ['pw', 'パルスの幅', 'ns', 0.01, 1000],
    ['lnm', '波長', 'nm', 200, 3000],
    ['rho', '反射率', '（0〜1）', 0.001, 1],
    ['dap', '受光口の直径', 'mm', 1, 500],
    ['rng', '距離', 'm', 0.1, 10000],
    ['topt2', '受光の透過', '（0〜1）', 0.01, 1],
    ['pde', '検出効率', '（0〜1）', 0.001, 1],
    ['esun', '太陽（分光）', 'W/(m²·nm)', 0, 3],
    ['dlf', 'フィルタの幅', 'nm', 0.1, 500],
    ['ifov', '瞬時視野（四方）', '度', 0.001, 10],
    ['taud', '不感時間', 'ns', 0, 10000],
    ['frep', '繰り返し', 'kHz', 0.01, 1e5],
    ['npulse', '積むパルス', '回', 1, 1e6, true],
    ['jit', 'SPAD・TDC の揺らぎ', 'ns', 0, 100],
    ['#', 'C 分光器'],
    ['lpmm', '格子の本数', '本/mm', 10, 5000],
    ['alpha', '入射角', '度', -80, 80],
    ['fmm', '焦点距離', 'mm', 5, 2000],
    ['slitum', 'スリットの幅', 'µm', 1, 2000],
    ['pxum', '画素の幅', 'µm', 1, 500],
    ['npx', '画素の数', '画素', 1, 100000, true],
    ['lamlo', '範囲（短い側）', 'nm', 100, 5000],
    ['lamhi', '範囲（長い側）', 'nm', 100, 5000],
    ['fibum', 'ファイバのコア', 'µm', 1, 3000],
    ['nafib', 'ファイバの NA', '', 0.01, 1],
    ['fnum', '分光器の F 数', '', 0.5, 30],
    ['ne', '1 画素の電子', 'e⁻', 1, 1e9],
    ['navg', '平均の回数', '回', 1, 1e7, true],
    ['tint', '1 回の露光', 'ms', 0.001, 1e6],
    ['slope', 'スペクトルの傾き', 'AU/nm', 0, 10],
    ['dlcal', '校正の残差', 'nm', 0, 10],
    ['#', 'D PET'],
    ['egam', 'γ 線のエネルギー', 'keV', 1, 10000],
    ['ly', 'シンチの光量', '光子/keV', 0.1, 200],
    ['lcol', '集光', '（0〜1）', 0.001, 1],
    ['pdep', 'MPPC の検出効率', '（0〜1）', 0.001, 1],
    ['pct', 'クロストーク', '（0〜1）', 0, 0.9],
    ['rint', '固有の分解能', '% FWHM', 0, 50],
    ['ncell', 'MPPC のセル数', '個', 1, 1e7, true],
    ['lwin', 'エネルギーの窓の下限', 'keV', 1, 10000],
    ['latt', '減衰長', 'mm', 0.1, 1000],
    ['lcr', '結晶の長さ', 'mm', 0.1, 1000],
    ['wcoin', '同時計数の窓', 'ns', 0.01, 1000],
    ['sing', '単独の計数（片側）', '/s', 0, 1e9],
    ['ctr', '時刻の分解能', 'ps FWHM', 1, 1e5],
    ['fov', '視野の直径', 'cm', 1, 500],
    ['tdec', '発光の減衰', 'ns', 0.1, 10000],
    ['rch', '1 チャネルの計数', '/s', 0, 1e9],
    ['#', 'E 蛍光寿命'],
    ['tauf', '寿命', 'ns', 0.01, 1e5],
    ['fflim', 'パルスの繰り返し', 'MHz', 0.001, 1000],
    ['mu', '1 パルスの検出数 µ', '個', 0.0001, 5],
    ['nphf', '1 画素の光子', '個', 1, 1e9, true],
    ['npxl', '画像の一辺', '画素', 1, 10000, true],
    ['dcr', '暗計数', '/s', 0, 1e9]
  ];

  function num(t) {
    var v = parseFloat(String(t).replace(/[,，\s]/g, ''));
    return isFinite(v) ? v : NaN;
  }
  function g(v, d) { return isFinite(v) ? (+v).toFixed(d === undefined ? 2 : d) : '—'; }
  /* 桁の大きい数は「m×10ⁿ」にそろえる（e+4 と ×10^5 が同じ図に混ざらないように） */
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  function x10(v, d) {
    if (!isFinite(v)) return '—';
    if (v === 0) return '0';
    var a = Math.abs(v), p = d || 3;
    if (a >= 0.01 && a < 1e4) return String(Number((+v).toPrecision(p)));
    var e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
    if (Math.abs(Number(m.toPrecision(p))) >= 10) { e += 1; m = v / Math.pow(10, e); }
    return m.toFixed(p - 1) + '×10' + String(e).split('').map(function (c) { return SUP[c]; }).join('');
  }
  function now() {
    var p = global.performance;
    return p && p.now ? p.now() : Date.now();
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
    var tt = now();
    if (t0 === null) t0 = tt;
    var t = animOn ? (tt - t0) / 1000 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(DPR, DPR);
    var w = W / DPR, h = H / DPR;
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, w, h);

    var ev;
    try { ev = M.evaluate(S.design); } catch (e) { ev = null; }
    if (ev) {
      var gap = 14, pad = 8, top = 22, bottom = 34;
      var cw = (w - gap) / 2, ch = (h - gap) / 2;
      var boxes = [
        { x: 0, y: 0 }, { x: cw + gap, y: 0 }, { x: 0, y: ch + gap }, { x: cw + gap, y: ch + gap }
      ].map(function (o) { return { x: o.x + pad, y: o.y + top, w: Math.max(80, cw - 2 * pad), h: Math.max(60, ch - top - bottom) }; });
      drawBudget(boxes[0], ev, t);
      drawSnr(boxes[1], ev, t);
      drawHist(boxes[2], ev, t);
      drawSensor(boxes[3], ev, t);
    }
    updateStatus(ev);
    if (animOn) requestDraw();
  }

  function frameBox(b, title) {
    ctx.fillStyle = COL.panel; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    label(b.x, b.y - 7, title, COL.fg2, 'left', '11px', b.w);
  }
  function clipTo(b) { ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip(); }

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
  function dash(on) { if (ctx.setLineDash) ctx.setLineDash(on ? [4, 4] : []); }
  function decLabel(p) {
    if (p === 0) return '1';
    if (p === 1) return '10';
    if (p === -1) return '0.1';
    if (p === 2) return '100';
    if (p === -2) return '0.01';
    if (p === 3) return '1000';
    return '10' + String(p).split('').map(function (c) { return SUP[c]; }).join('');
  }

  /* ---- 左上: 光の予算 ---- */
  function drawBudget(b, ev, t) {
    frameBox(b, '光の予算 ― 分子の光子から 1 露光の電子まで（棒は対数・粒の密度は率に比例）');
    var d = S.design, c = ev.cam;
    var rows = [
      { k: '分子が出す', v: d.phot, u: '/s' },
      { k: '集める ×' + g(c.collect, 3), v: d.phot * c.collect, u: '/s' },
      { k: '光学系 ×' + g(d.topt, 2), v: d.phot * c.collect * d.topt, u: '/s' },
      { k: '電子に ×' + g(d.qe, 2), v: d.phot * c.collect * d.topt * d.qe, u: 'e⁻/s' },
      { k: '露光 ' + g(d.texp, 2) + ' ms', v: c.S, u: 'e⁻' }
    ];
    var vmax = 1, vmin = 1e30;
    rows.forEach(function (r) { vmax = Math.max(vmax, r.v); vmin = Math.min(vmin, Math.max(r.v, 1e-3)); });
    var p0 = Math.floor(Math.log10(vmin)), p1 = Math.ceil(Math.log10(vmax));
    if (p1 <= p0) p1 = p0 + 1;
    var lw = Math.min(118, b.w * 0.34), vw = Math.min(92, b.w * 0.24);
    var bx = b.x + lw, bw = Math.max(20, b.w - lw - vw - 10);
    var rh = (b.h - 26) / rows.length, bh = Math.min(16, rh * 0.5);
    function X(v) { return bx + bw * (Math.log10(Math.max(v, Math.pow(10, p0))) - p0) / (p1 - p0); }
    clipTo(b);
    /* 目盛り（10 倍ごと） */
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    for (var p = p0; p <= p1; p++) line(X(Math.pow(10, p)), b.y + 6, X(Math.pow(10, p)), b.y + b.h - 20);
    ctx.globalAlpha = 1;
    var step = Math.max(1, Math.ceil((p1 - p0) / Math.max(1, Math.floor(bw / 34))));
    for (p = p0; p <= p1; p += step) label(X(Math.pow(10, p)), b.y + b.h - 7, decLabel(p), COL.fg3, 'center', '9px');
    rows.forEach(function (r, i) {
      var y = b.y + 8 + i * rh + (rh - bh) / 2;
      var xe = X(Math.max(r.v, 1e-3));
      ctx.fillStyle = i === rows.length - 1 ? COL.electron : (i === 3 ? COL.electron : COL.photon);
      ctx.globalAlpha = 0.28; ctx.fillRect(bx, y, Math.max(1, xe - bx), bh); ctx.globalAlpha = 1;
      label(b.x + 6, y + bh * 0.75, r.k, COL.fg2, 'left', '10px', lw - 10);
      label(b.x + b.w - 6, y + bh * 0.75, x10(r.v, 3) + ' ' + r.u, COL.fg, 'right', '10px', vw);
      /* 粒: 最初の段の 36 個に対して率の比だけ流す（露光の段は電子を 1 個 1 粒で、60 個まで） */
      var n = i < 4 ? Math.round(36 * r.v / rows[0].v) : Math.min(60, Math.round(r.v));
      var len = Math.max(1, xe - bx), col = i >= 3 ? COL.electron : COL.photon;
      for (var k = 0; k < n; k++) {
        var u = i < 4 ? frac(k * GOLD + t * 0.35) : frac(k * GOLD);
        var yy = y + 2 + frac(k * PLAS + i * 0.37) * (bh - 4);
        dot(bx + u * len, yy, col, 1.6);
      }
    });
    ctx.restore();
  }

  /* ---- 右上: SN 比と信号 ---- */
  function drawSnr(b, ev, t) {
    var c = ev.cam, d = S.design;
    frameBox(b, 'SN 比と信号 ― sCMOS（青）と EM-CCD（橙）。交差は S + B = 画素数 × σr²');
    var pts = M.snrSweep(d, 120);
    var ymin = 1e30, ymax = 1e-30;
    pts.forEach(function (p) { ymin = Math.min(ymin, p.s, p.e); ymax = Math.max(ymax, p.s, p.e); });
    var q0 = Math.max(-3, Math.floor(Math.log10(Math.max(ymin, 1e-3)))), q1 = Math.min(3, Math.ceil(Math.log10(Math.max(ymax, 1e-2))));
    if (q1 <= q0) q1 = q0 + 1;
    var L = 30, Bm = 18;
    var ib = { x: b.x + L, y: b.y + 8, w: b.w - L - 8, h: b.h - Bm - 12 };
    function X(s) { return ib.x + ib.w * (Math.log10(s) + 1) / 5; }
    function Y(v) { return ib.y + ib.h * (1 - (Math.log10(Math.max(v, 1e-6)) - q0) / (q1 - q0)); }
    clipTo(b);
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    var p;
    for (p = -1; p <= 4; p++) { line(X(Math.pow(10, p)), ib.y, X(Math.pow(10, p)), ib.y + ib.h); label(X(Math.pow(10, p)), b.y + b.h - 5, decLabel(p), COL.fg3, 'center', '9px'); }
    for (p = q0; p <= q1; p++) { line(ib.x, Y(Math.pow(10, p)), ib.x + ib.w, Y(Math.pow(10, p))); label(ib.x - 4, Y(Math.pow(10, p)) + 3, decLabel(p), COL.fg3, 'right', '9px'); }
    ctx.globalAlpha = 1;
    function curve(key, col) {
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach(function (pt, i) { var xx = X(pt.S), yy = Y(pt[key]); if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); });
      ctx.stroke(); ctx.lineWidth = 1;
    }
    curve('s', COL.electron); curve('e', COL.warm);
    /* 交差点 S = 画素数·σr² − B（B が大きすぎると交差しない） */
    var sx = c.rn2 - c.B;
    if (sx > 0.1 && sx < 1e4) {
      ctx.strokeStyle = COL.fg3; dash(true); line(X(sx), ib.y, X(sx), ib.y + ib.h); dash(false);
      label(X(sx) + 4, ib.y + ib.h - 6, '交差 ' + g(sx, 1) + ' e⁻', COL.fg2, 'left', '10px', ib.w * 0.4);
    } else {
      label(ib.x + ib.w - 4, ib.y + ib.h - 6, '背景が多く、どの明るさでも sCMOS が上', COL.fg2, 'right', '10px', ib.w * 0.8);
    }
    if (c.S >= 0.1 && c.S <= 1e4) {
      var r = 3.5 + 1.5 * Math.sin(t * 2 * Math.PI * 0.8);
      dot(X(c.S), Y(c.snr), COL.now, r);
    }
    ctx.fillStyle = COL.fg2;
    label(ib.x + 6, ib.y + 14, '白 = 今の設計: ' + g(c.S, 1) + ' e⁻・SN 比 ' + g(c.snr, 2) + '（' + (d.emccd ? 'EM-CCD' : 'sCMOS') + '）', COL.fg, 'left', '10px', ib.w - 12);
    ctx.restore();
  }

  /* 標準正規の累積（Abramowitz–Stegun 7.1.26、誤差 1.5×10⁻⁷） */
  function Phi(z) {
    var s = z < 0 ? -1 : 1, x = Math.abs(z) / Math.SQRT2;
    var tt = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * tt - 1.453152027) * tt) + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt * Math.exp(-x * x);
    return 0.5 * (1 + s * y);
  }

  /* ---- 左下: LiDAR の到着時刻のヒストグラム ---- */
  function drawHist(b, ev, t) {
    var l = ev.lid, d = S.design;
    frameBox(b, 'LiDAR の到着時刻 ― 1 ns のビンに、期待値が 1 パルスずつ積もる');
    var N = Math.min(1000, Math.max(d.npulse, 10));
    var k = animOn ? 1 + Math.floor(frac(t / 6) * N) : N;
    var nb = 40, c0 = nb / 2, sig = Math.max(l.sig1ns, 1e-3);
    var bgBin = l.rbg * 1e-9;
    var per = [], i;
    for (i = 0; i < nb; i++) {
      var sg = l.nsig * (Phi((i + 1 - c0) / sig) - Phi((i - c0) / sig));
      per.push({ s: sg, b: bgBin });
    }
    var peakN = 0;
    per.forEach(function (x) { peakN = Math.max(peakN, (x.s + x.b) * N); });
    var lo = Math.max(1e-3, Math.min(bgBin > 0 ? bgBin : peakN * 1e-3, peakN * 1e-3));
    var q0 = Math.floor(Math.log10(lo)), q1 = Math.ceil(Math.log10(Math.max(peakN, lo * 10)));
    if (q1 <= q0) q1 = q0 + 1;
    var L = 32, Bm = 18;
    var ib = { x: b.x + L, y: b.y + 24, w: b.w - L - 8, h: b.h - Bm - 30 };
    function Y(v) { return ib.y + ib.h * (1 - (Math.log10(Math.max(v, Math.pow(10, q0))) - q0) / (q1 - q0)); }
    clipTo(b);
    ctx.strokeStyle = COL.line; ctx.globalAlpha = 0.6;
    var stepQ = Math.max(1, Math.ceil((q1 - q0) / 4));
    for (var p = q0; p <= q1; p += stepQ) { line(ib.x, Y(Math.pow(10, p)), ib.x + ib.w, Y(Math.pow(10, p))); label(ib.x - 4, Y(Math.pow(10, p)) + 3, decLabel(p), COL.fg3, 'right', '9px'); }
    ctx.globalAlpha = 1;
    var bw = ib.w / nb;
    per.forEach(function (x, j) {
      var v = (x.s + x.b) * k;
      var yy = Y(v), isSig = x.s > x.b;
      ctx.fillStyle = isSig ? COL.photon : COL.fg3;
      ctx.globalAlpha = isSig ? 0.85 : 0.6;
      ctx.fillRect(ib.x + j * bw + 0.5, yy, Math.max(1, bw - 1), ib.y + ib.h - yy);
    });
    ctx.globalAlpha = 1;
    label(ib.x, b.y + b.h - 5, '−20 ns', COL.fg3, 'left', '9px');
    label(ib.x + ib.w / 2, b.y + b.h - 5, g(l.tofUs, 3) + ' µs（' + g(d.rng, 0) + ' m）', COL.fg3, 'center', '9px', ib.w * 0.5);
    label(ib.x + ib.w, b.y + b.h - 5, '+20 ns', COL.fg3, 'right', '9px');
    var snrk = l.snr1 * Math.sqrt(k);
    label(b.x + 6, b.y + 15, k + ' / ' + N + ' パルス: 山 ' + x10(l.nsig * k, 3) + ' 個・床 ' + x10(bgBin * k, 3) + ' 個/ns・SN 比 ' + g(snrk, 1),
          COL.fg, 'left', '10px', b.w - 12);
    ctx.restore();
  }

  /* 見える光の色（380〜780 nm の近似。外は灰色） */
  function lamColor(nm) {
    var r = 0, gg = 0, bb = 0;
    if (nm < 380 || nm > 780) return '#8a93a3';
    if (nm < 440) { r = (440 - nm) / 60; bb = 1; }
    else if (nm < 490) { gg = (nm - 440) / 50; bb = 1; }
    else if (nm < 510) { gg = 1; bb = (510 - nm) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; gg = 1; }
    else if (nm < 645) { r = 1; gg = (645 - nm) / 65; }
    else r = 1;
    function h(v) { var s = Math.round(60 + 195 * v).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h(r) + h(gg) + h(bb);
  }

  /* ---- 右下: 分光器のセンサ地図 ---- */
  function drawSensor(b, ev, t) {
    var p = ev.sp, d = S.design;
    frameBox(b, '分光器のセンサ ― 波長の位置 x(λ)・2 次の重なり・走査線');
    clipTo(b);
    var half = Math.max(p.sensor, isFinite(p.span) ? Math.max(Math.abs(p.xlo), Math.abs(p.xhi)) * 2 : p.sensor) / 2 * 1.08;
    var mx = 14, ax = b.x + mx, aw = b.w - 2 * mx;
    function X(mm) { return ax + aw * (mm + half) / (2 * half); }
    var barY = b.y + 42, barH = 18;
    ctx.fillStyle = '#2b3140'; ctx.fillRect(X(-p.sensor / 2), barY, X(p.sensor / 2) - X(-p.sensor / 2), barH);
    ctx.strokeStyle = COL.fg3; ctx.strokeRect(X(-p.sensor / 2) + 0.5, barY + 0.5, X(p.sensor / 2) - X(-p.sensor / 2) - 1, barH - 1);
    /* 2 次の重なり: 1 次の [2·lamlo, lamhi] の場所に、2 次の [lamlo, lamhi/2] が来る */
    if (p.overlap) {
      var xa = p.xmm(2 * d.lamlo), xb = p.xmm(d.lamhi);
      if (isFinite(xa) && isFinite(xb)) {
        ctx.fillStyle = COL.band; ctx.fillRect(Math.min(X(xa), X(xb)), barY + barH + 4, Math.abs(X(xb) - X(xa)), 8);
        label((X(xa) + X(xb)) / 2, barY + barH + 26, '2 次が重なる（' + g(2 * d.lamlo, 0) + '〜' + g(d.lamhi, 0) + ' nm の場所）', COL.warm, 'center', '10px', aw * 0.9);
      }
    }
    /* 目盛り: 100 nm ごと（詰まるときは間引く） */
    var a0 = Math.ceil(d.lamlo / 100) * 100, a1 = Math.floor(d.lamhi / 100) * 100;
    var nt = Math.max(1, (a1 - a0) / 100 + 1), pxPerTick = aw / nt, every = Math.max(1, Math.ceil(34 / Math.max(pxPerTick, 1)));
    ctx.strokeStyle = COL.fg2;
    for (var lam = a0, n = 0; lam <= a1; lam += 100, n++) {
      var xm = p.xmm(lam);
      if (!isFinite(xm)) continue;
      ctx.strokeStyle = lamColor(lam); ctx.lineWidth = 2; line(X(xm), barY - 6, X(xm), barY + barH); ctx.lineWidth = 1;
      if (n % every === 0) label(X(xm), barY - 10, String(lam), COL.fg2, 'center', '9px');
    }
    /* 走査線: lamlo ↔ lamhi を 8 秒で往復 */
    var s = animOn ? 0.5 - 0.5 * Math.cos(2 * Math.PI * t / 8) : 0.5;
    var ls = d.lamlo + (d.lamhi - d.lamlo) * s, xs = p.xmm(ls);
    if (isFinite(xs)) {
      var wRes = p.res / Math.max(p.recip, 1e-9);                 /* 分解能の幅 [mm] */
      ctx.fillStyle = lamColor(ls); ctx.globalAlpha = 0.35;
      ctx.fillRect(X(xs - wRes / 2), barY, Math.max(1, X(xs + wRes / 2) - X(xs - wRes / 2)), barH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COL.now; line(X(xs), barY - 2, X(xs), barY + barH + 2);
      var x2 = 2 * ls <= d.lamhi ? p.xmm(2 * ls) : NaN;
      if (isFinite(x2)) {
        ctx.strokeStyle = COL.warm; dash(true); line(X(x2), barY - 2, X(x2), barY + barH + 2); dash(false);
      }
      label(b.x + 6, b.y + b.h - 22, 'λ = ' + g(ls, 0) + ' nm → x = ' + g(xs, 2) + ' mm'
            + (isFinite(x2) ? '・2 次は ' + g(2 * ls, 0) + ' nm の場所（破線）' : ''), COL.fg, 'left', '10px', b.w - 12);
    }
    /* 下の余白に、2 つの予算の内訳（入る光は掛け算、吸光度の不確かさは二乗和） */
    var top2 = barY + barH + 36, bot2 = b.y + b.h - 34;
    if (bot2 - top2 >= 90) {
      var hh = (bot2 - top2 - 8) / 2;
      budgetRows({ x: b.x + 6, y: top2, w: b.w - 12, h: hh }, '入る光 ― 掛け算（目盛りは 0〜100%）', [
        { k: 'スリットが切り出す', v: p.slitFrac, t: g(p.slitFrac * 100, 1) + ' %', col: COL.photon },
        { k: '角度で受けられる', v: p.angFrac, t: g(p.angFrac * 100, 1) + ' %', col: COL.photon },
        { k: '合わせて', v: p.thru, t: g(p.thru * 100, 2) + ' %', col: COL.green }
      ], null);
      budgetRows({ x: b.x + 6, y: top2 + hh + 8, w: b.w - 12, h: hh }, '吸光度の不確かさ ― 二乗和（対数の目盛り）', [
        { k: 'ショット雑音', v: p.dAavg, t: x10(p.dAavg, 3), col: COL.electron },
        { k: '波長のずれ', v: p.calErr, t: x10(p.calErr, 3), col: COL.warm },
        { k: '合わせて', v: p.uA, t: x10(p.uA, 3), col: COL.green }
      ], { lo: -7, hi: -1 });
    }
    label(b.x + 6, b.y + b.h - 7, '1 画素 ' + g(p.pxnm, 2) + ' nm・分解能の目安 ' + g(p.res, 2) + ' nm・全長 ' + g(p.span, 2) + ' / ' + g(p.sensor, 1) + ' mm'
          + (p.fits ? '' : '（はみ出し）'), p.fits ? COL.fg2 : COL.red, 'left', '10px', b.w - 12);
    label(b.x + 6, b.y + 14, '白 = 走査線の波長・色の帯 = 分解能の幅', COL.fg3, 'left', '10px', b.w - 12);
    ctx.restore();
  }

  /** 内訳の横棒。log が null なら 0〜1 の線形、{lo, hi} なら 10^lo〜10^hi の対数 */
  function budgetRows(a, title, rows, log) {
    label(a.x, a.y + 10, title, COL.fg2, 'left', '10px', a.w);
    var rh = (a.h - 16) / rows.length, lw = Math.min(110, a.w * 0.3), vw = Math.min(84, a.w * 0.22);
    var bx = a.x + lw, bw = Math.max(10, a.w - lw - vw - 6);
    function F(v) {
      if (!log) return Math.max(0, Math.min(1, v));
      if (!(v > 0)) return 0;
      return Math.max(0, Math.min(1, (Math.log10(v) - log.lo) / (log.hi - log.lo)));
    }
    rows.forEach(function (r, i) {
      var y = a.y + 16 + i * rh, bh = Math.max(4, Math.min(10, rh - 6));
      ctx.fillStyle = COL.line; ctx.fillRect(bx, y + (rh - bh) / 2, bw, bh);
      ctx.fillStyle = r.col; ctx.fillRect(bx, y + (rh - bh) / 2, Math.max(1, bw * F(r.v)), bh);
      label(a.x, y + rh / 2 + 4, r.k, COL.fg3, 'left', '10px', lw - 6);
      label(a.x + a.w, y + rh / 2 + 4, r.t, COL.fg, 'right', '10px', vw);
    });
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/&lt;(\/?)(b|sub|sup)&gt;/g, '<$1$2>'); }

  function updateStatus(ev) {
    var L = document.getElementById('statLeft'), R = document.getElementById('statRight');
    if (!ev) { L.textContent = '計算できませんでした'; R.textContent = ''; return; }
    L.textContent = 'カメラ SN 比 ' + g(ev.cam.snr, 2) + '（' + (S.design.emccd ? 'EM-CCD' : 'sCMOS') + '）　LiDAR ' + g(ev.lid.nsig, 1) + ' 個/パルス・r·τd ' + g(ev.lid.rtd, 2);
    R.textContent = '分光器 分解能 ' + g(ev.sp.res, 2) + ' nm・全長 ' + g(ev.sp.span, 2) + ' mm';
  }

  /* ================= 左のパネル ================= */

  function renderDesign() {
    var host = document.getElementById('designForm');
    host.innerHTML = '';
    host.className = 'df';
    FIELDS.forEach(function (fd) {
      if (fd[0] === '#') {
        var h = document.createElement('div'); h.className = 'sect'; h.textContent = fd[1];
        host.appendChild(h);
        return;
      }
      host.appendChild(numRow(fd[1], S.design[fd[0]], fd[2], function (tx) {
        var v = num(tx);
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
    var c = ev.cam, l = ev.lid, p = ev.sp, pe = ev.pe, fl = ev.fl;
    var rows = [
      ['#', 'カメラ'],
      ['受け入れの半角 / 集める割合', g(c.thetaDeg, 1) + '° / ' + g(c.collect * 100, 1) + ' %'],
      ['信号 / 背景＋暗電流', g(c.S, 1) + ' / ' + g(c.B, 1) + ' e⁻'],
      ['読み出し雑音の二乗（画素ぶん）', g(c.rn2, 1) + ' e⁻²'],
      ['SN 比 sCMOS / EM-CCD', g(c.snrS, 2) + ' / ' + g(c.snrE, 2)],
      ['暗電流', x10(c.darkRate, 3) + ' e⁻/画素/s'],
      ['DR / 1 LSB', g(c.drDb, 1) + ' dB / ' + g(c.lsb, 3) + ' e⁻'],
      ['データ', g(c.gbps, 2) + ' Gb/s（1 分 ' + g(c.gbPerMin, 0) + ' GB）', c.gbps > S.design.link],
      ['TEC が吸える熱', g(c.qc, 2) + ' W', c.qc < S.design.qload],
      ['#', 'LiDAR'],
      ['パルスの光子', x10(l.nph, 3) + ' 個（' + g(l.epNj, 0) + ' nJ）'],
      ['1 パルスの検出数', g(l.nsig, 2) + ' 個'],
      ['背景 / r·τd', x10(l.rbg, 3) + ' /s / ' + g(l.rtd, 3), l.rtd > 1],
      ['SN 比 1 パルス / 積んで', g(l.snr1, 2) + ' / ' + g(l.snrN, 2)],
      ['距離のばらつき', g(l.sig1cm, 1) + ' → ' + g(l.sigNcm, 2) + ' cm'],
      ['1 点の時間 / あいまいさのない距離', g(l.tptMs, 3) + ' ms / ' + g(l.runambM, 0) + ' m'],
      ['#', '分光器'],
      ['センサの上の位置', g(p.xlo, 2) + ' 〜 ' + g(p.xhi, 2) + ' mm', !p.fits],
      ['逆線分散 / 1 画素 / 分解能', g(p.recip, 1) + ' nm/mm / ' + g(p.pxnm, 2) + ' / ' + g(p.res, 2) + ' nm'],
      ['入る光', g(p.thru * 100, 2) + ' %（' + g(p.slitFrac * 100, 1) + ' × ' + g(p.angFrac * 100, 1) + '）'],
      ['吸光度の雑音 / 不確かさ', x10(p.dAavg, 3) + ' / ' + x10(p.uA, 3)],
      ['2 次の重なり', p.overlap ? 'ある（次数カットフィルタ）' : 'ない', p.overlap],
      ['#', 'PET'],
      ['光電子 / 分解能', g(pe.npe, 0) + ' / ' + g(pe.resPct, 1) + ' %（統計 ' + g(pe.statPct, 1) + '）'],
      ['MPPC の飽和', g(pe.satPct, 2) + ' %', pe.satPct > 5],
      ['窓で落とせる散乱 / 本物を残す', (isFinite(pe.thetaCut) ? 'θ > ' + g(pe.thetaCut, 1) + '°' : '―') + ' / ' + g(pe.keep * 100, 2) + ' %'],
      ['止まる（片側 / 両側）', g(pe.stop1 * 100, 0) + ' / ' + g(pe.stop2 * 100, 0) + ' %'],
      ['偶発同時計数 / 窓の下限', g(pe.randoms, 1) + ' /s / ' + g(pe.wminNs, 2) + ' ns', S.design.wcoin < pe.wminNs],
      ['TOF / パイルアップ', g(pe.tofCm, 2) + ' cm / ' + g(pe.pile * 100, 1) + ' %'],
      ['#', '蛍光寿命'],
      ['周期 / 持ち越し', g(fl.Tns, 1) + ' ns / ' + x10(fl.carry, 2)],
      ['計数 / パイルアップ', x10(fl.rate, 3) + ' /s / ' + g(fl.pile * 100, 2) + ' %'],
      ['1 画素 / 画像 1 枚', g(fl.tpixMs, 1) + ' ms / ' + g(fl.timgS / 60, 1) + ' 分'],
      ['寿命の精度 / 暗計数の比', g(fl.prec * 100, 2) + ' % / ' + x10(fl.dcrRatio, 2)]
    ];
    document.getElementById('derived').innerHTML = '<div class="dv">' + rows.map(function (r) {
      if (r[0] === '#') return '<span class="k sect2">' + esc(r[1]) + '</span><span class="v"></span>';
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
    var ba = document.getElementById('btnAnim');
    ba.addEventListener('click', function () {
      animOn = !animOn;
      ba.textContent = animOn ? '動きを止める' : '動かす';
      requestDraw();
    });
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
    document.getElementById('qHint').innerHTML = md(q.hint);
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

  DG.ui = {
    mount: mount, get state() { return S; }, selectQuest: selectQuest,
    get animating() { return animOn; }, FIELDS: FIELDS
  };
})(typeof window !== 'undefined' ? window : globalThis);
