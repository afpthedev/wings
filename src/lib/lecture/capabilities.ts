import type { LectureCapabilities, EnginePreference, TranscriptionEngineId } from "./types";

export type CapabilityEnv = {
  mediaDevices: boolean;
  gpu: boolean;
  wasm: boolean;
  speechRecognition: boolean;
};

function readBrowserEnv(): CapabilityEnv {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { mediaDevices: false, gpu: false, wasm: false, speechRecognition: false };
  }
  const speech =
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  return {
    mediaDevices: typeof navigator.mediaDevices?.getUserMedia === "function",
    gpu: "gpu" in navigator,
    wasm: typeof WebAssembly !== "undefined",
    speechRecognition: speech,
  };
}

export function detectLectureCapabilities(env: CapabilityEnv = readBrowserEnv()): LectureCapabilities {
  return {
    microphone: env.mediaDevices,
    webgpu: env.gpu,
    wasm: env.wasm,
    speechRecognition: env.speechRecognition,
  };
}

export function whisperAvailable(caps: LectureCapabilities): boolean {
  return caps.wasm;
}

export function resolveTranscriptionEngine(
  preference: EnginePreference,
  caps: LectureCapabilities,
): { engine: TranscriptionEngineId; onDevice: boolean } {
  if (preference === "whisper" && whisperAvailable(caps)) {
    return { engine: "whisper", onDevice: true };
  }
  if (preference === "whisper" && caps.speechRecognition) {
    return { engine: "speech", onDevice: false };
  }
  if (preference === "speech" && caps.speechRecognition) {
    return { engine: "speech", onDevice: false };
  }
  if (whisperAvailable(caps)) {
    return { engine: "whisper", onDevice: true };
  }
  if (caps.speechRecognition) {
    return { engine: "speech", onDevice: false };
  }
  return { engine: "none", onDevice: false };
}

export function engineLabel(engine: TranscriptionEngineId, onDevice: boolean): string {
  if (engine === "whisper") return "On-device Whisper";
  if (engine === "speech") {
    return onDevice ? "Browser speech recognition" : "Browser speech recognition (audio may leave this device)";
  }
  return "Transcription unavailable";
}
