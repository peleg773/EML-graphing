# EML Calculator

A graphing calculator that compiles standard math expressions into **EML** (Elementary Mathematical Language) — a minimal notation where every real elementary function is expressed using a single two-argument primitive:

```
E(a, b) = exp(a) − log(b)
```

with only `1` and `x` as atoms.

This is based on the result from [Odrzywołek (2026)](https://arxiv.org/abs/2603.21852), which shows that every real elementary function (polynomials, trig, exponentials, logarithms, their inverses and compositions) can be written this way.

## Features

- **Live graphing** — type an expression like `sin(x)`, `x^2 / 4`, or `exp(-x^2)` and see it plotted instantly
- **EML compilation** — every expression is compiled to its EML representation, shown in the right panel. You can edit the EML directly to graph arbitrary EML trees
- **Custom variables & functions** — define `a = 3` or `f(x) = x^2 + 1` in one row and use `a` or `f(x)` in later rows
- **MathJax preview** — each expression renders as formatted math below the input
- **Style controls** — click a row's color circle to show/hide it; long-press for color, thickness, line style (solid, dashed, points), and opacity
- **Pan & zoom** — drag to pan, scroll to zoom, double-click to reset
- **Dark/light theme** toggle
- **Constant evaluation** — expressions that don't depend on `x` display their numeric value

## Supported syntax

| Input | Description |
|---|---|
| `x`, `1`, `2.5`, `pi`, `e`, `i`, `phi`, `tau` | Variables and constants |
| `+`, `-`, `*`, `/`, `^` | Arithmetic operators |
| `sin`, `cos`, `tan`, `sec`, `csc`, `cot` | Trig functions |
| `asin`, `acos`, `atan` | Inverse trig |
| `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh` | Hyperbolics |
| `exp`, `ln`, `log`, `log2`, `log10` | Exponentials and logarithms |
| `sqrt`, `cbrt`, `abs`, `sign` | Other standard functions |
| `a = 5` | Define a variable |
| `f(x) = x^2 + 1` | Define a function |

## How it works

1. Your math expression is parsed into an AST
2. The AST is compiled into an EML string using identities like:
   - `a + b = E(log(a), E(1, E(1, b)))` (addition via exp/log)
   - `sin(x) = (e^(ix) − e^(−ix)) / 2i` (Euler's formula)
   - Integers are built from `1` using multiplication and addition
3. The EML string is parsed back into an EML tree
4. Constant subtrees are pre-evaluated for performance
5. The tree is evaluated per-pixel to render the graph

## Running locally

Just open `index.html` in a browser. No build step or dependencies needed (MathJax is loaded from a CDN for the math previews).

## Files

- `index.html` — page layout and keypad
- `app.js` — UI logic, row management, user-defined variables/functions
- `compiler.js` — math parser and EML compiler
- `eml.js` — EML parser, evaluator, and optimizer
- `complex.js` — complex number arithmetic
- `graph.js` — canvas-based plotter with pan/zoom
- `styles.css` — dark/light theme styles
