import Constants from "expo-constants";
import { Platform } from "react-native";

type ExpoUpdateCheckResult = {
  isAvailable?: boolean;
};

type ExpoUpdatesModule = {
  isEnabled?: boolean;
  checkForUpdateAsync?: () => Promise<ExpoUpdateCheckResult>;
  fetchUpdateAsync?: () => Promise<void>;
  reloadAsync?: () => Promise<void>;
};

const REMOTE_UPDATE_ERROR_PATTERNS = [
  "Failed to download remote update",
  "Failed to fetch update",
  "remote update",
  "expo-updates",
];

function isRemoteUpdateError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? "");

  return REMOTE_UPDATE_ERROR_PATTERNS.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase()),
  );
}

/** OTA updates are for standalone/EAS builds only — never in Expo Go or dev. */
export function shouldBootstrapExpoUpdates(): boolean {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return false;
  }
  if (Platform.OS === "web") {
    return false;
  }
  const ownership = Constants.appOwnership;
  if (ownership === "expo") {
    return false;
  }
  return true;
}

function loadExpoUpdatesModule(): ExpoUpdatesModule | null {
  try {
    const runtimeRequire = Function(
      "return typeof require === 'function' ? require : null;",
    )() as ((id: string) => unknown) | null;

    if (!runtimeRequire) {
      return null;
    }

    return runtimeRequire("expo-updates") as ExpoUpdatesModule;
  } catch (error) {
    console.info("[ExpoUpdates] runtime module unavailable, continuing with embedded bundle", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function bootstrapExpoUpdates(): Promise<void> {
  if (!shouldBootstrapExpoUpdates()) {
    return;
  }

  const updates = loadExpoUpdatesModule();
  if (!updates?.checkForUpdateAsync || !updates?.fetchUpdateAsync || !updates?.reloadAsync) {
    console.info("[ExpoUpdates] runtime not installed or disabled; using embedded bundle");
    return;
  }

  if (updates.isEnabled === false) {
    console.info("[ExpoUpdates] updates disabled; using embedded bundle");
    return;
  }

  try {
    const update = await updates.checkForUpdateAsync();
    if (!update?.isAvailable) {
      return;
    }

    try {
      await updates.fetchUpdateAsync();
      await updates.reloadAsync();
    } catch (error) {
      if (isRemoteUpdateError(error)) {
        console.warn("[ExpoUpdates] update download failed; continuing with embedded bundle", {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      console.warn("[ExpoUpdates] update reload failed; continuing with embedded bundle", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    if (isRemoteUpdateError(error)) {
      console.warn("[ExpoUpdates] update check failed; continuing with embedded bundle", {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    console.warn("[ExpoUpdates] unexpected update bootstrap error; continuing", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
