import { database } from "../../../../../../lib/database";
import { requireLaunchSession } from "../../../../../../lib/launch-auth";
import { launchAutomationFailure } from "../../../../../../lib/launch-automation-api";
import { exportLaunchAutomation } from "../../../../../../lib/launch-automation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    await requireLaunchSession(request);
    const exported = await exportLaunchAutomation(database(), (await context.params).id);
    return new Response(`${JSON.stringify(exported.artifact, null, 2)}\n`, { headers: {
      "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${exported.filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return launchAutomationFailure(error); }
}
