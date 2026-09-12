import { AgentTool, ToolContext } from "./types";
import {
  createEntry,
  updateEntry,
  getEntryTitle,
  Entry,
} from "@/lib/journal";
import { payloadFromMarkdown } from "@/lib/entryContent";
import { getStoredTasks } from "@/lib/tasks/taskStore";
import { currentPlannerWeek, formatWeekRange } from "@/lib/weeklyPlanner";

export const dailyPlanTool: AgentTool<{ date?: string }> = {
  name: "daily_plan",
  description:
    "Generate or update an actionable Daily Plan page in the workspace, automatically aggregating overdue, today's, and high-priority tasks.",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Target date in YYYY-MM-DD format. Defaults to today.",
      },
    },
  },
  async execute({ date }, context) {
    const today = date || new Date().toISOString().slice(0, 10);
    const planTitle = `Daily Plan - ${today}`;

    const tasks = getStoredTasks(context.userId);
    const overdue = tasks.filter(
      (t) => t.status !== "done" && t.dueDate && t.dueDate < today
    );
    const dueToday = tasks.filter(
      (t) => t.status !== "done" && t.dueDate === today
    );
    const highPriority = tasks.filter(
      (t) =>
        t.status !== "done" &&
        t.priority === "p1" &&
        t.dueDate !== today &&
        (!t.dueDate || t.dueDate >= today)
    );
    const regularOpen = tasks.filter(
      (t) =>
        t.status !== "done" &&
        t.priority !== "p1" &&
        t.dueDate !== today &&
        (!t.dueDate || t.dueDate >= today)
    );

    let md = `# ${planTitle}\n\n`;
    md += `> Auto-generated Personal OS Agenda for ${today}\n\n`;

    if (overdue.length > 0) {
      md += `## 🚨 Overdue Actions\n`;
      for (const t of overdue) {
        md += `- [ ] **${t.title}** (due ${t.dueDate})${t.pageTitle ? ` — [[${t.pageTitle}]]` : ""}\n`;
      }
      md += `\n`;
    }

    md += `## 🎯 Today's Priorities\n`;
    if (dueToday.length > 0 || highPriority.length > 0) {
      for (const t of dueToday) {
        md += `- [ ] ${t.title}${t.priority === "p1" ? " #p1" : ""}${t.pageTitle ? ` — [[${t.pageTitle}]]` : ""}\n`;
      }
      for (const t of highPriority) {
        md += `- [ ] **${t.title}** #p1${t.dueDate ? ` (@${t.dueDate})` : ""}${t.pageTitle ? ` — [[${t.pageTitle}]]` : ""}\n`;
      }
    } else {
      md += `- [ ] Review daily inbox & schedule key milestones\n`;
    }
    md += `\n`;

    if (regularOpen.length > 0) {
      md += `## 📋 Other Open Tasks\n`;
      for (const t of regularOpen.slice(0, 8)) {
        md += `- [ ] ${t.title}${t.pageTitle ? ` — [[${t.pageTitle}]]` : ""}\n`;
      }
      md += `\n`;
    }

    md += `## 📝 Daily Notes & Log\n\n- \n`;

    // Check if daily plan note already exists
    const existing = context.allEntries.find(
      (e) => getEntryTitle(e).trim().toLowerCase() === planTitle.toLowerCase()
    );

    let pageId: string;
    if (existing) {
      pageId = existing.id;
      const payload = payloadFromMarkdown(md);
      await updateEntry(pageId, payload);
      const updated: Entry = { ...existing, content: payload.markdown, content_json: payload.json };
      const idx = context.allEntries.findIndex((e) => e.id === pageId);
      if (idx !== -1) context.allEntries[idx] = updated;
      if (context.onUpdateEntry) await context.onUpdateEntry(updated, md);
    } else {
      const ownerId = context.userId || "anonymous";
      const created = await createEntry(ownerId, md, { title: planTitle });
      pageId = created.id;
      context.onCreateEntry(created);
    }

    return {
      success: true,
      pageId,
      title: planTitle,
      stats: {
        overdueCount: overdue.length,
        dueTodayCount: dueToday.length,
        highPriorityCount: highPriority.length,
      },
      message: `Created/updated ${planTitle} with ${overdue.length + dueToday.length + highPriority.length} prioritized tasks.`,
    };
  },
};

