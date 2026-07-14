// Wiring: pick or build a model, integrate, render diagram + plots, persist.
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
  const builderBodyEl = document.getElementById("builder-body");
  const builderStatusEl = document.getElementById("builder-status");
  const btnNew = document.getElementById("btn-new");
  const btnImport = document.getElementById("btn-import");
  const fileImport = document.getElementById("file-import");
  const btnExport = document.getElementById("btn-export");
  const btnExportCsv = document.getElementById("btn-export-csv");
  const cyEl = document.getElementById("cy");
  const cyPlay = document.getElementById("cy-play");
  const cyTime = document.getElementById("cy-time");
  const cyTimeLabel = document.getElementById("cy-time-label");
  const cyFit = document.getElementById("cy-fit");
  const cyRelayout = document.getElementById("cy-relayout");
  const cyEdit = document.getElementById("cy-edit");
  const editToolbar = document.getElementById("edit-toolbar");
  const ceAddSpecies = document.getElementById("ce-add-species");
  const ceAddReaction = document.getElementById("ce-add-reaction");
  const ceMode = document.getElementById("ce-mode");
  const ceHint = document.getElementById("ce-hint");
  const ceError = document.getElementById("ce-error");
  const diagramEditEl = document.getElementById("diagram-edit");

  const NONMONOTONE_NOTE = "Low-dose inhibition can transiently increase downstream output by " +
    "relieving negative feedback. This is a property of the network, not a numerical artifact.";

  let specs = [];
  let currentSpec, model, sys, params, visible, ctx, sweepCfg;
  let lastSol = null, norms = null;
  let runTimer = null, drawTimer = null, liveTimer = null;
  let diagram = null, diagramSig = "";
  let playing = true, seekFrac = 0, playWall0 = null;
  const PLAY_MS = 14000;
  let lastDose = null;
  let editMode = false, dragMode = "move", connectSource = null, selectedNodeId = null;

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

  // --- tabs ----------------------------------------------------------------

  function setActiveTab(groupName, tabName) {
    const group = document.querySelector('.tabgroup[data-group="' + groupName + '"]');
    if (!group) return;
    group.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.getAttribute("data-tab") === tabName));
    group.querySelectorAll(".tabpanel").forEach((p) => p.classList.toggle("active", p.getAttribute("data-panel") === tabName));
    onTabShown(tabName);
  }

  function onTabShown(name) {
    if (name === "timecourse") scheduleDraw();
    if (name === "dose") drawDose();
  }

  function initTabs() {
    document.querySelectorAll(".tabgroup").forEach((group) => {
      group.querySelectorAll(".tab").forEach((tab) => {
        tab.addEventListener("click", () => setActiveTab(group.getAttribute("data-group"), tab.getAttribute("data-tab")));
      });
    });
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
    if (diagram) norms = diagram.computeNorms(model, sys, lastSol, params);
    draw();
    NS.renderEquations(equationsEl, model, params);
    runNoteEl.textContent = lastSol.t.length + " steps, " + ms.toFixed(0) + " ms" + (ms > 200 ? " (slow)" : "");
  }

  function scheduleRun() { clearTimeout(runTimer); runTimer = setTimeout(integrateAndDraw, 50); }
  function scheduleDraw() { clearTimeout(drawTimer); drawTimer = setTimeout(draw, 50); }

  // --- diagram + playback --------------------------------------------------

  function structureSig(m) {
    return JSON.stringify({
      s: m.species.map((s) => s.id),
      r: m.reactions.map((r) => ({
        id: r.id,
        rc: Object.keys(r.reactants || {}),
        pr: Object.keys(r.products || {}),
        en: (r.rateLaw || {}).enzyme || null,
        md: ((r.rateLaw || {}).modulators || []).map((x) => x.id + ":" + (x.source && (x.source.species || x.source.parameter))),
      })),
    });
  }

  function renderDiagramIfChanged(preserve) {
    if (!diagram) return;
    const sig = structureSig(model);
    if (sig === diagramSig) return;
    diagramSig = sig;
    diagram.render(model, model.layout, { preserve: !!preserve });
    updateInteraction();
  }

  function updateInteraction() {
    if (diagram) diagram.setConnectMode(editMode && dragMode !== "move");
  }

  function fmtTime(t) {
    const u = model.units ? model.units.time : "s";
    return (t >= 100 ? Math.round(t) : Math.round(t * 100) / 100) + " " + u;
  }

  function playbackTick(nowMs) {
    requestAnimationFrame(playbackTick);
    if (!diagram || !lastSol || !sys || !norms) return;
    const tEnd = lastSol.t[lastSol.t.length - 1] || 1;
    if (playing) {
      if (playWall0 == null) playWall0 = nowMs - seekFrac * PLAY_MS;
      let f = ((nowMs - playWall0) / PLAY_MS) % 1;
      if (f < 0) f += 1;
      seekFrac = f;
      cyTime.value = Math.round(seekFrac * 1000);
    }
    const t = seekFrac * tEnd;
    diagram.frame(model, sys, interpState(lastSol, t), params, norms);
    cyTimeLabel.textContent = fmtTime(t);
  }

  function interpState(sol, t) {
    const ts = sol.t, n = ts.length;
    if (t <= ts[0]) return sol.y[0];
    if (t >= ts[n - 1]) return sol.y[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
    const a = ts[lo], b = ts[hi], f = (b > a) ? (t - a) / (b - a) : 0;
    const ya = sol.y[lo], yb = sol.y[hi], out = new Array(ya.length);
    for (let i = 0; i < ya.length; i++) out[i] = ya[i] + (yb[i] - ya[i]) * f;
    return out;
  }

  function setPlaying(p) {
    playing = p;
    playWall0 = null;
    cyPlay.textContent = playing ? "Pause" : "Play";
  }

  // --- diagram <-> equations selection -------------------------------------

  function clearEqHighlight() { equationsEl.querySelectorAll(".eq-hi").forEach((e) => e.classList.remove("eq-hi")); }

  function selectFromDiagram(kind, id) {
    setActiveTab("side", "equations");
    clearEqHighlight();
    const attr = kind === "species" ? "data-species" : "data-reaction";
    let target = null;
    equationsEl.querySelectorAll("[" + attr + "]").forEach((e) => {
      if (e.getAttribute(attr) === id) { e.classList.add("eq-hi"); if (!target) target = e; }
    });
    if (target) target.scrollIntoView({ block: "nearest" });
    if (diagram) diagram.highlight(kind, id);
  }

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

  function drawDose() { if (lastDose) NS.drawDoseResponse(dosePlot, lastDose.pts, lastDose.opts); }

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
      lastDose = { pts, opts: {
        xLabel: (param.name || param.id) + xUnit,
        yLabel: yName + " " + species.id + (conc ? " (" + conc + ")" : ""),
        xLog: sweepCfg.spacing === "log",
      } };
      drawDose();

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

  // --- activate ------------------------------------------------------------

  function activate() {
    model = clone(currentSpec);
    initSweepCfg();
    lastDose = null;
    closePanel();
    NS.renderCitation(citationEl, model);
    refreshBuilder();

    let err = null;
    try { NS.validateModel(model); } catch (e) { err = e.message; }

    if (err) {
      sys = null; norms = null;
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
      doseNoteEl.textContent = ""; doseNoteEl.hidden = true;
      runNoteEl.textContent = "model invalid — not simulated";
      diagramSig = ""; renderDiagramIfChanged(false);
    } else {
      sys = NS.buildModel(model);
      params = Object.assign({}, sys.defaultParams);
      visible = {};
      for (const s of model.species) visible[s.id] = !!s.plot;
      ctx = { params, visible, sys, run: scheduleRun, redraw: scheduleDraw, reset: activate };
      NS.buildControls(controlsEl, model, ctx);
      NS.buildSweepControls(sweepControlsEl, model, sweepCfg);
      diagramSig = ""; renderDiagramIfChanged(false);
      integrateAndDraw();
      runSweep();
    }
  }

  // --- builder integration -------------------------------------------------

  function refreshBuilder() {
    NS.buildEditor(builderBodyEl, model, applyEdit, builderStatusEl);
  }

  function scheduleLiveUpdate() { clearTimeout(liveTimer); liveTimer = setTimeout(liveUpdate, 80); }

  // Shared commit for every edit path (form builder or diagram). Re-renders the
  // equations and the diagram, validates, and simulates only if valid.
  function commitModel() {
    NS.renderEquations(equationsEl, model, eqParamsFor(model));
    renderDiagramIfChanged(true);
    let err = null;
    try { NS.validateModel(model); } catch (e) { err = e.message; }
    if (err) {
      clearTimeout(liveTimer);
      sys = null; norms = null;
      runNoteEl.textContent = "model invalid — not simulated";
      return err;
    }
    scheduleLiveUpdate();
    return null;
  }

  // Used by the form builder (does not refresh itself, to keep input focus).
  function applyEdit() { return commitModel(); }

  // Used by diagram gestures: commit, then refresh the form builder to stay in sync.
  function onDiagramMutated() {
    const err = commitModel();
    refreshBuilder();
    showEditError(err || "");
    return err;
  }

  function showEditError(msg) { ceError.textContent = msg || ""; }

  function setHint() {
    if (!editMode) { ceHint.textContent = ""; return; }
    ceHint.textContent = dragMode === "move" ? "Click a node to edit it; drag to reposition."
      : dragMode === "substrate" ? "Drag species to reaction (reactant) or reaction to species (product)."
      : dragMode === "enzyme" ? "Drag a species onto a reaction to set its enzyme."
      : "Drag a species onto a reaction to add an inhibitor.";
  }

  function openPanel(nodeId) {
    selectedNodeId = nodeId;
    NS.renderNodePanel(diagramEditEl, model, nodeId, onDiagramMutated, closePanel);
    diagramEditEl.hidden = false;
  }
  function closePanel() { selectedNodeId = null; diagramEditEl.hidden = true; if (diagram) diagram.clearHighlight(); }

  function doConnect(src, tgt) {
    const r = NS.diagramConnect(model, src, tgt, dragMode);
    if (!r.ok) { showEditError(r.error); return; }
    showEditError("");
    onDiagramMutated();
  }

  function toggleEdit() {
    editMode = !editMode;
    editToolbar.hidden = !editMode;
    cyEdit.classList.toggle("active", editMode);
    cyEdit.textContent = editMode ? "Done editing" : "Edit diagram";
    if (!editMode) { closePanel(); showEditError(""); }
    updateInteraction();
    setHint();
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
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  function exportModel() {
    // Persist current node positions (schemaVersion 1.3); the engine ignores them.
    if (diagram && (model.species.length + model.reactions.length) > 0) {
      const pos = diagram.positions();
      if (Object.keys(pos).length) model.layout = pos;
    }
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
    try { NS.validateModel(obj); } catch (e) { window.alert("Import refused: " + e.message); return; }
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
      id: "new_model", name: "New model",
      units: { concentration: "uM", time: "s" },
      species: [], parameters: [], reactions: [],
      simulation: { tEnd: 100, rtol: 1e-6, atol: 1e-9 },
    };
  }

  // --- boot ----------------------------------------------------------------

  function boot() {
    initTabs();
    diagram = NS.createDiagram ? NS.createDiagram(cyEl) : null;
    if (diagram) {
      diagram.onTap({
        onNode: (nodeId, kind, label) => {
          if (editMode) { openPanel(nodeId); return; }
          if (kind === "species") selectFromDiagram("species", label);
          else if (kind === "reaction") selectFromDiagram("reaction", label);
        },
        onBackground: () => { if (!editMode) { diagram.clearHighlight(); clearEqHighlight(); } else closePanel(); },
      });
      diagram.onConnect({
        start: (id) => { if (editMode && dragMode !== "move") connectSource = id; },
        end: (id) => {
          if (editMode && dragMode !== "move" && connectSource && id !== connectSource) doConnect(connectSource, id);
          connectSource = null;
        },
      });
    }
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
    requestAnimationFrame(playbackTick);
  }

  btnNew.addEventListener("click", () => {
    const m = blankModel();
    specs.push(m);
    const o = document.createElement("option");
    o.value = String(specs.length - 1);
    o.textContent = m.name + " (new)";
    picker.appendChild(o);
    picker.value = String(specs.length - 1);
    currentSpec = m;
    activate();
    setActiveTab("side", "build");
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

  cyPlay.addEventListener("click", () => setPlaying(!playing));
  cyTime.addEventListener("input", () => { setPlaying(false); seekFrac = Number(cyTime.value) / 1000; });
  cyFit.addEventListener("click", () => { if (diagram) diagram.fit(); });
  cyRelayout.addEventListener("click", () => { if (diagram) { diagram.relayout(); } });

  cyEdit.addEventListener("click", toggleEdit);
  ceAddSpecies.addEventListener("click", () => {
    const r = NS.diagramAddSpecies(model);
    if (!r.ok) { showEditError(r.error); return; }
    showEditError(""); onDiagramMutated(); openPanel(r.id);
  });
  ceAddReaction.addEventListener("click", () => {
    const r = NS.diagramAddReaction(model);
    if (!r.ok) { showEditError(r.error); return; }
    showEditError(""); onDiagramMutated(); openPanel(r.id);
  });
  ceMode.addEventListener("change", () => { dragMode = ceMode.value; updateInteraction(); setHint(); showEditError(""); });

  window.addEventListener("resize", () => { scheduleDraw(); if (diagram) diagram.fit(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof globalThis !== "undefined" ? globalThis : this);
