// Wiring: pick or build a model, integrate, redraw, persist.
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
  const doseNoteEl = document.getElementById("dose-note");
  const sweepRunBtn = document.getElementById("sweep-run");

  const NONMONOTONE_NOTE = "Low-dose inhibition can transiently increase downstream output by " +
    "relieving negative feedback. This is a property of the network, not a numerical artifact.";
  const builderEl = document.getElementById("builder");
  const builderBodyEl = document.getElementById("builder-body");
  const builderStatusEl = document.getElementById("builder-status");
  const btnEdit = document.getElementById("btn-edit");
  const btnNew = document.getElementById("btn-new");
  const btnImport = document.getElementById("btn-import");
  const fileImport = document.getElementById("file-import");
  const btnExport = document.getElementById("btn-export");
  const btnExportCsv = document.getElementById("btn-export-csv");

  let specs = [];
  let currentSpec, model, sys, params, visible, ctx, sweepCfg;
  let lastSol = null;
  let runTimer = null, drawTimer = null, liveTimer = null;
  let builderOpen = false;

  const READOUT_AXIS = {
    mean: "time-averaged mean", final: "final value",
    amplitude: "oscillation amplitude", min: "minimum", max: "maximum",
  };
  const READOUT_CAPTION = {
    mean: "Time-averaged mean", final: "Final value",
    amplitude: "Oscillation amplitude", min: "Minimum", max: "Maximum",
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function paramsFromModel(m) { const p = {}; for (const par of m.parameters) p[par.id] = par.value; return p; }
  function eqParamsFor(m) {
    const p = paramsFromModel(m);
    if (params) for (const k in params) if (k in p) p[k] = params[k];
    return p;
  }

  // --- simulate / draw -----------------------------------------------------

  function currentSeries() {
    return model.species
      .map((s, i) => ({ id: s.id, name: s.name || s.id, color: NS.speciesColor(i), index: sys.idx[s.id] }))
      .filter((s) => visible[s.id]);
  }

  function clearCanvas(cv) {
    const c = cv.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
  }

  function draw() {
    if (!lastSol || !sys) return;
    NS.drawPlot(plotCanvas, lastSol, currentSeries(), {
      yUnit: model.units ? model.units.concentration : "",
      tUnit: model.units ? model.units.time : "s",
    });
  }

  function integrateAndDraw() {
    if (!sys) return;
    const sim = model.simulation || {};
    const tEnd = sim.tEnd || 100;
    const t0 = performance.now();
    lastSol = NS.integrate((t, y) => sys.derivatives(t, y, params), 0, tEnd, sys.y0, {
      rtol: sim.rtol || 1e-6, atol: sim.atol || 1e-9, hmax: tEnd / 400,
    });
    const ms = performance.now() - t0;
    draw();
    NS.renderEquations(equationsEl, model, params);
    runNoteEl.textContent = lastSol.t.length + " steps, " + ms.toFixed(0) + " ms" + (ms > 200 ? " (slow)" : "");
  }

  function scheduleRun() { clearTimeout(runTimer); runTimer = setTimeout(integrateAndDraw, 50); }
  function scheduleDraw() { clearTimeout(drawTimer); drawTimer = setTimeout(draw, 50); }

  // --- dose-response sweep -------------------------------------------------

  function sweepValues(param, n, spacing) {
    const lo = param.min, hi = param.max, out = [];
    if (spacing === "log" && hi > 0) {
      if (lo > 0) {
        for (let i = 0; i < n; i++) out.push(lo * Math.pow(hi / lo, i / (n - 1)));
      } else {
        out.push(0);
        const floor = hi / 1000, m = n - 1;
        for (let i = 0; i < m; i++) out.push(m <= 1 ? hi : floor * Math.pow(hi / floor, i / (m - 1)));
      }
    } else {
      for (let i = 0; i < n; i++) out.push(n === 1 ? lo : lo + (hi - lo) * (i / (n - 1)));
    }
    return out;
  }

  function runSweep() {
    if (!sys) return;
    const param = model.parameters.find((p) => p.id === sweepCfg.paramId);
    const species = model.species.find((s) => s.id === sweepCfg.speciesId);
    if (!param || !species) return;
    sweepRunBtn.disabled = true;
    sweepRunBtn.textContent = "Running...";
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

      if (risesBeforeFalls(pts.map((p) => p.y))) {
        doseNoteEl.textContent = NONMONOTONE_NOTE;
        doseNoteEl.hidden = false;
      } else {
        doseNoteEl.textContent = "";
        doseNoteEl.hidden = true;
      }

      sweepRunBtn.disabled = false;
      sweepRunBtn.textContent = "Run sweep";
    }, 0);
  }

  function initSweepCfg() {
    const doseParam = model.parameters.find((p) => p.role === "dose");
    const sweepParam = doseParam || model.parameters[0];
    const plotted = model.species.find((s) => s.plot) || model.species[0];
    sweepCfg = {
      paramId: sweepParam ? sweepParam.id : "",
      speciesId: plotted ? plotted.id : "",
      readout: "mean",
      nPoints: doseParam ? 40 : 25,
      spacing: doseParam ? "log" : (sweepParam ? (sweepParam.scale || "linear") : "linear"),
    };
  }

  // A curve "rises before it falls" when its greatest value is at an interior
  // point, meaningfully above both ends. Detected from the data, not the model.
  function risesBeforeFalls(ys) {
    const v = ys.filter((y) => isFinite(y));
    if (v.length < 3) return false;
    let lo = v[0], hi = v[0], maxIdx = 0;
    for (let i = 0; i < v.length; i++) {
      if (v[i] < lo) lo = v[i];
      if (v[i] > hi) { hi = v[i]; maxIdx = i; }
    }
    const range = hi - lo;
    if (range <= 0) return false;
    const tol = 0.01 * range;
    return maxIdx > 0 && maxIdx < v.length - 1 &&
      v[maxIdx] - v[0] > tol && v[maxIdx] - v[v.length - 1] > tol;
  }

  function reconcileSweepCfg() {
    if (!model.parameters.find((p) => p.id === sweepCfg.paramId)) {
      const dp = model.parameters.find((p) => p.role === "dose") || model.parameters[0];
      sweepCfg.paramId = dp ? dp.id : "";
      sweepCfg.spacing = dp ? (dp.role === "dose" ? "log" : (dp.scale || "linear")) : "linear";
    }
    if (!model.species.find((s) => s.id === sweepCfg.speciesId)) {
      const sp = model.species.find((s) => s.plot) || model.species[0];
      sweepCfg.speciesId = sp ? sp.id : "";
    }
  }

  // --- activate a model (tolerant of invalid, still-being-built models) ----

  function activate() {
    model = clone(currentSpec);
    initSweepCfg();
    NS.renderCitation(citationEl, model);

    let err = null;
    try { NS.validateModel(model); } catch (e) { err = e.message; }

    if (err) {
      sys = null;
      params = paramsFromModel(model);
      visible = {};
      for (const s of model.species) visible[s.id] = !!s.plot;
      ctx = { params, visible, sys: null, run: scheduleRun, redraw: scheduleDraw, reset: activate };
      NS.buildControls(controlsEl, model, ctx);
      NS.buildSweepControls(sweepControlsEl, model, sweepCfg);
      NS.renderEquations(equationsEl, model, eqParamsFor(model));
      lastSol = null;
      clearCanvas(plotCanvas);
      clearCanvas(dosePlot);
      doseCaptionEl.textContent = "";
      doseNoteEl.textContent = "";
      doseNoteEl.hidden = true;
      runNoteEl.textContent = "model invalid — not simulated";
    } else {
      sys = NS.buildModel(model);
      params = Object.assign({}, sys.defaultParams);
      visible = {};
      for (const s of model.species) visible[s.id] = !!s.plot;
      ctx = { params, visible, sys, run: scheduleRun, redraw: scheduleDraw, reset: activate };
      NS.buildControls(controlsEl, model, ctx);
      NS.buildSweepControls(sweepControlsEl, model, sweepCfg);
      integrateAndDraw();
      runSweep();
    }
    if (builderOpen) refreshBuilder();
  }

  // --- builder integration -------------------------------------------------

  function refreshBuilder() {
    NS.buildEditor(builderBodyEl, model, applyEdit, builderStatusEl);
  }

  function scheduleLiveUpdate() { clearTimeout(liveTimer); liveTimer = setTimeout(liveUpdate, 80); }

  // Called by the builder after every edit. Returns an error string or null.
  function applyEdit() {
    NS.renderEquations(equationsEl, model, eqParamsFor(model));
    let err = null;
    try { NS.validateModel(model); } catch (e) { err = e.message; }
    if (err) {
      clearTimeout(liveTimer);
      sys = null;
      runNoteEl.textContent = "model invalid — not simulated";
      return err;
    }
    scheduleLiveUpdate();
    return null;
  }

  function liveUpdate() {
    try { sys = NS.buildModel(model); } catch (e) { return; }
    const d = sys.defaultParams, np = {};
    for (const k in d) np[k] = (params && k in params) ? params[k] : d[k];
    params = np;
    const nv = {};
    for (const s of model.species) nv[s.id] = (visible && s.id in visible) ? visible[s.id] : !!s.plot;
    visible = nv;
    reconcileSweepCfg();
    ctx = { params, visible, sys, run: scheduleRun, redraw: scheduleDraw, reset: activate };
    NS.renderCitation(citationEl, model);
    NS.buildControls(controlsEl, model, ctx);
    NS.buildSweepControls(sweepControlsEl, model, sweepCfg);
    integrateAndDraw();
  }

  // --- persistence ---------------------------------------------------------

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  function exportModel() {
    download((model.id || "model") + ".json", JSON.stringify(model, null, 2), "application/json");
  }

  function exportCsv() {
    if (!lastSol || !sys) { window.alert("Run a valid simulation before exporting trajectories."); return; }
    const cols = model.species.filter((s) => visible[s.id]);
    if (!cols.length) { window.alert("No species are selected on the plot."); return; }
    const header = ["time"].concat(cols.map((s) => s.name || s.id)).join(",");
    const lines = [header];
    for (let i = 0; i < lastSol.t.length; i++) {
      const row = [lastSol.t[i]].concat(cols.map((s) => lastSol.y[i][sys.idx[s.id]]));
      lines.push(row.join(","));
    }
    download((model.id || "model") + "_trajectories.csv", lines.join("\n"), "text/csv");
  }

  function importModel(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { window.alert("Import failed: the file is not valid JSON."); return; }
    if (!obj || typeof obj !== "object" || obj.schemaVersion !== NS.SCHEMA_VERSION) {
      window.alert("Import refused: this file declares schemaVersion '" +
        (obj && obj.schemaVersion) + "'. BioPathwaySim supports " + NS.SCHEMA_VERSION +
        ". Convert the model, or export it from this version of the tool.");
      return;
    }
    try { NS.validateModel(obj); } catch (e) {
      window.alert("Import refused: " + e.message);
      return;
    }
    specs.push(obj);
    const o = document.createElement("option");
    o.value = String(specs.length - 1);
    o.textContent = (obj.name || obj.id) + " (imported)";
    picker.appendChild(o);
    picker.value = String(specs.length - 1);
    currentSpec = obj;
    activate();
  }

  function blankModel() {
    return {
      schemaVersion: NS.SCHEMA_VERSION,
      id: "new_model",
      name: "New model",
      units: { concentration: "uM", time: "s" },
      species: [],
      parameters: [],
      reactions: [],
      simulation: { tEnd: 100, rtol: 1e-6, atol: 1e-9 },
    };
  }

  // --- boot ----------------------------------------------------------------

  function boot() {
    specs = (NS.models || []).slice();
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
    picker.addEventListener("change", () => { currentSpec = specs[Number(picker.value)]; activate(); });
    currentSpec = specs[0];
    activate();
  }

  btnEdit.addEventListener("click", () => {
    builderOpen = !builderOpen;
    builderEl.hidden = !builderOpen;
    btnEdit.classList.toggle("active", builderOpen);
    if (builderOpen) refreshBuilder();
  });
  btnNew.addEventListener("click", () => {
    const m = blankModel();
    specs.push(m);
    const o = document.createElement("option");
    o.value = String(specs.length - 1);
    o.textContent = m.name + " (new)";
    picker.appendChild(o);
    picker.value = String(specs.length - 1);
    currentSpec = m;
    if (!builderOpen) btnEdit.click();
    activate();
  });
  btnImport.addEventListener("click", () => fileImport.click());
  fileImport.addEventListener("change", () => {
    const f = fileImport.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => importModel(String(reader.result));
    reader.readAsText(f);
    fileImport.value = "";
  });
  btnExport.addEventListener("click", exportModel);
  btnExportCsv.addEventListener("click", exportCsv);
  sweepRunBtn.addEventListener("click", runSweep);
  window.addEventListener("resize", () => { scheduleDraw(); });
  boot();
})(typeof globalThis !== "undefined" ? globalThis : this);
