import { AutomationError } from './launch-automation.ts';
import { runtimeProfileInput, type RuntimeCredentials, type RuntimeProfile } from './season-runtime.ts';

/** Verify the destination with X before persisting; no post is sent here. */
export async function verifySocialAccountInput(input: Record<string, unknown>, dependencies: {
  saved: () => Promise<{ profile: RuntimeProfile; credentials: RuntimeCredentials }>;
  verify: (credentials: RuntimeCredentials, accountId: string) => Promise<{ id: string; username: string }>;
}) {
  const value = runtimeProfileInput(input);
  let credentials = value.credentials;
  if (!credentials) {
    const saved = await dependencies.saved();
    if (saved.profile.expectedAccountId !== value.expectedAccountId) throw new AutomationError('invalid_credentials', 'Changing the X account requires all four credentials for the new account.');
    credentials = saved.credentials;
  }
  const account = await dependencies.verify(credentials, value.expectedAccountId);
  if (account.id !== value.expectedAccountId || account.username.toLowerCase() !== value.handle.toLowerCase()) throw new AutomationError('account_mismatch', 'The handle, numeric account ID and credentials must belong to the same X account.');
  return { ...value, handle: account.username };
}
