// Forward schema migration. Brings an older model up to the current
// schemaVersion through small pure steps, then the caller validates it.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  const VERSIONS = ["1.0", "1.1", "1.2", "1.3"];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uniqueId(prefix, taken) { let i = 1; while (taken.has(prefix + i)) i++; return prefix + i; }

  // 1.0 -> 1.1: a rate law's optional `feedback` and the top-level `inhibitors`
  // array both become entries in `rateLaw.modulators`.
  function to_1_1(m) {
    const inhibitors = Array.isArray(m.inhibitors) ? m.inhibitors : [];
    for (const r of (m.reactions || [])) {
      const law = r.rateLaw || (r.rateLaw = {});
      if (law.feedback) {
        const fb = law.feedback;
        const mod = { source: { species: fb.species }, mechanism: "noncompetitive", Ki: fb.Ki };
        if (fb.n !== undefined) mod.n = fb.n;
        (law.modulators || (law.modulators = [])).push(mod);
        delete law.feedback;
      }
    }
    for (const inh of inhibitors) {
      const r = (m.reactions || []).find((x) => x.id === inh.target);
      if (!r) continue;
      const law = r.rateLaw || (r.rateLaw = {});
      const mod = {
        source: { dose: inh.dose !== undefined ? inh.dose : 0, doseMax: inh.doseMax !== undefined ? inh.doseMax : 0 },
        mechanism: inh.mechanism, Ki: inh.Ki,
      };
      if (inh.name) mod.name = inh.name;
      (law.modulators || (law.modulators = [])).push(mod);
    }
    delete m.inhibitors;
    m.schemaVersion = "1.1";
    return m;
  }

  // 1.1 -> 1.2: every modulator gains a required id; a dose-sourced modulator
  // ({ dose, doseMax }) becomes a parameter with role "dose", referenced by id.
  function to_1_2(m) {
    m.parameters = m.parameters || [];
    const paramIds = new Set(m.parameters.map((p) => p.id));
    const modIds = new Set();
    for (const r of (m.reactions || [])) {
      const law = r.rateLaw || {};
      for (const mod of (law.modulators || [])) {
        if (!mod.id) mod.id = uniqueId("m", modIds);
        modIds.add(mod.id);
        if (mod.source && mod.source.dose !== undefined) {
          const pid = uniqueId("dose", paramIds);
          paramIds.add(pid);
          m.parameters.push({
            id: pid, name: mod.name || "dose", value: mod.source.dose,
            min: 0, max: mod.source.doseMax !== undefined ? mod.source.doseMax : (mod.source.dose || 1),
            scale: "linear", unit: (m.units && m.units.concentration) || "", role: "dose",
          });
          mod.source = { parameter: pid };
        }
      }
    }
    m.schemaVersion = "1.2";
    return m;
  }

  // 1.2 -> 1.3: `layout` is optional, so there is nothing to add.
  function to_1_3(m) { m.schemaVersion = "1.3"; return m; }

  const STEPS = { "1.0": to_1_1, "1.1": to_1_2, "1.2": to_1_3 };

  function parseVer(v) { const mm = /^(\d+)\.(\d+)$/.exec(v || ""); return mm ? [+mm[1], +mm[2]] : null; }
  function cmpVer(a, b) { return a[0] - b[0] || a[1] - b[1]; }

  function migrate(model) {
    const current = NS.SCHEMA_VERSION || "1.3";
    if (!model || typeof model !== "object")
      return { ok: false, error: "the file is not a model object." };
    const v = model.schemaVersion;
    const from = typeof v === "string" ? VERSIONS.indexOf(v) : -1;
    if (from === -1) {
      const pv = parseVer(v), cur = parseVer(current);
      if (pv && cur && cmpVer(pv, cur) > 0)
        return { ok: false, error: "this file declares schemaVersion '" + v + "', which is newer than this tool (" + current + "). Update BioPathwaySim to open it." };
      return { ok: false, error: "unrecognized schemaVersion '" + v + "'. Supported versions are " + VERSIONS.join(", ") + "." };
    }
    const to = VERSIONS.indexOf(current);
    let m = clone(model);
    for (let i = from; i < to; i++) m = STEPS[VERSIONS[i]](m);
    return { ok: true, model: m, migratedFrom: from < to ? v : null };
  }

  NS.migrate = migrate;
  NS.SCHEMA_VERSIONS = VERSIONS;
})(typeof globalThis !== "undefined" ? globalThis : this);
