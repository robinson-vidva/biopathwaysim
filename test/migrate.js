// Schema migration test. Run: node test/migrate.js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
for (const f of ["spec.js", "rates.js", "assemble.js", "integrator.js", "migrate.js"])
  vm.runInThisContext(readFileSync(join(root, "js", f), "utf8"));
const B = globalThis.BPS;

let allPass = true;
function check(name, pass, detail) {
  if (!pass) allPass = false;
  console.log((pass ? "PASS" : "FAIL") + "  " + name + (detail ? "  " + detail : ""));
}

function simulate(model) {
  const sys = B.buildModel(model);
  const tEnd = (model.simulation && model.simulation.tEnd) || 50;
  return { sys, sol: B.integrate((t, y) => sys.derivatives(t, y, sys.defaultParams), 0, tEnd, sys.y0, {}) };
}
function maxDiff(a, b) {
  let d = 0;
  const n = Math.min(a.t.length, b.t.length);
  for (let i = 0; i < n; i++) for (let j = 0; j < a.y[i].length; j++) d = Math.max(d, Math.abs(a.y[i][j] - b.y[i][j]));
  return d;
}

// A hand-written 1.2 model and its 1.3 equivalent (identical but for the version).
const base = {
  id: "gk_test", name: "GK test",
  units: { concentration: "uM", time: "s" },
  species: [
    { id: "W", name: "W", initial: 1, plot: false },
    { id: "Wstar", name: "Wstar", initial: 0, plot: true },
  ],
  parameters: [
    { id: "signal", name: "S", value: 1, min: 0.01, max: 100, scale: "log", unit: "uM/s" },
    { id: "Vback", name: "Vb", value: 1, min: 0.1, max: 10, scale: "log", unit: "uM/s" },
    { id: "Km", name: "Km", value: 0.01, min: 0.001, max: 2, scale: "log", unit: "uM" },
    { id: "kinDose", name: "Kinase inhibitor", value: 0.5, min: 0, max: 2, scale: "linear", unit: "uM", role: "dose" },
  ],
  reactions: [
    { id: "activate", name: "act", reactants: { W: 1 }, products: { Wstar: 1 },
      rateLaw: { type: "michaelis_menten", Vmax: "signal", Km: "Km",
        modulators: [{ id: "kinInhibitor", name: "Kinase inhibitor", mechanism: "competitive", source: { parameter: "kinDose" }, Ki: 0.05 }] } },
    { id: "deactivate", name: "deact", reactants: { Wstar: 1 }, products: { W: 1 },
      rateLaw: { type: "michaelis_menten", Vmax: "Vback", Km: "Km" } },
  ],
  simulation: { tEnd: 500, rtol: 1e-6, atol: 1e-9 },
};
const v12 = Object.assign({ schemaVersion: "1.2" }, JSON.parse(JSON.stringify(base)));
const v13 = Object.assign({ schemaVersion: "1.3" }, JSON.parse(JSON.stringify(base)));

console.log("== 1.2 migrates and simulates identically to its 1.3 equivalent ==");
const mig = B.migrate(v12);
check("1.2 migrated", mig.ok && mig.model.schemaVersion === "1.3", "from=" + (mig.migratedFrom || "n/a"));
B.validateModel(mig.model);
const simMig = simulate(mig.model);
const sim13 = simulate(B.validateModel(v13));
check("simulates identically to 1.3", maxDiff(simMig.sol, sim13.sol) === 0,
  "final Wstar=" + simMig.sol.y[simMig.sol.y.length - 1][simMig.sys.idx.Wstar].toFixed(6));

