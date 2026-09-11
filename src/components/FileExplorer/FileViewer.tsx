import { useState, useEffect, useCallback, useRef } from "react";
import {
  Save,
  Download,
  FileText,
  FileCode,
  Image as ImageIcon,
  Check,
  RefreshCw,
  HardDrive,
  ExternalLink,
} from "lucide-react";
import {
  readServerFile,
  writeServerFile,
  getServerZipUrl,
  type ServerFileContent,
} from "@/lib/serverFs/client";
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
      <div className="flex-1 flex items-center justify-center h-full text-ink-3 font-mono text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Reading file from server...
      </div>
    );
  }

  if (!fileData) return null;

  const isImage = fileData.mimeType.startsWith("image/");
  const pathParts = fileData.path.split("/");
  const fileName = pathParts.pop() || fileData.path;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* File Header Bar */}
      <div className="h-12 border-b border-border-subtle bg-surface-1 px-4 flex items-center justify-between shrink-0 select-none">
        {/* Breadcrumb Path */}
        <div className="flex items-center gap-2 min-w-0 font-mono text-xs">
          <HardDrive className="w-4 h-4 text-accent-strong shrink-0" />
          <span className="text-ink-3">workspace /</span>
          {pathParts.map((p, i) => (
            <span key={i} className="text-ink-2 truncate">
              {p} /
            </span>
          ))}
          <span className="font-semibold text-foreground truncate flex items-center gap-1.5">
            {fileName}
            {isDirty && (
              <span className="w-2 h-2 rounded-full bg-accent-strong animate-pulse inline-block" title="Unsaved changes" />
            )}
          </span>
          <span className="text-[10px] text-ink-3 ml-2 border-l border-border-subtle pl-2">
            {formatBytes(fileData.size)}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!fileData.isBinary && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all",
                isDirty
                  ? "bg-accent-strong text-accent-strong-foreground font-semibold hover:opacity-90 shadow-xs"
                  : "text-ink-3 hover:text-foreground bg-surface-2 opacity-60"
              )}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving..." : isDirty ? "Save (Ctrl+S)" : "Saved"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => window.open(getServerZipUrl(fileData.path), "_blank")}
            title="Download file"
            className="p-1.5 rounded text-ink-2 hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main File Content Body */}
      <div className="flex-1 overflow-auto bg-background p-4">
        {isImage ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <div className="p-2 border border-border-subtle rounded-xl bg-surface-1 shadow-md max-w-full max-h-[80vh] overflow-auto">
              <img
                src={`data:${fileData.mimeType};base64,${fileData.content}`}
                alt={fileName}
                className="max-w-full max-h-[70vh] object-contain rounded"
              />
            </div>
            <div className="mt-3 text-xs font-mono text-ink-3">
              {fileName} ({formatBytes(fileData.size)})
            </div>
          </div>
        ) : fileData.isBinary ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4 font-mono">
            <FileText className="w-12 h-12 text-ink-3" />
            <div>
              <p className="text-sm font-semibold text-foreground">{fileName}</p>
              <p className="text-xs text-ink-3 mt-1">Binary file ({fileData.mimeType})</p>
            </div>
            <button
              type="button"
              onClick={() => window.open(getServerZipUrl(fileData.path), "_blank")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-foreground text-xs font-mono transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Binary File
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col font-mono text-sm max-w-5xl mx-auto">
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
              className="w-full flex-1 bg-transparent border-0 resize-none text-foreground placeholder:text-ink-3 focus:outline-none leading-relaxed p-2 font-mono text-xs sm:text-sm selection:bg-accent-strong/30"
            />
          </div>
        )}
      </div>
    </div>
  );
}
