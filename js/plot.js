// Canvas time-course plotting. No model-specific knowledge.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    step *= mag;
    const ticks = [];
    const start = Math.ceil(min / step) * step;
    for (let v = start; v <= max + step * 0.5; v += step) ticks.push(v);
    return ticks;
  }

  function fmtTick(v) {
    if (v === 0) return "0";
    const a = Math.abs(v);
    if (a >= 1e4 || a < 1e-3) return v.toExponential(0);
    return String(Math.round(v * 1000) / 1000);
  }

  // series: [{ id, name, color, index }]. Reads sol.y[i][index].
  function drawPlot(canvas, sol, series, opts) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 380;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const mL = 62, mR = 16, mT = 16, mB = 42;
    const pw = cssW - mL - mR;
    const ph = cssH - mT - mB;

    const tMax = sol.t.length ? sol.t[sol.t.length - 1] : 1;
    let yMax = 0;
    for (const s of series) for (const row of sol.y) if (row[s.index] > yMax) yMax = row[s.index];
    if (!(yMax > 0)) yMax = 1;
    yMax *= 1.08;

    const xToPx = (t) => mL + (t / tMax) * pw;
    const yToPx = (v) => mT + ph - (v / yMax) * ph;

    ctx.font = "12px 'JetBrains Mono', monospace";
    ctx.textBaseline = "middle";

    ctx.strokeStyle = "#eef2f6";
    ctx.fillStyle = "#64748b";
    ctx.lineWidth = 1;
    const yticks = niceTicks(0, yMax, 5);
    ctx.textAlign = "right";
    for (const v of yticks) {
      const y = yToPx(v);
      ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(mL + pw, y); ctx.stroke();
      ctx.fillText(fmtTick(v), mL - 8, y);
    }
    const xticks = niceTicks(0, tMax, 6);
    ctx.textAlign = "center";
    for (const v of xticks) {
      const x = xToPx(v);
      ctx.beginPath(); ctx.moveTo(x, mT); ctx.lineTo(x, mT + ph); ctx.stroke();
      ctx.fillText(fmtTick(v), x, mT + ph + 16);
    }

    ctx.strokeStyle = "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(mL, mT); ctx.lineTo(mL, mT + ph); ctx.lineTo(mL + pw, mT + ph);
    ctx.stroke();

    ctx.fillStyle = "#475569";
    ctx.font = "12px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("time (" + (opts.tUnit || "s") + ")", mL + pw / 2, cssH - 6);
    ctx.save();
    ctx.translate(14, mT + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("concentration (" + (opts.yUnit || "") + ")", 0, 0);
    ctx.restore();

    // Progressive draw: if a cursor time is given, draw each trace only up to it.
    const cur = (opts.cursorT != null && isFinite(opts.cursorT)) ? Math.max(0, Math.min(tMax, opts.cursorT)) : tMax;
    ctx.lineWidth = 1.5;
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      let started = false, lastY = 0;
      for (let i = 0; i < sol.t.length; i++) {
        const t = sol.t[i];
        if (t > cur) {
          // interpolate the leading point exactly at the cursor, then stop
          if (i > 0) {
            const t0 = sol.t[i - 1], f = (t - t0) > 0 ? (cur - t0) / (t - t0) : 0;
            const v = sol.y[i - 1][s.index] + (sol.y[i][s.index] - sol.y[i - 1][s.index]) * f;
            lastY = yToPx(v);
            ctx.lineTo(xToPx(cur), lastY);
          }
          break;
        }
        const x = xToPx(t), y = yToPx(sol.y[i][s.index]);
        lastY = y;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Time cursor line (teal = live state).
    if (opts.cursorT != null && isFinite(opts.cursorT)) {
      const cx = xToPx(cur);
      ctx.strokeStyle = "#0891b2";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, mT); ctx.lineTo(cx, mT + ph); ctx.stroke();
    }

    drawLegend(ctx, series, mL + 10, mT + 8);
  }

  function drawLegend(ctx, series, x, y) {
    if (!series.length) return;
    ctx.font = "12px 'DM Sans', sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let maxW = 0;
    for (const s of series) maxW = Math.max(maxW, ctx.measureText(s.name).width);
    const rowH = 18, padX = 8, sw = 12;
    const boxW = padX * 2 + sw + 6 + maxW;
    const boxH = padX + series.length * rowH;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeRect(x, y, boxW, boxH);
    let cy = y + padX + rowH / 2 - 2;
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(x + padX, cy - 4, sw, 8);
      ctx.fillStyle = "#1e293b";
      ctx.fillText(s.name, x + padX + sw + 6, cy);
      cy += rowH;
    }
  }

  // Dose-response scatter/line. pts: [{ x, y, osc }]. opts: { xLabel, yLabel, xLog }.
  function drawDoseResponse(canvas, pts, opts) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 600;
    const cssH = canvas.clientHeight || 300;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const data = pts.filter((p) => isFinite(p.x) && isFinite(p.y));
    const mL = 66, mR = 16, mT = 16, mB = 44;
    const pw = cssW - mL - mR;
    const ph = cssH - mT - mB;
    if (!data.length) return;

    const pos = data.filter((p) => p.x > 0);
    const hasZero = data.some((p) => p.x === 0);
    // Log x only makes sense with at least two positive values.
    const xLog = !!opts.xLog && pos.length >= 2;

    let ymin = Infinity, ymax = -Infinity;
    for (const p of data) { if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
    const yPad = (ymax - ymin) * 0.08 || Math.abs(ymax) * 0.08 || 1;
    ymin -= yPad; ymax += yPad;
    const yToPx = (y) => mT + ph - ((y - ymin) / (ymax - ymin)) * ph;

    let xToPx, xLo = 0, xHi = 1;
    let zeroPx = null, logStart = mL, logW = pw;
    if (xLog) {
      // Reserve a small left strip for an explicit zero point, with a break.
      const zeroW = hasZero ? pw * 0.09 : 0;
      logStart = mL + zeroW;
      logW = pw - zeroW;
      xLo = Math.log10(pos[0].x);
      xHi = Math.log10(pos[pos.length - 1].x);
      if (xHi === xLo) xHi = xLo + 1;
      if (hasZero) zeroPx = mL + zeroW * 0.45;
      xToPx = (x) => (x === 0 ? zeroPx : logStart + ((Math.log10(x) - xLo) / (xHi - xLo)) * logW);
    } else {
      xLo = data[0].x;
      xHi = data[data.length - 1].x;
      for (const p of data) { if (p.x < xLo) xLo = p.x; if (p.x > xHi) xHi = p.x; }
      if (xHi === xLo) xHi = xLo + 1;
      xToPx = (x) => mL + ((x - xLo) / (xHi - xLo)) * pw;
    }

    ctx.font = "12px 'JetBrains Mono', monospace";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#eef2f6";
    ctx.fillStyle = "#64748b";
    ctx.lineWidth = 1;

    const yticks = niceTicks(ymin, ymax, 5);
    ctx.textAlign = "right";
    for (const v of yticks) {
      const y = yToPx(v);
      ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(mL + pw, y); ctx.stroke();
      ctx.fillText(fmtTick(v), mL - 8, y);
    }

    ctx.textAlign = "center";
    if (xLog) {
      if (hasZero) {
        ctx.beginPath(); ctx.moveTo(zeroPx, mT); ctx.lineTo(zeroPx, mT + ph); ctx.stroke();
        ctx.fillText("0", zeroPx, mT + ph + 16);
      }
      for (let p = Math.ceil(xLo); p <= Math.floor(xHi); p++) {
        const xv = Math.pow(10, p);
        const x = xToPx(xv);
        ctx.beginPath(); ctx.moveTo(x, mT); ctx.lineTo(x, mT + ph); ctx.stroke();
        ctx.fillText(fmtTick(xv), x, mT + ph + 16);
      }
    } else {
      for (const v of niceTicks(xLo, xHi, 6)) {
        const x = xToPx(v);
        if (x < mL - 1 || x > mL + pw + 1) continue;
        ctx.beginPath(); ctx.moveTo(x, mT); ctx.lineTo(x, mT + ph); ctx.stroke();
        ctx.fillText(fmtTick(v), x, mT + ph + 16);
      }
    }

    ctx.strokeStyle = "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(mL, mT); ctx.lineTo(mL, mT + ph); ctx.lineTo(mL + pw, mT + ph);
    ctx.stroke();

    // Axis-break glyph between the zero point and the log region.
    if (xLog && zeroPx !== null) {
      const bx = (zeroPx + logStart) / 2, by = mT + ph;
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      for (const off of [-2, 2]) {
        ctx.beginPath();
        ctx.moveTo(bx + off - 2, by + 4); ctx.lineTo(bx + off + 2, by - 4);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "#475569";
    ctx.font = "12px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.xLabel || "", mL + pw / 2, cssH - 6);
    ctx.save();
    ctx.translate(14, mT + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(opts.yLabel || "", 0, 0);
    ctx.restore();

    const teal = "#0891b2";
    ctx.strokeStyle = teal;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((p, i) => {
      const x = xToPx(p.x), y = yToPx(p.y);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    for (const p of data) {
      const x = xToPx(p.x), y = yToPx(p.y);
      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, 2 * Math.PI);
      if (p.osc) {
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = teal;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = teal;
        ctx.fill();
      }
    }
  }

  NS.drawPlot = drawPlot;
  NS.drawDoseResponse = drawDoseResponse;
})(typeof globalThis !== "undefined" ? globalThis : this);
