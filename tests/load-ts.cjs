const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

module.exports = function loadTs(filename, mocks = {}) {
  const absolute = path.resolve(filename);
  const output = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const localRequire = specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier === "server-only") return {};
    if (specifier.startsWith(".")) return module.exports(path.resolve(path.dirname(absolute), `${specifier}.ts`), mocks);
    return require(specifier);
  };
  new Function("require", "module", "exports", output)(localRequire, mod, mod.exports);
  return mod.exports;
};
