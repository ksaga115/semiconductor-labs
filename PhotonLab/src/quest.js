/* 課題と採点 ― すべて design 型（受光チェーンを設計して仕様を満たす）
 *
 * 採点は photon.evaluate の値だけを見る（お手本と見比べない）。
 * 条件で固定する欄は check がその値かどうかも見る ― 別の所を動かして
 * ごまかせないようにするため。数値の根拠は第5部 04 の式そのもの。
 */
(function (global) {
  'use strict';
  var PH = global.PH || (global.PH = {});
  var PHO = PH.photon;

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }
  function f(v, d) { return (+v).toFixed(d === undefined ? 2 : d); }
  function ex(v, d) { return (+v).toExponential(d === undefined ? 2 : d); }
  function near(a, b) { return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12; }

  var CH = [
    { id: 1, name: '第1章　目盛りをあわせる', lead: 'R・光子数・NEP。ワットと個数の言葉を自分の手で行き来する。' },
    { id: 2, name: '第2章　増やして届かせる', lead: 'APD の最適な M、PMT の雪だるま、MPPC の飽和。増やすことの得と代償。' },
    { id: 3, name: '第3章　現場の制約', lead: '容量が速さを決め、増倍が床を沈める。光通信と微弱光の定石。' }
  ];

  var LIST = [
    /* ===== 第1章 ===== */
    {
      id: 'resp', ch: 1, kind: 'design',
      name: '感度を作る',
      desc: '波長 **850 nm** で、感度 R を **0.55 A/W 以上**にする。',
      why: 'R = η·λ/1240。同じ量子効率でも、長波長ほど「1W あたりの光子の個数」が多いので R は大きくなる。'
         + '850nm で 0.55 A/W を出すには η ≥ 0.80 が要る ― カタログの A/W を見たら、まず η に戻して読む癖をつける課題。',
      hint: '波長を 850 にして、η を式から逆算する。η = R×1240/λ。',
      check: function (ev, d) {
        return {
          ok: d.nm === 850 && ev.R >= 0.55,
          rows: [
            row('感度 R', f(ev.R, 3) + ' A/W', '0.550 以上', ev.R >= 0.55),
            row('波長', d.nm + ' nm', '850', d.nm === 850),
            row('量子効率 η', f(d.eta, 2) + '（R×1240/λ = ' + f(ev.R * 1240 / d.nm, 2) + '）', '', true)
          ]
        };
      }
    },
    {
      id: 'rate', ch: 1, kind: 'design',
      name: 'ワットを個数に戻す',
      desc: '光のパワー **1 pW（10⁻¹² W）**のまま、波長 **700 nm 以下**で、光子の到着率を **3.2×10⁶ 個/s 以上**にする。',
      why: '同じ 1pW でも、光子1個のエネルギー E = 1240/λ [eV] が小さい（＝長波長）ほど個数は多い。'
         + '「数える」世界の明るさはワットではなく個/s ― この換算が第5部のすべての入口になる。',
      hint: '光子の到着率 = P ÷ (1240/λ × 1.6×10⁻¹⁹)。λ を上げると増える。上限 700nm との間で選ぶ。',
      check: function (ev, d) {
        return {
          ok: d.pw === -12 && d.nm <= 700 && ev.phi >= 3.2e6,
          rows: [
            row('光子の到着率', ex(ev.phi, 2) + ' 個/s', '3.2×10⁶ 以上', ev.phi >= 3.2e6),
            row('光のパワー', '10^' + d.pw + ' W', '10⁻¹² のまま', d.pw === -12),
            row('波長', d.nm + ' nm（1光子 ' + f(ev.Eph, 2) + ' eV）', '700 以下', d.nm <= 700)
          ]
        };
      }
    },
    {
      id: 'nep', ch: 1, kind: 'design',
      name: '床を作る ― NEP 5 fW/√Hz',
      desc: '増倍なし（**M = 1**）で、NEP を **5×10⁻¹⁵ W/√Hz 以下**にする。',
      why: 'NEP は「S/N=1 になる光」。M=1 の床は √(2qI_d + i_amp²)/R ― 暗電流とアンプ雑音の2人の住人を、'
         + '感度 R で光の単位に戻したもの。暗電流を1桁削ってもノイズは √10 しか下がらないので、両方を削る。',
      hint: '暗電流を数 pA、アンプ雑音を数 fA/√Hz まで下げ、R も大きくしておく（長波長・高η）。',
      check: function (ev, d) {
        return {
          ok: d.M <= 1 && ev.NEP <= 5e-15,
          rows: [
            row('NEP', ex(ev.NEP, 2) + ' W/√Hz', '5.0×10⁻¹⁵ 以下', ev.NEP <= 5e-15),
            row('増倍率 M', f(d.M, 0), '1 のまま', d.M <= 1),
            row('暗電流 / アンプ雑音', f(d.idpa, 1) + ' pA / ' + f(d.ifa, 1) + ' fA/√Hz（R = ' + f(ev.R, 3) + ' A/W）', '', true)
          ]
        };
      }
    },

    /* ===== 第2章 ===== */
    {
      id: 'apdopt', ch: 2, kind: 'design',
      name: 'ちょうどいい M を探す',
      desc: '条件固定: 波長 **900 nm**・η **0.9**・パワー **1 nW（10⁻⁹ W）**・アンプ雑音 **1000 fA/√Hz**・帯域 **100 MHz**・k **0.02**・暗電流 **10 pA**。M だけを動かして **SNR 2.0 以上**にする。',
      why: 'M を上げるとアンプの床は相対的に沈む。でも上げすぎると過剰雑音 F(M)=kM+… が伸びて、'
         + '今度は自分のなだれの雑音に埋もれる ― **SNR には最適な M がある**。真ん中の図がその山。'
         + 'M=1 でも M=300 でも届かず、山の上（およそ 50〜140）でだけ届く。',
      hint: '真ん中の図（SNR と M）の山を探す。50〜100 あたり。',
      check: function (ev, d) {
        var lock = d.nm === 900 && near(d.eta, 0.9) && d.pw === -9 && near(d.ifa, 1000) && near(d.bmhz, 100) && near(d.k, 0.02) && near(d.idpa, 10);
        return {
          ok: lock && ev.SNR >= 2,
          rows: [
            row('SNR', f(ev.SNR, 2), '2.00 以上', ev.SNR >= 2),
            row('M / F(M)', f(d.M, 0) + ' / ' + f(ev.F, 2), '', true),
            row('条件固定', lock ? '守っている' : '課題の条件（λ900・η0.9・1nW・1000fA・100MHz・k0.02・10pA）に戻す', 'M 以外は固定', lock)
          ]
        };
      }
    },
    {
      id: 'pmt', ch: 2, kind: 'design',
      name: '雪だるまを組む',
      desc: 'ダイノード（δ ≥ 2）を使い、**10 段以下**で PMT 利得 δⁿ を **10⁶ 以上**、かつ過剰雑音 δ/(δ−1) を **1.35 以下**にする。',
      why: 'PMT の利得は段ごとの二次電子数 δ の n 乗。δ=4 なら10段で 10⁶ に届く。'
         + '増倍の雑音 F = δ/(δ−1) は δ が大きいほど 1 に近づく ― **最初の1段でしっかり増やすほど静か**。'
         + 'PMT の増倍が「ほぼ無雑音」と言われる理由が、この式の形に入っている。',
      hint: 'δ を 4 以上に。δ=3 の10段では 5.9×10⁴ で届かない。',
      check: function (ev, d) {
        var on = d.delta >= 2;
        return {
          ok: on && d.nstg <= 10 && ev.pmtM >= 1e6 && ev.pmtF <= 1.35,
          rows: [
            row('PMT 利得 δⁿ', on ? ex(ev.pmtM, 2) : '（δ を 2 以上に）', '10⁶ 以上', on && ev.pmtM >= 1e6),
            row('過剰雑音 δ/(δ−1)', on ? f(ev.pmtF, 3) : '—', '1.350 以下', on && ev.pmtF <= 1.35),
            row('δ / 段数', f(d.delta, 1) + ' / ' + f(d.nstg, 0) + ' 段', '10 段以下', d.nstg <= 10)
          ]
        };
      }
    },
    {
      id: 'mppc', ch: 2, kind: 'design',
      name: '数えられる明るさに収める',
      desc: '**2000 光子/パルス・PDE 0.4** のパルスを MPPC で受け、飽和による目減り（線形誤差）を **5% 以下**にする。',
      why: 'MPPC のセルは1パルスに1回しか発火できない。平均 μ=個数×PDE のなだれがセル数 N に近づくと、'
         + '同じセルに2個目が来て数え落とす ― 発火セル数は N(1−e^(−μ/N)) で頭打ちになる。'
         + '**セルを μ の10倍ほど**持っておくのが目安。TCSPC のパイルアップと同じ「数える測定の宿命」。',
      hint: 'μ = 2000×0.4 = 800。セル数を 8000 まで上げる。',
      check: function (ev, d) {
        var lock = d.nph === 2000 && near(d.eta, 0.4);
        var on = d.ncell > 0;
        return {
          ok: lock && on && ev.linerr <= 0.05,
          rows: [
            row('線形誤差', on ? f(ev.linerr * 100, 2) + ' %' : '（セル数を入れる）', '5.00 以下', on && ev.linerr <= 0.05),
            row('発火セル / μ', on ? f(ev.fired, 0) + ' / ' + f(ev.mu, 0) : '—', '', true),
            row('条件固定', lock ? '守っている（2000 光子・PDE 0.4）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },

    /* ===== 第3章 ===== */
    {
      id: 'fast', ch: 3, kind: 'design',
      name: '速さの敵は容量',
      desc: '50Ω 受けの RC 帯域 1/(2πRC) を **7 GHz 以上**にする。',
      why: '第4部05 では「小さい容量ほど大きな電圧」だった C が、ここでは速さの上限を決める。'
         + '50Ω・7GHz なら C は 0.45 pF まで ― だから高速のフォトダイオードは受光径を数十 µm まで小さくする。'
         + '走行時間との綱引き（厚くすると C は下がるが遅くなる）は第5部 07 のとおり。',
      hint: 'C = 1/(2πRf)。50Ω・7GHz を入れると 0.45 pF。',
      check: function (ev, d) {
        return {
          ok: ev.fRC >= 7e9,
          rows: [
            row('RC 帯域', f(ev.fRC / 1e9, 2) + ' GHz', '7.00 以上', ev.fRC >= 7e9),
            row('容量', f(d.cpf, 2) + ' pF（50Ω 受け）', '0.45 以下が目安', d.cpf <= 0.4547)
          ]
        };
      }
    },
    {
      id: 'nepm', ch: 3, kind: 'design',
      name: '増やして床を沈める',
      desc: '条件固定: 波長 **900 nm**・η **0.9**・暗電流 **100 pA**・アンプ雑音 **100 fA/√Hz**・k **0.02**。M を使って NEP を **2.0×10⁻¹⁴ W/√Hz 以下**にする。',
      why: 'アンプの床 i_amp は M で割れる（NEP の式の (i_amp/M)²）。でも暗電流のショットには F(M) が掛かる ―'
         + '増やすほど良いわけではなく、**沈むのはアンプ律速のときだけ**。M=1 では 1.5×10⁻¹³、M を10〜150 に置くと届き、'
         + '上げすぎると F が伸びてまた外れる。APD 受信が光通信の定石になっている理由そのもの。',
      hint: 'M = 30〜100 あたり。M=1 と M=300 では届かないことも確かめる。',
      check: function (ev, d) {
        var lock = d.nm === 900 && near(d.eta, 0.9) && near(d.idpa, 100) && near(d.ifa, 100) && near(d.k, 0.02);
        return {
          ok: lock && ev.NEP <= 2e-14,
          rows: [
            row('NEP', ex(ev.NEP, 2) + ' W/√Hz', '2.0×10⁻¹⁴ 以下', ev.NEP <= 2e-14),
            row('M / F(M)', f(d.M, 0) + ' / ' + f(ev.F, 2), '', true),
            row('条件固定', lock ? '守っている' : '課題の条件（λ900・η0.9・100pA・100fA・k0.02）に戻す', 'M 以外は固定', lock)
          ]
        };
      }
    },
    {
      id: 'bg', ch: 3, kind: 'design',
      name: '背景光の中で',
      desc: '条件固定: 波長 **900 nm**・η **0.9**・信号 **1 nW（10⁻⁹）**・背景光 **1000 nW**・暗電流 **10 pA**・アンプ雑音 **100 fA/√Hz**・k **0.02**。帯域は **0.01 MHz（10 kHz）以上**残したまま、**SNR 10 以上**にする。',
      why: '背景光は信号の1000倍の電流を作り、そのショットノイズ √(2q·I_bg) が新しい床になる。'
         + 'この床は M では逃げられない ― 信号もノイズも M 倍で、F(M) のぶんむしろ損。'
         + '効くのは帯域: SNR は 1/√B なので、**帯域を絞る＝静けさを時間で買う**。第7部のロックインと同じ結論に、電流の側から着く課題。',
      hint: 'M は 1 のまま、帯域を 0.01〜0.019 MHz に。M=100 にすると F=3.95 で同じ帯域でも届かない。',
      check: function (ev, d) {
        var lock = d.nm === 900 && near(d.eta, 0.9) && d.pw === -9 && near(d.bgnw, 1000) && near(d.idpa, 10) && near(d.ifa, 100) && near(d.k, 0.02);
        return {
          ok: lock && d.bmhz >= 0.01 && ev.SNR >= 10,
          rows: [
            row('SNR', f(ev.SNR, 2), '10.00 以上', ev.SNR >= 10),
            row('帯域', f(d.bmhz * 1000, 1) + ' kHz', '10 kHz 以上は残す', d.bmhz >= 0.01),
            row('背景光の電流 / 信号', ex(ev.Ibg, 2) + ' / ' + ex(ev.Iph, 2) + ' A（M ' + f(d.M, 0) + '・F ' + f(ev.F, 2) + '）', '', true),
            row('条件固定', lock ? '守っている' : '課題の条件（λ900・η0.9・1nW・背景1000nW・10pA・100fA・k0.02）に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'count', ch: 3, kind: 'design',
      name: '数えて待つ',
      desc: '条件固定: 波長 **550 nm**・η（PDE）**0.5**・信号 **0.1 fW（10⁻¹⁶）**・ダークカウント **500 counts/s**・背景光 **0**。積分時間 **10 秒以内**で、計数の SNR を **10 以上**にする。',
      why: '0.1 fW は毎秒 277 光子 ― 電流にすると fA 以下でアンプに埋もれるが、**数えれば1個ずつ見える**。'
         + '計数の敵はポアソンの揺らぎ √(カウント数) とダークカウント。SNR = s·√t/√(s+b) なので、'
         + '**待てば √t で改善する**。s=138 c/s・b=500 c/s なら t ≥ 3.4 秒 ― 微弱光の測定が「待つ測定」になる理由。',
      hint: '積分時間を 4〜10 秒に。1 秒では 5.5 で届かない。',
      check: function (ev, d) {
        var lock = d.nm === 550 && near(d.eta, 0.5) && d.pw === -16 && near(d.dkcps, 500) && near(d.bgnw || 0, 0);
        return {
          ok: lock && d.tsec <= 10 && ev.snrCount >= 10,
          rows: [
            row('計数の SNR', f(ev.snrCount, 2), '10.00 以上', ev.snrCount >= 10),
            row('積分時間', f(d.tsec, 2) + ' s', '10 以内', d.tsec <= 10),
            row('信号 / 床', f(ev.cps, 0) + ' / ' + f(ev.bcps, 0) + ' counts/s', '', true),
            row('条件固定', lock ? '守っている' : '課題の条件（λ550・PDE0.5・10⁻¹⁶W・ダーク500・背景0）に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'transit', ch: 3, kind: 'design',
      name: '厚さの綱引き ― 走行と RC',
      desc: '受光径 **30 µm** のまま、空乏層の厚さで、走行と RC の合成帯域を **25 GHz 以上**にする（50Ω 受け・Si の v_sat = 10⁷ cm/s）。',
      why: '厚さ w は両側から引っぱられる ― 薄いと容量 C = εA/w が太って **RC が遅く**、'
         + '厚いと電子が走り切る時間 w/v_sat が伸びて **走行が遅い**（f_tr = 0.44·v_sat/w）。'
         + '合成 1/f² = 1/f_RC² + 1/f_tr² が最大になるのは2つが等しい w ≈ 1 µm ― 第5部07の「三すくみ」の2辺を自分で釣り合わせる課題。'
         + '（3辺目の QE も本当は w に依るが、この模型では独立 ― 薄くすると吸収が減る分は第2部の吸収長で読み替える。）',
      hint: 'w = 0.7〜1.7 µm の窓。w=3µm は走行 14.7 GHz が、w=0.5µm は RC 21.8 GHz が足を引く。',
      check: function (ev, d) {
        var lock = near(d.diamum, 30);
        return {
          ok: lock && ev.ftot >= 25e9,
          rows: [
            row('合成帯域', f(ev.ftot / 1e9, 1) + ' GHz', '25.0 以上', ev.ftot >= 25e9),
            row('走行 / RC', f(ev.ftr / 1e9, 1) + ' / ' + f(ev.fRCw / 1e9, 1) + ' GHz（C ' + f(ev.cw * 1e15, 1) + ' fF）', '', true),
            row('受光径', f(d.diamum, 0) + ' µm', '30 のまま', lock)
          ]
        };
      }
    },
    {
      id: 'pile', ch: 3, kind: 'design',
      name: 'TCSPC の繰り返しを選ぶ',
      desc: '条件固定: 波長 **550 nm**・PDE **0.5**・光 **1 pW（10⁻¹²）**（計数 1.38×10⁶ c/s）・測りたい寿命 **2 ns**。レーザーの繰り返しで、**パイルアップ確率 2% 以下**かつ**周期が寿命の5倍以上**を両立する。',
      why: 'TCSPC は1周期に最初の1個しか測れない ― 2個来る周期があると**早い光子だけが選ばれて、減衰が速い側に歪む**（パイルアップ）。'
         + 'だから検出率は繰り返しの数%以下に抑える。かといって繰り返しを遅くしすぎると今度は計数が貯まらない ― この課題では逆で、'
         + '**上げすぎると前のパルスの減衰の尻尾を踏む**（周期 ≥ 5τ の定石）。80 MHz 級のレーザーが蛍光寿命測定の定番なのは、この窓のど真ん中だから。',
      hint: '繰り返し 70〜100 MHz。50 MHz は p=2.8% で歪み、120 MHz は周期 8.3 ns < 10 ns で尻尾を踏む。',
      check: function (ev, d) {
        var lock = d.nm === 550 && near(d.eta, 0.5) && d.pw === -12 && near(d.taufl, 2);
        return {
          ok: lock && ev.pileP <= 0.02 && ev.tauMaxNs >= d.taufl,
          rows: [
            row('パイルアップ確率', f(ev.pileP * 100, 2) + ' %（' + ex(ev.cps, 2) + ' c/s ÷ ' + f(d.freps, 0) + ' MHz）', '2.00 以下', ev.pileP <= 0.02),
            row('周期 / 測れる寿命', f(ev.perNs, 1) + ' ns / 〜' + f(ev.tauMaxNs, 1) + ' ns', '寿命 2 ns 以上', ev.tauMaxNs >= d.taufl),
            row('条件固定', lock ? '守っている（λ550・PDE0.5・1pW・寿命2ns）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    }
  ];

  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function chapterOf(q) { for (var i = 0; i < CH.length; i++) if (CH[i].id === q.ch) return CH[i]; return null; }

  /** 採点する。st = { design } */
  function grade(id, st) {
    var q = byId(id);
    if (!q) return { ok: false, rows: [], error: '課題が見つかりません' };
    try {
      var r = q.check(PHO.evaluate(st.design), st.design);
      r.quest = q;
      return r;
    } catch (e) {
      return { ok: false, quest: q, rows: [row('採点できませんでした', String(e && e.message || e), '', false)] };
    }
  }

  PH.quest = { LIST: LIST, CH: CH, byId: byId, chapterOf: chapterOf, grade: grade };
})(typeof window !== 'undefined' ? window : globalThis);
