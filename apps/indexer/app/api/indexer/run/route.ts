import { handleRun } from "../../../../ingress/handlers.ts";
import { runIndexerCycle } from "../../../../lib/indexer.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<Response> {
  return handleRun(request, { run: runIndexerCycle });
}
