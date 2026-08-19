/**
 * Hand-entered catalyst tags — CRUD.
 *
 * Writes require an authenticated user. These endpoints mutate a shared table, and an
 * open POST would let anyone add or overwrite rows that then appear in the nightly
 * Telegram. GET is also gated: a catalyst you are tracking is a trading intention, not
 * public information.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";
import {
  loadCatalystTags,
  upsertCatalystTag,
  deleteCatalystTag,
  type CatalystTag,
} from "@/lib/supabase/catalyst-tags";

async function requireUser() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

export async function GET(request: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const tags = await loadCatalystTags({
      withinDays: Number(searchParams.get("withinDays") ?? 90),
      pastDays: Number(searchParams.get("pastDays") ?? 7),
      includeResolved: searchParams.get("includeResolved") === "true",
    });
    return NextResponse.json({ tags });
  } catch (err) {
    logError("api/catalyst-tags/GET", err);
    return NextResponse.json({ error: "Failed to load catalyst tags" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as Partial<CatalystTag>;

    const ticker = body.ticker?.trim().toUpperCase();
    const eventDate = body.event_date?.trim();
    const eventType = body.event_type?.trim();

    if (!ticker || !eventDate || !eventType) {
      return NextResponse.json(
        { error: "ticker, event_date and event_type are required" },
        { status: 400 },
      );
    }
    // Reject a malformed date here rather than letting Postgres decide what
    // "2026-8-3" or "next tuesday" means.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate))) {
      return NextResponse.json({ error: "event_date must be YYYY-MM-DD" }, { status: 400 });
    }

    const ok = await upsertCatalystTag({
      ticker,
      event_date: eventDate,
      event_type: eventType,
      note: body.note?.trim() || null,
      resolved: body.resolved ?? false,
      outcome: body.outcome?.trim() || null,
    });
    if (!ok) {
      return NextResponse.json({ error: "Failed to save catalyst tag" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("api/catalyst-tags/POST", err);
    return NextResponse.json({ error: "Failed to save catalyst tag" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const ok = await deleteCatalystTag(id);
    if (!ok) {
      return NextResponse.json({ error: "Failed to delete catalyst tag" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("api/catalyst-tags/DELETE", err);
    return NextResponse.json({ error: "Failed to delete catalyst tag" }, { status: 500 });
  }
}
