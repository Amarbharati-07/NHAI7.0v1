const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Shim react-native-fs — it is listed as a peer dep of @tensorflow/tfjs-react-native
// but is only used by bundleResourceIO (loading models from the bundle), which we don't
// use.  Without this shim Metro fails to bundle attendance.tsx entirely.
const rnFsShim = path.resolve(__dirname, "shims/react-native-fs.js");
const origResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react-native-fs") {
    return { filePath: rnFsShim, type: "sourceFile" };
  }
  if (origResolve) return origResolve(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

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

// Add Cross-Origin Isolation headers required by expo-sqlite on web.
// OPFS (Origin Private File System) needs crossOriginIsolated = true.
config.server = {
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      return middleware(req, res, next);
    };
  },
};

module.exports = config;
