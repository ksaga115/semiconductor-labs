/* 課題と採点 ― すべて design 型。条件で固定する欄は check がその値かどうかも見る */
(function (global) {
  'use strict';
  var LS = global.LS || (global.LS = {});
  var M = LS.laser;

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }
  function f(v, d) { return (+v).toFixed(d === undefined ? 2 : d); }
  function near(a, b) { return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12; }

  var CH = [
    { id: 1, name: '第1章　光をつくる', lead: '温度で決まる熱の光と、効率を掛け算で読む LED。第9部 01・03。' },
    { id: 2, name: '第2章　レーザーの芯', lead: 'しきい値の利得・スロープ効率・特性温度。鏡と長さと温度で決まる。第9部 04・05。' },
    { id: 3, name: '第3章　モードとパルス', lead: '縦モードの間隔、DFB の温度合わせ、モード同期の繰り返しと尖頭値。第9部 06・07・09。' }
  ];

  var LIST = [
    /* ===== 第1章 ===== */
    {
      id: 'wien', ch: 1, kind: 'design',
      name: 'ハロゲンランプの温度を選ぶ',
      desc: '黒体の温度で、出す光のうち可視（400〜700 nm）を **10% 以上**にする。ただしフィラメントの寿命のため **3,400 K 以下**。',
      why: '熱の光の山は 2898 µm·K / T で、温度を上げると短い側へ動き、可視の割合が増える（第9部 01）。'
         + '2,856 K（電球）では 6.5% しかなく、ほとんどが赤外。温度を上げれば明るくなるが、タングステンの蒸発が速まり寿命が縮む ― '
         + '<b>ハロゲンランプは、この窓の中で使われている</b>。',
      hint: '10% になるのは約 3,160 K。窓は 3,160〜3,400 K。3,200 K で 10.5%。',
      check: function (ev, d) {
        var okV = ev.vis >= 0.10, okT = d.tk <= 3400;
        return {
          ok: okV && okT,
          rows: [
            row('可視の割合', f(ev.vis * 100, 2) + ' %（山 ' + f(ev.lamMaxUm, 3) + ' µm）', '10.00 以上', okV),
            row('温度', f(d.tk, 0) + ' K', '3,400 以下', okT)
          ]
        };
      }
    },
    {
      id: 'led', ch: 1, kind: 'design',
      name: '青色 LED の効率を掛け算で上げる',
      desc: '**450 nm・順電圧 3.0 V** のまま、注入効率（**0.98 まで**）・内部量子効率（**0.90 まで**）・取り出し効率（**0.85 まで**）で、電力の変換効率を **45% 以上**にする。',
      why: 'LED の外部量子効率は、注入 × 内部量子効率 × 取り出しの<b>掛け算</b>で、電力の効率はさらに hν/(qV) を掛ける（第9部 03）。'
         + '掛け算なので、いちばん小さい項（ふつうは取り出し ― 平らな面からは 2% しか出られない、第5部 08）を上げるのが最も効く。'
         + '残りは熱になり、その熱が LED 自身の効率と寿命を下げる。',
      hint: 'hν/qV = 2.755/3.0 = 0.918。0.95 × 0.85 × 0.65 × 0.918 = 48%。',
      check: function (ev, d) {
        var lock = near(d.lednm, 450) && near(d.vf, 3.0);
        var lim = d.etainj <= 0.98 && d.iqe <= 0.9 && d.extr <= 0.85;
        return {
          ok: lock && lim && ev.wpe >= 0.45,
          rows: [
            row('電力の変換効率', f(ev.wpe * 100, 1) + ' %（EQE ' + f(ev.eqe * 100, 1) + ' %）', '45.0 以上', ev.wpe >= 0.45),
            row('熱になる割合', f((1 - ev.wpe) * 100, 1) + ' %', '', true),
            row('注入 / IQE / 取り出し', f(d.etainj, 2) + ' / ' + f(d.iqe, 2) + ' / ' + f(d.extr, 2), '0.98・0.90・0.85 まで', lim),
            row('条件固定', lock ? '守っている（450 nm・3.0 V）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },

    /* ===== 第2章 ===== */
    {
      id: 'thresh', ch: 2, kind: 'design',
      name: '後ろの鏡でしきい値を下げる',
      desc: '長さ **300 µm**・前の端面 **R₁ = 0.31**（へき開面）・内部の損失 **10 cm⁻¹** のまま、後ろの端面の反射率で、しきい値の利得を **35 cm⁻¹ 以下**にし、前から出る光を **90% 以上**にする（反射膜は **0.99 まで**）。',
      why: 'しきい値の利得は Γg<sub>th</sub> = α<sub>i</sub> + ln(1/R₁R₂)/(2L)（第9部 04）。後ろを高反射にすると、鏡の損失が減ってしきい値が下がり、'
         + '光は反射率の低い前から主に出る ― 実際の LD の端面に、前は低反射・後ろは高反射の膜を付ける理由。',
      hint: 'しきい値 ≤ 35 は R₂ ≥ 0.72、前 ≥ 90% は R₂ ≥ 0.87。R₂ = 0.95 で 30.4 cm⁻¹・96%。',
      check: function (ev, d) {
        var lock = near(d.lum, 300) && near(d.r1, 0.31) && near(d.ai, 10);
        var okG = ev.gth <= 35, okF = ev.front >= 0.9, lim = d.r2 <= 0.99;
        return {
          ok: lock && okG && okF && lim,
          rows: [
            row('しきい値の利得', f(ev.gth, 1) + ' cm⁻¹（鏡の損失 ' + f(ev.am, 1) + '）', '35.0 以下', okG),
            row('前から出る割合', f(ev.front * 100, 1) + ' %', '90.0 以上', okF),
            row('後ろの反射率', f(d.r2, 3), '0.99 まで', lim),
            row('条件固定', lock ? '守っている（300 µm・R₁ 0.31・10 cm⁻¹）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'slope', ch: 2, kind: 'design',
      name: '長さでスロープ効率を上げる',
      desc: '両端 **R = 0.31**・内部の損失 **10 cm⁻¹**・注入効率 **0.9**・**850 nm** のまま、共振器の長さで、スロープ効率（両端面の合計）を **1.0 W/A 以上**にし、しきい値の利得を **60 cm⁻¹ 以下**に抑える。',
      why: '短い共振器ほど鏡の損失（＝外に出る光）の割合が増え、微分量子効率 η<sub>i</sub>α<sub>m</sub>/(α<sub>i</sub>+α<sub>m</sub>) が上がる（第9部 05）。'
         + 'だが短すぎると、しきい値の利得が上がって、発振させるのに強い注入が要る ― <b>窓は両側から閉じる</b>。',
      hint: 'スロープ ≥ 1.0 は L ≤ 366 µm、しきい値 ≤ 60 は L ≥ 234 µm。300 µm で 1.05 W/A・49 cm⁻¹。',
      check: function (ev, d) {
        var lock = near(d.r1, 0.31) && near(d.r2, 0.31) && near(d.ai, 10) && near(d.etai, 0.9) && near(d.lasnm, 850);
        var okS = ev.slope >= 1.0, okG = ev.gth <= 60;
        return {
          ok: lock && okS && okG,
          rows: [
            row('スロープ効率', f(ev.slope, 3) + ' W/A（η_d ' + f(ev.etad, 3) + '）', '1.000 以上', okS),
            row('しきい値の利得', f(ev.gth, 1) + ' cm⁻¹', '60.0 以下', okG),
            row('長さ', f(d.lum, 0) + ' µm', '', true),
            row('条件固定', lock ? '守っている（R 0.31・10 cm⁻¹・η_i 0.9・850 nm）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 't0', ch: 2, kind: 'design',
      name: '85 ℃ で 20 mW 出す',
      desc: '300 µm・R 0.31・10 cm⁻¹・η_i 0.9・850 nm の LD（25 ℃ のしきい値 **10 mA**・**T₀ = 60 K**）を **85 ℃** で動かし、駆動の電流（**50 mA まで**）で出力を **20 mW 以上**にする。',
      why: 'しきい値は温度で指数関数的に上がる: I<sub>th</sub> ∝ exp(T/T₀)（第9部 05）。T₀ = 60 K なら 25 ℃ → 85 ℃ で 2.7 倍。'
         + '出力を保つには電流を増やすしかないが、電流は発熱と劣化で上限がある ― <b>T₀ が小さい LD に TEC が要る理由</b>（第8部 05）。',
      hint: '85 ℃ のしきい値 27.2 mA、スロープ 1.045 W/A。20 mW には 46.3 mA。窓は 46.3〜50 mA。',
      check: function (ev, d) {
        var lock = near(d.lum, 300) && near(d.r1, 0.31) && near(d.r2, 0.31) && near(d.ai, 10) && near(d.etai, 0.9)
          && near(d.lasnm, 850) && near(d.ith25, 10) && near(d.t0, 60) && near(d.tempc, 85);
        var okP = ev.pmw >= 20, okI = d.iop <= 50;
        return {
          ok: lock && okP && okI,
          rows: [
            row('85 ℃ の出力', f(ev.pmw, 2) + ' mW（しきい値 ' + f(ev.ith, 2) + ' mA）', '20.00 以上', okP),
            row('駆動の電流', f(d.iop, 1) + ' mA', '50.0 以下', okI),
            row('条件固定', lock ? '守っている（85 ℃・T₀ 60 K・しきい値 10 mA @25 ℃）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },

    /* ===== 第3章 ===== */
    {
      id: 'fsr', ch: 3, kind: 'design',
      name: '縦モードの間隔を広げる',
      desc: '**1550 nm・n_g = 3.6**・両端 **R 0.31**・内部の損失 **10 cm⁻¹** のまま、共振器の長さで縦モードの間隔を **1.5 nm 以上**にし、しきい値の利得を **70 cm⁻¹ 以下**に抑える。',
      why: '縦モードの間隔 λ²/(2n<sub>g</sub>L) は短い共振器ほど広い（第9部 06）。間隔が広いほど利得の山の下に入る歯が減り、'
         + '温度で波長が跳ぶ（モードホップ）間隔も広がる。だが短すぎると鏡の損失が増えてしきい値が上がる ― ここでも窓。',
      hint: '間隔 ≥ 1.5 nm は L ≤ 222 µm、しきい値 ≤ 70 は L ≥ 195 µm。',
      check: function (ev, d) {
        var lock = near(d.lasnm, 1550) && near(d.ng, 3.6) && near(d.r1, 0.31) && near(d.r2, 0.31) && near(d.ai, 10);
        var okF = ev.fsrNm >= 1.5, okG = ev.gth <= 70;
        return {
          ok: lock && okF && okG,
          rows: [
            row('縦モードの間隔', f(ev.fsrNm, 3) + ' nm', '1.500 以上', okF),
            row('しきい値の利得', f(ev.gth, 1) + ' cm⁻¹', '70.0 以下', okG),
            row('条件固定', lock ? '守っている（1550 nm・n_g 3.6・R 0.31・10 cm⁻¹）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'dfb', ch: 3, kind: 'design',
      name: 'DFB を温度で狙いの波長に合わせる',
      desc: '格子の周期 **242.0 nm**・実効屈折率 **3.2**・温度係数 **0.1 nm/K** の DFB を、動作温度で **1550.12 ± 0.02 nm** に合わせる（TEC の範囲 **15〜70 ℃**）。',
      why: 'DFB の発振はブラッグ波長 λ<sub>B</sub> = 2n<sub>eff</sub>Λ で決まり（第9部 07）、格子の周期は作ったあとで変えられない。'
         + '波長を合わせる手段は温度で、屈折率の温度変化で約 0.1 nm/K 動く。<b>温度を決めることが、波長を決めること</b> ― '
         + '±0.02 nm は ±0.2 K で、光通信の波長の格子に合わせる精度です。',
      hint: '25 ℃ で 2 × 3.2 × 242 = 1548.8 nm。あと 1.32 nm → 13.2 K 上げて 38.2 ℃。',
      check: function (ev, d) {
        var lock = near(d.pitchnm, 242) && near(d.neff, 3.2) && near(d.dldt, 0.1);
        var okL = Math.abs(ev.lamT - 1550.12) <= 0.02 + 1e-9, lim = d.tempc >= 15 && d.tempc <= 70;
        return {
          ok: lock && okL && lim,
          rows: [
            row('発振の波長', f(ev.lamT, 3) + ' nm（25 ℃ で ' + f(ev.lamB, 2) + ' nm）', '1550.120 ± 0.020', okL),
            row('動作温度', f(d.tempc, 2) + ' ℃', '15〜70', lim),
            row('条件固定', lock ? '守っている（242.0 nm・3.2・0.1 nm/K）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'mlock', ch: 3, kind: 'design',
      name: '80 MHz・100 fs のモード同期',
      desc: '中心 **800 nm** のまま、共振器の長さで繰り返しを **80 ± 1 MHz** にし、スペクトルの幅でガウス形の最短のパルスを **100 fs 以下**にする。',
      why: 'モード同期のパルスは共振器を 1 往復するごとに出る: f = c/(2L)（第9部 09）。80 MHz は TCSPC の定番（第5部 06）。'
         + 'パルスの短さはスペクトルの幅で決まり、時間帯域積 Δν·Δt ≥ 0.441（ガウス形）― <b>短いパルスには広いスペクトルが要る</b>。',
      hint: 'L = c/(2 × 80 MHz) = 1.874 m（窓 1.851〜1.897 m）。100 fs には Δλ ≥ 9.42 nm。',
      check: function (ev, d) {
        var lock = near(d.mlnm, 800);
        var okF = ev.frep >= 79e6 && ev.frep <= 81e6, okT = ev.tauFs <= 100;
        return {
          ok: lock && okF && okT,
          rows: [
            row('繰り返し', f(ev.frep / 1e6, 2) + ' MHz', '79〜81', okF),
            row('最短のパルス', f(ev.tauFs, 1) + ' fs（Δλ ' + f(d.dlnm, 2) + ' nm）', '100.0 以下', okT),
            row('条件固定', lock ? '守っている（800 nm）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'peak', ch: 3, kind: 'design',
      name: '尖頭値 100 kW・パルス 20 nJ 以下',
      desc: '共振器 **1.874 m**（80 MHz）・スペクトルの幅 **10 nm**（94 fs）・**800 nm** のまま、平均の出力で尖頭値を **100 kW 以上**にし、パルス 1 個のエネルギーを **20 nJ 以下**（光学系の損傷の上限）に抑える。',
      why: '平均が小さくても、尖頭値は E/Δt で桁違いに大きい（第9部 09）: 1 W・80 MHz・100 fs で約 120 kW。'
         + 'この強さで多光子吸収や SHG（第9部 10）が起きる。だがパルスのエネルギーが大きすぎると、ミラーや試料が壊れる ― 窓。',
      hint: 'E = P/80 MHz。尖頭値 0.94E/94 fs ≥ 100 kW は P ≥ 0.80 W、E ≤ 20 nJ は P ≤ 1.6 W。',
      check: function (ev, d) {
        var lock = near(d.lcavm, 1.874) && near(d.dlnm, 10) && near(d.mlnm, 800);
        var okP = ev.ppeakKw >= 100, okE = ev.epNj <= 20;
        return {
          ok: lock && okP && okE,
          rows: [
            row('尖頭値', f(ev.ppeakKw, 1) + ' kW', '100.0 以上', okP),
            row('パルス 1 個のエネルギー', f(ev.epNj, 2) + ' nJ', '20.00 以下', okE),
            row('平均の出力', f(d.pavg, 3) + ' W', '', true),
            row('条件固定', lock ? '守っている（1.874 m・10 nm・800 nm）' : '課題の条件に戻す', '', lock)
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

  LS.quest = { LIST: LIST, CH: CH, byId: byId, chapterOf: chapterOf, grade: grade };
})(typeof window !== 'undefined' ? window : globalThis);
