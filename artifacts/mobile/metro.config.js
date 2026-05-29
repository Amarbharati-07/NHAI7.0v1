const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .wasm files (required by expo-sqlite on web)
config.resolver.assetExts.push("wasm");

// Treat wasm as a source file for web bundling
config.resolver.sourceExts = config.resolver.sourceExts.filter((e) => e !== "wasm");

module.exports = config;
