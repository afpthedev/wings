import { useState, useEffect } from "react";
import {
  X,
  Plus,
  FolderPlus,
  Check,
  Sparkles,
  BookOpen,
  Code2,
  GraduationCap,
  BarChart3,
  Library,
  Folder,
} from "lucide-react";
import {
  createServerProject,
  getServerTemplates,
  type ProjectTemplate,
} from "@/lib/serverFs/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onProjectCreated: (projectPath: string) => void;
}

const TEMPLATE_ICONS: Record<string, any> = {
  GraduationCap: GraduationCap,
  BarChart3: BarChart3,
  Code2: Code2,
  BookOpen: BookOpen,
  Library: Library,
  FolderPlus: FolderPlus,
};

export function CreateProjectModal({ open, onClose, onProjectCreated }: Props) {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("academic");
  const [projectName, setProjectName] = useState("");
  const [customFoldersText, setCustomFoldersText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      getServerTemplates()
        .then((list) => {
          const uniqueList = Array.from(new Map(list.map((tpl) => [tpl.id, tpl])).values());
          setTemplates(uniqueList);
          if (uniqueList.length > 0 && !selectedTemplateId) {
            setSelectedTemplateId(uniqueList[0].id);
          }
        })
        .catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = projectName.trim();
    if (!cleanName) {
      toast.error("Please provide a project name");
      return;
    }

    const customFolders = customFoldersText
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    setLoading(true);
    try {
      const res = await createServerProject(cleanName, selectedTemplateId, customFolders);
      toast.success(`Project '${cleanName}' created successfully!`, {
        description: `Generated ${res.foldersCreated?.length || 0} directories & ${res.filesCreated?.length || 0} starter files.`,
      });
      setProjectName("");
      setCustomFoldersText("");
      onClose();
      onProjectCreated(res.projectPath);
    } catch (err: any) {
      toast.error(err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-surface-1 border border-border-strong rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent-strong/10 text-accent-strong">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-display font-semibold text-foreground">Create New Project</h2>
              <p className="text-xs text-ink-2">Scaffold an organized project structure directly on your Contabo server</p>
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

        <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Project Name */}
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-widest text-ink-2 font-medium">
              Project Name
            </label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Brain-Tumor-MRI-Classification or Thesis-Study-2026"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-accent-strong font-mono"
            />
            <span className="text-[11px] text-ink-3">
              Will create a folder inside your workspace: <span className="font-mono text-accent-strong">workspace/{projectName || "my-project"}</span>
            </span>
          </div>

          {/* Template Selection */}
          <div className="space-y-3">
            <label className="text-xs font-mono uppercase tracking-widest text-ink-2 font-medium">
              Choose Project Type & Structure
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {templates.map((tpl) => {
                const IconComponent = TEMPLATE_ICONS[tpl.icon] || FolderPlus;
                const isSelected = tpl.id === selectedTemplateId;

                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={cn(
                      "flex flex-col text-left p-3.5 rounded-lg border transition-all relative",
                      isSelected
                        ? "border-accent-strong bg-accent-strong/5 shadow-sm"
                        : "border-border-subtle bg-surface-1 hover:border-border hover:bg-surface-2"
                    )}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3 text-accent-strong">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <IconComponent className={cn("w-4 h-4", isSelected ? "text-accent-strong" : "text-ink-2")} />
                      <span className="text-xs font-semibold text-foreground font-display">{tpl.name}</span>
                    </div>
                    <p className="text-[11px] text-ink-2 leading-relaxed line-clamp-2">{tpl.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template Details / Preview */}
          {selectedTemplate && (
            <div className="rounded-lg border border-border-subtle bg-surface-2/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-ink-1 font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent-strong" />
                  Generated Folder Blueprint
                </span>
                <span className="text-[11px] font-mono text-ink-3">
                  {selectedTemplate.folders.length} directories, {selectedTemplate.files.length} starter files
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
                {selectedTemplate.folders.map((f) => (
                  <div key={f} className="flex items-center gap-1.5 bg-surface-1 px-2.5 py-1 rounded border border-border-subtle text-ink-1">
                    <Folder className="w-3.5 h-3.5 text-accent-strong shrink-0" />
                    <span className="truncate">{f}/</span>
                  </div>
                ))}
              </div>

              {selectedTemplate.files.length > 0 && (
                <div className="pt-2 border-t border-border-subtle/50 text-[11px] font-mono text-ink-2">
                  <span className="text-ink-3">Initial files: </span>
                  {selectedTemplate.files.map((f) => f.path).join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Additional Custom Folders */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-widest text-ink-2">
              Additional Custom Folders (Optional, comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. data/external, benchmarks, slides"
              value={customFoldersText}
              onChange={(e) => setCustomFoldersText(e.target.value)}
              className="w-full bg-background border border-border-subtle rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-ink-3 font-mono"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
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
              disabled={loading || !projectName.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-accent-strong text-accent-strong-foreground text-xs font-mono uppercase tracking-wider font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
            >
              {loading ? (
                <>Scaffolding...</>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
