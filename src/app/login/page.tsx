"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Activity, Loader2, Mail } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  if (!supabase) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-[#a0a0a0]">
          Authentication is not configured yet.{" "}
          <Link href="/" className="text-[#5ba3e6] hover:underline">
            Back to scanner
          </Link>
        </p>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  if (sent) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <Mail className="mb-4 h-12 w-12 text-[#5ba3e6]" />
        <h1 className="mb-2 text-xl font-bold text-white">Check your email</h1>
        <p className="mb-6 max-w-sm text-sm text-[#a0a0a0]">
          We sent a magic link to <strong className="text-white">{email}</strong>.
          Click the link to sign in.
        </p>
        <button
          onClick={() => setSent(false)}
          className="text-sm text-[#5ba3e6] hover:underline"
        >
          Try a different email
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Activity className="mx-auto mb-3 h-8 w-8 text-[#5ba3e6]" />
          <h1 className="text-xl font-bold text-white">Sign in to EW Scanner</h1>
          <p className="mt-1 text-sm text-[#a0a0a0]">
            Save watchlists and scans to the cloud
          </p>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#222]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285f4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="#34a853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#fbbc05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#ea4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[#2a2a2a]" />
          <span className="text-xs text-[#555]">or</span>
          <div className="h-px flex-1 bg-[#2a2a2a]" />
        </div>

        {/* Magic link */}
        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="w-full rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder-[#555] focus:border-[#185FA5] focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !email}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#185FA5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1a6dba] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Send magic link
          </button>
        </form>

        {error && (
          <p className="text-center text-xs text-red-400">{error}</p>
        )}

        <p className="text-center text-xs text-[#555]">
          No account needed — we&apos;ll create one automatically.
          <br />
          <Link href="/" className="text-[#5ba3e6] hover:underline">
            Continue without signing in
          </Link>
        </p>
      </div>
    </div>
  );
}
