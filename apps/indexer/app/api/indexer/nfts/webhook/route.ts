import { handleQuickNode } from '../../../../../ingress/handlers.ts';
import { createDeliveryStore } from '../../../../../ingress/deliveries.ts';
import { getIndexerPool } from '../../../../../lib/database.ts';
import { runNftMirror } from '../../../../../lib/nft-mirror/runner.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function POST(request: Request): Promise<Response> {
  return handleQuickNode(request,{run:runNftMirror,deliveries:()=>createDeliveryStore(getIndexerPool()),
    env:{QUICKNODE_WEBHOOK_SECRET:process.env.QUICKNODE_NFT_MIRROR_WEBHOOK_SECRET}});
}
