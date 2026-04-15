const PALETTE = ["#6ea8fe", "#ff8fa3", "#7ee787", "#f2cc60", "#c4a7e7", "#76e4d8", "#ffb38a"];

const state = {
  rows: [],       // { id, text, color, visible, error, emlString, emlNode, astUsesX, value, source: 'math'|'eml' }
  selectedId: null,
  style: "E",     // "E" or "EML"
  dark: true,
};

let rowSeq = 0;

const els = {};
let graph;

function $(id) { return document.getElementById(id); }

function init() {
  els.rows = $("rows");
  els.addRow = $("add-row");
  els.emlOut = $("eml-out");
  els.emlStats = $("eml-stats");
  els.emlCopy = $("eml-copy");
  els.themeToggle = $("theme-toggle");
  els.resetView = $("reset-view");
  els.rowValue = $("row-value");

  graph = new Graph($("canvas"));
  window.addEventListener("resize", () => graph.resize());

  els.addRow.addEventListener("click", () => { addRow(""); });
  els.emlCopy.addEventListener("click", copyEml);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.resetView.addEventListener("click", () => graph.reset());

  els.emlOut.addEventListener("input", onEmlEdited);

  // Keypad: insert symbols at cursor of the selected row's input.
  document.getElementById("keypad").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-k]");
    if (!btn) return;
    const k = btn.dataset.k;
    const row = currentRow();
    if (!row) return;
    const card = els.rows.querySelector(`.row[data-id="${row.id}"]`);
    const input = card && card.querySelector(".row-input");
    if (!input || input.disabled) return;
    input.focus();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    let newVal, caret;
    if (k === "backspace") {
      if (start === end && start > 0) {
        newVal = input.value.slice(0, start - 1) + input.value.slice(end);
        caret = start - 1;
      } else {
        newVal = input.value.slice(0, start) + input.value.slice(end);
        caret = start;
      }
    } else {
      newVal = input.value.slice(0, start) + k + input.value.slice(end);
      caret = start + k.length;
    }
    input.value = newVal;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  addRow("sin(x)");
  addRow("x^2 / 4");
  addRow("pi");
}

function addRow(text) {
  const id = ++rowSeq;
  const row = {
    id,
    text,
    color: PALETTE[(state.rows.length) % PALETTE.length],
    visible: true,
    error: null,
    emlString: null,
    emlNode: null,
    astUsesX: false,
    value: null,
    source: "math",
  };
  state.rows.push(row);
  state.selectedId = id;
  renderRows();
  recompileRow(row);
  redraw();
  // Auto-focus the input of the newly added row.
  const newCard = els.rows.querySelector(`.row[data-id="${id}"]`);
  const newInput = newCard && newCard.querySelector(".row-input");
  if (newInput && !newInput.disabled) newInput.focus();
}

function deleteRow(id) {
  state.rows = state.rows.filter((r) => r.id !== id);
  if (state.selectedId === id) state.selectedId = state.rows.length ? state.rows[0].id : null;
  renderRows();
  redraw();
}

function markSelected() {
  for (const el of els.rows.querySelectorAll(".row")) {
    el.classList.toggle("selected", Number(el.dataset.id) === state.selectedId);
  }
}

