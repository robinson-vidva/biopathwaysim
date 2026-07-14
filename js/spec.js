// Model spec v1.2 validation. Classic script; attaches to the BPS namespace.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  const SCHEMA_VERSION = "1.3";
  const MAX_SPECIES = 20;
  const MAX_REACTIONS = 25;
  const RATE_LAWS = ["constant", "mass_action", "michaelis_menten", "hill"];
  const MECHANISMS = ["competitive", "noncompetitive", "uncompetitive"];

  function fail(msg) {
    throw new Error("model validation: " + msg);
  }

  function isNumber(x) {
    return typeof x === "number" && isFinite(x);
  }

  function requireId(obj, kind, i) {
    if (typeof obj.id !== "string" || obj.id.length === 0)
      fail(kind + "[" + i + "] missing string id");
    return obj.id;
  }

  function checkParamRef(id, params, ctx) {
    if (typeof id !== "string" || !params.has(id))
      fail(ctx + " references unknown parameter '" + id + "'");
  }

  function checkSpeciesRef(id, species, ctx) {
    if (typeof id !== "string" || !species.has(id))
      fail(ctx + " references unknown species '" + id + "'");
  }

  function checkNumberOrParam(v, params, ctx) {
    if (isNumber(v)) return;
    if (typeof v === "string" && params.has(v)) return;
    fail(ctx + " must be a number or a known parameter id");
  }

  function validateModulators(law, ctx, species, params, seenModIds) {
    if (law.modulators === undefined) return;
    if (!Array.isArray(law.modulators)) fail(ctx + ".modulators must be an array");
    law.modulators.forEach((m, k) => {
      const c = ctx + ".modulators[" + k + "]";
      if (!m || typeof m !== "object") fail(c + " must be an object");
      if (typeof m.id !== "string" || m.id.length === 0) fail(c + " requires a string id");
      if (seenModIds.has(m.id)) fail("duplicate modulator id '" + m.id + "'");
      seenModIds.add(m.id);
      if (m.name !== undefined && typeof m.name !== "string") fail(c + ".name must be a string");
      const src = m.source;
      if (!src || typeof src !== "object") fail(c + ".source is required");
      const hasParam = src.parameter !== undefined;
      const hasSpecies = src.species !== undefined;
      if (hasParam === hasSpecies)
        fail(c + ".source must specify exactly one of parameter or species");
      if (hasParam) checkParamRef(src.parameter, params, c + ".source.parameter");
      if (hasSpecies) checkSpeciesRef(src.species, species, c + ".source.species");
      if (!MECHANISMS.includes(m.mechanism))
        fail(c + " has unknown mechanism '" + m.mechanism + "'");
      checkNumberOrParam(m.Ki, params, c + ".Ki");
      if (m.n !== undefined) checkNumberOrParam(m.n, params, c + ".n");
    });
  }

  function validateRateLaw(law, rxnId, species, params, reactants, seenModIds) {
    if (!law || typeof law !== "object") fail(rxnId + ": missing rateLaw");
    if (!RATE_LAWS.includes(law.type))
      fail(rxnId + ": unknown rate law type '" + law.type + "'");

    if (law.type === "constant") {
      checkParamRef(law.k, params, rxnId + ".k");
    } else if (law.type === "mass_action") {
      checkParamRef(law.k, params, rxnId + ".k");
      if (reactants.length === 0)
        fail(rxnId + ": mass_action requires at least one reactant");
    } else if (law.type === "michaelis_menten" || law.type === "hill") {
      if (reactants.length !== 1)
        fail(rxnId + ": " + law.type + " requires exactly one reactant (the substrate)");
      if (law.enzyme !== undefined)
        checkSpeciesRef(law.enzyme, species, rxnId + ".enzyme");
      if (law.enzyme !== undefined) checkParamRef(law.kcat, params, rxnId + ".kcat");
      else checkParamRef(law.Vmax, params, rxnId + ".Vmax");
      if (law.type === "michaelis_menten") {
        checkParamRef(law.Km, params, rxnId + ".Km");
      } else {
        checkParamRef(law.K, params, rxnId + ".K");
        checkParamRef(law.n, params, rxnId + ".n");
      }
    }

    validateModulators(law, rxnId + ".rateLaw", species, params, seenModIds);
  }

  function validateModel(model) {
    if (!model || typeof model !== "object") fail("model must be an object");
    if (model.schemaVersion !== SCHEMA_VERSION)
      fail("schemaVersion must be '" + SCHEMA_VERSION + "'");
    if (typeof model.id !== "string" || model.id.length === 0) fail("missing model id");
    if (typeof model.name !== "string") fail("missing model name");

    if (!Array.isArray(model.species) || model.species.length === 0)
      fail("species must be a non-empty array");
    if (model.species.length > MAX_SPECIES)
      fail("too many species (" + model.species.length + " > " + MAX_SPECIES + ")");
    if (!Array.isArray(model.reactions) || model.reactions.length === 0)
      fail("reactions must be a non-empty array");
    if (model.reactions.length > MAX_REACTIONS)
      fail("too many reactions (" + model.reactions.length + " > " + MAX_REACTIONS + ")");

    const species = new Map();
    model.species.forEach((s, i) => {
      const id = requireId(s, "species", i);
      if (species.has(id)) fail("duplicate species id '" + id + "'");
      if (!isNumber(s.initial)) fail("species '" + id + "' initial must be a number");
      species.set(id, s);
    });

    const params = new Map();
    if (!Array.isArray(model.parameters)) fail("parameters must be an array");
    model.parameters.forEach((p, i) => {
      const id = requireId(p, "parameters", i);
      if (params.has(id)) fail("duplicate parameter id '" + id + "'");
      if (!isNumber(p.value)) fail("parameter '" + id + "' value must be a number");
      if (p.scale !== undefined && p.scale !== "linear" && p.scale !== "log")
        fail("parameter '" + id + "' scale must be linear or log");
      if (p.role !== undefined && typeof p.role !== "string")
        fail("parameter '" + id + "' role must be a string");
      params.set(id, p);
    });

    const reactionIds = new Set();
    const seenModIds = new Set();
    model.reactions.forEach((r, i) => {
      const id = requireId(r, "reactions", i);
      if (reactionIds.has(id)) fail("duplicate reaction id '" + id + "'");
      reactionIds.add(id);
      const reactants = r.reactants || {};
      const products = r.products || {};
      for (const sid in reactants) {
        checkSpeciesRef(sid, species, id + ".reactants");
        if (!isNumber(reactants[sid])) fail(id + ": reactant '" + sid + "' stoich must be a number");
      }
      for (const sid in products) {
        checkSpeciesRef(sid, species, id + ".products");
        if (!isNumber(products[sid])) fail(id + ": product '" + sid + "' stoich must be a number");
      }
      validateRateLaw(r.rateLaw, id, species, params, Object.keys(reactants), seenModIds);
    });

    const sim = model.simulation || {};
    if (sim.tEnd !== undefined && (!isNumber(sim.tEnd) || sim.tEnd <= 0))
      fail("simulation.tEnd must be positive");

    // Optional diagram node positions. Purely presentational: the engine ignores
    // it and it has no effect on the numerics.
    if (model.layout !== undefined) {
      if (typeof model.layout !== "object" || model.layout === null || Array.isArray(model.layout))
        fail("layout must be an object");
      for (const k in model.layout) {
        const p = model.layout[k];
        if (!p || typeof p !== "object" || !isNumber(p.x) || !isNumber(p.y))
          fail("layout['" + k + "'] must have numeric x and y");
      }
    }

    return model;
  }

  NS.validateModel = validateModel;
  NS.SCHEMA_VERSION = SCHEMA_VERSION;
  NS.MECHANISMS = MECHANISMS;
  NS.RATE_LAWS = RATE_LAWS;
  NS.MAX_SPECIES = MAX_SPECIES;
  NS.MAX_REACTIONS = MAX_REACTIONS;
})(typeof globalThis !== "undefined" ? globalThis : this);
