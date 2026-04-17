const PALETTE = ["#6ea8fe", "#ff8fa3", "#7ee787", "#f2cc60", "#c4a7e7", "#76e4d8", "#ffb38a"];

const state = {
  rows: [],
  selectedId: null,
  style: "E",
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

  graph.onViewChange = () => {
    updateSpecialPoints();
  };

  els.addRow.addEventListener("click", () => { addRow(""); });
  els.emlCopy.addEventListener("click", copyEml);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.resetView.addEventListener("click", () => graph.reset());

  els.emlOut.addEventListener("input", onEmlEdited);

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
  addRow("x^2 / 4.5");
  addRow("pi");

  // Ensure special points are computed after layout is fully resolved
  requestAnimationFrame(() => {
    graph.resize();
    redraw();
  });
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
    optimizedNode: null,
    astUsesX: false,
    value: null,
    source: "math",
    defName: null,
    defArgs: null,
    defBodyAst: null,
    thickness: 2,
    lineStyle: "line",
    opacity: 1,
    sliderMin: -10,
    sliderMax: 10,
    sliderStep: 0.1,
  };
  state.rows.push(row);
  state.selectedId = id;
  recompileAll();
  renderRows();
  redraw();
  const newCard = els.rows.querySelector(`.row[data-id="${id}"]`);
  const newInput = newCard && newCard.querySelector(".row-input");
  if (newInput && !newInput.disabled) newInput.focus();
}

function deleteRow(id) {
  state.rows = state.rows.filter((r) => r.id !== id);
  if (state.selectedId === id) state.selectedId = state.rows.length ? state.rows[0].id : null;
  recompileAll();
  renderRows();
  redraw();
}

function markSelected() {
  for (const el of els.rows.querySelectorAll(".row")) {
    el.classList.toggle("selected", Number(el.dataset.id) === state.selectedId);
  }
}

function isParamRow(r) {
  return r.defName && !r.defArgs && !r.astUsesX && r.value !== null && r.source === "math";
}

