import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, X, Square } from "@/lib/icons";
import { useResizable } from "@/hooks/useResizable";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  detectLectureCapabilities,
  engineLabel,
  resolveTranscriptionEngine,
  whisperAvailable,
} from "@/lib/lecture/capabilities";
import { listMicrophones, type MicrophoneInfo } from "@/lib/lecture/capture";
import { installLectureEngineTestHooks } from "@/lib/lecture/engine";
import {
  countTranscriptWords,
  formatBytes,
  formatClock,
  formatDurationWords,
  markdownForNewChunks,
} from "@/lib/lecture/format";
import { appendLectureMarkdown, installLectureTestHooks, readEditorMarkdown } from "@/lib/lecture/insert";
import { startLectureSession, type LectureSession } from "@/lib/lecture/session";
import { getLecturePrefs, setLecturePrefs } from "@/lib/lecture/storage";
import {
  LANGUAGE_LABELS,
  WHISPER_MODELS,
  type EnginePreference,
  type LectureLanguage,
  type LectureStatus,
  type QualityMode,
  type TranscriptChunk,
  type TranscriptionEngineId,
} from "@/lib/lecture/types";
import { Sparkles, Wand2, Loader2, CheckCircle2, Key } from "lucide-react";
import { polishAndSummarizeLecture, hasConfiguredAiProvider } from "@/lib/lecture/aiPolish";
import { getGeminiApiKey } from "@/lib/lecture/geminiAudioEngine";
import { setApiKeyFor } from "@/lib/ai/storage";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  hasPage: boolean;
  canEdit: boolean;
}

