import { useState, useEffect, useRef, useCallback } from "react";
import {
  FolderPlus,
  FilePlus,
  RefreshCw,
  Upload,
  Download,
  Search,
  HardDrive,
  Link,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Archive,
} from "lucide-react";
import {
  getServerTree,
  createServerItem,
  renameServerItem,
  deleteServerItem,
  uploadServerFiles,
  getServerZipUrl,
  type FsItem,
} from "@/lib/serverFs/client";
import { FileTreeItem } from "./FileTreeItem";
import { CreateProjectModal } from "./CreateProjectModal";
import { DownloadUrlModal } from "./DownloadUrlModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  activePath: string | null;
  onSelectFile: (path: string) => void;
}

export function FileExplorerSidebar({ activePath, onSelectFile }: Props) {
  const [items, setItems] = useState<FsItem[]>([]);
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  // Modals state
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [downloadUrlOpen, setDownloadUrlOpen] = useState(false);
  const [targetFolderForDownload, setTargetFolderForDownload] = useState("");

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const loadTree = useCallback(async (quiet: boolean = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await getServerTree();
      setItems(data.items);
      setWorkspaceRoot(data.root);
    } catch (err: any) {
      if (!quiet) toast.error(err.message || "Failed to load workspace files");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Actions
  const handleNewFile = async (parentFolder: string = "") => {
    const name = window.prompt("Enter new file name (e.g. notes.md, script.py):");
    if (!name?.trim()) return;

    const relPath = parentFolder ? `${parentFolder}/${name.trim()}` : name.trim();
    try {
      await createServerItem(relPath, false);
      toast.success(`Created file: ${relPath}`);
      await loadTree(true);
      onSelectFile(relPath);
    } catch (err: any) {
      toast.error(err.message || "Failed to create file");
    }
  };

  const handleNewFolder = async (parentFolder: string = "") => {
    const name = window.prompt("Enter new folder name (e.g. data, plots):");
    if (!name?.trim()) return;

    const relPath = parentFolder ? `${parentFolder}/${name.trim()}` : name.trim();
    try {
      await createServerItem(relPath, true);
      toast.success(`Created folder: ${relPath}`);
      await loadTree(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to create folder");
    }
  };

  const handleRename = async (oldPath: string) => {
    const oldName = oldPath.split("/").pop() || "";
    const newName = window.prompt(`Rename '${oldName}' to:`, oldName);
    if (!newName?.trim() || newName === oldName) return;

    const dir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : "";
    const newPath = dir ? `${dir}/${newName.trim()}` : newName.trim();

    try {
      await renameServerItem(oldPath, newPath);
      toast.success(`Renamed to ${newPath}`);
      await loadTree(true);
      if (activePath === oldPath) onSelectFile(newPath);
    } catch (err: any) {
      toast.error(err.message || "Failed to rename");
    }
  };

  const handleDelete = async (targetPath: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete '${targetPath}' from the server?`)) {
      return;
    }

    try {
      await deleteServerItem(targetPath);
      toast.success(`Deleted: ${targetPath}`);
      await loadTree(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const handleMoveItem = async (sourcePath: string, targetFolder: string) => {
    if (!sourcePath) return;

    const fileName = sourcePath.split("/").pop() || "";
    if (!fileName) return;

    const sourceParent = sourcePath.includes("/")
      ? sourcePath.substring(0, sourcePath.lastIndexOf("/"))
      : "";

    if (sourceParent === targetFolder) return;

    if (targetFolder === sourcePath || targetFolder.startsWith(`${sourcePath}/`)) {
      toast.error("Cannot move a folder into itself or its subdirectories");
      return;
    }

    const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

    try {
      await renameServerItem(sourcePath, newPath);
      toast.success(`Moved '${fileName}' to ${targetFolder ? `'${targetFolder}'` : "workspace root"}`);
      await loadTree(true);

      if (activePath === sourcePath) {
        onSelectFile(newPath);
      } else if (activePath && activePath.startsWith(`${sourcePath}/`)) {
        const updated = newPath + activePath.slice(sourcePath.length);
        onSelectFile(updated);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to move item");
    }
  };

  const handleDownloadUrlToFolder = (folderPath: string) => {
    setTargetFolderForDownload(folderPath);
    setDownloadUrlOpen(true);
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const targetFolder = targetFolderForDownload || "";
    try {
      toast.info(`Uploading ${files.length} file(s) to server...`);
      const res = await uploadServerFiles(targetFolder, files);
      toast.success(`Successfully uploaded ${res.uploadedCount} file(s)!`);
      await loadTree(true);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  // Filter items by search
  const filterItem = (item: FsItem, q: string): boolean => {
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.children) {
      return item.children.some((c) => filterItem(c, q));
    }
    return false;
  };

  const filteredItems = search.trim()
    ? items.filter((item) => filterItem(item, search.trim().toLowerCase()))
    : items;

  return (
    <div className="flex flex-col h-full bg-surface-1 select-none overflow-hidden">
      {/* Hidden file upload input */}
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        onChange={handleUploadFiles}
        className="hidden"
      />

      {/* Top Header & Actions */}
      <div className="p-3 border-b border-border-subtle space-y-2.5 bg-surface-1 shrink-0">
        {/* Workspace Title & Create Project Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <HardDrive className="w-4 h-4 text-accent-strong shrink-0" />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-foreground truncate">
              Server Workspace
            </span>
          </div>
          <button
            type="button"
            onClick={() => loadTree()}
            title="Refresh workspace tree"
            className="p-1 rounded text-ink-3 hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Primary "+ Create Project" button */}
        <button
          type="button"
          onClick={() => setCreateProjectOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-accent-strong/10 hover:bg-accent-strong/20 border border-accent-strong/30 text-accent-strong text-xs font-mono uppercase tracking-wider font-medium transition-all shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>+ Create Project</span>
        </button>

        {/* Action icons bar */}
        <div className="flex items-center justify-between pt-1 border-t border-border-subtle/50 text-ink-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNewFile("")}
              title="New File in workspace root"
              className="p-1.5 rounded hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              <FilePlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleNewFolder("")}
              title="New Folder in workspace root"
              className="p-1.5 rounded hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetFolderForDownload("");
                setDownloadUrlOpen(true);
              }}
              title="Download from URL or Google Drive"
              className="p-1.5 rounded hover:text-accent-strong hover:bg-surface-2 transition-colors"
            >
              <Link className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetFolderForDownload("");
                uploadInputRef.current?.click();
              }}
              title="Upload files from computer"
              className="p-1.5 rounded hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.open(getServerZipUrl(""), "_blank")}
            title="Download entire workspace as ZIP"
            className="p-1.5 rounded text-ink-3 hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-ink-3" />
          <input
            type="text"
            placeholder="Search server files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-background border border-border-subtle rounded-md pl-8 pr-2.5 py-1.5 text-xs text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-accent-strong font-mono"
          />
        </div>
      </div>

      {/* Tree Content Area */}
      <div
        className={cn(
          "flex-1 overflow-y-auto p-2 space-y-0.5 transition-colors relative",
          dropTargetPath === "__ROOT__" && "ring-1 ring-inset ring-accent-strong/60 bg-accent-strong/5 rounded-md"
        )}
        onDragOver={(e) => {
          if (!draggingPath) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTargetPath("__ROOT__");
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDropTargetPath((prev) => (prev === "__ROOT__" ? null : prev));
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (draggingPath) {
            handleMoveItem(draggingPath, "");
          }
          setDraggingPath(null);
          setDropTargetPath(null);
        }}
      >
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-3 font-mono space-y-2">
            <HardDrive className="w-8 h-8 mx-auto opacity-30" />
            <p>No files in workspace yet</p>
            <button
              type="button"
              onClick={() => setCreateProjectOpen(true)}
              className="text-accent-strong underline text-[11px]"
            >
              Create your first project
            </button>
          </div>
        ) : (
          <>
            {filteredItems.map((item) => (
              <FileTreeItem
                key={item.path}
                item={item}
                activePath={activePath}
                onSelectFile={onSelectFile}
                onNewFileInFolder={handleNewFile}
                onNewFolderInFolder={handleNewFolder}
                onDownloadUrlToFolder={handleDownloadUrlToFolder}
                onRename={handleRename}
                onDelete={handleDelete}
                draggingPath={draggingPath}
                setDraggingPath={setDraggingPath}
                dropTargetPath={dropTargetPath}
                setDropTargetPath={setDropTargetPath}
                onMoveItem={handleMoveItem}
              />
            ))}
            {draggingPath && (
              <div
                className={cn(
                  "mt-2 py-2 px-3 border border-dashed rounded-md text-center text-[10px] font-mono transition-colors",
                  dropTargetPath === "__ROOT__"
                    ? "border-accent-strong bg-accent-strong/15 text-accent-strong"
                    : "border-border-subtle text-ink-3 hover:text-ink-2"
                )}
              >
                move to workspace root
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onProjectCreated={(projectPath) => {
          loadTree(true);
          onSelectFile(`${projectPath}/notes.md`);
        }}
      />

      <DownloadUrlModal
        open={downloadUrlOpen}
        defaultFolder={targetFolderForDownload}
        onClose={() => setDownloadUrlOpen(false)}
        onDownloaded={(savedPath) => {
          loadTree(true);
          onSelectFile(savedPath);
        }}
      />
    </div>
  );
}
