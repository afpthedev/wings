import { useState, useEffect } from "react";
import {
  X,
  Mail,
  Clock,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Send,
  Eye,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import {
  fetchPlannerConfig,
  updatePlannerConfig,
  sendTestReminder,
  fetchMailOutbox,
  type SchedulerApiConfig,
  type OutboxEmailItem,
  type MailProviderStatus,
} from "@/lib/tasks/plannerStore";
import type { TaskItem } from "@/lib/tasks/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  tasks: TaskItem[];
}

export function EmailReminderModal({ open, onClose, tasks }: Props) {
  const [activeTab, setActiveTab] = useState<"settings" | "outbox">("settings");
  const [loading, setLoading] = useState(false);
  const [hasResendKey, setHasResendKey] = useState(false);
  const [providerStatus, setProviderStatus] = useState<MailProviderStatus | null>(null);
  const [config, setConfig] = useState<SchedulerApiConfig>({
    targetEmail: "",
    morningBriefingEnabled: true,
    morningBriefingTime: "08:30",
    deadlineAlertsEnabled: true,
    weeklyDigestEnabled: true,
    weeklyDigestDay: 0,
    weeklyDigestTime: "20:00",
  });

  const [outbox, setOutbox] = useState<OutboxEmailItem[]>([]);
  const [selectedMail, setSelectedMail] = useState<OutboxEmailItem | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [testType, setTestType] = useState<"morning_briefing" | "deadline_alert" | "weekly_digest">(
    "morning_briefing"
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchPlannerConfig();
      setConfig(res.config);
      setHasResendKey(res.hasResendKey);
      if (res.providerStatus) {
        setProviderStatus(res.providerStatus);
      }

      const msgs = await fetchMailOutbox();
      setOutbox(msgs);
      if (msgs.length > 0 && !selectedMail) {
        setSelectedMail(msgs[0]);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  if (!open) return null;

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await updatePlannerConfig(config);
      toast.success("Hatırlatıcı ayarları kaydedildi!", {
        description: config.targetEmail
          ? `${config.targetEmail} adresine zamanlanmış mailler planlandı.`
          : "Hedef e-posta adresi belirlenmedi.",
      });
    } catch (err: any) {
      toast.error(err.message || "Kaydetme başarısız");
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async () => {
    const email = config.targetEmail.trim();
    if (!email) {
      toast.error("Lütfen önce bir hedef e-posta adresi girin.");
      return;
    }

    setSendingTest(true);
    try {
      const res = await sendTestReminder({
        type: testType,
        targetEmail: email,
        tasks,
      });

      if (res.mode === "resend" || res.mode === "smtp") {
        toast.success("E-posta başarıyla gönderildi.", {
          description: `${email} adresinin gelen kutusunu kontrol edin.`,
        });
      } else {
        toast.info("Test e-postası yerel önizlemeye kaydedildi 📬", {
          description: "Giden Kutusu sekmesinden oluşturulan HTML şablonu inceleyebilirsiniz. Gerçek posta için RESEND_API_KEY veya Gmail SMTP gereklidir.",
          duration: 6000,
        });
      }

      // Refresh outbox and switch to outbox tab
      const updatedOutbox = await fetchMailOutbox();
      setOutbox(updatedOutbox);
      if (updatedOutbox.length > 0) {
        setSelectedMail(updatedOutbox[0]);
      }
      setActiveTab("outbox");
    } catch (err: any) {
      toast.error(err.message || "Test e-postası gönderilemedi");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-surface-1 border border-border-strong rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-2/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-accent-strong/10 text-accent-strong">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-display font-semibold text-foreground">
                  Zamanlanmış E-posta Hatırlatıcıları & Cron
                </h2>
                {hasResendKey ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                    <ShieldCheck className="w-3 h-3" /> Resend Aktif
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full">
                    <Eye className="w-3 h-3" /> Lokal Önizleme Modu
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-2">
                Günün odak planı, sabah brifingleri ve son teslim tarihi yaklaşan işler için otomatik bildirimler
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-ink-2 hover:text-foreground rounded-md hover:bg-surface-3 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-4 px-6 border-b border-border-subtle bg-surface-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={cn(
              "py-3 font-medium border-b-2 transition-colors flex items-center gap-2",
              activeTab === "settings"
                ? "border-accent-strong text-foreground"
                : "border-transparent text-ink-2 hover:text-foreground"
            )}
          >
            <Bell className="w-3.5 h-3.5" />
            Zamanlayıcı Ayarları
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("outbox")}
            className={cn(
              "py-3 font-medium border-b-2 transition-colors flex items-center gap-2",
              activeTab === "outbox"
                ? "border-accent-strong text-foreground"
                : "border-transparent text-ink-2 hover:text-foreground"
            )}
          >
            <Send className="w-3.5 h-3.5" />
            Giden Kutusu & Önizleme ({outbox.length})
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "settings" ? (
            <form onSubmit={handleSaveConfig} className="space-y-6">
              {/* Mail Provider Live / Dev Status */}
              <div
                className={cn(
                  "p-3.5 rounded-xl border flex items-start gap-3 text-xs transition-colors",
                  providerStatus?.isLive
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/25 text-amber-300"
                )}
              >
                {providerStatus?.isLive ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                )}
                <div className="space-y-1">
                  <div className="font-semibold flex items-center gap-2">
                    <span>
                      {providerStatus?.isLive
                        ? "Canlı Gönderici Aktif"
                        : "Lokal Geliştirici Modu (Simülasyon)"}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-normal bg-background/60 border border-current">
                      {providerStatus?.description || (hasResendKey ? "Resend" : "Simülasyon")}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-85 leading-relaxed">
                    {providerStatus?.isLive
                      ? "Planlanan ve test edilen e-postalar doğrudan gerçek gelen kutunuza iletilir."
                      : "Gerçek e-postanın Gmail gelen kutunuza ulaşması için .env dosyasına RESEND_API_KEY veya Gmail SMTP bilgileri gereklidir. Şu anda oluşturulan tüm e-postalar güvenle 'Giden Kutusu' sekmesinde ve workspace/.mail_outbox altında depolanıp önizlenir."}
                  </p>
                </div>
              </div>

              {/* Target Email */}
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase tracking-widest text-ink-2 font-medium">
                  Alıcı E-Posta Adresi
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="ornek@domain.com"
                    value={config.targetEmail}
                    onChange={(e) => setConfig({ ...config, targetEmail: e.target.value })}
                    className="flex-1 bg-background border border-border rounded-lg px-3.5 py-2 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-accent-strong font-mono"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-foreground text-xs font-semibold rounded-lg border border-border-subtle transition-colors"
                  >
                    Kaydet
                  </button>
                </div>
                <p className="text-[11px] text-ink-3">
                  {hasResendKey
                    ? "Resend API anahtarınız yapılandırılmış durumda, mailler doğrudan bu adrese iletilecek."
                    : "Lokal geliştirme modunda oluşturulan mailler anında HTML olarak kaydedilir ve yan sekmede incelenebilir."}
                </p>
              </div>

              {/* Schedules Grid */}
              <div className="space-y-3">
                <label className="text-xs font-mono uppercase tracking-widest text-ink-2 font-medium">
                  Otomatik Cron Görevleri
                </label>

                {/* 1. Morning Briefing */}
                <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground">
                          Günün Sabah Özeti (Morning Briefing)
                        </div>
                        <div className="text-[11px] text-ink-2">
                          Günün 3 kritik P1 odağı, vadesi gelen işler ve dünden kalanlar
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.morningBriefingEnabled}
                        onChange={(e) =>
                          setConfig({ ...config, morningBriefingEnabled: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-strong"></div>
                    </label>
                  </div>
                  {config.morningBriefingEnabled && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border-subtle/60 text-xs">
                      <span className="text-ink-2">Gönderim Saati:</span>
                      <input
                        type="time"
                        value={config.morningBriefingTime}
                        onChange={(e) =>
                          setConfig({ ...config, morningBriefingTime: e.target.value })
                        }
                        className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground font-mono focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* 2. Deadline Alerts */}
                <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-400">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground">
                          Termin & Son Tarih Uyarıları
                        </div>
                        <div className="text-[11px] text-ink-2">
                          Teslimine 24 saat kalan kritik görevler için acil bildirim
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.deadlineAlertsEnabled}
                        onChange={(e) =>
                          setConfig({ ...config, deadlineAlertsEnabled: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-strong"></div>
                    </label>
                  </div>
                </div>

                {/* 3. Weekly Retrospective */}
                <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground">
                          Haftalık Retrospektif & Özet Raporu
                        </div>
                        <div className="text-[11px] text-ink-2">
                          Haftalık tamamlama hızı (velocity), kazanımlar ve gelecek haftanın planı
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.weeklyDigestEnabled}
                        onChange={(e) =>
                          setConfig({ ...config, weeklyDigestEnabled: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-strong"></div>
                    </label>
                  </div>
                  {config.weeklyDigestEnabled && (
                    <div className="flex items-center gap-4 pt-2 border-t border-border-subtle/60 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-2">Gün:</span>
                        <select
                          value={config.weeklyDigestDay}
                          onChange={(e) =>
                            setConfig({ ...config, weeklyDigestDay: parseInt(e.target.value, 10) })
                          }
                          className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none"
                        >
                          <option value={0}>Pazar</option>
                          <option value={1}>Pazartesi</option>
                          <option value={5}>Cuma</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-ink-2">Saat:</span>
                        <input
                          type="time"
                          value={config.weeklyDigestTime}
                          onChange={(e) =>
                            setConfig({ ...config, weeklyDigestTime: e.target.value })
                          }
                          className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground font-mono focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Instant Test Action */}
              <div className="p-4 rounded-xl border border-accent-strong/20 bg-accent-strong/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-accent-strong" />
                    Hemen Test E-postası Tetikle
                  </div>
                  <div className="text-[11px] text-ink-2 mt-0.5">
                    Zamanlayıcıyı beklemeden şablonu ve gönderimi anında deneyin.
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={testType}
                    onChange={(e: any) => setTestType(e.target.value)}
                    className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
                  >
                    <option value="morning_briefing">Sabah Özeti</option>
                    <option value="deadline_alert">Termin Uyarısı</option>
                    <option value="weekly_digest">Haftalık Rapor</option>
                  </select>
                  <button
                    type="button"
                    disabled={sendingTest || !config.targetEmail}
                    onClick={handleSendTest}
                    className="flex-1 sm:flex-none px-3.5 py-1.5 bg-accent-strong hover:bg-accent-strong/90 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {sendingTest ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Şimdi Gönder
                  </button>
                </div>
              </div>
            </form>
          ) : (
            /* Outbox & Live Preview */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[520px]">
              {/* Messages List */}
              <div className="md:col-span-4 border border-border-subtle rounded-xl overflow-y-auto bg-surface-2/20 flex flex-col">
                <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-surface-2/40">
                  <span className="text-xs font-semibold text-foreground">Son E-postalar</span>
                  <button
                    type="button"
                    onClick={loadData}
                    className="p-1 text-ink-2 hover:text-foreground rounded hover:bg-surface-3 transition-colors"
                    title="Yenile"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {outbox.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-ink-3 text-xs">
                    <Mail className="w-8 h-8 opacity-30 mb-2" />
                    Henüz oluşturulmuş e-posta yok. "Zamanlayıcı Ayarları" sekmesinden bir test gönderin.
                  </div>
                ) : (
                  <div className="divide-y divide-border-subtle/50">
                    {outbox.map((msg) => {
                      const isSelected = selectedMail?.id === msg.id;
                      return (
                        <button
                          key={msg.id}
                          type="button"
                          onClick={() => setSelectedMail(msg)}
                          className={cn(
                            "w-full text-left p-3 transition-colors",
                            isSelected
                              ? "bg-accent-strong/10 border-l-2 border-accent-strong"
                              : "hover:bg-surface-2"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-mono text-ink-3">
                              {new Date(msg.sentAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <span
                              className={cn(
                                "text-[9px] px-1.5 py-0.2 rounded font-mono",
                                msg.deliveryMode === "resend"
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : "bg-blue-500/15 text-blue-400"
                              )}
                            >
                              {msg.deliveryMode === "resend" ? "SENT" : "DEV OUTBOX"}
                            </span>
                          </div>
                          <div className="text-xs font-medium text-foreground line-clamp-1">
                            {msg.subject}
                          </div>
                          <div className="text-[11px] text-ink-2 mt-0.5">Kime: {msg.to}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Live HTML Preview Iframe */}
              <div className="md:col-span-8 border border-border-subtle rounded-xl overflow-hidden bg-background flex flex-col">
                {selectedMail ? (
                  <>
                    <div className="px-4 py-2.5 border-b border-border-subtle bg-surface-2/40 flex items-center justify-between text-xs">
                      <div className="truncate">
                        <span className="text-ink-3 mr-1">Önizleme:</span>
                        <strong className="text-foreground">{selectedMail.subject}</strong>
                      </div>
                      <a
                        href={`/api/planner/preview?id=${selectedMail.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-accent-strong hover:underline flex items-center gap-1 shrink-0 ml-2"
                      >
                        Yeni Sekmede Aç <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <iframe
                      title="Email Preview"
                      src={`/api/planner/preview?id=${selectedMail.id}`}
                      className="flex-1 w-full h-full border-0 bg-[#0f1115]"
                    />
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-ink-3 text-xs">
                    Önizlemek için soldan bir e-posta seçin
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