function renderRows() {
  const active = document.activeElement;
  const wasFocusedRowId = active && active.classList && active.classList.contains("row-input")
    ? Number(active.closest(".row")?.dataset.id) : null;
  const caret = wasFocusedRowId ? [active.selectionStart, active.selectionEnd] : null;
  const wasFocusedSlider = active && active.classList && active.classList.contains("param-slider")
    ? Number(active.closest(".row")?.dataset.id) : null;

  els.rows.innerHTML = "";
  for (const r of state.rows) {
    const card = document.createElement("div");
    card.className = "row" + (state.selectedId === r.id ? " selected" : "");
    card.dataset.id = r.id;

    const chip = document.createElement("button");
    chip.className = "chip";
    chip.style.background = r.visible ? r.color : "transparent";
    chip.style.borderColor = r.color;
    if (!r.visible) chip.classList.add("chip-hidden");
    chip.title = "Click to hide/show · Long-press for style options";

    let pressTimer = null;
    let didLongPress = false;
    chip.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      didLongPress = false;
      pressTimer = setTimeout(() => {
        didLongPress = true;
        openStylePopover(chip, r);
      }, 400);
    });
    chip.addEventListener("mouseup", (e) => {
      e.stopPropagation();
      clearTimeout(pressTimer);
      if (!didLongPress) {
        r.visible = !r.visible;
        renderRows();
        redraw();
      }
    });
    chip.addEventListener("mouseleave", () => {
      clearTimeout(pressTimer);
    });
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    chip.addEventListener("touchstart", (e) => {
      e.stopPropagation();
      didLongPress = false;
      pressTimer = setTimeout(() => {
        didLongPress = true;
        openStylePopover(chip, r);
      }, 400);
    }, { passive: true });
    chip.addEventListener("touchend", (e) => {
      e.stopPropagation();
      clearTimeout(pressTimer);
      if (!didLongPress) {
        r.visible = !r.visible;
        renderRows();
        redraw();
      }
    });

    const input = document.createElement("input");
    input.className = "row-input";
    if (r.source === "eml" && r.emlNode) {
      input.value = `⟨EML source — ${countTokens(r.emlNode)} tokens⟩`;
      input.disabled = true;
    } else {
      input.value = r.text;
    }
    input.placeholder = "e.g. sin(x) + 1  or  a = 3";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      r.text = input.value;
      r.source = "math";
      recompileAll();
      redraw();
      for (const card2 of els.rows.querySelectorAll(".row")) {
        const r2 = state.rows.find(rr => rr.id === Number(card2.dataset.id));
        if (r2) {
          updateRowBadge(card2, r2);
          updateRowPreview(card2, r2);
          updateRowSlider(card2, r2);
        }
      }
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
      if (e.target.closest("button")) return;
      if (e.target.closest(".param-slider-row")) return;
      state.selectedId = r.id;
      markSelected();
      refreshEmlPanel();
      const inp = card.querySelector(".row-input");
      if (!inp || inp.disabled) return;
      if (e.target === inp) return;
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

    // Parameter slider
    if (isParamRow(r)) {
      const sliderRow = document.createElement("div");
      sliderRow.className = "param-slider-row";

      const val = r.value.re !== undefined ? r.value.re : r.value;
      // Clip value if outside range
      if (val < r.sliderMin) {
        r.text = `${r.defName} = ${r.sliderMin}`;
        recompileAll();
      }
      if (val > r.sliderMax) {
        r.text = `${r.defName} = ${r.sliderMax}`;
        recompileAll();
      }
      const clampedVal = Math.max(r.sliderMin, Math.min(r.sliderMax, val));

      const minLabel = document.createElement("input");
      minLabel.type = "number";
      minLabel.className = "slider-bound";
      minLabel.value = r.sliderMin;
      minLabel.title = "Slider minimum";
      minLabel.addEventListener("change", () => {
        r.sliderMin = Number(minLabel.value);
        const curVal = r.value.re !== undefined ? r.value.re : r.value;
        if (curVal < r.sliderMin) {
          r.text = `${r.defName} = ${r.sliderMin}`;
          recompileAll();
          redraw();
        }
        renderRows();
      });

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "param-slider";
      slider.min = r.sliderMin;
      slider.max = r.sliderMax;
      slider.step = r.sliderStep;
      slider.value = clampedVal;
      slider.addEventListener("input", () => {
        const newVal = Number(slider.value);
        r.text = `${r.defName} = ${newVal}`;
        const inp = card.querySelector(".row-input");
        if (inp) inp.value = r.text;
        recompileAll();
        redraw();
        for (const card2 of els.rows.querySelectorAll(".row")) {
          const r2 = state.rows.find(rr => rr.id === Number(card2.dataset.id));
          if (r2) {
            updateRowBadge(card2, r2);
            updateRowPreview(card2, r2);
          }
        }
      });

      const maxLabel = document.createElement("input");
      maxLabel.type = "number";
      maxLabel.className = "slider-bound";
      maxLabel.value = r.sliderMax;
      maxLabel.title = "Slider maximum";
      maxLabel.addEventListener("change", () => {
        r.sliderMax = Number(maxLabel.value);
        const curVal = r.value.re !== undefined ? r.value.re : r.value;
        if (curVal > r.sliderMax) {
          r.text = `${r.defName} = ${r.sliderMax}`;
          recompileAll();
          redraw();
        }
        renderRows();
      });

      const stepLabel = document.createElement("input");
      stepLabel.type = "number";
      stepLabel.className = "slider-bound slider-step";
      stepLabel.value = r.sliderStep;
      stepLabel.title = "Step size";
      stepLabel.min = "0.001";
      stepLabel.step = "any";
      stepLabel.addEventListener("change", () => {
        const v = Number(stepLabel.value);
        if (v > 0) {
          r.sliderStep = v;
          renderRows();
        }
      });

      sliderRow.appendChild(minLabel);
      sliderRow.appendChild(slider);
      sliderRow.appendChild(maxLabel);
      sliderRow.appendChild(stepLabel);
      card.appendChild(sliderRow);
    }

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
  if (wasFocusedSlider) {
    const card = els.rows.querySelector(`.row[data-id="${wasFocusedSlider}"]`);
    const sl = card && card.querySelector(".param-slider");
    if (sl) sl.focus();
  }
  refreshEmlPanel();
}

