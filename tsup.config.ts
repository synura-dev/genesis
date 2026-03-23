import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	dts: true,
	clean: true,
	minify: false,
	sourcemap: true,
	bundle: true,
	platform: "neutral",
	target: "esnext",
	external: ["eventemitter3"],
	splitting: false,
	treeshake: true,
	shims: true,
});
