import type { TaskItem } from "./types";

export interface PlannerReflection {
  date: string; // YYYY-MM-DD
  completedTaskIds: string[];
  rolledOverTaskIds: string[];
  blockers?: string;
  energyScore?: number; // 1 to 5
  note?: string;
  createdAt: string;
}

export interface SchedulerApiConfig {
  targetEmail: string;
  morningBriefingEnabled: boolean;
  morningBriefingTime: string;
  deadlineAlertsEnabled: boolean;
  weeklyDigestEnabled: boolean;
  weeklyDigestDay: number;
  weeklyDigestTime: string;
  lastSentDates?: {
    morningBriefing?: string;
    weeklyDigest?: string;
    deadlineAlerts?: Record<string, string>;
  };
}

export interface OutboxEmailItem {
  id: string;
  to: string;
  subject: string;
  type: string;
  sentAt: string;
  deliveryMode: "resend" | "local_outbox";
  html: string;
  previewText?: string;
}

const REFLECTIONS_KEY = "wings_planner_reflections";

export function getReflections(): Record<string, PlannerReflection> {
  try {
    const raw = localStorage.getItem(REFLECTIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getReflection(date: string): PlannerReflection | null {
  const all = getReflections();
  return all[date] || null;
}

export function saveReflection(reflection: PlannerReflection): void {
  const all = getReflections();
  all[reflection.date] = reflection;
  try {
    localStorage.setItem(REFLECTIONS_KEY, JSON.stringify(all));
  } catch {}
}

// -------------------------------------------------------------------------
// Planner & Scheduler API Client
// -------------------------------------------------------------------------

export interface MailProviderStatus {
  provider: "resend" | "smtp" | "local_outbox";
  isLive: boolean;
  senderAddress: string;
  description: string;
}

export async function fetchPlannerConfig(): Promise<{
  config: SchedulerApiConfig;
  outboxCount: number;
  hasResendKey: boolean;
  providerStatus?: MailProviderStatus;
}> {
  const res = await fetch("/api/planner/config");
  if (!res.ok) throw new Error("Failed to load planner config");
  const data = await res.json();
  return {
    config: data.config,
    outboxCount: data.outboxCount || 0,
    hasResendKey: Boolean(data.hasResendKey),
    providerStatus: data.providerStatus,
  };
}

export async function updatePlannerConfig(
  updates: Partial<SchedulerApiConfig>
): Promise<SchedulerApiConfig> {
  const res = await fetch("/api/planner/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update planner config");
  const data = await res.json();
  return data.config;
}

export async function syncTasksToScheduler(tasks: TaskItem[]): Promise<void> {
  try {
    await fetch("/api/planner/sync-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks }),
    });
  } catch {}
}

export async function sendTestReminder(options: {
  type: "morning_briefing" | "deadline_alert" | "weekly_digest";
  targetEmail?: string;
  tasks?: TaskItem[];
}): Promise<{
  success: boolean;
  messageId: string;
  mode: "resend" | "smtp" | "local_outbox";
  error?: string;
}> {
  const res = await fetch("/api/planner/send-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to trigger test reminder");
  }
  return data;
}

export async function fetchMailOutbox(): Promise<OutboxEmailItem[]> {
  const res = await fetch("/api/planner/outbox");
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}
