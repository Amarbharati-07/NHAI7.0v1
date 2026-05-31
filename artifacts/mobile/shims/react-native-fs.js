/**
 * Shim for react-native-fs
 *
 * @tensorflow/tfjs-react-native lists react-native-fs as a peer dependency and
 * imports it inside bundle_resource_io.js (used only when loading models from the
 * app bundle via bundleResourceIO). We load models from the CDN / asyncStorage,
 * so this code path is never executed at runtime.
 *
 * Metro requires every import to resolve at bundle time, so we provide an empty
 * stub to silence the "Unable to resolve react-native-fs" bundling error.
 */
module.exports = {};
