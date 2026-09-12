import { beforeEach, describe, expect, it, vi } from "vitest";

const updateChain = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: () => ({
        eq: updateChain,
      }),
    }),
  },
}));

import { updateEntry } from "./journal";

describe("updateEntry", () => {
  beforeEach(() => {
    updateChain.mockReset();
  });

  it("updates without a returning row (shared editors may not SELECT entries)", async () => {
    updateChain.mockResolvedValue({ error: null });
    await expect(
      updateEntry("entry-id", { markdown: "hello", json: { type: "doc", content: [] } }),
    ).resolves.toBeUndefined();
    expect(updateChain).toHaveBeenCalledWith("id", "entry-id");
  });

  it("propagates Supabase errors", async () => {
    updateChain.mockResolvedValue({ error: { message: "row-level security" } });
    await expect(
      updateEntry("entry-id", { markdown: "hello", json: { type: "doc", content: [] } }),
    ).rejects.toEqual({ message: "row-level security" });
  });

  it("accepts a raw markdown string and converts it to full payload", async () => {
    updateChain.mockResolvedValue({ error: null });
    await expect(updateEntry("entry-id", "## New heading\n\nSome text")).resolves.toBeUndefined();
    expect(updateChain).toHaveBeenCalledWith("id", "entry-id");
  });
});
