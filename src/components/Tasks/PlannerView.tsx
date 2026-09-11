import { useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Flame,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Plus,
  Moon,
  RotateCcw,
  Check,
  Star,
  Layers,
} from "lucide-react";
import type { TaskItem, TaskPriority } from "@/lib/tasks/types";
import {
  saveReflection,
  getReflection,
  type PlannerReflection,
} from "@/lib/tasks/plannerStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  tasks: TaskItem[];
  onUpdateTask: (taskId: string, updates: Partial<TaskItem>) => void;
  onToggleStatus: (taskId: string) => void;
  onOpenNewTask: (defaultDate?: string) => void;
  onOpenReminders: () => void;
}

export function PlannerView({
  tasks,
  onUpdateTask,
  onToggleStatus,
  onOpenNewTask,
  onOpenReminders,
}: Props) {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [isRetrospectiveOpen, setIsRetrospectiveOpen] = useState(false);
  const [energyScore, setEnergyScore] = useState<number>(4);
  const [blockersText, setBlockersText] = useState("");
  const [rolloverChecked, setRolloverChecked] = useState(true);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Compute 7 days for the active window
  const days = useMemo(() => {
    const list: Array<{ dateStr: string; dayName: string; dayNum: number; isToday: boolean }> = [];
    const base = new Date();
    base.setDate(base.getDate() + currentWeekOffset * 7);

    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const str = d.toISOString().split("T")[0];
      list.push({
        dateStr: str,
        dayName: d.toLocaleDateString("tr-TR", { weekday: "short" }),
        dayNum: d.getDate(),
        isToday: str === todayStr,
      });
    }
    return list;
  }, [currentWeekOffset, todayStr]);

  // Tasks mapped by date
  const tasksByDate = useMemo(() => {
    const map: Record<string, TaskItem[]> = {};
    for (const t of tasks) {
      if (t.dueDate) {
        if (!map[t.dueDate]) map[t.dueDate] = [];
        map[t.dueDate].push(t);
      }
    }
    return map;
  }, [tasks]);

  // Today's Rule of 3 (Top 3 P1 tasks)
  const ruleOfThree = useMemo(() => {
    return tasks
      .filter((t) => t.status !== "done" && (t.dueDate === todayStr || t.priority === "p1"))
      .slice(0, 3);
  }, [tasks, todayStr]);

  // Overdue tasks
  const overdueTasks = useMemo(() => {
    return tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < todayStr);
  }, [tasks, todayStr]);

  // Backlog (unscheduled)
  const unscheduledTasks = useMemo(() => {
    return tasks.filter((t) => t.status !== "done" && !t.dueDate);
  }, [tasks]);

  const handleMoveToTomorrow = (taskId: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    onUpdateTask(taskId, { dueDate: tomorrowStr });
    toast.success("Görev yarına taşındı");
  };

  const handleMoveToToday = (taskId: string) => {
    onUpdateTask(taskId, { dueDate: todayStr });
    toast.success("Görev bugüne eklendi");
  };

  const handleSaveRetrospective = (e: React.FormEvent) => {
    e.preventDefault();
    const completedToday = tasks.filter(
      (t) => t.status === "done" && t.completedAt && t.completedAt.startsWith(todayStr)
    );

    const unfinishedToday = tasks.filter(
      (t) => t.status !== "done" && t.dueDate && t.dueDate <= todayStr
    );

    const rolledOverIds: string[] = [];
    if (rolloverChecked) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];
      for (const t of unfinishedToday) {
        onUpdateTask(t.id, { dueDate: tomorrowStr });
        rolledOverIds.push(t.id);
      }
    }

    const reflection: PlannerReflection = {
      date: todayStr,
      completedTaskIds: completedToday.map((t) => t.id),
      rolledOverTaskIds: rolledOverIds,
      blockers: blockersText,
      energyScore,
      createdAt: new Date().toISOString(),
    };

    saveReflection(reflection);
    setIsRetrospectiveOpen(false);
    toast.success("Günün retrospektifi kaydedildi! 🌙", {
      description: rolloverChecked
        ? `${unfinishedToday.length} tamamlanmayan görev yarına aktarıldı.`
        : "Gününüz başarıyla kapatıldı.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Rule of 3 + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Rule of 3 (Daily Focus) */}
        <div className="lg:col-span-8 p-5 rounded-2xl border border-border-subtle bg-gradient-to-r from-surface-1 via-surface-2/40 to-surface-1 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Flame className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-mono uppercase tracking-widest text-foreground font-semibold">
                Günün 3 Kritik Odağı (Rule of 3)
              </h3>
            </div>
            <span className="text-[11px] text-ink-3">
              {ruleOfThree.length}/3 Belirlendi
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[0, 1, 2].map((idx) => {
              const task = ruleOfThree[idx];
              if (task) {
                return (
                  <div
                    key={task.id}
                    className="p-3 rounded-xl border border-accent-strong/20 bg-accent-strong/5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold">
                          P1
                        </span>
                        {task.pageTitle && (
                          <span className="text-[10px] text-ink-3 truncate max-w-[100px]">
                            📁 {task.pageTitle}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-foreground line-clamp-2">
                        {task.title}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleStatus(task.id)}
                      className="mt-2.5 text-[11px] text-accent-strong hover:underline flex items-center gap-1 self-start"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Tamamla
                    </button>
                  </div>
                );
              }
              return (
                <button
                  key={`empty_${idx}`}
                  type="button"
                  onClick={() => onOpenNewTask(todayStr)}
                  className="p-3 rounded-xl border border-dashed border-border-subtle bg-surface-2/20 hover:bg-surface-2/50 text-ink-3 hover:text-foreground text-xs flex flex-col items-center justify-center gap-1 min-h-[90px] transition-colors"
                >
                  <Plus className="w-4 h-4 opacity-50" />
                  <span>#{idx + 1} Odak Görevi Ekle</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Retrospective & Reminders Action Card */}
        <div className="lg:col-span-4 p-5 rounded-2xl border border-border-subtle bg-surface-1 flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-foreground flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4 text-accent-strong" />
              Retrospektif & Akıllı Bildirimler
            </div>
            <p className="text-xs text-ink-2 leading-relaxed">
              Günün sonunda tamamlananları inceleyin, sarkanları yarına aktarın ve sabah hatırlatma maillerini yönetin.
            </p>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => setIsRetrospectiveOpen(true)}
              className="flex-1 px-3 py-2 bg-accent-strong hover:bg-accent-strong/90 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Moon className="w-3.5 h-3.5" /> Günü Kapat
            </button>
            <button
              type="button"
              onClick={onOpenReminders}
              className="px-3 py-2 bg-surface-2 hover:bg-surface-3 text-foreground text-xs font-semibold rounded-lg border border-border-subtle transition-colors flex items-center gap-1.5"
              title="Mail & Cron Ayarları"
            >
              <Clock className="w-3.5 h-3.5" /> Cron & Mail
            </button>
          </div>
        </div>
      </div>

      {/* 7-Day Horizon Navigation Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-accent-strong" />
          <h3 className="text-sm font-display font-semibold text-foreground">
            7 Günlük Zaman Çizelgesi
          </h3>
          <span className="text-xs text-ink-3">
            ({days[0]?.dateStr} – {days[6]?.dateStr})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrentWeekOffset((p) => p - 1)}
            className="p-1.5 rounded-lg border border-border-subtle bg-surface-1 hover:bg-surface-2 text-ink-2 transition-colors"
            title="Önceki Hafta"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentWeekOffset(0)}
            className="px-2.5 py-1 text-xs rounded-lg border border-border-subtle bg-surface-1 hover:bg-surface-2 text-foreground font-medium transition-colors"
          >
            Bugün
          </button>
          <button
            type="button"
            onClick={() => setCurrentWeekOffset((p) => p + 1)}
            className="p-1.5 rounded-lg border border-border-subtle bg-surface-1 hover:bg-surface-2 text-ink-2 transition-colors"
            title="Sonraki Hafta"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 7-Day Columns Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {days.map((day) => {
          const dayTasks = tasksByDate[day.dateStr] || [];
          const activeTasks = dayTasks.filter((t) => t.status !== "done");
          const completedTasks = dayTasks.filter((t) => t.status === "done");

          return (
            <div
              key={day.dateStr}
              className={cn(
                "rounded-xl border flex flex-col min-h-[360px] bg-surface-1 transition-all",
                day.isToday
                  ? "border-accent-strong ring-1 ring-accent-strong/30 shadow-md"
                  : "border-border-subtle hover:border-border"
              )}
            >
              {/* Day Header */}
              <div
                className={cn(
                  "px-3 py-2.5 border-b flex items-center justify-between",
                  day.isToday
                    ? "bg-accent-strong/10 border-accent-strong/30"
                    : "bg-surface-2/40 border-border-subtle"
                )}
              >
                <div>
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase",
                      day.isToday ? "text-accent-strong" : "text-foreground font-display"
                    )}
                  >
                    {day.dayName}
                  </span>
                  <span className="text-[11px] text-ink-3 ml-1.5 font-mono">{day.dayNum}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenNewTask(day.dateStr)}
                  className="p-1 text-ink-3 hover:text-foreground rounded hover:bg-surface-2 transition-colors"
                  title="Bu güne görev ekle"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Day Tasks List */}
              <div className="flex-1 p-2.5 space-y-2 overflow-y-auto">
                {activeTasks.length === 0 && completedTasks.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center p-3 text-[11px] text-ink-3/70">
                    Planlanmış görev yok
                  </div>
                ) : (
                  <>
                    {activeTasks.map((t) => (
                      <div
                        key={t.id}
                        className={cn(
                          "p-2.5 rounded-lg border text-xs bg-surface-2/60 space-y-1.5 relative group hover:border-border transition-colors",
                          t.priority === "p1"
                            ? "border-l-2 border-l-rose-500 border-border-subtle"
                            : "border-border-subtle"
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => onToggleStatus(t.id)}
                            className="mt-0.5 text-ink-3 hover:text-accent-strong transition-colors"
                          >
                            <div className="w-3.5 h-3.5 rounded border border-border-strong" />
                          </button>
                          <span className="font-medium text-foreground line-clamp-2 leading-snug">
                            {t.title}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-ink-3 pt-1">
                          <span className={cn(t.priority === "p1" ? "text-rose-400 font-bold" : "")}>
                            {t.priority.toUpperCase()}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleMoveToTomorrow(t.id)}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-ink-2 hover:text-accent-strong flex items-center gap-0.5 transition-opacity"
                            title="Yarına ertele"
                          >
                            +1 Gün <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {completedTasks.length > 0 && (
                      <div className="pt-2 border-t border-border-subtle/50 space-y-1">
                        <span className="text-[10px] text-ink-3 uppercase tracking-wider font-mono">
                          Bitenler ({completedTasks.length})
                        </span>
                        {completedTasks.map((t) => (
                          <div
                            key={t.id}
                            className="p-1.5 text-[11px] text-ink-3 line-through flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="truncate">{t.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Row: Overdue & Backlog Drawers */}
      {(overdueTasks.length > 0 || unscheduledTasks.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Overdue Drawer */}
          {overdueTasks.length > 0 && (
            <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
                  <AlertTriangle className="w-4 h-4" />
                  Gecikmiş Görevler ({overdueTasks.length})
                </div>
                <button
                  type="button"
                  onClick={() => {
                    overdueTasks.forEach((t) => handleMoveToToday(t.id));
                  }}
                  className="text-[11px] text-rose-300 hover:underline"
                >
                  Hepsini Bugüne Al
                </button>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {overdueTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-2 rounded-lg bg-surface-1 border border-border-subtle flex items-center justify-between text-xs"
                  >
                    <span className="text-foreground truncate mr-2">{t.title}</span>
                    <button
                      type="button"
                      onClick={() => handleMoveToToday(t.id)}
                      className="text-[10px] text-accent-strong hover:underline shrink-0"
                    >
                      Bugüne Al
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unscheduled Backlog Drawer */}
          {unscheduledTasks.length > 0 && (
            <div className="p-4 rounded-xl border border-border-subtle bg-surface-1 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Layers className="w-4 h-4 text-ink-2" />
                  Tarihsiz İşler Havuzu (Backlog - {unscheduledTasks.length})
                </div>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {unscheduledTasks.slice(0, 6).map((t) => (
                  <div
                    key={t.id}
                    className="p-2 rounded-lg bg-surface-2/40 border border-border-subtle flex items-center justify-between text-xs"
                  >
                    <span className="text-foreground truncate mr-2">{t.title}</span>
                    <button
                      type="button"
                      onClick={() => handleMoveToToday(t.id)}
                      className="text-[10px] text-accent-strong hover:underline shrink-0"
                    >
                      Bugüne Planla
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evening Retrospective Modal */}
      {isRetrospectiveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-surface-1 border border-border-strong rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-2/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-accent-strong/10 text-accent-strong">
                  <Moon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-display font-semibold text-foreground">
                    Akşam Kapanışı & Retrospektif
                  </h3>
                  <p className="text-xs text-ink-2">Günü kapatın, kazanımları sabitleyin ve yarını hafifletin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRetrospectiveOpen(false)}
                className="p-1.5 text-ink-2 hover:text-foreground rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRetrospective} className="p-6 space-y-5">
              {/* Energy Score */}
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-widest text-ink-2 font-medium">
                  Günün Verimlilik & Enerji Puanı
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setEnergyScore(score)}
                      className={cn(
                        "flex-1 py-2 rounded-lg border text-sm font-semibold transition-all flex items-center justify-center gap-1",
                        energyScore === score
                          ? "bg-amber-500/15 border-amber-500 text-amber-400"
                          : "border-border-subtle bg-surface-2 text-ink-2 hover:text-foreground"
                      )}
                    >
                      <Star className={cn("w-3.5 h-3.5", energyScore >= score ? "fill-current" : "")} />
                      {score}
                    </button>
                  ))}
                </div>
              </div>

              {/* Blockers & Notes */}
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-widest text-ink-2 font-medium">
                  Seni En Çok Ne Engelledi / Neler Öğrendin?
                </label>
                <textarea
                  rows={3}
                  value={blockersText}
                  onChange={(e) => setBlockersText(e.target.value)}
                  placeholder="Örn: Veri setini temizlemek beklediğimden uzun sürdü, literatür okumaları yarına kaldı..."
                  className="w-full bg-background border border-border rounded-lg p-3 text-xs text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-accent-strong"
                />
              </div>

              {/* Rollover Checkbox */}
              <div className="p-3.5 rounded-xl border border-border-subtle bg-surface-2/40 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="rollover"
                  checked={rolloverChecked}
                  onChange={(e) => setRolloverChecked(e.target.checked)}
                  className="mt-0.5 rounded border-border-strong text-accent-strong focus:ring-0"
                />
                <label htmlFor="rollover" className="text-xs text-foreground cursor-pointer">
                  <strong>Tamamlanmayan görevleri yarına aktar:</strong>
                  <p className="text-[11px] text-ink-2 mt-0.5">
                    Bugüne planlanıp bitirilemeyen görevlerin son teslim tarihi otomatik yarına çekilir.
                  </p>
                </label>
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRetrospectiveOpen(false)}
                  className="px-4 py-2 text-xs text-ink-2 hover:text-foreground"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-accent-strong hover:bg-accent-strong/90 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Günü Kapat & Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
