// Wiring: pick a model, integrate, redraw, re-run on control changes.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  const plotCanvas = document.getElementById("plot");
  const controlsEl = document.getElementById("controls");
  const citationEl = document.getElementById("citation");
  const equationsEl = document.getElementById("equations");
  const runNoteEl = document.getElementById("run-note");
  const picker = document.getElementById("model-picker");
  const dosePlot = document.getElementById("dose-plot");
  const sweepControlsEl = document.getElementById("sweep-controls");
  const doseCaptionEl = document.getElementById("dose-caption");
  const sweepRunBtn = document.getElementById("sweep-run");

  let currentSpec, model, sys, params, visible, ctx, sweepCfg;
  let lastSol = null;
  let runTimer = null, drawTimer = null;

  const READOUT_AXIS = {
    mean: "time-averaged mean",
    final: "final value",
    amplitude: "oscillation amplitude",
    min: "minimum",
    max: "maximum",
  };
  const READOUT_CAPTION = {
    mean: "Time-averaged mean",
    final: "Final value",
    amplitude: "Oscillation amplitude",
    min: "Minimum",
    max: "Maximum",
  };

  function currentSeries() {
    return model.species
      .map((s, i) => ({ id: s.id, name: s.name || s.id, color: NS.speciesColor(i), index: sys.idx[s.id] }))
      .filter((s) => visible[s.id]);
  }

  function draw() {
    if (!lastSol) return;
    NS.drawPlot(plotCanvas, lastSol, currentSeries(), {
      yUnit: model.units ? model.units.concentration : "",
      tUnit: model.units ? model.units.time : "s",
    });
  }

  function integrateAndDraw() {
    const sim = model.simulation || {};
    const tEnd = sim.tEnd || 100;
    const t0 = performance.now();
    lastSol = NS.integrate((t, y) => sys.derivatives(t, y, params), 0, tEnd, sys.y0, {
      rtol: sim.rtol || 1e-6,
      atol: sim.atol || 1e-9,
      hmax: tEnd / 400,
    });
    const ms = performance.now() - t0;
    draw();
    NS.renderEquations(equationsEl, model, params);
    runNoteEl.textContent = lastSol.t.length + " steps, " + ms.toFixed(0) + " ms" +
      (ms > 200 ? " (slow)" : "");
  }

  function scheduleRun() {
    clearTimeout(runTimer);
    runTimer = setTimeout(integrateAndDraw, 50);
  }

  function scheduleDraw() {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(draw, 50);
  }

  // --- dose-response sweep -------------------------------------------------

  function sweepValues(param, n, spacing) {
    const lo = param.min, hi = param.max;
    const out = [];
    const useLog = spacing === "log" && lo > 0 && hi > 0;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : i / (n - 1);
      out.push(useLog ? lo * Math.pow(hi / lo, f) : lo + (hi - lo) * f);
    }
    return out;
  }

  function runSweep() {
    const param = model.parameters.find((p) => p.id === sweepCfg.paramId);
    const species = model.species.find((s) => s.id === sweepCfg.speciesId);
    if (!param || !species) return;
    sweepRunBtn.disabled = true;
    sweepRunBtn.textContent = "Running...";
    // Yield once so the button repaints before the (blocking) sweep runs.
    setTimeout(() => {
      const values = sweepValues(param, sweepCfg.nPoints, sweepCfg.spacing);
      const res = NS.sweep(model, param.id, values, { params, speciesId: species.id });
      const readout = sweepCfg.readout;
      const anyOsc = res.points.some((p) => p.oscillatory);
      const pts = res.points.map((p) => ({ x: p.x, y: p[readout], osc: p.oscillatory }));

      const conc = model.units ? model.units.concentration : "";
      const useTimeAvg = anyOsc && (readout === "mean" || readout === "final");
      const yName = useTimeAvg && readout === "final" ? "time-averaged final" : READOUT_AXIS[readout];
      const xUnit = param.unit ? " (" + param.unit + ")" : "";
      NS.drawDoseResponse(dosePlot, pts, {
        xLabel: (param.name || param.id) + xUnit,
        yLabel: yName + " " + species.id + (conc ? " (" + conc + ")" : ""),
        xLog: sweepCfg.spacing === "log",
      });

      let cap = READOUT_CAPTION[readout] + " of " + (species.name || species.id) +
        " versus " + (param.name || param.id) + ".";
      if (anyOsc) {
        cap += " Open markers denote parameter values at which the system does not settle to a" +
          " steady state; those points report a time-averaged mean over the final portion of each run.";
      }
      doseCaptionEl.textContent = cap;

      sweepRunBtn.disabled = false;
      sweepRunBtn.textContent = "Run sweep";
    }, 0);
  }

  // The model tree is never mutated; all tunable state lives in `params`.
  function activate() {
    model = currentSpec;
    sys = NS.buildModel(model);
    params = Object.assign({}, sys.defaultParams);
    visible = {};
    for (const s of model.species) visible[s.id] = !!s.plot;
    ctx = { params, visible, sys, run: scheduleRun, redraw: scheduleDraw, reset: activate };
    NS.renderCitation(citationEl, model);
    NS.buildControls(controlsEl, model, ctx);

    const doseParam = model.parameters.find((p) => p.role === "dose") || model.parameters[0];
    const plotted = model.species.find((s) => s.plot) || model.species[0];
    sweepCfg = {
      paramId: doseParam.id,
      speciesId: plotted.id,
      readout: "mean",
      nPoints: 25,
      spacing: doseParam.scale || "linear",
    };
    NS.buildSweepControls(sweepControlsEl, model, sweepCfg);

    integrateAndDraw();
    runSweep();
  }

  function boot() {
    const specs = NS.models || [];
    if (!specs.length) {
      controlsEl.textContent = "No models are bundled. Run scripts/build-models.js to generate js/models/models.js.";
      return;
    }
    specs.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = m.name || m.id;
      picker.appendChild(o);
    });
    picker.addEventListener("change", () => {
      currentSpec = specs[Number(picker.value)];
      activate();
    });
    currentSpec = specs[0];
    activate();
  }

  sweepRunBtn.addEventListener("click", runSweep);
  window.addEventListener("resize", () => { scheduleDraw(); });
  boot();
})(typeof globalThis !== "undefined" ? globalThis : this);
