"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ADMIN_USERNAME = "admaslottery";
const ADMIN_EMAIL = "admaslottery@gmail.com";
const ADMIN_EMAIL_ALT = "admaslottery@admas.com";
const ADMIN_PASSWORD = "Admas1221..";

const ADMIN_COOKIE = "gecho-admin-auth";

const setAdminSession = () => {
  if (typeof document !== "undefined") {
    document.cookie = `${ADMIN_COOKIE}=admin; path=/; max-age=86400; samesite=lax`;
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_COOKIE, "admin");
  }
};

// Cookie-only signal that mirrors what the /admin middleware enforces
// server-side. We do NOT bounce off localStorage here because the middleware
// cannot see localStorage — trusting it causes a redirect loop:
//   localStorage set → /admin → middleware sees no cookie → /login → loop.
const hasAdminSessionCookie = () =>
  typeof document !== "undefined" &&
  document.cookie
    .split("; ")
    .some((cookie) => cookie.startsWith(`${ADMIN_COOKIE}=admin`));

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only bounce straight to /admin when the admin cookie (the middleware's
  // signal) is actually present. This breaks the redirect loop that occurs when
  // localStorage holds the marker but the cookie never reached the server.
  useEffect(() => {
    if (hasAdminSessionCookie()) {
      router.replace("/admin");
    }
  }, [router]);

  const normalize = (value: string) => value.trim().toLowerCase();

  const isValidAdminIdentifier = (input: string) => {
    const usernames = [ADMIN_USERNAME, "@admaslottery"];
    const emails = [ADMIN_EMAIL, ADMIN_EMAIL_ALT, `${ADMIN_USERNAME}@gmail.com`];

    if (usernames.includes(input)) return true;
    if (emails.includes(input)) return true;

    // Hardcoded fallback: always accept the primary admin email.
    return input === "admaslottery@gmail.com";
  };

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const input = normalize(identifier);
    const isEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);

    // Accept username, "@user", and email variants alike. The client form field
    // is type="text" so no native email validation can silently block submit.
    const identityOk = isEmailFormat
      ? isValidAdminIdentifier(input)
      : [ADMIN_USERNAME, "@admaslottery"].includes(input);

    const passwordOk = password === ADMIN_PASSWORD;

    if (!identityOk || !passwordOk) {
      // Generic error only — never reveal which field failed, the valid
      // identities, or anything about the expected password (length, chars…).
      setError("የተሳሳተ የይለፍ ቃል ነው! እባክዎን ድጋሚ ይሞክሩ።");
      setLoading(false);
      return;
    }

    // Persist authentication state (cookie + localStorage) for /admin entry.
    setAdminSession();
    setMessage("Signed in with local admin credentials. Redirecting...");

    // Redirect to /admin immediately upon successful verification. Using
    // router.replace keeps it client-side and instant; the just-set cookie is
    // sent with the navigation so the middleware lets the route through.
    router.replace("/admin");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0B141B] p-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-yellow-500/30 bg-[#121E28] p-6 shadow-glow">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-yellow-400">Admin Access</p>
          <h1 className="mt-2 text-3xl font-bold">Sign in</h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block space-y-2 text-sm text-slate-200">
            <span>Username or Email</span>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-[#0B141B] px-3 py-2 text-white outline-none ring-0"
              placeholder="admaslottery or admaslottery@gmail.com"
              autoComplete="username"
              required
            />
          </label>

          <label className="block space-y-2 text-sm text-slate-200">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-[#0B141B] px-3 py-2 text-white outline-none ring-0"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {message}
            </div>
          )}

          <button type="submit" className="gold-button w-full px-4 py-3" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
