/* 課題と採点 ― すべて design 型
 *
 * 採点は analog.evaluate の値だけを見る。条件で固定する欄は check がその値かどうかも見る。
 * 数値の根拠は第6部（ラザビーの level 1 の式）そのもの。
 */
(function (global) {
  'use strict';
  var AN = global.AN || (global.AN = {});
  var A = AN.analog;

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }
  function f(v, d) { return (+v).toFixed(d === undefined ? 2 : d); }
  function near(a, b) { return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12; }

  var CH = [
    { id: 1, name: '第1章　バイアスを置く', lead: 'W/L と電流で Vov と gm が決まる。アナログ設計の九九。' },
    { id: 2, name: '第2章　一段で増やす', lead: '利得・帯域・スイングは同じ場所を取り合う。ラザビーの最初の山。' },
    { id: 3, name: '第3章　受光の後段', lead: 'TIA・チャージアンプ・差動対・低雑音。第5部の検出器がここに繋がる。' }
  ];

  var LIST = [
    /* ===== 第1章 ===== */
    {
      id: 'bias', ch: 1, kind: 'design',
      name: 'Vov を狙って置く',
      desc: 'ドレイン電流 **100 µA** のまま、W/L で **Vov = 0.20 V（±0.01）**に合わせる。',
      why: 'Vov = √(2Id/(µCox·W/L))。同じ電流でも太らせれば Vov は下がり、gm は上がる。'
         + 'Vov はスイングの下の壁でもあり gm/Id の逆数でもある ― アナログ設計はまず Vov をどこに置くかから始まる。',
      hint: 'W/L = 2·Id/(µCox·Vov²)。100µA・0.2V・µCox=200µA/V² を入れると 25。',
      check: function (ev, d) {
        return {
          ok: d.idua === 100 && Math.abs(ev.Vov - 0.2) <= 0.01,
          rows: [
            row('Vov', f(ev.Vov, 4) + ' V', '0.20 ± 0.01', Math.abs(ev.Vov - 0.2) <= 0.01),
            row('Id', f(d.idua, 0) + ' µA', '100 のまま', d.idua === 100),
            row('W/L / gm', f(d.wl, 1) + ' / ' + f(ev.gm * 1000, 3) + ' mS', '', true)
          ]
        };
      }
    },
    {
      id: 'eff', ch: 1, kind: 'design',
      name: '電力で gm を買う',
      desc: '電源 **1.8 V** のまま、gm **1.0 mS 以上**を消費電力 **0.20 mW 以下**で作る。',
      why: 'gm = 2Id/Vov なので、同じ gm でも Vov を下げれば電流は半分で済む ― gm/Id（= 2/Vov）が'
         + '「1µA あたり何 S 買えるか」の効率。低電力アナログは Vov を下げ、W/L を太らせる方向に寄る。',
      hint: 'P ≤ 0.2mW は Id ≤ 111µA。gm=1mS には Vov ≤ 2·Id/gm ≤ 0.22V ― W/L を 25 以上に。',
      check: function (ev, d) {
        return {
          ok: d.vdd === 1.8 && ev.gm >= 1e-3 && ev.p <= 0.2e-3,
          rows: [
            row('gm', f(ev.gm * 1000, 3) + ' mS', '1.000 以上', ev.gm >= 1e-3),
            row('消費電力', f(ev.p * 1000, 3) + ' mW', '0.200 以下', ev.p <= 0.2e-3),
            row('電源 / gm/Id', f(d.vdd, 1) + ' V / ' + f(ev.gmid, 1) + ' S/A', '1.8 のまま', d.vdd === 1.8)
          ]
        };
      }
    },

    /* ===== 第2章 ===== */
    {
      id: 'gain', ch: 2, kind: 'design',
      name: 'ソース接地で 10 倍',
      desc: '電源 **1.8 V** の抵抗負荷ソース接地で、|利得| **10 以上**。ただし出力の動作点は**下に 0.3 V・上に 0.3 V** の余裕を残す。',
      why: '|Av| = gm·(RD∥ro)、そして gm·RD = 2·(Id·RD)/Vov ― **利得は「RD に落とす電圧 ÷ Vov の半分」**。'
         + 'RD を上げると利得は伸びるが動作点が沈み、スイングが死ぬ。利得とスイングが同じ電圧予算を取り合う ―'
         + 'ラザビーの最初の教えがこの1問に入っている。',
      hint: 'Vov=0.2 なら Id·RD=1.2V で gm·RD=12。ro の分流で 1 割目減りする。動作点 = VDD − Id·RD。',
      check: function (ev, d) {
        var head = ev.headLo >= 0.3 && ev.headHi >= 0.3;
        return {
          ok: d.vdd === 1.8 && ev.avr >= 10 && head,
          rows: [
            row('|利得|', f(ev.avr, 2), '10.00 以上', ev.avr >= 10),
            row('動作点の余裕', '下 ' + f(ev.headLo, 2) + ' V / 上 ' + f(ev.headHi, 2) + ' V', 'それぞれ 0.30 以上', head),
            row('gm·RD と ro の壁', f(ev.gm * d.rdk * 1e3, 1) + ' → ro∥ で ' + f(ev.avr, 1) + '（ro=' + f(ev.ro / 1000, 0) + 'kΩ）', '', true)
          ]
        };
      }
    },
    {
      id: 'gbw', ch: 2, kind: 'design',
      name: 'GBW を電力で買う',
      desc: '負荷容量 **1 pF** のまま、GBW（= gm/2πCL）**500 MHz 以上**を電力 **0.5 mW 以下**（電源 1.8 V）で。',
      why: 'GBW は gm で買い、gm は電流で買う。ただし W/L を固定すると gm ∝ √Id なので、'
         + '**電力を4倍にしても帯域は2倍にしかならない**（真ん中の右の図の傾き 1/2）。'
         + '効率よく届くには Vov を下げる（W/L を太らせる）しかない ― 高速と低電力の綱引きの正体。',
      hint: 'gm ≥ 2π·500MHz·1pF = 3.14mS。P≤0.5mW は Id≤278µA → Vov = 2Id/gm ≤ 0.177V。W/L 100 前後。',
      check: function (ev, d) {
        return {
          ok: d.clpf === 1 && d.vdd === 1.8 && ev.gbw >= 5e8 && ev.p <= 0.5e-3,
          rows: [
            row('GBW', f(ev.gbw / 1e6, 0) + ' MHz', '500 以上', ev.gbw >= 5e8),
            row('消費電力', f(ev.p * 1000, 3) + ' mW', '0.500 以下', ev.p <= 0.5e-3),
            row('CL / gm / Vov', f(d.clpf, 1) + ' pF / ' + f(ev.gm * 1000, 2) + ' mS / ' + f(ev.Vov, 3) + ' V', 'CL は 1 のまま', d.clpf === 1)
          ]
        };
      }
    },
    {
      id: 'gain2', ch: 2, kind: 'design',
      name: 'ro の壁 ― 素の利得 100',
      desc: 'λ **0.1 /V** のまま、電流源負荷の利得の上限 gm·ro を **100 以上**にする。',
      why: 'RD を無限に上げても利得は gm·ro = **2/(λ·Vov)** で頭打ちになる ― これがトランジスタ1個の「素の利得」。'
         + '式に W/L も Id も残らないのが肝で、**効くのは Vov（下げる）と λ（＝チャネル長。長くする）だけ**。'
         + '微細化で λ が伸びて素の利得が痩せたことが、カスコードや多段が要る理由（第6部 03・06）。',
      hint: '2/(0.1×Vov) ≥ 100 は Vov ≤ 0.2V。W/L を太らせて Vov を下げる。',
      check: function (ev, d) {
        return {
          ok: near(d.lam, 0.1) && ev.avint >= 100,
          rows: [
            row('gm·ro', f(ev.avint, 1), '100.0 以上', ev.avint >= 100),
            row('λ', f(d.lam, 2) + ' /V', '0.10 のまま', near(d.lam, 0.1)),
            row('Vov（2/(λ·Vov) の検算）', f(ev.Vov, 3) + ' V → ' + f(2 / (d.lam * ev.Vov), 1), '', true)
          ]
        };
      }
    },

    /* ===== 第3章 ===== */
    {
      id: 'tia', ch: 3, kind: 'design',
      name: 'TIA の Rf を選ぶ',
      desc: 'PD の容量 **2 pF** のまま、帯域 1/(2πRfC) **8 MHz 以上**かつ Rf の雑音電流 √(4kT/Rf) **1.5 pA/√Hz 以下**。',
      why: 'Rf を大きくすると利得が上がり**雑音は下がる**のに、帯域が下がる ― 第5部 07 の綱引きを数字で踏む。'
         + '両立する Rf の窓は 7.4〜10 kΩ しかない。実機がループゲインで帯域を稼ぐ（TIA の本当の御利益）のは、'
         + 'この窓が狭すぎるから ― その拡張は第6部 05 の帰還の話。',
      hint: '帯域は Rf ≤ 1/(2π·8MHz·2pF) ≒ 10kΩ。雑音は Rf ≥ 4kT/(1.5pA)² ≒ 7.4kΩ。間を選ぶ。',
      check: function (ev, d) {
        return {
          ok: d.cpdpf === 2 && ev.btia >= 8e6 && ev.irf <= 1.5e-12,
          rows: [
            row('帯域', f(ev.btia / 1e6, 2) + ' MHz', '8.00 以上', ev.btia >= 8e6),
            row('Rf の雑音電流', f(ev.irf * 1e12, 2) + ' pA/√Hz', '1.50 以下', ev.irf <= 1.5e-12),
            row('Rf / PD 容量', f(d.rfk, 1) + ' kΩ / ' + f(d.cpdpf, 1) + ' pF', 'PD 容量は 2 のまま', d.cpdpf === 2)
          ]
        };
      }
    },
    {
      id: 'charge', ch: 3, kind: 'design',
      name: 'チャージアンプ ― 電荷を電圧に',
      desc: '入力電荷 **1000 e−** のまま、出力 Q/Cf を **50 mV 以上**、かつ Cf の kTC 雑音を **25 e− 以下**にする。',
      why: '放射線計測の入口の回路。出力は Q/Cf ― **PixelLab の変換ゲイン q/C_FD とまったく同じ算数**で、'
         + 'Cf を小さくするほど 1 電荷が大きな電圧になる。しかもリセット雑音 √(kTC)/q は **C が小さいほど電子数で小さい**'
         + '（第4部 05 の「ねじれ」と同じ）。小さい Cf は両得 ― 代償は帰還が浅くなること（実機の設計の話）。',
      hint: 'Cf ≤ Q/V = 1000×1.6×10⁻¹⁹/50mV = 3.2 fF。kTC はそのとき 23 e− で自動的に満ちる。',
      check: function (ev, d) {
        return {
          ok: d.qe === 1000 && ev.vq >= 0.05 && ev.ktc <= 25,
          rows: [
            row('出力 Q/Cf', f(ev.vq * 1000, 1) + ' mV', '50.0 以上', ev.vq >= 0.05),
            row('kTC 雑音', f(ev.ktc, 1) + ' e−', '25.0 以下', ev.ktc <= 25),
            row('Cf / 入力電荷', f(d.cffF, 1) + ' fF / ' + f(d.qe, 0) + ' e−', '電荷は 1000 のまま', d.qe === 1000)
          ]
        };
      }
    },
    {
      id: 'diff', ch: 3, kind: 'design',
      name: '差動対で 20 倍',
      desc: '抵抗負荷の差動対（欄の Id は**片側の電流**）で、差動利得 gm·RD **20 以上**。出力の動作点は下に **0.2 V** 残す。',
      why: '第4部「列の回路」の差動対の中身。差動利得は片側のソース接地と同じ gm·RD ― 差動にしても利得はタダでは増えない。'
         + '増えるのは**同相を捨てる力**で、電源の揺れや基板ノイズが2本の線から同じだけ引き算で消える。'
         + 'テール電流が2倍の電力を食うのは、その保険料。',
      hint: 'gm·RD ≥ 20 は Id·RD ≥ 10·Vov。Vov 0.12V 級まで太らせて、動作点 VDD−Id·RD を睨みながら RD を選ぶ。',
      check: function (ev, d) {
        return {
          ok: ev.adm >= 20 && ev.headLo >= 0.2,
          rows: [
            row('差動利得 gm·RD', f(ev.adm, 2), '20.00 以上', ev.adm >= 20),
            row('動作点の余裕（下）', f(ev.headLo, 2) + ' V', '0.20 以上', ev.headLo >= 0.2),
            row('片側 Id / RD / Vov', f(d.idua, 0) + ' µA / ' + f(d.rdk, 1) + ' kΩ / ' + f(ev.Vov, 3) + ' V', '', true)
          ]
        };
      }
    },
    {
      id: 'lownoise', ch: 3, kind: 'design',
      name: '2 nV/√Hz の初段',
      desc: '入力換算の熱雑音 √(4kTγ/gm) を **2.0 nV/√Hz 以下**に。電力は **1.0 mW 以下**（電源 1.8 V）。',
      why: '低雑音アンプの床は初段の gm が決める ― 雑音を半分にするには gm が4倍、真面目に払うと電流も4倍。'
         + '第5部 04 の NEP の「アンプ雑音」の中身がこれで、**検出器の床は結局ここまで降りてくる**。'
         + 'gm/Id を効かせて（W/L を太らせて）電流を節約するのが定石。',
      hint: 'gm ≥ 4kTγ/(2nV)² ≒ 2.8 mS。Id 400µA・W/L 200 なら Vov 0.14V で gm 5.7mS。',
      check: function (ev, d) {
        return {
          ok: d.vdd === 1.8 && ev.vnmos <= 2e-9 && ev.p <= 1e-3,
          rows: [
            row('入力換算雑音', f(ev.vnmos * 1e9, 2) + ' nV/√Hz', '2.00 以下', ev.vnmos <= 2e-9),
            row('消費電力', f(ev.p * 1000, 2) + ' mW', '1.00 以下', ev.p <= 1e-3),
            row('gm / Vov', f(ev.gm * 1000, 2) + ' mS / ' + f(ev.Vov, 3) + ' V', '', true)
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
      var r = q.check(A.evaluate(st.design), st.design);
      r.quest = q;
      return r;
    } catch (e) {
      return { ok: false, quest: q, rows: [row('採点できませんでした', String(e && e.message || e), '', false)] };
    }
  }

  AN.quest = { LIST: LIST, CH: CH, byId: byId, chapterOf: chapterOf, grade: grade };
})(typeof window !== 'undefined' ? window : globalThis);
