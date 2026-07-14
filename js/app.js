// Wiring: load a model, integrate, redraw, and re-run on control changes.

import { buildModel } from "./assemble.js";
import { integrate } from "./integrator.js";
import { drawPlot } from "./plot.js";
import {
  buildControls, renderCitation, renderEquations, speciesColor,
} from "./ui.js";

const MODEL_FILES = ["js/models/mapk.json", "js/models/goldbeter-koshland.json"];

const plotCanvas = document.getElementById("plot");
const controlsEl = document.getElementById("controls");
const citationEl = document.getElementById("citation");
const equationsEl = document.getElementById("equations");
const runNoteEl = document.getElementById("run-note");
const picker = document.getElementById("model-picker");

let pristine, model, sys, params, visible, ctx;
let lastSol = null;
let runTimer = null, drawTimer = null;

async function loadJSON(file) {
  const url = new URL(file, document.baseURI).href;
  try { return (await import(url, { with: { type: "json" } })).default; }
  catch (e1) {
    try { return (await import(url, { assert: { type: "json" } })).default; }
    catch (e2) {
      const r = await fetch(url);
      if (!r.ok) throw new Error("cannot load " + file);
      return r.json();
    }
  }
}

function currentSeries() {
  return model.species
    .map((s, i) => ({ id: s.id, name: s.name || s.id, color: speciesColor(i), index: sys.idx[s.id] }))
    .filter((s) => visible[s.id]);
}

function draw() {
  if (!lastSol) return;
  drawPlot(plotCanvas, lastSol, currentSeries(), {
    yUnit: model.units ? model.units.concentration : "",
    tUnit: model.units ? model.units.time : "s",
  });
}

function integrateAndDraw() {
  const sim = model.simulation || {};
  const tEnd = sim.tEnd || 100;
  const t0 = performance.now();
  lastSol = integrate((t, y) => sys.derivatives(t, y, params), 0, tEnd, sys.y0, {
    rtol: sim.rtol || 1e-6,
    atol: sim.atol || 1e-9,
    hmax: tEnd / 400,
  });
  const ms = performance.now() - t0;
  draw();
  renderEquations(equationsEl, model, params);
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

function activate() {
  model = JSON.parse(JSON.stringify(pristine));
  sys = buildModel(model);
  params = Object.assign({}, sys.defaultParams);
  visible = {};
  for (const s of model.species) visible[s.id] = !!s.plot;
  ctx = { params, visible, sys, run: scheduleRun, redraw: scheduleDraw, reset: activate };
  renderCitation(citationEl, model);
  buildControls(controlsEl, model, ctx);
  integrateAndDraw();
}

async function boot() {
  let specs;
  try {
    specs = await Promise.all(MODEL_FILES.map(loadJSON));
  } catch (e) {
    controlsEl.textContent = "Could not load model files: " + e.message +
      ". Open via a local server (e.g. python3 -m http.server) or a browser that permits ES modules over file://.";
    return;
  }
  specs.forEach((m, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = m.name || m.id;
    picker.appendChild(o);
  });
  picker.addEventListener("change", () => {
    pristine = specs[Number(picker.value)];
    activate();
  });
  pristine = specs[0];
  activate();
}

window.addEventListener("resize", scheduleDraw);
boot();