function renderRows() {
  // Preserve focus + cursor on the currently focused input, if any.
  const active = document.activeElement;
  const wasFocusedRowId = active && active.classList && active.classList.contains("row-input")
    ? Number(active.closest(".row")?.dataset.id) : null;
  const caret = wasFocusedRowId ? [active.selectionStart, active.selectionEnd] : null;

  els.rows.innerHTML = "";
  for (const r of state.rows) {
    const card = document.createElement("div");
    card.className = "row" + (state.selectedId === r.id ? " selected" : "");
    card.dataset.id = r.id;

    const chip = document.createElement("button");
    chip.className = "chip";
    chip.style.background = r.visible ? r.color : "transparent";
    chip.style.borderColor = r.color;
    chip.title = "Change color / toggle visibility";
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      openColorPopover(chip, r);
    });

    const input = document.createElement("input");
    input.className = "row-input";
    if (r.source === "eml" && r.emlNode) {
      input.value = `⟨EML source — ${countTokens(r.emlNode)} tokens⟩`;
      input.disabled = true;
    } else {
      input.value = r.text;
    }
    input.placeholder = "e.g. sin(x) + 1";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      r.text = input.value;
      r.source = "math";
      recompileRow(r);
      redraw();
      updateRowBadge(card, r);
      updateRowPreview(card, r);
    });
    input.addEventListener("dblclick", () => {
      if (input.disabled) {
        r.source = "math";
        input.disabled = false;
        input.value = r.text || "";
        input.focus();
      }
    });
    input.addEventListener("focus", () => {
      state.selectedId = r.id;
      markSelected();
      refreshEmlPanel();
    });

    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.title = "Delete row";
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteRow(r.id); });

    card.addEventListener("mousedown", (e) => {
      // Clicking anywhere on the row card selects it and focuses the input,
      // unless the click was on an interactive child (chip, delete button).
      if (e.target.closest("button")) return;
      state.selectedId = r.id;
      markSelected();
      refreshEmlPanel();
      const inp = card.querySelector(".row-input");
      if (!inp || inp.disabled) return;
      // If the click landed on the input itself, let the browser position the
      // caret at the clicked character naturally — don't preventDefault.
      if (e.target === inp) return;
      // Clicked on the card background: focus the input at the end.
      e.preventDefault();
      inp.focus();
      const len = inp.value.length;
      inp.setSelectionRange(len, len);
    });

    card.appendChild(chip);
    card.appendChild(input);
    card.appendChild(del);

    const preview = document.createElement("div");
    preview.className = "row-preview";
    card.appendChild(preview);

    const badge = document.createElement("div");
    badge.className = "row-badge";
    card.appendChild(badge);

    els.rows.appendChild(card);
    updateRowBadge(card, r);
    updateRowPreview(card, r);
  }
  if (wasFocusedRowId) {
    const card = els.rows.querySelector(`.row[data-id="${wasFocusedRowId}"]`);
    const inp = card && card.querySelector(".row-input");
    if (inp && !inp.disabled) {
      inp.focus();
      if (caret) inp.setSelectionRange(caret[0], caret[1]);
    }
  }
  refreshEmlPanel();
}

function updateRowPreview(card, r) {
  const preview = card.querySelector(".row-preview");
  if (!preview) return;
  if (r.source === "eml" || !r.text.trim() || r.error) { preview.innerHTML = ""; return; }
  try {
    const ast = parseMath(r.text);
    const tex = astToTex(ast);
    preview.innerHTML = `\\(\\displaystyle ${tex}\\)`;
    preview.dataset.tex = tex;
    if (window.__mathjaxReady && window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([preview]).catch((e) => console.warn("MathJax typeset failed", e));
    }
  } catch {
    preview.innerHTML = "";
  }
}

function retypesetAllPreviews() {
  if (!window.MathJax || !window.MathJax.typesetPromise) return;
  const nodes = document.querySelectorAll(".row-preview");
  window.MathJax.typesetPromise(Array.from(nodes)).catch((e) => console.warn("MathJax retypeset failed", e));
}
window.retypesetAllPreviews = retypesetAllPreviews;

function updateRowBadge(card, r) {
  const badge = card.querySelector(".row-badge");
  badge.className = "row-badge";
  if (r.error) {
    badge.classList.add("error");
    badge.textContent = r.error;
    return;
  }
  if (r.source === "eml") {
    badge.classList.add("eml-mode");
    badge.textContent = "EML source — edit it on the right";
    return;
  }
  if (!r.astUsesX && r.value !== null) {
    badge.classList.add("value");
    badge.textContent = "= " + cToString(r.value, 12);
    return;
  }
  if (r.emlString) {
    badge.textContent = `${countTokens(r.emlNode)} tokens`;
  } else {
    badge.textContent = "";
  }
}

function recompileRow(r) {
  r.error = null;
  r.emlString = null;
  r.emlNode = null;
  r.astUsesX = false;
  r.value = null;
  if (!r.text.trim()) return;
  try {
    const ast = parseMath(r.text);
    r.astUsesX = mathUsesX(ast);
    const emlString = compileToEML(ast);
    r.emlString = emlString;
    r.emlNode = parseEML(emlString);
    if (!r.astUsesX) {
      r.value = evalEML(r.emlNode, {});
    }
  } catch (e) {
    r.error = e.message;
  }
}

