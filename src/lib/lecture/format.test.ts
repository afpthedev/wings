import { describe, expect, it } from "vitest";
import {
  countTranscriptWords,
  formatClock,
  formatDurationWords,
  markdownForNewChunks,
  pageHasRawTranscriptHeading,
  shouldInsertTranscriptMarkdown,
} from "./format";
import { RAW_TRANSCRIPT_HEADING, type TranscriptChunk } from "./types";

const chunk = (text: string, startTime = 12_040): TranscriptChunk => ({
  id: "c1",
  startTime,
  endTime: startTime + 1000,
  text,
});

describe("lecture format", () => {
  it("formats elapsed clock time as HH:MM:SS", () => {
    expect(formatClock(0)).toBe("00:00:00");
    expect(formatClock(12_040)).toBe("00:00:12");
    expect(formatClock(3_961_000)).toBe("01:06:01");
  });

  it("formats a human duration", () => {
    expect(formatDurationWords(18_000)).toBe("18s");
    expect(formatDurationWords(3_960_000)).toBe("1h 06m");
  });

  it("detects an existing Raw Transcript heading", () => {
    expect(pageHasRawTranscriptHeading("# Notes\n\n## Raw Transcript\n\nhello")).toBe(true);
    expect(pageHasRawTranscriptHeading("# Notes")).toBe(false);
  });

  it("prepends the heading on the first non-empty chunk", () => {
    const result = markdownForNewChunks("", [chunk("The OS maintains a page table")], false);
    expect(result.markdown).toBe(
      `${RAW_TRANSCRIPT_HEADING}\n\n[00:00:12] The OS maintains a page table`,
    );
    expect(result.headingPresent).toBe(true);
    expect(shouldInsertTranscriptMarkdown(result.markdown)).toBe(true);
  });

  it("does not repeat the heading once it exists", () => {
    const first = markdownForNewChunks("", [chunk("one")], false);
    const second = markdownForNewChunks(`# Page\n\n${first.markdown}`, [chunk("two", 20_000)], first.headingPresent);
    expect(second.markdown).toBe("[00:00:20] two");
    expect(second.markdown.includes(RAW_TRANSCRIPT_HEADING)).toBe(false);
  });

  it("does not produce markdown for empty transcript text", () => {
    const result = markdownForNewChunks("# Notes", [chunk("   ")], false);
    expect(result.markdown).toBe("");
    expect(shouldInsertTranscriptMarkdown(result.markdown)).toBe(false);
  });

  it("counts words across chunks", () => {
    expect(countTranscriptWords([chunk("one two"), chunk("three")])).toBe(3);
  });
});
