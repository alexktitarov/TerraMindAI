"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  componentTagger: () => componentTagger
});
module.exports = __toCommonJS(src_exports);

// src/componentTaggerPlugin.ts
var import_promises = __toESM(require("fs/promises"), 1);
var import_path2 = __toESM(require("path"), 1);
var esbuild = __toESM(require("esbuild"), 1);
var import_resolveConfig = __toESM(require("tailwindcss/resolveConfig.js"), 1);

// src/util.ts
var import_fs = require("fs");
var import_path = __toESM(require("path"), 1);
function findProjectRoot(startPath = process.cwd()) {
  try {
    let currentPath = startPath;
    let count = 0;
    while (currentPath !== import_path.default.parse(currentPath).root && count < 20) {
      if ((0, import_fs.existsSync)(import_path.default.join(currentPath, "package.json"))) {
        return currentPath;
      }
      currentPath = import_path.default.dirname(currentPath);
      count++;
    }
    return process.cwd();
  } catch (error) {
    console.error("Error finding project root:", error);
    return process.cwd();
  }
}

// src/componentTaggerPlugin.ts
var projectRoot = findProjectRoot();
var tailwindInputFile = import_path2.default.resolve(projectRoot, "./tailwind.config.ts");
var tailwindJsonOutfile = import_path2.default.resolve(projectRoot, "./src/tailwind.config.lov.json");
var tailwindIntermediateFile = import_path2.default.resolve(projectRoot, "./.lov.tailwind.config.js");
var isSandbox = process.env.LOVABLE_DEV_SERVER === "true";
function componentTagger() {
  return {
    name: "vite-plugin-component-tagger",
    enforce: "pre",
    async buildStart() {
      if (!isSandbox)
        return;
      try {
        await generateConfig();
      } catch (error) {
        console.error("Error generating tailwind.config.lov.json:", error);
      }
    },
    configureServer(server) {
      if (!isSandbox)
        return;
      try {
        server.watcher.add(tailwindInputFile);
        server.watcher.on("change", async (changedPath) => {
          if (import_path2.default.normalize(changedPath) === import_path2.default.normalize(tailwindInputFile)) {
            await generateConfig();
          }
        });
      } catch (error) {
        console.error("Error adding watcher:", error);
      }
    }
  };
}
async function generateConfig() {
  try {
    await esbuild.build({
      entryPoints: [tailwindInputFile],
      outfile: tailwindIntermediateFile,
      bundle: true,
      format: "esm",
      banner: {
        js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);'
      }
    });
    try {
      const userConfig = await import(
        tailwindIntermediateFile + "?update=" + Date.now()
        // cache buster
      );
      if (!userConfig || !userConfig.default) {
        console.error("Invalid Tailwind config structure:", userConfig);
        throw new Error("Invalid Tailwind config structure");
      }
      const resolvedConfig = (0, import_resolveConfig.default)(userConfig.default);
      await import_promises.default.writeFile(tailwindJsonOutfile, JSON.stringify(resolvedConfig, null, 2));
      await import_promises.default.unlink(tailwindIntermediateFile).catch(() => {
      });
    } catch (error) {
      console.error("Error processing config:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error in generateConfig:", error);
    throw error;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  componentTagger
});
