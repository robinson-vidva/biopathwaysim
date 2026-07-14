// Build stoichiometry and the derivatives function from a validated model.

import { validateModel } from "./spec.js";
import { reactionRate } from "./rates.js";

export function buildModel(model) {
  validateModel(model);

  const speciesIds = model.species.map((s) => s.id);
  const idx = {};
  speciesIds.forEach((id, i) => (idx[id] = i));

  const y0 = model.species.map((s) => s.initial);

  // Stoichiometry matrix: stoich[r][i] = net change of species i per unit of reaction r.
  const stoich = model.reactions.map((r) => {
    const row = new Array(speciesIds.length).fill(0);
    for (const sid in (r.reactants || {})) row[idx[sid]] -= r.reactants[sid];
    for (const sid in (r.products || {})) row[idx[sid]] += r.products[sid];
    return row;
  });

  const defaultParams = {};
  for (const p of model.parameters) defaultParams[p.id] = p.value;
  for (const inh of model.inhibitors || [])
    defaultParams[inh.id] = inh.dose !== undefined ? inh.dose : 0;

  function derivatives(t, y, params) {
    const p = params || defaultParams;
    const n = speciesIds.length;
    const dydt = new Array(n).fill(0);
    for (let r = 0; r < model.reactions.length; r++) {
      const rate = reactionRate(model.reactions[r], y, idx, p, model);
      const row = stoich[r];
      for (let i = 0; i < n; i++) {
        if (row[i] !== 0) dydt[i] += row[i] * rate;
      }
    }
    return dydt;
  }

  return { model, speciesIds, idx, y0, stoich, defaultParams, derivatives };
}
