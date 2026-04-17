// Math text -> EML string compiler.
// 1) Tiny math-expression parser (recursive descent) -> our AST.
// 2) Emit EML string using the primitives from eml_compiler_v4.py.

// ============================================================
// EML string-emit primitives (port of eml_compiler_v4.py 14-68)
// ============================================================

const EML = (a, b) => `E(${a},${b})`;
const emlExp = (z) => EML(z, "1");
const emlLog = (z) => EML("1", emlExp(EML("1", z)));
const emlZero = () => emlLog("1");
const emlSub = (a, b) => EML(emlLog(a), emlExp(b));
const emlNeg = (z) => emlSub(emlZero(), z);
const emlAdd = (a, b) => emlSub(a, emlNeg(b));
const emlInv = (z) => emlExp(emlNeg(emlLog(z)));
const emlMul = (a, b) => emlExp(emlAdd(emlLog(a), emlLog(b)));
const emlDiv = (a, b) => emlMul(a, emlInv(b));
const emlPow = (a, b) => emlExp(emlMul(b, emlLog(a)));
const emlHalf = (z) => emlMul(z, emlRational(1, 2));

// emlInt uses multiplicative decomposition when possible (mul doesn't
// duplicate operands the way add/doubling does). For primes we fall back
// to add(n-1, 1). Memoized; factorization is tried before the add fallback
// to keep recursion depth logarithmic for composite numbers.
const intCache = Object.create(null);
function emlInt(n) {
  if (n === 1) return "1";
  if (n === 0) return emlZero();
  if (n < 0) return emlNeg(emlInt(-n));
  if (intCache[n]) return intCache[n];
  // Try factorization first — keeps recursion shallow for composite n.
  let best = null;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) {
      const cand = emlMul(emlInt(d), emlInt(n / d));
      if (!best || cand.length < best.length) best = cand;
    }
  }
  if (!best) {
    // n is prime: fall back to add(n-1, 1).
    best = emlAdd(emlInt(n - 1), "1");
  }
  intCache[n] = best;
  return best;
}

function emlRational(p, q) {
  if (q === 1) return emlInt(p);
  const num = emlInt(Math.abs(p));
  const den = emlInt(q);
  const val = emlMul(num, emlInv(den));
  return p >= 0 ? val : emlNeg(val);
}

// Float -> rational via continued fraction (bounded).
// The denominator cap keeps compiled EML size manageable. Since we split
// integer + fractional parts before calling this, the denominator only has
// to approximate a fraction in [0, 1), so we can afford a larger bound.
function floatToRational(x, maxDen = 100000) {
  if (!isFinite(x)) throw new Error("non-finite number");
  if (Number.isInteger(x)) return [x, 1];
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (b - a < 1e-15) break;
    b = 1 / (b - a);
  }
  return [sign * h1, k1];
}

// Constants
const emlConstE = () => emlExp("1");
const emlConstI = () => {
  const minusOne = emlNeg("1");
  const two = emlInt(2);
  return emlExp(emlDiv(emlLog(minusOne), two)); // I = Exp[Log[-1]/2] = exp(i*pi/2) = i
};
const emlConstPi = () => emlMul(emlNeg(emlConstI()), emlLog(emlNeg("1"))); // Pi = -I*Log[-1] = -i*(i*pi) = pi
const emlConstPhi = () => {
  const sqrt5 = emlPow(emlInt(5), emlRational(1, 2));
  const num = emlAdd("1", sqrt5);
  return emlDiv(num, emlInt(2));
};

// ============================================================
// Math expression parser (recursive descent)
// ============================================================
// Grammar:
//   expr    = term (('+' | '-') term)*
//   term    = power (('*' | '/') power | implicit power)*
//   power   = unary ('^' power)?
//   unary   = ('-' | '+') unary | atom
//   atom    = number | name call? | '(' expr ')'

class Parser {
  constructor(text) {
    this.src = text;
    this.i = 0;
  }
  peek() { return this.src[this.i]; }
  eof() { return this.i >= this.src.length; }
  skip() { while (!this.eof() && /\s/.test(this.peek())) this.i++; }
  match(s) {
    this.skip();
    if (this.src.startsWith(s, this.i)) { this.i += s.length; return true; }
    return false;
  }
  err(msg) { throw new Error(`${msg} at pos ${this.i} in "${this.src}"`); }

