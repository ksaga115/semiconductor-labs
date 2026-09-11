/* ポアソン方程式を解く ― 空乏層は「描く」ものではなく「出てくる」もの
 *
 *     d/dx ( ε dψ/dx ) = -q ( p - n + Nd - Na )
 *
 * 左辺は電位の曲がり、右辺はそこに居る電荷。曲がりと電荷が釣り合う ψ を探す。
 * n と p は ψ に指数で乗っているので、これは**非線形**の方程式。
 * だからニュートン法で解く（1次元なので行列は三重対角。Thomas 法で一瞬）。
 *
 *     n = ni exp((ψ - φn)/Vt)        φn … 電子の準フェルミ電位
 *     p = ni exp((φp - ψ)/Vt)        φp … 正孔の準フェルミ電位
 *
 * 【準フェルミ電位をどう置いているか ― ここがこのアプリのモデルの境目】
 *
 * 電流まで一緒に解く（ドリフト拡散を連立する）ことはしていない。
 * 代わりに **φn・φp は与えるもの**として扱う。教科書でいう「準平衡近似」で、
 *
 *   ・平衡（バイアス 0）        … φn = φp = 0。これは近似ではなく厳密
 *   ・pn 接合にバイアス V       … 接合を境に、それぞれの電極の電位で一定
 *   ・MOS                       … シリコン側は全部ボディ電極の電位
 *   ・MOSFET のチャネル         … 電子だけチャネル電位、正孔はボディ電位
 *
 * この置き方で、空乏層幅・電界・容量・しきい値は教科書どおりに出る。
 * 出ないのは「大注入」と「電流が電位分布を歪めるほど流れる領域」。
 * そこは正直に外してある ― 出ないものを出たように見せるほうが害が大きい。
 *
 * 【積分は半分ずつ】格子の制御体積は界面をまたいではいけない。
 * 点 i の電荷は「左半分の濃度 × 左半分の体積 ＋ 右半分の濃度 × 右半分の体積」。
 * ひとまとめにすると隣の層の濃度で数えてしまう（stack.js の注記を参照）。
 *
 * 【符号】ψ は「真性シリコンが電位 0」を基準にした静電ポテンシャル [V]。
 * n 型は正、p 型は負に落ち着く。エネルギーで見ると符号が逆になる（E = -qψ）ので、
 * バンド図を描くところ（band.js）で一度だけ裏返す。ここでは裏返さない。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});
  var P = SL.phys;

  var MAXIT = 500;
  var TOL = 1e-11;                  /* 更新量がこれ以下になったら止める [V] */
  var CLAMP = 1.0;                  /* 1回の更新で動かす上限 [V]。外すと発散する */
  var EXPCAP = 80;                  /* exp の中身の上限。exp(80)=5e34 ― これ以上は数値の話 */

  /* ---- 三重対角（Thomas 法） ----
   * a … 下, b … 対角, c … 上, d … 右辺。長さは全部 n。破壊的に使う */
  function thomas(a, b, c, d, n) {
    var i, m;
    for (i = 1; i < n; i++) {
      m = a[i] / b[i - 1];
      b[i] -= m * c[i - 1];
      d[i] -= m * d[i - 1];
    }
    var x = new Float64Array(n);
    x[n - 1] = d[n - 1] / b[n - 1];
    for (i = n - 2; i >= 0; i--) x[i] = (d[i] - c[i] * x[i + 1]) / b[i];
    return x;
  }

  /* ---- 境界の電位 ---- */

  /** ゲート電極の電位。仕事関数のぶんだけ、かけた電圧からずれる */
  function gatePsi(vg, wf, T) {
    /* 真性シリコン（ψ=0）の仕事関数は χ + Eg/2。金属との差がそのままずれになる */
    return vg - (wf - (P.SI.chi + P.eg(T) / 2));
  }

  /** オーミック電極の電位。中性になる電位＋かけた電圧 */
  function ohmicPsi(v, net, T) {
    return v + P.neutralPsi(net, T);
  }

  /**
   * 準フェルミ電位を作る。
   *
   * 【接合で「両方いっしょに」切り替えてはいけない ― 一度やらかした】
   *
   * 最初、接合を境に φn も φp も電極の電位に切り替えた。すると接合のすぐ n 側で
   * 「φp は p 側の電位、ψ はまだ p 側の低い値」という組み合わせになり、
   * p = ni exp((φp-ψ)/Vt) が exp(200) まで跳ねて解が壊れた。
   *
   * 正しくは教科書どおり ―
   *
   *     φn は n 側電極の電位で全域一定、φp は p 側電極の電位で全域一定。
   *
   * 空乏層の中では2本が離れたまま平らで、その隔たりがそのまま印加電圧。
   * この置き方にすると、n 側の少数キャリアが
   *
   *     p = (ni^2/Nd) exp(V/Vt)
   *
   * と**自動的に**なる。ショックレーの境界条件を別途書き足す必要がない ―
   * 置き方から出てくる。
   *
   * 少数キャリアは接合から拡散長ぶん離れれば本来の平衡値に戻るが、
   * そこでは電荷への効きが桁で無視できるので、一定のままにしてある。
   *
   * bias = { left, right }（V）。opt.chan を渡すと、シリコンの中の電子だけ
   * その電位にする（MOSFET のチャネル用）。
   */
  function quasiFermi(m, bias, opt) {
    opt = opt || {};
    var n = m.n, phin = new Float64Array(n), phip = new Float64Array(n), i;
    var js = SL.stack.junctionNodes(m);

    var vn, vp;
    if (m.left === SL.stack.GATE) { vn = vp = bias.right; }        /* MOS ― シリコンはボディ側だけ */
    else if (m.right === SL.stack.GATE) { vn = vp = bias.left; }
    else if (js.length === 1) {
      /* 左が p 型なら、正孔の準フェルミ電位は左の電極から来る */
      var leftIsP = m.netL[js[0]] < 0;
      vp = leftIsP ? bias.left : bias.right;
      vn = leftIsP ? bias.right : bias.left;
    } else {
      /* 接合が無い（ただの棒）か、2つ以上ある（npn など）。
       * 前者は抵抗なので直線で繋ぐ。後者はこの置き方では正しく扱えないので、
       * 平衡（両方 0V）でだけ意味のある解になる ― README に明記してある */
      for (i = 0; i < n; i++) {
        var v = bias.left + (bias.right - bias.left) * (m.x[i] / m.x[n - 1]);
        phin[i] = v; phip[i] = v;
      }
      if (opt.chan !== undefined && opt.chan !== null) {
        for (i = 0; i < n; i++) if (m.siDx[i] > 0) phin[i] = opt.chan;
      }
      return { phin: phin, phip: phip, multi: js.length > 1 };
    }

    for (i = 0; i < n; i++) { phin[i] = vn; phip[i] = vp; }
    if (opt.chan !== undefined && opt.chan !== null) {
      for (i = 0; i < n; i++) if (m.siDx[i] > 0) phin[i] = opt.chan;
    }
    return { phin: phin, phip: phip, multi: false };
  }

  /* ---- 本体 ---- */

  /**
   * 解く。
   *   m     … stack.mesh() の格子
   *   bias  … { left, right }（V）
   *   opt   … { wfLeft, wfRight, chan, psi0, phin, phip }
   *
   * 戻り値 { psi, n, p, rho, E, ok, iters, resid, … }
   *   psi … 電位 [V]、n/p … キャリア [cm^-3]、rho … 正味電荷 [cm^-3]、E … 電界 [V/cm]
   */
  function solve(m, bias, opt) {
    opt = opt || {};
    bias = bias || { left: 0, right: 0 };
    var T = m.T, Vt = P.vt(T), ni = P.ni(T), N = m.n, i;

    var qf = opt.phin ? { phin: opt.phin, phip: opt.phip } : quasiFermi(m, bias, opt);
    var phin = qf.phin, phip = qf.phip;

    /* 境界（両端はディリクレ） */
    var wfL = opt.wfLeft || P.WORKFN['n+poly'], wfR = opt.wfRight || P.WORKFN['n+poly'];
    var psiL = m.left === SL.stack.GATE ? gatePsi(bias.left, wfL, T) : ohmicPsi(bias.left, m.netR[0], T);
    var psiR = m.right === SL.stack.GATE ? gatePsi(bias.right, wfR, T) : ohmicPsi(bias.right, m.netL[N - 1], T);

    /* 不純物ぶんの電荷（半分ずつ足したもの）。ψ に依らないので先に作っておく */
    var dopeDx = new Float64Array(N);
    for (i = 0; i < N; i++) {
      dopeDx[i] = (m.matL[i] === 'si' ? m.netL[i] * m.dxL[i] : 0)
                + (m.matR[i] === 'si' ? m.netR[i] * m.dxR[i] : 0);
    }

    /* 初期値。シリコンは中性の電位、酸化膜はその間を直線で繋ぐ */
    var psi = new Float64Array(N);
    if (opt.psi0 && opt.psi0.length === N) {
      psi.set(opt.psi0);
    } else {
      for (i = 0; i < N; i++) {
        psi[i] = m.siDx[i] > 0 ? phin[i] + P.neutralPsi(m.net[i], T) : 0;
      }
      fillInsulator(m, psi, psiL, psiR);
    }
    psi[0] = psiL; psi[N - 1] = psiR;

    var a = new Float64Array(N), b = new Float64Array(N), c = new Float64Array(N), d = new Float64Array(N);
    var nn = new Float64Array(N), pp = new Float64Array(N);
    var it = 0, step = 0, resid = 0;

    for (it = 0; it < MAXIT; it++) {
      carriers(m, psi, phin, phip, ni, Vt, nn, pp);

      a[0] = 0; b[0] = 1; c[0] = 0; d[0] = 0;
      a[N - 1] = 0; b[N - 1] = 1; c[N - 1] = 0; d[N - 1] = 0;
      resid = 0;

      for (i = 1; i < N - 1; i++) {
        var hl = m.x[i] - m.x[i - 1], hr = m.x[i + 1] - m.x[i];
        var el = m.epsEdge[i - 1] / hl, er = m.epsEdge[i] / hr;
        var qdx = P.Q * ((pp[i] - nn[i]) * m.siDx[i] + dopeDx[i]);
        var F = er * (psi[i + 1] - psi[i]) - el * (psi[i] - psi[i - 1]) + qdx;
        var dFd = -er - el - P.Q * (nn[i] + pp[i]) / Vt * m.siDx[i];

        a[i] = el; b[i] = dFd; c[i] = er; d[i] = -F;
        if (Math.abs(F) > resid) resid = Math.abs(F);
      }

      var dpsi = thomas(a, b, c, d, N);

      /* 減衰 ― 一番大きく動く点で上限を決め、方向は変えずに全体を縮める */
      var maxd = 0;
      for (i = 0; i < N; i++) if (Math.abs(dpsi[i]) > maxd) maxd = Math.abs(dpsi[i]);
      var scale = maxd > CLAMP ? CLAMP / maxd : 1;
      for (i = 1; i < N - 1; i++) psi[i] += dpsi[i] * scale;

      step = maxd * scale;
      if (step < TOL) break;
    }

    carriers(m, psi, phin, phip, ni, Vt, nn, pp);

    var rho = new Float64Array(N), E = new Float64Array(N);
    for (i = 0; i < N; i++) {
      /* 表示用の電荷密度。体積で割って濃度に戻す */
      rho[i] = m.siDx[i] > 0
        ? (pp[i] - nn[i]) + dopeDx[i] / m.siDx[i]
        : 0;
    }
    field(m, psi, E);

    return {
      psi: psi, n: nn, p: pp, rho: rho, E: E, dopeDx: dopeDx,
      phin: phin, phip: phip, mesh: m, bias: bias,
      ok: step < 1e-6, iters: it + 1, resid: resid, step: step,
      psiL: psiL, psiR: psiR
    };
  }

  /**
   * 大きな電圧でも落ちないように解く。
   *
   * いきなり −500V を解くと、初期値（中性の電位）から遠すぎてニュートン法が
   * 500 回で収束しきらない（実際に踏んだ: フォトダイオードの −500V）。
   * そのときは **0V から少しずつ電圧を上げ、前の解を次の初期値にする**（連続法）。
   * 1段あたり 5V。直接解けたときはそれをそのまま返す（余計な計算はしない）。
   *
   * 戻り値は solve() と同じ。ramped に何段で上げたかが入る。
   */
  function solveRobust(m, bias, opt) {
    opt = opt || {};
    bias = bias || { left: 0, right: 0 };
    var sol = solve(m, bias, opt);
    if (sol.ok) return sol;

    var span = Math.max(Math.abs(bias.left), Math.abs(bias.right));
    var steps = Math.max(2, Math.ceil(span / 5));
    var prev = null, k;
    for (k = 1; k <= steps; k++) {
      var f = k / steps;
      var o = {};
      for (var key in opt) o[key] = opt[key];
      if (prev) o.psi0 = prev.psi;
      prev = solve(m, { left: bias.left * f, right: bias.right * f }, o);
    }
    prev.ramped = steps;
    return prev.ok || !sol.ok ? prev : sol;
  }

  function carriers(m, psi, phin, phip, ni, Vt, nn, pp) {
    for (var i = 0; i < m.n; i++) {
      if (m.siDx[i] <= 0) { nn[i] = 0; pp[i] = 0; continue; }
      var en = clamp((psi[i] - phin[i]) / Vt, -EXPCAP, EXPCAP);
      var ep = clamp((phip[i] - psi[i]) / Vt, -EXPCAP, EXPCAP);
      nn[i] = ni * Math.exp(en);
      pp[i] = ni * Math.exp(ep);
    }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /** 絶縁体の区間を、両隣の値で直線に埋める（初期値作りだけに使う） */
  function fillInsulator(m, psi, psiL, psiR) {
    var i, s = -1;
    psi[0] = psiL; psi[m.n - 1] = psiR;
    for (i = 0; i < m.n; i++) {
      if (m.siDx[i] <= 0 && i > 0 && i < m.n - 1) { if (s < 0) s = i; }
      else if (s >= 0) {
        var lo = psi[s - 1], hi = psi[i], k;
        for (k = s; k < i; k++) psi[k] = lo + (hi - lo) * (k - s + 1) / (i - s + 1);
        s = -1;
      }
    }
  }

  /** 電界 E = -dψ/dx [V/cm]。区間で出して点に均す */
  function field(m, psi, E) {
    var i, N = m.n;
    var e = new Float64Array(N - 1);
    for (i = 0; i < N - 1; i++) e[i] = -(psi[i + 1] - psi[i]) / (m.x[i + 1] - m.x[i]);
    E[0] = e[0]; E[N - 1] = e[N - 2];
    for (i = 1; i < N - 1; i++) E[i] = (e[i - 1] + e[i]) / 2;
  }

  /* ---- 解を読む ---- */

  /** 点 i の左半分・右半分に居る電荷 [cm^-2]（濃度ではなく面密度） */
  function halfCharge(sol, i) {
    var m = sol.mesh, free = sol.p[i] - sol.n[i];
    var l = m.matL[i] === 'si' ? (free + m.netL[i]) * m.dxL[i] : 0;
    var r = m.matR[i] === 'si' ? (free + m.netR[i]) * m.dxR[i] : 0;
    return { l: l, r: r };
  }

  /**
   * 空乏層幅を測る。
   *
   * 【「接合の片側の電荷を濃度で割る」では測れない ― 3度目の間違い】
   *
   * 最初これでやった:  Wn = |∫(接合より右) ρ dx| / Nd
   * p+(1e19)/n(1e16) で Wn が空乏近似の 3〜4 倍になった。解を疑ったが、解は正しかった。
   *
   * 片側接合では、**p+ 側の正孔が接合のすぐ n 側まで染み出している**。
   * 接合上の正孔は約 Na（p 側はほとんど空乏しないので）、
   * それが Vt/E ≒ 数 nm で減衰する。積分すると 1e12 cm^-2 になり、
   * ドナーの空乏電荷 3e11 cm^-2 を上回ってしまう。
   * ポアソンの第一積分で手計算しても同じ値になる ― これは解ではなく定義の問題。
   *
   * だから**多数キャリアの欠損**で測る:
   *
   *     Wn = ∫(接合より右) (1 - n/Nd) dx        Wp = ∫(接合より左) (1 - p/Na) dx
   *
   * 空乏したところは被積分が 1、中性のところは 0。染み出した少数キャリアは入らない。
   * 一様な層なら空乏近似とそのまま一致する。
   *
   * 【C-V が測っているのは qDep ではない ― 精査で見つけた誤り】
   * qDep ＝ ε·Emax は**本当の双極子電荷**だが、片側接合ではその大半が「接合のすぐ脇に溜まった
   * 正孔の山」で、これはバイアスを変えてもほとんど動かない。dQ/dV を qDep で取ると容量が
   * 1桁小さく出た。容量が見ているのは**バイアスで動く電荷＝空乏層の端での多数キャリアの欠損**。
   * それを qMove として別に返す（一様な層なら q·N·W そのもの）。
   *
   * 【左右どちらが p でもよい ― 精査で見つけたもう1つの誤り】
   * 以前は「左が p」と決め打ちしていて、n を左に置くと空乏層幅が 0 になった
   * （検査の構造がどれも p を左に置いていたので気付かなかった）。
   * いまは接合の左の型を見て、左右それぞれの多数キャリアで測る。
   *   wp / wn … 型ごとの幅（p 側・n 側）
   *   wL / wR … 位置ごとの幅（接合より左・右）。絵や光で「どこからどこまで」を出すときはこちら
   */
  function depletionByCharge(sol) {
    var m = sol.mesh, js = SL.stack.junctionNodes(m);
    if (!js.length) return null;
    var j = js[0], i;
    var leftP = m.netL[j] < 0;
    var nL = Math.abs(m.netL[j]), nR = Math.abs(m.netR[j]);
    var wL = 0, wR = 0, qL = 0, qR = 0;

    /* 接合より左。左の型の多数キャリアが、その点の不純物にどれだけ足りないか */
    for (i = 0; i <= j; i++) {
      var dl = (m.matL[i] === 'si' ? m.dxL[i] : 0) + (i < j && m.matR[i] === 'si' ? m.dxR[i] : 0);
      var netl = (i === 0 ? m.netR[i] : m.netL[i]);
      if (!netl || (netl < 0) !== leftP) continue;
      var Nl = Math.abs(netl) || nL, majl = leftP ? sol.p[i] : sol.n[i];
      wL += Math.max(0, 1 - majl / Nl) * dl;
      qL += Math.max(0, Nl - majl) * dl;
    }
    /* 接合より右 */
    for (i = j; i < m.n; i++) {
      var dr = (m.matR[i] === 'si' ? m.dxR[i] : 0) + (i > j && m.matL[i] === 'si' ? m.dxL[i] : 0);
      var netr = (i === m.n - 1 ? m.netL[i] : m.netR[i]);
      if (!netr || (netr < 0) === leftP) continue;
      var Nr = Math.abs(netr) || nR, majr = leftP ? sol.n[i] : sol.p[i];
      wR += Math.max(0, 1 - majr / Nr) * dr;
      qR += Math.max(0, Nr - majr) * dr;
    }

    /* 本当の双極子電荷 ― 接合での電界からガウスの法則で読む */
    var emax = 0;
    for (i = 0; i < m.n; i++) if (Math.abs(sol.E[i]) > Math.abs(emax)) emax = sol.E[i];

    return {
      wp: leftP ? wL : wR, wn: leftP ? wR : wL, w: wL + wR,
      wL: wL, wR: wR, leftIsP: leftP, xj: m.x[j], jNode: j,
      qDep: m.eps[j] * Math.abs(emax),                    /* 双極子電荷 [C/cm^2]（正孔の山を含む） */
      /* バイアスで動く電荷 [C/cm^2]。広いほう（薄いほう）の側の欠損 ― 容量はこれの微分 */
      qMove: P.Q * (wL >= wR ? qL : qR),
      emax: emax
    };
  }

  /**
   * 空乏している「範囲」。
   * 不純物の電荷の半分より多くが打ち消されずに残っている点を空乏とみなす。
   * 幅そのものは depletionByCharge() のほうを使うこと。こちらは絵を塗る用。
   */
  function depletion(sol) {
    var m = sol.mesh, i, lo = -1, hi = -1;
    for (i = 0; i < m.n; i++) {
      if (m.siDx[i] <= 0 || m.net[i] === 0) continue;
      if (Math.abs(sol.rho[i]) > 0.5 * Math.abs(m.net[i])) { if (lo < 0) lo = i; hi = i; }
    }
    if (lo < 0) return null;
    return { i0: lo, i1: hi, x0: m.x[lo], x1: m.x[hi], w: m.x[hi] - m.x[lo] };
  }

  /**
   * 電界が立っている範囲の広さ [cm]。
   *
   * depletion() は「不純物の電荷がどれだけ残っているか」で見るので、
   * **真性層（Na = Nd = 0）を見落とす** ― 残る電荷がそもそも無いため。
   * pin ダイオードの i 層はまさにそれで、幅 0 と出てしまう。
   *
   * 電界で見ればその穴が無い。ピークの frac 倍より強い電界が立っている範囲を返す。
   * 三角形の電界（普通の pn 接合）なら空乏層幅の (1-frac) 倍あたりになるので、
   * frac は小さめ（既定 0.05）にしてある。
   */
  function fieldSpan(sol, frac) {
    frac = frac === undefined ? 0.05 : frac;
    var m = sol.mesh, i, emax = 0, lo = -1, hi = -1;
    for (i = 0; i < m.n; i++) if (Math.abs(sol.E[i]) > emax) emax = Math.abs(sol.E[i]);
    if (emax <= 0) return null;
    for (i = 0; i < m.n; i++) {
      if (m.siDx[i] <= 0) continue;
      if (Math.abs(sol.E[i]) >= frac * emax) { if (lo < 0) lo = i; hi = i; }
    }
    if (lo < 0 || hi <= lo) return null;
    return { i0: lo, i1: hi, x0: m.x[lo], x1: m.x[hi], w: m.x[hi] - m.x[lo], emax: emax };
  }

  /** 半導体の中の全電荷 [C/cm^2] */
  function charge(sol) {
    var m = sol.mesh, q = 0, i, h;
    for (i = 0; i < m.n; i++) { h = halfCharge(sol, i); q += h.l + h.r; }
    return P.Q * q;
  }

  /** 溜まっている電子の面密度 [cm^-2]（反転層の量） */
  function electronSheet(sol) {
    var m = sol.mesh, s = 0, i;
    for (i = 0; i < m.n; i++) s += sol.n[i] * m.siDx[i];
    return s;
  }

  function holeSheet(sol) {
    var m = sol.mesh, s = 0, i;
    for (i = 0; i < m.n; i++) s += sol.p[i] * m.siDx[i];
    return s;
  }

  /** 酸化膜に接している最初のシリコン点の番号（MOS の表面） */
  function surfaceNode(m) {
    var i;
    for (i = 0; i < m.n; i++) if (m.siDx[i] > 0) return i;
    return -1;
  }

  /** 表面ポテンシャル φs ― 表面の ψ から体内の ψ を引いたもの */
  function surfacePsi(sol) {
    var m = sol.mesh, i = surfaceNode(m);
    if (i < 0) return null;
    return sol.psi[i] - sol.psi[m.n - 1];
  }

  SL.poisson = {
    solve: solve, solveRobust: solveRobust, thomas: thomas, gatePsi: gatePsi, ohmicPsi: ohmicPsi,
    quasiFermi: quasiFermi, depletion: depletion, depletionByCharge: depletionByCharge,
    halfCharge: halfCharge, charge: charge, fieldSpan: fieldSpan,
    electronSheet: electronSheet, holeSheet: holeSheet,
    surfaceNode: surfaceNode, surfacePsi: surfacePsi, field: field
  };
})(typeof window !== 'undefined' ? window : globalThis);
