// Diagram editing: mutate the spec from diagram gestures and a node side panel.
// The spec stays the single source of truth; the caller validates and re-renders.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }
  function btn(label, cls, onClick) { const b = el("button", cls, label); b.type = "button"; b.addEventListener("click", onClick); return b; }
  function selectEl(opts, value, onChange) {
    const s = el("select");
    for (const o of opts) { const op = document.createElement("option"); op.value = o.value; op.textContent = o.label; if (o.value === value) op.selected = true; s.appendChild(op); }
    s.addEventListener("change", () => onChange(s.value));
    return s;
  }
  function textInput(v, onInput, onCommit) { const i = el("input"); i.type = "text"; i.value = v == null ? "" : v; i.addEventListener("input", () => onInput(i.value)); if (onCommit) i.addEventListener("change", () => onCommit(i.value)); return i; }
  function numInput(v, onInput) { const i = el("input"); i.type = "number"; i.value = v == null ? "" : v; i.addEventListener("input", () => { const x = i.value === "" ? 0 : Number(i.value); onInput(isFinite(x) ? x : 0); }); return i; }
  function checkbox(c, onChange) { const i = el("input"); i.type = "checkbox"; i.checked = !!c; i.addEventListener("change", () => onChange(i.checked)); return i; }
  function field(label, control) { const f = el("label", "b-field"); f.appendChild(el("span", "b-flabel", label)); f.appendChild(control); return f; }

  function uniqueId(prefix, taken) { let i = 1; while (taken.has(prefix + i)) i++; return prefix + i; }
  function allModIds(model) { const s = new Set(); for (const r of model.reactions) for (const m of (r.rateLaw.modulators || [])) s.add(m.id); return s; }

  function newParam(model, opts) {
    opts = opts || {};
    const p = { id: uniqueId("p", new Set(model.parameters.map((x) => x.id))), name: "", value: 1, min: 0, max: opts.dose ? 5 : 10, scale: "linear", unit: "" };
    if (opts.dose) p.role = "dose";
    model.parameters.push(p);
    return p.id;
  }

  // A picker over parameters, with an option to create a new one inline.
  function paramPicker(model, current, onPick, opts) {
    const options = model.parameters.map((p) => ({ value: p.id, label: (p.name || p.id) }));
    options.push({ value: "__new__", label: (opts && opts.dose) ? "+ new dose parameter" : "+ new parameter" });
    if (!model.parameters.some((p) => p.id === current)) options.unshift({ value: "", label: "(choose)" });
    return selectEl(options, current || "", (v) => {
      if (v === "__new__") onPick(newParam(model, opts), true);
      else onPick(v, false);
    });
  }
  function speciesPicker(model, current, onChange, allowNone) {
    const opts = model.species.map((s) => ({ value: s.id, label: s.id }));
    if (allowNone) opts.unshift({ value: "", label: "(none)" });
    if (!opts.length) opts.push({ value: "", label: "(no species)" });
    return selectEl(opts, current == null ? "" : current, onChange);
  }

  // --- gestures ------------------------------------------------------------

  function addSpecies(model) {
    if (model.species.length >= NS.MAX_SPECIES) return { ok: false, error: "Reached the maximum of " + NS.MAX_SPECIES + " species." };
    const id = uniqueId("S", new Set(model.species.map((s) => s.id)));
    model.species.push({ id, name: "", initial: 0, plot: true });
    return { ok: true, id: "s:" + id };
  }
  function addReaction(model) {
    if (model.reactions.length >= NS.MAX_REACTIONS) return { ok: false, error: "Reached the maximum of " + NS.MAX_REACTIONS + " reactions." };
    const id = uniqueId("v", new Set(model.reactions.map((r) => r.id)));
    const k = model.parameters[0] ? model.parameters[0].id : newParam(model);
    model.reactions.push({ id, name: "", reactants: {}, products: {}, rateLaw: { type: "mass_action", k } });
    return { ok: true, id: "r:" + id };
  }

  function parseId(nodeId) {
    return { kind: nodeId.slice(0, 1), raw: nodeId.slice(2) };
  }

  // Drag src -> tgt. mode: substrate | enzyme | inhibitor.
  function connect(model, srcId, tgtId, mode) {
    const a = parseId(srcId), b = parseId(tgtId);
    const speciesNode = a.kind === "s" ? a : (b.kind === "s" ? b : null);
    const reactionNode = a.kind === "r" ? a : (b.kind === "r" ? b : null);
    if (!speciesNode || !reactionNode) return { ok: false, error: "Connect a species and a reaction." };
    const r = model.reactions.find((x) => x.id === reactionNode.raw);
    if (!r) return { ok: false, error: "Reaction not found." };
    const law = r.rateLaw || (r.rateLaw = { type: "mass_action" });

    if (mode === "substrate") {
      if (a.kind === "s" && b.kind === "r") { r.reactants = r.reactants || {}; r.reactants[a.raw] = r.reactants[a.raw] || 1; }
      else if (a.kind === "r" && b.kind === "s") { r.products = r.products || {}; r.products[b.raw] = r.products[b.raw] || 1; }
      else return { ok: false, error: "Drag species to reaction (reactant) or reaction to species (product)." };
      return { ok: true };
    }
    if (mode === "enzyme") {
      if (law.type !== "michaelis_menten" && law.type !== "hill")
        return { ok: false, error: "An enzyme applies only to a Michaelis-Menten or Hill rate law." };
      law.enzyme = speciesNode.raw;
      if (law.Vmax !== undefined && law.kcat === undefined) { law.kcat = law.Vmax; delete law.Vmax; }
      return { ok: true };
    }
    if (mode === "inhibitor") {
      law.modulators = law.modulators || [];
      law.modulators.push({ id: uniqueId("m", allModIds(model)), name: "", mechanism: "noncompetitive",
        source: { species: speciesNode.raw }, Ki: 1 });
      return { ok: true };
    }
    return { ok: false, error: "Unknown connection mode." };
  }

  function deleteNode(model, nodeId) {
    const { kind, raw } = parseId(nodeId);
    if (kind === "s") {
      model.species = model.species.filter((s) => s.id !== raw);
      for (const r of model.reactions) {
        if (r.reactants) delete r.reactants[raw];
        if (r.products) delete r.products[raw];
        const law = r.rateLaw || {};
        if (law.enzyme === raw) { delete law.enzyme; if (law.kcat !== undefined) { law.Vmax = law.kcat; delete law.kcat; } }
        if (law.modulators) law.modulators = law.modulators.filter((m) => !(m.source && m.source.species === raw));
      }
    } else if (kind === "r") {
      model.reactions = model.reactions.filter((r) => r.id !== raw);
    } else if (kind === "d") {
      for (const r of model.reactions) {
        const law = r.rateLaw || {};
        if (law.modulators) law.modulators = law.modulators.filter((m) => !(m.source && m.source.parameter === raw));
      }
    }
    if (model.layout) delete model.layout[nodeId];
    return { ok: true };
  }

  // --- node side panel -----------------------------------------------------

  function renderNodePanel(container, model, nodeId, commit, onClose) {
    container.innerHTML = "";
    const { kind, raw } = parseId(nodeId);
    const head = el("div", "de-head");
    // structural edits re-render the panel; value edits do not (keep focus).
    const rerender = () => renderNodePanel(container, model, nodeId, commit, onClose);
    const edit = (re) => { const err = commit(); if (re) rerender(); return err; };

    if (kind === "s") {
      const sp = model.species.find((s) => s.id === raw);
      if (!sp) { onClose(); return; }
      head.appendChild(el("h3", null, "Species"));
      head.appendChild(btn("close", "b-remove", onClose));
      container.appendChild(head);
      container.appendChild(field("id", textInput(sp.id, (v) => { sp.id = v; }, () => { commit(); onClose(); })));
      container.appendChild(field("name", textInput(sp.name || "", (v) => { sp.name = v; edit(false); })));
      container.appendChild(field("initial", numInput(sp.initial, (v) => { sp.initial = v; edit(false); })));
      container.appendChild(field("plot", checkbox(sp.plot, (c) => { sp.plot = c; edit(false); })));
      container.appendChild(field("gene", textInput(sp.gene || "", (v) => { sp.gene = v || undefined; edit(false); })));
      container.appendChild(field("NCBI gene id", textInput(sp.ncbiGene != null ? String(sp.ncbiGene) : "",
        (v) => { sp.ncbiGene = v || undefined; }, () => { commit(); rerender(); })));
      if (sp.ncbiGene) {
        const link = el("a", "de-ncbi", "View " + (sp.gene || sp.ncbiGene) + " on NCBI Gene");
        link.href = "https://www.ncbi.nlm.nih.gov/gene/" + encodeURIComponent(sp.ncbiGene);
        link.target = "_blank"; link.rel = "noopener";
        container.appendChild(link);
      }
      container.appendChild(btn("Delete species", "b-remove de-del", () => { deleteNode(model, nodeId); commit(); onClose(); }));
    } else if (kind === "r") {
      const r = model.reactions.find((x) => x.id === raw);
      if (!r) { onClose(); return; }
      const law = r.rateLaw || (r.rateLaw = { type: "mass_action" });
      head.appendChild(el("h3", null, "Reaction"));
      head.appendChild(btn("close", "b-remove", onClose));
      container.appendChild(head);
      container.appendChild(field("id", textInput(r.id, (v) => { r.id = v; }, () => { commit(); onClose(); })));
      container.appendChild(field("name", textInput(r.name || "", (v) => { r.name = v; edit(false); })));
      container.appendChild(field("rate law", selectEl(NS.RATE_LAWS.map((t) => ({ value: t, label: t })), law.type, (v) => { setRateLawType(r, v); edit(true); })));

      container.appendChild(stoichBlock(model, r, "reactants", edit));
      container.appendChild(stoichBlock(model, r, "products", edit));

      const pf = el("div", "de-params");
      if (law.type === "constant" || law.type === "mass_action") {
        pf.appendChild(field("k", paramPicker(model, law.k, (v) => { law.k = v; edit(true); })));
      } else {
        pf.appendChild(field("enzyme", speciesPicker(model, law.enzyme, (v) => {
          if (v) { law.enzyme = v; if (law.Vmax !== undefined) { law.kcat = law.Vmax; delete law.Vmax; } }
          else { delete law.enzyme; if (law.kcat !== undefined) { law.Vmax = law.kcat; delete law.kcat; } }
          edit(true);
        }, true)));
        if (law.enzyme !== undefined) pf.appendChild(field("kcat", paramPicker(model, law.kcat, (v) => { law.kcat = v; edit(true); })));
        else pf.appendChild(field("Vmax", paramPicker(model, law.Vmax, (v) => { law.Vmax = v; edit(true); })));
        if (law.type === "michaelis_menten") pf.appendChild(field("Km", paramPicker(model, law.Km, (v) => { law.Km = v; edit(true); })));
        else { pf.appendChild(field("K", paramPicker(model, law.K, (v) => { law.K = v; edit(true); }))); pf.appendChild(field("n", paramPicker(model, law.n, (v) => { law.n = v; edit(true); }))); }
      }
      container.appendChild(pf);
      container.appendChild(modulatorBlock(model, r, edit));
      container.appendChild(btn("Delete reaction", "b-remove de-del", () => { deleteNode(model, nodeId); commit(); onClose(); }));
    } else {
      const par = model.parameters.find((p) => p.id === raw);
      head.appendChild(el("h3", null, "Drug (dose)"));
      head.appendChild(btn("close", "b-remove", onClose));
      container.appendChild(head);
      if (par) {
        container.appendChild(field("name", textInput(par.name || "", (v) => { par.name = v; edit(false); })));
        container.appendChild(field("value", numInput(par.value, (v) => { par.value = v; edit(false); })));
        container.appendChild(field("max", numInput(par.max, (v) => { par.max = v; edit(false); })));
      }
      container.appendChild(btn("Remove doses using this drug", "b-remove de-del", () => { deleteNode(model, nodeId); commit(); onClose(); }));
    }
  }

  function stoichBlock(model, r, kind, edit) {
    const obj = r[kind] || (r[kind] = {});
    const box = el("div", "de-stoich");
    box.appendChild(el("div", "b-sublabel", kind));
    Object.keys(obj).forEach((sid) => {
      const row = el("div", "b-stoich-row");
      row.appendChild(speciesPicker(model, sid, (v) => { if (v !== sid) { const val = obj[sid]; delete obj[sid]; obj[v] = val; } edit(true); }));
      row.appendChild(numInput(obj[sid], (v) => { obj[sid] = v; edit(false); }));
      row.appendChild(btn("x", "b-remove-sm", () => { delete obj[sid]; edit(true); }));
      box.appendChild(row);
    });
    box.appendChild(btn("+ " + kind.slice(0, -1), "b-add-sm", () => {
      const avail = model.species.map((s) => s.id).find((id) => !(id in obj));
      if (avail) { obj[avail] = 1; edit(true); }
    }));
    return box;
  }

  function modulatorBlock(model, r, edit) {
    const law = r.rateLaw;
    const mods = law.modulators || (law.modulators = []);
    const box = el("div", "de-mods");
    box.appendChild(el("div", "b-sublabel", "modulators"));
    mods.forEach((m, mi) => {
      const mb = el("div", "b-mod");
      mb.appendChild(field("mechanism", selectEl(NS.MECHANISMS.map((x) => ({ value: x, label: x })), m.mechanism, (v) => { m.mechanism = v; edit(false); })));
      const srcType = m.source && m.source.species !== undefined ? "species" : "parameter";
      mb.appendChild(field("source", selectEl([{ value: "parameter", label: "parameter (dose)" }, { value: "species", label: "species (feedback)" }], srcType, (v) => {
        m.source = v === "species" ? { species: model.species[0] ? model.species[0].id : "" } : { parameter: "" };
        edit(true);
      })));
      if (srcType === "species") mb.appendChild(field("species", speciesPicker(model, m.source.species, (v) => { m.source.species = v; edit(false); })));
      else mb.appendChild(field("parameter", paramPicker(model, m.source.parameter, (v) => { m.source.parameter = v; edit(true); }, { dose: true })));
      mb.appendChild(field("Ki", numInput(typeof m.Ki === "number" ? m.Ki : 1, (v) => { m.Ki = v; edit(false); })));
      mb.appendChild(btn("remove", "b-remove-sm", () => { mods.splice(mi, 1); edit(true); }));
      box.appendChild(mb);
    });
    box.appendChild(btn("+ modulator", "b-add-sm", () => {
      mods.push({ id: uniqueId("m", allModIds(model)), name: "", mechanism: "competitive", source: { parameter: "" }, Ki: 1 });
      edit(true);
    }));
    return box;
  }

  function setRateLawType(r, type) {
    const old = r.rateLaw || {};
    const law = { type };
    if (old.modulators) law.modulators = old.modulators;
    if (type === "constant" || type === "mass_action") law.k = old.k || "";
    else {
      if (old.enzyme) law.enzyme = old.enzyme;
      if (law.enzyme !== undefined) law.kcat = old.kcat || old.Vmax || "";
      else law.Vmax = old.Vmax || old.kcat || "";
      if (type === "michaelis_menten") law.Km = old.Km || old.K || "";
      else { law.K = old.K || old.Km || ""; law.n = old.n || ""; }
    }
    r.rateLaw = law;
  }

  NS.diagramAddSpecies = addSpecies;
  NS.diagramAddReaction = addReaction;
  NS.diagramConnect = connect;
  NS.diagramDelete = deleteNode;
  NS.renderNodePanel = renderNodePanel;
})(typeof globalThis !== "undefined" ? globalThis : this);
