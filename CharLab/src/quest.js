/* 課題と採点 ― すべて measure 型（測定表から抽出した値を、真の値と許容つきで比べる）
 *
 * 条件を「固定」する代わりに、ここでは答案の欄そのものを見る。
 * どの欄をどう読めば出るかは desc と hint に全部書いてある ― 電卓だけでできる。
 */
(function (global) {
  'use strict';
  var CL = global.CL || (global.CL = {});
  var M = CL.char, DEV = M.DEV;

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }
  function f(v, d) { return (+v).toFixed(d === undefined ? 2 : d); }
  function ex(v, d) { return (+v).toExponential(d === undefined ? 2 : d); }
  function inAbs(got, truth, tol) { return isFinite(got) && Math.abs(got - truth) <= tol; }
  function inRel(got, truth, tol) { return isFinite(got) && Math.abs(got - truth) <= Math.abs(truth) * tol; }
  function inFac(got, truth, fac) { return isFinite(got) && got > 0 && got / truth <= fac && truth / got <= fac; }

  var CH = [
    { id: 1, name: '第1章　ダイオードを測る', lead: '片対数の直線から n と Is、てっぺんの曲がりから Rs。I-V は3つの数字でできている。' },
    { id: 2, name: '第2章　MOSFET を測る', lead: '線形外挿で Vth、傾きで µCox·W/L、裾の傾きで S 値。データシートの3行の出どころ。' },
    { id: 3, name: '第3章　MOS 容量を測る', lead: 'C-V の2つの棚から tox と Na、棚を離れる場所から Vfb。工程モニタの定番測定。' }
  ];

  var LIST = [
    /* ===== 第1章 ===== */
    {
      id: 'dn', ch: 1, kind: 'measure',
      name: '理想係数 n を当てる',
      desc: '謎のダイオード D の測定表から、**理想係数 n** を読む（±0.06）。',
      why: '順方向の中域では I = Is·e^(V/nVt) ― 片対数プロットは直線で、**傾きが 1/(n·Vt)**。'
         + 'n=1 は拡散電流、n=2 に近いほど空乏層再結合が混ざっている合図。LED や SiC で n が大きく出るのも同じ理屈。'
         + '2点あれば出る: n = ΔV / (Vt·ln(I₂/I₁))。低すぎる V は誤差が、高すぎる V は Rs が混ざるので、真ん中を使う。',
      hint: 'V=0.45 と 0.55 の2点で。n = 0.10 / (0.025852 × ln(I₂/I₁))。',
      check: function (ev, d) {
        var ok = inAbs(d.nfit, DEV.dio.n, 0.06);
        return { ok: ok, rows: [row('あなたの n', f(d.nfit, 3), '±0.06 で一致', ok)] };
      }
    },
    {
      id: 'dis', ch: 1, kind: 'measure',
      name: '飽和電流 Is を当てる',
      desc: '謎のダイオード D の **Is** を読む（1.6 倍以内）。',
      why: 'n が決まれば、直線を V=0 まで延ばした切片が Is ― **Is = I / e^(V/nVt)**。'
         + '指数の切片なので n を少し間違えると桁で外れる: 先に n、次に Is の順番は変えられない。'
         + 'Is は接合面積と温度に敏感（≈10℃で倍）― データシートの Is に必ず温度が添えてある理由。',
      hint: 'V=0.5・n=1.36 なら Is = I(0.5) / e^(0.5/0.03516)。',
      check: function (ev, d) {
        var ok = inFac(d.isfit, DEV.dio.is, 1.6);
        return { ok: ok, rows: [row('あなたの Is', ex(d.isfit, 2) + ' A', '×/÷1.6 で一致', ok)] };
      }
    },
    {
      id: 'drs', ch: 1, kind: 'measure',
      name: '直列抵抗 Rs を当てる',
      desc: '謎のダイオード D の **Rs** を読む（±25%）。',
      why: '大電流では端子電圧の一部が Rs に食われ、片対数の直線が**上で寝てくる**。'
         + '寝た分がそのまま I·Rs: **Rs = (V − n·Vt·ln(I/Is)) / I**。'
         + 'パワーダイオードの発熱・LED の効率低下・太陽電池の曲線因子 ― ぜんぶこの Rs の仕業。',
      hint: 'V=0.90 の点で。理想なら n·Vt·ln(I/Is) の電圧で済むはず ― 差を I で割る。',
      check: function (ev, d) {
        var ok = inRel(d.rsfit, DEV.dio.rs, 0.25);
        return { ok: ok, rows: [row('あなたの Rs', f(d.rsfit, 2) + ' Ω', '±25% で一致', ok)] };
      }
    },

    /* ===== 第2章 ===== */
    {
      id: 'mvth', ch: 2, kind: 'measure',
      name: 'Vth を線形外挿で当てる',
      desc: '謎の MOSFET M（Vd=50mV）の **しきい値電圧 Vth** を読む（±0.03 V）。',
      why: '線形領域の上のほうでは Id ≈ µCox(W/L)·Vd·(Vg−Vth) ― Id-Vg は直線で、'
         + '**横軸との交点（外挿）が Vth**。SemiLab で作った Vth を、今度は測る側から取り出す。'
         + '裾（弱反転）を混ぜて引くと Vth が低く出る ― 直線の「まっすぐな区間」だけを使うのが作法。',
      hint: 'Vg=1.0 と 1.4 の2点で直線を引く。Vth = Vg − Id/傾き。',
      check: function (ev, d) {
        var ok = inAbs(d.vthfit, DEV.mos.vth, 0.03);
        return { ok: ok, rows: [row('あなたの Vth', f(d.vthfit, 3) + ' V', '±0.03 で一致', ok)] };
      }
    },
    {
      id: 'mk', ch: 2, kind: 'measure',
      name: 'µCox·W/L を当てる',
      desc: '謎の MOSFET M の **利得定数 µCox·W/L** を読む（±15%）。',
      why: '同じ直線の**傾きが µCox(W/L)·Vd**。Vd=50mV で割れば µCox·W/L ―'
         + 'AnalogLab の設計が仮定していた µCox=200µA/V² 級の数字は、こうやって測って決める。'
         + 'ウェーハの出来（移動度・tox）の一次モニタで、工程の週次トレンドはたいていこの値で語られる。',
      hint: '傾き = ΔId/ΔVg = (Id(1.4)−Id(1.0))/0.4。それを 0.05 で割る。',
      check: function (ev, d) {
        var ok = inRel(d.kwlfit, DEV.mos.kwl, 0.15);
        return { ok: ok, rows: [row('あなたの µCox·W/L', ex(d.kwlfit, 2) + ' A/V²', '±15% で一致', ok)] };
      }
    },
    {
      id: 'mss', ch: 2, kind: 'measure',
      name: 'S 値を裾で当てる',
      desc: '謎の MOSFET M の **サブスレッショルド係数 S** を読む（±8 mV/dec）。',
      why: 'しきい値の下では Id は指数で落ち、**1桁落とすのに要るゲート電圧が S 値**。'
         + '理想の下限は 60mV/dec（300K）― 第4部付録Bの「59.5mV/桁の壁」と同じ数字。'
         + '測った S が 60 よりどれだけ悪いかが、界面と空乏容量の税金。低電圧設計とリーク見積もりの根っこ。',
      hint: 'Vg=0.3 と 0.4 で。S = 100mV / log₁₀(I₂/I₁)。',
      check: function (ev, d) {
        var ok = inAbs(d.ssfit, DEV.mos.ss, 8);
        return { ok: ok, rows: [row('あなたの S', f(d.ssfit, 1) + ' mV/dec', '±8 で一致', ok)] };
      }
    },

    /* ===== 第3章 ===== */
    {
      id: 'ctox', ch: 3, kind: 'measure',
      name: 'tox を蓄積の棚で当てる',
      desc: '謎の MOS 容量 C の **酸化膜厚 tox** を読む（±0.4 nm）。',
      why: '負側（蓄積）の棚は酸化膜そのものの容量: **Cox = εox/tox**。'
         + 'εox = 3.45×10⁻¹³ F/cm を棚の値で割るだけで、数 nm の膜厚が電気測定で出る ―'
         + 'エリプソメータと並ぶ tox 測定の定番で、ProcessLab の Deal-Grove が育てた膜はこの方法で検収される。',
      hint: '棚は約 821 nF/cm²。tox = 3.45×10⁻¹³ / Cox [cm] ― nm に直すのを忘れずに。',
      check: function (ev, d) {
        var ok = inAbs(d.toxfit, DEV.cap.tox, 0.4);
        return { ok: ok, rows: [row('あなたの tox', f(d.toxfit, 2) + ' nm', '±0.4 で一致', ok)] };
      }
    },
    {
      id: 'cna', ch: 3, kind: 'measure',
      name: 'Na を反転の棚で当てる',
      desc: '謎の MOS 容量 C の **基板濃度 Na** を読む（1.5 倍以内）。',
      why: '正側の棚 Cmin は「Cox と、最大空乏層 Wdmax の容量の直列」。だから'
         + '**Wdmax = εs·(1/Cmin − 1/Cox)** が出て、Wdmax = √(4εs·φF/(q·Na)) を逆に解けば Na ―'
         + 'SemiLab で自分が決めていた濃度を、C-V だけから言い当てる。φF が Na に依るので1回まわす（φF≈0.44V で始めれば十分）。',
      hint: 'Wdmax ≈ 62 nm。Na = 4εs·φF/(q·Wdmax²)、εs=1.035×10⁻¹² F/cm、q=1.6×10⁻¹⁹。',
      check: function (ev, d) {
        var ok = inFac(d.nafit, DEV.cap.na, 1.5);
        return { ok: ok, rows: [row('あなたの Na', ex(d.nafit, 2) + ' cm⁻³', '×/÷1.5 で一致', ok)] };
      }
    },
    {
      id: 'cvfb', ch: 3, kind: 'measure',
      name: 'Vfb を棚の肩で当てる',
      desc: '謎の MOS 容量 C の **フラットバンド電圧 Vfb** を読む（±0.15 V）。',
      why: 'C-V が Cox の棚を離れる場所がフラットバンド ― バンドの曲がりがゼロになるゲート電圧。'
         + '理想（仕事関数差だけ）からのずれは**酸化膜の中の電荷**の帳簿: Vfb = φms − Qox/Cox。'
         + '汚染やプラズマダメージで Vfb が動くので、工程監視では tox・Na と並ぶ第3の数字。',
      hint: '負から掃くと −0.9 V あたりまで棚（821 nF/cm²）が続き、そこから落ち始める。',
      check: function (ev, d) {
        var ok = inAbs(d.vfbfit, DEV.cap.vfb, 0.15);
        return { ok: ok, rows: [row('あなたの Vfb', f(d.vfbfit, 2) + ' V', '±0.15 で一致', ok)] };
      }
    }
  ];

  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function chapterOf(q) { for (var i = 0; i < CH.length; i++) if (CH[i].id === q.ch) return CH[i]; return null; }

  /** 採点する。st = { design }（design = 答案の欄） */
  function grade(id, st) {
    var q = byId(id);
    if (!q) return { ok: false, rows: [], error: '課題が見つかりません' };
    try {
      var r = q.check(null, st.design);
      r.quest = q;
      return r;
    } catch (e) {
      return { ok: false, quest: q, rows: [row('採点できませんでした', String(e && e.message || e), '', false)] };
    }
  }

  CL.quest = { LIST: LIST, CH: CH, byId: byId, chapterOf: chapterOf, grade: grade };
})(typeof window !== 'undefined' ? window : globalThis);
