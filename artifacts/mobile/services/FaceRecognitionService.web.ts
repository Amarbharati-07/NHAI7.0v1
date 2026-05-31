export interface FaceDetection {
  topLeft: [number, number];
  bottomRight: [number, number];
  landmarks: Array<[number, number]>;
  probability: number;
}

export interface RecognitionResult {
  matched: boolean;
  workerId: string | null;
  workerIdCode: string | null;
  workerName: string | null;
  confidence: number;
  faceDetected: boolean;
}

export async function initModels(): Promise<void> {}

export function isReady(): boolean {
  return false;
}

export async function detectFace(_imageUri: string): Promise<FaceDetection | null> {
  return null;
}

export async function registerWorkerFace(
  _workerId: number,
  _workerIdCode: string,
  _workerName: string,
  _imageUri: string,
  _pose: string = "front",
): Promise<void> {}

export async function loadStoredEmbeddings(): Promise<void> {}

export async function identifyFromCamera(
  _imageUri: string,
  _threshold = 0.72,
): Promise<RecognitionResult> {
  return {
    matched: false,
    workerId: null,
    workerIdCode: null,
    workerName: null,
    confidence: 0,
    faceDetected: false,
  };
}

export function simulateScan(workerList: Array<{ id: string; workerIdCode: string; fullName: string; department: string }>): RecognitionResult & { department: string } {
  const first = workerList[0];
  if (!first) {
    return {
      matched: false,
      workerId: null,
      workerIdCode: null,
      workerName: null,
      confidence: 0,
      faceDetected: false,
      department: "",
    };
  }

  return {
    matched: true,
    workerId: first.id,
    workerIdCode: first.workerIdCode,
    workerName: first.fullName,
    confidence: 0.98,
    faceDetected: true,
    department: first.department,
  };
}
