import { describe, expect, it } from "vitest";
import { resampleTo16k } from "./audio";

describe("resampleTo16k", () => {
  it("returns the same buffer at 16 kHz", () => {
    const input = new Float32Array([0, 1, 0, -1]);
    expect(resampleTo16k(input, 16_000)).toBe(input);
  });

  it("downsamples a 32 kHz ramp", () => {
    const input = new Float32Array([0, 0.25, 0.5, 0.75, 1, 1, 1, 1]);
    const output = resampleTo16k(input, 32_000);
    expect(output.length).toBe(4);
    expect(output[0]).toBeCloseTo(0);
    expect(output[1]).toBeCloseTo(0.5);
  });

  it("handles an empty buffer", () => {
    expect(resampleTo16k(new Float32Array(), 48_000)).toEqual(new Float32Array());
  });
});
