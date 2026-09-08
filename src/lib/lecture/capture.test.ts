import { describe, expect, it } from "vitest";
import { PCM_WORKLET_URL } from "./capture";

describe("lecture capture worklet", () => {
  it("loads from a same-origin file instead of a blob URL", () => {
    expect(PCM_WORKLET_URL.startsWith("blob:")).toBe(false);
    expect(PCM_WORKLET_URL.startsWith("data:")).toBe(false);
    expect(PCM_WORKLET_URL).toBe("/pcm-capture-worklet.js");
  });
});
