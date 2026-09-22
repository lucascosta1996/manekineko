import { handleMetadata } from '../../../../ingress/handlers.ts';
import { runMetadataCycle } from '../../../../lib/metadata-worker.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request): Promise<Response> {
  return handleMetadata(request, { run: runMetadataCycle });
}
