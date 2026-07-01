import { NextRequest } from "next/server";
import { GET as presetHandler } from "../preset/route";

export const maxDuration = 300;

/** Resume pass: re-invokes the preset cron with ?resume=true to scan remaining tickers. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  url.searchParams.set("resume", "true");
  const resumeRequest = new NextRequest(url, {
    headers: request.headers,
  });
  return presetHandler(resumeRequest);
}
