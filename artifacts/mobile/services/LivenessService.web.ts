import type { MutableRefObject } from "react";

export type LivenessStep = "blink" | "headLeft" | "headRight" | "tracking";

export interface LivenessFrame {
  step: LivenessStep;
  detected: boolean;
  confidence: number;
  landmarks?: Array<{ x: number; y: number; z?: number; name?: string }>;
}

export async function initModel(): Promise<void> {}

export function isReady(): boolean {
  return false;
}

export function startDetecting(
  _step: LivenessStep,
  _cameraRef: MutableRefObject<any>,
  _onDetected: () => void,
  _onTimeout?: () => void,
): { stop: () => void } {
  return {
    stop() {},
  };
}
