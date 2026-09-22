import { handleStatus } from "../../../../ingress/handlers.ts";
import { readIndexerStatus } from "../../../../ingress/status.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  return handleStatus(request, { status: readIndexerStatus });
}
