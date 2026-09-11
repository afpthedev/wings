import fs from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { getWorkspaceRoot } from "./fsService.ts";

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  type?: "morning_briefing" | "deadline_alert" | "weekly_digest" | "custom";
}

export interface OutboxMessage {
  id: string;
  to: string;
  subject: string;
  type: string;
  sentAt: string;
  deliveryMode: "resend" | "smtp" | "local_outbox";
  html: string;
  previewText?: string;
}

export interface MailProviderStatus {
  provider: "resend" | "smtp" | "local_outbox";
  isLive: boolean;
  senderAddress: string;
  description: string;
}

// In-memory cache of recent outbox messages for instant retrieval
const outboxMemoryCache: OutboxMessage[] = [];

const APP_URL = process.env.APP_URL || process.env.PUBLIC_APP_URL || "http://localhost:8080";

function getOutboxDir(): string {
  const dir = path.join(getWorkspaceRoot(), ".mail_outbox");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getEnvVar(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const regex = new RegExp(`^${key}=(.*)$`, "m");
      const match = content.match(regex);
      if (match && match[1]) {
        const val = match[1].trim().replace(/^["']|["']$/g, "");
        if (val) {
          process.env[key] = val;
          return val;
        }
      }
    }
  } catch {}
  return undefined;
}

let resendClient: Resend | null = null;
let currentClientKey: string | null = null;

function getResendClient(): Resend | null {
  const apiKey = getEnvVar("RESEND_API_KEY");
  if (!apiKey) return null;
  if (!resendClient || currentClientKey !== apiKey) {
    resendClient = new Resend(apiKey);
    currentClientKey = apiKey;
  }
  return resendClient;
}

function getSmtpConfig() {
  const user = getEnvVar("SMTP_USER");
  const pass = getEnvVar("SMTP_PASS") || getEnvVar("SMTP_PASSWORD");
  if (!user || !pass) return null;

  const host = getEnvVar("SMTP_HOST") || "smtp.gmail.com";
  const port = Number(getEnvVar("SMTP_PORT")) || (host.includes("gmail") ? 465 : 587);
  const secure = port === 465;

  return {
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  };
}

export function getMailProviderStatus(): MailProviderStatus {
  const resendKey = getEnvVar("RESEND_API_KEY");
  if (resendKey) {
    return {
      provider: "resend",
      isLive: true,
      senderAddress: getEnvVar("MAIL_FROM") || "Wings Personal OS <notifications@ahsen.aeolus.dev>",
      description: "Resend API (Canlı)",
    };
  }

  const smtp = getSmtpConfig();
  if (smtp) {
    return {
      provider: "smtp",
      isLive: true,
      senderAddress: getEnvVar("MAIL_FROM") || smtp.auth.user,
      description: `Gmail / SMTP Aktif (${smtp.host})`,
    };
  }

  return {
    provider: "local_outbox",
    isLive: false,
    senderAddress: "Lokal Simülasyon",
    description: "Lokal Geliştirici Modu (Gerçek gönderim için RESEND_API_KEY veya SMTP ekleyin)",
  };
}

/**
 * Dispatches an email via Resend if API key is present,
 * or via SMTP if SMTP credentials are configured,
 * otherwise records it in the local dev outbox for visual in-app inspection.
 */
export async function sendEmail(options: MailOptions): Promise<{
  success: boolean;
  messageId: string;
  mode: "resend" | "smtp" | "local_outbox";
  error?: string;
}> {
  const id = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const resend = getResendClient();
  const smtpConfig = getSmtpConfig();

  let mode: "resend" | "smtp" | "local_outbox" = "local_outbox";
  let deliveryError: string | undefined;

  if (resend) {
    try {
      const fromAddress = getEnvVar("MAIL_FROM") || "Wings Personal OS <notifications@ahsen.aeolus.dev>";
      const res = await resend.emails.send({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.subject,
      });
      if (res.error) {
        deliveryError = res.error.message;
      } else {
        mode = "resend";
      }
    } catch (err: any) {
      deliveryError = err?.message || "Failed to send through Resend";
    }
  } else if (smtpConfig) {
    try {
      const transporter = nodemailer.createTransport(smtpConfig);
      const fromAddress = getEnvVar("MAIL_FROM") || smtpConfig.auth.user;
      await transporter.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.subject,
      });
      mode = "smtp";
    } catch (err: any) {
      deliveryError = err?.message || "Failed to send through SMTP";
    }
  }

  // Always save a copy to the local outbox for in-app preview and audit log
  const outboxEntry: OutboxMessage = {
    id,
    to: options.to,
    subject: options.subject,
    type: options.type || "custom",
    sentAt: new Date().toISOString(),
    deliveryMode: mode,
    html: options.html,
    previewText: options.text || options.subject,
  };

  try {
    const outboxDir = getOutboxDir();
    const filePath = path.join(outboxDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(outboxEntry, null, 2), "utf-8");
  } catch {
    // Non-fatal if disk write fails
  }

  outboxMemoryCache.unshift(outboxEntry);
  if (outboxMemoryCache.length > 50) {
    outboxMemoryCache.pop();
  }

  return {
    success: !deliveryError,
    messageId: id,
    mode,
    error: deliveryError,
  };
}

