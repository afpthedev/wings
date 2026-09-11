import { useState, useEffect } from "react";
import { TaskItem, TaskPriority, TaskStatus } from "@/lib/tasks/types";
import type { Entry } from "@/lib/journal";
import { getEntryTitle } from "@/lib/journal";
import { X, Calendar, Flag, Folder, Tag, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (task: Partial<TaskItem> & { title: string }) => void;
  taskToEdit?: TaskItem | null;
  entries: Entry[];
  defaultStatus?: TaskStatus;
}

export function TaskModal({
  open,
  onClose,
  onSave,
  taskToEdit,
  entries,
  defaultStatus = "todo",
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [pageId, setPageId] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  useEffect(() => {
    if (taskToEdit) {
      setTitle(taskToEdit.title);
      setDescription(taskToEdit.description || "");
      setStatus(taskToEdit.status);
      setPriority(taskToEdit.priority);
      setDueDate(taskToEdit.dueDate || "");
      setPageId(taskToEdit.pageId || "");
      setTagsInput(taskToEdit.tags?.join(", ") || "");
    } else {
      setTitle("");
      setDescription("");
      setStatus(defaultStatus);
      setPriority("none");
      setDueDate("");
      setPageId("");
      setTagsInput("");
    }
  }, [taskToEdit, defaultStatus, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);

    let pageTitle: string | undefined = undefined;
    if (pageId) {
      const found = entries.find((en) => en.id === pageId);
      if (found) pageTitle = getEntryTitle(found);
    }

    onSave({
      ...(taskToEdit ? { id: taskToEdit.id } : {}),
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      dueDate: dueDate || undefined,
      pageId: pageId || undefined,
      pageTitle,
      tags,
    });
    onClose();
  };

  const setQuickDate = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setDueDate(d.toISOString().slice(0, 10));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-card text-card-foreground border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-accent-strong" />
            <h2 className="text-sm font-semibold tracking-tight">
              {taskToEdit ? "Edit Task" : "Create New Task"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              Task Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g. Conduct literature review and clean dataset"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              Description (optional)
            </label>
            <textarea
              rows={2}
              placeholder="Add extra context, notes or criteria..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Status & Priority Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="todo">📋 To Do</option>
                <option value="in_progress">⚡ In Progress</option>
                <option value="done">✅ Done</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <Flag className="w-3.5 h-3.5" /> Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="none">Normal (None)</option>
                <option value="p1">🔴 P1 - Urgent</option>
                <option value="p2">🟠 P2 - High</option>
                <option value="p3">🔵 P3 - Low</option>
              </select>
            </div>
          </div>

          {/* Due Date & Quick Pickers */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Due Date
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setQuickDate(0)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-[11px] font-medium transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(1)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-[11px] font-medium transition-colors"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => setQuickDate(7)}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-[11px] font-medium transition-colors"
              >
                +1 Week
              </button>
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate("")}
                  className="px-2 py-1.5 text-muted-foreground hover:text-foreground text-[11px]"
                  title="Clear Date"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Project / Linked Page */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Folder className="w-3.5 h-3.5" /> Link to Project / Note
            </label>
            <select
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">No Project (Standalone)</option>
              {entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  📄 {getEntryTitle(entry) || "Untitled Note"}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" /> Tags (comma-separated)
            </label>
            <input
              type="text"
              placeholder="research, dataset, paper"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-xs shadow-xs hover:bg-primary/90 transition-colors"
            >
              {taskToEdit ? "Save Changes" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
