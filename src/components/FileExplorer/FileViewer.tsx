import { useState, useEffect, useCallback, useRef } from "react";
import {
  Save,
  Download,
  FileText,
  FileCode,
  Image as ImageIcon,
  RefreshCw,
  HardDrive,
  ExternalLink,
  X,
  Eye,
  Edit3,
  Volume2,
  Video,
  File as FileGenericIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  readServerFile,
  writeServerFile,
  getServerFileRawUrl,
  type ServerFileContent,
} from "@/lib/serverFs/client";
import { markdownToHtml } from "@/lib/markdown";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  filePath: string;
  onClose?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileViewer({ filePath, onClose }: Props) {
  const [fileData, setFileData] = useState<ServerFileContent | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [imageZoomFit, setImageZoomFit] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadFile = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);
    try {
      const data = await readServerFile(filePath);
      setFileData(data);
      if (!data.isBinary) {
        setContent(data.content);
        setIsDirty(false);
      }
      const lower = filePath.toLowerCase();
      if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
        setViewMode("edit");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to read file from server");
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  const handleSave = async () => {
    if (!fileData || fileData.isBinary || !isDirty) return;
    setSaving(true);
    try {
      await writeServerFile(fileData.path, content);
      setIsDirty(false);
      toast.success("Saved to server disk!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save file");
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content, isDirty, fileData]);

  // Tab key indent in textarea
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const updated = val.substring(0, start) + "  " + val.substring(end);
      setContent(updated);
      setIsDirty(true);
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    }
  };

  if (loading && !fileData) {
    return (
      <div className="flex-1 flex items-center justify-center h-full text-muted-foreground font-mono text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading file...
      </div>
    );
  }

  if (!fileData) return null;

  const pathParts = fileData.path.split("/");
  const fileName = pathParts.pop() || fileData.path;
  const lowerName = fileName.toLowerCase();
  const rawUrl = getServerFileRawUrl(fileData.path);

  // Detect file categories
  const isPdf =
    fileData.mimeType === "application/pdf" || lowerName.endsWith(".pdf");
  const isImage =
    fileData.mimeType.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(lowerName);
  const isAudio =
    fileData.mimeType.startsWith("audio/") ||
    /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(lowerName);
  const isVideo =
    fileData.mimeType.startsWith("video/") ||
    /\.(mp4|webm|mov|mkv)$/i.test(lowerName);
  const isMarkdown = lowerName.endsWith(".md") || lowerName.endsWith(".markdown");

  // Determine icon
  const renderIcon = () => {
    if (isPdf) return <FileText className="w-4 h-4 text-rose-500 shrink-0" />;
    if (isImage) return <ImageIcon className="w-4 h-4 text-amber-500 shrink-0" />;
    if (isAudio) return <Volume2 className="w-4 h-4 text-violet-500 shrink-0" />;
    if (isVideo) return <Video className="w-4 h-4 text-blue-500 shrink-0" />;
    if (isMarkdown) return <FileText className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (!fileData.isBinary) return <FileCode className="w-4 h-4 text-accent-strong shrink-0" />;
    return <FileGenericIcon className="w-4 h-4 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* File Header Bar */}
      <div className="h-12 border-b border-border bg-surface-1 px-4 flex items-center justify-between shrink-0 select-none gap-3">
        {/* Breadcrumb Path & Info */}
        <div className="flex items-center gap-2 min-w-0 font-mono text-xs overflow-hidden">
          <HardDrive className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground hidden sm:inline">workspace /</span>
          {pathParts.map((p, i) => (
            <span key={i} className="text-muted-foreground truncate hidden md:inline">
              {p} /
            </span>
          ))}
          <div className="flex items-center gap-1.5 min-w-0">
            {renderIcon()}
            <span className="font-semibold text-foreground truncate">{fileName}</span>
            {isDirty && (
              <span
                className="w-2 h-2 rounded-full bg-accent-strong animate-pulse inline-block shrink-0"
                title="Unsaved changes"
              />
            )}
          </div>
          <span className="text-[10px] text-muted-foreground ml-1 border-l border-border pl-2 shrink-0">
            {formatBytes(fileData.size)}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Markdown Toggle: Edit vs Preview */}
          {isMarkdown && (
            <div className="flex items-center bg-surface-2 rounded-lg p-0.5 border border-border">
              <button
                type="button"
                onClick={() => setViewMode("edit")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-colors",
                  viewMode === "edit"
                    ? "bg-background text-foreground shadow-xs font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Edit Markdown"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono transition-colors",
                  viewMode === "preview"
                    ? "bg-background text-foreground shadow-xs font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Preview Markdown"
              >
                <Eye className="w-3 h-3" />
                <span>Preview</span>
              </button>
            </div>
          )}

          {/* Save Button for Editable Text */}
          {!fileData.isBinary && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all",
                isDirty
                  ? "bg-accent-strong text-accent-strong-foreground font-semibold hover:opacity-90 shadow-xs cursor-pointer"
                  : "text-muted-foreground bg-surface-2 opacity-60 cursor-default"
              )}
            >
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {saving ? "Saving..." : isDirty ? "Save (Ctrl+S)" : "Saved"}
              </span>
            </button>
          )}

          {/* Open in New Tab Button */}
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in dedicated tab"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors flex items-center gap-1 text-xs font-mono"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Direct Download Button */}
          <a
            href={rawUrl}
            download={fileName}
            title="Download file"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors flex items-center gap-1 text-xs font-mono"
          >
            <Download className="w-4 h-4" />
          </a>

          {/* Close Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close viewer"
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors ml-1 border-l border-border pl-2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main File Content Body */}
      <div className="flex-1 overflow-hidden bg-background flex flex-col">
        {/* 1. PDF Preview */}
        {isPdf ? (
          <div className="flex-1 flex flex-col h-full p-2 sm:p-4 overflow-hidden bg-surface-1/30">
            <div className="flex-1 w-full h-full rounded-xl overflow-hidden border border-border shadow-md bg-neutral-950 flex flex-col relative">
              <object
                data={`${rawUrl}#toolbar=1&navpanes=1`}
                type="application/pdf"
                className="w-full flex-1 border-0 rounded-xl"
              >
                {/* Fallback iframe */}
                <iframe
                  src={`${rawUrl}#toolbar=1`}
                  title={fileName}
                  className="w-full flex-1 border-0"
                />
                {/* Fallback download prompt if browser blocks embed */}
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 font-mono">
                  <FileText className="w-12 h-12 text-rose-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{fileName}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Browser PDF preview unavailable on this device.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={rawUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-foreground text-xs font-mono transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in New Tab
                    </a>
                    <a
                      href={rawUrl}
                      download={fileName}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-strong text-accent-strong-foreground text-xs font-mono font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </a>
                  </div>
                </div>
              </object>
            </div>
          </div>
        ) : isImage ? (
          /* 2. Image Preview */
          <div className="flex-1 flex flex-col items-center justify-center h-full p-4 sm:p-8 overflow-auto relative">
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-surface-2/80 backdrop-blur-xs p-1 rounded-lg border border-border text-xs font-mono">
              <button
                type="button"
                onClick={() => setImageZoomFit((v) => !v)}
                className="px-2 py-1 rounded hover:bg-surface-3 transition-colors text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
                title={imageZoomFit ? "View original scale" : "Fit to screen"}
              >
                {imageZoomFit ? <ZoomIn className="w-3.5 h-3.5" /> : <ZoomOut className="w-3.5 h-3.5" />}
                <span>{imageZoomFit ? "100%" : "Fit"}</span>
              </button>
            </div>
            <div
              className={cn(
                "p-2 border border-border rounded-xl bg-surface-1 shadow-md max-w-full overflow-auto flex items-center justify-center transition-all",
                imageZoomFit ? "max-h-[80vh]" : "max-h-none"
              )}
            >
              <img
                src={rawUrl}
                alt={fileName}
                className={cn(
                  "object-contain rounded transition-all",
                  imageZoomFit ? "max-w-full max-h-[72vh]" : "max-w-none"
                )}
              />
            </div>
            <div className="mt-3 text-xs font-mono text-muted-foreground flex items-center gap-2">
              <span>{fileName}</span>
              <span>•</span>
              <span>{formatBytes(fileData.size)}</span>
            </div>
          </div>
        ) : isAudio ? (
          /* 3. Audio Preview */
          <div className="flex-1 flex flex-col items-center justify-center p-8 font-mono">
            <div className="max-w-md w-full p-6 border border-border rounded-2xl bg-surface-1 shadow-lg space-y-5 text-center">
              <div className="w-16 h-16 rounded-full bg-violet-500/10 text-violet-500 flex items-center justify-center mx-auto">
                <Volume2 className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Audio playback • {formatBytes(fileData.size)}
                </p>
              </div>
              <audio controls src={rawUrl} className="w-full focus:outline-none" />
            </div>
          </div>
        ) : isVideo ? (
          /* 4. Video Preview */
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 overflow-auto">
            <div className="max-w-4xl w-full border border-border rounded-2xl bg-surface-1 shadow-xl overflow-hidden">
              <video
                controls
                src={rawUrl}
                className="w-full max-h-[75vh] bg-black rounded-t-2xl object-contain"
              />
              <div className="p-3 bg-surface-2 flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span className="truncate">{fileName}</span>
                <span>{formatBytes(fileData.size)}</span>
              </div>
            </div>
          </div>
        ) : fileData.isBinary ? (
          /* 5. Generic Binary File */
          <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-8 space-y-4 font-mono">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-muted-foreground">
              <FileGenericIcon className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{fileName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Binary format ({fileData.mimeType || "Unknown"}) • {formatBytes(fileData.size)}
              </p>
            </div>
            <a
              href={rawUrl}
              download={fileName}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-foreground text-xs font-mono transition-colors border border-border shadow-xs"
            >
              <Download className="w-4 h-4" />
              Download File
            </a>
          </div>
        ) : isMarkdown && viewMode === "preview" ? (
          /* 6. Rendered Markdown Preview */
          <div className="flex-1 overflow-auto p-6 sm:p-10 bg-background">
            <div
              className="max-w-4xl mx-auto prose prose-neutral dark:prose-invert text-sm leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(markdownToHtml(content)),
              }}
            />
          </div>
        ) : (
          /* 7. Monospace Code / Text Editor */
          <div className="flex-1 overflow-auto bg-background p-4 flex flex-col">
            <div className="h-full flex-1 flex flex-col font-mono text-sm max-w-5xl w-full mx-auto">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setIsDirty(true);
                }}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Type file content here..."
                spellCheck={false}
                className="w-full flex-1 bg-transparent border-0 resize-none text-foreground placeholder:text-muted-foreground focus:outline-none leading-relaxed p-2 font-mono text-xs sm:text-sm selection:bg-accent-strong/30"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
