import { supabase } from "@/integrations/supabase/client";
import { authRedirectUrl } from "./auth/redirect";

function formatAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "Too many sign-in attempts — wait a minute and try again.";
  }
  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "Invalid username/email or password.";
  }
  return message;
}

/** Password sign in using username or email */
export async function signInWithCredentials(identifier: string, password: string) {
  const trimmed = identifier.trim().toLowerCase();

  // 1. If it's already an email
  if (trimmed.includes("@")) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    return { data, error: error ? { ...error, message: formatAuthError(error.message) } : null };
  }

  // 2. If it's a username (no @), map to internal email domains
  const localEmail = `${trimmed}@wings.local`;
  const res1 = await supabase.auth.signInWithPassword({
    email: localEmail,
    password,
  });

  if (!res1.error) {
    return { data: res1.data, error: null };
  }

  // 3. Fallback to @aeolus.dev domain
  const aeolusEmail = `${trimmed}@aeolus.dev`;
  const res2 = await supabase.auth.signInWithPassword({
    email: aeolusEmail,
    password,
  });

  if (!res2.error) {
    return { data: res2.data, error: null };
  }

  return { data: null, error: { ...res1.error, message: formatAuthError(res1.error.message) } };
}

/** Magic link fallback (optional) */
export async function sendMagicLink(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: authRedirectUrl(),
      shouldCreateUser: true,
    },
  });
  return { error: error ? { ...error, message: formatAuthError(error.message) } : null };
}
