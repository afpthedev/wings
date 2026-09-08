import { expect, test } from "@playwright/test";
import { focusEditor } from "./editor-helpers";

test.describe("Lecture Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/__editor-e2e");
    await focusEditor(page);
  });

  test("slash lecture opens the Lecture Mode panel", async ({ page }) => {
    await page.keyboard.type("/lecture");
    const item = page.locator(".slash-menu button", { hasText: "Lecture Mode" });
    await expect(item).toBeVisible();
    await item.click();
    await expect(page.getByTestId("lecture-panel")).toBeVisible();
    await expect(page.getByTestId("lecture-start")).toBeVisible();
    await expect(page.getByText("Processing is performed locally on your device.")).toBeVisible();
  });

  test("slash dictate alias finds Lecture Mode", async ({ page }) => {
    await page.keyboard.type("/dictate");
    await expect(page.locator(".slash-menu button", { hasText: "Lecture Mode" })).toBeVisible();
  });

  test("appending a transcript chunk writes into the page without wiping it", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await page.keyboard.type("Existing notes");
    await expect.poll(async () =>
      page.evaluate(() => typeof (window as unknown as { __nw_appendLectureMarkdown?: unknown }).__nw_appendLectureMarkdown),
    ).toBe("function");

    const inserted = await page.evaluate(() =>
      (window as unknown as { __nw_appendLectureMarkdown: (markdown: string) => boolean })
        .__nw_appendLectureMarkdown(
          "## Raw Transcript\n\n[00:00:01] The operating system maintains a page table.",
        ),
    );
    expect(inserted).toBe(true);

    await expect(editor).toContainText("Existing notes");
    await expect(editor.locator("h2")).toContainText("Raw Transcript");
    await expect(editor).toContainText("The operating system maintains a page table.");

    const empty = await page.evaluate(() =>
      (window as unknown as { __nw_appendLectureMarkdown: (markdown: string) => boolean })
        .__nw_appendLectureMarkdown("   "),
    );
    expect(empty).toBe(false);
    await expect(editor).toContainText("Existing notes");
  });
});
