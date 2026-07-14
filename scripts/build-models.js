// Emits js/models/models.js from the canonical .json models, so the app can
// load them without a fetch (blocked over file://). Run: node scripts/build-models.js
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const FILES = ["mapk.json", "goldbeter-koshland.json"];

const objs = FILES.map((f) => JSON.parse(readFileSync(join(root, "js", "models", f), "utf8")));
const body = objs.map((o) => JSON.stringify(o, null, 2)).join(",\n");

const out = "// Generated from js/models/*.json by scripts/build-models.js. Do not edit by hand.\n" +
  "(function (root) {\n" +
  '  "use strict";\n' +
  "  const NS = root.BPS || (root.BPS = {});\n" +
  "  NS.models = [\n" +
  body + "\n" +
  "  ];\n" +
  "})(typeof globalThis !== \"undefined\" ? globalThis : this);\n";

writeFileSync(join(root, "js", "models", "models.js"), out);
console.log("wrote js/models/models.js (" + objs.length + " models)");
