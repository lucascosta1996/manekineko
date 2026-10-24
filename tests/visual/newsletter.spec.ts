import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls, widths } from './fixtures';

for (const route of ['/', '/rewards']) {
  for (const [width, height] of widths) {
    test(`launch signup layout ${route} ${width}`, async ({page, browserName}, info) => {
      test.skip(browserName !== 'chromium' && ![390, 1440].includes(width));
      await page.setViewportSize({width, height});await prepare(page);
      await page.goto(urls.landing + route);await ready(page);
      const section = page.locator('#launch-list');
      await section.scrollIntoViewIfNeeded();
      await expect(section.getByRole('textbox', {name:'Email address'})).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await section.screenshot({path:info.outputPath('signup.png')});
      await page.clock.resume();expect((await new AxeBuilder({page}).include('#launch-list').analyze()).violations).toEqual([]);
      if (route === '/rewards') {
        if (width < 960) await page.getByRole('button', {name:'Open navigation'}).click();
        await expect(page.getByRole('link', {name:'Open app', exact:true})).toHaveAttribute('href', 'https://app.tincta.xyz');
      }
    });
  }
  for (const width of [390, 1440]) {
    test(`launch signup validates, retries and confirms once ${route} ${width}`, async ({page, browserName}) => {
      await page.setViewportSize({width, height:844});await prepare(page);
      await page.goto(urls.landing + route);await ready(page);
      const form = page.getByRole('form', {name:'Launch notifications'});
      const email = form.getByRole('textbox', {name:'Email address'});
      const button = form.getByRole('button');
      await email.scrollIntoViewIfNeeded();
      const fieldBefore = await email.boundingBox();
      const borderBefore = await email.evaluate(element => getComputedStyle(element).borderColor);
      await email.click();
      await expect(email).toBeFocused();
      await expect(email).toHaveCSS('outline-style', 'none');
      await expect(email).toHaveCSS('box-shadow', 'none');
      await expect(email).toHaveCSS('border-color', borderBefore);
      await expect(email).toHaveCSS('background-color', 'rgb(240, 240, 240)');
      expect(await email.boundingBox()).toEqual(fieldBefore);
      // Safari on macOS uses Option-Tab to include buttons in keyboard navigation.
      await page.keyboard.press(browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
      await expect(button).toBeFocused();
      await expect(button).toHaveCSS('outline-style', 'none');
      await expect(button).toHaveCSS('text-decoration-line', 'underline');
      await button.click();await expect(email).toBeFocused();await expect(email).toHaveAttribute('aria-invalid', 'true');
      await email.fill('collector@example.invalid');
      let count = 0, release!: () => void;
      const held = new Promise<void>(resolve => release = resolve);
      await page.route('**/api/newsletter', async route => {count++;await held;await route.fulfill({status:503,json:{error:'Unavailable'}});});
      const before = await button.boundingBox();
      await button.click();await expect(button).toHaveAttribute('aria-busy','true');
      await form.evaluate(element => { (element as HTMLFormElement).requestSubmit();(element as HTMLFormElement).requestSubmit(); });
      expect(count).toBe(1);expect(await button.boundingBox()).toEqual(before);
      release();await expect(form).toContainText('We couldn’t save your email');await expect(email).toHaveValue('collector@example.invalid');
      await page.route('**/api/newsletter', route => route.fulfill({status:429,json:{error:'Rate limited'}}));
      await button.click();await expect(form).toContainText('Too many attempts');await expect(email).toHaveValue('collector@example.invalid');
      await page.route('**/api/newsletter', route => route.fulfill({json:{success:true}}));
      await button.click();await expect(form).toContainText('You’re on the list.');await expect(button).toBeDisabled();
      expect(await button.boundingBox()).toEqual(before);
      await expect(form).toContainText(route === '/' ? 'upcoming Tincta launches' : 'voting and minting open');
      await page.clock.resume();expect((await new AxeBuilder({page}).include('#launch-list').analyze()).violations).toEqual([]);
    });
  }
}