export function LectureModePanel({ open, onClose, hasPage, canEdit }: Props) {
  const { width, onMouseDown } = useResizable({
    storageKey: "nw:lectureWidth",
    defaultWidth: 380,
    min: 300,
    max: 560,
    side: "right",
  });

  const [prefs, setPrefs] = useState(getLecturePrefs);
  const [mics, setMics] = useState<MicrophoneInfo[]>([]);
  const [status, setStatus] = useState<LectureStatus>("idle");
  const [partial, setPartial] = useState("");
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engineId, setEngineId] = useState<TranscriptionEngineId | null>(null);
  const [caps] = useState(() => detectLectureCapabilities());
  const [polishing, setPolishing] = useState(false);
  const [polished, setPolished] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [inlineKey, setInlineKey] = useState("");

  const sessionRef = useRef<LectureSession | null>(null);
  const headingInsertedRef = useRef(false);
  const chunksRef = useRef<TranscriptChunk[]>([]);
  chunksRef.current = chunks;

  useEffect(() => {
    installLectureTestHooks();
    installLectureEngineTestHooks();
  }, []);

  useEffect(() => {
    if (!open) return;
    setPrefs(getLecturePrefs());
    setHasGeminiKey(Boolean(getGeminiApiKey()));
    void listMicrophones()
      .then(setMics)
      .catch(() => setMics([]));
  }, [open]);

  useEffect(() => {
    if (status !== "recording" || !sessionRef.current) return;
    const startedAt = sessionRef.current.startedAt;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [status]);

  const updatePrefs = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setLecturePrefs(next);
  };

  const commitChunk = useCallback((chunk: TranscriptChunk) => {
    setChunks((current) => [...current, chunk]);
    const pageMarkdown = readEditorMarkdown();
    const insert = markdownForNewChunks(pageMarkdown, [chunk], headingInsertedRef.current);
    if (insert.markdown) {
      appendLectureMarkdown(insert.markdown);
      headingInsertedRef.current = insert.headingPresent;
    }
  }, []);

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    await session?.stop();
  }, []);

  const start = useCallback(async () => {
    if (!hasPage || !canEdit) return;
    setError(null);
    setChunks([]);
    setPartial("");
    setElapsedMs(0);
    setProgress(null);
    setPolished(false);
    setPolishing(false);
    headingInsertedRef.current = false;
    try {
      const session = await startLectureSession(prefs, {
        onPartial: setPartial,
        onChunk: commitChunk,
        onStatus: setStatus,
        onProgress: (info) => {
          const pct = typeof info.progress === "number" ? ` ${Math.round(info.progress)}%` : "";
          setProgress(`${info.status}${info.file ? ` ${info.file}` : ""}${pct}`.trim());
        },
        onError: (err) => setError(err.message),
        onEngine: setEngineId,
      });
      sessionRef.current = session;
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not start Lecture Mode.");
    }
  }, [canEdit, commitChunk, hasPage, prefs]);

  const close = useCallback(async () => {
    await stop();
    setStatus("idle");
    setPartial("");
    setProgress(null);
    onClose();
  }, [onClose, stop]);

  const handlePolishWithAi = async () => {
    if (chunks.length === 0) {
      toast.error("Düzenlenecek bir transkript metni bulunamadı.");
      return;
    }

    if (!hasConfiguredAiProvider()) {
      toast.error("Yapay zeka sağlayıcısı tanımlanmadı", {
        description: "Lütfen AI ayarlarını açıp Google, Anthropic veya OpenAI API anahtarınızı girin.",
        action: {
          label: "AI Ayarları",
          onClick: () => window.dispatchEvent(new CustomEvent("nw:openAI")),
        },
      });
      return;
    }

    setPolishing(true);
    try {
      const res = await polishAndSummarizeLecture(chunks);
      if (res.success) {
        setPolished(true);
        toast.success("Ders notu başarıyla yapılandırıldı ve sayfaya eklendi! ✨");
      } else {
        toast.error(res.error || "Özet oluşturulamadı.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Bir hata oluştu.");
    } finally {
      setPolishing(false);
    }
  };

  if (!open) return null;

  const resolved = resolveTranscriptionEngine(prefs.engine, caps);
  const model = WHISPER_MODELS[prefs.quality];
  const recording = status === "recording" || status === "loading-model" || status === "stopping";
  const stopped = status === "stopped";

  return (
    <aside
      data-testid="lecture-panel"
      style={{ width }}
      className="fixed top-0 right-0 bottom-0 z-40 bg-card border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 max-w-full max-md:inset-0 max-md:!w-full max-md:z-50"
    >
      <div
        onMouseDown={onMouseDown}
        className="nw-resize-handle absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-50 hidden md:block"
        title="Drag to resize"
      />

      <div className="h-12 flex items-center px-3 border-b border-border-subtle gap-2 shrink-0">
        <Mic className="h-3.5 w-3.5 text-foreground" />
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[11px] font-semibold tracking-tight">Lecture Mode</span>
          <span className="text-[9px] text-muted-foreground/70 font-mono truncate">
            {engineId ? engineLabel(engineId, engineId === "whisper") : "Local transcription"}
          </span>
        </div>
        <button
          onClick={() => void close()}
          className="ml-auto p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-sm">
        {!recording && !stopped && (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Lecture Mode records microphone audio. Processing is performed locally on your device.
              Audio is not uploaded unless you explicitly enable a cloud-based feature. You are
              responsible for complying with local recording laws and classroom rules.
            </p>
            <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
              Transcription is approximate. Classroom noise, accents, formulas, and names can cause
              mistakes — this is not 100% accurate.
            </p>

            {!hasPage && (
              <p className="text-[11px] text-destructive">Open a page to save the transcript.</p>
            )}
            {hasPage && !canEdit && (
              <p className="text-[11px] text-destructive">You need edit access to record into this page.</p>
            )}

            <Field label="Microphone">
              <Select
                value={prefs.deviceId ?? "default"}
                onValueChange={(value) => updatePrefs({ deviceId: value === "default" ? null : value })}
              >
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue placeholder="Default microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default microphone</SelectItem>
                  {mics.map((mic) => (
                    <SelectItem key={mic.deviceId || mic.label} value={mic.deviceId || mic.label}>
                      {mic.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Language">
              <Select
                value={prefs.language}
                onValueChange={(value) => updatePrefs({ language: value as LectureLanguage })}
              >
                <SelectTrigger className="h-8 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LANGUAGE_LABELS) as LectureLanguage[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {LANGUAGE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Transcription">
              <RadioGroup
                value={prefs.engine}
                onValueChange={(value) => updatePrefs({ engine: value as EnginePreference })}
                className="gap-1.5"
              >
                <RadioRow
                  id="engine-gemini"
                  value="gemini"
                  label="Gemini 2.0 Flash Audio"
                  hint="Google AI · En yüksek Türkçe doğruluğu, anında deşifre ve noktalama"
                />
                <RadioRow
                  id="engine-whisper"
                  value="whisper"
                  disabled={!whisperAvailable(caps)}
                  label="On-device (Whisper ONNX)"
                  hint={whisperAvailable(caps) ? "Whisper model cihazınızda çevrimdışı çalışır" : "Bu tarayıcıda desteklenmiyor"}
                />
                <RadioRow
                  id="engine-speech"
                  value="speech"
                  disabled={!caps.speechRecognition}
                  label="Browser Speech (Chrome/Edge)"
                  hint="Tarayıcının yerel ses motoru (indirme gerektirmez)"
                />
              </RadioGroup>
            </Field>

            {prefs.engine === "gemini" && !hasGeminiKey && (
              <div className="p-3 rounded-lg border border-amber-500/25 bg-amber-500/10 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-amber-400">
                  <Key className="w-3.5 h-3.5 shrink-0" />
                  <span>Gemini API Anahtarı Gerekli</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Gemini 2.0 Flash Audio ile canlı transkripsiyon yapmak için Google AI Studio anahtarınızı girin:
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={inlineKey}
                    onChange={(e) => setInlineKey(e.target.value)}
                    className="flex-1 bg-background border border-border rounded px-2.5 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs px-3"
                    onClick={() => {
                      if (inlineKey.trim()) {
                        setApiKeyFor("google", inlineKey.trim());
                        setHasGeminiKey(true);
                        toast.success("Gemini API anahtarı kaydedildi.");
                      }
                    }}
                  >
                    Kaydet
                  </Button>
                </div>
              </div>
            )}

            {prefs.engine === "whisper" && (
              <Field label="Quality">
                <RadioGroup
                  value={prefs.quality}
                  onValueChange={(value) => updatePrefs({ quality: value as QualityMode })}
                  className="gap-1.5"
                >
                  <RadioRow
                    id="quality-fast"
                    value="fast"
                    label="Fast"
                    hint={`${WHISPER_MODELS.fast.label} · about ${formatBytes(WHISPER_MODELS.fast.bytes)} download`}
                  />
                  <RadioRow
                    id="quality-balanced"
                    value="balanced"
                    label="Balanced"
                    hint={`${WHISPER_MODELS.balanced.label} · about ${formatBytes(WHISPER_MODELS.balanced.bytes)} download`}
                  />
                  <RadioRow
                    id="quality-accurate"
                    value="accurate"
                    label="High Quality"
                    hint={`${WHISPER_MODELS.accurate.label} · about ${formatBytes(WHISPER_MODELS.accurate.bytes)} download`}
                  />
                  <RadioRow
                    id="quality-turbo"
                    value="turbo"
                    label="Large v3 Turbo (En Yüksek Kalite)"
                    hint={`${WHISPER_MODELS.turbo.label} · about ${formatBytes(WHISPER_MODELS.turbo.bytes)} (OpenAI SOTA)`}
                  />
                </RadioGroup>
              </Field>
            )}

            <Field label="Save recording">
              <p className="text-[11px] text-muted-foreground">
                Don&apos;t save audio. Local audio replay ships in a later version.
              </p>
            </Field>

            <p className="text-[11px] text-muted-foreground font-mono">
              Will use {engineLabel(resolved.engine, resolved.onDevice)}
              {resolved.engine === "whisper" ? ` · ${model.label} (${formatBytes(model.bytes)})` : ""}
            </p>

            {error && <p className="text-[11px] text-destructive">{error}</p>}

            <Button
              data-testid="lecture-start"
              className="w-full"
              disabled={!hasPage || !canEdit || !caps.microphone || (prefs.engine === "gemini" && !hasGeminiKey)}
              onClick={() => void start()}
            >
              Start recording
            </Button>
            {prefs.engine === "gemini" && !hasGeminiKey && (
              <p className="text-[11px] text-amber-500">Gemini ile kayda başlamak için yukarıya API anahtarınızı girin.</p>
            )}
            {!caps.microphone && (
              <p className="text-[11px] text-destructive">This browser cannot access the microphone.</p>
            )}
          </>
        )}

        {recording && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span>{status === "loading-model" ? "Loading model" : "Recording"}</span>
              <span className="ml-auto tabular-nums">{formatClock(elapsedMs)}</span>
            </div>
            {progress && status === "loading-model" && (
              <p className="text-[11px] text-muted-foreground font-mono break-all">{progress}</p>
            )}
            {error && <p className="text-[11px] text-destructive">{error}</p>}
            <div className="rounded-md border border-border-subtle p-3 space-y-2 min-h-[160px]">
              {chunks.length === 0 && !partial && (
                <p className="text-[11px] text-muted-foreground">Listening… transcript appears as each chunk finishes.</p>
              )}
              {chunks.map((chunk) => (
                <p key={chunk.id} className="text-[12px] leading-relaxed">
                  <span className="font-mono text-[10px] text-muted-foreground mr-2">
                    {formatClock(chunk.startTime)}
                  </span>
                  {chunk.text}
                </p>
              ))}
              {partial && (
                <p className="text-[12px] text-muted-foreground italic">{partial}</p>
              )}
            </div>
            <Button
              data-testid="lecture-stop"
              variant="destructive"
              className="w-full"
              disabled={status === "stopping"}
              onClick={() => void stop()}
            >
              <Square className="h-3.5 w-3.5" />
              Stop recording
            </Button>
          </div>
        )}

        {stopped && (
          <div className="space-y-3">
            <p className="text-xs font-medium">Lecture saved</p>
            <p className="text-[11px] text-muted-foreground font-mono">
              {formatDurationWords(elapsedMs)} · {countTranscriptWords(chunks).toLocaleString()} words
            </p>
            {error && <p className="text-[11px] text-destructive">{error}</p>}
            <div className="rounded-md border border-border-subtle p-3 max-h-64 overflow-y-auto space-y-2">
              {chunks.map((chunk) => (
                <p key={chunk.id} className="text-[12px] leading-relaxed">
                  <span className="font-mono text-[10px] text-muted-foreground mr-2">
                    {formatClock(chunk.startTime)}
                  </span>
                  {chunk.text}
                </p>
              ))}
              {chunks.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No transcript was produced.</p>
              )}
            </div>
            {/* AI Post-Processing Card */}
            {chunks.length > 0 && (
              <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground">
                    AI ile Dersi Düzenle & Özetle
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Ham transkriptteki Türkçe yazım hatalarını düzeltir, ana fikirler, alt başlıklar ve aksiyon maddeleri halinde temiz bir ders notuna dönüştürüp sayfaya ekler.
                </p>

                {polished ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium py-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ders özeti sayfaya başarıyla eklendi!</span>
                  </div>
                ) : (
                  <Button
                    type="button"
                    disabled={polishing}
                    onClick={handlePolishWithAi}
                    className="w-full text-xs font-medium gap-2 h-9"
                  >
                    {polishing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        AI Notları Düzenliyor...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3.5 h-3.5" />
                        Ders Notuna Dönüştür & Sayfaya Ekle
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            <Button data-testid="lecture-done" variant="outline" className="w-full" onClick={() => void close()}>
              Done
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RadioRow({
  id,
  value,
  label,
  hint,
  disabled,
}: {
  id: string;
  value: string;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem id={id} value={value} disabled={disabled} className="mt-0.5" />
      <label htmlFor={id} className={`text-xs leading-tight ${disabled ? "opacity-50" : ""}`}>
        <span className="font-medium">{label}</span>
        <span className="block text-[10px] text-muted-foreground">{hint}</span>
      </label>
    </div>
  );
}
