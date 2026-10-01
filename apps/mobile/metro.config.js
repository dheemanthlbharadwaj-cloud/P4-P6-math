// expo/metro-config (SDK 57) auto-detects npm workspaces: it watches the workspace root and resolves hoisted
// node_modules, so "@p6/shared" (TS source via "main": "src/index.ts") resolves with no overrides.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
