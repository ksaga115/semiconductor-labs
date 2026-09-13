/* お手本 ― 測る課題は「測り方」、設計の課題は「設計の一例」
 *
 * 測る課題のお手本は、真の値を見せない。**PTC を掃いて当てはめる手順**を実行して、その結果を出す。
 * 画面の「お手本を見る」と tests/quest.js が同じ手順を使う。
 * 手順の結果が許容に入らなければ、課題か手順のどちらかが壊れている（検査が落ちる）。
 */
(function (global) {
  'use strict';
  var PX = global.PX || (global.PX = {});
  var CAM = PX.camera, PTC = PX.ptc, PIX = PX.pixel;

  /** 謎のカメラを掃く。露光は 0.1ms〜5s を対数で 40 点（どのカメラも飽和を越える）。
   *  同じカメラ・同じ種なら結果は同じなので覚えておく（お手本が K・読出・飽和で何度も掃き直していた） */
  var SWEEPS = {};
  function sweepMystery(key, seed) {
    var k = key + '|' + (seed || 11);
    return SWEEPS[k] || (SWEEPS[k] = PTC.sweep(CAM.MYSTERY[key], 1e-4, 5, 40, seed || 11));
  }

  function measureK(key) {
    var pts = sweepMystery(key), f = PTC.fitK(pts);
    return { pts: pts, K: f ? f.K : null, used: f ? f.used : 0 };
  }

  var A = {
    k: {
      note: '露光を掃いて PTC を取り、読み出し雑音が効かず飽和の手前の点で「時間の分散 − 暗い分散」を平均に対して直線に当てた。傾きの逆数が K。',
      solve: function () { var r = measureK('A'); return { value: r.K, text: 'K ≒ ' + r.K.toFixed(3) + ' e⁻/DN（' + r.used + ' 点で当てはめ）' }; }
    },
    read: {
      note: '一番短い露光の暗い2枚の差から、時間でゆらぐ雑音（DN）を出し、測った K を掛けた。',
      solve: function () { var r = measureK('A'), v = PTC.readNoise(r.pts, r.K); return { value: v, text: '読み出し雑音 ≒ ' + v.toFixed(2) + ' e⁻' }; }
    },
    fw: {
      note: 'カメラ B の K を測り、明るくしても増えなくなった平均（頭打ち）に掛けた。PTC の頂点の点で測ると、露光の刻み方しだいで飽和の手前を拾う。',
      solve: function () { var r = measureK('B'), v = PTC.fullWell(r.pts, r.K); return { value: v, text: '飽和電荷 ≒ ' + v.toFixed(0) + ' e⁻' }; }
    },
    dark: {
      note: 'カメラ B の暗い画像の平均を露光に対して直線に当て、傾き（DN/s）に K を掛けた。',
      solve: function () { var r = measureK('B'), v = PTC.darkCurrent(r.pts, r.K); return { value: v, text: '暗電流 ≒ ' + v.toFixed(3) + ' e⁻/s' }; }
    },
    prnu: {
      note: '飽和の手前で、2枚の平均の分散から時間の雑音を引いた「固定パターン」の標準偏差を信号で割った（中央値）。',
      solve: function () { var pts = sweepMystery('C'), v = PTC.prnu(pts) * 100; return { value: v, text: 'PRNU ≒ ' + v.toFixed(2) + ' %' }; }
    },
    limit: {
      note: '飽和した点の「生の平均」を見る。4095（＝2¹²−1）に張り付いていれば AD の上限。井戸なら上限より手前で頭打ちになる。',
      solve: function () {
        var pts = sweepMystery('C'), top = Math.max.apply(null, pts.map(function (p) { return p.raw; }));
        var bits = Math.round(Math.log2(top + 1));
        var isAdc = Math.abs(top - (Math.pow(2, bits) - 1)) < 2;
        return { value: isAdc ? 'adc' : 'well', text: '生の平均の最大 ' + top.toFixed(1) + ' DN' + (isAdc ? '（= 2^' + bits + '−1 に張り付いている → AD）' : '（上限より手前 → 井戸）') };
      }
    },

    dr: {
      note: '浮遊拡散を 1.3fF に下げて変換ゲインを上げた（読み出し雑音 1.2e⁻→）。これより下げると浮遊拡散が井戸を決めるようになり、飽和電荷が減りはじめる。',
      design: function () { var d = PIX.defaults(); d.cfd = 1.3; return d; }
    },
    dim: {
      note: 'ピッチを 2.5µm に下げ、浮遊拡散を 1.2fF にして読み出し雑音を 1e⁻ 近くまで削った。',
      design: function () { var d = PIX.defaults(); d.pitch = 2.5; d.cfd = 1.2; return d; }
    },
    cool: {
      note: '−20℃ まで冷やした。25℃ から 45K 下げると、暗電流はおよそ 2^(45/9) ≒ 30 分の1 になる。',
      design: function () { var d = PIX.defaults(); d.T = -20; return d; }
    },
    adc: {
      note: '13 bit にした。K が半分になり、量子化雑音も半分になる。',
      design: function () { var d = PIX.defaults(); d.bits = 13; return d; }
    },
    hdr: {
      note: '浮遊拡散を 1.2fF にして単発の DR を 76.3dB まで伸ばし、露光比 16:1（+24.1dB）で合成 100.4dB。床（読み出し雑音）は合成では動かない ― 天井だけが伸びる。',
      design: function () { var d = PIX.defaults(); d.cfd = 1.2; d.hdrR = 16; return d; }
    },
    nir: {
      note: '850nm で見て、光を集める層を 10µm に厚くした（SemiLab で量子効率 32%、マイクロレンズで 9 割が届いて 29%）。',
      design: function () { var d = PIX.defaults(); d.nm = 850; d.epi = 10; return d; }
    },
    roll: {
      note: '12 bit のまま列回路を 4 組にして 4 行を同時に読む。1 行 1.02 µs、上端と下端の時間差 3.07 ms、600 画素/s で 1.84 画素。',
      design: function () { var d = PIX.defaults(); d.colpar = 4; return d; }
    },
    gs: {
      note: '同時に読む行を 4 組にして待ち時間を 3.07 ms に縮め、分離比を 90 dB（3.2×10⁻⁵）に。偽の信号 0.67 e⁻。',
      design: function () { var d = PIX.defaults(); d.colpar = 4; d.pls = 90; return d; }
    },
    pitch: {
      note: 'F8 の回折の限界 2.2 µm と、2400 画素の上限 2.5 µm のあいだの 2.3 µm。S/N 27.3。',
      design: function () { var d = PIX.defaults(); d.fnum = 8; d.pitch = 2.3; return d; }
    },
    tdi: {
      note: '電荷で足す（CCD 型）90 段。信号 450 e⁻、読み出し雑音は 1 回だけで S/N 21.2、にじみ 0.9 画素。',
      design: function () { var d = PIX.defaults(); d.tdiMode = 1; d.tdiN = 90; return d; }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  PX.answer = { get: get, ids: ids, sweepMystery: sweepMystery, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
