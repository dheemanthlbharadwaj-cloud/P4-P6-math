// expo/metro-config (SDK 57) auto-detects npm workspaces: it watches the workspace root and resolves hoisted
// node_modules, so "@p6/shared" (TS source via "main": "src/index.ts") resolves with no overrides.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Question figures ship as a few ".figpack" files (scripts/build-figpacks.mjs): plain binary assets.
config.resolver.assetExts = [...config.resolver.assetExts, "figpack"];

module.exports = config;
