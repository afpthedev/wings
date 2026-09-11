import type { LecturePrefs } from "./types";

const PREFS_KEY = "wings_lecture_prefs";

const DEFAULT_PREFS: LecturePrefs = {
  language: "auto",
  quality: "fast",
  engine: "whisper",
  deviceId: null,
};

function isLanguage(value: unknown): value is LecturePrefs["language"] {
  return value === "auto" || value === "tr" || value === "en" || value === "hi" || value === "kn";
}

function isQuality(value: unknown): value is LecturePrefs["quality"] {
  return value === "fast" || value === "balanced" || value === "accurate" || value === "turbo";
}

function isEngine(value: unknown): value is LecturePrefs["engine"] {
  return value === "whisper" || value === "speech" || value === "gemini";
}

export function getLecturePrefs(): LecturePrefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<LecturePrefs>;
    return {
      language: isLanguage(parsed.language) ? parsed.language : DEFAULT_PREFS.language,
      quality: isQuality(parsed.quality) ? parsed.quality : DEFAULT_PREFS.quality,
      engine: isEngine(parsed.engine) ? parsed.engine : DEFAULT_PREFS.engine,
      deviceId: typeof parsed.deviceId === "string" && parsed.deviceId ? parsed.deviceId : null,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setLecturePrefs(prefs: LecturePrefs): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