function currentRow() {
  return state.rows.find((r) => r.id === state.selectedId);
}

function refreshEmlPanel() {
  const r = currentRow();
  if (!r) {
    els.emlOut.value = "";
    els.emlStats.textContent = "";
    els.rowValue.textContent = "";
    return;
  }
  if (r.emlNode) {
    const text = renderEML(r.emlNode, "E");
    if (document.activeElement !== els.emlOut) els.emlOut.value = text;
    els.emlStats.textContent = `${countTokens(r.emlNode)} tokens`;
  } else {
    els.emlOut.value = "";
    els.emlStats.textContent = r.error ? `error: ${r.error}` : "";
  }
  if (!r.astUsesX && r.value !== null) {
    els.rowValue.textContent = "≈ " + cToString(r.value, 16);
  } else if (r.astUsesX && r.emlNode) {
    els.rowValue.textContent = "Function of x";
  } else {
    els.rowValue.textContent = "";
  }
}

function onEmlEdited() {
  const r = currentRow();
  if (!r) return;
  const text = els.emlOut.value;
  try {
    const node = parseEML(text);
    r.source = "eml";
    r.emlString = renderEML(node, "E");
    r.emlNode = node;
    r.astUsesX = usesX(node);
    r.error = null;
    if (!r.astUsesX) r.value = evalEML(node, {});
    else r.value = null;
    // Reflect to input
    const card = els.rows.querySelector(`.row[data-id="${r.id}"]`);
    if (card) {
      card.querySelector(".row-input").value = `<EML expression (${countTokens(node)} tokens)>`;
      card.querySelector(".row-input").disabled = true;
      updateRowBadge(card, r);
    }
    els.emlStats.textContent = `${countTokens(node)} tokens`;
    redraw();
  } catch (e) {
    els.emlStats.textContent = `parse error: ${e.message}`;
  }
}

function copyEml() {
  const text = els.emlOut.value;
  navigator.clipboard.writeText(text).then(() => {
    const orig = els.emlCopy.textContent;
    els.emlCopy.textContent = "Copied!";
    setTimeout(() => { els.emlCopy.textContent = orig; }, 900);
  });
}

function toggleTheme() {
  state.dark = !state.dark;
  document.body.classList.toggle("light", !state.dark);
  graph.setDark(state.dark);
}

function redraw() {
  const traces = state.rows
    .filter((r) => r.visible && r.emlNode && (r.astUsesX || usesX(r.emlNode)))
    .map((r) => ({
      color: r.color,
      visible: r.visible,
      sampler: (x) => evalRealAt(r.emlNode, x),
    }));
  graph.setTraces(traces);
  refreshEmlPanel();
}

// ---- Color popover (click the chip to change color or hide/show) -----
let openPopover = null;
function closeColorPopover() {
  if (openPopover) {
    openPopover.remove();
    openPopover = null;
    document.removeEventListener("mousedown", onDocMousedown, true);
  }
}
function onDocMousedown(e) {
  if (openPopover && !openPopover.contains(e.target)) closeColorPopover();
}
function openColorPopover(anchor, r) {
  if (openPopover) { closeColorPopover(); return; }
  const pop = document.createElement("div");
  pop.className = "color-popover";

  const swatches = document.createElement("div");
  swatches.className = "swatches";
  for (const c of PALETTE) {
    const sw = document.createElement("button");
    sw.className = "swatch" + (c === r.color ? " active" : "");
    sw.style.background = c;
    sw.addEventListener("click", (e) => {
      e.stopPropagation();
      r.color = c;
      r.visible = true;
      closeColorPopover();
      renderRows();
      redraw();
    });
    swatches.appendChild(sw);
  }
  pop.appendChild(swatches);

  const toggle = document.createElement("button");
  toggle.className = "popover-toggle";
  toggle.textContent = r.visible ? "Hide" : "Show";
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    r.visible = !r.visible;
    closeColorPopover();
    renderRows();
    redraw();
  });
  pop.appendChild(toggle);

  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  pop.style.left = `${rect.left}px`;
  pop.style.top = `${rect.bottom + 6}px`;
  // Clamp to viewport
  const pr = pop.getBoundingClientRect();
  if (pr.right > window.innerWidth - 8) {
    pop.style.left = `${window.innerWidth - pr.width - 8}px`;
  }
  openPopover = pop;
  setTimeout(() => document.addEventListener("mousedown", onDocMousedown, true), 0);
}

