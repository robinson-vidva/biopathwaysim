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

  let currentSpec, model, sys, params, visible, ctx;
  let lastSol = null;
  let runTimer = null, drawTimer = null;

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
    integrateAndDraw();
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

  window.addEventListener("resize", scheduleDraw);
  boot();
})(typeof globalThis !== "undefined" ? globalThis : this);
