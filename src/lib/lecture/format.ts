import { countWords } from "@/lib/documentStats";
import { RAW_TRANSCRIPT_HEADING, type TranscriptChunk } from "./types";

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatDurationWords(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function pageHasRawTranscriptHeading(markdown: string): boolean {
  return /(?:^|\n)## Raw Transcript(?:\s|$)/.test(markdown);
}

export function formatChunkLine(chunk: TranscriptChunk): string {
  const text = chunk.text.replace(/\s+/g, " ").trim();
  return `[${formatClock(chunk.startTime)}] ${text}`;
}

export function markdownForNewChunks(
  pageMarkdown: string,
  chunks: TranscriptChunk[],
  headingAlreadyInserted: boolean,
): { markdown: string; headingPresent: boolean } {
  const lines = chunks
    .map(formatChunkLine)
    .filter((line) => line.replace(/^\[[^\]]+]\s*/, "").trim().length > 0);
  const headingPresent = headingAlreadyInserted || pageHasRawTranscriptHeading(pageMarkdown);
  if (lines.length === 0) return { markdown: "", headingPresent };
  const body = lines.join("\n\n");
  return {
    markdown: headingPresent ? body : `${RAW_TRANSCRIPT_HEADING}\n\n${body}`,
    headingPresent: true,
  };
}

export function shouldInsertTranscriptMarkdown(markdown: string): boolean {
  return markdown.trim().length > 0;
}

export function countTranscriptWords(chunks: TranscriptChunk[]): number {
  return countWords(chunks.map((chunk) => chunk.text).join(" "));
}
