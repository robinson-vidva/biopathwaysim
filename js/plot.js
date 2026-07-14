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

    ctx.lineWidth = 1.75;
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      for (let i = 0; i < sol.t.length; i++) {
        const x = xToPx(sol.t[i]);
        const y = yToPx(sol.y[i][s.index]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
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

    const xLog = !!opts.xLog && data.every((p) => p.x > 0);
    const tx = (x) => (xLog ? Math.log10(x) : x);
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const p of data) {
      const X = tx(p.x);
      if (X < xmin) xmin = X;
      if (X > xmax) xmax = X;
      if (p.y < ymin) ymin = p.y;
      if (p.y > ymax) ymax = p.y;
    }
    if (xmax === xmin) xmax = xmin + 1;
    const yPad = (ymax - ymin) * 0.08 || Math.abs(ymax) * 0.08 || 1;
    ymin -= yPad; ymax += yPad;

    const xToPx = (x) => mL + ((tx(x) - xmin) / (xmax - xmin)) * pw;
    const yToPx = (y) => mT + ph - ((y - ymin) / (ymax - ymin)) * ph;

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
    const xticks = xLog ? logTicks(xmin, xmax) : niceTicks(xmin, xmax, 6);
    for (const t of xticks) {
      const xv = xLog ? Math.pow(10, t) : t;
      const x = xToPx(xv);
      if (x < mL - 1 || x > mL + pw + 1) continue;
      ctx.beginPath(); ctx.moveTo(x, mT); ctx.lineTo(x, mT + ph); ctx.stroke();
      ctx.fillText(fmtTick(xv), x, mT + ph + 16);
    }

    ctx.strokeStyle = "#94a3b8";
    ctx.beginPath();
    ctx.moveTo(mL, mT); ctx.lineTo(mL, mT + ph); ctx.lineTo(mL + pw, mT + ph);
    ctx.stroke();

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

  function logTicks(lo, hi) {
    const ticks = [];
    for (let p = Math.floor(lo); p <= Math.ceil(hi); p++) ticks.push(p);
    return ticks;
  }

  NS.drawPlot = drawPlot;
  NS.drawDoseResponse = drawDoseResponse;
})(typeof globalThis !== "undefined" ? globalThis : this);
