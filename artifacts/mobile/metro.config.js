const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .wasm files (required by expo-sqlite on web)
config.resolver.assetExts.push("wasm");

// Treat wasm as a source file for web bundling
config.resolver.sourceExts = config.resolver.sourceExts.filter((e) => e !== "wasm");

// pnpm uses symlinks — enable symlink resolution so Metro can follow them
config.resolver.unstable_enableSymlinks = true;

// Watch the monorepo root so Metro picks up packages from the shared pnpm store
const workspaceRoot = path.resolve(__dirname, "../..");
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
