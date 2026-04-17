// Canvas-based function plotter with pan/zoom, touch support, and special point rendering.

class Graph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.view = { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 };
    this.traces = [];
    this.specialPoints = [];
    this.tracePoint = null; // {x, y, color}
    this.hover = null;
    this.dpr = window.devicePixelRatio || 1;
    this.dark = true;
    this.onViewChange = null;
    this._viewChangeTimer = null;
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

  setSpecialPoints(points) {
    this.specialPoints = points;
    this.draw();
  }

  setDark(dark) { this.dark = dark; this.draw(); }

  reset() {
    this.view = { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 };
    this._notifyViewChange();
    this.draw();
  }

  _notifyViewChange() {
    if (this._viewChangeTimer) clearTimeout(this._viewChangeTimer);
    this._viewChangeTimer = setTimeout(() => {
      if (this.onViewChange) this.onViewChange();
    }, 120);
  }

  _findNearestTrace(mx, my) {
    const snapR = 20;
    const xData = this.pxToX(mx);
    let best = null;
    for (const tr of this.traces) {
      if (!tr.visible) continue;
      let y;
      try { y = tr.sampler(xData); } catch { continue; }
      if (!isFinite(y)) continue;
      const py = this.yToPx(y);
      const d = Math.abs(py - my);
      if (d < snapR && (!best || d < best.d)) {
        best = { d, trace: tr, x: xData, y, color: tr.color };
      }
    }
    return best;
  }

  installInteractions() {
    let mode = null; // null | "pan" | "trace"
    let last = null;
    let lockedTrace = null;

    this.canvas.addEventListener("mousedown", (e) => {
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;

      const hit = this._findNearestTrace(mx, my);
      if (hit) {
        mode = "trace";
        lockedTrace = hit.trace;
        this.tracePoint = { x: hit.x, y: hit.y, color: hit.color };
        this.canvas.style.cursor = "crosshair";
      } else {
        mode = "pan";
        last = { x: e.clientX, y: e.clientY };
        this.tracePoint = null;
        this.canvas.style.cursor = "grabbing";
      }
      this.draw();
    });

    window.addEventListener("mouseup", () => {
      if (mode) {
        mode = null;
        lockedTrace = null;
        this.canvas.style.cursor = "";
      }
    });

    this.canvas.addEventListener("mousemove", (e) => {
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      this.hover = { x: mx, y: my };

      if (mode === "pan" && last) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        const kx = (this.view.xMax - this.view.xMin) / this.w;
        const ky = (this.view.yMax - this.view.yMin) / this.h;
        this.view.xMin -= dx * kx;
        this.view.xMax -= dx * kx;
        this.view.yMin += dy * ky;
        this.view.yMax += dy * ky;
        this.tracePoint = null;
        this._notifyViewChange();
      } else if (mode === "trace" && lockedTrace) {
        const xData = this.pxToX(mx);
        let y;
        try { y = lockedTrace.sampler(xData); } catch { y = NaN; }
        if (isFinite(y)) {
          this.tracePoint = { x: xData, y, color: lockedTrace.color };
        }
      } else if (!mode) {
        const hit = this._findNearestTrace(mx, my);
        this.tracePoint = null;
        this.canvas.style.cursor = hit ? "pointer" : "grab";
      }
      this.draw();
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.hover = null;
      if (!mode) {
        this.tracePoint = null;
        this.canvas.style.cursor = "";
      }
      this.draw();
    });

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
      this._notifyViewChange();
      this.draw();
    }, { passive: false });

    this.canvas.addEventListener("dblclick", () => this.reset());

    // Touch support
    let activeTouches = [];
    let touchMode = null; // null | "pan" | "trace" | "pinch"
    let touchLockedTrace = null;
    const getTouchInfo = (e) => Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY, id: t.identifier }));

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      activeTouches = getTouchInfo(e);

      if (activeTouches.length === 1) {
        const r = this.canvas.getBoundingClientRect();
        const mx = activeTouches[0].x - r.left;
        const my = activeTouches[0].y - r.top;
        const hit = this._findNearestTrace(mx, my);
        if (hit) {
          touchMode = "trace";
          touchLockedTrace = hit.trace;
          this.tracePoint = { x: hit.x, y: hit.y, color: hit.color };
        } else {
          touchMode = "pan";
          this.tracePoint = null;
        }
      } else if (activeTouches.length === 2) {
        touchMode = "pinch";
        this.tracePoint = null;
      }
      this.draw();
    }, { passive: false });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const newTouches = getTouchInfo(e);

      if (touchMode === "trace" && newTouches.length === 1 && touchLockedTrace) {
        const r = this.canvas.getBoundingClientRect();
        const mx = newTouches[0].x - r.left;
        const xData = this.pxToX(mx);
        let y;
        try { y = touchLockedTrace.sampler(xData); } catch { y = NaN; }
        if (isFinite(y)) {
          this.tracePoint = { x: xData, y, color: touchLockedTrace.color };
        }
        this.draw();
      } else if (touchMode === "pan" && newTouches.length === 1 && activeTouches.length >= 1) {
        const old = activeTouches[0];
        const dx = newTouches[0].x - old.x;
        const dy = newTouches[0].y - old.y;
        const kx = (this.view.xMax - this.view.xMin) / this.w;
        const ky = (this.view.yMax - this.view.yMin) / this.h;
        this.view.xMin -= dx * kx;
        this.view.xMax -= dx * kx;
        this.view.yMin += dy * ky;
        this.view.yMax += dy * ky;
        this._notifyViewChange();
        this.draw();
      } else if (newTouches.length === 2 && activeTouches.length === 2) {
        touchMode = "pinch";
        const oldDist = Math.hypot(activeTouches[0].x - activeTouches[1].x, activeTouches[0].y - activeTouches[1].y);
        const newDist = Math.hypot(newTouches[0].x - newTouches[1].x, newTouches[0].y - newTouches[1].y);
        if (oldDist < 1) { activeTouches = newTouches; return; }
        const factor = oldDist / newDist;
        const rect = this.canvas.getBoundingClientRect();
        const mx = (newTouches[0].x + newTouches[1].x) / 2 - rect.left;
        const my = (newTouches[0].y + newTouches[1].y) / 2 - rect.top;
        const x0 = this.pxToX(mx);
        const y0 = this.pxToY(my);
        this.view.xMin = x0 + (this.view.xMin - x0) * factor;
        this.view.xMax = x0 + (this.view.xMax - x0) * factor;
        this.view.yMin = y0 + (this.view.yMin - y0) * factor;
        this.view.yMax = y0 + (this.view.yMax - y0) * factor;
        const oldMx = (activeTouches[0].x + activeTouches[1].x) / 2 - rect.left;
        const oldMy = (activeTouches[0].y + activeTouches[1].y) / 2 - rect.top;
        const panDx = mx - oldMx;
        const panDy = my - oldMy;
        const kx = (this.view.xMax - this.view.xMin) / this.w;
        const ky = (this.view.yMax - this.view.yMin) / this.h;
        this.view.xMin -= panDx * kx;
        this.view.xMax -= panDx * kx;
        this.view.yMin += panDy * ky;
        this.view.yMax += panDy * ky;
        this._notifyViewChange();
        this.draw();
      }

      activeTouches = newTouches;
    }, { passive: false });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      activeTouches = getTouchInfo(e);
      if (activeTouches.length === 0) {
        touchMode = null;
        touchLockedTrace = null;
        this.tracePoint = null;
        this.draw();
      }
    }, { passive: false });
  }

  xToPx(x) {
    return ((x - this.view.xMin) / (this.view.xMax - this.view.xMin)) * this.w;
  }
  yToPx(y) {
    return this.h - ((y - this.view.yMin) / (this.view.yMax - this.view.yMin)) * this.h;
  }
  pxToX(px) { return this.view.xMin + (px / this.w) * (this.view.xMax - this.view.xMin); }
  pxToY(py) { return this.view.yMax - (py / this.h) * (this.view.yMax - this.view.yMin); }

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
      const alpha = tr.opacity !== undefined ? tr.opacity : 1;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = tr.color;
      ctx.fillStyle = tr.color;
      ctx.lineWidth = tr.thickness || 2;

      if (tr.lineStyle === "dashed") {
        ctx.setLineDash([8, 5]);
      } else {
        ctx.setLineDash([]);
      }

      const N = Math.floor(this.w);

      if (tr.lineStyle === "points") {
        const r = Math.max(1.5, (tr.thickness || 2) * 0.8);
        const dotSpacing = 13;
        let arcLen = dotSpacing;
        let prevPx = null, prevPy = null;
        for (let i = 0; i <= N; i++) {
          const x = xMin + (i / N) * (xMax - xMin);
          let y;
          try { y = tr.sampler(x); } catch { y = NaN; }
          if (!isFinite(y)) { prevPx = null; prevPy = null; arcLen = dotSpacing; continue; }
          const px = this.xToPx(x);
          const py = this.yToPx(y);
          if (py < -10 || py > this.h + 10) { prevPx = null; prevPy = null; arcLen = dotSpacing; continue; }
          if (prevPx !== null) {
            arcLen += Math.hypot(px - prevPx, py - prevPy);
          }
          if (arcLen >= dotSpacing) {
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            arcLen = 0;
          }
          prevPx = px;
          prevPy = py;
        }
      } else {
        ctx.beginPath();
        let pen = false;
        let lastY = null;
        for (let i = 0; i <= N; i++) {
          const x = xMin + (i / N) * (xMax - xMin);
          let y;
          try { y = tr.sampler(x); } catch { y = NaN; }
          if (!isFinite(y)) { pen = false; lastY = null; continue; }
          const px = this.xToPx(x);
          const py = this.yToPx(y);
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

      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Special points — all rendered as hollow circles
    for (const pt of this.specialPoints) {
      const px = this.xToPx(pt.x);
      const py = this.yToPx(pt.y);
      if (px < -20 || px > this.w + 20 || py < -20 || py > this.h + 20) continue;

      ctx.globalAlpha = 1;
      const r = 3;
      ctx.lineWidth = 2;

      if (pt.type === "intersection") {
        ctx.strokeStyle = this.dark ? "#8a93b8" : "#6a7090";
      } else {
        ctx.strokeStyle = pt.color;
      }

      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Special point tooltips on hover
    if (this.hover) {
      for (const pt of this.specialPoints) {
        const px = this.xToPx(pt.x);
        const py = this.yToPx(pt.y);
        const dist = Math.hypot(px - this.hover.x, py - this.hover.y);
        if (dist < 18) {
          const label = pt.label;
          ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
          const tw = ctx.measureText(label).width;
          const bx = Math.min(px + 10, this.w - tw - 16);
          const by = Math.max(py - 28, 4);
          const clr = pt.type === "intersection"
            ? (this.dark ? "#8a93b8" : "#6a7090")
            : pt.color;
          ctx.fillStyle = this.dark ? "rgba(18,22,41,0.95)" : "rgba(255,255,255,0.97)";
          ctx.strokeStyle = clr;
          ctx.lineWidth = 1;
          const padX = 7, rh = 20;
          const rw = tw + padX * 2;
          roundRect(ctx, bx, by, rw, rh, 5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = this.dark ? "#e6e9f5" : "#1d2140";
          ctx.textBaseline = "middle";
          ctx.fillText(label, bx + padX, by + rh / 2);
          ctx.textBaseline = "top";
          break;
        }
      }
    }

    // Trace point (hover on curve or drag along curve)
    if (this.tracePoint) {
      const tp = this.tracePoint;
      const tpx = this.xToPx(tp.x);
      const tpy = this.yToPx(tp.y);

      if (tpx >= -10 && tpx <= this.w + 10 && tpy >= -10 && tpy <= this.h + 10) {
        ctx.beginPath();
        ctx.arc(tpx, tpy, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = tp.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.dark ? "#0f1220" : "#ffffff";
        ctx.stroke();

        const label = `(${fmtReadout(tp.x)}, ${fmtReadout(tp.y)})`;
        ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = ctx.measureText(label).width;
        const bx = Math.min(tpx + 10, this.w - tw - 14);
        const by = Math.max(tpy - 28, 4);
        ctx.fillStyle = this.dark ? "rgba(18,22,41,0.92)" : "rgba(255,255,255,0.95)";
        ctx.strokeStyle = tp.color;
        ctx.lineWidth = 1;
        const padX = 7, rw = tw + padX * 2, rh = 20;
        roundRect(ctx, bx, by, rw, rh, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = this.dark ? "#e6e9f5" : "#1d2140";
        ctx.textBaseline = "middle";
        ctx.fillText(label, bx + padX, by + rh / 2);
        ctx.textBaseline = "top";
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
