import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, metrics, urls } from './fixtures';

async function specimens(page: Page) {
  await prepare(page);
  await page.goto(`${urls.landing}/specimens`);
  await expect(page.getByRole('heading', { name: 'Tincta component contracts' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.clock.resume();
}

test.describe('Shared production component contracts', () => {
  test('disabled first and default tabs retain enabled keyboard entry', async ({ page }) => {
    await prepare(page);
    await page.goto(`${urls.landing}/specimens/tabs`);
    await expect(page.getByRole('heading', { name: 'Tab keyboard entry fixtures' })).toBeVisible();
    for (const [label, selected] of [['First disabled', 'Overview'], ['Disabled default', 'Overview'], ['Enabled default', 'History']]) {
      const region = page.getByRole('region', { name: label, exact: true });
      const selectedTab = region.getByRole('tab', { name: selected, exact: true });
      await expect(region.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
      await expect(selectedTab).toHaveAttribute('aria-selected', 'true');
      await expect(region.getByRole('tabpanel')).toContainText(`Available ${selected.toLowerCase()}.`);
      await region.getByRole('button', { name: `Before ${label.toLowerCase()} tabs` }).focus();
      await page.keyboard.press('Tab'); await expect(selectedTab).toBeFocused();
      await page.keyboard.press('End'); await expect(region.getByRole('tab', { name: 'History', exact: true })).toBeFocused();
      await page.keyboard.press('Home'); await expect(region.getByRole('tab', { name: 'Overview', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowRight'); await expect(region.getByRole('tab', { name: 'History', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowRight'); await expect(region.getByRole('tab', { name: 'Overview', exact: true })).toBeFocused();
    }
  });

  test('canonical button variants, icon slot, footer and portal type', async ({ page }) => {
    await specimens(page);
    for (const variant of ['primary','secondary','ghost','destructive','disabled','link']) {
      const m = await metrics(page, `[data-testid="button-${variant}"]`);
      expect(m.size).toBe('14px'); expect(m.line).toBe('20px'); expect(m.weight).toBe('500');
      expect(m.padding).toEqual(['9px','14px','9px','14px']);
      expect(m.margin).toEqual(['0px','0px','0px','0px']); expect(m.radius).toBe('3px'); expect(m.border).toBe('1px');
      expect(m.height).toBe(40); expect(m.gap).toBe('8px');
    }
    const icon = await metrics(page, '[data-testid="button-icon"]');
    expect(icon.width).toBe(40); expect(icon.height).toBe(40); expect(icon.padding).toEqual(['10px','10px','10px','10px']);
    expect(icon.icon).toEqual(['18px','18px','1.6']);
    for (const [variant, hover, pressed] of [['primary','rgb(51, 51, 51)','rgb(0, 0, 0)'],['secondary','rgb(240, 240, 240)','rgb(232, 232, 232)'],['ghost','rgb(240, 240, 240)','rgb(232, 232, 232)'],['destructive','rgb(146, 31, 22)','rgb(122, 26, 19)']]) {
      const control = page.getByTestId(`button-${variant}`);
      await control.hover(); await expect(control).toHaveCSS('background-color',hover);
      await page.mouse.down(); await expect(control).toHaveCSS('background-color',pressed);
      await page.mouse.up();
      await page.keyboard.press('Tab'); await control.focus(); expect(await control.evaluate(element => [getComputedStyle(element).outlineWidth, getComputedStyle(element).outlineOffset])).toEqual(['2px','3px']);
    }
    const action = await metrics(page, '[data-testid="text-action"]');
    expect(action.height).toBeGreaterThanOrEqual(32); expect(action.padding).toEqual(['0px','0px','0px','0px']);
    const footer = await metrics(page, '.ui-footer-link'); expect(footer.size).toBe('13px'); expect(footer.line).toBe('20px'); expect(footer.icon).toEqual(['16px','16px','1.6']);
    expect((await metrics(page, '.ui-footer-heading')).size).toBe('12px');
    expect((await metrics(page, '.ui-footer-legal')).size).toBe('12px');
    await expect(page.locator('footer')).toHaveCount(1); expect(await page.locator('footer').innerText()).toMatch(/© 2026 Tincta/);
    await page.getByRole('combobox', { name: 'Network', exact: true }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    const portal = await metrics(page, '.ui-select-content'); const field = await metrics(page, '.ui-select');
    expect(portal.font).toBe(field.font); expect(portal.size).toBe('14px');
    await expect(page.getByRole('option', { name:'Sepolia test network', exact:true })).toBeFocused();
    await page.keyboard.press('ArrowDown'); await expect(page.getByRole('option', { name:'Ethereum Mainnet', exact:true })).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page.getByRole('combobox', { name: 'Network', exact: true })).toContainText('Ethereum Mainnet');
    await expect(page.getByRole('combobox', { name: 'Network', exact: true })).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot('production-components.png', { fullPage: true });
  });

  test('busy labels keep geometry, reject repeated activation and preserve focus', async ({ page }) => {
    await specimens(page);
    const button = page.getByTestId('button-busy'); const before = await button.boundingBox();
    await button.focus(); await button.click();
    await expect(button).toHaveAttribute('aria-busy','true'); await expect(button).toBeFocused();
    const during = await button.boundingBox(); expect(Math.abs(during!.width - before!.width)).toBeLessThanOrEqual(1); expect(during!.height).toBe(before!.height);
    await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
    await expect(page.getByTestId('specimen-result')).toHaveText('Saving changes.');
    await page.getByRole('button', { name:'Finish simulated request' }).click();
    await expect(button).not.toHaveAttribute('aria-busy', 'true');
    const after = await button.boundingBox(); expect(after!.width).toBe(before!.width); expect(after!.height).toBe(before!.height);
  });

  test('inline validation retains value and names its error', async ({ page }) => {
    await specimens(page);
    const input = page.getByRole('textbox', { name: 'Email', exact: false });
    await input.fill('invalid'); await page.getByRole('button', { name: 'Validate local form' }).click();
    await expect(input).toBeFocused(); await expect(input).toHaveValue('invalid'); await expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await input.getAttribute('aria-describedby'); expect(describedBy).toContain('-error');
    await input.fill('collector@example.invalid'); await page.getByRole('button', { name: 'Validate local form' }).click();
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('specimen-result')).toContainText('No information was sent.');
  });

  test('confirmation cancels, contains focus, restores it and confirms only once', async ({ page }) => {
    await specimens(page);
    const trigger = page.getByRole('button', { name: 'Open confirmation' }); await trigger.click();
    const dialog = page.getByRole('alertdialog'); await expect(dialog).toBeVisible();
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true }); await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Delete specimen', exact:true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(cancel).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot('component-confirmation.png');
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    await expect(page.getByTestId('specimen-result')).toHaveText('Deletion cancelled.');
    await trigger.click(); await page.getByRole('button', { name: 'Delete specimen', exact: true }).click();
    await expect(page.getByTestId('specimen-result')).toHaveText('Deletion confirmed in fixture.');
    await expect(trigger).toBeFocused();
  });

  test('short-screen dialog select, drawer, menu, tabs and tooltip keyboard contract', async ({ page }) => {
    await page.setViewportSize({ width:390,height:568 }); await specimens(page);
    const trigger = page.getByRole('button', { name: 'Open dialog' }); await trigger.click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(16); expect(box!.y).toBeGreaterThanOrEqual(16); expect(box!.y + box!.height).toBeLessThanOrEqual(552);
    await dialog.getByRole('combobox', { name:'Dialog network' }).click();
    await expect(page.getByRole('option', { name:'Sepolia test network', exact:true })).toBeFocused();
    await expect(page).toHaveScreenshot('component-select-in-dialog.png');
    await page.keyboard.press('ArrowDown'); await expect(page.getByRole('option', { name:'Ethereum Mainnet', exact:true })).toBeFocused(); await page.keyboard.press('Enter');
    await expect(dialog.getByRole('combobox')).toContainText('Ethereum Mainnet');
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    await page.getByRole('button', { name:'Open drawer' }).click(); await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('component-drawer.png'); await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name:'Open drawer' })).toBeFocused();
    await page.getByRole('button', { name:'Collection actions' }).click(); await expect(page.getByRole('menuitem', { name:'View details' })).toBeFocused();
    await expect(page).toHaveScreenshot('component-menu.png');
    await page.keyboard.press('ArrowDown'); await expect(page.getByRole('menuitem', { name:'Copy identifier' })).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.getByTestId('specimen-result')).toHaveText('Copy selected in fixture.');
    await page.getByRole('tab', { name:'Overview' }).focus(); await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name:'History' })).toHaveAttribute('aria-selected','true');
    await page.getByRole('button', { name:'Read help' }).focus(); await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page).toHaveScreenshot('component-tooltip.png');
    await page.getByRole('tooltip').hover(); await page.mouse.move(0,0);
    await page.clock.runFor(200);
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.getByRole('tooltip')).toHaveCount(0); await expect(page.getByRole('button', { name:'Read help' })).toBeFocused();
  });

  test('coarse pointer metrics apply at desktop hybrid layout', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block', hasTouch: true, viewport:{ width:1280,height:800 } });
    const page = await context.newPage(); await specimens(page);
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
    const button = await metrics(page, '[data-testid="button-primary"]'); expect(button.height).toBe(44); expect(button.padding).toEqual(['11px','14px','11px','14px']);
    const icon = await metrics(page, '[data-testid="button-icon"]'); expect(icon.height).toBe(44); expect(icon.width).toBe(44); expect(icon.padding).toEqual(['12px','12px','12px','12px']);
    const input = await metrics(page, 'input[type="email"]'); expect(input.size).toBe('16px'); expect(input.height).toBe(44); expect(input.padding).toEqual(['11px','12px','11px','12px']);
    expect((await metrics(page, '.ui-footer-link')).height).toBeGreaterThanOrEqual(44);
    await page.getByTestId('button-busy').tap();
    await expect(page.getByTestId('button-busy')).toHaveAttribute('aria-busy', 'true');
    await page.getByRole('button', { name:'Finish simulated request' }).tap();
    await expect(page.getByTestId('specimen-result')).toHaveText('Changes saved.');
    await page.getByText('I reviewed these terms', { exact:true }).tap();
    await expect(page.getByRole('checkbox', { name:'I reviewed these terms' })).toBeChecked();
    await page.goto(`${urls.landing}/specimens/tabs`);
    const short = await metrics(page, '[data-testid="button-short"]');
    expect(short.width).toBeGreaterThanOrEqual(44); expect(short.height).toBeGreaterThanOrEqual(44);
    expect(short.padding).toEqual(['11px','14px','11px','14px']);
    await context.close();
  });

  test('reduced motion, forced colors and doubled text remain usable', async ({ page }) => {
    await page.setViewportSize({width:320,height:800}); await specimens(page);
    await page.emulateMedia({ reducedMotion:'reduce' });
    expect(await page.locator('.ui-spinner').first().evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await page.emulateMedia({ forcedColors:'active' });
    await page.getByTestId('button-primary').focus();
    expect(await page.getByTestId('button-primary').evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
    await page.emulateMedia({ forcedColors:'none' });
    await page.addStyleTag({content: 'html { font-size: 200%; }'});
    const button = await metrics(page,'[data-testid="button-primary"]'); expect(button.height).toBeGreaterThanOrEqual(80); expect(button.size).toBe('28px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.addStyleTag({content: ':where(p, span, a, button, input, textarea, label) { line-height:1.5; letter-spacing:.12em; word-spacing:.16em; } p { margin-block-end:2em; }'});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.getByTestId('button-primary')).toBeVisible();
  });
});
