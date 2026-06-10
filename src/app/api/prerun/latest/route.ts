import { NextResponse } from "next/server";
import { fetchLatestPrerunSignals } from "@/lib/supabase/query";

export async function GET() {
  const result = await fetchLatestPrerunSignals();
  return NextResponse.json(result);
}
