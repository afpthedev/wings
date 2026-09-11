import type { LectureEngine, LectureLanguage, TranscriptChunk } from "./types";

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string; confidence?: number };
  }>;
};

function speechRecognitionCtor(): (new () => BrowserSpeechRecognition) | undefined {
  const host = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return host.SpeechRecognition || host.webkitSpeechRecognition;
}

function recognitionLang(language: LectureLanguage): string {
  if (language === "tr") return "tr-TR";
  if (language === "hi") return "hi-IN";
  if (language === "kn") return "kn-IN";
  if (language === "en") return "en-US";
  return navigator.language || "tr-TR";
}

export function createSpeechRecognitionEngine(language: LectureLanguage): LectureEngine {
  let recognition: BrowserSpeechRecognition | null = null;
  let sessionStart = 0;
  let lastEnd = 0;
  let shouldRestart = false;

  return {
    id: "speech",
    async load() {
      if (!speechRecognitionCtor()) {
        throw new Error("Browser speech recognition is not available.");
      }
    },
    startLive(handlers) {
      const Ctor = speechRecognitionCtor();
      if (!Ctor) throw new Error("Browser speech recognition is not available.");
      sessionStart = Date.now();
      lastEnd = 0;
      shouldRestart = true;
      const rec = new Ctor();
      recognition = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = recognitionLang(language);
      rec.onresult = (event) => {
        let partial = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;
          const text = result[0]?.transcript?.trim() ?? "";
          if (!text) continue;
          if (result.isFinal) {
            const now = Date.now() - sessionStart;
            const chunk: TranscriptChunk = {
              id: `speech-${now}`,
              startTime: lastEnd,
              endTime: now,
              text,
              confidence: result[0]?.confidence,
            };
            lastEnd = now;
            handlers.onFinal(chunk);
          } else {
            partial = text;
          }
        }
        if (partial) handlers.onPartial(partial);
      };
      rec.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        handlers.onError(new Error(event.error || "Speech recognition failed."));
      };
      rec.onend = () => {
        if (shouldRestart) {
          try {
            rec.start();
          } catch {
            /* already started */
          }
        }
      };
      rec.start();
    },
    stop() {
      shouldRestart = false;
      try {
        recognition?.abort();
      } catch {
        /* ignore */
      }
      recognition = null;
    },
  };
}
