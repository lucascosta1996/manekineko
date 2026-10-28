import 'server-only';
import { redirect } from 'next/navigation';
import { LaunchAuthError, requireLaunchSession } from './launch-auth';
import { safeLaunchDestination } from './launch-navigation';

/** Verify each protected page before producing its client/RSC payload. */
export async function requireLaunchPage(destination: string) {
  try { return await requireLaunchSession(); }
  catch (error) {
    if (error instanceof LaunchAuthError && error.status === 401) redirect(`/login?next=${encodeURIComponent(safeLaunchDestination(destination))}`);
    // Storage failures must not turn into authenticated access.
    throw error;
  }
}