export function listOutboxMessages(): OutboxMessage[] {
  try {
    const outboxDir = getOutboxDir();
    if (fs.existsSync(outboxDir)) {
      const files = fs
        .readdirSync(outboxDir)
        .filter((f) => f.endsWith(".json"))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 30);

      const items: OutboxMessage[] = [];
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(outboxDir, file), "utf-8");
          items.push(JSON.parse(content));
        } catch {}
      }
      if (items.length > 0) return items;
    }
  } catch {}
  return outboxMemoryCache;
}

export function getOutboxMessage(id: string): OutboxMessage | null {
  const mem = outboxMemoryCache.find((m) => m.id === id);
  if (mem) return mem;

  try {
    const outboxDir = getOutboxDir();
    const filePath = path.join(outboxDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}

  return null;
}

// -------------------------------------------------------------------------
// HTML Email Templates (Dark-friendly, responsive & elegant Wings aesthetic)
// -------------------------------------------------------------------------

function baseEmailWrapper(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f1115;
      color: #e6e8eb;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
    }
    .wrapper {
      width: 100%;
      background-color: #0f1115;
      padding: 32px 12px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #17191e;
      border: 1px solid #282c34;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    }
    .header {
      padding: 24px 28px 20px;
      background: linear-gradient(135deg, #1b1e26 0%, #15171d 100%);
      border-bottom: 1px solid #282c34;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .logo-badge {
      display: inline-block;
      width: 28px;
      height: 28px;
      line-height: 28px;
      text-align: center;
      background: #2563eb;
      color: #ffffff;
      font-weight: 700;
      border-radius: 6px;
      font-size: 14px;
    }
    .brand-title {
      font-size: 16px;
      font-weight: 600;
      color: #ffffff;
      letter-spacing: -0.2px;
    }
    .badge-tag {
      display: inline-block;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      border-radius: 9999px;
      background: rgba(37, 99, 235, 0.15);
      color: #60a5fa;
      margin-left: 8px;
    }
    .content {
      padding: 28px;
    }
    .section-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #9ba1ad;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 12px;
    }
    .card {
      background: #1e222b;
      border: 1px solid #2d323d;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 10px;
    }
    .task-title {
      font-size: 14px;
      font-weight: 500;
      color: #f3f4f6;
      margin: 0 0 4px;
    }
    .task-meta {
      font-size: 12px;
      color: #9ba1ad;
    }
    .priority-p1 {
      color: #f87171;
      font-weight: 600;
    }
    .priority-p2 {
      color: #fbbf24;
      font-weight: 600;
    }
    .footer {
      padding: 16px 28px;
      background: #14161b;
      border-top: 1px solid #242831;
      text-align: center;
      font-size: 11px;
      color: #717784;
    }
    .btn {
      display: inline-block;
      background: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 13px;
      margin-top: 18px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="brand">
          <span class="logo-badge">W</span>
          <span class="brand-title">Wings</span>
          <span class="badge-tag">Personal OS</span>
        </div>
      </div>
      <div class="content">
        ${contentHtml}
      </div>
      <div class="footer">
        Wings Personal OS &bull; Contabo Server Hub &bull; Automated Briefing
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function generateMorningBriefingHtml(data: {
  date: string;
  topTasks: Array<{ title: string; priority: string; project?: string }>;
  dueTodayTasks: Array<{ title: string; priority: string; project?: string }>;
  overdueTasks: Array<{ title: string; priority: string }>;
  completionRate?: number;
}): string {
  const overdueBanner =
    data.overdueTasks.length > 0
      ? `<div style="background: rgba(239, 68, 68, 0.12); border: 1px solid #7f1d1d; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 600; color: #f87171; margin-bottom: 4px;">
            ⚠️ ${data.overdueTasks.length} Overdue Task${data.overdueTasks.length > 1 ? "s" : ""}
          </div>
          <div style="font-size: 12px; color: #fca5a5;">
            ${data.overdueTasks.map((t) => t.title).join(", ")}
          </div>
        </div>`
      : "";

  const p1List =
    data.topTasks.length > 0
      ? data.topTasks
          .map(
            (t) => `
        <div class="card" style="border-left: 3px solid #ef4444;">
          <div class="task-title">🎯 ${t.title}</div>
          <div class="task-meta">
            <span class="priority-p1">[P1 High Priority]</span>
            ${t.project ? ` &bull; 📁 ${t.project}` : ""}
          </div>
        </div>`
          )
          .join("")
      : `<div class="card" style="color: #9ba1ad; font-size: 13px;">No critical P1 focus tasks set for today.</div>`;

  const dueList =
    data.dueTodayTasks.length > 0
      ? data.dueTodayTasks
          .map(
            (t) => `
        <div class="card" style="border-left: 3px solid #3b82f6;">
          <div class="task-title">📋 ${t.title}</div>
          <div class="task-meta">
            Priority: ${t.priority.toUpperCase()}
            ${t.project ? ` &bull; 📁 ${t.project}` : ""}
          </div>
        </div>`
          )
          .join("")
      : `<div class="card" style="color: #9ba1ad; font-size: 13px;">Nothing scheduled specifically for today.</div>`;

  const body = `
    <h2 style="font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 6px; color: #ffffff;">
      Good Morning! ☀️
    </h2>
    <p style="font-size: 13px; color: #9ba1ad; margin-top: 0; margin-bottom: 22px;">
      Here is your daily briefing and focus plan for <strong>${data.date}</strong>.
    </p>

    ${overdueBanner}

    <div class="section-title">Today's Focus (Rule of 3)</div>
    ${p1List}

    <div style="margin-top: 24px;" class="section-title">Due Today</div>
    ${dueList}

    <div style="text-align: center; margin-top: 26px;">
      <a href="${APP_URL}" class="btn">Open Wings Workspace &rarr;</a>
    </div>
  `;

  return baseEmailWrapper(`Daily Briefing - ${data.date}`, body);
}

export function generateDeadlineAlertHtml(data: {
  taskTitle: string;
  dueDate: string;
  priority: string;
  project?: string;
  hoursRemaining?: number;
}): string {
  const body = `
    <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid #78350f; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <div style="font-size: 13px; font-weight: 600; color: #fbbf24;">
        ⏰ Deadline Approaching
      </div>
    </div>

    <h2 style="font-size: 18px; font-weight: 600; margin-top: 0; margin-bottom: 12px; color: #ffffff;">
      ${data.taskTitle}
    </h2>

    <div class="card" style="margin-bottom: 20px;">
      <div style="font-size: 13px; color: #d1d5db; margin-bottom: 6px;">
        <strong>Due Date:</strong> ${data.dueDate} ${data.hoursRemaining ? `(~${data.hoursRemaining} hours left)` : ""}
      </div>
      <div style="font-size: 13px; color: #d1d5db; margin-bottom: 6px;">
        <strong>Priority:</strong> <span class="${data.priority === "p1" ? "priority-p1" : "priority-p2"}">${data.priority.toUpperCase()}</span>
      </div>
      ${data.project ? `<div style="font-size: 13px; color: #d1d5db;"><strong>Project:</strong> ${data.project}</div>` : ""}
    </div>

    <div style="text-align: center;">
      <a href="${APP_URL}" class="btn">Review & Complete in Wings</a>
    </div>
  `;

  return baseEmailWrapper(`Reminder: ${data.taskTitle}`, body);
}

export function generateWeeklyDigestHtml(data: {
  weekRange: string;
  completedCount: number;
  totalActiveCount: number;
  completionRate: number;
  highlights: string[];
}): string {
  const highlightsHtml =
    data.highlights.length > 0
      ? data.highlights
          .map((h) => `<li style="margin-bottom: 6px; color: #d1d5db; font-size: 13px;">${h}</li>`)
          .join("")
      : `<li style="color: #9ba1ad; font-size: 13px;">No specific highlights recorded.</li>`;

  const body = `
    <h2 style="font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 6px; color: #ffffff;">
      Weekly Retrospective & Digest 📊
    </h2>
    <p style="font-size: 13px; color: #9ba1ad; margin-top: 0; margin-bottom: 22px;">
      Summary for week <strong>${data.weekRange}</strong>
    </p>

    <div style="display: flex; gap: 12px; margin-bottom: 20px;">
      <div class="card" style="flex: 1; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #10b981;">${data.completedCount}</div>
        <div style="font-size: 11px; color: #9ba1ad; text-transform: uppercase;">Completed</div>
      </div>
      <div class="card" style="flex: 1; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${data.totalActiveCount}</div>
        <div style="font-size: 11px; color: #9ba1ad; text-transform: uppercase;">In Progress</div>
      </div>
      <div class="card" style="flex: 1; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">${data.completionRate}%</div>
        <div style="font-size: 11px; color: #9ba1ad; text-transform: uppercase;">Velocity</div>
      </div>
    </div>

    <div class="section-title">Key Accomplishments</div>
    <ul style="padding-left: 20px; margin-top: 0; margin-bottom: 24px;">
      ${highlightsHtml}
    </ul>

    <div style="text-align: center;">
      <a href="${APP_URL}" class="btn">Plan Next Week &rarr;</a>
    </div>
  `;

  return baseEmailWrapper(`Weekly Digest - ${data.weekRange}`, body);
}
