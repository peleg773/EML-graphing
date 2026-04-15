// EML parser / evaluator / printer.
// Mirrors eml_solver.py but in JS with our Complex type.

// --- AST ---
// node = { sym: '1' | 'x' | 'E', l?, r? }
const ONE = { sym: "1" };
const X = { sym: "x" };

function parseEML(text) {
  // Accept both E(,) and EML[,] per eml_solver.py.
  const s = text.replace(/EML/g, "E").replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, "");
  let i = 0;

  function expr() {
    const ch = s[i];
    if (ch === "1") { i++; return ONE; }
    if (ch === "x") { i++; return X; }
    if (s.startsWith("E(", i)) {
      i += 2;
      const l = expr();
      if (s[i] !== ",") throw new Error(`expected ',' at ${i}`);
      i++;
      const r = expr();
      if (s[i] !== ")") throw new Error(`expected ')' at ${i}`);
      i++;
      return { sym: "E", l, r };
    }
    throw new Error(`unexpected token at ${i}: ${s.slice(i, i + 10)}`);
  }

  const root = expr();
  if (i !== s.length) throw new Error(`trailing text at ${i}: ${s.slice(i, i + 20)}`);
  return root;
}

function renderEML(node, style = "E") {
  const open = style === "EML" ? "[" : "(";
  const close = style === "EML" ? "]" : ")";
  const name = style === "EML" ? "EML" : "E";
  function go(n) {
    if (n.sym !== "E") return n.sym;
    return `${name}${open}${go(n.l)},${go(n.r)}${close}`;
  }
  return go(node);
}

function countChars(node) {
  if (node.sym !== "E") return 1;
  return 4 + countChars(node.l) + countChars(node.r);
}

function countTokens(node) {
  if (node.sym !== "E") return 1;
  return 1 + countTokens(node.l) + countTokens(node.r);
}

function usesX(node) {
  if (node.sym === "x") return true;
  if (node.sym !== "E") return false;
  return usesX(node.l) || usesX(node.r);
}

function evalEML(node, env = {}) {
  const x = env.x !== undefined ? (typeof env.x === "number" ? C(env.x, 0) : env.x) : C(0, 0);

  // Post-order walk; memoize by node identity.
  const memo = new Map();
  function visit(n) {
    if (memo.has(n)) return memo.get(n);
    let v;
    if (n.sym === "1") v = CONE;
    else if (n.sym === "x") v = x;
    else {
      const a = visit(n.l);
      const b = visit(n.r);
      // log(0) = -inf (real). Represent as a very negative real.
      let logb;
      if (b.re === 0 && b.im === 0) logb = C(-Infinity, 0);
      else logb = cLog(b);
      v = cSub(cExp(a), logb);
    }
    memo.set(n, v);
    return v;
  }
  return visit(node);
}

// Convenience for graphing: evaluate a real sample, filter out non-real results.
function evalRealAt(node, xReal) {
  const v = evalEML(node, { x: xReal });
  if (!isFinite(v.re) || !isFinite(v.im)) return NaN;
  if (Math.abs(v.im) > 1e-6 * (1 + Math.abs(v.re))) return NaN;
  return v.re;
}
