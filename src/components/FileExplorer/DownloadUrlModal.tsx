import { useState } from "react";
import {
  X,
  Download,
  Link,
  Folder,
  CheckCircle2,
  HardDrive,
  Loader2,
} from "lucide-react";
import { downloadServerUrl } from "@/lib/serverFs/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  defaultFolder?: string;
  onClose: () => void;
  onDownloaded: (savedPath: string) => void;
}

export function DownloadUrlModal({ open, defaultFolder = "", onClose, onDownloaded }: Props) {
  const [url, setUrl] = useState("");
  const [targetFolder, setTargetFolder] = useState(defaultFolder);
  const [customFileName, setCustomFileName] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const isGoogleDrive = url.includes("drive.google.com");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      toast.error("Please enter a valid URL");
      return;
    }

    setLoading(true);
    try {
      toast.info("Downloading file directly onto Contabo server disk...");
      const res = await downloadServerUrl(cleanUrl, targetFolder.trim(), customFileName.trim() || undefined);
      
      const sizeMb = (res.size / (1024 * 1024)).toFixed(2);
      toast.success(`Downloaded '${res.filename}' (${sizeMb} MB) directly to server!`, {
        description: `Saved at ${res.savedPath}`,
      });

      setUrl("");
      setCustomFileName("");
      onClose();
      onDownloaded(res.savedPath);
    } catch (err: any) {
      toast.error(err.message || "Failed to download from URL");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-surface-1 border border-border-strong rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent-strong/10 text-accent-strong">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-display font-semibold text-foreground">Download to Server Disk</h2>
              <p className="text-xs text-ink-2">Fetch web & Google Drive links directly to your Contabo workspace</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-ink-2 hover:text-foreground rounded-md hover:bg-surface-3 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* URL Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-widest text-ink-2 font-medium flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5" />
              File URL or Google Drive Link
            </label>
            <input
              type="url"
              autoFocus
              required
              placeholder="https://drive.google.com/file/d/... or https://example.com/dataset.csv"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-accent-strong font-mono"
            />
            {isGoogleDrive && (
              <div className="flex items-center gap-1.5 text-[11px] text-accent-strong font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Google Drive share link detected! Server will download it directly.
              </div>
            )}
          </div>

          {/* Destination Folder */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-widest text-ink-2 font-medium flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5" />
              Target Folder in Workspace
            </label>
            <input
              type="text"
              placeholder="e.g. data/raw or papers or leave empty for root"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-ink-3 font-mono"
            />
            <span className="text-[10px] text-ink-3 font-mono">
              Folder will be automatically created on the server if it does not exist yet.
            </span>
          </div>

          {/* Custom Filename (Optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-widest text-ink-2 font-medium">
              Custom Filename (Optional)
            </label>
            <input
              type="text"
              placeholder="Leave blank to detect automatically from URL or header"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-ink-3 font-mono"
            />
          </div>

          {/* Info Card */}
          <div className="rounded-lg border border-border-subtle bg-surface-2/40 p-3.5 text-xs text-ink-2 flex items-start gap-2.5 leading-relaxed">
            <HardDrive className="w-4 h-4 text-accent-strong shrink-0 mt-0.5" />
            <span>
              The file is streamed directly from the remote server into your Contabo server disk at datacenter speed, saving your local bandwidth.
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-mono text-ink-2 hover:text-foreground rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-accent-strong text-accent-strong-foreground text-xs font-mono uppercase tracking-wider font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Start Download
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