// ---- TeX emission for the math preview --------------------------------
function astToTex(n, ctx = 0) {
  // ctx: 0 = top, 1 = add/sub operand, 2 = mul/div operand, 3 = pow base
  const P = { add: 1, sub: 1, mul: 2, div: 2, neg: 2, pow: 3 };
  switch (n.t) {
    case "num": {
      if (Number.isInteger(n.v)) return String(n.v);
      return String(n.v);
    }
    case "name": {
      const specials = { pi: "\\pi", phi: "\\varphi", tau: "\\tau", e: "e", i: "i" };
      return specials[n.name] || n.name;
    }
    case "neg": {
      const inner = astToTex(n.x, 2);
      const s = `-${inner}`;
      return ctx >= 2 ? `\\left(${s}\\right)` : s;
    }
    case "add": {
      const s = `${astToTex(n.l, 1)} + ${astToTex(n.r, 1)}`;
      return ctx >= 2 ? `\\left(${s}\\right)` : s;
    }
    case "sub": {
      const s = `${astToTex(n.l, 1)} - ${astToTex(n.r, 2)}`;
      return ctx >= 2 ? `\\left(${s}\\right)` : s;
    }
    case "mul": {
      // Use \cdot only if the right side starts with a digit; otherwise juxtapose.
      const L = astToTex(n.l, 2);
      const R = astToTex(n.r, 2);
      const needsDot = /^[\d]/.test(stripTex(R));
      const s = needsDot ? `${L} \\cdot ${R}` : `${L}\\,${R}`;
      return ctx >= 3 ? `\\left(${s}\\right)` : s;
    }
    case "div": {
      return `\\frac{${astToTex(n.l, 0)}}{${astToTex(n.r, 0)}}`;
    }
    case "pow": {
      // sqrt special-case if exponent is literal 1/2
      if (n.r.t === "div" && n.r.l.t === "num" && n.r.l.v === 1 && n.r.r.t === "num" && n.r.r.v === 2) {
        return `\\sqrt{${astToTex(n.l, 0)}}`;
      }
      const base = astToTex(n.l, 3);
      const exp = astToTex(n.r, 0);
      const s = `{${base}}^{${exp}}`;
      return ctx >= 3 ? `\\left(${s}\\right)` : s;
    }
    case "call": {
      if (n.name === "sqrt" || n.name === "Sqrt") return `\\sqrt{${astToTex(n.args[0], 0)}}`;
      if (n.name === "cbrt") return `\\sqrt[3]{${astToTex(n.args[0], 0)}}`;
      if (n.name === "abs" || n.name === "Abs") return `\\left|${astToTex(n.args[0], 0)}\\right|`;
      if (n.name === "exp" || n.name === "Exp") return `e^{${astToTex(n.args[0], 0)}}`;
      const trigs = ["sin","cos","tan","sec","csc","cot","sinh","cosh","tanh","log","ln"];
      const inverses = {asin:"\\arcsin", acos:"\\arccos", atan:"\\arctan",
                        asinh:"\\operatorname{arcsinh}", acosh:"\\operatorname{arccosh}", atanh:"\\operatorname{arctanh}"};
      const nm = n.name.toLowerCase();
      const args = n.args.map(a => astToTex(a, 0)).join(",");
      if (trigs.includes(nm)) return `\\${nm}\\left(${args}\\right)`;
      if (inverses[nm]) return `${inverses[nm]}\\left(${args}\\right)`;
      return `\\operatorname{${n.name}}\\left(${args}\\right)`;
    }
  }
  return "";
}
function stripTex(s) { return s.replace(/^\\left\(|\\cdot|\\,|^\{|\}$/g, ""); }

window.addEventListener("DOMContentLoaded", init);