export const weeklyPlanTool: AgentTool = {
  name: "weekly_plan",
  description:
    "Generate or update a structured Weekly Planner page, distributing tasks across the current week.",
  parameters: {
    type: "object",
    properties: {},
  },
  async execute({}, context) {
    const curWeek = currentPlannerWeek();
    const title = `Weekly Plan - ${curWeek.title} (${curWeek.rangeLabel})`;

    const tasks = getStoredTasks(context.userId).filter((t) => t.status !== "done");

    let md = `# ${title}\n\n`;
    md += `> Weekly Personal OS Execution Plan: ${curWeek.rangeLabel}\n\n`;

    md += `## 🎯 Weekly Goals & Outcomes\n`;
    md += `- [ ] Goal 1: \n- [ ] Goal 2: \n\n`;

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Weekend"];
    for (const d of days) {
      md += `### ${d}\n`;
      md += `- [ ] \n\n`;
    }

    if (tasks.length > 0) {
      md += `## 📌 Backlog Tasks to Schedule\n`;
      for (const t of tasks.slice(0, 10)) {
        md += `- [ ] ${t.title}${t.priority !== "none" ? ` #${t.priority}` : ""}${t.pageTitle ? ` — [[${t.pageTitle}]]` : ""}\n`;
      }
      md += `\n`;
    }

    const existing = context.allEntries.find(
      (e) => getEntryTitle(e).trim().toLowerCase() === title.toLowerCase()
    );

    let pageId: string;
    if (existing) {
      pageId = existing.id;
      const payload = payloadFromMarkdown(md);
      await updateEntry(pageId, payload);
      const updated: Entry = { ...existing, content: payload.markdown, content_json: payload.json };
      const idx = context.allEntries.findIndex((e) => e.id === pageId);
      if (idx !== -1) context.allEntries[idx] = updated;
      if (context.onUpdateEntry) await context.onUpdateEntry(updated, md);
    } else {
      const ownerId = context.userId || "anonymous";
      const created = await createEntry(ownerId, md, { title });
      pageId = created.id;
      context.onCreateEntry(created);
    }

    return {
      success: true,
      pageId,
      title,
      message: `Created/updated weekly plan "${title}".`,
    };
  },
};

export const projectSummaryTool: AgentTool<{
  projectName?: string;
  pageId?: string;
}> = {
  name: "project_summary",
  description:
    "Analyze a project page: summarize content, calculate task completion metrics, and highlight open items.",
  parameters: {
    type: "object",
    properties: {
      projectName: {
        type: "string",
        description: "Name or title of the project note.",
      },
      pageId: {
        type: "string",
        description: "Unique page ID of the project note.",
      },
    },
  },
  async execute({ projectName, pageId }, context) {
    let entry: Entry | undefined;
    if (pageId) {
      entry = context.allEntries.find((e) => e.id === pageId);
    } else if (projectName) {
      const q = projectName.toLowerCase().trim();
      entry = context.allEntries.find((e) =>
        getEntryTitle(e).toLowerCase().includes(q)
      );
    }

    if (!entry) {
      return { success: false, error: "Project note not found." };
    }

    const title = getEntryTitle(entry);
    const allTasks = getStoredTasks(context.userId);
    const projectTasks = allTasks.filter((t) => t.pageId === entry?.id);
    const doneTasks = projectTasks.filter((t) => t.status === "done");
    const openTasks = projectTasks.filter((t) => t.status !== "done");

    const completionRate =
      projectTasks.length > 0
        ? Math.round((doneTasks.length / projectTasks.length) * 100)
        : 0;

    return {
      success: true,
      projectId: entry.id,
      projectName: title,
      totalTasks: projectTasks.length,
      doneCount: doneTasks.length,
      openCount: openTasks.length,
      completionRate: `${completionRate}%`,
      openTasks: openTasks.map((t) => ({
        title: t.title,
        priority: t.priority,
        dueDate: t.dueDate,
      })),
    };
  },
};

export const sendPlannerEmailTool: AgentTool<{
  type?: "morning_briefing" | "deadline_alert" | "weekly_digest";
  targetEmail?: string;
  customMessage?: string;
}> = {
  name: "send_planner_email",
  description:
    "Dispatches a structured daily briefing, deadline reminder, or weekly digest to the user's email address.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["morning_briefing", "deadline_alert", "weekly_digest"],
        description: "Type of email to dispatch. Defaults to morning_briefing.",
      },
      targetEmail: {
        type: "string",
        description: "Optional recipient email. If omitted, uses the configured target email from settings.",
      },
      customMessage: {
        type: "string",
        description: "Optional personal note or guidance from the agent to include in the email.",
      },
    },
  },
  async execute({ type = "morning_briefing", targetEmail }, context) {
    const tasks = getStoredTasks(context.userId);
    try {
      const res = await fetch("/api/planner/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          targetEmail,
          tasks,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || "Failed to dispatch email." };
      }
      return {
        success: true,
        messageId: data.messageId,
        deliveryMode: data.mode,
        type,
        recipient: targetEmail || "configured default",
        note:
          data.mode === "resend"
            ? "Delivered directly to user's inbox via Resend."
            : "Saved to local dev outbox for in-app preview.",
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to trigger email API" };
    }
  },
};

