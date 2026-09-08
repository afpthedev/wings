import type { LectureEngine, LectureLanguage, QualityMode, ModelProgress } from "./types";
import { WHISPER_MODELS } from "./types";

type WorkerOut =
  | { type: "progress"; status: string; file?: string; progress?: number }
  | { type: "ready"; device: string }
  | { type: "result"; id: string; text: string; language?: string }
  | { type: "error"; id?: string; message: string };

export function createWhisperEngine(options: {
  quality: QualityMode;
  language: LectureLanguage;
  preferWebGpu: boolean;
}): LectureEngine {
  let worker: Worker | null = null;
  let loadPromise: Promise<void> | null = null;
  let queue = Promise.resolve();
  const pending = new Map<string, {
    resolve: (value: { text: string; language?: string }) => void;
    reject: (error: Error) => void;
  }>();
  let progressHandler: ((progress: ModelProgress) => void) | null = null;

  const ensureWorker = () => {
    if (worker) return worker;
    const instance = new Worker(new URL("../../workers/whisperWorker.ts", import.meta.url), {
      type: "module",
    });
    instance.onmessage = ({ data }: MessageEvent<WorkerOut>) => {
      if (data.type === "progress") {
        progressHandler?.({ status: data.status, file: data.file, progress: data.progress });
        return;
      }
      if (data.type === "ready") {
        pending.get("load")?.resolve({ text: data.device });
        pending.delete("load");
        return;
      }
      if (data.type === "result") {
        pending.get(data.id)?.resolve({ text: data.text, language: data.language });
        pending.delete(data.id);
        return;
      }
      if (data.type === "error") {
        const error = new Error(data.message);
        if (data.id && pending.has(data.id)) {
          pending.get(data.id)?.reject(error);
          pending.delete(data.id);
          return;
        }
        pending.get("load")?.reject(error);
        pending.delete("load");
      }
    };
    instance.onerror = (event) => {
      const error = new Error(event.message || "Whisper worker failed.");
      for (const job of pending.values()) job.reject(error);
      pending.clear();
    };
    worker = instance;
    return instance;
  };

  const load = async (onProgress?: (progress: ModelProgress) => void) => {
    if (loadPromise) return loadPromise;
    progressHandler = onProgress ?? null;
    loadPromise = new Promise<void>((resolve, reject) => {
      pending.set("load", {
        resolve: () => resolve(),
        reject,
      });
      ensureWorker().postMessage({
        type: "load",
        model: WHISPER_MODELS[options.quality].id,
        device: options.preferWebGpu ? "webgpu" : "wasm",
        language: options.language,
      });
    }).finally(() => {
      progressHandler = null;
    });
    return loadPromise;
  };

  return {
    id: "whisper",
    load,
    transcribe(input) {
      const run = async () => {
        await load();
        const id = `asr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        return new Promise<{ text: string; language?: string }>((resolve, reject) => {
          pending.set(id, { resolve, reject });
          ensureWorker().postMessage(
            {
              type: "transcribe",
              id,
              audio: input.pcm,
              language: options.language,
            },
            [input.pcm.buffer],
          );
        });
      };
      const job = queue.then(run, run);
      queue = job.then(
        () => undefined,
        () => undefined,
      );
      return job;
    },
    stop() {
      for (const job of pending.values()) job.reject(new Error("Lecture stopped."));
      pending.clear();
      worker?.postMessage({ type: "dispose" });
      worker?.terminate();
      worker = null;
      loadPromise = null;
      queue = Promise.resolve();
    },
  };
}
