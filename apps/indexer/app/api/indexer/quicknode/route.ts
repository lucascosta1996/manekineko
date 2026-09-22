import { createDeliveryStore } from "../../../../ingress/deliveries.ts";
import { handleQuickNode } from "../../../../ingress/handlers.ts";
import { getIndexerPool } from "../../../../lib/database.ts";
import { runIndexerCycle } from "../../../../lib/indexer.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  return handleQuickNode(request, { run: runIndexerCycle, deliveries: () => createDeliveryStore(getIndexerPool()) });
}
