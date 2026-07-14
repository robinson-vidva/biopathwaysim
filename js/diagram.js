// Bipartite pathway diagram (Cytoscape.js). Species are round nodes, reactions
// are square nodes, drug doses are hexagon nodes; a reaction is never an edge.
// This module is a view over the spec; it holds no model state of its own.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  const STYLE = [
    { selector: 'node[kind="species"]', style: {
        "shape": "ellipse", "label": "data(label)", "width": 40, "height": 40,
        "background-color": "#0891b2", "background-opacity": "mapData(level, 0, 1, 0.12, 1)",
        "border-width": 1.5, "border-color": "#0e7490",
        "font-family": "JetBrains Mono, monospace", "font-size": 10, "color": "#0f172a",
        "text-valign": "center", "text-halign": "center", "text-max-width": 46, "text-wrap": "wrap" } },
    { selector: 'node[kind="reaction"]', style: {
        "shape": "round-rectangle", "label": "data(label)", "width": 20, "height": 20,
        "background-color": "#475569", "border-width": 1, "border-color": "#1e293b",
        "font-family": "JetBrains Mono, monospace", "font-size": 9, "color": "#475569",
        "text-valign": "bottom", "text-halign": "center", "text-margin-y": 2 } },
    { selector: 'node[kind="drug"]', style: {
        "shape": "hexagon", "label": "data(label)", "width": 34, "height": 28,
        "background-color": "#b45309", "background-opacity": "mapData(level, 0, 1, 0.35, 1)",
        "border-width": 1, "border-color": "#7c2d12",
        "font-family": "DM Sans, sans-serif", "font-size": 9, "color": "#7c2d12",
        "text-valign": "center", "text-halign": "center", "text-max-width": 44, "text-wrap": "wrap" } },
    { selector: "edge", style: {
        "curve-style": "bezier", "width": "mapData(flux, 0, 1, 1.2, 6)",
        "line-color": "#94a3b8", "target-arrow-color": "#94a3b8", "arrow-scale": 0.9 } },
    { selector: "edge.reactant", style: {
        "line-color": "#64748b", "target-arrow-color": "#64748b",
        "target-arrow-shape": "triangle", "line-style": "solid" } },
    { selector: "edge.product", style: {
        "line-color": "#64748b", "target-arrow-color": "#64748b",
        "target-arrow-shape": "triangle", "line-style": "solid" } },
    { selector: "edge.enzyme", style: {
        "line-color": "#15803d", "target-arrow-color": "#15803d",
        "target-arrow-shape": "triangle", "target-arrow-fill": "hollow", "line-style": "dashed" } },
    { selector: "edge.mod", style: {
        "line-color": "#be123c", "target-arrow-color": "#be123c",
        "target-arrow-shape": "tee", "line-style": "dashed", "width": "mapData(flux, 0, 1, 1.6, 4)" } },
    { selector: "node.hi", style: { "border-width": 3, "border-color": "#0891b2" } },
    { selector: "node:selected", style: { "border-width": 3, "border-color": "#0891b2" } },
    { selector: ".dim", style: { "opacity": 0.25 } },
  ];

  function buildElements(model) {
    const nodes = [];
    const edges = [];
    const drugs = new Set();

    for (const s of model.species)
      nodes.push({ data: { id: "s:" + s.id, kind: "species", label: s.id, level: 0 } });
    for (const r of model.reactions)
      nodes.push({ data: { id: "r:" + r.id, kind: "reaction", label: r.id, level: 0 } });

    for (const r of model.reactions) {
      const rid = "r:" + r.id;
      for (const sid in (r.reactants || {}))
        edges.push({ data: { id: "e:rc:" + r.id + ":" + sid, source: "s:" + sid, target: rid, rxn: r.id, flux: 0 }, classes: "reactant" });
      for (const sid in (r.products || {}))
        edges.push({ data: { id: "e:pr:" + r.id + ":" + sid, source: rid, target: "s:" + sid, rxn: r.id, flux: 0 }, classes: "product" });
      const law = r.rateLaw || {};
      if (law.enzyme !== undefined && model.species.some((s) => s.id === law.enzyme))
        edges.push({ data: { id: "e:en:" + r.id, source: "s:" + law.enzyme, target: rid, rxn: r.id, flux: 0 }, classes: "enzyme" });
      for (const m of (law.modulators || [])) {
        if (m.source && m.source.species !== undefined && model.species.some((s) => s.id === m.source.species)) {
          edges.push({ data: { id: "e:ms:" + r.id + ":" + m.id, source: "s:" + m.source.species, target: rid, rxn: r.id, flux: 0 }, classes: "mod" });
        } else if (m.source && m.source.parameter !== undefined) {
          const pid = m.source.parameter, dnode = "d:" + pid;
          if (!drugs.has(pid)) {
            drugs.add(pid);
            const par = model.parameters.find((p) => p.id === pid);
            nodes.push({ data: { id: dnode, kind: "drug", label: (par && par.name) || pid, level: 0 } });
          }
          edges.push({ data: { id: "e:mp:" + r.id + ":" + m.id, source: dnode, target: rid, rxn: r.id, flux: 0 }, classes: "mod" });
        }
      }
    }
    return nodes.concat(edges);
  }

  // Dagre gives a clean layered layout for a cascade; fall back to the built-in
  // breadthfirst if the plugin is unavailable.
  function autoLayout(cy) {
    const dagre = { name: "dagre", rankDir: "TB", nodeSep: 26, rankSep: 46, edgeSep: 8, padding: 18, animate: false };
    const bf = { name: "breadthfirst", directed: true, spacingFactor: 1.15, padding: 18, avoidOverlap: true };
    try { cy.layout(dagre).run(); } catch (e) { cy.layout(bf).run(); }
  }

  function createDiagram(container) {
    if (!root.cytoscape) return null;
    const cy = root.cytoscape({
      container,
      style: STYLE,
      elements: [],
      minZoom: 0.2, maxZoom: 2.5,
      boxSelectionEnabled: false,
    });

    // opts.preserve keeps the current on-screen positions across a re-render
    // (used while editing); otherwise it lays out or restores from `positions`.
    function render(model, positions, opts) {
      opts = opts || {};
      const prev = {};
      if (opts.preserve) cy.nodes().forEach((n) => { prev[n.id()] = n.position(); });
      cy.elements().remove();
      cy.add(buildElements(model));
      const nodes = cy.nodes();
      const src = opts.preserve ? Object.assign({}, positions || {}, prev) : (positions || {});
      const unpos = [];
      nodes.forEach((n) => {
        const p = src[n.id()];
        if (p && isFinite(p.x) && isFinite(p.y)) n.position({ x: p.x, y: p.y });
        else unpos.push(n);
      });
      if (nodes.length > 0 && unpos.length === nodes.length) {
        autoLayout(cy);
      } else if (unpos.length > 0) {
        const ext = cy.extent();
        const bx = (ext.x1 + ext.x2) / 2, by = (ext.y1 + ext.y2) / 2;
        unpos.forEach((n, k) => n.position({ x: bx + (k % 3) * 70, y: by + Math.floor(k / 3) * 70 }));
      }
      cy.resize();
      if (!opts.preserve && nodes.length > 0) cy.fit(undefined, 28);
    }

    function onTap(handlers) {
      cy.off("tap");
      cy.on("tap", "node", (evt) => {
        const d = evt.target.data();
        if (!handlers) return;
        if (handlers.onNode) handlers.onNode(evt.target.id(), d.kind, d.label);
      });
      cy.on("tap", (evt) => { if (evt.target === cy && handlers && handlers.onBackground) handlers.onBackground(); });
    }

    function computeNorms(model, sys, sol, params) {
      const spMax = {}, flMax = {};
      for (const s of model.species) spMax[s.id] = 1e-12;
      for (const r of model.reactions) flMax[r.id] = 1e-12;
      for (let i = 0; i < sol.t.length; i++) {
        const y = sol.y[i];
        for (const s of model.species) { const v = y[sys.idx[s.id]]; if (v > spMax[s.id]) spMax[s.id] = v; }
        for (const r of model.reactions) {
          const rate = Math.abs(NS.reactionRate(r, y, sys.idx, params));
          if (rate > flMax[r.id]) flMax[r.id] = rate;
        }
      }
      return { spMax, flMax };
    }

    function frame(model, sys, y, params, norms) {
      cy.batch(() => {
        for (const s of model.species) {
          const m = norms.spMax[s.id] || 1e-12;
          const lvl = Math.min(1, Math.max(0, y[sys.idx[s.id]] / m));
          const n = cy.getElementById("s:" + s.id);
          if (n.nonempty()) n.data("level", lvl);
        }
        for (const p of model.parameters) {
          if (p.role !== "dose") continue;
          const dn = cy.getElementById("d:" + p.id);
          if (dn.nonempty()) {
            const lvl = p.max > 0 ? Math.min(1, Math.max(0, (params[p.id] || 0) / p.max)) : 0;
            dn.data("level", lvl);
          }
        }
        for (const r of model.reactions) {
          const rate = Math.abs(NS.reactionRate(r, y, sys.idx, params));
          const m = norms.flMax[r.id] || 1e-12;
          const f = Math.min(1, Math.max(0, rate / m));
          cy.edges('[rxn = "' + r.id + '"]').data("flux", f);
        }
      });
    }

    function highlight(kind, id) {
      cy.nodes().removeClass("hi");
      const n = cy.getElementById((kind === "species" ? "s:" : "r:") + id);
      if (n.nonempty()) n.addClass("hi");
    }
    function clearHighlight() { cy.nodes().removeClass("hi"); }

    function positions() {
      const o = {};
      cy.nodes().forEach((n) => {
        const p = n.position();
        o[n.id()] = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
      });
      return o;
    }

    function relayout() {
      autoLayout(cy);
      cy.fit(undefined, 28);
    }
    function fit() { cy.resize(); cy.fit(undefined, 28); }

    // Connect mode: nodes are not grabbable and panning is off, so a drag is
    // read as a connection rather than a move.
    function setConnectMode(on) { cy.autoungrabify(!!on); cy.userPanningEnabled(!on); }
    function onConnect(handlers) {
      cy.on("tapstart", "node", (evt) => { if (handlers.start) handlers.start(evt.target.id()); });
      cy.on("tapend", "node", (evt) => { if (handlers.end) handlers.end(evt.target.id()); });
    }

    return { cy, render, onTap, onConnect, setConnectMode, frame, computeNorms, highlight, clearHighlight, positions, relayout, fit };
  }

  NS.createDiagram = createDiagram;
})(typeof globalThis !== "undefined" ? globalThis : this);
