import { useLocalSearchParams } from "expo-router";
import React from "react";

import FaceFlowCamera from "@/components/FaceFlowCamera";

export default function GuidedFaceCaptureScreen() {
  const params = useLocalSearchParams<{
    sessionId?: string;
    mode?: "register" | "attendance";
    workerName?: string;
    workerId?: string;
    department?: string;
    confidence?: string;
  }>();

  return (
    <FaceFlowCamera
      mode={params.mode === "attendance" ? "attendance" : "register"}
      sessionId={params.sessionId}
      workerName={params.workerName}
      workerId={params.workerId}
      department={params.department}
      confidence={params.confidence}
    />
  );
}
