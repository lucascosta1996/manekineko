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

/** Read-only identity check. Never returns credentials or changes the profile. */
export async function testSavedSocialAccount(dependencies: {
  saved: () => Promise<{ profile: RuntimeProfile; credentials: RuntimeCredentials }>;
  current: () => Promise<RuntimeProfile | null>;
  verify: (credentials: RuntimeCredentials, accountId: string) => Promise<{ id: string; username: string }>;
}) {
  const { profile, credentials } = await dependencies.saved();
  const account = await dependencies.verify(credentials, profile.expectedAccountId);
  if (account.id !== profile.expectedAccountId || account.username.toLowerCase() !== profile.handle.toLowerCase()) throw new AutomationError('account_mismatch', 'X returned a different account. Update the saved account in X account settings.', 422);
  const current = await dependencies.current();
  if (!current || current.revision !== profile.revision || current.chainId !== profile.chainId || current.expectedAccountId !== profile.expectedAccountId) throw new AutomationError('profile_changed', 'The saved X account changed during this check. Test the connection again.', 409);
  return { chainId: profile.chainId, account: { id: account.id, username: account.username }, checkedAt: new Date().toISOString() };
}
