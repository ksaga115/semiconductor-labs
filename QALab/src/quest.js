/* 課題と採点 ― すべて design 型。条件で固定する欄は check がその値かどうかも見る */
(function (global) {
  'use strict';
  var QA = global.QA || (global.QA = {});
  var M = QA.qa;

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }
  function f(v, d) { return (+v).toFixed(d === undefined ? 2 : d); }
  function near(a, b) { return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12; }

  var CH = [
    { id: 1, name: '第1章　寿命を数える', lead: 'FIT・MTTF・加速試験・ワイブル。保証の言葉を式にする。' },
    { id: 2, name: '第2章　熱を設計する', lead: '熱抵抗の直列と Tj、TEC の冷却の請求書。温度は寿命の為替レート。' },
    { id: 3, name: '第3章　ばらつきを管理する', lead: 'σ・Cpk・ppm・誤差伝播。製造と測定の共通言語。' }
  ];

  var LIST = [
    /* ===== 第1章 ===== */
    {
      id: 'mttf', ch: 1, kind: 'design',
      name: '系の MTTF を 20 年に',
      desc: '部品 **100 個直列**のまま、部品1個の故障率で系の MTTF を **20 年以上**にする。',
      why: '偶発故障期の故障率は足し算 ― 直列 100 個なら系の λ は 100 倍で、MTTF = 10⁹/λ[FIT] 時間。'
         + '**部品に許される FIT は、系の目標から逆算で降ってくる**。カタログの FIT の行が売り買いの言葉になる理由。',
      hint: 'MTTF ≥ 20年 = 175,200 h → 系は 5,707 FIT 以下 → 1個あたり 57 FIT 以下。',
      check: function (ev, d) {
        return {
          ok: d.nser === 100 && ev.mttfY >= 20,
          rows: [
            row('系の MTTF', f(ev.mttfY, 1) + ' 年（' + f(ev.mttfH / 1000, 0) + ' kh）', '20.0 以上', ev.mttfY >= 20),
            row('部品の FIT / 系の FIT', f(d.fitr, 0) + ' / ' + f(ev.lamFit, 0), '', true),
            row('直列数', f(d.nser, 0) + ' 個', '100 のまま', d.nser === 100)
          ]
        };
      }
    },
    {
      id: 'series', ch: 1, kind: 'design',
      name: '部品を減らして稼ぐ',
      desc: '部品の故障率 **50 FIT** のまま、直列数で系の MTTF を **40 年以上**にする。',
      why: '同じ信頼性目標でも、効かせ方は2つ ― 部品を良くするか、数を減らすか。'
         + '集積化（第1部・第3部）が信頼性の話でもあるのはこのため: **1チップに入れば直列数が桁で減る**。',
      hint: '40年 = 350,400 h → 系は 2,854 FIT 以下 → 50 FIT なら 57 個以下。',
      check: function (ev, d) {
        return {
          ok: near(d.fitr, 50) && ev.mttfY >= 40,
          rows: [
            row('系の MTTF', f(ev.mttfY, 1) + ' 年', '40.0 以上', ev.mttfY >= 40),
            row('直列数', f(d.nser, 0) + ' 個', '57 以下が目安', d.nser <= 57),
            row('部品の FIT', f(d.fitr, 0), '50 のまま', near(d.fitr, 50))
          ]
        };
      }
    },
    {
      id: 'accel', ch: 1, kind: 'design',
      name: '10 年を 500 時間で実証する',
      desc: 'Ea **0.7 eV**・使用 **55 ℃**・寿命 **10 年**のまま、試験温度で必要な試験時間を **500 時間以下**にする。',
      why: 'アレニウスの加速係数 AF = exp(Ea/k·(1/Tu − 1/Ts))。0.7 eV・55→125℃ で 78 倍 ―'
         + 'それでも 10 年は 1,123 時間かかる。**150℃ なら 260 倍・337 時間**。'
         + '加速試験の温度は「間に合わせたい時間」からの逆算で、上限は別の故障モードが顔を出す温度。',
      hint: '125℃ では足りない。150℃（AF≒260）まで上げる。',
      check: function (ev, d) {
        var lock = near(d.ea, 0.7) && d.tuse === 55 && d.lifey === 10;
        return {
          ok: lock && ev.testH <= 500,
          rows: [
            row('必要な試験時間', f(ev.testH, 0) + ' h（AF ' + f(ev.af, 0) + '）', '500 以下', ev.testH <= 500),
            row('試験温度', f(d.tstr, 0) + ' ℃', '141 以上が目安', d.tstr >= 140.5),
            row('条件固定', lock ? '守っている（0.7eV・55℃・10年）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'weib', ch: 1, kind: 'design',
      name: 'B10 寿命を 5,000 時間に',
      desc: '摩耗故障（形状 **m = 2**）で、尺度 η により **B10（10% が壊れる時間）を 5,000 h 以上**にする。',
      why: 'ワイブルの B10 = η·(−ln 0.9)^(1/m)。m は故障の「性格」― <1 なら初期不良、'
         + '≈1 なら偶発、>1 なら摩耗。**同じ η でも m が違えば B10 は桁で違う**ので、'
         + '寿命試験の一番の収穫は平均値ではなく m。プロットの傾きが原因を語る。',
      hint: 'm=2 では (−ln0.9)^0.5 = 0.325。η ≥ 5000/0.325 ≒ 15,400 h。',
      check: function (ev, d) {
        return {
          ok: near(d.mweib, 2) && ev.b10H >= 5000,
          rows: [
            row('B10', f(ev.b10H, 0) + ' h', '5,000 以上', ev.b10H >= 5000),
            row('η（63.2% 寿命）', f(d.etah, 0) + ' h', '15,400 以上が目安', d.etah >= 15400),
            row('形状 m', f(d.mweib, 1), '2 のまま（摩耗）', near(d.mweib, 2))
          ]
        };
      }
    },
    {
      id: 'peck', ch: 1, kind: 'design',
      name: '湿気の 10 年を 1,000 時間で',
      desc: '使用 **40 ℃・60 %RH**・寿命 **10 年**・Peck の **n=3・Ea 0.79 eV** のまま、槽の上限 **85 ℃・85 %RH** 以内で、必要な試験時間を **1,000 時間以下**にする。',
      why: '湿気の故障（腐食・マイグレーション）の加速は Peck の式: **AF = (RH比)ⁿ × アレニウス**。'
         + '85℃/85%RH は温度で 40 倍・湿度で 2.8 倍、合わせて **AF ≈ 113** ― 10 年が 778 時間で済む。'
         + '「85/85 を 1,000 時間」という業界の定番が“だいたい 10 年の湿気保証”と言われる出自が、この掛け算そのもの。',
      hint: '85℃・85%RH で 778 h。湿度を 78%RH まで下げると 1,000 h を超える。',
      check: function (ev, d) {
        var lock = d.thu === 40 && near(d.rhu, 60) && d.lifey === 10 && near(d.npeck, 3) && near(d.eah, 0.79);
        var lim = d.ths <= 85 && d.rhs <= 85;
        return {
          ok: lock && lim && ev.testHh <= 1000,
          rows: [
            row('必要な試験時間', f(ev.testHh, 0) + ' h（AF ' + f(ev.afh, 0) + '）', '1,000 以下', ev.testHh <= 1000),
            row('試験条件', f(d.ths, 0) + ' ℃ / ' + f(d.rhs, 0) + ' %RH', '85℃・85%RH 以内', lim),
            row('条件固定', lock ? '守っている（40℃60%・10年・n3・0.79eV）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'cm', ch: 1, kind: 'design',
      name: 'はんだの 10 年を 200 サイクルで',
      desc: '使用 **ΔT 30 K・1 回/日**・寿命 **10 年**・Coffin-Manson の **n=2** のまま、槽の上限 **ΔT 165 K**（−40〜125 ℃）以内で、必要な試験サイクルを **200 回以下**にする。',
      why: '温度サイクルの疲労（はんだ・ワイヤ）は回数で数える: 寿命サイクル数 ∝ ΔT⁻ⁿ なので'
         + '**AF = (ΔT試験/ΔT使用)ⁿ**。ΔT 165 K なら (165/30)² = 30 倍 ― 10 年ぶんの 3,650 回が 121 回で済む。'
         + '02 のアレニウス（時間の早送り）と違い、こちらは**回数の早送り** ― バスタブの右の壁（摩耗）を攻める試験。',
      hint: 'ΔT 165 K（−40〜125℃）で 121 回。ΔT 129 K を切ると 200 回を超える。',
      check: function (ev, d) {
        var lock = near(d.dtu, 30) && near(d.cyd, 1) && d.lifey === 10 && near(d.ncm, 2);
        return {
          ok: lock && d.dts <= 165 && ev.testCyc <= 200,
          rows: [
            row('必要なサイクル数', f(ev.testCyc, 0) + ' 回（AF ' + f(ev.afcm, 1) + '）', '200 以下', ev.testCyc <= 200),
            row('試験の ΔT', f(d.dts, 0) + ' K', '165 以内（−40〜125℃）', d.dts <= 165),
            row('条件固定', lock ? '守っている（ΔT30・1回/日・10年・n2）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },

    /* ===== 第2章 ===== */
    {
      id: 'theta', ch: 2, kind: 'design',
      name: 'Tj を 85 ℃ 以下に',
      desc: '発熱 **2 W**・周囲 **40 ℃**・θjc **1.5**・θcs **0.5** のまま、放熱器（θsa）で Tj を **85 ℃ 以下**にする。',
      why: '熱は電気とそっくりに流れる ― 温度差=電圧、熱流=電流、熱抵抗=抵抗。'
         + 'Tj = Tamb + P·(θjc+θcs+θsa) の直列和で、**設計者が選べるのはたいてい θsa（放熱器）だけ**。'
         + 'Tj は第8部02の為替レートで寿命に直結する ― 10℃ 下げれば寿命はおよそ2倍。',
      hint: '(85−40)/2 = 22.5 K/W が予算。θjc+θcs=2 を引いて θsa ≤ 20.5。',
      check: function (ev, d) {
        var lock = d.pwr === 2 && d.tamb === 40 && near(d.thjc, 1.5) && near(d.thcs, 0.5);
        return {
          ok: lock && ev.tj <= 85,
          rows: [
            row('ジャンクション温度', f(ev.tj, 1) + ' ℃', '85.0 以下', ev.tj <= 85),
            row('θ合計 / θsa', f(ev.thTot, 1) + ' / ' + f(d.thsa, 1) + ' K/W', 'θsa 20.5 以下が目安', d.thsa <= 20.5),
            row('条件固定', lock ? '守っている（2W・40℃・θjc1.5・θcs0.5）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'tec', ch: 2, kind: 'design',
      name: 'TEC の請求書を払う',
      desc: 'TEC（Qmax **5 W**・ΔTmax **70 K**）で熱負荷 **1.2 W** のまま、**ΔT 50 K 以上**を保って冷やす。',
      why: 'ペルチェの吸熱は ΔT と取り合い ― Qc ≒ Qmax·(1−ΔT/ΔTmax)。**深く冷やすほど吸える熱が減り**、'
         + 'ΔTmax では 0 W。第5部の「冷却の請求書」の支払い窓口がここで、'
         + '負荷（検出器の発熱＋侵入熱）が大きいと欲しい ΔT に届かない ― 断熱と負荷の見積もりが冷却設計の本体。',
      hint: 'ΔT=50 で Qc = 5×(20/70) = 1.43 W ≥ 1.2。ΔT=55 だと 1.07 W で負ける。',
      check: function (ev, d) {
        var lock = d.qmax === 5 && d.dtmax === 70 && near(d.qload, 1.2);
        return {
          ok: lock && d.dtc >= 50 && ev.tecOk,
          rows: [
            row('吸熱 Qc(ΔT)', f(ev.qc, 2) + ' W（負荷 ' + f(d.qload, 1) + ' W）', '負荷以上', ev.tecOk),
            row('温度差 ΔT', f(d.dtc, 0) + ' K', '50 以上', d.dtc >= 50),
            row('条件固定', lock ? '守っている（Qmax5・ΔTmax70・負荷1.2）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },

    /* ===== 第3章 ===== */
    {
      id: 'cpk', ch: 3, kind: 'design',
      name: 'Cpk 1.33 の工程',
      desc: '規格 **±0.3**・中心ずれ **0.05** のまま、σ で **Cpk 1.33 以上**にする。',
      why: 'Cpk = (規格片幅 − |ずれ|)/3σ。1.33 は「規格まで 4σ」で、正規なら不良は**両側で約 60 ppm**。'
         + '第1部の歩留まりが「面積×欠陥」の話なら、こちらは「規格×ばらつき」の話 ―'
         + '出荷の合否も、装置の管理図も、この1つの数字に畳まれて流通する。',
      hint: '(0.3−0.05)/3σ ≥ 1.33 → σ ≤ 0.0627。',
      check: function (ev, d) {
        var lock = near(d.tol, 0.3) && near(d.muoff, 0.05);
        return {
          ok: lock && ev.cpk >= 1.33,
          rows: [
            row('Cpk', f(ev.cpk, 3), '1.330 以上', ev.cpk >= 1.33),
            row('予想不良率', f(ev.ppm, 1) + ' ppm', '', true),
            row('σ / 条件', f(d.sigma, 4) + '（規格±0.3・ずれ0.05のまま）', '', lock)
          ]
        };
      }
    },
    {
      id: 'prop', ch: 3, kind: 'design',
      name: '誤差の合成を 0.51% に',
      desc: '誤差 A **0.3%** のまま、誤差 B を選んで合成誤差 √(A²+B²) を **0.51% 以下**にする。',
      why: '独立な誤差は2乗和の平方根で合成される ― 足し算ではない。'
         + '0.3% と 0.4% を合わせても 0.5% にしかならない一方、**大きい方の誤差がほぼ全部を決める**。'
         + '校正の予算配分（どの誤差から潰すか）はこの式で決まる。測定器のカタログの「確度」を読む式でもある。',
      hint: '√(0.09 + B²) ≤ 0.51 → B ≤ 0.41。',
      check: function (ev, d) {
        return {
          ok: near(d.s1, 0.3) && ev.stot <= 0.51,
          rows: [
            row('合成誤差', f(ev.stot, 3) + ' %', '0.510 以下', ev.stot <= 0.51),
            row('誤差 B', f(d.s2, 2) + ' %', '0.41 以下が目安', d.s2 <= 0.412),
            row('誤差 A', f(d.s1, 2) + ' %', '0.3 のまま', near(d.s1, 0.3))
          ]
        };
      }
    }
  ];

  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function chapterOf(q) { for (var i = 0; i < CH.length; i++) if (CH[i].id === q.ch) return CH[i]; return null; }

  function grade(id, st) {
    var q = byId(id);
    if (!q) return { ok: false, rows: [], error: '課題が見つかりません' };
    try {
      var r = q.check(M.evaluate(st.design), st.design);
      r.quest = q;
      return r;
    } catch (e) {
      return { ok: false, quest: q, rows: [row('採点できませんでした', String(e && e.message || e), '', false)] };
    }
  }

  QA.quest = { LIST: LIST, CH: CH, byId: byId, chapterOf: chapterOf, grade: grade };
})(typeof window !== 'undefined' ? window : globalThis);
