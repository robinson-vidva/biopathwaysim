// Build stoichiometry and the derivatives function from a validated model.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  function buildModel(model) {
    NS.validateModel(model);

    const speciesIds = model.species.map((s) => s.id);
    const idx = {};
    speciesIds.forEach((id, i) => (idx[id] = i));

    const y0 = model.species.map((s) => s.initial);

    // stoich[r][i] = net change of species i per unit of reaction r.
    const stoich = model.reactions.map((r) => {
      const row = new Array(speciesIds.length).fill(0);
      for (const sid in (r.reactants || {})) row[idx[sid]] -= r.reactants[sid];
      for (const sid in (r.products || {})) row[idx[sid]] += r.products[sid];
      return row;
    });

    const defaultParams = {};
    for (const p of model.parameters) defaultParams[p.id] = p.value;

    function derivatives(t, y, params) {
      const p = params || defaultParams;
      const n = speciesIds.length;
      const dydt = new Array(n).fill(0);
      for (let r = 0; r < model.reactions.length; r++) {
        const rate = NS.reactionRate(model.reactions[r], y, idx, p);
        const row = stoich[r];
        for (let i = 0; i < n; i++) {
          if (row[i] !== 0) dydt[i] += row[i] * rate;
        }
      }
      return dydt;
    }

    return { model, speciesIds, idx, y0, stoich, defaultParams, derivatives };
  }

  NS.buildModel = buildModel;
})(typeof globalThis !== "undefined" ? globalThis : this);
