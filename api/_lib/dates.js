/**
 * API/_LIB/DATES.JS — Funciones centralizadas de formateo y cálculo de fechas y precisión
 *
 * Soporta precisiones: 'exacto' | 'decada' | 'siglo'
 */

function aRomano(num) {
  if (num <= 0 || !Number.isFinite(num)) return String(num);
  const romanLookup = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let res = '';
  let n = num;
  for (const [val, sym] of romanLookup) {
    while (n >= val) {
      res += sym;
      n -= val;
    }
  }
  return res || String(num);
}

function romanoANumero(romano) {
  if (!romano) return 0;
  const str = String(romano).toUpperCase().replace(/[^IVXLCDM]/g, '');
  const romanValues = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = str.length - 1; i >= 0; i--) {
    const curr = romanValues[str[i]] || 0;
    if (curr < prev) {
      total -= curr;
    } else {
      total += curr;
      prev = curr;
    }
  }
  return total;
}

function calcularSigloDeAnio(anio) {
  const y = parseInt(anio, 10);
  if (!Number.isFinite(y) || y === 0) return 0;
  if (y > 0) return Math.floor((y - 1) / 100) + 1;
  return -(Math.floor((Math.abs(y) - 1) / 100) + 1);
}

function anioCentralDeSiglo(siglo) {
  const s = parseInt(siglo, 10);
  if (!s || !Number.isFinite(s)) return 0;
  if (s > 0) return (s - 1) * 100 + 50;
  return -((Math.abs(s) - 1) * 100 + 50);
}

function redondearADecada(anio) {
  const y = parseInt(anio, 10);
  if (!Number.isFinite(y)) return 0;
  return Math.floor(y / 10) * 10;
}

function formatearAño(añoConstruccion, añoPrecision) {
  if (añoConstruccion === null || añoConstruccion === undefined || añoConstruccion === '') return '';
  const str = String(añoConstruccion).trim();
  if (!str) return '';
  const num = parseInt(str, 10);
  if (!Number.isFinite(num)) return str;

  const precision = String(añoPrecision || 'exacto').trim().toLowerCase();
  if (precision === 'decada') {
    const decada = redondearADecada(num);
    return decada < 0 ? `Años ${Math.abs(decada)} a.C.` : `Años ${decada}`;
  }

  if (precision === 'siglo') {
    const siglo = calcularSigloDeAnio(num);
    if (siglo === 0) return str;
    const romano = aRomano(Math.abs(siglo));
    return siglo < 0 ? `Siglo ${romano} a.C.` : `Siglo ${romano}`;
  }

  return String(num);
}

const formatearAnio = formatearAño;

module.exports = {
  aRomano,
  romanoANumero,
  calcularSigloDeAnio,
  anioCentralDeSiglo,
  redondearADecada,
  formatearAño,
  formatearAnio,
};
