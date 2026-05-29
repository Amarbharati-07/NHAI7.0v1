---
name: Liveness camera detection wiring
description: How the LivenessService detection session is started/stopped in liveness-camera.tsx
---

## Pattern
- `cameraRef = useRef<any>(null)` — passed to CameraView as `ref={cameraRef}` and to `LivenessService.startDetecting`
- `sessionRef = useRef<{ stop: () => void } | null>(null)` — holds the active session handle
- Detection useEffect deps: `[phase, stepIndex, modelReady]` — restarts session whenever any changes
- `handleConfirm` passed directly (not via ref) to `startDetecting` — works because the effect re-runs (and thus recaptures the fresh closure) whenever `stepIndex` changes, which is the same trigger that would invalidate the closure

## Model init
`LivenessService.initModel()` called once on mount (guarded by `Platform.OS !== "web"`), sets `modelReady` state when done.

**Why:** Passing handleConfirm directly avoids the stale-ref-initialization problem where a ref starts as `() => {}` and only gets updated on first call. Since the detection effect restarts on stepIndex change, it always captures the correct handleConfirm for the current step.

**How to apply:** If adding more liveness steps or changing handleConfirm logic, ensure the effect dependency array includes whatever state handleConfirm depends on that can change mid-session.
