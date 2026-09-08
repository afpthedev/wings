import { detectLectureCapabilities } from "./capabilities";
import { startCapture, type CaptureHandle } from "./capture";
import { createLectureEngine } from "./engine";
import type { LectureEngine, LecturePrefs, LectureStatus, ModelProgress, TranscriptChunk } from "./types";

export type LectureSessionHandlers = {
  onPartial: (text: string) => void;
  onChunk: (chunk: TranscriptChunk) => void;
  onStatus: (status: LectureStatus) => void;
  onProgress: (progress: ModelProgress) => void;
  onError: (error: Error) => void;
  onEngine: (engineId: LectureEngine["id"]) => void;
};

export type LectureSession = {
  startedAt: number;
  stop: () => Promise<void>;
};

function newChunkId(): string {
  return `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function startLectureSession(
  prefs: LecturePrefs,
  handlers: LectureSessionHandlers,
): Promise<LectureSession> {
  const caps = detectLectureCapabilities();
  if (!caps.microphone) {
    throw new Error("Microphone access is not available in this browser.");
  }

  handlers.onStatus("loading-model");
  const engine = await createLectureEngine({
    preference: prefs.engine,
    caps,
    quality: prefs.quality,
    language: prefs.language,
  });
  handlers.onEngine(engine.id);

  try {
    await engine.load?.((progress) => handlers.onProgress(progress));
  } catch (error) {
    engine.stop();
    throw error instanceof Error ? error : new Error("Could not load the transcription model.");
  }

  const startedAt = Date.now();
  let capture: CaptureHandle | null = null;
  let closed = false;
  let transcribeQueue = Promise.resolve();

  const emitText = (text: string, startTime: number, endTime: number, language?: string) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const chunk: TranscriptChunk = {
      id: newChunkId(),
      startTime,
      endTime,
      text: trimmed,
      language,
    };
    handlers.onChunk(chunk);
  };

  if (engine.startLive && engine.id === "speech") {
    engine.startLive({
      onPartial: handlers.onPartial,
      onFinal: (chunk) => handlers.onChunk(chunk),
      onError: handlers.onError,
    });
  } else if (engine.id !== "none") {
    capture = await startCapture(prefs.deviceId, (pcmChunk) => {
      transcribeQueue = transcribeQueue.then(async () => {
        if (closed || !engine.transcribe) return;
        handlers.onPartial("Transcribing…");
        try {
          const result = await engine.transcribe({
            pcm: pcmChunk.pcm,
            sampleRate: pcmChunk.sampleRate,
            language: prefs.language,
          });
          emitText(result.text, pcmChunk.startMs, pcmChunk.endMs, result.language);
        } catch (error) {
          if (!closed) {
            handlers.onError(error instanceof Error ? error : new Error("Transcription failed."));
          }
        } finally {
          handlers.onPartial("");
        }
      });
    });
  }

  handlers.onStatus("recording");

  return {
    startedAt,
    stop: async () => {
      if (closed) return;
      closed = true;
      handlers.onStatus("stopping");
      await capture?.stop();
      await transcribeQueue.catch(() => undefined);
      engine.stop();
      handlers.onPartial("");
      handlers.onStatus("stopped");
    },
  };
}
