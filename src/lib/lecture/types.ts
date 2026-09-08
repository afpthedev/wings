export type LectureLanguage = "auto" | "en" | "hi" | "kn";
export type QualityMode = "fast" | "balanced";
export type TranscriptionEngineId = "whisper" | "speech" | "none";
export type EnginePreference = "whisper" | "speech";

export type TranscriptChunk = {
  id: string;
  /** Milliseconds from the start of this recording. */
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  language?: string;
};

export type LecturePrefs = {
  language: LectureLanguage;
  quality: QualityMode;
  engine: EnginePreference;
  deviceId: string | null;
};

export type LectureCapabilities = {
  microphone: boolean;
  webgpu: boolean;
  wasm: boolean;
  speechRecognition: boolean;
};

export type ModelProgress = {
  status: string;
  file?: string;
  progress?: number;
};

export type LectureStatus =
  | "idle"
  | "loading-model"
  | "recording"
  | "stopping"
  | "stopped"
  | "unavailable";

export type LiveHandlers = {
  onPartial: (text: string) => void;
  onFinal: (chunk: TranscriptChunk) => void;
  onError: (error: Error) => void;
};

export type LectureEngine = {
  id: TranscriptionEngineId;
  load?: (onProgress?: (progress: ModelProgress) => void) => Promise<void>;
  transcribe?: (input: {
    pcm: Float32Array;
    sampleRate: number;
    language: LectureLanguage;
  }) => Promise<{ text: string; language?: string }>;
  startLive?: (handlers: LiveHandlers) => void;
  stop: () => void;
};

export const WHISPER_MODELS: Record<QualityMode, { id: string; label: string; bytes: number }> = {
  fast: { id: "onnx-community/whisper-tiny", label: "Fast", bytes: 41_000_000 },
  balanced: { id: "onnx-community/whisper-base", label: "Balanced", bytes: 78_000_000 },
};

export const LANGUAGE_LABELS: Record<LectureLanguage, string> = {
  auto: "Auto detect",
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
};

export const RAW_TRANSCRIPT_HEADING = "## Raw Transcript";
export const TARGET_SAMPLE_RATE = 16_000;
export const CHUNK_DURATION_MS = 10_000;
