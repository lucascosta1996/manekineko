import { renderSeasonSocialSvg } from "@manekineko/contract-abi/season-social-image";
import { database } from "../../../../../../../lib/database";
import { requireLaunchSession } from "../../../../../../../lib/launch-auth";
import { launchAutomationFailure, launchAutomationResponse } from "../../../../../../../lib/launch-automation-api";
import { getLaunchAutomation } from "../../../../../../../lib/launch-automation-store";
import { getRuntimeProfile } from "../../../../../../../lib/season-runtime-store";
import { seasonRuntimePreviews } from "../../../../../../../lib/season-runtime-preview";
import { AutomationError } from "../../../../../../../lib/launch-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requireLaunchSession(request);
    const saved = await getLaunchAutomation(database(), (await context.params).id);
    const profile = await getRuntimeProfile(database(), saved.plan.chainId);
    const previews = seasonRuntimePreviews(saved, profile?.publicBaseUrl);
    const params = new URL(request.url).searchParams, imageKey = params.get("image");
    if (!imageKey) return launchAutomationResponse({ previews });
    if (params.get("revision") !== String(saved.revision)) throw new AutomationError("revision_conflict", "Reload the saved season previews.", 409);
    const preview = previews.find(item => item.key === imageKey);
    if (!preview) throw new AutomationError("not_found", "This preview is unavailable until the collection terms are complete.", 404);
    return new Response(renderSeasonSocialSvg(preview.message, { preview: true }), { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
  } catch (error) { return launchAutomationFailure(error); }
}
