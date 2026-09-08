import { describe, expect, it } from "vitest";
import { detectLectureCapabilities, resolveTranscriptionEngine, whisperAvailable } from "./capabilities";

const allOn = {
  mediaDevices: true,
  gpu: true,
  wasm: true,
  speechRecognition: true,
};

describe("detectLectureCapabilities", () => {
  it("maps environment flags", () => {
    expect(detectLectureCapabilities(allOn)).toEqual({
      microphone: true,
      webgpu: true,
      wasm: true,
      speechRecognition: true,
    });
  });
});

describe("resolveTranscriptionEngine", () => {
  it("prefers on-device Whisper when WASM is available", () => {
    const caps = detectLectureCapabilities(allOn);
    expect(whisperAvailable(caps)).toBe(true);
    expect(resolveTranscriptionEngine("whisper", caps)).toEqual({
      engine: "whisper",
      onDevice: true,
    });
  });

  it("falls back to browser speech when Whisper cannot run", () => {
    const caps = detectLectureCapabilities({
      ...allOn,
      wasm: false,
      gpu: false,
    });
    expect(resolveTranscriptionEngine("whisper", caps)).toEqual({
      engine: "speech",
      onDevice: false,
    });
  });

  it("returns none when no engine can run", () => {
    const caps = detectLectureCapabilities({
      mediaDevices: true,
      gpu: false,
      wasm: false,
      speechRecognition: false,
    });
    expect(resolveTranscriptionEngine("whisper", caps)).toEqual({
      engine: "none",
      onDevice: false,
    });
  });

  it("honours an explicit browser-speech preference", () => {
    const caps = detectLectureCapabilities(allOn);
    expect(resolveTranscriptionEngine("speech", caps)).toEqual({
      engine: "speech",
      onDevice: false,
    });
  });
});
