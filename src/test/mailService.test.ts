import { describe, it, expect } from "vitest";
import {
  generateMorningBriefingHtml,
  generateDeadlineAlertHtml,
  generateWeeklyDigestHtml,
} from "../../server/mailService";

describe("Mail Service HTML Templates", () => {
  it("generates structured morning briefing HTML", () => {
    const html = generateMorningBriefingHtml({
      date: "2026-09-10",
      topTasks: [{ title: "Finish Thesis Outline", priority: "p1", project: "Ahmet-123" }],
      dueTodayTasks: [{ title: "Run model evaluation", priority: "p2" }],
      overdueTasks: [{ title: "Fix dataset labels", priority: "p1" }],
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Daily Briefing - 2026-09-10");
    expect(html).toContain("Finish Thesis Outline");
    expect(html).toContain("Run model evaluation");
    expect(html).toContain("Fix dataset labels");
    expect(html).toContain("1 Overdue Task");
  });

  it("generates deadline alert HTML with remaining hours", () => {
    const html = generateDeadlineAlertHtml({
      taskTitle: "Submit Conference Paper Draft",
      dueDate: "2026-09-11",
      priority: "p1",
      project: "Paper-Submission",
      hoursRemaining: 18,
    });

    expect(html).toContain("Deadline Approaching");
    expect(html).toContain("Submit Conference Paper Draft");
    expect(html).toContain("Paper-Submission");
    expect(html).toContain("~18 hours left");
  });

  it("generates weekly digest HTML with velocity metrics", () => {
    const html = generateWeeklyDigestHtml({
      weekRange: "Sep 7 – Sep 13",
      completedCount: 12,
      totalActiveCount: 3,
      completionRate: 80,
      highlights: ["Deployed ML pipeline", "Published draft notes"],
    });

    expect(html).toContain("Weekly Retrospective & Digest");
    expect(html).toContain("Sep 7 – Sep 13");
    expect(html).toContain("80%");
    expect(html).toContain("Deployed ML pipeline");
  });

  it("detects live mail provider when RESEND_API_KEY is configured", async () => {
    const { getMailProviderStatus } = await import("../../server/mailService");
    const status = getMailProviderStatus();
    expect(status.isLive).toBe(true);
    expect(status.provider).toBe("resend");
  });
});
