import type { LectureLanguage, ModelProgress } from "../lib/lecture/types";
import { WHISPER_MODELS } from "../lib/lecture/types";

type WorkerIn =
  | { type: "load"; model: string; device: "webgpu" | "wasm"; language: LectureLanguage }
  | { type: "transcribe"; id: string; audio: Float32Array; language: LectureLanguage }
  | { type: "dispose" };

type WorkerOut =
  | { type: "progress"; status: string; file?: string; progress?: number }
  | { type: "ready"; device: string }
  | { type: "result"; id: string; text: string; language?: string }
  | { type: "error"; id?: string; message: string };

type AsrPipeline = (
  audio: Float32Array,
  options: { language?: string; task: "transcribe" },
) => Promise<{ text?: string; language?: string } | string>;

let pipelineFn: AsrPipeline | null = null;

async function pickDevice(preferred: "webgpu" | "wasm"): Promise<"webgpu" | "wasm"> {
  if (preferred === "wasm") return "wasm";
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (gpu && (await gpu.requestAdapter())) return "webgpu";
  } catch {
    /* WebGPU missing or blocked */
  }
  return "wasm";
}

function languageOption(language: LectureLanguage): string | undefined {
  if (language === "auto") return undefined;
  return language;
}

async function loadPipeline(model: string, device: "webgpu" | "wasm", onProgress: (data: ModelProgress) => void) {
  const transformers = await import("@huggingface/transformers");
  const env = transformers.env as {
    allowLocalModels?: boolean;
    useBrowserCache?: boolean;
    backends?: { onnx?: { wasm?: { numThreads?: number; proxy?: boolean } } };
  };
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.numThreads = 1;
  }

  const create = transformers.pipeline as unknown as (
    task: "automatic-speech-recognition",
    model: string,
    options: {
      device: "webgpu" | "wasm";
      dtype: "fp16" | "q8";
      progress_callback?: (info: { status?: string; file?: string; progress?: number }) => void;
    },
  ) => Promise<AsrPipeline>;

  try {
    return await create("automatic-speech-recognition", model, {
      device,
      dtype: device === "webgpu" ? "fp16" : "q8",
      progress_callback: (info) => {
        onProgress({
          status: info.status ?? "progress",
          file: info.file,
          progress: info.progress,
        });
      },
    });
  } catch (error) {
    if (device === "webgpu") {
      return await create("automatic-speech-recognition", model, {
        device: "wasm",
        dtype: "q8",
        progress_callback: (info) => {
          onProgress({
            status: info.status ?? "progress",
            file: info.file,
            progress: info.progress,
          });
        },
      });
    }
    throw error;
  }
}

self.onmessage = async (event: MessageEvent<WorkerIn>) => {
  const message = event.data;
  const post = (data: WorkerOut) => self.postMessage(data);

  try {
    if (message.type === "load") {
      const device = await pickDevice(message.device);
      const model = message.model || WHISPER_MODELS.fast.id;
      pipelineFn = await loadPipeline(model, device, (progress) => {
        post({ type: "progress", ...progress });
      });
      post({ type: "ready", device });
      return;
    }

    if (message.type === "transcribe") {
      if (!pipelineFn) throw new Error("Whisper model is not loaded.");
      const language = languageOption(message.language);
      const output = await pipelineFn(message.audio, {
        language,
        task: "transcribe",
      });
      const text = typeof output === "string" ? output : output.text ?? "";
      const detected = typeof output === "string" ? undefined : output.language;
      post({ type: "result", id: message.id, text: text.trim(), language: detected });
      return;
    }

    if (message.type === "dispose") {
      pipelineFn = null;
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    post({
      type: "error",
      id: message.type === "transcribe" ? message.id : undefined,
      message: err.message,
    });
  }
};