function updateRowSlider(card, r) {
  const existing = card.querySelector(".param-slider-row");
  if (isParamRow(r) && !existing) {
    renderRows();
  } else if (!isParamRow(r) && existing) {
    existing.remove();
  }
}

function updateRowPreview(card, r) {
  const preview = card.querySelector(".row-preview");
  if (!preview) return;
  if (r.source === "eml" || !r.text.trim() || r.error) { preview.innerHTML = ""; return; }
  try {
    const parsed = parseMath(r.text);
    const tex = astToTex(parsed.expr);
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

function setBadge(badge, cls, mainText, tokenNode) {
  badge.className = "row-badge";
  if (cls) badge.classList.add(cls);
  badge.innerHTML = "";
  const main = document.createElement("span");
  main.className = "badge-main";
  main.textContent = mainText;
  badge.appendChild(main);
  if (tokenNode) {
    const tok = document.createElement("span");
    tok.className = "badge-tokens";
    tok.textContent = `${countTokens(tokenNode)} tokens`;
    badge.appendChild(tok);
  }
}

function updateRowBadge(card, r) {
  const badge = card.querySelector(".row-badge");
  if (r.error) {
    setBadge(badge, "error", r.error, null);
    return;
  }
  if (r.defName && !r.astUsesX && !r.defArgs) {
    const label = r.value !== null ? `${r.defName} = ${cToString(r.value, 12)}` : `defines ${r.defName}`;
    setBadge(badge, "value", label, r.emlNode);
    return;
  }
  if (r.defName && r.defArgs) {
    setBadge(badge, "eml-mode", `defines ${r.defName}(${r.defArgs.join(", ")})`, null);
    return;
  }
  if (r.source === "eml") {
    setBadge(badge, "eml-mode", "EML source — edit it on the right", r.emlNode);
    return;
  }
  if (!r.astUsesX && r.value !== null) {
    setBadge(badge, "value", "= " + cToString(r.value, 12), r.emlNode);
    return;
  }
  if (r.emlString) {
    setBadge(badge, null, "", r.emlNode);
  } else {
    setBadge(badge, null, "", null);
  }
}

function buildDefs(upToIndex) {
  const vars = {};
  const funcs = {};
  const varUsesX = {};
  const funcUsesX = {};
  for (let i = 0; i < upToIndex; i++) {
    const r = state.rows[i];
    if (!r.defName || r.error) continue;
    if (r.defArgs) {
      funcs[r.defName] = { params: r.defArgs, bodyAst: r.defBodyAst };
      funcUsesX[r.defName] = mathUsesXExcluding(r.defBodyAst, r.defArgs);
    } else if (r.emlString) {
      vars[r.defName] = r.emlString;
      varUsesX[r.defName] = r.astUsesX;
    }
  }
  return { vars, funcs, varUsesX, funcUsesX };
}

function mathUsesXExcluding(node, excludeNames) {
  if (!node) return false;
  if (node.t === "name") {
    if (excludeNames.includes(node.name)) return false;
    return node.name === "x";
  }
  if (node.t === "call") return node.args.some(a => mathUsesXExcluding(a, excludeNames));
  if (node.t === "num") return false;
  if (node.t === "neg") return mathUsesXExcluding(node.x, excludeNames);
  return mathUsesXExcluding(node.l, excludeNames) || mathUsesXExcluding(node.r, excludeNames);
}

function recompileAll() {
  for (let i = 0; i < state.rows.length; i++) {
    const r = state.rows[i];
    if (r.source === "eml") continue;
    recompileRow(r, i);
  }
}

function recompileRow(r, index) {
  r.error = null;
  r.emlString = null;
  r.emlNode = null;
  r.optimizedNode = null;
  r.astUsesX = false;
  r.value = null;
  r.defName = null;
  r.defArgs = null;
  r.defBodyAst = null;
  if (!r.text.trim()) return;
  try {
    const parsed = parseMath(r.text);
    const lhs = parsed.lhs;
    const ast = parsed.expr;

    if (lhs) {
      r.defName = lhs.name;
      r.defArgs = lhs.args;
      r.defBodyAst = ast;
    }

    const idx = index !== undefined ? index : state.rows.indexOf(r);
    const defs = buildDefs(idx);
    r.astUsesX = mathUsesX(ast, defs);

    // Function definitions with parameters can't be compiled standalone —
    // their body references formal params that only resolve at call sites.
    if (r.defArgs && r.defArgs.length > 0) {
      return;
    }

    const emlString = compileToEML(ast, defs);
    r.emlString = emlString;
    r.emlNode = parseEML(emlString);
    r.optimizedNode = optimizeEML(r.emlNode);
    if (!r.astUsesX) {
      r.value = evalEML(r.optimizedNode, {});
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
    r.optimizedNode = optimizeEML(node);
    r.astUsesX = usesX(node);
    r.error = null;
    r.defName = null;
    r.defArgs = null;
    r.defBodyAst = null;
    if (!r.astUsesX) r.value = evalEML(r.optimizedNode, {});
    else r.value = null;
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
    .filter((r) => r.visible && (r.optimizedNode || r.emlNode) && (r.astUsesX || usesX(r.emlNode)))
    .map((r) => {
      const node = r.optimizedNode || r.emlNode;
      return {
        color: r.color,
        visible: r.visible,
        thickness: r.thickness || 2,
        lineStyle: r.lineStyle || "line",
        opacity: r.opacity !== undefined ? r.opacity : 1,
        sampler: (x) => evalRealAt(node, x),
      };
    });
  graph.setTraces(traces);
  updateSpecialPoints();
  refreshEmlPanel();
}

// ---- Special points (roots, peaks, troughs, intersections) ----

function bisect(fn, a, b, iters) {
  let fa, fb;
  try { fa = fn(a); } catch { return null; }
  try { fb = fn(b); } catch { return null; }
  if (!isFinite(fa) || !isFinite(fb)) return null;
  for (let i = 0; i < iters; i++) {
    let mid = (a + b) / 2;
    // Nudge away from exactly 0 to avoid EML log(0) failures
    if (mid === 0) mid = 1e-15;
    let fm;
    try { fm = fn(mid); } catch { return null; }
    if (!isFinite(fm)) return null;
    if (fa * fm <= 0) { b = mid; fb = fm; }
    else { a = mid; fa = fm; }
  }
  return (a + b) / 2;
}

function refineExtremum(fn, a, b, isPeak) {
  const gr = 0.6180339887;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  for (let i = 0; i < 40; i++) {
    let fc, fd;
    try { fc = fn(c); fd = fn(d); } catch { break; }
    if (!isFinite(fc) || !isFinite(fd)) break;
    if (isPeak ? fc > fd : fc < fd) {
      b = d;
    } else {
      a = c;
    }
    c = b - gr * (b - a);
    d = a + gr * (b - a);
  }
  return (a + b) / 2;
}

function dedup(points, threshold) {
  const result = [];
  for (const p of points) {
    let isDup = false;
    for (const q of result) {
      if (Math.hypot(p.x - q.x, p.y - q.y) < threshold) {
        isDup = true;
        break;
      }
    }
    if (!isDup) result.push(p);
  }
  return result;
}

function updateSpecialPoints() {
  if (!graph) return;
  const view = graph.view;
  const traces = graph.traces;
  const points = [];
  const margin = (view.xMax - view.xMin) * 0.03;
  const searchXMin = view.xMin - margin;
  const searchXMax = view.xMax + margin;
  const N = 800;
  const dx = (searchXMax - searchXMin) / N;
  const ySpan = view.yMax - view.yMin;
  const zeroThresh = Math.max(1e-10, ySpan * 1e-7);

  for (const tr of traces) {
    if (!tr.visible) continue;

    // Offset grid by half a step so samples never land on exact zeros
    // (EML evaluation fails at x=0 due to log(0) in multiplication)
    const halfDx = dx * 0.5;
    const samples = new Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const x = searchXMin + halfDx + i * dx;
      try { samples[i] = tr.sampler(x); } catch { samples[i] = NaN; }
    }

    const sampleX = (i) => searchXMin + halfDx + i * dx;

    // Roots — sign changes
    for (let i = 0; i < N; i++) {
      const ya = samples[i], yb = samples[i + 1];
      if (!isFinite(ya) || !isFinite(yb)) continue;
      if (ya * yb > 0) continue;
      if (Math.abs(ya - yb) > ySpan * 0.5) continue;
      const xa = sampleX(i);
      const xb = sampleX(i + 1);
      const rx = bisect(tr.sampler, xa, xb, 50);
      if (rx === null) continue;
      let ry;
      try { ry = tr.sampler(rx); } catch { continue; }
      if (Math.abs(ry) < zeroThresh) {
        points.push({ x: rx, y: 0, color: tr.color, type: "root", label: `(${fmtReadout(rx)}, 0)` });
      }
    }

    // Roots — direct near-zero samples
    for (let i = 0; i <= N; i++) {
      if (Math.abs(samples[i]) < zeroThresh) {
        const x = sampleX(i);
        points.push({ x, y: 0, color: tr.color, type: "root", label: `(${fmtReadout(x)}, 0)` });
      }
    }

    // Peaks and troughs
    for (let i = 1; i < N; i++) {
      const yp = samples[i - 1], yc = samples[i], yn = samples[i + 1];
      if (!isFinite(yp) || !isFinite(yc) || !isFinite(yn)) continue;
      const d1 = yc - yp, d2 = yn - yc;
      if (d1 > 0 && d2 < 0) {
        const xa = sampleX(i - 1);
        const xb = sampleX(i + 1);
        const rx = refineExtremum(tr.sampler, xa, xb, true);
        let ry;
        try { ry = tr.sampler(rx); } catch { continue; }
        if (isFinite(ry) && ry >= view.yMin - ySpan * 0.05 && ry <= view.yMax + ySpan * 0.05) {
          points.push({ x: rx, y: ry, color: tr.color, type: "peak", label: `(${fmtReadout(rx)}, ${fmtReadout(ry)})` });
        }
      } else if (d1 < 0 && d2 > 0) {
        const xa = sampleX(i - 1);
        const xb = sampleX(i + 1);
        const rx = refineExtremum(tr.sampler, xa, xb, false);
        let ry;
        try { ry = tr.sampler(rx); } catch { continue; }
        if (isFinite(ry) && ry >= view.yMin - ySpan * 0.05 && ry <= view.yMax + ySpan * 0.05) {
          points.push({ x: rx, y: ry, color: tr.color, type: "trough", label: `(${fmtReadout(rx)}, ${fmtReadout(ry)})` });
        }
      }
    }
  }

  // Intersections between pairs
  for (let i = 0; i < traces.length; i++) {
    for (let j = i + 1; j < traces.length; j++) {
      if (!traces[i].visible || !traces[j].visible) continue;
      const diff = (x) => {
        const a = traces[i].sampler(x);
        const b = traces[j].sampler(x);
        return a - b;
      };
      const halfDxI = dx * 0.5;
      for (let k = 0; k < N; k++) {
        const xa = searchXMin + halfDxI + k * dx;
        const xb = searchXMin + halfDxI + (k + 1) * dx;
        let da, db;
        try { da = diff(xa); db = diff(xb); } catch { continue; }
        if (!isFinite(da) || !isFinite(db)) continue;
        if (da * db > 0) continue;
        if (Math.abs(da - db) > ySpan * 0.5) continue;
        const rx = bisect(diff, xa, xb, 50);
        if (rx === null) continue;
        let ry;
        try { ry = traces[i].sampler(rx); } catch { continue; }
        if (isFinite(ry) && ry >= view.yMin - ySpan * 0.05 && ry <= view.yMax + ySpan * 0.05) {
          points.push({ x: rx, y: ry, color: "#ffffff", type: "intersection", label: `(${fmtReadout(rx)}, ${fmtReadout(ry)})` });
        }
      }
    }
  }

  const xThreshold = (view.xMax - view.xMin) * 0.008;
  graph.setSpecialPoints(dedup(points, xThreshold));
}

// ---- Style popover (long-press the chip) -----
let openPopover = null;
function closeStylePopover() {
  if (openPopover) {
    openPopover.remove();
    openPopover = null;
    document.removeEventListener("mousedown", onDocMousedown, true);
    document.removeEventListener("touchstart", onDocMousedown, true);
  }
}
function onDocMousedown(e) {
  if (openPopover && !openPopover.contains(e.target)) closeStylePopover();
}
function openStylePopover(anchor, r) {
  if (openPopover) { closeStylePopover(); return; }
  const pop = document.createElement("div");
  pop.className = "color-popover";

  const swatchLabel = document.createElement("div");
  swatchLabel.className = "popover-label";
  swatchLabel.textContent = "Color";
  pop.appendChild(swatchLabel);

  const swatches = document.createElement("div");
  swatches.className = "swatches";
  for (const c of PALETTE) {
    const sw = document.createElement("button");
    sw.className = "swatch" + (c === r.color ? " active" : "");
    sw.style.background = c;
    sw.addEventListener("click", (e) => {
      e.stopPropagation();
      r.color = c;
      renderRows();
      redraw();
    });
    swatches.appendChild(sw);
  }
  pop.appendChild(swatches);

  const thickLabel = document.createElement("div");
  thickLabel.className = "popover-label";
  thickLabel.textContent = "Thickness";
  pop.appendChild(thickLabel);

  const thickRow = document.createElement("div");
  thickRow.className = "popover-slider-row";
  const thickSlider = document.createElement("input");
  thickSlider.type = "range";
  thickSlider.min = "0.5";
  thickSlider.max = "6";
  thickSlider.step = "0.5";
  thickSlider.value = r.thickness || 2;
  thickSlider.className = "popover-slider";
  const thickVal = document.createElement("span");
  thickVal.className = "popover-slider-val";
  thickVal.textContent = r.thickness || 2;
  thickSlider.addEventListener("input", () => {
    r.thickness = Number(thickSlider.value);
    thickVal.textContent = thickSlider.value;
    redraw();
  });
  thickRow.appendChild(thickSlider);
  thickRow.appendChild(thickVal);
  pop.appendChild(thickRow);

  const styleLabel = document.createElement("div");
  styleLabel.className = "popover-label";
  styleLabel.textContent = "Style";
  pop.appendChild(styleLabel);

  const styleRow = document.createElement("div");
  styleRow.className = "popover-style-row";
  for (const [val, label] of [["line", "Line"], ["dashed", "Dashed"], ["points", "Points"]]) {
    const btn = document.createElement("button");
    btn.className = "popover-style-btn" + (r.lineStyle === val ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      r.lineStyle = val;
      styleRow.querySelectorAll(".popover-style-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      redraw();
    });
    styleRow.appendChild(btn);
  }
  pop.appendChild(styleRow);

  const opacLabel = document.createElement("div");
  opacLabel.className = "popover-label";
  opacLabel.textContent = "Opacity";
  pop.appendChild(opacLabel);

  const opacRow = document.createElement("div");
  opacRow.className = "popover-slider-row";
  const opacSlider = document.createElement("input");
  opacSlider.type = "range";
  opacSlider.min = "0.1";
  opacSlider.max = "1";
  opacSlider.step = "0.05";
  opacSlider.value = r.opacity !== undefined ? r.opacity : 1;
  opacSlider.className = "popover-slider";
  const opacVal = document.createElement("span");
  opacVal.className = "popover-slider-val";
  opacVal.textContent = Math.round((r.opacity !== undefined ? r.opacity : 1) * 100) + "%";
  opacSlider.addEventListener("input", () => {
    r.opacity = Number(opacSlider.value);
    opacVal.textContent = Math.round(r.opacity * 100) + "%";
    redraw();
  });
  opacRow.appendChild(opacSlider);
  opacRow.appendChild(opacVal);
  pop.appendChild(opacRow);

  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  pop.style.left = `${rect.left}px`;
  pop.style.top = `${rect.bottom + 6}px`;
  const pr = pop.getBoundingClientRect();
  if (pr.right > window.innerWidth - 8) {
    pop.style.left = `${window.innerWidth - pr.width - 8}px`;
  }
  openPopover = pop;
  setTimeout(() => {
    document.addEventListener("mousedown", onDocMousedown, true);
    document.addEventListener("touchstart", onDocMousedown, true);
  }, 0);
}

// ---- TeX emission for the math preview --------------------------------
function astToTex(n, ctx = 0) {
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
