// Model spec v1.0 validation.

const SCHEMA_VERSION = "1.0";
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

function validateRateLaw(law, rxnId, species, params, reactants) {
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

  if (law.feedback !== undefined) {
    const fb = law.feedback;
    if (!fb || typeof fb !== "object") fail(rxnId + ".feedback must be an object");
    checkSpeciesRef(fb.species, species, rxnId + ".feedback.species");
    checkParamRef(fb.Ki, params, rxnId + ".feedback.Ki");
    checkParamRef(fb.n, params, rxnId + ".feedback.n");
  }
}

export function validateModel(model) {
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
    params.set(id, p);
  });

  const reactionIds = new Set();
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
    validateRateLaw(r.rateLaw, id, species, params, Object.keys(reactants));
  });

  const inhibitors = model.inhibitors || [];
  if (!Array.isArray(inhibitors)) fail("inhibitors must be an array");
  const inhibitorIds = new Set();
  inhibitors.forEach((inh, i) => {
    const id = requireId(inh, "inhibitors", i);
    if (inhibitorIds.has(id)) fail("duplicate inhibitor id '" + id + "'");
    if (params.has(id)) fail("inhibitor id '" + id + "' collides with a parameter id");
    inhibitorIds.add(id);
    if (!reactionIds.has(inh.target))
      fail("inhibitor '" + id + "' targets unknown reaction '" + inh.target + "'");
    if (!MECHANISMS.includes(inh.mechanism))
      fail("inhibitor '" + id + "' has unknown mechanism '" + inh.mechanism + "'");
    if (!isNumber(inh.Ki) || inh.Ki <= 0) fail("inhibitor '" + id + "' Ki must be positive");
    if (inh.dose !== undefined && !isNumber(inh.dose)) fail("inhibitor '" + id + "' dose must be a number");
    if (inh.doseMax !== undefined && !isNumber(inh.doseMax)) fail("inhibitor '" + id + "' doseMax must be a number");
  });

  const sim = model.simulation || {};
  if (sim.tEnd !== undefined && (!isNumber(sim.tEnd) || sim.tEnd <= 0))
    fail("simulation.tEnd must be positive");

  return model;
}

export { MAX_SPECIES, MAX_REACTIONS, RATE_LAWS, MECHANISMS };
