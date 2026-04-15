// Canvas-based function plotter with pan/zoom.

class Graph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.view = { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 };
    this.traces = []; // {color, sampler(x)->y|NaN, visible, label}
    this.hover = null;
    this.dpr = window.devicePixelRatio || 1;
    this.dark = true;
    this.installInteractions();
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(r.width * this.dpr);
    this.canvas.height = Math.floor(r.height * this.dpr);
    this.w = r.width;
    this.h = r.height;
    this.draw();
  }

  setTraces(traces) {
    this.traces = traces;
    this.draw();
  }

  setDark(dark) { this.dark = dark; this.draw(); }

  reset() {
    this.view = { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 };
    this.draw();
  }

  installInteractions() {
    let dragging = false;
    let last = null;
    this.canvas.addEventListener("mousedown", (e) => {
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mouseup", () => { dragging = false; });
    this.canvas.addEventListener("mousemove", (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (dragging && last) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        const { xMin, xMax, yMin, yMax } = this.view;
        const kx = (xMax - xMin) / this.w;
        const ky = (yMax - yMin) / this.h;
        this.view.xMin -= dx * kx;
        this.view.xMax -= dx * kx;
        this.view.yMin += dy * ky;
        this.view.yMax += dy * ky;
      }
      this.draw();
    });
    this.canvas.addEventListener("mouseleave", () => { this.hover = null; this.draw(); });
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const { xMin, xMax, yMin, yMax } = this.view;
      const x0 = xMin + (mx / this.w) * (xMax - xMin);
      const y0 = yMax - (my / this.h) * (yMax - yMin);
      const factor = Math.exp(e.deltaY * 0.0015);
      this.view.xMin = x0 + (xMin - x0) * factor;
      this.view.xMax = x0 + (xMax - x0) * factor;
      this.view.yMin = y0 + (yMin - y0) * factor;
      this.view.yMax = y0 + (yMax - y0) * factor;
      this.draw();
    }, { passive: false });
    this.canvas.addEventListener("dblclick", () => this.reset());
  }

  xToPx(x) {
    return ((x - this.view.xMin) / (this.view.xMax - this.view.xMin)) * this.w;
  }
  yToPx(y) {
    return this.h - ((y - this.view.yMin) / (this.view.yMax - this.view.yMin)) * this.h;
  }
  pxToX(px) { return this.view.xMin + (px / this.w) * (this.view.xMax - this.view.xMin); }
  pxToY(py) { return this.view.yMax - (py / this.h) * (this.view.yMax - this.view.yMin); }

  // Nice step for gridlines
  niceStep(range, target = 8) {
    const rough = range / target;
    const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
    const n = rough / pow10;
    let nice;
    if (n < 1.5) nice = 1;
    else if (n < 3) nice = 2;
    else if (n < 7) nice = 5;
    else nice = 10;
    return nice * pow10;
  }

  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.w, this.h);

    const bg = this.dark ? "#0f1220" : "#ffffff";
    const grid = this.dark ? "#1b2140" : "#e8ebf3";
    const gridMinor = this.dark ? "#161a33" : "#f3f5fa";
    const axis = this.dark ? "#4b5585" : "#a8afc4";
    const text = this.dark ? "#9aa4cf" : "#4a5170";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);

    const { xMin, xMax, yMin, yMax } = this.view;
    const xStep = this.niceStep(xMax - xMin);
    const yStep = this.niceStep(yMax - yMin);

    // Minor grid
    ctx.strokeStyle = gridMinor;
    ctx.lineWidth = 1;
    for (let x = Math.ceil(xMin / (xStep / 5)) * (xStep / 5); x <= xMax; x += xStep / 5) {
      const px = this.xToPx(x);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, this.h); ctx.stroke();
    }
    for (let y = Math.ceil(yMin / (yStep / 5)) * (yStep / 5); y <= yMax; y += yStep / 5) {
      const py = this.yToPx(y);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this.w, py); ctx.stroke();
    }

    // Major grid + labels
    ctx.strokeStyle = grid;
    ctx.fillStyle = text;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "top";
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      const px = this.xToPx(x);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, this.h); ctx.stroke();
      if (Math.abs(x) > 1e-12) ctx.fillText(fmtTick(x, xStep), px + 3, this.yToPx(0) + 3);
    }
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      const py = this.yToPx(y);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this.w, py); ctx.stroke();
      if (Math.abs(y) > 1e-12) ctx.fillText(fmtTick(y, yStep), this.xToPx(0) + 3, py + 2);
    }

    // Axes
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const y0 = this.yToPx(0);
    ctx.moveTo(0, y0); ctx.lineTo(this.w, y0);
    const x0 = this.xToPx(0);
    ctx.moveTo(x0, 0); ctx.lineTo(x0, this.h);
    ctx.stroke();

    // Traces
    for (const tr of this.traces) {
      if (!tr.visible) continue;
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let pen = false;
      let lastY = null;
      const N = Math.floor(this.w);
      for (let i = 0; i <= N; i++) {
        const x = xMin + (i / N) * (xMax - xMin);
        let y;
        try { y = tr.sampler(x); } catch { y = NaN; }
        if (!isFinite(y)) { pen = false; lastY = null; continue; }
        const px = this.xToPx(x);
        const py = this.yToPx(y);
        // Break on giant jumps (asymptotes)
        if (pen && lastY !== null) {
          const dy = Math.abs(y - lastY);
          const spanY = yMax - yMin;
          if (dy > spanY * 0.75 && Math.sign(y) !== Math.sign(lastY)) {
            pen = false;
          }
        }
        if (!pen) { ctx.moveTo(px, py); pen = true; }
        else ctx.lineTo(px, py);
        lastY = y;
      }
      ctx.stroke();
    }

    // Hover: snap to nearest visible trace if close, else crosshair.
    if (this.hover) {
      const snapR = 20; // px
      let best = null;
      const hxData = this.pxToX(this.hover.x);
      for (const tr of this.traces) {
        if (!tr.visible) continue;
        let y;
        try { y = tr.sampler(hxData); } catch { y = NaN; }
        if (!isFinite(y)) continue;
        const py = this.yToPx(y);
        const d = Math.abs(py - this.hover.y);
        if (d < snapR && (!best || d < best.d)) {
          best = { d, x: hxData, y, color: tr.color, px: this.hover.x, py };
        }
      }
      ctx.strokeStyle = axis;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(this.hover.x, 0); ctx.lineTo(this.hover.x, this.h);
      if (!best) { ctx.moveTo(0, this.hover.y); ctx.lineTo(this.w, this.hover.y); }
      else { ctx.moveTo(0, best.py); ctx.lineTo(this.w, best.py); }
      ctx.stroke();
      ctx.setLineDash([]);

      if (best) {
        // Filled dot on the trace
        ctx.beginPath();
        ctx.arc(best.px, best.py, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = best.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.dark ? "#0f1220" : "#ffffff";
        ctx.stroke();
        // Readout bubble
        const label = `(${fmtReadout(best.x)}, ${fmtReadout(best.y)})`;
        ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = ctx.measureText(label).width;
        const bx = Math.min(best.px + 10, this.w - tw - 14);
        const by = Math.max(best.py - 28, 4);
        ctx.fillStyle = this.dark ? "rgba(18,22,41,0.92)" : "rgba(255,255,255,0.95)";
        ctx.strokeStyle = best.color;
        ctx.lineWidth = 1;
        const padX = 7, padY = 5;
        const rw = tw + padX * 2, rh = 20;
        roundRect(ctx, bx, by, rw, rh, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = this.dark ? "#e6e9f5" : "#1d2140";
        ctx.textBaseline = "middle";
        ctx.fillText(label, bx + padX, by + rh / 2);
        ctx.textBaseline = "top";
      } else {
        const hx = this.pxToX(this.hover.x);
        const hy = this.pxToY(this.hover.y);
        ctx.fillStyle = this.dark ? "#c4cbe8" : "#2a2f4a";
        ctx.fillText(`(${hx.toPrecision(4)}, ${hy.toPrecision(4)})`, this.hover.x + 8, this.hover.y + 8);
      }
    }

    ctx.restore();
  }
}

function fmtTick(v, step) {
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  return v.toFixed(digits);
}

function fmtReadout(v) {
  if (Math.abs(v) < 1e-12) return "0";
  if (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3) return v.toExponential(3);
  return (+v.toPrecision(5)).toString();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
