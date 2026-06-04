import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { friendlyErrorMessage } from "@/services/userMessages";
import {
  type CaptureResult,
  type FacePose,
  getSessionCaptures,
  POSE_CONFIGS,
  setCapture,
} from "@/services/FaceCaptureService";
import * as FaceRecognitionService from "@/services/FaceRecognitionService";
import * as LivenessService from "@/services/LivenessService";

type Mode = "register" | "attendance";
type Stage = "recognize" | "liveness" | "done" | "error";
type Tone = "info" | "success" | "warning" | "error";

const ATTENDANCE_STEPS = [
  { key: "blink" as const, label: "Blink Eyes", instruction: "Blink both eyes naturally", icon: "eye-outline" as const, color: "#3B82F6" },
  { key: "headLeft" as const, label: "Turn Left", instruction: "Slowly turn your head to the left", icon: "arrow-back-outline" as const, color: "#60A5FA" },
  { key: "headRight" as const, label: "Turn Right", instruction: "Slowly turn your head to the right", icon: "arrow-forward-outline" as const, color: "#34D399" },
  { key: "tracking" as const, label: "Look Around", instruction: "Follow the moving dot with your eyes", icon: "scan-circle-outline" as const, color: "#F59E0B" },
];

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function safeName(input?: string | null): string {
  return input?.trim() || "—";
}

