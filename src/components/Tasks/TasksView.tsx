import { useState, useMemo, useCallback } from "react";
import {
  CheckSquare,
  Plus,
  LayoutList,
  LayoutGrid,
  Search,
  Calendar,
  Flag,
  Folder,
  Tag,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit2,
  MoreVertical,
  RotateCw,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Filter,
  PanelLeft,
  Mail,
} from "lucide-react";
import { useEffect } from "react";
import { TaskItem, TaskPriority, TaskStatus } from "@/lib/tasks/types";
import { useTasks } from "@/lib/tasks/useTasks";
import { parseTaskString, syncTasksFromPages } from "@/lib/tasks/taskStore";
import { TaskModal } from "./TaskModal";
import { PlannerView } from "./PlannerView";
import { EmailReminderModal } from "./EmailReminderModal";
import { syncTasksToScheduler } from "@/lib/tasks/plannerStore";
import type { Entry } from "@/lib/journal";
import { getEntryTitle } from "@/lib/journal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  entries: Entry[];
  userId?: string;
  onNavigate?: (entryId: string) => void;
  onToggleSidebar?: () => void;
}

type ViewMode = "list" | "kanban" | "planner";
type StatusFilter = "all" | "open" | "dueToday" | "overdue" | "done";

export function TasksView({ entries, userId, onNavigate, onToggleSidebar }: Props) {
  const { tasks, stats, addTask, updateTask, removeTask, toggleStatus, refresh } =
    useTasks(userId);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const [quickAddInput, setQuickAddInput] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [modalDefaultStatus, setModalDefaultStatus] = useState<TaskStatus>("todo");

  useEffect(() => {
    if (tasks.length > 0) {
      syncTasksToScheduler(tasks);
    }
  }, [tasks]);

  // Section collapse states in list view
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    done: true, // Completed starts collapsed by default
  });

  const toggleSection = (sec: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  const handleSyncPages = () => {
    const updated = syncTasksFromPages(entries, userId);
    refresh();
    toast.success("Tasks synced from notes", {
      description: `Indexed ${updated.length} total tasks across your workspace.`,
    });
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddInput.trim()) return;

    const parsed = parseTaskString(quickAddInput);
    addTask({
      title: parsed.title,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      tags: parsed.tags,
      pageId: projectFilter !== "all" ? projectFilter : undefined,
      pageTitle:
        projectFilter !== "all"
          ? getEntryTitle(entries.find((en) => en.id === projectFilter)!)
          : undefined,
    });

    setQuickAddInput("");
    toast.success("Task added", { description: parsed.title });
  };

  const openNewTaskModal = (status: TaskStatus = "todo") => {
    setEditingTask(null);
    setModalDefaultStatus(status);
    setIsModalOpen(true);
  };

  const openEditModal = (task: TaskItem) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, title: string) => {
    removeTask(id);
    toast.info("Task deleted", { description: title });
  };

  // Filter tasks
  const todayStr = new Date().toISOString().slice(0, 10);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description?.toLowerCase().includes(q);
        const matchesProject = t.pageTitle?.toLowerCase().includes(q);
        const matchesTags = t.tags?.some((tag) => tag.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDesc && !matchesProject && !matchesTags) {
          return false;
        }
      }

      // Status filter
      if (statusFilter === "open" && t.status === "done") return false;
      if (statusFilter === "done" && t.status !== "done") return false;
      if (statusFilter === "dueToday") {
        if (t.status === "done" || t.dueDate !== todayStr) return false;
      }
      if (statusFilter === "overdue") {
        if (t.status === "done" || !t.dueDate || t.dueDate >= todayStr) return false;
      }

      // Priority filter
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;

      // Project filter
      if (projectFilter !== "all" && t.pageId !== projectFilter) return false;

      return true;
    });
  }, [tasks, searchQuery, statusFilter, priorityFilter, projectFilter, todayStr]);

  // Grouped tasks for List View
  const groupedList = useMemo(() => {
    const overdue: TaskItem[] = [];
    const today: TaskItem[] = [];
    const upcoming: TaskItem[] = [];
    const noDate: TaskItem[] = [];
    const done: TaskItem[] = [];

    for (const t of filteredTasks) {
      if (t.status === "done") {
        done.push(t);
      } else if (!t.dueDate) {
        noDate.push(t);
      } else if (t.dueDate < todayStr) {
        overdue.push(t);
      } else if (t.dueDate === todayStr) {
        today.push(t);
      } else {
        upcoming.push(t);
      }
    }

    return { overdue, today, upcoming, noDate, done };
  }, [filteredTasks, todayStr]);

  // Kanban Columns
  const kanbanColumns = useMemo(() => {
    return {
      todo: filteredTasks.filter((t) => t.status === "todo"),
      in_progress: filteredTasks.filter((t) => t.status === "in_progress"),
      done: filteredTasks.filter((t) => t.status === "done"),
    };
  }, [filteredTasks]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-y-auto">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Toggle Sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-accent-strong" />
            <h1 className="text-base font-bold tracking-tight text-foreground">
              Task Manager
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-mono">
              {stats.total} tasks
            </span>
          </div>
        </div>

        {/* View mode toggle & Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncPages}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Scan notes for - [ ] tasks"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sync Notes</span>
          </button>

          {/* List vs Kanban vs Planner toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-muted border border-border">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                viewMode === "list"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                viewMode === "kanban"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("planner")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                viewMode === "planner"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Calendar className="w-3.5 h-3.5 text-accent-strong" />
              <span>Planner</span>
            </button>
          </div>

          {/* Email Reminders Button */}
          <button
            type="button"
            onClick={() => setIsRemindersOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="E-posta Hatırlatıcıları & Cron"
          >
            <Mail className="w-3.5 h-3.5 text-accent-strong" />
            <span className="hidden sm:inline">Reminders</span>
          </button>

          {/* New Task Button */}
          <button
            type="button"
            onClick={() => openNewTaskModal("todo")}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs shadow-xs hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {/* Total */}
          <div className="p-4 rounded-xl border border-border bg-card/50 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Total Tasks</span>
              <CheckSquare className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              {stats.total}
            </div>
          </div>

          {/* Due Today */}
          <div className="p-4 rounded-xl border border-border bg-card/50 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Due Today</span>
              <Calendar className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-500">
              {stats.dueToday}
            </div>
          </div>

          {/* Overdue */}
          <div
            className={cn(
              "p-4 rounded-xl border shadow-xs flex flex-col justify-between transition-colors",
              stats.overdue > 0
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-border bg-card/50 text-muted-foreground"
            )}
          >
            <div className="flex items-center justify-between text-xs font-medium">
              <span>Overdue</span>
              <AlertTriangle className={cn("w-4 h-4", stats.overdue > 0 && "text-destructive")} />
            </div>
            <div
              className={cn(
                "mt-2 text-2xl font-bold tracking-tight",
                stats.overdue > 0 ? "text-destructive" : "text-foreground"
              )}
            >
              {stats.overdue}
            </div>
          </div>

          {/* Completed */}
          <div className="p-4 rounded-xl border border-border bg-card/50 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold tracking-tight text-emerald-500">
                {stats.done}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {stats.completionRate}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-secondary h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${stats.completionRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Quick Add Bar */}
        <form
          onSubmit={handleQuickAdd}
          className="relative flex items-center bg-card border border-border rounded-xl shadow-xs focus-within:ring-1 focus-within:ring-ring focus-within:border-ring overflow-hidden p-1"
        >
          <div className="pl-3 pr-2 text-muted-foreground">
            <Plus className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={quickAddInput}
            onChange={(e) => setQuickAddInput(e.target.value)}
            placeholder="Add a new task... (e.g. Write methodology section #p1 @today #paper) Press Enter"
            className="flex-1 bg-transparent py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="submit"
            disabled={!quickAddInput.trim()}
            className="px-3.5 py-1.5 mr-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-opacity"
          >
            Add
          </button>
        </form>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Status Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
            {(
              [
                { id: "all", label: "All" },
                { id: "open", label: "Open" },
                { id: "dueToday", label: "Today" },
                { id: "overdue", label: "Overdue" },
                { id: "done", label: "Completed" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                  statusFilter === pill.id
                    ? "bg-foreground text-background"
                    : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Search & Select dropdowns */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Search */}
            <div className="relative min-w-[160px] sm:min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Priority: All</option>
              <option value="p1">🔴 P1 Urgent</option>
              <option value="p2">🟠 P2 High</option>
              <option value="p3">🔵 P3 Low</option>
              <option value="none">⚪ Normal</option>
            </select>

            {/* Project Filter */}
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring max-w-[150px] truncate"
            >
              <option value="all">Project: All</option>
              {entries.map((en) => (
                <option key={en.id} value={en.id}>
                  📄 {getEntryTitle(en)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View Mode Switching */}
        {viewMode === "planner" ? (
          <PlannerView
            tasks={tasks}
            onUpdateTask={updateTask}
            onToggleStatus={toggleStatus}
            onOpenNewTask={(date) => {
              setEditingTask(null);
              setModalDefaultStatus("todo");
              setIsModalOpen(true);
            }}
            onOpenReminders={() => setIsRemindersOpen(true)}
          />
        ) : viewMode === "list" ? (
          <div className="space-y-4">
            {/* Overdue Section */}
            {groupedList.overdue.length > 0 && (
              <TaskSection
                title="Overdue"
                count={groupedList.overdue.length}
                badgeClass="bg-destructive/10 text-destructive border-destructive/20"
                icon={<AlertTriangle className="w-4 h-4 text-destructive" />}
                isCollapsed={collapsedSections.overdue}
                onToggle={() => toggleSection("overdue")}
              >
                {groupedList.overdue.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={() => toggleStatus(t.id)}
                    onEdit={() => openEditModal(t)}
                    onDelete={() => handleDelete(t.id, t.title)}
                    onNavigate={onNavigate}
                  />
                ))}
              </TaskSection>
            )}

            {/* Today Section */}
            {groupedList.today.length > 0 && (
              <TaskSection
                title="Due Today"
                count={groupedList.today.length}
                badgeClass="bg-amber-500/10 text-amber-600 border-amber-500/20"
                icon={<Calendar className="w-4 h-4 text-amber-500" />}
                isCollapsed={collapsedSections.today}
                onToggle={() => toggleSection("today")}
              >
                {groupedList.today.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={() => toggleStatus(t.id)}
                    onEdit={() => openEditModal(t)}
                    onDelete={() => handleDelete(t.id, t.title)}
                    onNavigate={onNavigate}
                  />
                ))}
              </TaskSection>
            )}

            {/* Upcoming Section */}
            {groupedList.upcoming.length > 0 && (
              <TaskSection
                title="Upcoming"
                count={groupedList.upcoming.length}
                badgeClass="bg-blue-500/10 text-blue-600 border-blue-500/20"
                icon={<Clock className="w-4 h-4 text-blue-500" />}
                isCollapsed={collapsedSections.upcoming}
                onToggle={() => toggleSection("upcoming")}
              >
                {groupedList.upcoming.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={() => toggleStatus(t.id)}
                    onEdit={() => openEditModal(t)}
                    onDelete={() => handleDelete(t.id, t.title)}
                    onNavigate={onNavigate}
                  />
                ))}
              </TaskSection>
            )}

            {/* No Date Section */}
            {groupedList.noDate.length > 0 && (
              <TaskSection
                title="No Due Date"
                count={groupedList.noDate.length}
                badgeClass="bg-secondary text-muted-foreground border-border"
                icon={<CheckSquare className="w-4 h-4 text-muted-foreground" />}
                isCollapsed={collapsedSections.noDate}
                onToggle={() => toggleSection("noDate")}
              >
                {groupedList.noDate.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={() => toggleStatus(t.id)}
                    onEdit={() => openEditModal(t)}
                    onDelete={() => handleDelete(t.id, t.title)}
                    onNavigate={onNavigate}
                  />
                ))}
              </TaskSection>
            )}

            {/* Completed Section */}
            {groupedList.done.length > 0 && (
              <TaskSection
                title="Completed"
                count={groupedList.done.length}
                badgeClass="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                isCollapsed={collapsedSections.done}
                onToggle={() => toggleSection("done")}
              >
                {groupedList.done.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={() => toggleStatus(t.id)}
                    onEdit={() => openEditModal(t)}
                    onDelete={() => handleDelete(t.id, t.title)}
                    onNavigate={onNavigate}
                  />
                ))}
              </TaskSection>
            )}

            {filteredTasks.length === 0 && (
              <div className="py-16 text-center border border-dashed border-border rounded-xl">
                <CheckSquare className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground">No tasks found</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  {searchQuery || statusFilter !== "all"
                    ? "Try adjusting your search or filters to see more tasks."
                    : "Add your first task above or click Sync Notes to import existing markdown to-dos."}
                </p>
                <button
                  type="button"
                  onClick={() => openNewTaskModal("todo")}
                  className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-xs hover:bg-primary/90 transition-colors"
                >
                  Create Task
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Kanban Board View */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* To Do Column */}
            <KanbanColumn
              title="To Do"
              status="todo"
              count={kanbanColumns.todo.length}
              onAddTask={() => openNewTaskModal("todo")}
            >
              {kanbanColumns.todo.map((t) => (
                <KanbanCard
                  key={t.id}
                  task={t}
                  onEdit={() => openEditModal(t)}
                  onDelete={() => handleDelete(t.id, t.title)}
                  onMove={(nextStatus) => updateTask(t.id, { status: nextStatus })}
                  onNavigate={onNavigate}
                />
              ))}
            </KanbanColumn>

            {/* In Progress Column */}
            <KanbanColumn
              title="In Progress"
              status="in_progress"
              count={kanbanColumns.in_progress.length}
              onAddTask={() => openNewTaskModal("in_progress")}
            >
              {kanbanColumns.in_progress.map((t) => (
                <KanbanCard
                  key={t.id}
                  task={t}
                  onEdit={() => openEditModal(t)}
                  onDelete={() => handleDelete(t.id, t.title)}
                  onMove={(nextStatus) => updateTask(t.id, { status: nextStatus })}
                  onNavigate={onNavigate}
                />
              ))}
            </KanbanColumn>

            {/* Done Column */}
            <KanbanColumn
              title="Done"
              status="done"
              count={kanbanColumns.done.length}
              onAddTask={() => openNewTaskModal("done")}
            >
              {kanbanColumns.done.map((t) => (
                <KanbanCard
                  key={t.id}
                  task={t}
                  onEdit={() => openEditModal(t)}
                  onDelete={() => handleDelete(t.id, t.title)}
                  onMove={(nextStatus) => updateTask(t.id, { status: nextStatus })}
                  onNavigate={onNavigate}
                />
              ))}
            </KanbanColumn>
          </div>
        )}
      </div>

      {/* Task Edit/Create Modal */}
      <TaskModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(data) => {
          if (editingTask) {
            updateTask(editingTask.id, data);
            toast.success("Task updated");
          } else {
            addTask(data);
            toast.success("Task created");
          }
        }}
        taskToEdit={editingTask}
        entries={entries}
        defaultStatus={modalDefaultStatus}
      />

      {/* Email Reminders & Cron Modal */}
      <EmailReminderModal
        open={isRemindersOpen}
        onClose={() => setIsRemindersOpen(false)}
        tasks={tasks}
      />
    </div>
  );
}

