// src/componentTaggerPlugin.ts
import fs from "fs/promises";
import path2 from "path";
import * as esbuild from "esbuild";
import resolveConfig from "tailwindcss/resolveConfig.js";

// src/util.ts
import { existsSync } from "fs";
import path from "path";
function findProjectRoot(startPath = process.cwd()) {
  try {
    let currentPath = startPath;
    let count = 0;
    while (currentPath !== path.parse(currentPath).root && count < 20) {
      if (existsSync(path.join(currentPath, "package.json"))) {
        return currentPath;
      }
      currentPath = path.dirname(currentPath);
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
var tailwindInputFile = path2.resolve(projectRoot, "./tailwind.config.ts");
var tailwindJsonOutfile = path2.resolve(projectRoot, "./src/tailwind.config.lov.json");
var tailwindIntermediateFile = path2.resolve(projectRoot, "./.lov.tailwind.config.js");
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
          if (path2.normalize(changedPath) === path2.normalize(tailwindInputFile)) {
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
      const resolvedConfig = resolveConfig(userConfig.default);
      await fs.writeFile(tailwindJsonOutfile, JSON.stringify(resolvedConfig, null, 2));
      await fs.unlink(tailwindIntermediateFile).catch(() => {
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
export {
  componentTagger
};