  parse() {
    this.skip();
    let lhs = null;
    const save = this.i;
    const name = this.tryName();
    if (name !== null) {
      this.skip();
      if (this.match("(")) {
        // f(x) = ... or f(x, y) = ...
        const args = [];
        this.skip();
        if (this.peek() !== ")") {
          const a = this.tryName();
          if (a) args.push(a);
          while (this.match(",")) {
            this.skip();
            const a2 = this.tryName();
            if (a2) args.push(a2);
          }
        }
        if (this.match(")")) {
          this.skip();
          if (this.match("=")) {
            lhs = { name, args };
          } else {
            this.i = save;
          }
        } else {
          this.i = save;
        }
      } else if (this.match("=")) {
        lhs = { name, args: null };
      } else {
        this.i = save;
      }
    } else {
      this.i = save;
    }
    const e = this.expr();
    this.skip();
    if (!this.eof()) this.err("unexpected trailing input");
    return { lhs, expr: e };
  }

  tryName() {
    this.skip();
    const start = this.i;
    if (!/[A-Za-z_]/.test(this.peek() || "")) return null;
    while (!this.eof() && /[A-Za-z_0-9]/.test(this.peek())) this.i++;
    return this.src.slice(start, this.i);
  }

  expr() {
    let left = this.term();
    for (;;) {
      this.skip();
      if (this.match("+")) left = { t: "add", l: left, r: this.term() };
      else if (this.match("-")) left = { t: "sub", l: left, r: this.term() };
      else break;
    }
    return left;
  }

  term() {
    let left = this.power();
    for (;;) {
      this.skip();
      if (this.match("*")) left = { t: "mul", l: left, r: this.power() };
      else if (this.match("/")) left = { t: "div", l: left, r: this.power() };
      else if (this.canImplicit()) left = { t: "mul", l: left, r: this.power() };
      else break;
    }
    return left;
  }

