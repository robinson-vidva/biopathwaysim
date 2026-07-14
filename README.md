# BioPathwaySim

BioPathwaySim is a browser-based educational simulator for small cell-signaling
models. It integrates a model's ordinary differential equations, plots the time
course of each species, computes dose-response curves by parameter sweep, and
renders the assembled equations so the mapping from network to mathematics is
visible. Models can be edited or built from scratch through a guided form and
saved as plain JSON. It runs entirely in the browser with no server, no build
step, and no dependencies.

## Running

Open `index.html` in a web browser. No server, build step, or installation is
required; the file may be opened directly from disk.

The engine is also usable from Node. The validation gate is run with
`node test/validate.js`.

## Interface

The pathway diagram is the primary view. Species are drawn as round nodes,
reactions as square nodes, and drug doses as hexagon nodes; a reaction is never
an edge, so a reaction with several reactants, products, an enzyme, and
modulators is represented faithfully. During a simulation, node fill intensity
tracks the current concentration and edge width tracks the current reaction
flux, so a cascade can be watched oscillating through the diagram. Clicking a
species or reaction node highlights its line in the equations panel. The right
pane is tabbed (Controls, Equations, Build) and the plots below are tabbed
(Time course, Dose-response).

## Vendored dependencies

The pathway diagram uses [Cytoscape.js](https://js.cytoscape.org/), pinned to
version **3.31.4**, vendored as a single UMD file at `vendor/cytoscape.min.js`
and loaded with a plain `<script>` tag. It is checked in rather than loaded from
a CDN so the tool keeps working offline and when opened directly from disk. No
other third-party code is used.

## Bundled models

Two previously published models are included as starting points. Both are
editable.

- **MAPK/ERK cascade with negative feedback.** A three-tier kinase cascade in
  which doubly phosphorylated MAPK inhibits the top-level activation step. At
  the default parameters the active-ERK concentration sustains oscillations.
  Kholodenko BN. Negative feedback and ultrasensitivity can bring about
  oscillations in the mitogen-activated protein kinase cascades. Eur J Biochem
  2000;267:1583-1588. doi:10.1046/j.1432-1327.2000.01197.x

- **Zero-order ultrasensitivity switch.** A single covalent-modification cycle
  (a kinase and an opposing phosphatase acting on one substrate). When both
  enzymes operate near saturation (low Km) the steady-state response to the
  signal is ultrasensitive, with an effective Hill coefficient near 26; in the
  first-order regime (high Km) it approaches 1.3.
  Goldbeter A, Koshland DE. An amplified sensitivity arising from covalent
  modification in biological systems. Proc Natl Acad Sci USA 1981;78:6840-6844.
  doi:10.1073/pnas.78.11.6840

## Model specification (v1.3)

A model is a single JSON object. Model files are pure data and contain no code.
The overall shape is:

```json
{
  "schemaVersion": "1.3",
  "id": "example",
  "name": "Example model",
  "citation": { "text": "Author. Title. Journal Year;Vol:Pages.", "doi": "10.xxxx/xxxxx" },
  "units": { "concentration": "uM", "time": "s" },
  "species":    [ ... ],
  "parameters": [ ... ],
  "reactions":  [ ... ],
  "simulation": { "tEnd": 100, "rtol": 1e-6, "atol": 1e-9 },
  "layout": { "s:A": { "x": 0, "y": 0 }, "r:v1": { "x": 60, "y": 40 } }
}
```

`schemaVersion` must be exactly `"1.3"`. `citation` is optional. `units` values
are labels used on the axes and are not interpreted numerically.

`layout` is optional and holds saved diagram node positions keyed by node id
(`s:` prefix for a species, `r:` for a reaction, `d:` for a drug/dose node). It
is purely presentational: the engine, and any future reader, must ignore it, as
it has no effect on the numerics.

### Species

```json
{ "id": "A", "name": "Substrate", "initial": 1.0, "plot": true }
```

`id` is a unique identifier referenced elsewhere. `initial` is the starting
concentration. `plot` sets whether the species is shown on the time course by
default. A model may define at most **20 species**.

### Parameters

```json
{ "id": "Vf", "name": "Forward Vmax", "value": 1.0, "min": 0.0, "max": 5.0,
  "scale": "linear", "unit": "uM/s", "role": "dose" }
```

Every tunable number is a parameter, including drug doses. `min` and `max` bound
the slider; `scale` is `"linear"` or `"log"`. `role` is optional; a parameter
with `"role": "dose"` is grouped as a modulator control and defaults to a
log-with-zero dose-response sweep.

### Reactions

```json
{
  "id": "r1", "name": "A to B",
  "reactants": { "A": 1 },
  "products":  { "B": 1 },
  "rateLaw": { ... }
}
```

`reactants` and `products` map a species id to its stoichiometric coefficient.
The net change of a species per reaction is (sum of product coefficients) minus
(sum of reactant coefficients); the derivative of each species is the sum over
all reactions of its net coefficient times the reaction rate. A model may define
at most **25 reactions**.

### Rate laws

The `rateLaw` object has a `type` and holds **parameter ids** in its fields, not
literal numbers. Four types are supported. For `michaelis_menten` and `hill`,
the single reactant is the substrate `[S]`.

- `constant` — rate = `k`
  ```json
  { "type": "constant", "k": "k0" }
  ```
- `mass_action` — rate = `k` times the product over reactants of `[S]^stoich`
  ```json
  { "type": "mass_action", "k": "kf" }
  ```
- `michaelis_menten` — rate = `Vmax*[S] / (Km + [S])`
  ```json
  { "type": "michaelis_menten", "Vmax": "Vf", "Km": "Km" }
  ```
  With an optional `enzyme` (a species id), `Vmax` is replaced by `kcat*[E]`:
  ```json
  { "type": "michaelis_menten", "kcat": "kcat", "Km": "Km", "enzyme": "E" }
  ```
- `hill` — rate = `Vmax*[S]^n / (K^n + [S]^n)`, with the same optional `enzyme`
  ```json
  { "type": "hill", "Vmax": "Vm", "K": "Kh", "n": "nH" }
  ```

### Modulators

A rate law may carry a `modulators` array. Each modulator wraps the reaction's
rate to represent an inhibitor (a controllable dose) or a feedback coupling (a
live species concentration).

```json
{
  "id": "inh",
  "name": "Competitive inhibitor",
  "mechanism": "competitive",
  "source": { "parameter": "inhDose" },
  "Ki": 0.5,
  "n": 1
}
```

- `id` is required and unique across the model; `name` is optional.
- `source` is either `{ "parameter": id }` (a dose the user controls) or
  `{ "species": id }` (a live concentration, e.g. a feedback loop).
- `Ki` and the optional `n` (default 1) may each be a number or a parameter id.
- With `r = (value / Ki)^n`, where `value` is the dose or species concentration,
  the mechanism adjusts the rate as:
  - `competitive` — `Km` becomes `Km * (1 + r)`
  - `noncompetitive` — `Vmax` becomes `Vmax / (1 + r)`
  - `uncompetitive` — both `Km` and `Vmax` are divided by `(1 + r)`

The negative feedback in the MAPK model is a species-sourced noncompetitive
modulator; the MEK and kinase inhibitors are parameter-sourced (dose) modulators.

## Persistence

A model can be exported to a `.json` file (the canonical spec, including
`schemaVersion`) and re-imported through a file picker. Import refuses a file
whose `schemaVersion` is not `1.2` and validates the model before loading.
Plotted trajectories can be exported to CSV (a time column and one column per
plotted species).

## Numerical method

The system is integrated with an adaptive Dormand-Prince 5(4) method with
absolute and relative error control. Dose-response sweeps integrate each point
to a steady state, detected when the tail amplitude falls below a relative
tolerance; points that do not settle (for example an oscillating network) are
reported as a time-averaged mean over whole cycles and marked as such.

## Disclaimer

This tool is intended for education. The bundled models illustrate qualitative
signaling behavior and are not calibrated to a specific cell line, tissue, or
patient. Numerical output should not be interpreted as a quantitative
prediction.

## License

See `LICENSE`.
