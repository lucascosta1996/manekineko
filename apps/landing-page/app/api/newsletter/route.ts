import { newsletterRepository } from "../../../lib/db";
import { newsletterPreflight, registerNewsletter } from "../../../lib/newsletter";

export const runtime = "nodejs";

export function OPTIONS(request: Request): Response {
  return newsletterPreflight(request);
}

export async function POST(request: Request): Promise<Response> {
  return registerNewsletter(request, newsletterRepository);
}
