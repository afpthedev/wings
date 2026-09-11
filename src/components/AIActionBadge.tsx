import { useState } from "react";
import {
  Search,
  BookOpen,
  FilePlus,
  PenTool,
  Link,
  CheckSquare,
  Calendar,
  Folder,
  Loader2,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  HardDrive,
  Download,
  Layers,
  FileCode,
} from "lucide-react";
import { ActionStep } from "@/lib/ai/tools/types";
import { cn } from "@/lib/utils";

interface Props {
  action: ActionStep;
  onNavigate?: (pageId: string) => void;
}

function getToolMeta(toolName: string, args: Record<string, any>) {
  switch (toolName) {
    case "search_pages":
      return {
        icon: Search,
        label: `Searched for "${args.query || ""}"`,
        color: "text-blue-500",
      };
    case "read_page":
      return {
        icon: BookOpen,
        label: `Read page "${args.title || args.pageId || ""}"`,
        color: "text-indigo-500",
      };
    case "create_page":
      return {
        icon: FilePlus,
        label: `Created page "${args.title || ""}"`,
        color: "text-emerald-500",
      };
    case "update_page":
      return {
        icon: PenTool,
        label: `Updated page`,
        color: "text-amber-500",
      };
    case "link_pages":
      return {
        icon: Link,
        label: `Linked pages`,
        color: "text-purple-500",
      };
    case "list_tasks":
      return {
        icon: CheckSquare,
        label: `Checked workspace tasks`,
        color: "text-cyan-500",
      };
    case "create_task":
      return {
        icon: CheckSquare,
        label: `Created task "${args.title || ""}"`,
        color: "text-emerald-500",
      };
    case "update_task":
      return {
        icon: CheckSquare,
        label: `Updated task`,
        color: "text-amber-500",
      };
    case "daily_plan":
      return {
        icon: Calendar,
        label: `Generated Daily Plan`,
        color: "text-rose-500",
      };
    case "weekly_plan":
      return {
        icon: Calendar,
        label: `Generated Weekly Plan`,
        color: "text-rose-500",
      };
    case "project_summary":
      return {
        icon: Folder,
        label: `Analyzed project "${args.projectName || ""}"`,
        color: "text-blue-500",
      };
    case "create_project_workspace":
      return {
        icon: HardDrive,
        label: `Created server workspace "${args.projectName || ""}" (${args.template || "default"})`,
        color: "text-emerald-500",
      };
    case "write_server_file":
      return {
        icon: FileCode,
        label: `Wrote server file "${args.filePath || ""}"`,
        color: "text-amber-500",
      };
    case "read_server_file":
      return {
        icon: BookOpen,
        label: `Read server file "${args.filePath || ""}"`,
        color: "text-indigo-500",
      };
    case "download_to_workspace":
      return {
        icon: Download,
        label: `Downloaded file to "${args.targetDir || ""}"`,
        color: "text-blue-500",
      };
    case "list_workspace_files":
      return {
        icon: HardDrive,
        label: `Listed workspace files (${args.path || "root"})`,
        color: "text-purple-500",
      };
    case "link_workspace_to_page":
      return {
        icon: Link,
        label: `Linked workspace to page`,
        color: "text-purple-500",
      };
    case "list_collections":
      return {
        icon: Layers,
        label: `Checked collections`,
        color: "text-cyan-500",
      };
    case "create_collection":
      return {
        icon: Layers,
        label: `Created collection "${args.name || ""}"`,
        color: "text-emerald-500",
      };
    case "add_to_collection":
      return {
        icon: Layers,
        label: `Added page to collection "${args.collectionNameOrId || ""}"`,
        color: "text-emerald-500",
      };
    default:
      return {
        icon: CheckSquare,
        label: `Executed ${toolName}`,
        color: "text-muted-foreground",
      };
  }
}

export function AIActionBadge({ action, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolMeta(action.toolName, action.args);
  const Icon = meta.icon;

  const pageId =
    action.result?.linkedPageId ||
    action.result?.pageId ||
    action.result?.id ||
    action.args?.pageId;
  const canNavigate = Boolean(pageId && onNavigate && action.status === "success");

  return (
    <div className="my-1.5 rounded-lg border border-border/70 bg-card/60 overflow-hidden text-xs transition-all">
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("w-3.5 h-3.5 shrink-0", meta.color)} />
          <span className="font-medium text-foreground truncate">
            {meta.label}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {action.status === "running" && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span>Running</span>
            </span>
          )}
          {action.status === "success" && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-mono">
              <Check className="w-3 h-3" />
              <span>Done</span>
            </span>
          )}
          {action.status === "error" && (
            <span className="flex items-center gap-1 text-[11px] text-destructive font-mono">
              <AlertCircle className="w-3 h-3" />
              <span>Failed</span>
            </span>
          )}

          {canNavigate && (
            <button
              type="button"
              onClick={() => onNavigate!(pageId)}
              className="ml-1 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center gap-1 text-[10px] font-medium"
              title="Open Page"
            >
              <span>Open</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}

          {action.result && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
              title={expanded ? "Hide output" : "View output"}
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Output / Payload */}
      {expanded && action.result && (
        <div className="px-3 py-2 border-t border-border/50 bg-muted/20 font-mono text-[11px] text-muted-foreground overflow-x-auto max-h-40">
          <pre>{JSON.stringify(action.result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
