import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import SharedEntry from "./pages/SharedEntry";
import NotFound from "./pages/NotFound";
import Legal from "./pages/Legal";
import EditorE2E from "./pages/EditorE2E";
import { About, Careers, Contact, Roadmap, Docs, Support, Status, Press } from "./pages/StaticPages";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import { CookieBanner } from "@/components/CookieBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DitherFilterDefs } from "@/lib/dither/filters";
import { LoadingScreen } from "@/components/ui/spinner";
import { Analytics } from "@vercel/analytics/react";
import { useEffect, useState, type ReactElement } from "react";
import { getMyUsername } from "@/lib/profile";
import { getDashboardPath } from "@/lib/auth/redirect";
import { isAnalyticsEnabled, type CookieConsent } from "@/components/CookieBanner";

const queryClient = new QueryClient();

/** Scroll to top on every client-side route change. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Old bookmarked hash links → redirect to home. */
function LegacyHashRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.pathname !== "/") return;
    if (location.hash === "#features" || location.hash === "#showcase") {
      navigate("/", { replace: true });
    }
  }, [location.pathname, location.hash, navigate]);
  return null;
}

/** Load Vercel Analytics unless the user rejected analytics in the consent banner. */
function ConsentedAnalytics() {
  const [enabled, setEnabled] = useState(() => isAnalyticsEnabled());
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CookieConsent | null>).detail;
      setEnabled(detail ? detail.analytics : isAnalyticsEnabled());
    };
    window.addEventListener("wings:cookie-consent", handler);
    return () => window.removeEventListener("wings:cookie-consent", handler);
  }, []);
  return enabled ? <Analytics /> : null;
}

async function waitForUsername(userId: string, attempts = 8): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const username = await getMyUsername(userId);
    if (username) return username;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

function UsernameGate() {
  const { username } = useParams<{ username: string }>();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<"loading" | "ok" | "deny">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authLoading) return;
      if (!user) {
        setState("deny");
        return;
      }
      if (!username) {
        setState("deny");
        return;
      }
      const my = await waitForUsername(user.id);
      if (cancelled) return;
      if (my && my.toLowerCase() === username.toLowerCase()) {
        setState("ok");
      } else {
        setState("deny");
      }
    })();
    return () => { cancelled = true; };
  }, [user, username, authLoading]);

  if (authLoading || state === "loading") {
    return <LoadingScreen variant="gyro" />;
  }
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?returnTo=${returnTo}`} replace />;
  }
  if (state === "deny") return <NotFound />;
  return <Index />;
}


function RootRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    let cancelled = false;
    getDashboardPath(user.id).then((path) => {
      if (!cancelled) navigate(path, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [user, loading, navigate]);

  return <LoadingScreen variant="gyro" />;
}

function AppRoutes() {
  const { loading } = useAuth();

  if (loading) {
    return <LoadingScreen variant="gyro" />;
  }

  return (
    <Routes>
      {/* Root redirect (directs authenticated users to workspace, unauthenticated to /auth) */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="/features" element={<Navigate to="/" replace />} />
      <Route path="/showcase" element={<Navigate to="/" replace />} />
      <Route path="/pricing" element={<Navigate to="/" replace />} />
      <Route path="/about" element={<About />} />
      <Route path="/careers" element={<Careers />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/changelog" element={<Navigate to="/roadmap" replace />} />
      <Route path="/roadmap" element={<Roadmap />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/support" element={<Support />} />
      <Route path="/status" element={<Status />} />
      <Route path="/press" element={<Press />} />
      <Route path="/legal/privacy" element={<Legal slug="privacy" />} />
      <Route path="/legal/terms" element={<Legal slug="terms" />} />
      <Route path="/legal/security" element={<Legal slug="security" />} />
      <Route path="/legal/cookies" element={<Legal slug="cookies" />} />
      <Route path="/__editor-e2e" element={import.meta.env.DEV ? <EditorE2E /> : <NotFound />} />

      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/s/:token" element={<SharedEntry />} />

      {/* Authenticated app */}
      <Route path="/app" element={<RequireAuth><Index /></RequireAuth>} />
      <Route path="/app/tasks" element={<RequireAuth><Index /></RequireAuth>} />
      <Route path="/app/n/:id" element={<RequireAuth><Index /></RequireAuth>} />
      <Route path="/app/c/:collectionId" element={<RequireAuth><Index /></RequireAuth>} />
      <Route path="/app/trash" element={<RequireAuth><Index /></RequireAuth>} />
      <Route path="/n/:id" element={<RequireAuth><Index /></RequireAuth>} />
      <Route path="/c/:collectionId" element={<RequireAuth><Index /></RequireAuth>} />
      <Route path="/tasks" element={<RequireAuth><Index /></RequireAuth>} />
      <Route path="/trash" element={<RequireAuth><Index /></RequireAuth>} />
      <Route path="/:username" element={<UsernameGate />} />
      <Route path="/:username/tasks" element={<UsernameGate />} />
      <Route path="/:username/n/:id" element={<UsernameGate />} />
      <Route path="/:username/c/:collectionId" element={<UsernameGate />} />
      <Route path="/:username/trash" element={<UsernameGate />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?returnTo=${returnTo}`} replace />;
  }
  return children;
}

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <DitherFilterDefs />
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <ScrollToTop />
            <LegacyHashRedirect />
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
            <CookieBanner />
            <ConsentedAnalytics />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