async function copyCameraShot(sessionId: string, pose: FacePose, uri: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}spectra_faces/${sessionId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const ext = uri.split(".").pop() ?? "jpg";
  const dest = `${dir}${pose}_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

interface FaceFlowCameraProps {
  mode: Mode;
  sessionId?: string;
  workerName?: string;
  workerId?: string;
  department?: string;
  confidence?: string;
}

export default function FaceFlowCamera({
  mode,
  sessionId: sessionIdParam,
  workerName,
  workerId,
  department,
  confidence,
}: FaceFlowCameraProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const sessionId = useRef(sessionIdParam ?? `${mode}_${Date.now()}`).current;

  const registerSteps = POSE_CONFIGS;
  const attendanceSteps = useMemo(() => shuffle(ATTENDANCE_STEPS), []);

  const [registerIndex, setRegisterIndex] = useState(() => {
    const captured = Object.keys(getSessionCaptures(sessionId)) as FacePose[];
    const next = POSE_CONFIGS.findIndex((pose) => !captured.includes(pose.key));
    return next >= 0 ? next : 0;
  });
  const [registerDone, setRegisterDone] = useState<Set<FacePose>>(() => {
    const captured = Object.keys(getSessionCaptures(sessionId)) as FacePose[];
    return new Set(captured);
  });
  const [stage, setStage] = useState<Stage>(mode === "attendance" ? "recognize" : "done");
  const [attendanceIndex, setAttendanceIndex] = useState(0);
  const [matchedWorker, setMatchedWorker] = useState<{
    workerId: string;
    workerIdCode: string;
    workerName: string;
    department: string;
    confidence: number;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: Tone; title: string; body: string } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [recognitionReady, setRecognitionReady] = useState(false);
  const [livenessReady, setLivenessReady] = useState(false);
  const [faceModelReady, setFaceModelReady] = useState(mode === "attendance");
  const [busy, setBusy] = useState(false);
  const [attemptToken, setAttemptToken] = useState(0);
  const registerAutoRunning = useRef(false);

  const recognitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionCancelled = useRef(false);
  const attendanceChallenge = attendanceSteps[attendanceIndex] ?? attendanceSteps[0];
  const registerStep = registerSteps[registerIndex] ?? registerSteps[0];

  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;
  const bottomPad = Platform.OS === "web" ? 28 : insets.bottom + 16;

  const pulse = useSharedValue(1);
  const ringOpacity = useSharedValue(0.45);
  const cardOffset = useSharedValue(40);
  const cardOpacity = useSharedValue(0);
  const statusScale = useSharedValue(0.9);
  const statusOpacity = useSharedValue(0);

  useEffect(() => {
    if (Platform.OS !== "web") {
      void requestPermission();
    }
  }, [requestPermission]);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 850 }), withTiming(1, { duration: 850 })),
      -1,
      true
    );
    ringOpacity.value = withRepeat(
      withSequence(withTiming(0.95, { duration: 850 }), withTiming(0.45, { duration: 850 })),
      -1,
      true
    );
  }, []);

  useEffect(() => {
    cardOffset.value = 34;
    cardOpacity.value = 0;
    cardOffset.value = withSpring(0, { damping: 18 });
    cardOpacity.value = withTiming(1, { duration: 240 });
  }, [mode, registerIndex, attendanceIndex, stage]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: ringOpacity.value,
  }));

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardOffset.value }],
    opacity: cardOpacity.value,
  }));

  const statusStyle = useAnimatedStyle(() => ({
    transform: [{ scale: statusScale.value }],
    opacity: statusOpacity.value,
  }));

  const triggerStatus = (tone: Tone, title: string, body: string) => {
    setFeedback({ tone, title, body });
    statusScale.value = withSpring(1, { damping: 12 });
    statusOpacity.value = withTiming(1, { duration: 180 });
  };

  const clearTimers = () => {
    if (recognitionTimer.current) {
      clearTimeout(recognitionTimer.current);
      recognitionTimer.current = null;
    }
    if (stepTimer.current) {
      clearTimeout(stepTimer.current);
      stepTimer.current = null;
    }
  };

  useEffect(() => () => {
    sessionCancelled.current = true;
    clearTimers();
  }, []);

  useEffect(() => {
    if (mode !== "attendance") return;
    if (Platform.OS === "web") {
      setRecognitionReady(false);
      setLivenessReady(false);
      return;
    }

    let cancelled = false;
    setRecognitionReady(false);
    setLivenessReady(false);

    const load = async () => {
      try {
        await Promise.all([
          FaceRecognitionService.initModels(),
          FaceRecognitionService.loadStoredEmbeddings(),
          LivenessService.initModel(),
        ]);
        if (cancelled) return;
        setRecognitionReady(true);
        setLivenessReady(true);
      } catch (err) {
        if (cancelled) return;
        const msg = friendlyErrorMessage(err, "Unable to prepare the camera. Please try again.");
        triggerStatus("error", "Model load failed", msg);
        setStage("error");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "register") return;
    if (Platform.OS === "web") {
      setFaceModelReady(true);
      return;
    }

    let cancelled = false;
    setFaceModelReady(false);

    const load = async () => {
      try {
        await FaceRecognitionService.initModels();
        if (!cancelled) setFaceModelReady(true);
      } catch {
        if (!cancelled) setFaceModelReady(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "register" || !cameraReady || !faceModelReady || sessionCancelled.current) return;
    if (registerIndex >= registerSteps.length) return;
    if (busy || registerAutoRunning.current) return;

    let cancelled = false;
    clearTimers();

    const currentStep = registerSteps[registerIndex];
    const scheduleRetry = (delay = 900) => {
      if (cancelled || sessionCancelled.current) return;
      stepTimer.current = setTimeout(() => {
        if (!cancelled && !sessionCancelled.current) {
          void runStep();
        }
      }, delay);
    };

    const runStep = async () => {
      if (cancelled || sessionCancelled.current || registerAutoRunning.current) return;
      if (!cameraRef.current) {
        scheduleRetry(400);
        return;
      }

      registerAutoRunning.current = true;
      setBusy(true);
      triggerStatus("info", currentStep.label, currentStep.instruction);

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.75,
          base64: false,
          skipProcessing: true,
        });

        if (cancelled || sessionCancelled.current) return;

        if (!photo?.uri) {
          triggerStatus("warning", "Capture waiting", "Keep your face inside the frame and hold this pose.");
          scheduleRetry();
          return;
        }

        const face = await FaceRecognitionService.detectFace(photo.uri).catch(() => null);
        if (!face) {
          triggerStatus("error", "Pose not ready", "Keep your face centred in the frame and try again.");
          scheduleRetry();
          return;
        }

        const localPath = await copyCameraShot(sessionId, currentStep.key, photo.uri);
        const capture: CaptureResult = {
          pose: currentStep.key,
          uri: localPath,
          localPath,
          capturedAt: new Date().toISOString(),
        };

        setCapture(sessionId, capture);
        const nextDone = new Set(registerDone);
        nextDone.add(currentStep.key);
        setRegisterDone(nextDone);
        triggerStatus("success", `${currentStep.label} captured`, "Great. Moving to the next pose automatically.");

        stepTimer.current = setTimeout(() => {
          if (cancelled || sessionCancelled.current) return;
          registerAutoRunning.current = false;
          if (registerIndex >= registerSteps.length - 1) {
            router.back();
            return;
          }
          setRegisterIndex((current) => current + 1);
          setFeedback(null);
        }, 700);
      } catch (err) {
        const msg = friendlyErrorMessage(err, "Unable to capture the photo. Please try again.");
        triggerStatus("error", "Capture failed", msg);
        scheduleRetry();
      } finally {
        setBusy(false);
        registerAutoRunning.current = false;
      }
    };

    stepTimer.current = setTimeout(() => {
      void runStep();
    }, 250);

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [mode, cameraReady, faceModelReady, registerIndex, registerSteps.length, registerStep?.label, registerStep?.instruction]);

  useEffect(() => {
    if (mode !== "attendance" || stage !== "recognize" || !cameraReady || !recognitionReady) return;
    clearTimers();
    if (sessionCancelled.current) return;

    let stopped = false;
    const timeoutMs = 15000;
    const startedAt = Date.now();

    const runRecognition = async () => {
      if (stopped || sessionCancelled.current) return;
      if (!cameraRef.current) {
        recognitionTimer.current = setTimeout(runRecognition, 600);
        return;
      }

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.6,
          base64: false,
          skipProcessing: true,
        });

        if (stopped || sessionCancelled.current || !photo?.uri) return;

        const result = await FaceRecognitionService.identifyFromCamera(photo.uri);
        if (stopped || sessionCancelled.current) return;

        if (result.faceDetected && result.matched && result.workerId && result.workerIdCode) {
          stopped = true;
          clearTimers();
          setMatchedWorker({
            workerId: result.workerId,
            workerIdCode: result.workerIdCode,
            workerName: result.workerName ?? result.workerIdCode,
            department: department ?? "",
            confidence: result.confidence,
          });
          triggerStatus("success", "Face matched", `${safeName(result.workerName)} identified successfully`);
          setStage("liveness");
          setAttendanceIndex(0);
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          stopped = true;
          triggerStatus("warning", "Try again", "Face match timed out. Keep your face inside the frame and retry.");
          setStage("error");
          return;
        }

        recognitionTimer.current = setTimeout(runRecognition, 850);
      } catch (err) {
        if (stopped || sessionCancelled.current) return;
        const msg = friendlyErrorMessage(err, "Unable to scan the face. Please try again.");
        triggerStatus("warning", "Scan retry", msg);
        recognitionTimer.current = setTimeout(runRecognition, 850);
      }
    };

    triggerStatus("info", "Face scan started", "Position your face inside the frame.");
    void runRecognition();

    return () => {
      stopped = true;
      clearTimers();
    };
  }, [mode, stage, cameraReady, recognitionReady, attemptToken]);

  useEffect(() => {
    if (mode !== "attendance" || stage !== "liveness" || !cameraReady || !livenessReady || !cameraRef.current) return;
    clearTimers();
    if (sessionCancelled.current) return;

    const step = attendanceChallenge;
    if (!step) return;

    let session = LivenessService.startDetecting(
      step.key,
      cameraRef,
      () => {
        clearTimers();
        triggerStatus("success", `${step.label} passed`, "Great, continue to the next challenge.");
        setAttendanceIndex((current) => {
          const next = current + 1;
          if (next >= attendanceSteps.length) {
            if (!sessionCancelled.current) {
              setStage("done");
            }
          }
          return next;
        });
      },
      () => {
        clearTimers();
        triggerStatus("error", `${step.label} not detected`, "Keep following the camera guidance and try the same step again.");
        stepTimer.current = setTimeout(() => {
          if (!sessionCancelled.current && stage === "liveness") {
            setAttemptToken((token) => token + 1);
          }
        }, 900);
      }
    );

    triggerStatus("info", step.label, step.instruction);

    return () => {
      session.stop();
      session = null as never;
    };
  }, [mode, stage, cameraReady, livenessReady, attendanceIndex, attemptToken]);

  useEffect(() => {
    if (mode !== "attendance") return;
    if (stage === "done" && matchedWorker) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/attendance-success",
        params: {
          workerName: matchedWorker.workerName,
          workerId: matchedWorker.workerIdCode,
          department: matchedWorker.department,
          confidence: String(matchedWorker.confidence),
        },
      } as never);
    }
  }, [mode, stage, matchedWorker]);

  const captureRegisterStep = async () => {
    if (mode !== "register" || busy || !cameraRef.current) return;
    setBusy(true);
    clearTimers();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.75,
        base64: false,
        skipProcessing: true,
      });

      if (!photo?.uri) {
        triggerStatus("error", "Capture cancelled", "No photo was captured. Try again.");
        return;
      }

      const face = faceModelReady ? await FaceRecognitionService.detectFace(photo.uri).catch(() => null) : { probability: 1 };
      if (!face) {
        triggerStatus("error", "Face not detected", "Keep your face centred in the frame and try again.");
        return;
      }

      const pose = registerStep.key;
      const localPath = await copyCameraShot(sessionId, pose, photo.uri);
      const capture: CaptureResult = {
        pose,
        uri: localPath,
        localPath,
        capturedAt: new Date().toISOString(),
      };
      setCapture(sessionId, capture);

      const nextDone = new Set(registerDone);
      nextDone.add(pose);
      setRegisterDone(nextDone);
      triggerStatus("success", `${registerStep.label} captured`, "Great. The app will move to the next pose.");

      stepTimer.current = setTimeout(() => {
        if (sessionCancelled.current) return;
        if (registerIndex >= registerSteps.length - 1) {
          router.back();
          return;
        }
        setRegisterIndex((current) => current + 1);
        setFeedback(null);
      }, 700);
    } catch (err) {
      const msg = friendlyErrorMessage(err, "Unable to capture the photo. Please try again.");
      triggerStatus("error", "Capture failed", msg);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    sessionCancelled.current = true;
    clearTimers();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const showPermissionWait = !permission;
  const permissionDenied = permission && !permission.granted;
  const totalSteps = mode === "register" ? registerSteps.length : 1 + attendanceSteps.length;
  const currentStep = mode === "register"
    ? registerIndex + 1
    : stage === "recognize"
      ? 1
      : Math.min(attendanceIndex + 2, totalSteps);
  const currentLabel = mode === "register"
    ? registerStep?.label ?? "Face Capture"
    : stage === "recognize"
      ? "Face Match"
      : attendanceChallenge?.label ?? "Liveness";
  const currentInstruction = mode === "register"
    ? registerStep?.instruction ?? "Keep your face centred in the frame."
    : stage === "recognize"
      ? "Position your face inside the frame. Recognition starts automatically."
      : attendanceChallenge?.instruction ?? "Follow the on-screen guidance.";
  const toneColor = feedback?.tone === "success"
    ? colors.success
    : feedback?.tone === "warning"
      ? colors.warning
      : feedback?.tone === "error"
        ? colors.destructive
        : colors.primary;

  if (showPermissionWait) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: "#081420" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.permissionText}>Requesting camera access…</Text>
      </View>
    );
  }

  if (permissionDenied) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: "#081420", paddingHorizontal: 28 }]}>
        <View style={[styles.permissionIcon, { backgroundColor: colors.primary + "20" }]}>
          <Ionicons name="camera-outline" size={44} color={colors.primary} />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionBody}>
          This flow uses the front camera to guide face capture, recognition, and liveness verification.
        </Text>
        <TouchableOpacity
          style={[styles.permissionBtn, { backgroundColor: colors.primary }]}
          onPress={requestPermission}
          activeOpacity={0.85}
        >
          <Ionicons name="camera" size={18} color="#fff" />
          <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.permissionCancel} onPress={handleClose}>
          <Text style={styles.permissionCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: "#06121D" }]}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        active
        onCameraReady={() => setCameraReady(true)}
      />

      <View style={styles.overlay} />

      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: "rgba(255,255,255,0.1)" }]}
          onPress={handleClose}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.topTitle}>
            {mode === "register" ? "Face Capture" : "Mark Attendance"}
          </Text>
          <Text style={styles.topSub}>
            {mode === "register"
              ? "Build an 8-pose face profile"
              : safeName(workerName) !== "—"
                ? safeName(workerName)
                : "Automatic face match + liveness"}
          </Text>
        </View>

        <View style={[styles.stepBadge, { backgroundColor: colors.primary + "22" }]}>
          <Text style={[styles.stepBadgeText, { color: colors.accent }]}>
            {currentStep}/{totalSteps}
          </Text>
        </View>
      </View>

      <View style={styles.dotsRow}>
        {(mode === "register" ? registerSteps : [{ key: "scan" }, ...attendanceSteps]).map((step, index) => {
          const done = mode === "register"
            ? index < registerDone.size
            : index === 0
              ? stage !== "recognize"
              : index <= attendanceIndex;
          const active = mode === "register"
            ? index === registerIndex
            : stage === "recognize"
              ? index === 0
              : index === attendanceIndex + 1;
          return (
            <View
              key={step.key}
              style={[
                styles.dot,
                {
                  width: active ? 28 : 10,
                  backgroundColor: done
                    ? colors.success
                    : active
                      ? colors.primary
                      : "rgba(255,255,255,0.16)",
                },
              ]}
            >
              {done && <Ionicons name="checkmark" size={7} color="#fff" />}
            </View>
          );
        })}
      </View>

      <View style={styles.cameraArea}>
        <Animated.View style={[styles.pulseRing, { borderColor: mode === "attendance" && stage === "recognize" ? colors.primary : toneColor }, pulseStyle]} />
        <View style={[styles.frame, { borderColor: toneColor }]}>
          <View style={[styles.bracket, styles.bTL, { borderColor: toneColor }]} />
          <View style={[styles.bracket, styles.bTR, { borderColor: toneColor }]} />
          <View style={[styles.bracket, styles.bBL, { borderColor: toneColor }]} />
          <View style={[styles.bracket, styles.bBR, { borderColor: toneColor }]} />
          <View style={[styles.frameInner, { borderColor: toneColor + "88" }]}>
            <Ionicons
              name={mode === "register" ? (registerStep?.icon as keyof typeof Ionicons.glyphMap) : stage === "recognize" ? "person-outline" : (attendanceChallenge?.icon as keyof typeof Ionicons.glyphMap)}
              size={66}
              color={toneColor + "66"}
            />
          </View>
        </View>

        <View style={[styles.badgeWrap, { backgroundColor: "rgba(0,0,0,0.42)" }]}>
          <View style={[styles.labelBadge, { backgroundColor: toneColor }]}>
            <Text style={styles.labelBadgeText}>
              {mode === "register" ? registerStep?.label : stage === "recognize" ? "Face Match" : attendanceChallenge?.label}
            </Text>
          </View>
        </View>
      </View>

      <Animated.View style={[styles.instructionCard, { backgroundColor: "rgba(13,24,44,0.94)", borderColor: toneColor + "44" }, cardStyle]}>
        <View style={[styles.instructionIcon, { backgroundColor: toneColor + "22" }]}>
          <Ionicons
            name={mode === "register"
              ? (registerStep?.icon as keyof typeof Ionicons.glyphMap)
              : stage === "recognize"
                ? "scan-circle-outline"
                : (attendanceChallenge?.icon as keyof typeof Ionicons.glyphMap)}
            size={26}
            color={toneColor}
          />
        </View>
        <View style={styles.instructionBody}>
          <Text style={styles.instructionTitle}>{currentLabel}</Text>
          <Text style={styles.instructionText}>{currentInstruction}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: toneColor + "22" }]}>
          <Text style={[styles.statusPillText, { color: toneColor }]}>
            {feedback?.tone === "success"
              ? "Success"
              : feedback?.tone === "warning"
                ? "Warning"
                : feedback?.tone === "error"
                  ? "Retry"
                  : "Guided"}
          </Text>
        </View>
      </Animated.View>

      <View style={styles.tipRow}>
        {["Good lighting", "Face centred", "Hold still"].map((tip) => (
          <View key={tip} style={styles.tipItem}>
            <Ionicons name="checkmark-circle" size={13} color={colors.success} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      {feedback ? (
        <Animated.View style={[styles.feedbackBox, { borderColor: toneColor + "44", backgroundColor: toneColor + "18" }, statusStyle]}>
          <Ionicons
            name={feedback.tone === "success" ? "checkmark-circle" : feedback.tone === "error" ? "alert-circle" : "information-circle"}
            size={16}
            color={toneColor}
          />
          <View style={styles.feedbackTextWrap}>
            <Text style={[styles.feedbackTitle, { color: toneColor }]}>{feedback.title}</Text>
            <Text style={[styles.feedbackBody, { color: colors.textSecondary }]}>{feedback.body}</Text>
          </View>
        </Animated.View>
      ) : null}

      <View style={[styles.aiStatusBar, { paddingBottom: bottomPad, borderColor: toneColor + "30", backgroundColor: "rgba(13,24,44,0.94)" }]}>
        <View style={[styles.aiStatusIcon, { backgroundColor: toneColor + "18" }]}>
          {mode === "register" && busy ? (
            <ActivityIndicator size="small" color={toneColor} />
          ) : (
            <Ionicons
              name={
                feedback?.tone === "success"
                  ? "checkmark-circle"
                  : feedback?.tone === "error"
                    ? "alert-circle"
                    : feedback?.tone === "warning"
                      ? "warning"
                      : "pulse"
              }
              size={18}
              color={toneColor}
            />
          )}
        </View>
        <View style={styles.aiStatusTextWrap}>
          <Text style={styles.aiStatusTitle}>
            {feedback?.title ?? (mode === "register" ? currentLabel : stage === "recognize" ? "Face scan started" : "Liveness check running")}
          </Text>
          <Text style={styles.aiStatusBody}>
            {feedback?.body ?? currentInstruction}
          </Text>
        </View>
        <View style={[styles.aiStatusBadge, { backgroundColor: toneColor + "20" }]}>
          <Text style={[styles.aiStatusBadgeText, { color: toneColor }]}>
            {feedback?.tone === "success"
              ? "Success"
              : feedback?.tone === "warning"
                ? "Warning"
                : feedback?.tone === "error"
                  ? "Retry"
                  : "AI"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  permissionText: { color: "#fff", marginTop: 12, fontSize: 14, fontWeight: "600" },
  permissionIcon: { width: 74, height: 74, borderRadius: 37, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  permissionTitle: { color: "#fff", fontSize: 20, fontWeight: "800", textAlign: "center" },
  permissionBody: { color: "rgba(255,255,255,0.72)", fontSize: 14, textAlign: "center", lineHeight: 22, marginTop: 8, marginBottom: 18 },
  permissionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20, height: 52, borderRadius: 14 },
  permissionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  permissionCancel: { marginTop: 14, padding: 8 },
  permissionCancelText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,16,30,0.34)" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  topCenter: { alignItems: "center", flex: 1, paddingHorizontal: 12 },
  topTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  topSub: { color: "rgba(255,255,255,0.66)", fontSize: 12, marginTop: 2 },
  stepBadge: { minWidth: 58, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, alignItems: "center" },
  stepBadgeText: { fontSize: 12, fontWeight: "800" },

  dotsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  dot: { height: 10, borderRadius: 5, alignItems: "center", justifyContent: "center" },

  cameraArea: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 280 },
  pulseRing: { position: "absolute", width: 240, height: 306, borderRadius: 150, borderWidth: 2 },
  frame: { width: 250, height: 322, borderRadius: 150, borderWidth: 2, alignItems: "center", justifyContent: "center", position: "relative" },
  bracket: { position: "absolute", width: 30, height: 30, borderWidth: 3 },
  bTL: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0 },
  bTR: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0 },
  bBL: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0 },
  bBR: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0 },
  frameInner: { width: 172, height: 228, borderRadius: 86, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  badgeWrap: { position: "absolute", bottom: 14, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99 },
  labelBadge: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99 },
  labelBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  instructionCard: { marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderWidth: 1, borderRadius: 18, marginBottom: 10 },
  instructionIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  instructionBody: { flex: 1, gap: 4 },
  instructionTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  instructionText: { color: "rgba(255,255,255,0.68)", fontSize: 13, lineHeight: 18 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  statusPillText: { fontSize: 11, fontWeight: "800" },

  tipRow: { flexDirection: "row", justifyContent: "center", gap: 18, paddingHorizontal: 20, marginBottom: 10 },
  tipItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  tipText: { color: "rgba(255,255,255,0.56)", fontSize: 12 },

  feedbackBox: { marginHorizontal: 20, marginBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  feedbackTextWrap: { flex: 1, gap: 2 },
  feedbackTitle: { fontSize: 13, fontWeight: "800" },
  feedbackBody: { fontSize: 12, lineHeight: 17 },

  aiStatusBar: { marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 18, borderWidth: 1 },
  aiStatusIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  aiStatusTextWrap: { flex: 1, gap: 2 },
  aiStatusTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  aiStatusBody: { color: "rgba(255,255,255,0.68)", fontSize: 12, lineHeight: 17 },
  aiStatusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  aiStatusBadgeText: { fontSize: 11, fontWeight: "800" },
});
