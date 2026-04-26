"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { LogOut, User as UserIcon } from "lucide-react";

export function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  // Hide auth button entirely if Supabase isn't configured
  if (!supabase) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-[#a0a0a0] transition-colors hover:bg-[#1a1a1a] hover:text-white"
      >
        <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
        Sign in
      </Link>
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#a0a0a0]">
        {user.email?.split("@")[0]}
      </span>
      <button
        onClick={handleSignOut}
        className="rounded-md p-1.5 text-[#a0a0a0] transition-colors hover:bg-[#1a1a1a] hover:text-white"
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
