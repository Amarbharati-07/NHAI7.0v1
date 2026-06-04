import { useLocalSearchParams } from "expo-router";
import React from "react";

import FaceFlowCamera from "@/components/FaceFlowCamera";

export default function LivenessDetectionScreen() {
  const params = useLocalSearchParams<{
    workerName?: string;
    workerId?: string;
    department?: string;
    confidence?: string;
  }>();

  return (
    <FaceFlowCamera
      mode="attendance"
      workerName={params.workerName}
      workerId={params.workerId}
      department={params.department}
      confidence={params.confidence}
    />
  );
}
