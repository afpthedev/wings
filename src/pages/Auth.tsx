import { useState } from "react";
import { Seo } from "@/components/Seo";
import { toast } from "sonner";
import { signInWithCredentials, sendMagicLink } from "@/lib/auth";
import { signInWithGoogle } from "@/lib/auth/oauth";
import { Logo } from "@/components/Logo";
import { GoogleLogo } from "@/components/GoogleLogo";
import { Dither } from "@/components/ui/Dither";
import { Link } from "react-router-dom";
import { useRedirectIfAuthed } from "@/hooks/useRedirectIfAuthed";
import { LoadingScreen } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { User, Lock, Eye, EyeOff, KeyRound, Mail } from "lucide-react";

export default function Auth() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const { loading: authLoading } = useAuth();
  useRedirectIfAuthed();

  if (authLoading) {
    return <LoadingScreen variant="helix" />;
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error("Lütfen kullanıcı adı ve şifrenizi girin.");
      return;
    }

    setLoading(true);
    const { error } = await signInWithCredentials(identifier, password);
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Giriş başarılı!");
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    setLoading(true);
    const { error } = await sendMagicLink(identifier);
    setLoading(false);
    if (error) return toast.error(error.message);
    setMagicSent(true);
  };

  const handleGoogle = async () => {
    setOauthLoading(true);
    const result = await signInWithGoogle();
    if (result.error) {
      setOauthLoading(false);
      toast.error(result.error.message);
    }
  };

  return (
    <>
      <Seo title="Giriş Yap" path="/auth" noIndex />
      <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
        <Dither variant="grain" fade="radial" density="sparse" className="opacity-100" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42vh]" aria-hidden>
          <Dither variant="bayer" fade="up" density="sparse" accent className="opacity-60" />
        </div>

        <Link
          to="/"
          className="absolute top-6 left-6 z-10 text-ink-2 hover:text-foreground transition-colors"
        >
          <Logo size={24} withWordmark wordmarkClassName="text-xs font-display font-medium" />
        </Link>

        <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-20">
          <div className="w-full max-w-[360px] space-y-8">
            <div className="space-y-2 text-center">
              <h1 className="font-display text-2xl font-semibold tracking-tight">Giriş Yap</h1>
              <p className="text-sm text-ink-2">Wings Personal OS çalışma alanınıza erişin.</p>
            </div>

            {magicSent ? (
              <div className="space-y-5 text-center bg-surface-1/60 border border-border-subtle p-6 rounded-xl backdrop-blur-sm shadow-sm">
                <div className="relative mx-auto h-px w-24 overflow-hidden rounded-full bg-border-subtle">
                  <div className="dither dither--bayer dither--accent absolute inset-0 opacity-80" />
                </div>
                <p className="text-sm text-ink-1">
                  Giriş bağlantısı <span className="text-foreground font-medium">{identifier}</span> adresine gönderildi.
                </p>
                <button
                  type="button"
                  onClick={() => setMagicSent(false)}
                  className="text-xs text-ink-2 hover:text-foreground transition-colors underline underline-offset-4"
                >
                  Farklı bir e-posta dene
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {useMagicLink ? (
                  /* Magic Link Fallback Form */
                  <form onSubmit={handleMagicLink} className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
                      <input
                        id="auth-magic-email"
                        type="email"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="E-posta adresiniz"
                        autoComplete="email"
                        className="w-full rounded-lg border border-border-subtle bg-background/80 pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ring backdrop-blur-sm"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-lg bg-accent-strong px-4 py-3 text-sm font-medium text-accent-strong-foreground hover:bg-accent-strong-hover transition-colors disabled:opacity-50"
                    >
                      {loading ? "Gönderiliyor…" : "Sihirli Bağlantı Gönder"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseMagicLink(false)}
                      className="w-full text-center text-xs text-ink-2 hover:text-foreground transition-colors py-1"
                    >
                      ← Şifre ile giriş yap
                    </button>
                  </form>
                ) : (
                  /* Username & Password Form */
                  <form onSubmit={handlePasswordLogin} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-ink-2 ml-1" htmlFor="auth-identifier">
                        Kullanıcı Adı veya E-posta
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
                        <input
                          id="auth-identifier"
                          type="text"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder="kullanıcı adı veya e-posta"
                          autoComplete="username"
                          className="w-full rounded-lg border border-border-subtle bg-background/80 pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ring backdrop-blur-sm"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-ink-2 ml-1" htmlFor="auth-password">
                        Şifre
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
                        <input
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          className="w-full rounded-lg border border-border-subtle bg-background/80 pl-10 pr-11 py-3 text-sm text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-ring backdrop-blur-sm"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-foreground transition-colors p-0.5"
                          tabIndex={-1}
                          aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-2 rounded-lg bg-accent-strong px-4 py-3 text-sm font-medium text-accent-strong-foreground hover:bg-accent-strong-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                    >
                      <KeyRound className="h-4 w-4" />
                      {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
                    </button>

                    <div className="pt-1 text-center">
                      <button
                        type="button"
                        onClick={() => setUseMagicLink(true)}
                        className="text-[11px] text-ink-3 hover:text-ink-2 transition-colors underline underline-offset-4"
                      >
                        E-posta ile bağlantı gönder
                      </button>
                    </div>
                  </form>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <span className="h-px flex-1 bg-border-subtle" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-ink-3 font-mono">veya</span>
                  <span className="h-px flex-1 bg-border-subtle" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={oauthLoading}
                  className="w-full inline-flex items-center justify-center gap-3 rounded-lg border border-border-subtle bg-surface-1 px-4 py-3 text-sm font-medium hover:bg-surface-2 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <GoogleLogo size={20} />
                  {oauthLoading ? "Yönlendiriliyor…" : "Google ile Giriş Yap"}
                </button>
              </div>
            )}

            <p className="text-center text-[11px] text-ink-3 leading-relaxed">
              Wings Personal OS · Güvenli Oturum
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