// ---------------- Helper Subcomponents ----------------

function TaskSection({
  title,
  count,
  badgeClass,
  icon,
  isCollapsed,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  badgeClass: string;
  icon: React.ReactNode;
  isCollapsed?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border/80 rounded-xl bg-card/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between bg-muted/20 hover:bg-muted/40 transition-colors text-left font-medium text-xs text-foreground select-none"
      >
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          {icon}
          <span className="font-semibold">{title}</span>
          <span className={cn("text-[10px] px-1.5 py-0.2 rounded-full border font-mono", badgeClass)}>
            {count}
          </span>
        </div>
      </button>

      {!isCollapsed && <div className="divide-y divide-border/50">{children}</div>}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  onNavigate,
}: {
  task: TaskItem;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNavigate?: (id: string) => void;
}) {
  const isDone = task.status === "done";
  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue = !isDone && task.dueDate && task.dueDate < todayStr;
  const isToday = !isDone && task.dueDate === todayStr;

  return (
    <div
      className={cn(
        "group px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors",
        isDone && "opacity-60"
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
          isDone
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-muted-foreground/40 hover:border-foreground"
        )}
      >
        {isDone && <CheckCircle2 className="w-3.5 h-3.5" />}
      </button>

      {/* Priority Pill */}
      {task.priority !== "none" && (
        <span
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold shrink-0",
            task.priority === "p1" && "bg-destructive/15 text-destructive",
            task.priority === "p2" && "bg-amber-500/15 text-amber-600",
            task.priority === "p3" && "bg-blue-500/15 text-blue-600"
          )}
        >
          {task.priority.toUpperCase()}
        </span>
      )}

      {/* Title & Description */}
      <div className="flex-1 min-w-0">
        <div
          onClick={onEdit}
          className={cn(
            "text-xs font-medium cursor-pointer hover:text-accent-strong truncate",
            isDone && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </div>
        {task.description && (
          <p className="text-[11px] text-muted-foreground/80 truncate">{task.description}</p>
        )}
      </div>

      {/* Project Pill */}
      {task.pageId && (
        <button
          type="button"
          onClick={() => onNavigate?.(task.pageId!)}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground shrink-0 max-w-[130px] truncate transition-colors"
          title={`Open project: ${task.pageTitle || "Note"}`}
        >
          <Folder className="w-3 h-3 text-accent-strong shrink-0" />
          <span className="truncate">{task.pageTitle || "Note"}</span>
        </button>
      )}

      {/* Due Date Pill */}
      {task.dueDate && (
        <span
          className={cn(
            "flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-mono shrink-0",
            isOverdue
              ? "bg-destructive/15 text-destructive font-semibold"
              : isToday
              ? "bg-amber-500/15 text-amber-600 font-semibold"
              : "bg-secondary/70 text-muted-foreground"
          )}
        >
          <Calendar className="w-3 h-3" />
          <span>{task.dueDate}</span>
        </span>
      )}

      {/* Tags Chips */}
      {task.tags && task.tags.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {task.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Edit"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function KanbanColumn({
  title,
  status,
  count,
  onAddTask,
  children,
}: {
  title: string;
  status: TaskStatus;
  count: number;
  onAddTask: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col bg-card/40 border border-border rounded-xl p-3 min-h-[450px]">
      {/* Column Header */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground">{title}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary text-muted-foreground font-mono">
            {count}
          </span>
        </div>
        <button
          type="button"
          onClick={onAddTask}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Add task in column"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Column Tasks */}
      <div className="flex-1 space-y-2.5 overflow-y-auto">{children}</div>

      {/* Bottom Add button */}
      <button
        type="button"
        onClick={onAddTask}
        className="mt-3 py-1.5 px-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground text-xs flex items-center justify-center gap-1 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add task</span>
      </button>
    </div>
  );
}

function KanbanCard({
  task,
  onEdit,
  onDelete,
  onMove,
  onNavigate,
}: {
  task: TaskItem;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (next: TaskStatus) => void;
  onNavigate?: (id: string) => void;
}) {
  const isDone = task.status === "done";
  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue = !isDone && task.dueDate && task.dueDate < todayStr;
  const isToday = !isDone && task.dueDate === todayStr;

  return (
    <div className="group p-3 rounded-lg border border-border bg-card shadow-xs hover:shadow-md hover:border-muted-foreground/40 transition-all space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div
          onClick={onEdit}
          className={cn(
            "text-xs font-semibold cursor-pointer hover:text-accent-strong leading-snug",
            isDone && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </div>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            title="Edit"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {task.description && (
        <p className="text-[11px] text-muted-foreground line-clamp-2">{task.description}</p>
      )}

      {/* Metadata pills */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {task.priority !== "none" && (
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold",
              task.priority === "p1" && "bg-destructive/15 text-destructive",
              task.priority === "p2" && "bg-amber-500/15 text-amber-600",
              task.priority === "p3" && "bg-blue-500/15 text-blue-600"
            )}
          >
            {task.priority.toUpperCase()}
          </span>
        )}

        {task.dueDate && (
          <span
            className={cn(
              "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono",
              isOverdue
                ? "bg-destructive/15 text-destructive font-semibold"
                : isToday
                ? "bg-amber-500/15 text-amber-600 font-semibold"
                : "bg-secondary text-muted-foreground"
            )}
          >
            <Calendar className="w-2.5 h-2.5" />
            <span>{task.dueDate}</span>
          </span>
        )}

        {task.pageId && (
          <button
            type="button"
            onClick={() => onNavigate?.(task.pageId!)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground truncate max-w-[120px]"
          >
            <Folder className="w-2.5 h-2.5 text-accent-strong" />
            <span className="truncate">{task.pageTitle || "Note"}</span>
          </button>
        )}
      </div>

      {/* Move Status buttons */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
        {task.status !== "todo" ? (
          <button
            type="button"
            onClick={() =>
              onMove(task.status === "done" ? "in_progress" : "todo")
            }
            className="hover:text-foreground flex items-center gap-0.5"
            title="Move left"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>{task.status === "done" ? "In Progress" : "To Do"}</span>
          </button>
        ) : (
          <span />
        )}

        {task.status !== "done" && (
          <button
            type="button"
            onClick={() =>
              onMove(task.status === "todo" ? "in_progress" : "done")
            }
            className="hover:text-foreground flex items-center gap-0.5 ml-auto"
            title="Move right"
          >
            <span>{task.status === "todo" ? "In Progress" : "Done"}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
