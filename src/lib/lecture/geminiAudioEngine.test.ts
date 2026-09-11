import { describe, it, expect, vi } from "vitest";
import {
  pcmToWavBase64,
  calculateRms,
  createGeminiAudioEngine,
} from "./geminiAudioEngine";

vi.mock("@/lib/ai/storage", () => ({
  getApiKeyFor: vi.fn().mockReturnValue("mock-gemini-key"),
}));

describe("geminiAudioEngine", () => {
  it("encodes PCM Float32Array into valid base64 WAV with RIFF header", () => {
    const pcm = new Float32Array(1600); // 0.1s at 16kHz
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = Math.sin((2 * Math.PI * 440 * i) / 16000); // 440Hz sine wave
    }
    const base64 = pcmToWavBase64(pcm, 16000);
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(100);

    // Decode and check RIFF header
    const binary = atob(base64);
    expect(binary.slice(0, 4)).toBe("RIFF");
    expect(binary.slice(8, 12)).toBe("WAVE");
    expect(binary.slice(12, 16)).toBe("fmt ");
    expect(binary.slice(36, 40)).toBe("data");
  });

  it("calculates RMS silence correctly", () => {
    const silence = new Float32Array(1000);
    expect(calculateRms(silence)).toBe(0);

    const sound = new Float32Array(1000).fill(0.5);
    expect(calculateRms(sound)).toBeCloseTo(0.5);
  });

  it("skips API call for pure silence", async () => {
    const engine = createGeminiAudioEngine({ language: "tr" });
    const silence = new Float32Array(1600);
    const res = await engine.transcribe!({
      pcm: silence,
      sampleRate: 16000,
      language: "tr",
    });
    expect(res.text).toBe("");
  });
});
