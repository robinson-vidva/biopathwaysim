// Generic parameter sweep. Overrides one parameter across values, integrates
// each to steady state (or a time-averaged fallback), and returns readouts.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  function maxAbs(a) {
    let m = 0;
    for (const v of a) { const x = Math.abs(v); if (x > m) m = x; }
    return m;
  }

  // Trapezoidal time-average over the tail; adaptive steps are not uniform.
  function tailMean(sol, si, tStart) {
    let area = 0, span = 0;
    for (let i = 1; i < sol.t.length; i++) {
      const t0 = sol.t[i - 1], t1 = sol.t[i];
      if (t1 <= tStart) continue;
      const a = Math.max(t0, tStart);
      const dt = t1 - a;
      if (dt <= 0) continue;
      const v0 = t0 >= tStart ? sol.y[i - 1][si]
        : sol.y[i - 1][si] + (sol.y[i][si] - sol.y[i - 1][si]) * (a - t0) / (t1 - t0);
      area += 0.5 * (v0 + sol.y[i][si]) * dt;
      span += dt;
    }
    return span > 0 ? area / span : sol.y[sol.y.length - 1][si];
  }

  function tailStats(sol, si, tStart) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < sol.t.length; i++) {
      if (sol.t[i] < tStart) continue;
      const v = sol.y[i][si];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return { min: lo, max: hi };
  }

  // Mean over whole oscillation cycles (peak to peak), so the value does not
  // depend on where the averaging window happens to be truncated.
  function cycleMean(sol, si, tStart) {
    const T = [], Y = [];
    for (let i = 0; i < sol.t.length; i++) {
      if (sol.t[i] >= tStart) { T.push(sol.t[i]); Y.push(sol.y[i][si]); }
    }
    if (T.length < 5) return tailMean(sol, si, tStart);
    let lo = Infinity, hi = -Infinity;
    for (const v of Y) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const mid = (lo + hi) / 2, band = 0.05 * (hi - lo);
    const peaks = [];
    for (let i = 1; i < Y.length - 1; i++) {
      if (Y[i] > Y[i - 1] && Y[i] >= Y[i + 1] && Y[i] > mid + band) peaks.push(i);
    }
    if (peaks.length < 2) return tailMean(sol, si, tStart);
    const a = peaks[0], b = peaks[peaks.length - 1];
    let area = 0, span = 0;
    for (let i = a + 1; i <= b; i++) {
      const dt = T[i] - T[i - 1];
      area += 0.5 * (Y[i] + Y[i - 1]) * dt;
      span += dt;
    }
    return span > 0 ? area / span : tailMean(sol, si, tStart);
  }

  function sweep(model, paramId, values, options) {
    options = options || {};
    const sys = NS.buildModel(model);
    const readSpecies = options.speciesId != null ? options.speciesId : model.species[0].id;
    const si = sys.idx[readSpecies];
    const sim = model.simulation || {};
    const baseT = options.tEnd || sim.tEnd || 100;
    const rtol = sim.rtol || 1e-6;
    const atol = sim.atol || 1e-9;
    const hmax = baseT / 300;
    const maxT = options.maxTime || baseT * 2;      // hard cap on integration time
    const tailFrac = options.tailFraction || 0.5;
    const settleTol = options.settleTol || 1e-3;    // relative tail amplitude
    const base = Object.assign({}, sys.defaultParams, options.params || {});

    const points = values.map((v) => {
      const params = Object.assign({}, base);
      params[paramId] = v;
      const f = (t, y) => sys.derivatives(t, y, params);

      let tEnd = baseT;
      let sol, tStart, st, settled;
      while (true) {
        sol = NS.integrate(f, 0, tEnd, sys.y0, { rtol, atol, hmax });
        tStart = tEnd * (1 - tailFrac);
        st = tailStats(sol, si, tStart);
        const scale = Math.max(1, Math.abs(st.max));
        settled = (st.max - st.min) < settleTol * scale;
        if (settled || tEnd >= maxT) break;
        tEnd = Math.min(tEnd * 2, maxT);
      }

      const last = sol.y[sol.y.length - 1][si];
      const mean = settled ? tailMean(sol, si, tStart) : cycleMean(sol, si, tStart);
      return {
        x: v,
        oscillatory: !settled,
        settled,
        tEnd,
        final: last,
        mean,
        min: st.min,
        max: st.max,
        amplitude: st.max - st.min,
      };
    });

    return { paramId, speciesId: readSpecies, points };
  }

  NS.sweep = sweep;
})(typeof globalThis !== "undefined" ? globalThis : this);
