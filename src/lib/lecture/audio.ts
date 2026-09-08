import { TARGET_SAMPLE_RATE } from "./types";

/** Linear resample to 16 kHz so Whisper always sees the rate it was trained on. */
export function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (!input.length) return input;
  if (inputRate === TARGET_SAMPLE_RATE) return input;
  if (inputRate <= 0) return input;
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const src = i * ratio;
    const index = Math.floor(src);
    const next = Math.min(index + 1, input.length - 1);
    const t = src - index;
    output[i] = input[index]! * (1 - t) + input[next]! * t;
  }
  return output;
}

export function concatFloat32(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
