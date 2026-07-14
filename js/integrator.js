// Dormand-Prince 5(4) adaptive-step integrator.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});

  const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
  const A = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  ];
  const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
  const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

  function add(y, scaled) {
    const out = new Array(y.length);
    for (let i = 0; i < y.length; i++) out[i] = y[i] + scaled[i];
    return out;
  }

  function integrate(f, t0, tEnd, y0, opts) {
    opts = opts || {};
    const rtol = opts.rtol !== undefined ? opts.rtol : 1e-6;
    const atol = opts.atol !== undefined ? opts.atol : 1e-9;
    const span = tEnd - t0;
    const hmax = opts.hmax !== undefined ? opts.hmax : span / 4;
    const hmin = opts.hmin !== undefined ? opts.hmin : span * 1e-12;
    const safety = 0.9;
    const n = y0.length;

    const ts = [t0];
    const ys = [y0.slice()];

    let t = t0;
    let y = y0.slice();
    let h = opts.hInit !== undefined ? opts.hInit : Math.min(hmax, span / 100);
    let k1 = f(t, y);

    let steps = 0;
    const maxSteps = opts.maxSteps || 2000000;

    while (t < tEnd) {
      if (t + h > tEnd) h = tEnd - t;
      if (++steps > maxSteps) break;

      const k = [k1];
      for (let s = 1; s < 7; s++) {
        let acc = new Array(n).fill(0);
        for (let j = 0; j < s; j++) {
          const a = A[s][j];
          if (a === 0) continue;
          for (let i = 0; i < n; i++) acc[i] += h * a * k[j][i];
        }
        k.push(f(t + C[s] * h, add(y, acc)));
      }

      const y5 = new Array(n);
      let errNorm = 0;
      for (let i = 0; i < n; i++) {
        let inc5 = 0;
        let err = 0;
        for (let s = 0; s < 7; s++) {
          inc5 += B5[s] * k[s][i];
          err += (B5[s] - B4[s]) * k[s][i];
        }
        y5[i] = y[i] + h * inc5;
        const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(y5[i]));
        const e = (h * err) / sc;
        errNorm += e * e;
      }
      errNorm = Math.sqrt(errNorm / n);

      let bad = !isFinite(errNorm);
      for (let i = 0; i < n && !bad; i++) if (!isFinite(y5[i])) bad = true;

      if (!bad && errNorm <= 1) {
        t += h;
        y = y5;
        k1 = k[6]; // FSAL: last stage is the first stage of the next step.
        ts.push(t);
        ys.push(y.slice());
      }

      let factor;
      if (bad) {
        factor = 0.2;
      } else {
        const denom = errNorm > 0 ? errNorm : 1e-10;
        factor = safety * Math.pow(denom, -0.2);
        factor = Math.min(5, Math.max(0.2, factor));
      }
      h = h * factor;
      if (h > hmax) h = hmax;
      if (h < hmin) {
        h = hmin;
        if (bad) {
          t += h;
          y = add(y, k1.map((v) => v * h));
          k1 = f(t, y);
          ts.push(t);
          ys.push(y.slice());
        }
      }
    }

    return { t: ts, y: ys };
  }

  NS.integrate = integrate;
})(typeof globalThis !== "undefined" ? globalThis : this);