  canImplicit() {
    this.skip();
    if (this.eof()) return false;
    const c = this.peek();
    return /[A-Za-z_(]/.test(c);
  }

  power() {
    const base = this.unary();
    this.skip();
    if (this.match("^")) return { t: "pow", l: base, r: this.power() };
    return base;
  }

  unary() {
    this.skip();
    if (this.match("-")) return { t: "neg", x: this.unary() };
    if (this.match("+")) return this.unary();
    return this.atom();
  }

  atom() {
    this.skip();
    if (this.match("(")) {
      const e = this.expr();
      if (!this.match(")")) this.err("expected ')'");
      return e;
    }
    // number
    const nStart = this.i;
    if (/[0-9.]/.test(this.peek() || "")) {
      while (!this.eof() && /[0-9.]/.test(this.peek())) this.i++;
      // optional exponent
      if (/[eE]/.test(this.peek() || "")) {
        this.i++;
        if (/[+\-]/.test(this.peek() || "")) this.i++;
        while (!this.eof() && /[0-9]/.test(this.peek())) this.i++;
      }
      const num = Number(this.src.slice(nStart, this.i));
      if (isNaN(num)) this.err("bad number");
      return { t: "num", v: num };
    }
    const name = this.tryName();
    if (name === null) this.err("expected atom");
    this.skip();
    if (this.match("(")) {
      const args = [];
      this.skip();
      if (!this.match(")")) {
        args.push(this.expr());
        while (this.match(",")) args.push(this.expr());
        if (!this.match(")")) this.err("expected ')'");
      }
      return { t: "call", name, args };
    }
    return { t: "name", name };
  }
}

function parseMath(text) {
  const result = new Parser(text).parse();
  return result;
}

// ============================================================
// Emit EML from math AST
// ============================================================

const KNOWN_CONST = {
  pi: emlConstPi,
  Pi: emlConstPi,
  PI: emlConstPi,
  e: emlConstE,
  E: null,           // ambiguous — let the user use exp(1). Treat bare E as e though.
  i: emlConstI,
  I: emlConstI,
  phi: emlConstPhi,
  tau: () => emlMul(emlInt(2), emlConstPi()),
};

function compileToEML(node, defs) {
  return emit(node, defs || {});
}

function emit(n, defs) {
  switch (n.t) {
    case "num": {
      if (Number.isInteger(n.v)) return emlInt(n.v);
      // Split a decimal into integer + fractional parts. This is much
      // cheaper than rationalizing the whole number, because the fractional
      // part rationalizes with a small denominator while the integer part
      // stays a clean integer. Example: 100.00111 ≈ 100 + 1/900, vs. the
      // combined form which would need a ~90000-denominator rational.
      const sign = n.v < 0 ? -1 : 1;
      const abs = Math.abs(n.v);
      const intPart = Math.floor(abs);
      const frac = abs - intPart;
      const [p, q] = floatToRational(frac);
      let result;
      if (intPart === 0) result = emlRational(p, q);
      else if (p === 0) result = emlInt(intPart);
      else result = emlAdd(emlInt(intPart), emlRational(p, q));
      return sign < 0 ? emlNeg(result) : result;
    }
    case "name": {
      if (n.name === "x") return n.name;
      // Check user-defined variables first
      if (defs.vars && defs.vars[n.name] !== undefined) return defs.vars[n.name];
      if (n.name === "E") return emlConstE(); // treat bare E as Euler's
      const cfn = KNOWN_CONST[n.name];
      if (cfn) return cfn();
      throw new Error(`unknown name: ${n.name}`);
    }
    case "neg": return emlNeg(emit(n.x, defs));
    case "add": return emlAdd(emit(n.l, defs), emit(n.r, defs));
    case "sub": return emlSub(emit(n.l, defs), emit(n.r, defs));
    case "mul": return emlMul(emit(n.l, defs), emit(n.r, defs));
    case "div": return emlDiv(emit(n.l, defs), emit(n.r, defs));
    case "pow": return emlPow(emit(n.l, defs), emit(n.r, defs));
    case "call": return emitCall(n, defs);
    default: throw new Error(`bad node: ${n.t}`);
  }
}

function emitCall(n, defs) {
  const f = n.name;
  const a = n.args;
  // Check user-defined functions first
  if (defs.funcs && defs.funcs[f]) {
    const def = defs.funcs[f];
    // Build a local defs with function params mapped to emitted args
    const localVars = Object.assign({}, defs.vars || {});
    for (let i = 0; i < def.params.length && i < a.length; i++) {
      localVars[def.params[i]] = emit(a[i], defs);
    }
    return emit(def.bodyAst, { vars: localVars, funcs: defs.funcs });
  }
  const E = (node) => emit(node, defs);
  if (f === "exp" || f === "Exp") return emlExp(E(a[0]));
  if (f === "log" || f === "ln" || f === "Log" || f === "Ln") {
    if (a.length === 1) return emlLog(E(a[0]));
    if (a.length === 2) return emlDiv(emlLog(E(a[0])), emlLog(E(a[1]))); // log_b(x) second by Mathematica convention: Log[b,z]
    throw new Error("log expects 1 or 2 args");
  }
  if (f === "log2") return emlDiv(emlLog(E(a[0])), emlLog(emlInt(2)));
  if (f === "log10") return emlDiv(emlLog(E(a[0])), emlLog(emlInt(10)));
  if (f === "sqrt" || f === "Sqrt") return emlPow(E(a[0]), emlRational(1, 2));
  if (f === "cbrt") return emlPow(E(a[0]), emlRational(1, 3));
  if (f === "abs" || f === "Abs") {
    // For real x, abs(x) = sqrt(x^2). Correct for real inputs; graph-only.
    const x = E(a[0]);
    return emlPow(emlPow(x, emlInt(2)), emlRational(1, 2));
  }
  if (f === "sign") {
    // sign(x) = x / sqrt(x^2) for real nonzero; undefined at 0.
    const x = E(a[0]);
    return emlDiv(x, emlPow(emlPow(x, emlInt(2)), emlRational(1, 2)));
  }
  // Hyperbolics
  if (f === "sinh" || f === "Sinh") {
    const x = E(a[0]);
    return emlHalf(emlSub(emlExp(x), emlExp(emlNeg(x))));
  }
  if (f === "cosh" || f === "Cosh") {
    const x = E(a[0]);
    return emlHalf(emlAdd(emlExp(x), emlExp(emlNeg(x))));
  }
  if (f === "tanh" || f === "Tanh") {
    const x = E(a[0]);
    const ep = emlExp(x), en = emlExp(emlNeg(x));
    return emlDiv(emlSub(ep, en), emlAdd(ep, en));
  }
  // Circular via Euler
  if (f === "sin" || f === "Sin") {
    const ix = emlMul(emlConstI(), E(a[0]));
    const num = emlSub(emlExp(ix), emlExp(emlNeg(ix)));
    const den = emlMul(emlInt(2), emlConstI());
    return emlDiv(num, den);
  }
  if (f === "cos" || f === "Cos") {
    const ix = emlMul(emlConstI(), E(a[0]));
    return emlHalf(emlAdd(emlExp(ix), emlExp(emlNeg(ix))));
  }
  if (f === "tan" || f === "Tan") {
    const ix = emlMul(emlConstI(), E(a[0]));
    const sPlus = emlExp(ix), sMinus = emlExp(emlNeg(ix));
    const num = emlSub(sPlus, sMinus);
    const den = emlAdd(sPlus, sMinus);
    return emlDiv(emlDiv(num, emlConstI()), den);
  }
  if (f === "sec" || f === "Sec") return emlInv(emitCall({ name: "cos", args: a }));
  if (f === "csc" || f === "Csc") return emlInv(emitCall({ name: "sin", args: a }));
  if (f === "cot" || f === "Cot") return emlInv(emitCall({ name: "tan", args: a }));
  // Inverse trig via log identities (from eml_compiler_v4.py lines 80-85)
  if (f === "asin" || f === "ArcSin") {
    // I*log(-I*z + sqrt(1-z^2))
    const z = E(a[0]);
    const iz = emlMul(emlConstI(), z);
    const root = emlPow(emlSub("1", emlPow(z, emlInt(2))), emlRational(1, 2));
    return emlMul(emlConstI(), emlLog(emlAdd(emlNeg(iz), root)));
  }
  if (f === "acos" || f === "ArcCos") {
    // pi/2 - asin(z)
    const asinZ = emitCall({ name: "asin", args: a });
    return emlSub(emlDiv(emlConstPi(), emlInt(2)), asinZ);
  }
  if (f === "atan" || f === "ArcTan") {
    // (-I/2) * log((-I+z)/(-I-z))   (from v4)
    const z = E(a[0]);
    const negI = emlNeg(emlConstI());
    const num = emlAdd(negI, z);
    const den = emlSub(negI, z);
    const coef = emlDiv(emlNeg(emlConstI()), emlInt(2));
    return emlMul(coef, emlLog(emlDiv(num, den)));
  }
  if (f === "asinh" || f === "ArcSinh") {
    const z = E(a[0]);
    const root = emlPow(emlAdd(emlPow(z, emlInt(2)), "1"), emlRational(1, 2));
    return emlLog(emlAdd(z, root));
  }
  if (f === "acosh" || f === "ArcCosh") {
    const z = E(a[0]);
    // log(z + sqrt(z-1)*sqrt(z+1))
    const root = emlMul(
      emlPow(emlSub(z, "1"), emlRational(1, 2)),
      emlPow(emlAdd(z, "1"), emlRational(1, 2))
    );
    return emlLog(emlAdd(z, root));
  }
  if (f === "atanh" || f === "ArcTanh") {
    const z = E(a[0]);
    // (1/2)*log((1+z)/(1-z))
    return emlMul(emlRational(1, 2), emlLog(emlDiv(emlAdd("1", z), emlSub("1", z))));
  }
  throw new Error(`unsupported function: ${f}`);
}

// Public convenience: string in, EML string out.
function compileMath(text) {
  const parsed = parseMath(text);
  return compileToEML(parsed.expr);
}

// Detect if math AST references the variable x (or user-defined names that depend on x).
function mathUsesX(node, defs) {
  if (!node) return false;
  if (node.t === "name") {
    if (node.name === "x") return true;
    // Check if user-defined variable depends on x
    if (defs && defs.varUsesX && defs.varUsesX[node.name]) return true;
    return false;
  }
  if (node.t === "call") {
    // Check if user-defined function body uses x (beyond its params)
    if (defs && defs.funcUsesX && defs.funcUsesX[node.name]) return true;
    return node.args.some(a => mathUsesX(a, defs));
  }
  if (node.t === "num") return false;
  if (node.t === "neg") return mathUsesX(node.x, defs);
  return mathUsesX(node.l, defs) || mathUsesX(node.r, defs);
}
