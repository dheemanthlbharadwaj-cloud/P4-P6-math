// expo/metro-config (SDK 57) auto-detects npm workspaces: it watches the workspace root, so "@p6/shared" and the game's
// content bundle (../mobile/assets/content, the one source of questions for both apps) resolve with no overrides.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
