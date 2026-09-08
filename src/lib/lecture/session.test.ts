import { afterEach, describe, expect, it } from "vitest";
import { createLectureEngine, setLectureEngineOverride } from "./engine";
import { shouldInsertTranscriptMarkdown } from "./format";
import type { LectureEngine } from "./types";

const silentCaps = {
  microphone: false,
  webgpu: false,
  wasm: false,
  speechRecognition: false,
};

describe("lecture engine factory", () => {
  afterEach(() => {
    setLectureEngineOverride(null);
  });

  it("returns the injected engine even when the browser cannot transcribe", async () => {
    const fake: LectureEngine = {
      id: "whisper",
      async transcribe() {
        return { text: "hello" };
      },
      stop() {
        /* test double */
      },
    };
    setLectureEngineOverride(fake);
    const engine = await createLectureEngine({
      preference: "speech",
      caps: silentCaps,
      quality: "fast",
      language: "en",
    });
    expect(engine).toBe(fake);
    expect(await engine.transcribe?.({
      pcm: new Float32Array([0]),
      sampleRate: 16_000,
      language: "en",
    })).toEqual({ text: "hello" });
  });

  it("returns a none engine when nothing can run", async () => {
    const engine = await createLectureEngine({
      preference: "whisper",
      caps: silentCaps,
      quality: "fast",
      language: "auto",
    });
    expect(engine.id).toBe("none");
    expect(await engine.transcribe?.({
      pcm: new Float32Array([0]),
      sampleRate: 16_000,
      language: "auto",
    })).toEqual({ text: "" });
  });
});

describe("lecture stop without chunks", () => {
  it("cannot emit an empty save payload", () => {
    expect(shouldInsertTranscriptMarkdown("")).toBe(false);
    expect(shouldInsertTranscriptMarkdown("   \n")).toBe(false);
  });
});
