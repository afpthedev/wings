import type { LectureCapabilities, LectureLanguage, QualityMode, LectureEngine } from "./types";
import { resolveTranscriptionEngine } from "./capabilities";
import { createSpeechRecognitionEngine } from "./speechRecognitionEngine";

export type { LectureEngine };

let override: LectureEngine | null = null;

export function setLectureEngineOverride(engine: LectureEngine | null): void {
  override = engine;
}

export function getLectureEngineOverride(): LectureEngine | null {
  return override;
}

function noneEngine(): LectureEngine {
  return {
    id: "none",
    async load() {
      /* nothing to fetch */
    },
    async transcribe() {
      return { text: "" };
    },
    stop() {
      /* no-op */
    },
  };
}

export async function createLectureEngine(options: {
  preference: "whisper" | "speech";
  caps: LectureCapabilities;
  quality: QualityMode;
  language: LectureLanguage;
}): Promise<LectureEngine> {
  if (override) return override;
  const resolved = resolveTranscriptionEngine(options.preference, options.caps);
  if (resolved.engine === "whisper") {
    const { createWhisperEngine } = await import("./whisperEngine");
    return createWhisperEngine({
      quality: options.quality,
      language: options.language,
      preferWebGpu: options.caps.webgpu,
    });
  }
  if (resolved.engine === "speech") {
    return createSpeechRecognitionEngine(options.language);
  }
  return noneEngine();
}

export function installLectureEngineTestHooks(): void {
  const host = window as {
    __nw_setLectureEngineOverride?: typeof setLectureEngineOverride;
  };
  host.__nw_setLectureEngineOverride = setLectureEngineOverride;
}
