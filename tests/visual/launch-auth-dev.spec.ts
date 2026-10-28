import { test, expect } from '@playwright/test';
const origin = process.env.LAUNCH_DEV_URL;
if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error('Launch authentication checks require a loopback origin.');
test('real Launch pages and image APIs reject missing, malformed and unknown sessions', async ({ page, request }) => {
  test.skip(!origin, 'Set LAUNCH_DEV_URL to the running Launch server. No login or database fixture is created.');
  await page.context().route('**/*', route => new URL(route.request().url()).origin === origin && route.request().method() === 'GET' ? route.continue() : route.abort());
  for (const token of [undefined, 'malformed', 'A'.repeat(43)]) {
    await page.context().clearCookies();
    if (token) await page.context().addCookies([{ name: 'manekineko-launch', value: token, url: origin!, httpOnly: true, sameSite: 'Strict' }]);
    for (const path of ['/dashboard', '/social', '/social/account']) {
      await page.goto(`${origin}${path}?chainId=1`);
      await expect(page).toHaveURL(`${origin}/login?next=${encodeURIComponent(`${path}?chainId=1`)}`);
      await expect(page.getByRole('heading', { name: 'Sign in to Launch' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Operator navigation' })).toHaveCount(0);
      await expect(page.locator('.social-preview-frame')).toHaveCount(0);
    }
    for (const path of ['/api/social-preview?chainId=1', '/api/social-preview?chainId=1&format=png', '/api/social-account?chainId=1']) {
      const result = await request.get(`${origin}${path}`, { headers: token ? { Cookie: `manekineko-launch=${token}` } : {} });
      expect(result.status()).toBe(401); expect(result.headers()['cache-control']).toBe('no-store');
    }
  }
  const deniedTest = await request.post(`${origin}/api/social-account?chainId=11155111`, { headers: { Origin: origin! } });
  expect(deniedTest.status()).toBe(401);
  for (const [path, method] of [['/api/auth/session', 'POST'], ['/api/auth/session', 'DELETE'], ['/api/social-account', 'PUT'], ['/api/social-account', 'POST']]) {
    const result = await request.fetch(`${origin}${path}`, { method, headers: { Origin: 'https://wrong-origin.invalid', 'Content-Type': 'application/json' }, data: '{}' });
    expect(result.status()).toBe(403);
  }
});
