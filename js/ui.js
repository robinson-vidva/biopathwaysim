// Builds all controls, the citation, and the equations panel from the spec.
// No model-specific knowledge lives here.

export const PALETTE = [
  "#0891b2", "#1e293b", "#b45309", "#15803d",
  "#7c3aed", "#be123c", "#0369a1", "#4d7c0f",
];

export function speciesColor(i) {
  return PALETTE[i % PALETTE.length];
}

function fmt(x) {
  if (typeof x !== "number" || !isFinite(x)) return String(x);
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e4 || a < 1e-3) return x.toExponential(2);
  let s = x.toPrecision(4);
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

function resolveNum(v, params) {
  return typeof v === "string" ? params[v] : v;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// --- spec traversal helpers ----------------------------------------------

export function collectDoseModulators(model) {
  const out = [];
  model.reactions.forEach((r, ri) => {
    (r.rateLaw.modulators || []).forEach((m, mi) => {
      if (m.source && m.source.dose !== undefined) out.push({ reaction: r, ri, mod: m, mi });
    });
  });
  return out;
}

export function collectSpeciesModulators(model) {
  const out = [];
  model.reactions.forEach((r) => {
    (r.rateLaw.modulators || []).forEach((m) => {
      if (m.source && m.source.species !== undefined) out.push({ reaction: r, mod: m });
    });
  });
  return out;
}

// --- citation -------------------------------------------------------------

export function renderCitation(container, model) {
  const c = model.citation || {};
  container.innerHTML = "";
  if (c.text) container.appendChild(el("div", "cite-text", c.text));
  if (c.doi) {
    const d = el("div", "doi");
    d.innerHTML = 'doi: <a href="https://doi.org/' + c.doi + '" target="_blank" rel="noopener">' +
      c.doi + "</a>";
    container.appendChild(d);
  }
}

// --- controls -------------------------------------------------------------

const STEPS = 1000;

function sliderToValue(param, t) {
  const f = t / STEPS;
  if (param.scale === "log") return param.min * Math.pow(param.max / param.min, f);
  return param.min + (param.max - param.min) * f;
}

function valueToSlider(param, v) {
  let f;
  if (param.scale === "log") f = Math.log(v / param.min) / Math.log(param.max / param.min);
  else f = (v - param.min) / (param.max - param.min);
  return Math.round(Math.max(0, Math.min(1, f)) * STEPS);
}

function makeParamControl(param, ctx) {
  const wrap = el("div", "control");
  const top = el("div", "control-top");
  const name = el("div", "c-name");
  name.textContent = param.name || param.id;
  if (param.scale === "log") name.appendChild(el("span", "scale-tag", "log"));
  const val = el("div", "c-value");
  top.appendChild(name);
  top.appendChild(val);
  wrap.appendChild(top);

  const slider = el("input");
  slider.type = "range";
  slider.min = 0; slider.max = STEPS; slider.step = 1;
  slider.value = valueToSlider(param, ctx.params[param.id]);
  wrap.appendChild(slider);

  const paint = () => {
    val.innerHTML = fmt(ctx.params[param.id]) +
      (param.unit ? ' <span class="c-unit">' + param.unit + "</span>" : "");
  };
  paint();

  slider.addEventListener("input", () => {
    ctx.params[param.id] = sliderToValue(param, Number(slider.value));
    paint();
    ctx.run();
  });
  return wrap;
}

function makeDoseControl(entry, model, ctx) {
  const { reaction, mod } = entry;
  const doseMax = mod.source.doseMax !== undefined ? mod.source.doseMax : 1;
  const wrap = el("div", "control");
  const top = el("div", "control-top");
  const name = el("div", "c-name");
  name.textContent = mod.name || reaction.name || reaction.id;
  name.appendChild(el("span", "c-mech", " — " + mod.mechanism));
  const val = el("div", "c-value");
  top.appendChild(name);
  top.appendChild(val);
  wrap.appendChild(top);

  const slider = el("input");
  slider.type = "range";
  slider.min = 0; slider.max = doseMax; slider.step = doseMax / 200;
  slider.value = mod.source.dose;
  wrap.appendChild(slider);

  const conc = (model.units && model.units.concentration) || "";
  const paint = () => {
    val.innerHTML = fmt(mod.source.dose) + (conc ? ' <span class="c-unit">' + conc + "</span>" : "");
  };
  paint();

  slider.addEventListener("input", () => {
    mod.source.dose = Number(slider.value);
    paint();
    ctx.run();
  });
  return wrap;
}

function makeSpeciesToggle(sp, i, ctx) {
  const label = el("label", "species-toggle");
  const box = el("input");
  box.type = "checkbox";
  box.checked = !!ctx.visible[sp.id];
  const swatch = el("span", "swatch");
  swatch.style.background = speciesColor(i);
  const txt = el("span");
  txt.textContent = sp.name || sp.id;
  const idtag = el("span", "sp-id");
  idtag.textContent = sp.id;
  label.appendChild(box);
  label.appendChild(swatch);
  label.appendChild(txt);
  label.appendChild(idtag);
  box.addEventListener("change", () => {
    ctx.visible[sp.id] = box.checked;
    ctx.redraw();
  });
  return label;
}

function sectionHead(title, extra) {
  const h = el("div", "section-head");
  h.appendChild(el("h2", null, title));
  if (extra) h.appendChild(extra);
  return h;
}

export function buildControls(container, model, ctx) {
  container.innerHTML = "";

  const resetBtn = el("button", "btn-reset", "Reset");
  resetBtn.addEventListener("click", ctx.reset);
  container.appendChild(sectionHead("Parameters", resetBtn));
  for (const p of model.parameters) container.appendChild(makeParamControl(p, ctx));

  const doses = collectDoseModulators(model);
  if (doses.length) {
    container.appendChild(sectionHead("Modulators"));
    for (const d of doses) container.appendChild(makeDoseControl(d, model, ctx));
  }

  container.appendChild(sectionHead("Species on plot"));
  model.species.forEach((sp, i) => container.appendChild(makeSpeciesToggle(sp, i, ctx)));
}

// --- equations panel ------------------------------------------------------

function ratioExpr(mod, params) {
  const val = mod.source.species !== undefined
    ? '<span class="eq-species">[' + mod.source.species + "]</span>"
    : '<span class="eq-num">' + fmt(mod.source.dose) + "</span>";
  const Ki = fmt(resolveNum(mod.Ki, params));
  const n = mod.n !== undefined ? resolveNum(mod.n, params) : 1;
  const core = val + "/" + Ki;
  return n === 1 ? core : "(" + core + ")^" + fmt(n);
}

function vmaxPart(law, params) {
  if (law.enzyme !== undefined)
    return fmt(params[law.kcat]) + '&middot;<span class="eq-species">[' + law.enzyme + "]</span>";
  return fmt(params[law.Vmax]);
}

function renderRateLaw(reaction, params) {
  const law = reaction.rateLaw;
  const mods = law.modulators || [];
  const kmComp = [], kmUncomp = [], vmaxDiv = [];
  for (const m of mods) {
    const r = ratioExpr(m, params);
    if (m.mechanism === "competitive") kmComp.push(r);
    else if (m.mechanism === "noncompetitive") vmaxDiv.push(r);
    else { kmUncomp.push(r); vmaxDiv.push(r); }
  }

  const sp = (id) => '<span class="eq-species">[' + id + "]</span>";
  let base;

  if (law.type === "constant") {
    base = '<span class="eq-num">' + fmt(params[law.k]) + "</span>";
  } else if (law.type === "mass_action") {
    let s = '<span class="eq-num">' + fmt(params[law.k]) + "</span>";
    for (const sid in reaction.reactants) {
      const st = reaction.reactants[sid];
      s += "&middot;" + sp(sid) + (st !== 1 ? "^" + fmt(st) : "");
    }
    base = s;
  } else {
    const sub = Object.keys(reaction.reactants)[0];
    let kmStr;
    const applyKm = (base) => {
      let k = base;
      for (const r of kmComp) k += "&middot;(1 + " + r + ")";
      for (const r of kmUncomp) k += "/(1 + " + r + ")";
      return (kmComp.length || kmUncomp.length) ? "[" + k + "]" : k;
    };
    if (law.type === "michaelis_menten") {
      kmStr = applyKm(fmt(params[law.Km]));
      base = vmaxPart(law, params) + "&middot;" + sp(sub) + "/(" + kmStr + " + " + sp(sub) + ")";
    } else {
      const n = fmt(params[law.n]);
      kmStr = applyKm(fmt(params[law.K]));
      base = vmaxPart(law, params) + "&middot;" + sp(sub) + "^" + n +
        "/(" + kmStr + "^" + n + " + " + sp(sub) + "^" + n + ")";
    }
  }

  for (const r of vmaxDiv) base += ' <span class="eq-mod">&middot; 1/(1 + ' + r + ")</span>";
  return base;
}

function odeLine(species, model) {
  const terms = [];
  model.reactions.forEach((r) => {
    const coeff = (r.products && r.products[species.id] ? r.products[species.id] : 0) -
      (r.reactants && r.reactants[species.id] ? r.reactants[species.id] : 0);
    if (coeff === 0) return;
    const mag = Math.abs(coeff);
    const sym = (mag === 1 ? "" : fmt(mag) + "&middot;") + '<span class="eq-rxn">' + r.id + "</span>";
    terms.push({ sign: coeff < 0 ? "-" : "+", sym });
  });
  let rhs = "0";
  if (terms.length) {
    rhs = terms.map((t, i) => (i === 0 ? (t.sign === "-" ? "-" : "") : " " + t.sign + " ") + t.sym).join("");
  }
  return '<span class="lhs">d<span class="eq-species">[' + species.id + "]</span>/dt</span> = " + rhs;
}

export function renderEquations(container, model, params) {
  container.innerHTML = "";

  const odes = el("div", "eq-block");
  odes.appendChild(el("h3", null, "System of ODEs"));
  for (const s of model.species) odes.appendChild(el("div", "eq-line", odeLine(s, model)));
  container.appendChild(odes);

  const laws = el("div", "eq-block");
  laws.appendChild(el("h3", null, "Reaction rates (current values)"));
  for (const r of model.reactions) {
    const line = el("div", "eq-line",
      '<span class="eq-rxn">' + r.id + "</span> = " + renderRateLaw(r, params));
    laws.appendChild(line);
  }
  container.appendChild(laws);

  const speciesMods = collectSpeciesModulators(model);
  if (speciesMods.length) {
    const fb = el("div", "eq-block");
    fb.appendChild(el("h3", null, "Species-coupled modulators (read-only)"));
    for (const sm of speciesMods) {
      const n = sm.mod.n !== undefined ? resolveNum(sm.mod.n, params) : 1;
      const label = sm.mod.name ? sm.mod.name + ": " : "";
      fb.appendChild(el("div", "eq-line",
        label + '<span class="eq-species">[' + sm.mod.source.species + "]</span> modulates " +
        '<span class="eq-rxn">' + sm.reaction.id + "</span> (" + sm.mod.mechanism +
        ", Ki=" + fmt(resolveNum(sm.mod.Ki, params)) + ", n=" + fmt(n) + ")"));
    }
    fb.appendChild(el("div", "eq-note",
      "Coupled to a live species concentration, so it has no dose control; it is shown here to make the loop visible."));
    container.appendChild(fb);
  }
}
