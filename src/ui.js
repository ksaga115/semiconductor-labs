/* 画面 ― 作業台（測る窓は chart.js、起動は main.js）
 *
 * **ブラウザに触るのは ui.js・chart.js・main.js の3つだけ。** ほかの src/*.js は DOM も
 * canvas も知らないので、検査は全部 Node で走る（NandLab / CoinLab と同じ流儀）。
 * tests/ui.js の DOM_FILES がこの約束を見張っている。
 *
 * 絵は4段に積む。上から順に:
 *
 *   1. 断面      作った一片の並び。空乏層は塗りではなく**計算結果**を塗っている
 *   2. バンド図  電位を裏返したもの。フェルミ準位が水平なら平衡
 *   3. キャリア  n と p を対数で。20桁が一目で分かるのは対数だけ
 *   4. 下の段    電界 / 電荷 / 光の生成 のどれか
 *
 * 【色の役割は1つに絞る】赤=p型 / 青=n型 / 黄土=酸化膜 / 銀=電極。
 * この4色を他の意味に使わない。style.css の頭にも同じことを書いてある。
 *
 * 【x 軸は共有】4段とも同じ左端・同じ右端。拡大スライダは左端から見る幅を変える
 * （フォトダイオードは 200µm あるのに、面白いのは手前 1µm なので）。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});
  var P = SL.phys, ST = SL.stack, PS = SL.poisson, BAND = SL.band,
      DEV = SL.dev, LIGHT = SL.light, Q = SL.quest, ANS = SL.answer, STORE = SL.store;

  var S = null;                 /* 状態 */
  var cv, ctx, DPR = 1;
  var calc = null;              /* 計算結果のキャッシュ */
  var dirty = true;

  /* ================= 起動 ================= */

  function mount(state) {
    S = state;
    cv = document.getElementById('board');
    ctx = cv.getContext('2d');

    bindTop();
    bindLeft();
    bindQuests();
    renderQuestList();
    syncControls();
    invalidate();

    window.addEventListener('resize', resize);
    resize();

    /* 起動した時点の状態を一度書いておく。
     * ここで書かないと、何も触らずに閉じたときに「初めて開いた」扱いのままになり、
     * 次に開いたときまた最初の一片が置かれる。 */
    persist();
  }

  function invalidate() { dirty = true; calc = null; requestDraw(); }

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

  /* ================= 計算 ================= */

  function compute() {
    if (calc) return calc;
    var st = S.stack;
    if (!st.layers.length) { calc = { empty: true }; return calc; }

    var t0 = (global.performance || Date).now();
    var m = ST.mesh(st, S.T);
    /* 大きな電圧は 0V から段階的に上げて解く（poisson.js の solveRobust） */
    var sol = PS.solveRobust(m, S.bias);
    var b = BAND.bands(sol);
    var id = DEV.identify(st);
    var js = ST.junctionNodes(m);
    var dep = js.length ? PS.depletionByCharge(sol) : null;
    var span = PS.fieldSpan(sol, 0.05);
    var ph = null;
    if (S.light.on) {
      ph = LIGHT.photo(st, sol, {
        nm: S.light.nm, power: S.light.power,
        ar: S.light.ar, sFront: S.light.sFront
      });
    }
    var warn = limits(st, m, sol, js);
    var ms = (global.performance || Date).now() - t0;

    calc = {
      empty: false, mesh: m, sol: sol, bands: b, id: id, dep: dep, span: span,
      photo: ph, ms: ms, junctions: js, warn: warn
    };
    dirty = false;
    return calc;
  }

  /* ---- モデルの外に出たら知らせる ----
   *
   * 電圧を数値で −200V まで入れられるようにしたので、このモデルが扱えない所まで
   * 簡単に行ける。そこで**黙って絵を描き続けない**。解けてしまう（数値としては
   * 収束する）のが厄介で、絵だけ見ると本物らしく見えてしまう。
   *
   *   降伏        シリコンの電界が降伏の目安を超えた（このモデルは降伏を出さない）
   *   絶縁破壊    酸化膜の電界が 10 MV/cm を超えた
   *   大注入      順方向がビルトイン電位に届いた（小注入の準平衡の外）
   *   縮退        5e19 を超える濃度（ボルツマン統計の外）
   *   未収束      段階的に上げても収束しきらなかった
   */
  var OX_BREAK = 1e7;               /* 酸化膜の絶縁破壊の目安 [V/cm] */

  /** 降伏電界の目安 [V/cm]（Sze の近似。薄い側の濃度で決まる。1e14〜1e18 で使う） */
  function breakdownField(N) {
    N = Math.min(Math.max(N, 1e14), 1e18);
    return 4e5 / (1 - Math.log10(N / 1e16) / 3);
  }

  function limits(st, m, sol, js) {
    var w = [], i, emSi = 0, emOx = 0;
    if (!sol.ok) {
      w.push('ポアソン方程式が収束しきらなかった（層を丸ごと空乏させるほどの電圧など）。表示は途中の解なので、数値は信用しないこと。');
    }
    for (i = 0; i < m.n; i++) {
      var e = Math.abs(sol.E[i]);
      if (m.siDx[i] > 0) { if (e > emSi) emSi = e; }
      else if (e > emOx) emOx = e;
    }
    var gate = m.left === ST.GATE || m.right === ST.GATE;
    /* MOS の表面は反転層で 1e6 V/cm 近くまで行くのが普通なので、降伏の判定はしない */
    if (!gate) {
      var N = js.length
        ? Math.min(Math.abs(m.netL[js[0]]) || 1e14, Math.abs(m.netR[js[0]]) || 1e14)
        : (Math.abs(m.net[m.n - 1]) || 1e14);
      var ec = breakdownField(N);
      if (emSi > ec) {
        w.push('シリコンの最大電界 ' + emSi.toExponential(1) + ' V/cm が、この濃度での降伏の目安 '
          + ec.toExponential(1) + ' V/cm を超えた。実物ならアバランシェ降伏で電流が流れ出す（このモデルは降伏を出さない）。');
      }
    }
    if (emOx > OX_BREAK) {
      w.push('酸化膜の電界 ' + (emOx / 1e6).toFixed(1) + ' MV/cm が、絶縁破壊の目安 10 MV/cm を超えた。実物なら酸化膜が壊れている。');
    }
    if (js.length === 1) {
      var d = DEV.diode(st, S.T);
      if (d) {
        var fwd = d.leftIsP ? S.bias.left - S.bias.right : S.bias.right - S.bias.left;
        if (fwd > d.Vbi - 0.05) {
          w.push('順方向 ' + fwd.toFixed(2) + ' V がビルトイン電位 ' + d.Vbi.toFixed(2)
            + ' V に届いた。大注入の領域で、このモデル（小注入の準平衡）の外。電位もキャリアも信用しないこと。');
        }
      }
    }
    if (st.layers.some(function (L) { return L.mat === 'si' && (L.na > 5e19 || L.nd > 5e19); })) {
      w.push('5×10¹⁹ を超える濃度の層がある。縮退していてボルツマン統計の外（キャリアが多めに出る）。');
    }
    return w;
  }

  /* ================= 絵 ================= */

  var COL = {
    ptype: '#e0645a', ntype: '#4a9eff', intr: '#7d8794', oxide: '#c9a227',
    metal: '#b9c0cb', dep: '#b39ddb', elec: '#4dd0e1', hole: '#f06292',
    fg: '#dde3ec', fg2: '#93a0b4', fg3: '#66717f', line: '#2f3642',
    bg: '#14171c', panel: '#191d24', ok: '#4cc38a', ng: '#e5686d',
    ec: '#9ecbff', ev: '#ffb59e', ei: '#6b7686', efn: '#4cc38a', efp: '#ffcc66',
    field: '#ce93d8', rho: '#ffab91', gen: '#ffd54f'
  };

  function draw() {
    var W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(DPR, DPR);
    var w = W / DPR, h = H / DPR;

    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, w, h);

    var c = compute();
    if (c.empty) {
      centerText('左の「シリコン」を押して、一片を置くところから。', w, h);
      setStatus('空', '');
      showWarn([]);
      return;
    }

    var L = 62, R = 16, gap = 12;
    var structH = 92;
    var rest = h - structH - gap * 3 - 22;
    if (rest < 120) rest = 120;
    var bandH = Math.round(rest * 0.38);
    var carrH = Math.round(rest * 0.34);
    var fldH = rest - bandH - carrH;

    var xmax = viewMax(c.mesh);
    var box = function (y, hh) { return { x: L, y: y, w: Math.max(40, w - L - R), h: hh, xmax: xmax }; };

    var y = 6;
    drawStructure(box(y, structH), c); y += structH + gap;
    drawBands(box(y, bandH), c);       y += bandH + gap;
    drawCarriers(box(y, carrH), c);    y += carrH + gap;
    drawLower(box(y, fldH), c);        y += fldH;

    drawXAxis(box(y, 20), c);
    updateStatus(c);
  }

  function centerText(t, w, h) {
    ctx.fillStyle = COL.fg3;
    ctx.font = '14px "Yu Gothic UI", Meiryo, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, w / 2, h / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  /** 見る範囲の右端 [cm] */
  function viewMax(m) {
    var total = m.x[m.n - 1];
    var z = (S.view && S.view.zoom !== undefined) ? S.view.zoom : 1;
    /* z=1 で全部、小さいほど手前だけ。対数で効かせる（200µm の手前 0.2µm まで届くように） */
    return Math.max(total * z, 20e-7);
  }

  function px(b, xcm) { return b.x + b.w * Math.min(xcm / b.xmax, 1.2); }

  function panelFrame(b, title, sub) {
    ctx.fillStyle = COL.panel;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COL.line; ctx.lineWidth = 1;
    ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
    ctx.font = '11px "Yu Gothic UI", Meiryo, sans-serif';
    ctx.fillStyle = COL.fg3;
    ctx.fillText(title, b.x + 6, b.y + 13);
    if (sub) {
      ctx.textAlign = 'right';
      ctx.fillText(sub, b.x + b.w - 6, b.y + 13);
      ctx.textAlign = 'left';
    }
  }

  function clipTo(b) { ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip(); }

  /* ---- 1. 断面 ---- */

  function drawStructure(b, c) {
    var m = c.mesh, st = S.stack;
    panelFrame(b, '断面 ― ' + c.id.label, kindHint(c));
    clipTo(b);

    var top = b.y + 20, hh = b.h - 30;
    var x = 0, i;

    for (i = 0; i < st.layers.length; i++) {
      var Lr = st.layers[i];
      var t = Lr.tnm * ST.NM;
      var x0 = px(b, x), x1 = px(b, x + t);
      var wd = Math.max(x1 - x0, 0);
      if (wd > 0.2) {
        ctx.fillStyle = layerColor(Lr);
        ctx.globalAlpha = Lr.mat === 'ox' ? .55 : .40;
        ctx.fillRect(x0, top, wd, hh);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = i === S.sel ? COL.fg : COL.line;
        ctx.lineWidth = i === S.sel ? 2 : 1;
        ctx.strokeRect(x0 + .5, top + .5, wd - 1, hh - 1);
      }
      x += t;
    }

    /* 空乏層 ― 塗りたいから塗るのではなく、解いた結果そこが空乏している */
    if (c.dep) {
      /* 位置は左右の幅で塗る（n が左でも正しく塗れるように） */
      var d0 = px(b, Math.max(c.dep.xj - c.dep.wL, 0));
      var d1 = px(b, c.dep.xj + c.dep.wR);
      ctx.fillStyle = COL.dep; ctx.globalAlpha = .22;
      ctx.fillRect(d0, top, Math.max(d1 - d0, 1), hh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COL.dep; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      line(d0, top, d0, top + hh); line(d1, top, d1, top + hh);
      ctx.setLineDash([]);
      /* 冶金的接合 */
      var xj = px(b, c.dep.xj);
      ctx.strokeStyle = COL.fg; ctx.lineWidth = 1;
      line(xj, top, xj, top + hh);
      label(xj, top + hh + 10, '接合', COL.fg2, 'center');
    }

    /* 電極 */
    /* 接合が端に近いと「接合」と電極の名前が重なるので、そのときは電極の名前を省く */
    var jx = c.dep ? px(b, c.dep.xj) : null;
    drawContact(b, top, hh, 'left', m.left, jx !== null && jx - b.x < 75);
    drawContact(b, top, hh, 'right', m.right, jx !== null && b.x + b.w - jx < 75);

    /* 層の名前 */
    x = 0;
    for (i = 0; i < st.layers.length; i++) {
      var Ly = st.layers[i], tt = Ly.tnm * ST.NM;
      var cx = (px(b, x) + px(b, x + tt)) / 2;
      var wdt = px(b, x + tt) - px(b, x);
      if (wdt > 34) label(cx, top + 14, layerTag(Ly), COL.fg, 'center', '11px');
      if (wdt > 54) label(cx, top + 28, fmtThick(Ly.tnm), COL.fg3, 'center', '10px');
      x += tt;
    }

    /* 光 */
    if (S.light.on && c.photo) drawLightArrows(b, top, hh, c);

    ctx.restore();
  }

  function drawContact(b, top, hh, side, kind, hideLabel) {
    var x = side === 'left' ? b.x : b.x + b.w;
    var wd = 7, x0 = side === 'left' ? x : x - wd;
    ctx.fillStyle = COL.metal; ctx.globalAlpha = kind === ST.GATE ? .95 : .6;
    ctx.fillRect(x0, top, wd, hh);
    ctx.globalAlpha = 1;
    if (!hideLabel) label(side === 'left' ? x + wd + 3 : x - wd - 3, top + hh + 10,
          kind === ST.GATE ? 'ゲート' : 'オーミック', COL.fg3,
          side === 'left' ? 'left' : 'right', '10px');
  }

  function drawLightArrows(b, top, hh, c) {
    var col = nmColor(S.light.nm);
    var a = c.photo.alpha;
    var n = 7, i;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    for (i = 0; i < n; i++) {
      var yy = top + hh * (i + .5) / n;
      /* 矢印の長さ ＝ 吸収長。短いほど手前で吸われる */
      var reach = Math.min(1 / Math.max(a, 1e-3), b.xmax);
      var x1 = px(b, reach);
      ctx.globalAlpha = .75;
      line(b.x + 8, yy, Math.min(x1, b.x + b.w - 2), yy);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(Math.min(x1, b.x + b.w - 2), yy);
      ctx.lineTo(Math.min(x1, b.x + b.w - 2) - 5, yy - 3);
      ctx.lineTo(Math.min(x1, b.x + b.w - 2) - 5, yy + 3);
      ctx.closePath(); ctx.fill();
    }
    /* 断面の見出しとぶつかるので、絵の中の下側に置く */
    label(b.x + 12, top + hh - 6, S.light.nm + 'nm　吸収長 ' + fmtLen(1 / Math.max(a, 1e-9)), col, 'left', '10px');
  }

  /* ---- 2. バンド図 ---- */

  function drawBands(b, c) {
    var m = c.mesh, bd = c.bands, i;
    var split = BAND.splitEF(c.sol);
    var hasGate = m.left === ST.GATE || m.right === ST.GATE;
    panelFrame(b, 'バンド図 [eV]',
      split > 1e-9 ? '準フェルミ準位が ' + split.toFixed(3) + ' eV 離れている'
      : hasGate ? 'ゲートには電流が流れないので、半導体の中は平衡のまま'
      : '平衡（フェルミ準位が1本）');
    clipTo(b);

    /* y の範囲はシリコンのバンドで決める。酸化膜は上へ突き抜けさせる */
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < m.n; i++) {
      if (bd.isOx[i]) continue;
      if (bd.ev[i] < lo) lo = bd.ev[i];
      if (bd.ec[i] > hi) hi = bd.ec[i];
    }
    if (!isFinite(lo)) { lo = -1; hi = 1; }
    var pad = Math.max((hi - lo) * .12, .08);
    lo -= pad; hi += pad + .55;      /* 上に酸化膜の壁を少し見せる */

    var top = b.y + 18, hh = b.h - 26;
    var Y = function (e) { return top + hh * (1 - (e - lo) / (hi - lo)); };

    /* 酸化膜の帯。
     * 【Y(Ec) までを塗ってはいけない】酸化膜の Ec は目盛の外（ずっと上）にあるので、
     * 高さが負になって上へ伸び、見出しの上まで塗りつぶす。
     * 帯は段いっぱいに塗り、壁の高さは Ec の線が上へ突き抜けることで見せる。 */
    for (i = 0; i < m.n - 1; i++) {
      if (!bd.isOx[i]) continue;
      var xa = px(b, m.x[i]), xb = px(b, m.x[i + 1]);
      ctx.fillStyle = COL.oxide; ctx.globalAlpha = .13;
      ctx.fillRect(xa, top, Math.max(xb - xa, 1), hh);
      ctx.globalAlpha = 1;
    }

    curve(b, m, bd.ec, Y, COL.ec, 2);
    curve(b, m, bd.ev, Y, COL.ev, 2);
    curve(b, m, bd.ei, Y, COL.ei, 1, [4, 4]);
    curve(b, m, bd.efn, Y, COL.efn, 1.5, split > 1e-9 ? [6, 3] : null);
    if (split > 1e-9) curve(b, m, bd.efp, Y, COL.efp, 1.5, [6, 3]);

    legend(b, [
      ['Ec', COL.ec], ['Ev', COL.ev], ['Ei', COL.ei],
      [split > 1e-9 ? 'EFn' : 'EF', COL.efn]
    ].concat(split > 1e-9 ? [['EFp', COL.efp]] : []));
    ctx.restore();
  }

  /* ---- 3. キャリア（対数） ---- */

  function drawCarriers(b, c) {
    var m = c.mesh, sol = c.sol, i;
    panelFrame(b, 'キャリア濃度 [cm⁻³]（対数）', 'ni = ' + P.ni(S.T).toExponential(2));
    clipTo(b);

    var lo = 2, hi = 21;                     /* 10^2 〜 10^21 */
    var top = b.y + 18, hh = b.h - 26;
    var Y = function (v) {
      var e = v > 0 ? Math.log10(v) : lo;
      return top + hh * (1 - (Math.max(Math.min(e, hi), lo) - lo) / (hi - lo));
    };

    /* 目盛 */
    ctx.strokeStyle = COL.line; ctx.lineWidth = 1;
    ctx.font = '9px "Yu Gothic UI", Meiryo, sans-serif';
    for (i = lo; i <= hi; i += 3) {
      var yy = Y(Math.pow(10, i));
      ctx.globalAlpha = .5; line(b.x, yy, b.x + b.w, yy); ctx.globalAlpha = 1;
      label(b.x - 4, yy + 3, '1e' + i, COL.fg3, 'right', '9px');
    }
    /* ni の線 */
    var yni = Y(P.ni(S.T));
    ctx.strokeStyle = COL.fg3; ctx.setLineDash([2, 4]);
    line(b.x, yni, b.x + b.w, yni); ctx.setLineDash([]);

    /* 不純物 */
    var dope = new Float64Array(m.n);
    for (i = 0; i < m.n; i++) dope[i] = Math.abs(m.net[i]);
    curve(b, m, dope, Y, COL.fg3, 1, [3, 3]);

    curve(b, m, sol.n, Y, COL.elec, 2);
    curve(b, m, sol.p, Y, COL.hole, 2);

    /* 少数キャリアは下端に張り付くので、凡例は上に置く */
    legend(b, [['電子 n', COL.elec], ['正孔 p', COL.hole], ['|Nd−Na|', COL.fg3]], 'top');
    ctx.restore();
  }

  /* ---- 4. 下の段 ---- */

  function drawLower(b, c) {
    var kind = (S.view && S.view.field) || 'E';
    if (kind === 'gen' && !(S.light.on && c.photo)) kind = 'E';
    if (kind === 'E') return drawField(b, c);
    if (kind === 'rho') return drawRho(b, c);
    return drawGen(b, c);
  }

  function drawField(b, c) {
    var m = c.mesh, E = c.sol.E, i, mx = 0;
    for (i = 0; i < m.n; i++) if (Math.abs(E[i]) > mx) mx = Math.abs(E[i]);
    mx = Math.max(mx, 1);
    panelFrame(b, '電界 [V/cm]', '最大 ' + mx.toExponential(2) + ' V/cm');
    clipTo(b);
    var top = b.y + 18, hh = b.h - 26, zero = top + hh / 2;
    ctx.strokeStyle = COL.line; line(b.x, zero, b.x + b.w, zero);
    var Y = function (v) { return zero - (v / mx) * (hh / 2 - 4); };
    fillCurve(b, m, E, Y, COL.field, zero);
    curve(b, m, E, Y, COL.field, 2);
    ctx.restore();
  }

  function drawRho(b, c) {
    var m = c.mesh, r = c.sol.rho, i, mx = 0;
    for (i = 0; i < m.n; i++) if (Math.abs(r[i]) > mx) mx = Math.abs(r[i]);
    mx = Math.max(mx, 1);
    panelFrame(b, '正味の電荷 ρ = p − n + Nd − Na [cm⁻³]', '最大 ' + mx.toExponential(2));
    clipTo(b);
    var top = b.y + 18, hh = b.h - 26, zero = top + hh / 2;
    ctx.strokeStyle = COL.line; line(b.x, zero, b.x + b.w, zero);
    /* 電荷は桁で振れるので、符号付きの対数で見る */
    var Y = function (v) {
      var s = v >= 0 ? 1 : -1, a = Math.abs(v);
      var e = a > 1 ? Math.log10(a) / Math.log10(mx) : 0;
      return zero - s * e * (hh / 2 - 4);
    };
    fillCurve(b, m, r, Y, COL.rho, zero);
    curve(b, m, r, Y, COL.rho, 2);
    label(b.x + 6, top + 12, '（符号つきの対数目盛）', COL.fg3, 'left', '9px');
    ctx.restore();
  }

  function drawGen(b, c) {
    var m = c.mesh, g = c.photo.gen, i, mx = 0;
    for (i = 0; i < m.n; i++) if (g[i] > mx) mx = g[i];
    mx = Math.max(mx, 1);
    var ph = c.photo;
    panelFrame(b, '光が対を作る速さ G(x) [cm⁻³s⁻¹]',
      '量子効率 ' + (ph.qe * 100).toFixed(1) + '%　感度 ' + ph.resp.toFixed(3) + ' A/W');
    clipTo(b);
    var top = b.y + 18, hh = b.h - 26, base = top + hh - 2;
    var Y = function (v) { return base - (v / mx) * (hh - 6); };
    fillCurve(b, m, g, Y, nmColor(S.light.nm), base);
    curve(b, m, g, Y, nmColor(S.light.nm), 2);
    if (ph.depNodes) {
      var d0 = px(b, m.x[ph.depNodes[0]]), d1 = px(b, m.x[ph.depNodes[1]]);
      ctx.fillStyle = COL.dep; ctx.globalAlpha = .18;
      ctx.fillRect(d0, top, Math.max(d1 - d0, 1), hh - 4);
      ctx.globalAlpha = 1;
      label((d0 + d1) / 2, top + 12, 'ここは全部拾える', COL.dep, 'center', '9px');
    }
    ctx.restore();
  }

  /* ---- x 軸 ---- */

  function drawXAxis(b, c) {
    var xmax = b.xmax;
    ctx.strokeStyle = COL.line; ctx.lineWidth = 1;
    line(b.x, b.y + 1, b.x + b.w, b.y + 1);
    var ticks = niceTicks(0, xmax, 6), i;
    for (i = 0; i < ticks.length; i++) {
      var xx = px(b, ticks[i]);
      if (xx > b.x + b.w + 2) continue;
      line(xx, b.y + 1, xx, b.y + 5);
      /* 0 の目盛は書かない ― 左の「深さ」とぶつかるし、左端が 0 なのは見れば分かる */
      if (ticks[i] > 0) label(xx, b.y + 15, fmtLen(ticks[i]), COL.fg3, 'center', '10px');
    }
    label(b.x - 6, b.y + 15, '深さ', COL.fg3, 'right', '10px');
  }

  function niceTicks(a, z, n) {
    var span = z - a, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = span / n / step;
    if (err >= 5) step *= 10; else if (err >= 2) step *= 5; else if (err >= 1) step *= 2;
    var out = [], v = Math.ceil(a / step) * step;
    for (; v <= z * 1.0001 && out.length < 40; v += step) out.push(v);
    return out;
  }

  /* ---- 描く道具 ---- */

  function line(x0, y0, x1, y1) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }

  function label(x, y, t, col, align, font) {
    ctx.font = (font || '11px') + ' "Yu Gothic UI", Meiryo, sans-serif';
    ctx.fillStyle = col; ctx.textAlign = align || 'left';
    ctx.fillText(t, x, y);
    ctx.textAlign = 'left';
  }

  function curve(b, m, arr, Y, col, lw, dash) {
    ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    var started = false, i;
    for (i = 0; i < m.n; i++) {
      if (m.x[i] > b.xmax * 1.05) break;
      var xx = px(b, m.x[i]), yy = Y(arr[i]);
      if (!isFinite(yy)) continue;
      if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  function fillCurve(b, m, arr, Y, col, base) {
    ctx.fillStyle = col; ctx.globalAlpha = .18;
    ctx.beginPath(); ctx.moveTo(b.x, base);
    var i;
    for (i = 0; i < m.n; i++) {
      if (m.x[i] > b.xmax * 1.05) break;
      var yy = Y(arr[i]);
      if (isFinite(yy)) ctx.lineTo(px(b, m.x[i]), yy);
    }
    ctx.lineTo(px(b, Math.min(m.x[m.n - 1], b.xmax)), base);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** where: 'bottom'（既定）か 'top'。曲線が下に張り付く段では 'top' にする */
  function legend(b, items, where) {
    var x = b.x + b.w - 8, y = where === 'top' ? b.y + 27 : b.y + b.h - 7, i;
    ctx.textAlign = 'right';
    for (i = items.length - 1; i >= 0; i--) {
      ctx.font = '10px "Yu Gothic UI", Meiryo, sans-serif';
      ctx.fillStyle = items[i][1];
      ctx.fillText(items[i][0], x, y);
      x -= ctx.measureText(items[i][0]).width + 14;
    }
    ctx.textAlign = 'left';
  }

  /* ---- 色と書式 ---- */

  function layerColor(L) {
    if (L.mat === 'ox') return COL.oxide;
    var net = L.nd - L.na;
    return net > 0 ? COL.ntype : net < 0 ? COL.ptype : COL.intr;
  }

  function layerTag(L) {
    if (L.mat === 'ox') return 'SiO₂';
    var net = L.nd - L.na;
    if (net === 0) return 'i';
    var n = Math.abs(net);
    var heavy = n >= 5e18 ? '⁺' : '';
    return (net > 0 ? 'n' : 'p') + heavy + ' ' + sci(n);
  }

  function sci(v) {
    if (v <= 0) return '0';
    var e = Math.floor(Math.log10(v)), mant = v / Math.pow(10, e);
    return (Math.abs(mant - 1) < .05 ? '' : mant.toFixed(1) + '×') + '10' + sup(e);
  }

  var SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sup(e) { return String(e).split('').map(function (ch) { return SUP[ch] || ch; }).join(''); }

  function fmtThick(nm) {
    if (nm >= 10000) return (nm / 1000).toFixed(nm >= 100000 ? 0 : 1) + ' µm';
    if (nm >= 1000) return (nm / 1000).toFixed(2) + ' µm';
    return (nm >= 10 ? nm.toFixed(0) : nm.toFixed(1)) + ' nm';
  }
  function fmtLen(cm) { return fmtThick(cm * 1e7); }

  /** 波長 → 色。可視の外は端の色で止める（見た目のためだけ） */
  function nmColor(nm) {
    var r = 0, g = 0, bl = 0;
    if (nm < 440) { r = -(nm - 440) / 60; bl = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; bl = 1; }
    else if (nm < 510) { g = 1; bl = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else { r = 1; }
    var f = nm > 700 ? Math.max(.35, 1 - (nm - 700) / 700) : 1;
    var c = function (v) { return Math.round(255 * Math.min(1, Math.max(0, v)) * f); };
    return 'rgb(' + c(r) + ',' + c(g) + ',' + c(bl) + ')';
  }

  function kindHint(c) {
    if (c.dep) return '空乏層 ' + fmtLen(c.dep.w) + '（p側 ' + fmtLen(c.dep.wp) + ' / n側 ' + fmtLen(c.dep.wn) + '）';
    if (c.span) return '電界の広がり ' + fmtLen(c.span.w);
    return '';
  }

  /* ---- 下のバー ---- */

  function setStatus(a, b) {
    document.getElementById('statLeft').textContent = a;
    document.getElementById('statRight').textContent = b;
  }

  function updateStatus(c) {
    var parts = [], st = S.stack;
    parts.push(c.id.label);
    var m = c.mesh;
    if (c.junctions.length) {
      var vbi = Math.abs(c.sol.psi[m.n - 1] - c.sol.psi[0] - (S.bias.right - S.bias.left));
      parts.push('Vbi ' + vbi.toFixed(3) + ' V');
    }
    if (c.dep) parts.push('W ' + fmtLen(c.dep.w));
    var mm = null;
    try { mm = DEV.mos(st, S.T); } catch (e) { mm = null; }
    if (mm) {
      parts.push('Vth ' + mm.vth.toFixed(3) + ' V');
      parts.push('S ' + (mm.swing * 1000).toFixed(1) + ' mV/dec');
    }
    if (c.photo) parts.push('QE ' + (c.photo.qe * 100).toFixed(1) + '%');

    var conv = c.sol.ok ? c.sol.iters + ' 回で収束' : '収束せず';
    if (c.sol.ramped) conv += '（0V から ' + c.sol.ramped + ' 段で上げた）';
    var right = '層 ' + st.layers.length + '　厚み ' + fmtLen(m.x[m.n - 1])
      + '　格子 ' + m.n + ' 点　' + conv + '　' + c.ms.toFixed(0) + ' ms';
    setStatus(parts.join('　'), right);
    showWarn(c.warn || []);
  }

  /* 知らせの帯を出し入れする。帯の分だけ canvas の高さが変わるので、
   * 出し入れが変わったときだけ描画領域を測り直す（毎回やると描画が回り続ける） */
  function showWarn(list) {
    var wb = document.getElementById('warnbar');
    var was = !wb.classList.contains('hidden');
    if (list.length) {
      wb.innerHTML = list.map(function (t) { return '⚠ ' + esc(t); }).join('<br>');
      wb.classList.remove('hidden');
    } else {
      wb.innerHTML = '';
      wb.classList.add('hidden');
    }
    if (was !== (list.length > 0)) resize();
  }

  /* ================= 左のパネル ================= */

  var NMIN = 1e13, NMAX = 1e21;

  function logToSlider(v, lo, hi) {
    if (v <= 0) return 0;
    return Math.round(1000 * (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)));
  }
  function sliderToLog(s, lo, hi) {
    return Math.pow(10, Math.log10(lo) + (s / 1000) * (Math.log10(hi) - Math.log10(lo)));
  }

  function renderLayers() {
    var ul = document.getElementById('layerList');
    var st = S.stack;
    ul.innerHTML = '';
    document.getElementById('layersEmpty').classList.toggle('hidden', st.layers.length > 0);

    st.layers.forEach(function (L, i) {
      var li = document.createElement('li');
      if (i === S.sel) li.className = 'sel';

      var head = document.createElement('div');
      head.className = 'lhead';
      head.innerHTML =
        '<span class="lswatch" style="background:' + layerColor(L) + '"></span>' +
        '<span class="lname">' + esc(layerTag(L)) + ' <span class="sub">' + esc(fmtThick(L.tnm)) + '</span></span>' +
        '<span class="lmove"><button data-up="1" title="左へ">▲</button><button data-dn="1" title="右へ">▼</button></span>';
      head.addEventListener('click', function (e) {
        if (e.target.dataset.up) { moveLayer(i, -1); e.stopPropagation(); return; }
        if (e.target.dataset.dn) { moveLayer(i, 1); e.stopPropagation(); return; }
        S.sel = (S.sel === i ? -1 : i); renderLayers(); requestDraw(); persist();
      });
      li.appendChild(head);

      if (i === S.sel) li.appendChild(layerBody(L, i, head));
      ul.appendChild(li);
    });
  }

  /* 【摘みを動かしている最中に一覧を作り直してはいけない ― 実際に踏んだ】
   * input のたびに renderLayers() で一覧ごと作り直していたら、
   * **つかんでいる摘みそのものが DOM から消えて、ドラッグが1目盛りで切れた**。
   * 動かしている間は、その場の表示（値・見出し・色）だけを書き換える。 */
  function layerBody(L, i, head) {
    var d = document.createElement('div');
    d.className = 'lbody';

    /** 一覧を作り直さずに、見出しの色と名前だけ今の値に合わせる */
    function refreshHead() {
      var sw = head.querySelector('.lswatch'), nm = head.querySelector('.lname');
      if (sw) sw.style.background = layerColor(L);
      if (nm) nm.innerHTML = esc(layerTag(L)) + ' <span class="sub">' + esc(fmtThick(L.tnm)) + '</span>';
    }
    function live() { touch(false); refreshHead(); }
    /* 数値欄は「0 のときは空（入れない）」。打ち込みやすいように文字を入れておかない */
    var dopeText = function (v) { return v > 0 ? v.toExponential(2) : ''; };
    var dopeSlider = function (v) { return v > 0 ? Math.max(0, logToSlider(v, NMIN, NMAX)) : -1; };

    d.appendChild(rangeRow({
      name: '厚み', val: logToSlider(L.tnm, 1, 500000), min: 0, max: 1000,
      text: fmtThick(L.tnm), title: '例: 300 / 300nm / 2.5um / 0.2mm（単位なしは nm）',
      onInput: function (s) {
        L.tnm = roundNice(sliderToLog(s, 1, 500000));
        live();
        return fmtThick(L.tnm);
      },
      onEnter: function (t) {
        var nm = parseLen(t);
        if (!isFinite(nm)) return false;
        L.tnm = clampv(nm, LIM.tnm[0], LIM.tnm[1]);
        touch(true);
        return true;
      }
    }));

    if (L.mat === 'si') {
      ['nd', 'na'].forEach(function (key) {
        d.appendChild(rangeRow({
          name: key === 'nd' ? 'Nd' : 'Na', val: dopeSlider(L[key]), min: -1, max: 1000,
          text: dopeText(L[key]), placeholder: '入れない',
          title: '例: 1e17 / 3.6e17 / 1×10^17 / 10¹⁷。空か 0 で「入れない」',
          onInput: function (s) {
            L[key] = s < 0 ? 0 : roundNice(sliderToLog(s, NMIN, NMAX));
            live();
            return dopeText(L[key]);
          },
          onEnter: function (t) {
            var v = parseDope(t);
            if (!isFinite(v)) return false;
            L[key] = v > 0 ? clampv(v, LIM.dope[0], LIM.dope[1]) : 0;
            touch(true);
            return true;
          }
        }));
      });
    }

    var acts = document.createElement('div');
    acts.className = 'acts';
    acts.appendChild(btn('複製', function () {
      var copy = JSON.parse(JSON.stringify(L));
      copy.id = S.stack.seq++;
      S.stack.layers.splice(i + 1, 0, copy);
      S.sel = i + 1; touch(true);
    }));
    acts.appendChild(btn('消す', function () {
      S.stack.layers.splice(i, 1);
      S.sel = Math.min(i, S.stack.layers.length - 1);
      touch(true);
    }, 'danger'));
    d.appendChild(acts);
    return d;
  }

  /**
   * 摘み＋数値欄の1行。
   *   o.onInput(摘みの値) … 摘みを動かしている最中。新しい表示文字列を返す（一覧は作り直さない）
   *   o.onEnter(文字列)   … 数値欄で Enter か欄を離れたとき。読めなければ false を返す → 欄が赤くなる
   */
  function rangeRow(o) {
    var row = document.createElement('div');
    row.className = 'row';
    var s = document.createElement('span'); s.textContent = o.name;
    var r = document.createElement('input');
    r.type = 'range'; r.min = o.min; r.max = o.max; r.step = 1; r.value = o.val;
    var v = document.createElement('input');
    v.type = 'text'; v.className = 'val'; v.value = o.text;
    if (o.placeholder) v.placeholder = o.placeholder;
    if (o.title) v.title = o.title;
    r.addEventListener('input', function () {
      var t = o.onInput(+r.value);
      if (t !== undefined) { v.value = t; v.classList.remove('bad'); }
    });
    v.addEventListener('change', function () {
      if (o.onEnter(v.value) === false) v.classList.add('bad');
    });
    row.appendChild(s); row.appendChild(r); row.appendChild(v);
    return row;
  }

  function btn(text, fn, cls) {
    var b = document.createElement('button');
    b.className = 'tb' + (cls ? ' ' + cls : '');
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  /** 桁の頭を丸める（1.0 / 1.5 / 2.2 … のように読める値にする） */
  function roundNice(v) {
    if (v <= 0) return 0;
    var e = Math.floor(Math.log10(v));
    var mant = v / Math.pow(10, e);
    return Math.round(mant * 10) / 10 * Math.pow(10, e);
  }

  /* ---- 数値で打ち込む ----
   *
   * 読み取りはここに集める（層の欄も上のバーも同じものを使う）。
   * 読めないものは NaN を返し、呼ぶ側が欄を赤くする。**勝手に 0 にしない** ―
   * 打ち間違いで層の不純物が消えるのが一番まずい。
   * 範囲の外は端に寄せる（寄せた結果は欄に出るので、黙って変わることはない）。
   */
  var LIM = {
    T: [150, 500],                  /* K。ni の温度モデルが素直に使える範囲 */
    V: [-200, 20],                  /* V。摘みは −50〜+10、数値ならここまで */
    nm: [250, 1200],                /* 吸収係数の表の範囲 */
    ar: [0, 100],                   /* % */
    tnm: [0.5, 1e6],                /* nm。0.5nm〜1mm */
    dope: [1e10, 1e21]              /* cm^-3（0 は「入れない」として別扱い） */
  };

  function clampv(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* 読み取りの本体は parse.js（ProcessLab と共用）。ここでは名前を合わせるだけ */
  var norm = SL.parse.norm, parseNum = SL.parse.num, parseDope = SL.parse.dope, parseLen = SL.parse.len;

  function moveLayer(i, d) {
    var j = i + d, ls = S.stack.layers;
    if (j < 0 || j >= ls.length) return;
    var t = ls[i]; ls[i] = ls[j]; ls[j] = t;
    S.sel = j; touch(true);
  }

  /** 値が変わったときに毎回通る道。ここ以外から再描画を頼まない */
  function touch(relist) {
    invalidate();
    if (relist !== false) renderLayers();
    persist();
  }

  function bindLeft() {
    document.getElementById('addSi').addEventListener('click', function () {
      var last = S.stack.layers[S.stack.layers.length - 1];
      ST.addLayer(S.stack, 'si', 1000, { nd: last && last.mat === 'si' && last.na === 0 ? 0 : 1e16, na: 0 });
      S.sel = S.stack.layers.length - 1;
      touch(true);
    });
    document.getElementById('addOx').addEventListener('click', function () {
      ST.insertLayer(S.stack, 0, 'ox', 5);
      S.sel = 0;
      touch(true);
    });
  }

  /* ================= 上のバー ================= */

  function bindTop() {
    var t = document.getElementById('tempSlider');
    t.addEventListener('input', function () {
      S.T = +t.value; syncControls(); invalidate(); persist();
    });
    ['vlSlider', 'vrSlider'].forEach(function (id, k) {
      var el = document.getElementById(id);
      el.addEventListener('input', function () {
        S.bias[k === 0 ? 'left' : 'right'] = (+el.value) / 1000;
        syncControls(); invalidate(); persist();
      });
    });
    document.getElementById('btnZeroBias').addEventListener('click', function () {
      S.bias.left = 0; S.bias.right = 0; syncControls(); invalidate(); persist();
    });

    document.getElementById('lightOn').addEventListener('change', function () {
      S.light.on = this.checked; syncControls(); invalidate(); persist();
    });
    var nmEl = document.getElementById('nmSlider');
    nmEl.addEventListener('input', function () {
      S.light.nm = +nmEl.value; syncControls(); invalidate(); persist();
    });
    var arEl = document.getElementById('arSlider');
    arEl.addEventListener('input', function () {
      S.light.ar = (+arEl.value) < 0 ? null : (+arEl.value) / 100;
      syncControls(); invalidate(); persist();
    });

    /* 数値欄。Enter か欄を離れたときに読む。読めなければ赤くして何も変えない */
    function bindNum(id, parse, apply) {
      var el = document.getElementById(id);
      el.addEventListener('change', function () {
        var v = parse(el.value);
        if (v !== null && !isFinite(v)) { el.classList.add('bad'); return; }
        el.classList.remove('bad');
        apply(v);
        syncControls(); invalidate(); persist();
      });
    }
    bindNum('tempVal', parseNum, function (v) { S.T = clampv(Math.round(v * 10) / 10, LIM.T[0], LIM.T[1]); });
    bindNum('vlVal', parseNum, function (v) { S.bias.left = clampv(Math.round(v * 1000) / 1000, LIM.V[0], LIM.V[1]); });
    bindNum('vrVal', parseNum, function (v) { S.bias.right = clampv(Math.round(v * 1000) / 1000, LIM.V[0], LIM.V[1]); });
    bindNum('nmVal', parseNum, function (v) { S.light.nm = clampv(Math.round(v), LIM.nm[0], LIM.nm[1]); });
    bindNum('arVal',
      function (t) { var s = norm(t); return (s === '' || s === '裸') ? null : parseNum(s); },
      function (v) { S.light.ar = v === null ? null : clampv(v, LIM.ar[0], LIM.ar[1]) / 100; });

    var zoomEl = document.getElementById('zoomSlider');
    zoomEl.addEventListener('input', function () {
      /* 0→手前だけ, 100→全部。対数で効かせる */
      var f = (+zoomEl.value) / 100;
      S.view.zoom = Math.pow(10, (f - 1) * 3);
      syncControls(); invalidate(); persist();
    });

    Array.prototype.forEach.call(document.getElementsByName('fieldView'), function (r) {
      r.addEventListener('change', function () {
        if (r.checked) { S.view.field = r.value; invalidate(); persist(); }
      });
    });

    /* 測る窓は chart.js。押された時点で探すので、読み込み順は ui.js → chart.js でよい */
    document.getElementById('btnMeasure').addEventListener('click', function () { SL.chart.open(); });
    document.getElementById('btnPath').addEventListener('click', openPath);
    document.getElementById('btnSaveDev').addEventListener('click', openSave);
    document.getElementById('btnNew').addEventListener('click', function () {
      if (!S.stack.layers.length || confirm('作業台を消しますか？（残した素子と課題の記録は消えません）')) {
        S.stack = ST.create(); S.sel = -1; touch(true);
      }
    });
    document.getElementById('btnExport').addEventListener('click', openExport);
    document.getElementById('btnImport').addEventListener('click', openImport);
  }

  function syncControls() {
    var setNum = function (id, v) {
      var el = document.getElementById(id);
      el.value = v; el.classList.remove('bad');
      return el;
    };
    setNum('tempVal', String(S.T));
    /* 摘みの範囲の外（−50V より深いなど）は、摘みは端に張り付き、数値欄が本当の値を示す */
    document.getElementById('tempSlider').value = clampv(S.T, 200, 450);
    document.getElementById('vlSlider').value = clampv(Math.round(S.bias.left * 1000), -50000, 10000);
    document.getElementById('vrSlider').value = clampv(Math.round(S.bias.right * 1000), -50000, 10000);
    setNum('vlVal', S.bias.left.toFixed(2));
    setNum('vrVal', S.bias.right.toFixed(2));
    document.getElementById('lightOn').checked = !!S.light.on;
    document.getElementById('nmSlider').value = clampv(S.light.nm, 300, 1200);
    setNum('nmVal', String(S.light.nm));
    var bare = S.light.ar === null || S.light.ar === undefined;
    document.getElementById('arSlider').value = bare ? -1 : clampv(Math.round(S.light.ar * 100), 0, 60);
    setNum('arVal', bare ? '' : String(Math.round(S.light.ar * 1000) / 10)).placeholder =
      '裸 ' + Math.round(P.reflect(S.light.nm) * 100);
    document.getElementById('lightGroup').style.opacity = S.light.on ? 1 : .55;

    var z = S.view.zoom === undefined ? 1 : S.view.zoom;
    document.getElementById('zoomSlider').value = Math.round((Math.log10(z) / 3 + 1) * 100);
    var m = calc && !calc.empty ? calc.mesh : null;
    document.getElementById('zoomVal').textContent = m ? fmtLen(viewMax(m)) : '';

    Array.prototype.forEach.call(document.getElementsByName('fieldView'), function (r) {
      r.checked = (r.value === (S.view.field || 'E'));
    });
    renderLayers();
    renderLib();
  }

  /* ================= 課題 ================= */

  function renderQuestList() {
    var host = document.getElementById('questList');
    host.innerHTML = '';
    Q.CH.forEach(function (ch) {
      var div = document.createElement('div');
      div.className = 'chapter';
      var head = document.createElement('div');
      head.className = 'ctitle'; head.textContent = ch.name;
      div.appendChild(head);
      var lead = document.createElement('p');
      lead.className = 'clead'; lead.textContent = ch.lead;
      div.appendChild(lead);

      Q.LIST.filter(function (q) { return q.ch === ch.id; }).forEach(function (q) {
        var it = document.createElement('div');
        it.className = 'qitem' + (S.cleared[q.id] ? ' done' : '') + (S.quest === q.id ? ' sel' : '');
        it.innerHTML = '<span class="mark">' + (S.cleared[q.id] ? '✓' : '○') + '</span>'
                     + '<span>' + esc(q.name) + '</span>';
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
    persist();
  }

  function bindQuests() {
    document.getElementById('btnGrade').addEventListener('click', function () {
      if (!S.quest) return;
      var r = Q.grade(S.quest, S.stack, { T: S.T, ar: S.light.ar });
      showResult(r);
      if (r.ok) { S.cleared[S.quest] = true; renderQuestList(); }
      persist();
    });
    document.getElementById('btnAnswer').addEventListener('click', function () {
      if (!S.quest) return;
      var a = ANS.get(S.quest);
      if (!a) { alert('この課題にはお手本がありません。'); return; }
      if (!confirm('お手本を作業台に出します。今の構造は置き換わります。よろしいですか？')) return;
      S.stack = a.make();
      if (a.ar !== undefined) S.light.ar = a.ar;
      S.sel = -1;
      var note = document.getElementById('qResult');
      note.innerHTML = '<p class="mnote">' + esc(a.note) + '</p>';
      syncControls(); touch(true);
    });
  }

  function showResult(r) {
    var host = document.getElementById('qResult');
    var h = '<div class="verdict ' + (r.ok ? 'ok' : 'ng') + '">'
          + (r.ok ? '✓ 通った' : '✗ まだ') + '</div><div class="grid">';
    (r.rows || []).forEach(function (row) {
      h += '<span class="k">' + esc(row.label) + '</span>'
        +  '<span class="v ' + (row.ok ? 'ok' : 'ng') + '">' + esc(row.value) + '</span>';
      if (row.want) h += '<span class="want">→ ' + esc(row.want) + '</span>';
    });
    h += '</div>';
    host.innerHTML = h;
  }

  /* ================= かぶせる窓 ================= */

  function modal(html, after) {
    var ov = document.getElementById('overlay'), md_ = document.getElementById('modal');
    md_.innerHTML = html;
    ov.classList.remove('hidden');
    ov.onclick = function (e) { if (e.target === ov) closeModal(); };
    document.onkeydown = function (e) { if (e.key === 'Escape') closeModal(); };
    if (after) after(md_);
  }
  function closeModal() {
    document.getElementById('overlay').classList.add('hidden');
    document.onkeydown = null;
  }

  function openExport() {
    modal('<h3>書き出し</h3><textarea id="expText" readonly></textarea>'
        + '<div class="mrow" style="margin-top:10px"><button class="tb primary" id="expCopy">コピー</button>'
        + '<button class="tb" id="expClose">閉じる</button></div>', function (m) {
      m.querySelector('#expText').value = STORE.toJSON(S);
      m.querySelector('#expCopy').onclick = function () {
        var t = m.querySelector('#expText'); t.select(); document.execCommand('copy');
        this.textContent = 'コピーした';
      };
      m.querySelector('#expClose').onclick = closeModal;
    });
  }

  function openImport() {
    modal('<h3>読み込み</h3><textarea id="impText" placeholder="書き出した JSON を貼る"></textarea>'
        + '<div class="mrow" style="margin-top:10px"><button class="tb primary" id="impGo">読み込む</button>'
        + '<button class="tb" id="impClose">やめる</button><span id="impErr" style="color:var(--ng)"></span></div>',
      function (m) {
        m.querySelector('#impGo').onclick = function () {
          var r = STORE.fromJSON(m.querySelector('#impText').value);
          if (r.error) { m.querySelector('#impErr').textContent = r.error; return; }
          S.stack = r.state.stack; S.T = r.state.T; S.bias = r.state.bias;
          S.light = r.state.light; S.lib = r.state.lib; S.view = r.state.view;
          S.sel = -1;
          closeModal(); syncControls(); touch(true);
        };
        m.querySelector('#impClose').onclick = closeModal;
      });
  }

  function openSave() {
    if (!S.stack.layers.length) { alert('作業台が空です。'); return; }
    var def = DEV.identify(S.stack).label;
    modal('<h3>この構造を残す</h3><div class="mrow">名前 <input type="text" id="devName" value="'
        + esc(def) + '" size="28"></div>'
        + '<div class="mrow"><button class="tb primary" id="devGo">残す</button>'
        + '<button class="tb" id="devClose">やめる</button></div>'
        + '<p class="mnote">残した素子は左下の一覧から作業台に呼び戻せる。'
        + '層の並びだけを覚える（バイアスや光の設定は今のものを使う）。</p>', function (m) {
      var inp = m.querySelector('#devName');
      inp.focus(); inp.select();
      m.querySelector('#devGo').onclick = function () {
        var name = inp.value.trim();
        if (!name) return;
        S.lib[name] = ST.clone(S.stack);
        closeModal(); renderLib(); persist();
      };
      m.querySelector('#devClose').onclick = closeModal;
    });
  }

  function renderLib() {
    var host = document.getElementById('libList');
    if (!host) return;
    host.innerHTML = '';
    var keys = Object.keys(S.lib || {});
    document.getElementById('libEmpty').classList.toggle('hidden', keys.length > 0);
    keys.forEach(function (k) {
      var d = document.createElement('div');
      d.className = 'libitem';
      d.innerHTML = '<span>' + esc(k) + '</span><span class="x" title="消す">✕</span>';
      d.addEventListener('click', function (e) {
        if (e.target.className === 'x') {
          delete S.lib[k]; renderLib(); persist(); return;
        }
        S.stack = ST.clone(S.lib[k]); S.sel = -1; touch(true);
      });
      host.appendChild(d);
    });
  }

  /* 測る窓は chart.js に移した */

  /* ---- 道のり ---- */

  function openPath() {
    var done = Q.LIST.filter(function (q) { return S.cleared[q.id]; }).length;
    var rows = Q.CH.map(function (ch) {
      var qs = Q.LIST.filter(function (q) { return q.ch === ch.id; });
      var d = qs.filter(function (q) { return S.cleared[q.id]; }).length;
      return '<tr><td>' + esc(ch.name) + '</td><td class="n">' + d + ' / ' + qs.length + '</td>'
           + '<td>' + bar(d / qs.length) + '</td></tr>';
    }).join('');

    var st = S.stack;
    var si = st.layers.filter(function (L) { return L.mat === 'si'; }).length;
    var ox = st.layers.filter(function (L) { return L.mat === 'ox'; }).length;
    var m = st.layers.length ? ST.mesh(st, S.T) : null;
    var js = m ? ST.junctionNodes(m).length : 0;

    modal('<h3>道のり</h3>'
      + '<table><tr><th>章</th><th>解いた数</th><th></th></tr>' + rows
      + '<tr><th>合計</th><th class="n">' + done + ' / ' + Q.LIST.length + '</th><th>' + bar(done / Q.LIST.length) + '</th></tr>'
      + '</table>'
      + '<h3 style="margin-top:16px">今の作業台</h3>'
      + '<table>'
      + '<tr><td>一片の数</td><td class="n">' + si + '</td></tr>'
      + '<tr><td>酸化膜</td><td class="n">' + ox + '</td></tr>'
      + '<tr><td>接合の数</td><td class="n">' + js + '</td></tr>'
      + '<tr><td>全体の厚み</td><td class="n">' + (m ? fmtLen(m.x[m.n - 1]) : '―') + '</td></tr>'
      + '<tr><td>格子の点</td><td class="n">' + (m ? m.n : '―') + '</td></tr>'
      + '</table>'
      + '<p class="mnote">大きさ＝一片を何枚重ねたか。深さ＝接合を何段作ったか。<br>'
      + '第5章まで行くと、ここで作った MOSFET が <b>NandLab の原始部品 NAND の中身</b>になる。'
      + '論理はそこから上の階。</p>'
      + '<div class="mrow" style="margin-top:12px"><button class="tb" id="pClose">閉じる</button></div>',
      function (mm) { mm.querySelector('#pClose').onclick = closeModal; });
  }

  function bar(f) {
    var n = 18, k = Math.round(f * n);
    return '<span style="color:var(--ok)">' + '█'.repeat(k) + '</span>'
         + '<span style="color:var(--line)">' + '█'.repeat(n - k) + '</span>';
  }

  /* ---- 小物 ---- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  /** **強調** だけの、ごく小さな記法 */
  function md(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }

  function persist() {
    if (!STORE.save(S)) {
      /* 保存できなくても操作は続けさせる。黙って落とさない */
      setStatus('（保存できませんでした ― localStorage が一杯かもしれません）', '');
    }
  }

  SL.ui = {
    mount: mount, get state() { return S; },
    compute: compute, invalidate: invalidate, selectQuest: selectQuest,
    renderLayers: renderLayers, renderQuestList: renderQuestList, syncControls: syncControls,
    nmColor: nmColor, sci: sci, fmtThick: fmtThick, fmtLen: fmtLen, roundNice: roundNice,
    niceTicks: niceTicks, logToSlider: logToSlider, sliderToLog: sliderToLog, esc: esc, md: md,
    modal: modal, closeModal: closeModal,
    parseNum: parseNum, parseDope: parseDope, parseLen: parseLen, LIM: LIM, breakdownField: breakdownField
  };
})(typeof window !== 'undefined' ? window : globalThis);
