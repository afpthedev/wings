import { markdownToHtml } from "@/lib/markdown";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { shouldInsertTranscriptMarkdown } from "./format";

type EditorChain = {
  focus: (position?: string) => EditorChain;
  insertContent: (content: unknown) => EditorChain;
  run: () => boolean;
};

type MountedEditor = {
  chain: () => EditorChain;
};

function mountedEditor(): MountedEditor | undefined {
  return (window as { __nw_editor?: MountedEditor }).__nw_editor;
}

export function readEditorMarkdown(): string {
  const getMarkdown = (window as { __nw_getMarkdown?: () => string }).__nw_getMarkdown;
  return getMarkdown?.() ?? "";
}

/** Append markdown at the end of the open page. Never replaces existing content. */
export function appendLectureMarkdown(markdown: string): boolean {
  if (!shouldInsertTranscriptMarkdown(markdown)) return false;
  const editor = mountedEditor();
  if (!editor) return false;
  const html = sanitizeHtml(markdownToHtml(markdown));
  if (!html.trim()) return false;
  editor.chain().focus("end").insertContent(html).run();
  return true;
}

export function installLectureTestHooks(): void {
  const host = window as {
    __nw_appendLectureMarkdown?: typeof appendLectureMarkdown;
  };
  host.__nw_appendLectureMarkdown = appendLectureMarkdown;
}
