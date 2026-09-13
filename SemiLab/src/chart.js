/* 測る窓 ― I-V / 接合の C-V / 量子効率 / MOS の C-V / Id-Vd
 *
 * ui.js が大きくなりすぎたので、測る窓だけここに分けた（作業台の絵とは関心が別）。
 * ui.js と同じくブラウザに触るのはこのファイルと ui.js・main.js だけ。
 *
 * 【接合の C-V は、式ではなく**ポアソンを解いて** dQ/dV を取る】
 * 以前は空乏近似の式 C = ε/W をそのまま描いていた。それで説明に「1/C² の傾きから濃度が読める」と
 * 書いても、式から作った曲線から式の値を読み戻すだけで、何も測っていなかった（精査で見つけた）。
 * 今は各バイアスでポアソンを解き、バイアスで動く電荷（空乏層の端での多数キャリアの欠損）の差から C を出し、
 * その 1/C² の直線から濃度と Vbi を**読み戻して、層に塗った値と比べる**。実際の C-V 測定と同じ手順。
 */
(function (global) {
  'use strict';
  var SL = global.SL;
  var P = SL.phys, ST = SL.stack, PS = SL.poisson, DEV = SL.dev, LIGHT = SL.light;

  function U() { return SL.ui; }
  function S() { return SL.ui.state; }

  function open() {
    var st = S().stack, T = S().T;
    if (!st.layers.length) { alert('作業台が空です。'); return; }
    var kinds = [];
    var d = DEV.diode(st, T);
    var mm = DEV.mos(st, T);
    if (d) { kinds.push(['iv', 'I-V 特性']); kinds.push(['cvd', '接合容量 C-V']); kinds.push(['qe', '量子効率 QE(λ)']); }
    if (mm) { kinds.push(['cv', 'MOS の C-V']); kinds.push(['idvd', 'MOSFET の Id-Vd']); }
    if (!kinds.length) { alert('測れるものがありません。接合か MOS を作ってください。'); return; }

    var buttons = kinds.map(function (k, i) {
      return '<button class="tb' + (i === 0 ? ' primary' : '') + '" data-k="' + k[0] + '">' + k[1] + '</button>';
    }).join('');

    U().modal('<h3>測る</h3><div class="mrow" id="mkinds">' + buttons
        + '<span class="grow"></span><button class="tb" id="mClose">閉じる</button></div>'
        + '<canvas id="mcv" width="840" height="380"></canvas>'
        + '<div id="mnote" class="mnote"></div>', function (m) {
      m.querySelector('#mClose').onclick = U().closeModal;
      var go = function (k) {
        Array.prototype.forEach.call(m.querySelectorAll('#mkinds .tb'), function (b) {
          if (b.dataset.k) b.className = 'tb' + (b.dataset.k === k ? ' primary' : '');
        });
        measure(k, m.querySelector('#mcv'), m.querySelector('#mnote'));
      };
      Array.prototype.forEach.call(m.querySelectorAll('#mkinds .tb'), function (b) {
        if (b.dataset.k) b.onclick = function () { go(b.dataset.k); };
      });
      go(kinds[0][0]);
    });
  }

  function measure(kind, canvas, note) {
    var g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    note.textContent = '計算中…';
    setTimeout(function () {
      try {
        if (kind === 'iv') return doIV(g, canvas, note);
        if (kind === 'cvd') return doCVD(g, canvas, note);
        if (kind === 'qe') return doQE(g, canvas, note);
        if (kind === 'cv') return doCV(g, canvas, note);
        if (kind === 'idvd') return doIdVd(g, canvas, note);
      } catch (e) {
        note.textContent = '計算できませんでした: ' + (e && e.message || e);
      }
    }, 10);
  }

  /** 汎用の折れ線プロット */
  function plot(g, cvs, opt) {
    var L = 76, R = 20, T = 18, B = 40;
    var w = cvs.width - L - R, h = cvs.height - T - B;
    g.fillStyle = '#14171c'; g.fillRect(0, 0, cvs.width, cvs.height);

    var xs = opt.series.reduce(function (a, s) { return a.concat(s.pts.map(function (p) { return p[0]; })); }, []);
    var ys = opt.series.reduce(function (a, s) { return a.concat(s.pts.map(function (p) { return p[1]; })); }, []);
    var x0 = opt.x0 !== undefined ? opt.x0 : Math.min.apply(null, xs);
    var x1 = opt.x1 !== undefined ? opt.x1 : Math.max.apply(null, xs);
    var logY = !!opt.logY;
    var vals = logY ? ys.filter(function (v) { return v > 0; }).map(Math.log10) : ys;
    var y0 = opt.y0 !== undefined ? opt.y0 : Math.min.apply(null, vals);
    var y1 = opt.y1 !== undefined ? opt.y1 : Math.max.apply(null, vals);
    if (y1 - y0 < 1e-12) { y1 = y0 + 1; }
    var pad = (y1 - y0) * .08; y0 -= pad; y1 += pad;

    var X = function (v) { return L + w * (v - x0) / (x1 - x0 || 1); };
    var Y = function (v) {
      var u = logY ? (v > 0 ? Math.log10(v) : y0) : v;
      return T + h * (1 - (u - y0) / (y1 - y0));
    };

    g.strokeStyle = '#2f3642'; g.lineWidth = 1;
    g.strokeRect(L + .5, T + .5, w, h);
    g.font = '11px "Yu Gothic UI", Meiryo, sans-serif';

    var xt = U().niceTicks(x0, x1, 7), i;
    for (i = 0; i < xt.length; i++) {
      var xx = X(xt[i]);
      g.globalAlpha = .35; g.beginPath(); g.moveTo(xx, T); g.lineTo(xx, T + h); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = '#66717f'; g.textAlign = 'center';
      g.fillText(fmtNum(xt[i]), xx, T + h + 15);
    }
    var steps = logY ? Math.max(1, Math.ceil((y1 - y0) / 8)) : null;
    var yt = logY ? [] : U().niceTicks(y0, y1, 6);
    if (logY) for (i = Math.ceil(y0); i <= y1; i += steps) yt.push(Math.pow(10, i));
    for (i = 0; i < yt.length; i++) {
      var yy = Y(yt[i]);
      if (yy < T - 1 || yy > T + h + 1) continue;
      g.globalAlpha = .35; g.beginPath(); g.moveTo(L, yy); g.lineTo(L + w, yy); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = '#66717f'; g.textAlign = 'right';
      g.fillText(logY ? '1e' + Math.round(Math.log10(yt[i])) : fmtNum(yt[i]), L - 6, yy + 4);
    }

    g.textAlign = 'center'; g.fillStyle = '#93a0b4';
    g.fillText(opt.xlabel || '', L + w / 2, cvs.height - 8);
    g.save(); g.translate(14, T + h / 2); g.rotate(-Math.PI / 2);
    g.fillText(opt.ylabel || '', 0, 0); g.restore();

    opt.series.forEach(function (s, k) {
      g.strokeStyle = s.color || ['#5aa9e6', '#4cc38a', '#ffcc66', '#e5686d', '#ce93d8'][k % 5];
      g.lineWidth = 2; g.setLineDash(s.dash || []); g.beginPath();
      var started = false;
      s.pts.forEach(function (p) {
        if (logY && p[1] <= 0) { started = false; return; }
        var xx = X(p[0]), yy = Y(p[1]);
        if (!isFinite(yy)) { started = false; return; }
        if (!started) { g.moveTo(xx, yy); started = true; } else g.lineTo(xx, yy);
      });
      g.stroke(); g.setLineDash([]);
      if (s.name) {
        g.fillStyle = g.strokeStyle; g.textAlign = 'left';
        g.fillText(s.name, L + 8, T + 14 + k * 15);
      }
    });
    g.textAlign = 'left';
  }

  function fmtNum(v) {
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1e4 || a < 1e-3) return v.toExponential(1);
    if (a >= 100) return v.toFixed(0);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }

  function doIV(g, cvs, note) {
    var d = DEV.diode(S().stack, S().T);
    var fwd = [], rev = [], v;
    for (v = 0; v <= 0.95; v += 0.01) fwd.push([v, Math.abs(d.iv(v).j)]);
    for (v = 0; v >= -5; v -= 0.05) rev.push([-v, Math.abs(d.iv(v).j)]);

    /* ---- 降伏の目安（表示だけ。モデルの電流・採点には入れない） ----
     * 薄い側の濃度で Sze の臨界電界（ui.js の赤帯と同じ式）→ 片側階段接合の
     * BV = ε·Ec²/(2qN) − Vbi。Miller の経験式 M = 1/(1−(V/BV)^4) を逆方向の
     * 生成電流に掛けた破線を重ねる。指数 4 は Si の代表値（2〜6 で振れる）。 */
    var Nthin = Math.min(d.Na, d.Nd);
    var Ec = 4e5 / (1 - Math.log10(Nthin / 1e16) / 3);
    var eps = 11.7 * P.EPS0;
    var BV = eps * Ec * Ec / (2 * P.Q * Nthin) - d.Vbi;
    var series = [{ name: '順方向', pts: fwd, color: '#4cc38a' }, { name: '逆方向', pts: rev, color: '#e5686d' }];
    var bvText;
    if (BV > 0 && BV <= 40) {
      var brk = [], MMAX = 1e4;
      for (v = 0; v <= BV * 0.9999; v += BV / 400) {
        var M = 1 / (1 - Math.pow(v / BV, 4));
        if (M > MMAX) break;
        brk.push([v, Math.abs(d.iv(-v).j) * M]);
      }
      series.push({ name: '逆方向 ＋ なだれ増倍（目安）', pts: brk, color: '#ffab40', dash: [6, 5] });
      bvText = '<br><b>降伏の目安 BV ≈ ' + BV.toFixed(1) + ' V</b>（薄い側 N = ' + Nthin.toExponential(1)
        + '、Sze の臨界電界 ' + Ec.toExponential(1) + ' V/cm）。破線は Miller の経験式 M = 1/(1−(V/BV)⁴) を'
        + '<b>表示だけ</b>重ねたもの ― モデルの電流にも採点にも入れていない（「どこまでがモデルか」）。';
    } else {
      bvText = '<br>降伏の目安 BV ≈ ' + (BV > 0 ? BV.toFixed(0) + ' V' : '—')
        + '（薄い側 N = ' + Nthin.toExponential(1) + '。この掃引範囲では見えない）。';
    }
    plot(g, cvs, {
      logY: true, xlabel: '順方向は V、逆方向は |V| [V]', ylabel: '|J| [A/cm²]',
      series: series
    });
    var n1 = ideality(d, 0.35), n2 = ideality(d, 0.15);
    note.innerHTML = '飽和電流 J₀ = ' + d.j0.toExponential(3) + ' A/cm²　'
      + '直列抵抗 = ' + d.rs.toExponential(2) + ' Ω·cm²　'
      + '拡散長 Lp/Ln = ' + U().fmtLen(d.Lp) + ' / ' + U().fmtLen(d.Ln) + '<br>'
      + '理想係数 n は 0.15V で ' + n2.toFixed(2) + '、0.35V で ' + n1.toFixed(2) + ' ― '
      + '低い電圧では空乏層の再結合（n=2 に近づく）、中ほどでは拡散（n=1）、'
      + '高い電流では直列抵抗で曲がる。3つの領域が別々の理由で出ている。'
      + (d.edge ? '<br>（なだらかな接合なので、Vbi と J₀ は空乏層の端の外の濃度で出している）' : '')
      + bvText;
  }

  function ideality(d, v) {
    var dv = 0.01;
    var a = d.iv(v).j, b = d.iv(v + dv).j;
    return dv / (P.vt(S().T) * Math.log(b / a));
  }

  /**
   * 接合の C-V。各バイアスでポアソンを解いて、動く電荷 Q（qMove）を出し、C = dQ/dV。
   * そのあと 1/C² = 2(Vbi + Vr)/(q ε N) の直線を最小二乗で当てて、N と Vbi を読み戻す。
   * 片側接合なら N は薄い側の濃度、両側なら Na·Nd/(Na+Nd)。
   */
  function cvData(st, T) {
    var d = DEV.diode(st, T), m = ST.mesh(st, T);
    var bias = function (v) { return d.leftIsP ? { left: v, right: 0 } : { left: 0, right: v }; };
    /* 【qDep（ε·Emax）で取ってはいけない】片側接合では接合脇の正孔の山がほとんどで、
     * バイアスで動かないので容量が1桁小さく出た。動く電荷 qMove（空乏層の端の欠損）の微分を取る */
    var q = function (v) { return PS.depletionByCharge(PS.solveRobust(m, bias(v))).qMove; };
    var dv = 0.05, pts = [], vr;
    for (vr = 0; vr <= 8 + 1e-9; vr += 0.5) {
      var c = Math.abs(q(-vr - dv) - q(-vr + dv)) / (2 * dv);
      pts.push({ vr: vr, c: c });
    }
    /* 1/C² を逆バイアス 1V〜8V で直線に当てる（0V 付近はデバイ長の裾で曲がるので外す） */
    var xs = [], ys = [];
    pts.forEach(function (p) { if (p.vr >= 1) { xs.push(p.vr); ys.push(1 / (p.c * p.c)); } });
    var n = xs.length, sx = 0, sy = 0, sxx = 0, sxy = 0, i;
    for (i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
    var eps = P.SI.epsR * P.EPS0;
    return {
      d: d, pts: pts,
      nFit: 2 / (P.Q * eps * slope),      /* 読み戻した濃度 */
      vbiFit: icpt / slope,               /* 読み戻した Vbi（1/C² が 0 になる逆バイアスの反対） */
      nTrue: d.Na * d.Nd / (d.Na + d.Nd)
    };
  }

  function doCVD(g, cvs, note) {
    var r = cvData(S().stack, S().T), d = r.d;
    plot(g, cvs, {
      xlabel: '逆バイアス |V| [V]', ylabel: '接合容量 [nF/cm²]',
      series: [{ name: 'C(V) ― ポアソンを解いて dQ/dV', pts: r.pts.map(function (p) { return [p.vr, p.c * 1e9]; }), color: '#ce93d8' }]
    });
    note.innerHTML = '各バイアスでポアソンを解いて、空乏層の端で動く電荷の変化から C = dQ/dV を出した。'
      + '逆バイアスで空乏層が伸びるので、容量は下がる。<br>'
      + '<b>1/C² を V に対して描くと直線</b>になる。その傾きから濃度が、切片からビルトイン電位が読める ― '
      + '実際のウェーハ評価（C-V 測定）でやっていることを、ここでもやった:<br>'
      + '　読み戻した濃度 ' + r.nFit.toExponential(2) + ' cm⁻³（層に塗った値から: Na·Nd/(Na+Nd) = ' + r.nTrue.toExponential(2) + '）<br>'
      + '　読み戻した Vbi ' + r.vbiFit.toFixed(3) + ' V（式: ' + d.Vbi.toFixed(3) + ' V、差 '
      + ((d.Vbi - r.vbiFit) / P.vt(S().T)).toFixed(1) + ' kT/q）<br>'
      + '1/C² の切片は Vbi そのものより低く出る。両側とも薄い接合なら差は約 2kT/q（空乏層の裾）。'
      + '片側が濃い接合ではもっと大きい ― 濃い側から染み出した多数キャリアが、'
      + '薄い側の最初の 0.1〜0.2V ぶんのバンドの曲がりを受け持つので、その分はドナーの 1/C² に見えない。';
  }

  function doQE(g, cvs, note) {
    var st = S().stack, T = S().T, light = S().light, bias = S().bias;
    var m = ST.mesh(st, T);
    var sol = PS.solveRobust(m, bias);
    var qe = [], resp = [], nm;
    for (nm = 300; nm <= 1150; nm += 10) {
      var r = LIGHT.photo(st, sol, { nm: nm, sFront: light.sFront, ar: light.ar, coat: light.coat, power: light.power });
      qe.push([nm, r.qe * 100]);
      resp.push([nm, r.resp * 100]);
    }
    plot(g, cvs, {
      xlabel: '波長 [nm]', ylabel: '量子効率 [%] / 感度×100 [A/W]',
      y0: 0, series: [
        { name: '外部量子効率 [%]', pts: qe, color: '#5aa9e6' },
        { name: '感度 ×100 [A/W]', pts: resp, color: '#ffcc66' }
      ]
    });
    var peak = resp.reduce(function (a, p) { return p[1] > a[1] ? p : a; }, [0, 0]);
    note.innerHTML = '今のバイアス（左 ' + bias.left.toFixed(2) + 'V / 右 ' + bias.right.toFixed(2) + 'V）で計算した。<br>'
      + '感度のピークは ' + peak[0] + ' nm で ' + (peak[1] / 100).toFixed(3) + ' A/W。<br>'
      + '<b>短波長側が落ちるのは表面のせい</b>（0.1µm で吸われ、空乏層に届く前に表面で消える）。'
      + '<b>長波長側が落ちるのは厚みのせい</b>（1000nm の吸収長は 156µm）。'
      + '原因が違うので、対策も違う。';
  }

  function doCV(g, cvs, note) {
    var st = S().stack, T = S().T, vs = [], v;
    var mm = DEV.mos(st, T);
    /* pMOS は VFB と Vth の並びが逆（Vth < VFB）。どちら向きでも両方が窓に入るように */
    var a = Math.min(mm.vfb, mm.vth), b = Math.max(mm.vfb, mm.vth);
    var lo = Math.min(a - 2, -2), hi = Math.max(b + 2, 2);
    for (v = lo; v <= hi; v += (hi - lo) / 80) vs.push(v);
    var c = DEV.cv(st, vs, T);
    plot(g, cvs, {
      xlabel: 'ゲート電圧 [V]', ylabel: '容量 [nF/cm²]', y0: 0,
      series: [{ name: 'C(Vg)', pts: c.map(function (p) { return [p.v, p.c * 1e9]; }), color: '#4cc38a' }]
    });
    note.innerHTML = 'Cox = ' + (mm.Cox * 1e9).toFixed(1) + ' nF/cm²　'
      + 'フラットバンド ' + mm.vfb.toFixed(3) + ' V　しきい値 ' + mm.vth.toFixed(3) + ' V<br>'
      + '蓄積では Cox に張り付き、空乏で下がり、反転でまた上がる。'
      + (mm.pType ? '' : '<b>n 基板なので左右が鏡写し</b> ― 蓄積は正のゲート側、反転（正孔）は負の側。')
      + 'この形は仮定せずに dQ/dV を数値で出しただけ ― '
      + '実際の C-V 測定で「反転側が上がらない（高周波では少数キャリアが追いつけない）」のは、'
      + 'ここでは扱っていない時間の話。';
  }

  function doIdVd(g, cvs, note) {
    var st = S().stack, T = S().T;
    var mm = DEV.mos(st, T);
    var vth = mm.vth, sg = mm.pType ? 1 : -1;
    /* pMOS はゲートを Vth より負へ ― オーバードライブの大きさは nMOS と同じ 0.3〜1.2 V */
    var vgs = [0.3, 0.6, 0.9, 1.2].map(function (d) { return vth + sg * d; });
    var series = vgs.map(function (vg, i) {
      var r = DEV.idvd(st, vg, 2.0, T, 26);
      return {
        name: 'Vg = ' + vg.toFixed(2) + ' V',
        pts: r.points.map(function (p) { return [p.vd, p.idPerWL * 1e6]; }),
        color: ['#5aa9e6', '#4cc38a', '#ffcc66', '#e5686d'][i]
      };
    });
    plot(g, cvs, { xlabel: 'ドレイン電圧 Vd [V]', ylabel: (mm.pType ? 'Id' : '|Id|') + ' （W/L = 1） [µA]', y0: 0, series: series });
    var muN = P.muN(mm.Nb, T), muP = P.muP(mm.Nb, T);
    note.innerHTML = 'Id = (W/L)·µ·∫Qinv(Vc) dVc を、チャネル電位ごとに<b>ポアソンを解いて</b>積んだもの。<br>'
      + '二乗則も飽和も仮定していない ― |Vd| を上げるとドレイン側の反転電荷が減り、'
      + '足し算が増えなくなるので<b>勝手に飽和する</b>。<br>'
      + (mm.pType ? '' : '<b>pMOS</b> ― ゲートもドレインも負の側で、流れるのは正孔。'
         + '移動度が電子の 1/' + (muN / muP).toFixed(2) + ' なので、同じ形でも電流はそのぶん小さい。<br>')
      + 'しきい値 ' + vth.toFixed(3) + ' V、チャネルの移動度 '
      + (mm.pType ? muN : muP).toFixed(0) + ' cm²/Vs（' + (mm.pType ? '電子' : '正孔') + '）。';
  }

  SL.chart = { open: open, plot: plot, cvData: cvData };
})(typeof window !== 'undefined' ? window : globalThis);
