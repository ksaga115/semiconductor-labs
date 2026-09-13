/* 素子として読む ― 構造から「これは何か」と「どう振る舞うか」を出す
 *
 * poisson.js が返すのは、ある一つのバイアスでの電位とキャリアの分布。
 * ここはその上に立って、素子としての量を出す:
 *
 *     ダイオード  … 飽和電流 J0、I-V、直列抵抗、接合容量
 *     MOS        … Cox、フラットバンド電圧、しきい値電圧、S値、C-V
 *     MOSFET     … Id-Vd（チャネル電位ごとの反転電荷を積む）
 *
 * 【どこまでが厳密で、どこからがモデルか ― 必ず読むこと】
 *
 * 電位・キャリア分布・空乏層幅・反転電荷・しきい値電圧・容量は
 * **ポアソン方程式を解いて出している**（近似は「準フェルミ電位を与える」ことだけ）。
 *
 * 電流は違う。ドリフト拡散を連立していないので、**教科書の解析式**で出す:
 *
 *     拡散電流   ショックレー式（有限の中性領域は coth で補正）
 *     再結合電流 空乏層中の SRH。n=2 の項
 *     直列抵抗   中性領域の抵抗
 *     光電流     少数キャリアの拡散方程式を数値で解く（light.js）
 *
 * I-V の中で使う空乏層幅だけは、毎点ポアソンを解くと遅いので空乏近似の式を使う。
 * 実測（＝ポアソンを解いた値）との差は 5% 以内であることを tests/run.js で見ている。
 *
 * 出ないもの: 大注入、降伏（アバランシェ・ツェナー）、表面再結合以外の界面準位、
 * 量子効果（薄い酸化膜のトンネル、反転層の量子化）。README に一覧がある。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});
  var P = SL.phys, ST = SL.stack, PS = SL.poisson;

  /* ---- 構造を見て「何が出来ているか」を言う ---- */

  var KIND = {
    EMPTY: 'empty', BULK: 'bulk', DIODE: 'diode', MOS: 'mos',
    PIN: 'pin', BJT: 'bjt', OTHER: 'other'
  };

  /**
   * 構造の種類を見分ける。名前を付けるのはここだけ ―
   * ユーザーは「pn接合を置く」のではなく、置いた結果こう呼ばれる。
   */
  function identify(st) {
    if (!st.layers.length) return { kind: KIND.EMPTY, label: '空' };
    var si = st.layers.filter(function (L) { return L.mat === 'si'; });
    var ox = st.layers.filter(function (L) { return L.mat === 'ox'; });
    if (!si.length) return { kind: KIND.OTHER, label: '酸化膜だけ' };

    var types = si.map(function (L) { return sgn(L.nd - L.na); });
    var flips = signFlips(types), i;

    if (ox.length) {
      var gateSide = st.layers[0].mat === 'ox' || st.layers[st.layers.length - 1].mat === 'ox';
      if (gateSide) return { kind: KIND.MOS, label: flips ? 'MOS ＋ 接合' : 'MOS キャパシタ' };
      return { kind: KIND.OTHER, label: '酸化膜が真ん中にある' };
    }
    if (flips === 0) return { kind: KIND.BULK, label: types[0] > 0 ? 'n 型の一片' : types[0] < 0 ? 'p 型の一片' : '真性シリコン' };
    if (flips === 1) {
      var intrinsic = si.some(function (L) { return L.na === 0 && L.nd === 0; });
      return { kind: intrinsic ? KIND.PIN : KIND.DIODE, label: intrinsic ? 'pin ダイオード' : 'pn 接合（ダイオード）' };
    }
    if (flips === 2) return { kind: KIND.BJT, label: types[0] > 0 ? 'npn' : 'pnp' };
    return { kind: KIND.OTHER, label: '接合が ' + flips + ' 個' };
  }

  function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }

  /* 型の並びから「符号が変わった回数」を数える。
   *
   * 【真性層をまたいでも接合は接合 ― ここを一度見落とした】
   * p⁺ / i / n⁺ の型の並びは [-1, 0, +1]。隣どうしだけを見て
   * 「両方 0 でないとき」に数えると、0 が挟まっているせいで
   * **どこにも変化が無いことになり、pin がただの一片と判定される**。
   * 0 を先に取り除いてから数えること。 */
  function nonZero(types) {
    return types.filter(function (t) { return t !== 0; });
  }

  function signFlips(types) {
    var z = nonZero(types), c = 0, i;
    for (i = 1; i < z.length; i++) if (z[i] !== z[i - 1]) c++;
    return c;
  }

  /* ---- ダイオード ---- */

  /**
   * 接合の両側の「同じ型が続く範囲」をまとめる。
   * p+ / n / n+ のような3層でも、n 側の厚みは n と n+ を足したものになる。
   */
  function sides(st) {
    var si = [], i;
    for (i = 0; i < st.layers.length; i++) if (st.layers[i].mat === 'si') si.push(st.layers[i]);
    var types = si.map(function (L) { return sgn(L.nd - L.na); });

    /* 接合の右側になる層を探す。真性層を挟んでいてもまたいで探す
     * （i 層の右端が実質の接合になる）。identify() の signFlips と同じ考え方。 */
    var k = -1, prev = -1;
    for (i = 0; i < types.length; i++) {
      if (types[i] === 0) continue;
      if (prev >= 0 && types[i] !== types[prev]) { k = i; break; }
      prev = i;
    }
    if (k < 0) return null;

    var j = prev;                 /* 接合の左側になる層（真性層は飛ばしてある） */
    var L = { t: 0, n: 0, layers: [] }, R = { t: 0, n: 0, layers: [] };
    for (i = k - 1; i >= 0 && (types[i] === types[j] || types[i] === 0); i--) {
      L.t += si[i].tnm * ST.NM; L.layers.unshift(si[i]);
    }
    for (i = k; i < si.length && (types[i] === types[k] || types[i] === 0); i++) {
      R.t += si[i].tnm * ST.NM; R.layers.push(si[i]);
    }
    /* 接合に接している層の濃度が、電流を決める側の濃度 */
    L.n = Math.abs(si[j].nd - si[j].na);
    R.n = Math.abs(si[k].nd - si[k].na);
    L.type = types[j]; R.type = types[k];
    L.dope = si[j].na + si[j].nd;
    R.dope = si[k].na + si[k].nd;
    return { p: L.type < 0 ? L : R, n: L.type > 0 ? L : R, leftIsP: L.type < 0 };
  }

  /*
   * 【接合の隣の層の濃度を、そのまま使ってはいけない ― プロセスラボから来た構造で見つけた】
   *
   * sides() は「接合に接している層」の濃度を返す。一様な層ならそれで正しい。
   * ところがプロセスラボで作ったなだらかな接合は、薄い層を何十枚も積んだもので、
   * 接合の隣の層はドナーとアクセプタがほとんど打ち消し合っている（正味 1e14 程度）。
   * それで Vbi が 0.39V と出た（実際の障壁はもっと高い）。
   *
   * ショックレーの式が要るのは「空乏層の端の外側」― 中性領域が始まるところの濃度。
   * そこで平衡のポアソン解を1回解いて空乏層の端を求め、その少し外が
   * **隣の層の中に収まっていなければ**（＝層が空乏層より薄い＝なだらかな接合）、そこの濃度に替える。
   * 一様な層では端の外も同じ層なので、結果は以前と1桁も変わらない（検査で確かめている）。
   */
  function edgeDoping(st, s, T) {
    var m = ST.mesh(st, T);
    var sol = PS.solve(m, { left: 0, right: 0 });
    var dep = PS.depletionByCharge(sol);
    if (!dep) return false;
    var changed = false;
    ['p', 'n'].forEach(function (k) {
      var side = s[k];
      var onLeft = (k === 'p') === s.leftIsP;
      var w = k === 'p' ? dep.wp : dep.wn;
      var x = onLeft ? dep.xj - w * 1.5 - 2e-7 : dep.xj + w * 1.5 + 2e-7;
      var i = ST.nodeAt(m, Math.max(0, Math.min(x, m.x[m.n - 1])));
      var adj = onLeft ? side.layers[side.layers.length - 1] : side.layers[0];
      if (m.layer[i] === ST.indexOf(st, adj.id)) return;            /* 隣の層の中 ＝ 一様な接合 */
      var net = m.net[i];
      if ((k === 'p' && net >= 0) || (k === 'n' && net <= 0)) return; /* 反対の型に出たら諦める */
      side.n = Math.abs(net);
      side.dope = m.na[i] + m.nd[i];
      changed = true;
    });
    return changed;
  }

  /* 同じ構造でポアソンを何度も解かない（画面は描くたびに diode() を呼ぶ） */
  var DCACHE = {}, DORDER = [];

  /**
   * ダイオードのモデルを作る。
   * 戻り値に iv(V) が入っていて、そこに電圧を渡すと電流密度 [A/cm^2] が返る。
   */
  function diode(st, T) {
    T = T || P.T300;
    var key = T + '|' + JSON.stringify(st.layers);
    if (DCACHE.hasOwnProperty(key)) return DCACHE[key];
    var r = buildDiode(st, T);
    DCACHE[key] = r; DORDER.push(key);
    if (DORDER.length > 20) delete DCACHE[DORDER.shift()];
    return r;
  }

  function buildDiode(st, T) {
    var s = sides(st);
    if (!s) return null;
    var edge = edgeDoping(st, s, T);
    var ni = P.ni(T), Vt = P.vt(T), eps = P.SI.epsR * P.EPS0;
    var Na = s.p.n, Nd = s.n.n;

    var Vbi = Vt * Math.log(Na * Nd / (ni * ni));

    /* 少数キャリアの定数。散乱も寿命も「その層の不純物の総量」で決まる */
    var mup = P.muP(s.n.dope, T), mun = P.muN(s.p.dope, T);
    var Dp = P.diff(mup, T), Dn = P.diff(mun, T);
    var taup = P.tau(s.n.dope), taun = P.tau(s.p.dope);
    var Lp = P.diffLen(Dp, taup), Ln = P.diffLen(Dn, taun);

    /* 多数キャリア側の移動度（直列抵抗用） */
    var muMajP = P.muP(s.p.dope, T), muMajN = P.muN(s.n.dope, T);

    /** 空乏層幅 [cm]（空乏近似。I-V の中だけで使う） */
    function width(V) {
      var d = Math.max(Vbi - V, 1e-4);
      return Math.sqrt(2 * eps * d / P.Q * (1 / Na + 1 / Nd));
    }
    function widths(V) {
      var w = width(V);
      return { w: w, wp: w * Nd / (Na + Nd), wn: w * Na / (Na + Nd) };
    }

    /** 中性領域の残り幅（空乏層に食われたぶんを引く） */
    function neutral(V) {
      var ws = widths(V);
      return {
        p: Math.max(s.p.t - ws.wp, 1e-8),
        n: Math.max(s.n.t - ws.wn, 1e-8),
        w: ws.w
      };
    }

    function coth(x) {
      if (x > 20) return 1;
      if (x < 1e-6) return 1 / x;
      return (Math.exp(2 * x) + 1) / (Math.exp(2 * x) - 1);
    }

    /**
     * 飽和電流密度 [A/cm^2]。
     * coth が「中性領域が拡散長より薄いと電流が増える」を表す ―
     * 薄いほど濃度勾配が急になるため。短基底ダイオードが速くて電流が大きい理由。
     */
    function j0(V) {
      var q = neutral(V);
      return P.Q * ni * ni * (
        Dp / (Lp * Nd) * coth(q.n / Lp) +
        Dn / (Ln * Na) * coth(q.p / Ln)
      );
    }

    /* 空乏層の中での生成・再結合。逆方向ではこれが暗電流になる。
     *
     * 寿命は両側の平均ではなく **薄いほうの側の寿命**を使う。
     * 空乏層はほとんど薄いほうに広がるので、生成が起きているのもそちら。
     * 平均にすると、片側を濃くしただけで暗電流が跳ね上がる（濃い側の
     * 短い寿命が、そこに無い空乏層にまで効いてしまう）。 */
    var tauDep = P.tau(Math.min(s.p.dope, s.n.dope));

    function jrec(V) {
      return P.Q * ni * width(V) / (2 * tauDep);
    }

    /** 直列抵抗 [Ω·cm^2]。中性領域の抵抗をそのまま足したもの */
    function rs(V) {
      var q = neutral(V);
      return q.p / (P.Q * muMajP * Na) + q.n / (P.Q * muMajN * Nd);
    }

    /**
     * 電流密度 [A/cm^2]。
     * 直列抵抗があるので、接合にかかる電圧は端子電圧より小さい。
     * V = Vj + J*Rs を Vj について解く（単調なので二分法）。
     */
    function iv(V) {
      var lo = Math.min(V, 0) - 1, hi = Math.min(V, Vbi * 0.98), mid, i;
      for (i = 0; i < 60; i++) {
        mid = (lo + hi) / 2;
        var j = bare(mid);
        if (mid + j * rs(mid) < V) lo = mid; else hi = mid;
      }
      var vj = (lo + hi) / 2;
      return { j: bare(vj), vj: vj, drop: V - vj };
    }

    /** 直列抵抗を無視した、接合そのものの電流密度 */
    function bare(vj) {
      var e1 = expm1c(vj / Vt), e2 = expm1c(vj / (2 * Vt));
      return j0(vj) * e1 + jrec(vj) * e2;
    }

    /* exp が振り切れないように挟む。順方向 1.2V でも exp(46) なので 200 で十分 */
    function expm1c(x) { return Math.expm1(Math.min(x, 200)); }

    /** 接合容量 [F/cm^2]。空乏層を平行平板と見る */
    function cap(V) { return eps / width(V); }

    return {
      kind: 'diode', T: T, Vbi: Vbi, Na: Na, Nd: Nd, edge: edge,
      Dp: Dp, Dn: Dn, Lp: Lp, Ln: Ln, taup: taup, taun: taun,
      tp: s.p.t, tn: s.n.t, leftIsP: s.leftIsP,
      j0: j0(0), jrec0: jrec(0), rs: rs(0), tauDep: tauDep,
      width: width, widths: widths, neutral: neutral,
      iv: iv, bare: bare, cap: cap, j0at: j0, jrecat: jrec, rsat: rs
    };
  }

  /* ---- MOS ---- */

  /**
   * MOS の諸元。しきい値電圧は式ではなく**ポアソンを解いて**探す。
   * 定義は教科書どおり「表面ポテンシャルが 2φF になるゲート電圧」。
   */
  function mos(st, T) {
    T = T || P.T300;
    var layers = st.layers;
    if (!layers.length) return null;
    var gateLeft = layers[0].mat === 'ox';
    var gateRight = layers[layers.length - 1].mat === 'ox';
    if (!gateLeft && !gateRight) return null;

    var oxL = gateLeft ? layers[0] : layers[layers.length - 1];
    var body = gateLeft ? layers[1] : layers[layers.length - 2];
    if (!body || body.mat !== 'si') return null;

    var tox = oxL.tnm * ST.NM;
    var Cox = P.OX.epsR * P.EPS0 / tox;
    var Nb = Math.abs(body.nd - body.na);
    var pType = body.nd - body.na < 0;
    if (Nb <= 0) return null;

    var Vt = P.vt(T), ni = P.ni(T), eps = P.SI.epsR * P.EPS0;
    var phiF = Vt * Math.log(Nb / ni) * (pType ? 1 : -1);
    var wmax = Math.sqrt(2 * eps * Math.abs(2 * phiF) / (P.Q * Nb));
    var qdep = P.Q * Nb * wmax;

    var m = ST.mesh(st, T);
    /* ゲートの材料は構造が持つ（st.gate → m.gate。無ければ n+ ポリ） */
    var wf = P.WORKFN[m.gate] || P.WORKFN['n+poly'];
    var vfbAnalytic = P.neutralPsi(body.nd - body.na, T) - PS.gatePsi(0, wf, T);
    var vthAnalytic = vfbAnalytic + 2 * phiF + (pType ? qdep / Cox : -qdep / Cox);

    /** ゲートに vg をかけたときの解 */
    function at(vg, psi0) {
      var b = gateLeft ? { left: vg, right: 0 } : { left: 0, right: vg };
      return PS.solve(m, b, { wfLeft: wf, wfRight: wf, psi0: psi0 });
    }

    /**
     * 表面ポテンシャルが target になる vg を二分法で探す。
     * φs は vg の増加関数 ― p 基板でも n 基板でも「φs < target なら vg を上げる」。
     *
     * 【n 基板で一度まちがえていた】 以前は n 基板のとき比べる向きを逆にしていた。
     * n 基板の反転は φs を負の側（2φF < 0）へ動かすが、φs が vg とともに増えることは
     * 変わらない。向きを逆にすると探索が上端に張り付き、VFB も Vth も +5.4 V のような
     * 探索範囲の端を返していた（教科書の式は −1.22 V）。tests/run.js の pMOS の節が見張る。
     */
    function findVg(target, lo, hi) {
      var mid, i;
      for (i = 0; i < 30; i++) {
        mid = (lo + hi) / 2;
        if (PS.surfacePsi(at(mid)) < target) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }

    var span = Math.abs(vthAnalytic) + Math.abs(vfbAnalytic) + 4;
    var vfb = findVg(0, -span, span);
    var vth = findVg(2 * phiF, -span, span);

    /* S値 ― 弱反転で電流を1桁動かすのに要るゲート電圧 [V/dec] */
    var cdep = eps / wmax;
    var swing = Math.LN10 * Vt * (1 + cdep / Cox);

    return {
      kind: 'mos', T: T, gateLeft: gateLeft, pType: pType,
      tox: tox, Cox: Cox, Nb: Nb, phiF: phiF, wmax: wmax, qdep: qdep,
      vfb: vfb, vth: vth, vfbAnalytic: vfbAnalytic, vthAnalytic: vthAnalytic,
      swing: swing, cdep: cdep, wf: wf, gate: m.gate, mesh: m, at: at,
      /** 反転電荷の面密度 [cm^-2]。p 基板（nMOS）なら電子、n 基板（pMOS）なら正孔 */
      qinv: function (vg) {
        var s = at(vg);
        return pType ? PS.electronSheet(s) : PS.holeSheet(s);
      }
    };
  }

  /**
   * C-V 曲線。容量は式ではなく **dQ/dV を数値で**出す。
   * 蓄積で Cox に張り付き、空乏で下がり、反転でまた上がる ― あの形が
   * 何かを仮定せずに出てくる。
   */
  function cv(st, vlist, T, dv) {
    T = T || P.T300;
    dv = dv || 0.01;
    var m = ST.mesh(st, T);
    var gateLeft = st.layers[0].mat === 'ox';
    var wf = P.WORKFN[m.gate] || P.WORKFN['n+poly'];
    var out = [], i;

    function q(vg) {
      var b = gateLeft ? { left: vg, right: 0 } : { left: 0, right: vg };
      return PS.charge(PS.solve(m, b, { wfLeft: wf, wfRight: wf }));
    }
    for (i = 0; i < vlist.length; i++) {
      var v = vlist[i];
      /* ゲート電荷は半導体の電荷の逆符号。dQg/dVg が容量 */
      out.push({ v: v, c: -(q(v + dv) - q(v - dv)) / (2 * dv) });
    }
    return out;
  }

  /**
   * MOSFET の Id-Vd。
   *
   *     Id = (W/L) µ ∫[0→Vd] Qinv(Vg, Vc) dVc
   *
   * チャネル電位 Vc ごとに反転電荷を**ポアソンを解いて**出し、それを積む。
   * 二乗則も飽和も仮定しない ― 積んだ結果として飽和する
   * （Vc が上がると反転電荷が減り、Vd をいくら上げても足し算が増えなくなる）。
   *
   * 同じ Vg なら Qinv(Vc) の表は1回作れば使い回せるので、
   * Vd を掃くのは足し算だけで済む。
   *
   * pMOS（n 基板）は鏡写し ― 反転層は正孔、移動度は µp、チャネルの電位は正孔の
   * 準フェルミ電位（chanP）で、Vd は 0 から **−vdMax へ**掃く。戻す電流は大きさ |Id|。
   */
  function idvd(st, vg, vdMax, T, steps) {
    T = T || P.T300;
    steps = steps || 40;
    var mm = mos(st, T);
    if (!mm) return null;
    var m = mm.mesh, wf = mm.wf, gateLeft = mm.gateLeft;
    var sgn = mm.pType ? 1 : -1;
    var mu = mm.pType ? P.muN(mm.Nb, T) : P.muP(mm.Nb, T);
    var i, vc, tbl = [];

    for (i = 0; i <= steps; i++) {
      vc = sgn * vdMax * i / steps;
      var b = gateLeft ? { left: vg, right: 0 } : { left: 0, right: vg };
      var o = mm.pType ? { wfLeft: wf, wfRight: wf, chan: vc } : { wfLeft: wf, wfRight: wf, chanP: vc };
      var sol = PS.solve(m, b, o);
      var sheet = mm.pType ? PS.electronSheet(sol) : PS.holeSheet(sol);
      tbl.push({ vc: vc, qinv: P.Q * sheet });                   /* [C/cm^2] */
    }

    /* 台形で積む。W/L は掛けない ― 呼ぶ側が形で決める量なので */
    var out = [{ vd: 0, idPerWL: 0 }], acc = 0;
    for (i = 1; i < tbl.length; i++) {
      acc += (tbl[i].qinv + tbl[i - 1].qinv) / 2 * Math.abs(tbl[i].vc - tbl[i - 1].vc);
      out.push({ vd: tbl[i].vc, idPerWL: mu * acc });            /* [A]（W/L=1 のとき） */
    }
    return { vg: vg, mu: mu, vth: mm.vth, pType: mm.pType, points: out, table: tbl };
  }

  SL.dev = {
    KIND: KIND, identify: identify, sides: sides, signFlips: signFlips,
    diode: diode, mos: mos, cv: cv, idvd: idvd
  };
})(typeof window !== 'undefined' ? window : globalThis);