// A hand-written 1.0 model: rate-law `feedback` + top-level `inhibitors`.
const v10 = {
  schemaVersion: "1.0", id: "m10", name: "v1.0 test",
  units: { concentration: "uM", time: "s" },
  species: [{ id: "A", initial: 1, plot: true }, { id: "B", initial: 0, plot: true }],
  parameters: [
    { id: "Vf", name: "Vf", value: 1, min: 0, max: 5, scale: "linear", unit: "uM/s" },
    { id: "Km", name: "Km", value: 0.5, min: 0.01, max: 2, scale: "log", unit: "uM" },
    { id: "kr", name: "kr", value: 0.3, min: 0, max: 2, scale: "linear", unit: "1/s" },
    { id: "fbKi", name: "fbKi", value: 1, min: 0.1, max: 10, scale: "log", unit: "uM" },
    { id: "fbN", name: "n", value: 1, min: 1, max: 4, scale: "linear", unit: "" },
  ],
  reactions: [
    { id: "r1", name: "A->B", reactants: { A: 1 }, products: { B: 1 },
      rateLaw: { type: "michaelis_menten", Vmax: "Vf", Km: "Km", feedback: { species: "B", Ki: "fbKi", n: "fbN" } } },
    { id: "r2", name: "B->A", reactants: { B: 1 }, products: { A: 1 }, rateLaw: { type: "mass_action", k: "kr" } },
  ],
  inhibitors: [{ id: "inh1", name: "Inhibitor", target: "r1", mechanism: "competitive", Ki: 0.5, dose: 0, doseMax: 5 }],
  simulation: { tEnd: 50, rtol: 1e-6, atol: 1e-9 },
};
console.log("\n== 1.0 (feedback + inhibitors) migrates, validates, simulates ==");
const m10 = B.migrate(v10);
check("1.0 migrated to 1.3", m10.ok && m10.model.schemaVersion === "1.3");
B.validateModel(m10.model);
const r1mods = m10.model.reactions.find((r) => r.id === "r1").rateLaw.modulators;
check("feedback + inhibitor became two modulators", r1mods.length === 2 &&
  r1mods.some((mm) => mm.source.species === "B") && r1mods.some((mm) => mm.source.parameter),
  "modulators: " + r1mods.map((mm) => mm.mechanism + "/" + (mm.source.species ? "species" : "param")).join(", "));
check("dose became a role:dose parameter", m10.model.parameters.some((p) => p.role === "dose"));
const s10 = simulate(m10.model);
check("1.0 simulates (no NaN)", !s10.sol.y.some((row) => row.some((v) => !isFinite(v))),
  "final [A,B]=" + s10.sol.y[s10.sol.y.length - 1].map((v) => v.toFixed(4)).join(","));

// A hand-written 1.1 model: modulators with { dose, doseMax } and no ids.
const v11 = {
  schemaVersion: "1.1", id: "m11", name: "v1.1 test",
  units: { concentration: "uM", time: "s" },
  species: [{ id: "A", initial: 1, plot: true }, { id: "B", initial: 0, plot: true }],
  parameters: [
    { id: "Vf", name: "Vf", value: 1, min: 0, max: 5, scale: "linear", unit: "uM/s" },
    { id: "Km", name: "Km", value: 0.5, min: 0.01, max: 2, scale: "log", unit: "uM" },
    { id: "kr", name: "kr", value: 0.3, min: 0, max: 2, scale: "linear", unit: "1/s" },
  ],
  reactions: [
    { id: "r1", name: "A->B", reactants: { A: 1 }, products: { B: 1 },
      rateLaw: { type: "michaelis_menten", Vmax: "Vf", Km: "Km",
        modulators: [{ name: "Drug", mechanism: "competitive", source: { dose: 0, doseMax: 5 }, Ki: 0.5 }] } },
    { id: "r2", name: "B->A", reactants: { B: 1 }, products: { A: 1 }, rateLaw: { type: "mass_action", k: "kr" } },
  ],
  simulation: { tEnd: 50, rtol: 1e-6, atol: 1e-9 },
};
console.log("\n== 1.1 ({dose,doseMax} modulator) migrates, validates, simulates ==");
const m11 = B.migrate(v11);
check("1.1 migrated to 1.3", m11.ok && m11.model.schemaVersion === "1.3");
B.validateModel(m11.model);
const mod11 = m11.model.reactions.find((r) => r.id === "r1").rateLaw.modulators[0];
check("modulator got an id and a parameter source", !!mod11.id && !!mod11.source.parameter,
  "id=" + mod11.id + " source=" + JSON.stringify(mod11.source));
const s11 = simulate(m11.model);
check("1.1 simulates (no NaN)", !s11.sol.y.some((row) => row.some((v) => !isFinite(v))));

console.log("\n== refusals ==");
const newer = B.migrate({ schemaVersion: "1.4", id: "x", name: "x" });
check("refuses a newer version", !newer.ok && /newer than this tool/.test(newer.error), newer.error || "");
const junk = B.migrate({ schemaVersion: "banana", id: "x", name: "x" });
check("refuses an unrecognized version", !junk.ok, junk.error || "");
const notObj = B.migrate(null);
check("refuses a non-object", !notObj.ok, notObj.error || "");

console.log("\n== summary ==");
console.log(allPass ? "ALL MIGRATION CHECKS PASSED" : "SOME CHECKS FAILED");
process.exit(allPass ? 0 : 1);
