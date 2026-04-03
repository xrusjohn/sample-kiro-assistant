import { build } from "esbuild";

await build({
  entryPoints: ["src/cli-client/kiro-remote.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: "dist/kiro-remote.js",
  format: "esm",
  banner: { js: "#!/usr/bin/env node" },
  external: ["ws"],
});

console.log("Built dist/kiro-remote.js");
