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

const WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      this.port.postMessage(channel.slice());
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCaptureProcessor);
`;

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
    stream.getTracks().forEach((track) => track.stop());
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
  let workletUrl: string | null = null;

  if (context.audioWorklet) {
    workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    await context.audioWorklet.addModule(workletUrl);
    const worklet = new AudioWorkletNode(context, "pcm-capture");
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => ingest(event.data);
    source.connect(worklet);
    worklet.connect(mute);
    mute.connect(context.destination);
    node = worklet;
  } else {
    const processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      ingest(event.inputBuffer.getChannelData(0));
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    node = processor;
  }

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      flush(true);
      node.disconnect();
      source.disconnect();
      mute.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      if (workletUrl) URL.revokeObjectURL(workletUrl);
      await context.close();
    },
  };
}
