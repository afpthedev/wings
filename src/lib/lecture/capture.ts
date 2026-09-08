import { concatFloat32, resampleTo16k } from "./audio";
import { CHUNK_DURATION_MS, TARGET_SAMPLE_RATE } from "./types";

export type MicrophoneInfo = {
  deviceId: string;
  label: string;
};

export type PcmChunk = {
  pcm: Float32Array;
  sampleRate: number;
  startMs: number;
  endMs: number;
};

export type CaptureHandle = {
  stop: () => Promise<void>;
};

/** Same-origin classic script. Blob/data worklets are blocked by production CSP. */
export const PCM_WORKLET_URL = "/pcm-capture-worklet.js";

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export async function listMicrophones(): Promise<MicrophoneInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Microphone ${index + 1}`,
    }));
}

function releaseStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

export async function startCapture(
  deviceId: string | null,
  onChunk: (chunk: PcmChunk) => void,
): Promise<CaptureHandle> {
  const constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const Context = audioContextCtor();
  if (!Context) {
    releaseStream(stream);
    throw new Error("Web Audio is not available in this browser.");
  }
  const context = new Context();
  const source = context.createMediaStreamSource(stream);
  const mute = context.createGain();
  mute.gain.value = 0;

  let pending: Float32Array[] = [];
  let pendingSamples = 0;
  let emittedMs = 0;
  let stopped = false;

  const flush = (force: boolean) => {
    const needed = Math.floor((context.sampleRate * CHUNK_DURATION_MS) / 1000);
    if (!force && pendingSamples < needed) return;
    if (pendingSamples === 0) return;
    const raw = concatFloat32(pending);
    pending = [];
    pendingSamples = 0;
    const pcm = resampleTo16k(raw, context.sampleRate);
    const durationMs = Math.round((pcm.length / TARGET_SAMPLE_RATE) * 1000);
    const startMs = emittedMs;
    const endMs = startMs + durationMs;
    emittedMs = endMs;
    onChunk({ pcm, sampleRate: TARGET_SAMPLE_RATE, startMs, endMs });
  };

  const ingest = (samples: Float32Array) => {
    if (stopped || samples.length === 0) return;
    pending.push(new Float32Array(samples));
    pendingSamples += samples.length;
    flush(false);
  };

  let node: AudioWorkletNode | ScriptProcessorNode;

  try {
    if (context.audioWorklet) {
      await context.audioWorklet.addModule(PCM_WORKLET_URL);
      const worklet = new AudioWorkletNode(context, "pcm-capture");
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => ingest(event.data);
      source.connect(worklet);
      worklet.connect(mute);
      mute.connect(context.destination);
      node = worklet;
    } else {
      node = attachScriptProcessor(context, source, mute, ingest);
    }
  } catch {
    try {
      node = attachScriptProcessor(context, source, mute, ingest);
    } catch (error) {
      source.disconnect();
      mute.disconnect();
      releaseStream(stream);
      await context.close().catch(() => undefined);
      throw error instanceof Error ? error : new Error("Could not start microphone capture.");
    }
  }

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      flush(true);
      node.disconnect();
      source.disconnect();
      mute.disconnect();
      releaseStream(stream);
      await context.close();
    },
  };
}

function attachScriptProcessor(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  mute: GainNode,
  ingest: (samples: Float32Array) => void,
): ScriptProcessorNode {
  const processor = context.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event) => {
    ingest(event.inputBuffer.getChannelData(0));
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  return processor;
}
