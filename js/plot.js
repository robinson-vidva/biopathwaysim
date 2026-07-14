// Canvas time-course plotting. No model-specific knowledge.

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

// series: [{ id, name, color, index }]. Reads values from sol.y[i][index].
export function drawPlot(canvas, sol, series, opts) {
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

  const font = "12px 'JetBrains Mono', monospace";
  ctx.font = font;
  ctx.textBaseline = "middle";

  // gridlines + ticks
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

  // axes
  ctx.strokeStyle = "#94a3b8";
  ctx.beginPath();
  ctx.moveTo(mL, mT); ctx.lineTo(mL, mT + ph); ctx.lineTo(mL + pw, mT + ph);
  ctx.stroke();

  // axis labels
  ctx.fillStyle = "#475569";
  ctx.font = "12px 'DM Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("time (" + (opts.tUnit || "s") + ")", mL + pw / 2, cssH - 6);
  ctx.save();
  ctx.translate(14, mT + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("concentration (" + (opts.yUnit || "") + ")", 0, 0);
  ctx.restore();

  // series lines
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
