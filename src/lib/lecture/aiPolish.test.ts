import { describe, it, expect, vi } from "vitest";
import { polishAndSummarizeLecture, hasConfiguredAiProvider } from "./aiPolish";

vi.mock("@/lib/ai/client", () => ({
  generateOnce: vi.fn().mockResolvedValue("# 🎓 Ders Notu & Özet\n\n## 📌 Genel Bakış\nHarika bir ders özeti."),
}));

vi.mock("@/lib/ai/storage", () => ({
  getActiveApiKey: vi.fn().mockReturnValue("mock-api-key"),
  getActiveProvider: vi.fn().mockReturnValue("google"),
}));

vi.mock("./insert", () => ({
  appendLectureMarkdown: vi.fn().mockReturnValue(true),
}));

describe("Lecture AI Polish", () => {
  it("detects configured AI provider", () => {
    expect(hasConfiguredAiProvider()).toBe(true);
  });

  it("handles empty chunks with error", async () => {
    const res = await polishAndSummarizeLecture([]);
    expect(res.success).toBe(false);
    expect(res.error).toBe("Düzenlenecek bir transkript metni bulunamadı.");
  });

  it("processes chunks, generates summary, and appends markdown", async () => {
    const res = await polishAndSummarizeLecture([
      {
        id: "chunk-1",
        startTime: 0,
        endTime: 10000,
        text: "Bugün yapay zeka dersinde makine öğrenimini ve sinir ağlarını inceledik.",
      },
      {
        id: "chunk-2",
        startTime: 10000,
        endTime: 20000,
        text: "Özellikle geriye yayılım algoritması üzerinde durduk.",
      },
    ]);

    expect(res.success).toBe(true);
    expect(res.markdown).toContain("Ders Notu & Özet");
  });
});
