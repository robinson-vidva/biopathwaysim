// Headless validation gate. Run: node test/validate.js

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildModel } from "../js/assemble.js";
import { integrate } from "../js/integrator.js";
import { validateModel } from "../js/spec.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function loadModel(name) {
  const raw = readFileSync(join(root, "js", "models", name), "utf8");
  return JSON.parse(raw);
}

function withParams(sys, overrides) {
  return Object.assign({}, sys.defaultParams, overrides || {});
}

function run(sys, params, tEnd, opts) {
  return integrate(
    (t, y) => sys.derivatives(t, y, params),
    0,
    tEnd,
    sys.y0,
    opts || {}
  );
}

function anyNaN(sol) {
  for (const row of sol.y) for (const v of row) if (!isFinite(v)) return true;
  return false;
}

// --- oscillation analysis -------------------------------------------------

function series(sol, idx) {
  return sol.t.map((t, i) => [t, sol.y[i][idx]]);
}

function extrema(pts, tStart) {
  const s = pts.filter((p) => p[0] >= tStart);
  const vals = s.map((p) => p[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const mid = (lo + hi) / 2, band = 0.05 * (hi - lo);
  const peaks = [], troughs = [];
  for (let i = 1; i < s.length - 1; i++) {
    const [t, v] = s[i];
    if (v > s[i - 1][1] && v >= s[i + 1][1] && v > mid + band) peaks.push([t, v]);
    if (v < s[i - 1][1] && v <= s[i + 1][1] && v < mid - band) troughs.push([t, v]);
  }
  return { peaks, troughs, lo, hi };
}

function period(peaks) {
  if (peaks.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < peaks.length; i++) sum += peaks[i][0] - peaks[i - 1][0];
  return sum / (peaks.length - 1);
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Time-weighted (trapezoidal) mean; adaptive steps are not uniformly spaced.
function meanOfSpecies(sol, idx, tStart) {
  let area = 0, span = 0;
  for (let i = 1; i < sol.t.length; i++) {
    const t0 = sol.t[i - 1], t1 = sol.t[i];
    if (t1 <= tStart) continue;
    const a = Math.max(t0, tStart);
    const dt = t1 - a;
    if (dt <= 0) continue;
    const v0 = t0 >= tStart ? sol.y[i - 1][idx]
      : sol.y[i - 1][idx] + (sol.y[i][idx] - sol.y[i - 1][idx]) * (a - t0) / (t1 - t0);
    const v1 = sol.y[i][idx];
    area += 0.5 * (v0 + v1) * dt;
    span += dt;
  }
  return area / span;
}

// --- Hill coefficient (Goldbeter-Koshland) --------------------------------

function steadyFraction(sys, signal, Km) {
  const params = withParams(sys, { signal, Km });
  const sol = run(sys, params, 800, { rtol: 1e-8, atol: 1e-11 });
  const last = sol.y[sol.y.length - 1];
  const w = last[sys.idx.W], ws = last[sys.idx.Wstar];
  return ws / (w + ws);
}

// Bisection on log10(signal) for the S giving the target modified fraction.
function signalForFraction(sys, Km, target) {
  let lo = -6, hi = 6;
  if (steadyFraction(sys, Math.pow(10, lo), Km) > target) return null;
  if (steadyFraction(sys, Math.pow(10, hi), Km) < target) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (steadyFraction(sys, Math.pow(10, mid), Km) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2; // log10(signal)
}

function hillCoefficient(sys, Km) {
  const l10 = signalForFraction(sys, Km, 0.1);
  const l90 = signalForFraction(sys, Km, 0.9);
  if (l10 === null || l90 === null) return null;
  const ratio = Math.pow(10, l90 - l10); // S90 / S10
  return Math.log(81) / Math.log(ratio);
}

// --- run gate -------------------------------------------------------------

const results = [];
let allPass = true;
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  if (!pass) allPass = false;
  console.log((pass ? "PASS" : "FAIL") + "  " + name + (detail ? "  " + detail : ""));
}

console.log("== spec validation ==");
const mapkModel = loadModel("mapk.json");
const gkModel = loadModel("goldbeter-koshland.json");
validateModel(mapkModel);
validateModel(gkModel);
console.log("both models pass schema validation");

let badCaught = false;
try {
  validateModel({ schemaVersion: "1.0", id: "x", name: "x", species: [{ id: "A", initial: 1 }],
    parameters: [], reactions: [{ id: "r", reactants: {}, products: {},
      rateLaw: { type: "mass_action", k: "missing" } }] });
} catch (e) { badCaught = true; }
check("invalid model rejected", badCaught, "");

console.log("\n== 1. MAPK sustained oscillations ==");
const mapk = buildModel(mapkModel);
const oscSol = run(mapk, mapk.defaultParams, 15000, { rtol: 1e-7, atol: 1e-9, hmax: 12 });
const erk = series(oscSol, mapk.idx.MAPKpp);
const ex = extrema(erk, 4000);
const per = period(ex.peaks);
const amp = ex.peaks.length && ex.troughs.length
  ? mean(ex.peaks.map((p) => p[1])) - mean(ex.troughs.map((p) => p[1]))
  : 0;
check("MAPK oscillates", ex.peaks.length >= 3 && per !== null,
  "peaks=" + ex.peaks.length + " period=" + (per ? per.toFixed(1) + "s" : "n/a") +
  " amplitude=" + amp.toFixed(1) + "nM  range=[" + ex.lo.toFixed(1) + "," + ex.hi.toFixed(1) + "]");

console.log("\n== 2. Goldbeter-Koshland ultrasensitivity ==");
const gk = buildModel(gkModel);
const nHzero = hillCoefficient(gk, 0.01);
const nHfirst = hillCoefficient(gk, 1.1);
check("zero-order Hill ~26", nHzero !== null && nHzero > 15,
  "nH(Km=0.01)=" + (nHzero ? nHzero.toFixed(1) : "n/a"));
check("first-order Hill ~1.3", nHfirst !== null && nHfirst < 2.0,
  "nH(Km=1.1)=" + (nHfirst ? nHfirst.toFixed(2) : "n/a"));

console.log("\n== 3. Inhibitors reduce target output monotonically ==");
// MEK inhibitor (noncompetitive) on MAPK: mean active ERK vs dose.
const mekDoses = [0, 30, 60, 120, 180, 240, 300];
const mekOut = mekDoses.map((d) => {
  const sol = run(mapk, withParams(mapk, { mekInh: d }), 15000, { rtol: 1e-7, atol: 1e-9, hmax: 20 });
  return meanOfSpecies(sol, mapk.idx.MAPKpp, 4000);
});
let mekMono = true;
for (let i = 1; i < mekOut.length; i++) if (mekOut[i] > mekOut[i - 1] + 1e-6) mekMono = false;
check("MEK inhibitor monotonic", mekMono,
  "mean ERK-PP: " + mekOut.map((v) => v.toFixed(1)).join(" > "));

// Kinase inhibitor (competitive) on Goldbeter-Koshland: steady modified fraction vs dose.
const kinDoses = [0, 0.1, 0.25, 0.5, 1.0, 1.5, 2.0];
const kinOut = kinDoses.map((d) => {
  const params = withParams(gk, { signal: 1.0, Km: 0.01, kinaseInh: d });
  const sol = run(gk, params, 800, { rtol: 1e-8, atol: 1e-11 });
  const last = sol.y[sol.y.length - 1];
  return last[gk.idx.Wstar];
});
let kinMono = true;
for (let i = 1; i < kinOut.length; i++) if (kinOut[i] > kinOut[i - 1] + 1e-6) kinMono = false;
check("kinase inhibitor monotonic", kinMono,
  "Wstar: " + kinOut.map((v) => v.toFixed(3)).join(" > "));

console.log("\n== 4. Integrator stable at slider extremes ==");
let stable = true;
const details = [];
for (const model of [mapkModel, gkModel]) {
  const sys = buildModel(model);
  // all parameters at min, then all at max, plus inhibitors at doseMax.
  for (const bound of ["min", "max"]) {
    const p = Object.assign({}, sys.defaultParams);
    for (const par of model.parameters) if (par[bound] !== undefined) p[par.id] = par[bound];
    for (const inh of model.inhibitors || []) p[inh.id] = bound === "max" ? (inh.doseMax || 0) : 0;
    const tEnd = model.simulation.tEnd;
    const sol = run(sys, p, tEnd, { rtol: 1e-6, atol: 1e-9, hmax: tEnd / 50 });
    const ok = !anyNaN(sol);
    if (!ok) stable = false;
    details.push(model.id + ":" + bound + (ok ? " ok" : " NaN"));
  }
}
check("no NaN / blow-up at extremes", stable, details.join(", "));

console.log("\n== summary ==");
console.log(allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
process.exit(allPass ? 0 : 1);
