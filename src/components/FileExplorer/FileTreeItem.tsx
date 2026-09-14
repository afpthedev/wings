import { useState, useRef, useEffect } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Trash2,
  Edit2,
  Download,
  Link,
  Archive,
  Volume2,
  Video,
} from "lucide-react";
import type { FsItem } from "@/lib/serverFs/client";
import { getServerZipUrl } from "@/lib/serverFs/client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  item: FsItem;
  depth?: number;
  activePath: string | null;
  onSelectFile: (path: string) => void;
  onNewFileInFolder: (folderPath: string) => void;
  onNewFolderInFolder: (folderPath: string) => void;
  onDownloadUrlToFolder: (folderPath: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  draggingPath: string | null;
  setDraggingPath: (path: string | null) => void;
  dropTargetPath: string | null;
  setDropTargetPath: React.Dispatch<React.SetStateAction<string | null>>;
  onMoveItem: (sourcePath: string, targetFolderPath: string) => void;
}

function getFileIcon(ext: string) {
  switch (ext.toLowerCase()) {
    case "md":
    case "txt":
      return <FileText className="w-4 h-4 text-accent-strong shrink-0" />;
    case "py":
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "json":
    case "sql":
    case "sh":
    case "html":
    case "css":
    case "yaml":
    case "yml":
      return <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />;
    case "csv":
    case "tsv":
    case "xlsx":
      return <FileSpreadsheet className="w-4 h-4 text-amber-400 shrink-0" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "gif":
    case "webp":
      return <ImageIcon className="w-4 h-4 text-purple-400 shrink-0" />;
    case "zip":
    case "tar":
    case "gz":
      return <Archive className="w-4 h-4 text-orange-400 shrink-0" />;
    case "pdf":
      return <FileText className="w-4 h-4 text-rose-500 shrink-0" />;
    case "mp3":
    case "wav":
    case "ogg":
    case "m4a":
    case "aac":
    case "flac":
      return <Volume2 className="w-4 h-4 text-violet-400 shrink-0" />;
    case "mp4":
    case "webm":
    case "mov":
    case "mkv":
      return <Video className="w-4 h-4 text-blue-400 shrink-0" />;
    default:
      return <FileText className="w-4 h-4 text-ink-3 shrink-0" />;
  }
}

export function FileTreeItem({
  item,
  depth = 0,
  activePath,
  onSelectFile,
  onNewFileInFolder,
  onNewFolderInFolder,
  onDownloadUrlToFolder,
  onRename,
  onDelete,
  draggingPath,
  setDraggingPath,
  dropTargetPath,
  setDropTargetPath,
  onMoveItem,
}: Props) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isActive = activePath === item.path;
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isDragging = draggingPath === item.path;
  const isDropTarget = dropTargetPath === item.path;

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.isDirectory) {
      setExpanded((prev) => !prev);
    } else {
      onSelectFile(item.path);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.path);
    setDraggingPath(item.path);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggingPath(null);
    setDropTargetPath(null);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!draggingPath || draggingPath === item.path) return;
    // Don't allow dropping into own subfolder if dragging a folder
    if (item.path.startsWith(`${draggingPath}/`)) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetPath(item.path);

    // Auto-expand folder on drag hover
    if (item.isDirectory && !expanded && !hoverTimerRef.current) {
      hoverTimerRef.current = setTimeout(() => {
        setExpanded(true);
      }, 500);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setDropTargetPath((prev) => (prev === item.path ? null : prev));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    const source = draggingPath || e.dataTransfer.getData("text/plain");
    setDropTargetPath(null);
    setDraggingPath(null);

    if (!source || source === item.path) return;

    // If item is directory, target folder is item.path
    // If item is file, target folder is the file's parent folder
    const targetFolder = item.isDirectory
      ? item.path
      : item.path.includes("/")
      ? item.path.substring(0, item.path.lastIndexOf("/"))
      : "";

    onMoveItem(source, targetFolder);
  };

  return (
    <div className="select-none">
      <div
        onClick={handleClick}
        draggable={true}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        className={cn(
          "group flex items-center justify-between py-1.5 pr-2 rounded-md text-xs cursor-pointer transition-all relative",
          isActive
            ? "bg-accent-strong/15 text-accent-strong font-medium"
            : "text-ink-1 hover:bg-surface-2/60 hover:text-foreground",
          isDragging && "opacity-40",
          isDropTarget && "ring-1 ring-accent-strong bg-accent-strong/20 text-accent-strong font-medium"
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {item.isDirectory ? (
            <span className="text-ink-3 hover:text-foreground shrink-0">
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          {item.isDirectory ? (
            expanded ? (
              <FolderOpen className="w-4 h-4 text-accent-strong shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-accent-strong/70 shrink-0" />
            )
          ) : (
            getFileIcon(item.extension)
          )}

          <span className="truncate font-mono text-[11px]">{item.name}</span>
        </div>

        {/* Action menu on hover / active */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1 rounded text-ink-3 hover:text-foreground hover:bg-surface-3 transition-colors"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-surface-1 border-border-strong font-mono text-xs">
              {item.isDirectory ? (
                <>
                  <DropdownMenuItem
                    onClick={() => onNewFileInFolder(item.path)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New File Here
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onNewFolderInFolder(item.path)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    New Folder Here
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDownloadUrlToFolder(item.path)}
                    className="flex items-center gap-2 cursor-pointer text-accent-strong"
                  >
                    <Link className="w-3.5 h-3.5" />
                    Download URL Here
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => window.open(getServerZipUrl(item.path), "_blank")}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download as ZIP
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : (
                <>
                  <DropdownMenuItem
                    onClick={() => window.open(getServerZipUrl(item.path), "_blank")}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download File
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={() => onRename(item.path)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(item.path)}
                className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Recursive subdirectories */}
      {item.isDirectory && expanded && item.children && item.children.length > 0 && (
        <div className="border-l border-border-subtle/50 ml-3.5">
          {item.children.map((child) => (
            <FileTreeItem
              key={child.path}
              item={child}
              depth={depth + 1}
              activePath={activePath}
              onSelectFile={onSelectFile}
              onNewFileInFolder={onNewFileInFolder}
              onNewFolderInFolder={onNewFolderInFolder}
              onDownloadUrlToFolder={onDownloadUrlToFolder}
              onRename={onRename}
              onDelete={onDelete}
              draggingPath={draggingPath}
              setDraggingPath={setDraggingPath}
              dropTargetPath={dropTargetPath}
              setDropTargetPath={setDropTargetPath}
              onMoveItem={onMoveItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
