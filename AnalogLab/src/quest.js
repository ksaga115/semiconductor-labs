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
    { id: 3, name: '第3章　受光の後段', lead: 'TIA・チャージアンプ・差動対・低雑音。第5部の検出器がここに繋がる。' },
    { id: 4, name: '第4章　変換と電源', lead: 'AD 変換の kT/C と、降圧 DC-DC のコイル。第6部 09・10。' },
    { id: 5, name: '第5章　写す・基準・受ける', lead: 'カレントミラーの誤差、バンドギャップの傾き、TIA の帰還容量。第6部 03・08・16。' }
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
    {
      id: 'ota2', ch: 2, kind: 'design',
      name: '2段OTA ― 速さと安定の綱引き',
      desc: '初段 **100 µA・W/L 20**・負荷 **CL 1 pF**・電源 **1.8 V** のまま、第2段（電流・W/L）とミラー補償 Cc で、**GBW 30 MHz 以上・位相余裕 60° 以上・電力 1.2 mW 以下**にする。',
      why: '2段OTA の GBW は gm1/2πCc ― Cc を小さくすれば速い。でも位相は第2極 gm2/CL と'
         + '**右半面ゼロ gm2/Cc** に削られる（ミラー補償の有名な代償）。ゼロの分 GBW/fz = gm1/gm2 は Cc に依らないので、'
         + '**まず gm2 を gm1 の3倍ほどに**してから、Cc の窓（速すぎず遅すぎず）を探す ― ラザビー10章の設計手順そのもの。',
      hint: '第2段 500µA・W/L 36（gm2=2.7mS）で Cc = 1.7〜4.7 pF の窓。Cc=3pF で GBW 47MHz・PM 65°。',
      check: function (ev, d) {
        var lock = d.idua === 100 && d.wl === 20 && near(d.clpf, 1) && d.vdd === 1.8;
        return {
          ok: lock && ev.gbw2 >= 30e6 && ev.pm >= 60 && ev.ptot <= 1.2e-3,
          rows: [
            row('GBW = gm1/2πCc', f(ev.gbw2 / 1e6, 1) + ' MHz', '30.0 以上', ev.gbw2 >= 30e6),
            row('位相余裕', f(ev.pm, 1) + '°（第2極 ' + f(ev.fp2 / 1e6, 0) + ' / ゼロ ' + f(ev.fz / 1e6, 0) + ' MHz）', '60.0 以上', ev.pm >= 60),
            row('電力', f(ev.ptot * 1000, 2) + ' mW', '1.20 以下', ev.ptot <= 1.2e-3),
            row('条件固定', lock ? '守っている（初段100µA/20・CL1pF・1.8V）' : '課題の条件に戻す', '', lock)
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
    },
    {
      id: 'sc', ch: 3, kind: 'design',
      name: '抵抗を時間で作る ― SC',
      desc: 'SC のクロック **0.1〜10 MHz**・容量 **2 pF 以下**の範囲で、等価抵抗 1/(fC) を **10 MΩ 以上**、かつ 1 サンプルの雑音 √(kT/C) を **100 µV 以下**にする。',
      why: 'スイッチトキャパシタは 1 クロックで q = CV を運ぶ ― 平均電流 fCV、つまり**抵抗 1/(fC) と同じ**。'
         + 'シリコンで 10 MΩ の抵抗は巨大だが、SC なら小さな C と遅いクロックで作れて、しかも比精度は容量比で決まる（CMOSフィルタ・ADC の芯）。'
         + '代金は kT/C: スイッチが開くたび √(kT/C) の雑音が刻まれるので、**C は小さくしすぎられない** ― 窓は両側から閉じる。',
      hint: 'クロック 0.1 MHz・C 0.5〜0.9 pF。C 0.3 pF は雑音 117 µV で落ち、C 1.5 pF は 6.7 MΩ で落ちる。',
      check: function (ev, d) {
        var lim = d.fsmhz >= 0.1 && d.fsmhz <= 10 && d.cscpf <= 2 && d.cscpf > 0;
        return {
          ok: lim && ev.reqsc >= 1e7 && ev.vktcsc <= 1e-4,
          rows: [
            row('等価抵抗 1/(fC)', f(ev.reqsc / 1e6, 2) + ' MΩ', '10.00 以上', ev.reqsc >= 1e7),
            row('kT/C 雑音', f(ev.vktcsc * 1e6, 1) + ' µV', '100.0 以下', ev.vktcsc <= 1e-4),
            row('クロック / 容量', f(d.fsmhz, 2) + ' MHz / ' + f(d.cscpf, 2) + ' pF', '0.1〜10 MHz・2 pF 以下', lim)
          ]
        };
      }
    },

    /* ===== 第4章 ===== */
    {
      id: 'adc', ch: 4, kind: 'design',
      name: '標本化の容量を選ぶ ― kT/C と量子化',
      desc: '**12 ビット・満量程 1 V** のまま、標本化の容量で kT/C の雑音を **量子化の雑音（LSB/√12）以下**にし、しかも容量を **2 pF 以下**（それを駆動する電力の上限）に収める。',
      why: '電圧を容量に取り込むたびに √(kT/C) の雑音が焼き付く（第6部 07・09）。量子化の雑音 LSB/√12 より大きいと、せっかくのビット数が雑音に埋もれる。'
         + 'だが容量を大きくすると、それを速く充電するための電流（電力）が増える ― <b>窓は両側から閉じる</b>。'
         + '16 ビットでは同じ条件で 213 pF 要り、高分解能の ADC が ΔΣ 型を選ぶ理由になる。',
      hint: 'LSB = 244 µV、LSB/√12 = 70.5 µV。√(kT/C) ≤ 70.5 µV → C ≥ 0.83 pF。',
      check: function (ev, d) {
        var lock = near(d.nbit, 12) && near(d.fsv, 1);
        var okN = ev.vktcadc <= ev.vqadc, okC = d.cadcpf <= 2;
        return {
          ok: lock && okN && okC,
          rows: [
            row('kT/C の雑音', f(ev.vktcadc * 1e6, 1) + ' µV', '量子化 ' + f(ev.vqadc * 1e6, 1) + ' µV 以下', okN),
            row('容量', f(d.cadcpf, 2) + ' pF', '2.00 以下', okC),
            row('SN 比 / 実効ビット数', f(ev.snradc, 1) + ' dB / ' + f(ev.enob, 2) + ' ビット', '', true),
            row('条件固定', lock ? '守っている（12 ビット・1 V）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'buck', ch: 4, kind: 'design',
      name: '降圧 DC-DC のコイルを選ぶ',
      desc: '**12 V → 3.3 V・1 MHz** のまま、コイルでコイル電流の三角波 ΔI を **0.3 A 以下**にし、しかもコイルを **22 µH 以下**（大きさの上限）に収める。',
      why: '降圧 DC-DC はスイッチで刻んだ電圧の平均 D·V<sub>in</sub> を取り出す（第6部 10）。コイル電流は三角波で揺れ、その振幅 ΔI = (V<sub>in</sub>−V<sub>out</sub>)·D/(L·f) が出力のリップルと部品の発熱を決める。'
         + 'L を大きくすれば静かになるが、コイルは大きく重く高くなる ― ここでも窓。周波数を上げれば小さなコイルで済むのが、SiC・GaN（第2部）の効く場所です。',
      hint: 'D = 0.275、ΔI = 2.39/L[µH] A ≤ 0.3 → L ≥ 8.0 µH。窓は 8〜22 µH。',
      check: function (ev, d) {
        var lock = near(d.vin, 12) && near(d.vout, 3.3) && near(d.fswmhz, 1);
        var okI = ev.dIbuck <= 0.3, okL = d.luh <= 22;
        return {
          ok: lock && okI && okL,
          rows: [
            row('コイル電流の三角波 ΔI', f(ev.dIbuck, 3) + ' A（D = ' + f(ev.duty, 3) + '）', '0.300 以下', okI),
            row('コイル', f(d.luh, 1) + ' µH', '22.0 以下', okL),
            row('条件固定', lock ? '守っている（12→3.3 V・1 MHz）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    /* ===== 第5章 ===== */
    {
      id: 'mirror', ch: 5, kind: 'design',
      name: 'ミラーの誤差を 0.1% に',
      desc: '基準 **50 µA**・W/L の比 **1:2**・λ **0.1 /V** のミラーで、出力のドレインが基準より **0.5 V** 高くても、コピーの誤差を **0.1% 以下**にする。'
          + '出力に要る電圧（飽和に留まるための下の余裕）は **0.35 V 以下**、出力側の石の W/L は **200 まで**（面積の上限、仮定）。',
      why: 'ミラーの品質は出力抵抗 ― 単純なミラーは r<sub>o</sub> しかなく、ドレインが ΔV 動くと二乗則に (1 + λΔV) が掛かって **5%** 狂う（第6部 03 の例題）。'
         + 'カスコードにすると出力抵抗が g<sub>m</sub>r<sub>o</sub> 倍になり、誤差は λΔV/(g<sub>m</sub>r<sub>o</sub>) に縮む。代金は **V<sub>ov</sub> 1 個ぶんのヘッドルーム**。'
         + 'g<sub>m</sub>r<sub>o</sub> = 2/(λV<sub>ov</sub>) なので、V<sub>ov</sub> を下げる（W/L を太らせる）と誤差とヘッドルームが同時に良くなるが、面積が上限を決める ― 窓。',
      hint: '単純なミラー（種類 0）は 5% で届かない。カスコード（種類 1）の出力に要る電圧は 2Vov ≤ 0.35 V → Vov ≤ 0.175 V → W/L ≥ 32.7（100 µA）。既定の W/L 20 では 0.447 V で落ちる。',
      check: function (ev, d) {
        var lock = near(d.mref, 50) && near(d.mratio, 2) && near(d.mdvds, 0.5) && near(d.lam, 0.1);
        var okE = ev.mErr <= 0.001, okH = ev.mHead <= 0.35, lim = d.wl <= 200;
        return {
          ok: lock && okE && okH && lim,
          rows: [
            row('コピーの誤差', f(ev.mErr * 100, 4) + ' %（' + (d.mcasc ? 'カスコード' : '単純') + '）', '0.1000 以下', okE),
            row('出力に要る電圧', f(ev.mHead, 3) + ' V（Vov ' + f(ev.mVov, 3) + ' V）', '0.350 以下', okH),
            row('出力抵抗 / gm·ro', f(ev.mRout / 1e6, 2) + ' MΩ / ' + f(ev.mgmro, 1), '', true),
            row('出力側の W/L', f(d.wl, 1), '200 まで', lim),
            row('条件固定', lock ? '守っている（50 µA・1:2・0.5 V・λ 0.1）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'bgr', ch: 5, kind: 'design',
      name: 'バンドギャップの傾きを消す',
      desc: 'V<sub>BE</sub> **0.65 V**・その温度係数 **−2 mV/K** のまま、面積比 n（**24 まで**・整数）と倍率 m（**10 まで**・抵抗比の上限、仮定）で、'
          + '基準電圧の温度係数を **±0.05 mV/K 以内**にする。',
      why: 'V<sub>BE</sub> は温度で下がり（CTAT）、面積の違う 2 本の差 ΔV<sub>BE</sub> = V<sub>T</sub> ln n は上がる（PTAT、(k/q)·ln n = 86.2 µV/K × ln n）。'
         + 'm 倍して足すと傾きが消える（第6部 08）。n = 8 なら m = 11.2 が要る ― **m に上限があれば、n を大きくして ln n で稼ぐ**しかない。'
         + '打ち消した先の電圧は約 1.25 V で、シリコンのバンドギャップ（0 K へ外挿して約 1.2 V）の近くに落ちる。',
      hint: 'm = 2000 / (86.17 × ln n)。n = 8 は m 11.16 で上限 10 を超える。n = 16 なら m 8.16〜8.58（中心 8.37）。',
      check: function (ev, d) {
        var lock = near(d.vbe0, 0.65) && near(d.dvbe, -2);
        var lim = d.bgn >= 2 && d.bgn <= 24 && d.bgm <= 10;
        var okT = Math.abs(ev.bgTC) <= 0.05;
        return {
          ok: lock && lim && okT,
          rows: [
            row('基準電圧の温度係数', f(ev.bgTC, 4) + ' mV/K（−40〜125 ℃ で ' + f(ev.bgDrift, 1) + ' mV）', '±0.0500 以内', okT),
            row('基準電圧（300 K）', f(ev.bgV, 4) + ' V', '', true),
            row('面積比 n / 倍率 m', f(d.bgn, 0) + ' / ' + f(d.bgm, 3) + '（傾きが消える m ' + f(ev.bgMzero, 3) + '）', 'n 24・m 10 まで', lim),
            row('条件固定', lock ? '守っている（V_BE 0.65 V・−2 mV/K）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'tiacf', ch: 5, kind: 'design',
      name: '帰還容量で鳴きを止める',
      desc: 'R<sub>f</sub> **1 MΩ**（1000 kΩ）・入力の容量（PD＋増幅器）**10 pF**・増幅器の GBW **100 MHz** の TIA で、帰還容量 C<sub>f</sub> を選び、'
          + '周波数特性の山を **5% 以下**（1.05 倍）に抑えたまま、帯域を **1.2 MHz 以上**にする。',
      why: 'C<sub>f</sub> が無いと、R<sub>f</sub> と入力の容量の極が帰還の輪の中に入り、2 次系の減衰 ζ が 0.0063 まで落ちて、周波数特性に **79 倍**の山が立つ（実物は発振。第6部 16）。'
         + 'C<sub>f</sub> を足すと ζ = (1 + ω<sub>t</sub>R<sub>f</sub>C<sub>f</sub>)/(2√(ω<sub>t</sub>R<sub>f</sub>C<sub>T</sub>)) が上がって山は消えるが、大きすぎると R<sub>f</sub>C<sub>f</sub> で帯域が落ちる ― '
         + '最大平坦（ζ = 0.707）の 178 fF で 1.25 MHz。**帯域を 1/(2πR<sub>f</sub>C<sub>f</sub>) で見積もると外れる**（2 次系なので 0.89 MHz ではなく 1.25 MHz）。',
      hint: '山 ≤ 5% は Cf ≥ 148 fF、帯域 ≥ 1.2 MHz は Cf ≤ 186 fF。窓は 148〜186 fF。',
      check: function (ev, d) {
        var lock = near(d.rfk, 1000) && near(d.tcinpf, 10) && near(d.tgbwmhz, 100);
        var okP = ev.tpeak <= 1.05, okB = ev.tbw >= 1.2e6;
        return {
          ok: lock && okP && okB,
          rows: [
            row('周波数特性の山', f(ev.tpeak, 3) + ' 倍（ζ ' + f(ev.tzeta, 3) + '）', '1.050 以下', okP),
            row('帯域（−3 dB）', f(ev.tbw / 1e6, 3) + ' MHz', '1.200 以上', okB),
            row('帰還容量 Cf', f(d.tcffF, 1) + ' fF', '', true),
            row('条件固定', lock ? '守っている（1 MΩ・10 pF・100 MHz）' : '課題の条件に戻す', '', lock)
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
