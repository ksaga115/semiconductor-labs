/* 数値の読み取り ― 数値欄に打たれた文字を数にする
 *
 * SemiLab と ProcessLab の両方が使う（ProcessLab は ../SemiLab/src/parse.js を読む）。
 * 以前は両方の ui.js に同じ関数を書いていた。片方だけ直して食い違うのが一番まずいので、ここに寄せた。
 * ブラウザに触らないので Node で検査できる。
 *
 * 【約束】
 *   ・読めないものは NaN を返す。**勝手に 0 にしない** ― 打ち間違いで不純物が消えるのが一番まずい
 *   ・範囲に寄せるのは呼ぶ側の仕事（ここは読むだけ）
 *   ・全角、上付き（10¹⁷）、全角マイナス（−5）、末尾の単位を受け付ける
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});

  var SUPD = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };

  /** 全角・上付き・全角マイナスをふつうの文字に。上付きは NFKC より先に ^ に直す
   *  （NFKC に任せると「10¹⁷」が「1017」になってしまう） */
  function norm(t) {
    var s = String(t === undefined || t === null ? '' : t).trim();
    s = s.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)/g, function (m) {
      return '^' + m.split('').map(function (c) { return SUPD[c]; }).join('');
    });
    if (s.normalize) s = s.normalize('NFKC');
    return s.replace(/[−‐－]/g, '-').replace(/\s+/g, '');
  }

  /** 末尾の単位（読み飛ばすもの）。長いものから並べる ― 「kev」を「v」で切らないため */
  var UNIT = /(kev|nm|µm|um|mm|min|分|℃|°c|cm\^?-?[23]|v|k|c|s|%)$/i;

  /** ふつうの数（電圧・温度・波長・時間など）。空は NaN */
  function num(t) {
    var s = norm(t).replace(UNIT, '');
    if (s === '') return NaN;
    var v = Number(s);
    return isFinite(v) ? v : NaN;
  }

  /** 桁の大きい数。1e15 / 5E14 / 1×10^15 / 10¹⁵。空は NaN。符号はそのまま */
  function sci(t) {
    var s = norm(t).replace(/cm\^?-?[23]$/i, '').replace(/[×xX*・]/g, '*');
    if (s === '') return NaN;
    var m = s.match(/^(?:([0-9.]+)\*)?10\^([+-]?\d+)$/);
    if (m) {
      var mant = m[1] !== undefined ? Number(m[1]) : 1;
      return isFinite(mant) ? mant * Math.pow(10, parseInt(m[2], 10)) : NaN;
    }
    var v = Number(s);
    return isFinite(v) ? v : NaN;
  }

  /** 濃度 [cm^-3]。空・0・「入れない」は 0（入れない）。負は NaN */
  function dope(t) {
    var s = norm(t);
    if (s === '' || s === '入れない') return 0;
    var v = sci(s);
    return isFinite(v) && v >= 0 ? v : NaN;
  }

  /** 厚み → nm。300 / 300nm / 2.5um / 2.5µm / 0.2mm。単位なしは nm。0 以下は NaN */
  function len(t) {
    var s = norm(t).toLowerCase().replace(/[µμ]/g, 'u');
    var m = s.match(/^([0-9.]+(?:e[+-]?\d+)?)(nm|um|mm)?$/);
    if (!m) return NaN;
    var v = Number(m[1]);
    if (!isFinite(v) || v <= 0) return NaN;
    return v * (m[2] === 'um' ? 1e3 : m[2] === 'mm' ? 1e6 : 1);
  }

  SL.parse = { norm: norm, num: num, sci: sci, dope: dope, len: len };
})(typeof window !== 'undefined' ? window : globalThis);
