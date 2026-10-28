import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prepare, ready, urls, widths } from "./fixtures";
for (const [width, height] of widths)
  test(`V13 landing holder explanation ${width}`, async ({ page }, info) => {
    test.skip(
      info.project.name !== "chromium" && ![390, 1440].includes(width),
      "Primary engine covers all five sizes."
    );
    await page.setViewportSize({ width, height });
    await prepare(page);
    await page.goto(`${urls.landing}/rewards`);
    await ready(page);
    await page.clock.resume();
    const section = page.getByRole("region", {
      name: "A season pool for NFT holders.",
    });
    await section.scrollIntoViewIfNeeded();
    await expect(section).toContainText("PLANNED FOR LAUNCH");
    await expect(section).toContainText("first 5%");
    await expect(
      section.getByRole("link", { name: "Explore holder rewards" })
    ).toHaveAttribute("href", `${urls.web}/holders`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .include('section[aria-labelledby="holders-title"]')
          .analyze()
      ).violations
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/v13-landing-${width}-${info.project.name}.png`,
    });
    await page.getByText("How are season holder rewards calculated?", { exact: true }).click();
    await expect(page.getByText(/neither the pool nor the payout is a fixed ETH amount/)).toBeVisible();
    await page.getByText("Who can claim from the holder pool?", { exact: true }).click();
    await expect(page.getByText(/Transferring an NFT transfers its unclaimed opportunity/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("#questions").analyze()).violations).toEqual([]);
    await page.screenshot({path: `test-results/v13-holder-faq-${width}-${info.project.name}.png`});
  });
