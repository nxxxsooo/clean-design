import { build } from "esbuild";

const sharedOptions = {
  bundle: true,
  format: "esm",
  packages: "external",
  platform: "node",
  target: "node24",
};

await build({
  ...sharedOptions,
  entryPoints: ["./src/index.ts"],
  outfile: "./dist/index.mjs",
});
