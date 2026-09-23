import { newsletterRepository } from "../../../lib/db";
import { registerNewsletter } from "../../../lib/newsletter";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return registerNewsletter(request, newsletterRepository);
}
