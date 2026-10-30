import { timingSafeEqual } from 'node:crypto';
export function senderAuthorized(request: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length<32) return false;
  const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(request.headers.get('authorization') ?? '');
  return expected.length===actual.length && timingSafeEqual(expected,actual);
}
