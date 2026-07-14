// Guided model builder. Edits a model spec in place through form controls only;
// no free-text equations. Validates through spec.js after every edit.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  function button(label, cls, onClick) {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function selectEl(options, value, onChange) {
    const s = el("select");
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.value === value) opt.selected = true;
      s.appendChild(opt);
    }
    s.addEventListener("change", () => onChange(s.value));
    return s;
  }

  function textInput(value, onInput, onCommit) {
    const i = el("input");
    i.type = "text";
    i.value = value == null ? "" : value;
    i.addEventListener("input", () => onInput(i.value));
    if (onCommit) i.addEventListener("change", () => onCommit(i.value));
    return i;
  }

  function numInput(value, onInput) {
    const i = el("input");
    i.type = "number";
    i.value = value == null ? "" : value;
    i.addEventListener("input", () => {
      const v = i.value === "" ? 0 : Number(i.value);
      onInput(isFinite(v) ? v : 0);
    });
    return i;
  }

  function checkbox(checked, onChange) {
    const i = el("input");
    i.type = "checkbox";
    i.checked = !!checked;
    i.addEventListener("change", () => onChange(i.checked));
    return i;
  }

  function field(labelText, control) {
    const f = el("label", "b-field");
    f.appendChild(el("span", "b-flabel", labelText));
    f.appendChild(control);
    return f;
  }

  function paramOptions(model) {
    return model.parameters.map((p) => ({ value: p.id, label: (p.name || p.id) + " (" + p.id + ")" }));
  }
  function speciesOptions(model) {
    return model.species.map((s) => ({ value: s.id, label: (s.name || s.id) + " (" + s.id + ")" }));
  }
  function paramSelect(model, value, onChange) {
    const opts = paramOptions(model);
    if (!opts.length) opts.push({ value: "", label: "(no parameters)" });
    return selectEl(opts, value, onChange);
  }
  function speciesSelect(model, value, onChange, allowNone) {
    const opts = speciesOptions(model);
    if (allowNone) opts.unshift({ value: "", label: "(none)" });
    if (!opts.length) opts.push({ value: "", label: "(no species)" });
    return selectEl(opts, value == null ? "" : value, onChange);
  }

  function firstParamId(model) { return model.parameters[0] ? model.parameters[0].id : ""; }
  function firstSpeciesId(model) { return model.species[0] ? model.species[0].id : ""; }
  function firstDoseId(model) {
    const d = model.parameters.find((p) => p.role === "dose");
    return d ? d.id : firstParamId(model);
  }

  function uniqueId(prefix, taken) {
    let i = 1;
    while (taken.has(prefix + i)) i++;
    return prefix + i;
  }

  // Value that may be a literal number or a parameter reference.
  function valueOrParam(model, cur, onChange, rerender) {
    const wrap = el("span", "b-vop");
    const isParam = typeof cur === "string";
    wrap.appendChild(selectEl(
      [{ value: "number", label: "number" }, { value: "parameter", label: "parameter" }],
      isParam ? "parameter" : "number",
      (mode) => { onChange(mode === "parameter" ? firstParamId(model) : 1); rerender(); }));
    if (isParam) wrap.appendChild(paramSelect(model, cur, (v) => onChange(v)));
    else wrap.appendChild(numInput(typeof cur === "number" ? cur : 0, (v) => onChange(v)));
    return wrap;
  }

  // --- the editor ----------------------------------------------------------

  function buildEditor(container, model, apply, statusEl) {
    let capText = "";

    function status() {
      const err = apply();
      if (err) {
        statusEl.textContent = err;
        statusEl.className = "builder-status invalid";
      } else {
        statusEl.textContent = "Model is valid.";
        statusEl.className = "builder-status valid";
      }
    }
    // commit(true) re-renders the form (structure changed); both refresh status.
    function commit(re) {
      if (re) { capText = ""; render(); }
      status();
    }
    function cap(msg) { capText = msg; render(); }

    function section(title, addLabel, onAdd) {
      const s = el("div", "b-section");
      const head = el("div", "b-section-head");
      head.appendChild(el("h3", null, title));
      if (onAdd) head.appendChild(button(addLabel, "b-add", onAdd));
      s.appendChild(head);
      return s;
    }

    function removeBtn(onClick) { return button("remove", "b-remove", onClick); }

    // Model meta
    function metaSection() {
      const s = section("Model");
      const grid = el("div", "b-grid");
      grid.appendChild(field("Name", textInput(model.name, (v) => { model.name = v; commit(false); })));
      grid.appendChild(field("Id", textInput(model.id, (v) => { model.id = v; }, () => commit(true))));
      const u = model.units || (model.units = { concentration: "", time: "s" });
      grid.appendChild(field("Concentration unit", textInput(u.concentration, (v) => { u.concentration = v; commit(false); })));
      grid.appendChild(field("Time unit", textInput(u.time, (v) => { u.time = v; commit(false); })));
      const sim = model.simulation || (model.simulation = { tEnd: 100, rtol: 1e-6, atol: 1e-9 });
      grid.appendChild(field("Simulation tEnd", numInput(sim.tEnd, (v) => { sim.tEnd = v; commit(false); })));
      s.appendChild(grid);
      return s;
    }

    // Species
    function speciesSection() {
      const s = section("Species (" + model.species.length + " / " + NS.MAX_SPECIES + ")",
        "+ add species", () => {
          if (model.species.length >= NS.MAX_SPECIES) return cap("Reached the maximum of " + NS.MAX_SPECIES + " species.");
          const taken = new Set(model.species.map((x) => x.id));
          model.species.push({ id: uniqueId("S", taken), name: "", initial: 0, plot: true });
          commit(true);
        });
      model.species.forEach((sp, i) => {
        const row = el("div", "b-row");
        row.appendChild(field("id", textInput(sp.id, (v) => { sp.id = v; commit(false); }, () => commit(true))));
        row.appendChild(field("name", textInput(sp.name || "", (v) => { sp.name = v; commit(false); })));
        row.appendChild(field("initial", numInput(sp.initial, (v) => { sp.initial = v; commit(false); })));
        row.appendChild(field("plot", checkbox(sp.plot, (c) => { sp.plot = c; commit(false); })));
        row.appendChild(removeBtn(() => { model.species.splice(i, 1); commit(true); }));
        s.appendChild(row);
      });
      return s;
    }

    // Parameters
    function paramsSection() {
      const s = section("Parameters", "+ add parameter", () => {
        const taken = new Set(model.parameters.map((x) => x.id));
        model.parameters.push({ id: uniqueId("p", taken), name: "", value: 1, min: 0, max: 10, scale: "linear", unit: "" });
        commit(true);
      });
      model.parameters.forEach((p, i) => {
        const row = el("div", "b-row");
        row.appendChild(field("id", textInput(p.id, (v) => { p.id = v; commit(false); }, () => commit(true))));
        row.appendChild(field("name", textInput(p.name || "", (v) => { p.name = v; commit(false); })));
        row.appendChild(field("value", numInput(p.value, (v) => { p.value = v; commit(false); })));
        row.appendChild(field("min", numInput(p.min, (v) => { p.min = v; commit(false); })));
        row.appendChild(field("max", numInput(p.max, (v) => { p.max = v; commit(false); })));
        row.appendChild(field("scale", selectEl(
          [{ value: "linear", label: "linear" }, { value: "log", label: "log" }],
          p.scale || "linear", (v) => { p.scale = v; commit(false); })));
        row.appendChild(field("unit", textInput(p.unit || "", (v) => { p.unit = v; commit(false); })));
        row.appendChild(field("role", selectEl(
          [{ value: "", label: "(none)" }, { value: "dose", label: "dose" }],
          p.role || "", (v) => { if (v) p.role = v; else delete p.role; commit(false); })));
        row.appendChild(removeBtn(() => { model.parameters.splice(i, 1); commit(true); }));
        s.appendChild(row);
      });
      return s;
    }

    // Reactant / product stoichiometry editor
    function stoichEditor(r, kind) {
      const obj = r[kind] || (r[kind] = {});
      const box = el("div", "b-stoich");
      box.appendChild(el("div", "b-sublabel", kind));
      Object.keys(obj).forEach((sid) => {
        const row = el("div", "b-stoich-row");
        row.appendChild(speciesSelect(model, sid, (v) => {
          if (v !== sid) { const val = obj[sid]; delete obj[sid]; obj[v] = val; }
          commit(true);
        }));
        row.appendChild(numInput(obj[sid], (v) => { obj[sid] = v; commit(false); }));
        row.appendChild(button("x", "b-remove-sm", () => { delete obj[sid]; commit(true); }));
        box.appendChild(row);
      });
      box.appendChild(button("+ " + kind.slice(0, -1), "b-add-sm", () => {
        const avail = model.species.map((x) => x.id).find((id) => !(id in obj));
        if (avail) { obj[avail] = 1; commit(true); }
      }));
      return box;
    }

    // Rate-law fields (depend on type)
    function rateLawEditor(r) {
      const law = r.rateLaw;
      const box = el("div", "b-ratelaw");
      box.appendChild(field("rate law", selectEl(
        NS.RATE_LAWS.map((t) => ({ value: t, label: t })), law.type, (v) => {
          setRateLawType(r, v);
          commit(true);
        })));

      const io = el("div", "b-io");
      io.appendChild(stoichEditor(r, "reactants"));
      io.appendChild(stoichEditor(r, "products"));
      box.appendChild(io);

      const pf = el("div", "b-grid");
      if (law.type === "constant" || law.type === "mass_action") {
        pf.appendChild(field("k", paramSelect(model, law.k, (v) => { law.k = v; commit(false); })));
      } else {
        pf.appendChild(field("enzyme", speciesSelect(model, law.enzyme, (v) => {
          if (v) { law.enzyme = v; if (law.Vmax !== undefined) { law.kcat = law.Vmax; delete law.Vmax; } }
          else { delete law.enzyme; if (law.kcat !== undefined) { law.Vmax = law.kcat; delete law.kcat; } }
          commit(true);
        }, true)));
        if (law.enzyme !== undefined)
          pf.appendChild(field("kcat", paramSelect(model, law.kcat, (v) => { law.kcat = v; commit(false); })));
        else
          pf.appendChild(field("Vmax", paramSelect(model, law.Vmax, (v) => { law.Vmax = v; commit(false); })));
        if (law.type === "michaelis_menten") {
          pf.appendChild(field("Km", paramSelect(model, law.Km, (v) => { law.Km = v; commit(false); })));
        } else {
          pf.appendChild(field("K", paramSelect(model, law.K, (v) => { law.K = v; commit(false); })));
          pf.appendChild(field("n", paramSelect(model, law.n, (v) => { law.n = v; commit(false); })));
        }
      }
      box.appendChild(pf);

      box.appendChild(modulatorEditor(r));
      return box;
    }

    function modulatorEditor(r) {
      const law = r.rateLaw;
      const mods = law.modulators || (law.modulators = []);
      const box = el("div", "b-mods");
      box.appendChild(el("div", "b-sublabel", "modulators"));
      mods.forEach((m, mi) => {
        const mb = el("div", "b-mod");
        const g = el("div", "b-grid");
        g.appendChild(field("id", textInput(m.id, (v) => { m.id = v; commit(false); }, () => commit(true))));
        g.appendChild(field("name", textInput(m.name || "", (v) => { m.name = v || undefined; commit(false); })));
        g.appendChild(field("mechanism", selectEl(
          NS.MECHANISMS.map((x) => ({ value: x, label: x })), m.mechanism, (v) => { m.mechanism = v; commit(false); })));
        const srcType = m.source && m.source.species !== undefined ? "species" : "parameter";
        g.appendChild(field("source", selectEl(
          [{ value: "parameter", label: "parameter (dose)" }, { value: "species", label: "species (feedback)" }],
          srcType, (v) => {
            m.source = v === "species" ? { species: firstSpeciesId(model) } : { parameter: firstDoseId(model) };
            commit(true);
          })));
        if (srcType === "species")
          g.appendChild(field("species", speciesSelect(model, m.source.species, (v) => { m.source.species = v; commit(false); })));
        else
          g.appendChild(field("parameter", paramSelect(model, m.source.parameter, (v) => { m.source.parameter = v; commit(false); })));
        g.appendChild(field("Ki", valueOrParam(model, m.Ki, (v) => { m.Ki = v; commit(false); }, () => commit(true))));
        const nWrap = el("span", "b-vop");
        nWrap.appendChild(checkbox(m.n !== undefined, (on) => { if (on) m.n = 1; else delete m.n; commit(true); }));
        if (m.n !== undefined) nWrap.appendChild(valueOrParam(model, m.n, (v) => { m.n = v; commit(false); }, () => commit(true)));
        g.appendChild(field("n", nWrap));
        mb.appendChild(g);
        mb.appendChild(button("remove modulator", "b-remove", () => { mods.splice(mi, 1); commit(true); }));
        box.appendChild(mb);
      });
      box.appendChild(button("+ add modulator", "b-add-sm", () => {
        const taken = new Set();
        for (const rr of model.reactions) for (const mm of rr.rateLaw.modulators || []) taken.add(mm.id);
        mods.push({ id: uniqueId("m", taken), name: "", mechanism: "competitive",
          source: { parameter: firstDoseId(model) }, Ki: 1 });
        commit(true);
      }));
      return box;
    }

    function reactionsSection() {
      const s = section("Reactions (" + model.reactions.length + " / " + NS.MAX_REACTIONS + ")",
        "+ add reaction", () => {
          if (model.reactions.length >= NS.MAX_REACTIONS) return cap("Reached the maximum of " + NS.MAX_REACTIONS + " reactions.");
          const taken = new Set(model.reactions.map((x) => x.id));
          model.reactions.push({ id: uniqueId("v", taken), name: "", reactants: {}, products: {},
            rateLaw: { type: "mass_action", k: firstParamId(model) } });
          commit(true);
        });
      model.reactions.forEach((r, i) => {
        const rb = el("div", "b-reaction");
        const head = el("div", "b-row");
        head.appendChild(field("id", textInput(r.id, (v) => { r.id = v; commit(false); }, () => commit(true))));
        head.appendChild(field("name", textInput(r.name || "", (v) => { r.name = v; commit(false); })));
        head.appendChild(removeBtn(() => { model.reactions.splice(i, 1); commit(true); }));
        rb.appendChild(head);
        rb.appendChild(rateLawEditor(r));
        s.appendChild(rb);
      });
      return s;
    }

    function render() {
      container.innerHTML = "";
      if (capText) container.appendChild(el("div", "b-cap", capText));
      container.appendChild(metaSection());
      container.appendChild(speciesSection());
      container.appendChild(paramsSection());
      container.appendChild(reactionsSection());
    }

    render();
    status();
  }

  // Reset a rate law to a skeleton for a new type, keeping reactants/products/modulators.
  function setRateLawType(r, type) {
    const old = r.rateLaw || {};
    const law = { type };
    if (old.modulators) law.modulators = old.modulators;
    const firstP = ""; // left blank; validation guides the user to pick
    if (type === "constant" || type === "mass_action") law.k = old.k || firstP;
    else {
      if (old.enzyme) law.enzyme = old.enzyme;
      if (law.enzyme !== undefined) law.kcat = old.kcat || old.Vmax || firstP;
      else law.Vmax = old.Vmax || old.kcat || firstP;
      if (type === "michaelis_menten") law.Km = old.Km || old.K || firstP;
      else { law.K = old.K || old.Km || firstP; law.n = old.n || firstP; }
    }
    r.rateLaw = law;
  }

  NS.buildEditor = buildEditor;
})(typeof globalThis !== "undefined" ? globalThis : this);
