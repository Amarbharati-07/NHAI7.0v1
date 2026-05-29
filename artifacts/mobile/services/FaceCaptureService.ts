/**
 * FaceCaptureService
 *
 * Modular service for face image capture during worker registration.
 * Designed so a face-recognition / liveness-detection model can be
 * dropped in later without touching the UI layer — just augment
 * `analyzeCapture()` below.
 */

import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

export type FacePose =
  | "front"
  | "left"
  | "right"
  | "up"
  | "down"
  | "smile"
  | "blink"
  | "neutral";

export interface CaptureResult {
  pose: FacePose;
  uri: string;
  localPath: string;
  capturedAt: string;
}

export interface PoseConfig {
  key: FacePose;
  label: string;
  instruction: string;
  icon: string;
}

export const POSE_CONFIGS: PoseConfig[] = [
  { key: "front",   label: "Front Face",    instruction: "Look straight at the camera",   icon: "person" },
  { key: "left",    label: "Left Profile",  instruction: "Turn your face to the left",    icon: "arrow-back-outline" },
  { key: "right",   label: "Right Profile", instruction: "Turn your face to the right",   icon: "arrow-forward-outline" },
  { key: "up",      label: "Face Up",       instruction: "Tilt your face slightly upward", icon: "arrow-up-outline" },
  { key: "down",    label: "Face Down",     instruction: "Tilt your face slightly downward", icon: "arrow-down-outline" },
  { key: "smile",   label: "Smile",         instruction: "Give a natural, relaxed smile", icon: "happy-outline" },
  { key: "blink",   label: "Blink",         instruction: "Blink both eyes naturally",     icon: "eye-off-outline" },
  { key: "neutral", label: "Neutral",       instruction: "Relax your face completely",    icon: "remove-outline" },
];

/** In-memory session store keyed by session ID (one per registration flow). */
const _sessions = new Map<string, Map<FacePose, CaptureResult>>();

function getSession(sessionId: string): Map<FacePose, CaptureResult> {
  if (!_sessions.has(sessionId)) {
    _sessions.set(sessionId, new Map());
  }
  return _sessions.get(sessionId)!;
}

/** Request camera + media-library permissions. Returns true if granted. */
export async function requestPermissions(): Promise<boolean> {
  const cam = await ImagePicker.requestCameraPermissionsAsync();
  return cam.granted;
}

/** Check current permissions without prompting. */
export async function checkPermissions(): Promise<boolean> {
  const cam = await ImagePicker.getCameraPermissionsAsync();
  return cam.granted;
}

/**
 * Open the device camera for a specific pose.
 * Saves a permanent copy to the app's document directory.
 * Returns null if the user cancelled.
 */
export async function captureImage(
  sessionId: string,
  pose: FacePose
): Promise<CaptureResult | null> {
  const granted = await requestPermissions();
  if (!granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: "images",
    allowsEditing: false,
    quality: 0.8,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];

  const dir = `${FileSystem.documentDirectory}spectra_faces/${sessionId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const ext = asset.uri.split(".").pop() ?? "jpg";
  const filename = `${pose}_${Date.now()}.${ext}`;
  const localPath = `${dir}${filename}`;

  await FileSystem.copyAsync({ from: asset.uri, to: localPath });

  const capture: CaptureResult = {
    pose,
    uri: localPath,
    localPath,
    capturedAt: new Date().toISOString(),
  };

  getSession(sessionId).set(pose, capture);

  return capture;
}

/** Delete a previously captured image and remove it from the session. */
export async function retakeImage(
  sessionId: string,
  pose: FacePose
): Promise<void> {
  const session = getSession(sessionId);
  const existing = session.get(pose);
  if (existing) {
    try {
      await FileSystem.deleteAsync(existing.localPath, { idempotent: true });
    } catch {}
    session.delete(pose);
  }
}

/** Get a snapshot of all captures in the session. */
export function getSessionCaptures(
  sessionId: string
): Partial<Record<FacePose, CaptureResult>> {
  const session = getSession(sessionId);
  const out: Partial<Record<FacePose, CaptureResult>> = {};
  session.forEach((v, k) => { out[k] = v; });
  return out;
}

/**
 * Store a CaptureResult directly into the session.
 * Used by the guided workflow which handles its own camera/file logic.
 */
export function setCapture(sessionId: string, result: CaptureResult): void {
  getSession(sessionId).set(result.pose, result);
}

/** Count how many poses have been captured in this session. */
export function getCaptureCount(sessionId: string): number {
  return getSession(sessionId).size;
}

/** True when all 8 poses are captured. */
export function isSessionComplete(sessionId: string): boolean {
  return getSession(sessionId).size === POSE_CONFIGS.length;
}

/**
 * Clear the entire session (call on cancel or after successful registration).
 */
export async function clearSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId);
  const dir = `${FileSystem.documentDirectory}spectra_faces/${sessionId}/`;
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  } catch {}
  session.clear();
  _sessions.delete(sessionId);
}

/**
 * Persist face image records to SQLite after the worker has been saved.
 * Call this right after insertWorker() with the returned workerId.
 *
 * EXTENSION POINT: add model inference here once a face-rec SDK is available.
 */
export async function saveFaceImagesToDb(
  workerId: number,
  sessionId: string
): Promise<void> {
  // Lazy import to avoid circular dependency
  const { saveFaceImage } = await import("./database");
  const session = getSession(sessionId);
  for (const [pose, capture] of session.entries()) {
    await saveFaceImage({
      workerId,
      imageType: pose,
      imagePath: capture.localPath,
      captured: true,
    });
  }
}

/**
 * EXTENSION POINT: Replace body with real model call.
 * Returns a confidence score 0–1; currently always returns 1 (stub).
 */
export async function analyzeCapture(
  _capture: CaptureResult
): Promise<{ confidence: number; valid: boolean }> {
  return { confidence: 1, valid: true };
}
