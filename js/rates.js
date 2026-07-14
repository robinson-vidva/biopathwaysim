// Rate law evaluation with unified modulator wrapping.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  function conc(y, idx, id) {
    const v = y[idx[id]];
    return v > 0 ? v : 0;
  }

  function resolve(x, params) {
    return typeof x === "string" ? params[x] : x;
  }

  // Each modulator reads a value from a live species concentration or a
  // parameter (a dose), then adjusts Vmax and/or Km per its mechanism.
  function modulatorFactors(law, y, idx, params) {
    let vmaxFactor = 1;
    let kmFactor = 1;
    const mods = law.modulators;
    if (!mods) return { vmaxFactor, kmFactor };
    for (const m of mods) {
      const val = m.source.species !== undefined
        ? conc(y, idx, m.source.species)
        : params[m.source.parameter];
      const Ki = resolve(m.Ki, params);
      if (!(val > 0) || !(Ki > 0)) continue;
      const n = m.n !== undefined ? resolve(m.n, params) : 1;
      const ratio = Math.pow(val / Ki, n);
      if (m.mechanism === "competitive") {
        kmFactor *= 1 + ratio;
      } else if (m.mechanism === "noncompetitive") {
        vmaxFactor /= 1 + ratio;
      } else {
        kmFactor /= 1 + ratio;
        vmaxFactor /= 1 + ratio;
      }
    }
    return { vmaxFactor, kmFactor };
  }

  function reactionRate(reaction, y, idx, params) {
    const law = reaction.rateLaw;
    const mod = modulatorFactors(law, y, idx, params);

    if (law.type === "constant") {
      return params[law.k] * mod.vmaxFactor;
    }
    if (law.type === "mass_action") {
      let r = params[law.k];
      for (const sid in reaction.reactants) {
        r *= Math.pow(conc(y, idx, sid), reaction.reactants[sid]);
      }
      return r * mod.vmaxFactor;
    }

    const subId = Object.keys(reaction.reactants)[0];
    const s = conc(y, idx, subId);
    let vmax = law.enzyme !== undefined
      ? params[law.kcat] * conc(y, idx, law.enzyme)
      : params[law.Vmax];
    vmax *= mod.vmaxFactor;
    if (law.type === "michaelis_menten") {
      const km = params[law.Km] * mod.kmFactor;
      return (vmax * s) / (km + s);
    }
    const n = params[law.n];
    const k = params[law.K] * mod.kmFactor;
    const sn = Math.pow(s, n);
    return (vmax * sn) / (Math.pow(k, n) + sn);
  }

  NS.reactionRate = reactionRate;
})(typeof globalThis !== "undefined" ? globalThis : this);
