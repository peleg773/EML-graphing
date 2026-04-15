// Minimal complex-number arithmetic for EML evaluation.
// Uses {re, im} plain objects; hot path avoids allocation churn where possible.

const C = (re = 0, im = 0) => ({ re, im });
const CZERO = C(0, 0);
const CONE = C(1, 0);
const CI = C(0, 1);

const cAdd = (a, b) => C(a.re + b.re, a.im + b.im);
const cSub = (a, b) => C(a.re - b.re, a.im - b.im);
const cNeg = (a) => C(-a.re, -a.im);
function cMul(a, b) {
  // Safe multiplication that treats 0 * Infinity as 0 (rather than NaN),
  // so that e.g. exp(-inf + i*pi/2) * something-finite doesn't explode.
  return C(safeProd(a.re, b.re) - safeProd(a.im, b.im),
           safeProd(a.re, b.im) + safeProd(a.im, b.re));
}
function safeProd(x, y) {
  if (x === 0 || y === 0) return 0;
  return x * y;
}
const cAbs = (a) => Math.hypot(a.re, a.im);
const cConj = (a) => C(a.re, -a.im);

function cDiv(a, b) {
  const d = b.re * b.re + b.im * b.im;
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}

function cExp(a) {
  if (a.re === -Infinity) return C(0, 0);
  // Normalize imaginary part to (-pi, pi] to keep sin/cos finite even for huge a.im
  let im = a.im;
  if (!isFinite(im)) return C(NaN, NaN);
  const TWO_PI = 2 * Math.PI;
  im = im - TWO_PI * Math.floor((im + Math.PI) / TWO_PI);
  const e = Math.exp(a.re);
  return C(e * Math.cos(im), e * Math.sin(im));
}

// Principal branch; log(0) handled by caller.
function cLog(a) {
  return C(Math.log(Math.hypot(a.re, a.im)), Math.atan2(a.im, a.re));
}

function cPow(a, b) {
  if (a.re === 0 && a.im === 0) {
    if (b.re > 0 && b.im === 0) return CZERO;
    return C(NaN, NaN);
  }
  return cExp(cMul(b, cLog(a)));
}

function cEq(a, b, eps = 1e-12) {
  return Math.abs(a.re - b.re) < eps && Math.abs(a.im - b.im) < eps;
}

function cToString(a, digits = 10) {
  const re = +a.re.toPrecision(digits);
  const im = +a.im.toPrecision(digits);
  if (Math.abs(im) < 1e-12) return `${re}`;
  if (Math.abs(re) < 1e-12) return `${im}i`;
  return `${re} ${im < 0 ? "-" : "+"} ${Math.abs(im)}i`;
}
