// Rate law evaluation and inhibitor wrapping.

function conc(y, idx, id) {
  const v = y[idx[id]];
  return v > 0 ? v : 0;
}

// Aggregate inhibitor effects on a reaction as multiplicative factors on Vmax and Km.
function inhibitorFactors(reaction, model, params) {
  let vmaxFactor = 1;
  let kmFactor = 1;
  const inhibitors = model.inhibitors || [];
  for (const inh of inhibitors) {
    if (inh.target !== reaction.id) continue;
    const dose = params[inh.id];
    const D = dose > 0 ? dose : 0;
    if (D === 0) continue;
    const ratio = D / inh.Ki;
    if (inh.mechanism === "competitive") {
      kmFactor *= 1 + ratio;
    } else if (inh.mechanism === "noncompetitive") {
      vmaxFactor /= 1 + ratio;
    } else if (inh.mechanism === "uncompetitive") {
      kmFactor /= 1 + ratio;
      vmaxFactor /= 1 + ratio;
    }
  }
  return { vmaxFactor, kmFactor };
}

function feedbackFactor(law, y, idx, params) {
  if (!law.feedback) return 1;
  const fb = law.feedback;
  const s = conc(y, idx, fb.species);
  const Ki = params[fb.Ki];
  const n = params[fb.n];
  return 1 / (1 + Math.pow(s / Ki, n));
}

// Evaluate a single reaction rate given state y, species index idx, params, and model.
export function reactionRate(reaction, y, idx, params, model) {
  const law = reaction.rateLaw;
  const inh = inhibitorFactors(reaction, model, params);
  let rate;

  if (law.type === "constant") {
    rate = params[law.k] * inh.vmaxFactor;
  } else if (law.type === "mass_action") {
    let r = params[law.k];
    for (const sid in reaction.reactants) {
      r *= Math.pow(conc(y, idx, sid), reaction.reactants[sid]);
    }
    rate = r * inh.vmaxFactor;
  } else {
    const subId = Object.keys(reaction.reactants)[0];
    const s = conc(y, idx, subId);
    let vmax = law.enzyme !== undefined
      ? params[law.kcat] * conc(y, idx, law.enzyme)
      : params[law.Vmax];
    vmax *= inh.vmaxFactor;
    if (law.type === "michaelis_menten") {
      const km = params[law.Km] * inh.kmFactor;
      rate = (vmax * s) / (km + s);
    } else {
      const n = params[law.n];
      const k = params[law.K] * inh.kmFactor;
      const sn = Math.pow(s, n);
      rate = (vmax * sn) / (Math.pow(k, n) + sn);
    }
  }

  return rate * feedbackFactor(law, y, idx, params);
}
