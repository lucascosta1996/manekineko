import { connectWebWallet } from "./web-wallet-fixture";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prepare, ready, urls, widths } from "./fixtures";
import { rpc, installRejectingWallet, A, T } from "./v12-rpc";
test.use({ trace: "on", video: "on" });

for (const [width, height] of widths)
  for (const state of ["locked", "open"] as const) {
    test(`V13 holder pool ${state} ${width}`, async ({ page }, info) => {
      test.skip(
        info.project.name !== "chromium" && ![390, 1440].includes(width),
        "Primary engine covers all five sizes."
      );
      await page.setViewportSize({ width, height });
      await prepare(page);
      await rpc(page, state === "locked" ? 1 : 5, false, { holderState: state });
      await page.clock.resume();
      await page.goto(`${urls.web}/holders`);
      await expect(page.locator(".holder-state")).toHaveText(
        state === "locked" ? "Locked until season end" : "Claims open"
      );
      await ready(page);
      await expect(page.locator(".holder-total")).toHaveText(
        "8.0 ETH accumulated"
      );
      await expect(
        page.getByRole("progressbar", { name: "Season progress" })
      ).toHaveAttribute("value", state === "locked" ? "7" : "10");
      await expect(
        page.getByRole("button", {
          name: state === "locked" ? "Claims locked" : "Review holder claim",
          exact: true,
        })
      ).toBeDisabled();
      await expect(page.locator(".public-allocation-grid dt")).toHaveText([
        "60% · Winning tickets", "20% · Qualified affiliates",
        "8% · Holder rewards", "12% · Protocol treasury",
      ]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: `test-results/v13-holders-${state}-${width}-${info.project.name}.png`,
        fullPage: true,
      });
      if (
        state === "open" &&
        width === 1440 &&
        info.project.name === "chromium"
      )
        await page.screenshot({
          path: "test-results/v13-holders-preview.png",
          fullPage: false,
        });
    });
  }
for (const state of ["exhausted", "empty"] as const)
  test(`V13 ${state} has no claim action`, async ({ page }) => {
    await prepare(page);
    await rpc(page, 5, false, { holderState: state });
    await page.clock.resume();
    await page.goto(`${urls.web}/holders`);
    await expect(page.locator(".holder-state")).toHaveText(
      state === "empty" ? "No eligible NFTs" : "Fully claimed"
    );
    await expect(
      page.getByRole("button", { name: "Review holder claim" })
    ).toHaveCount(0);
  });
test("V13 pending, pool verification error and recovery never expose an unsafe claim", async ({
  page,
}) => {
  await prepare(page);
  await page.clock.resume();
  await page.route(
    "https://v12.fixture.invalid/**",
    (route) =>
      new Promise<void>((resolve) => {
        void route.abort().then(resolve);
      })
  );
  await page.goto(`${urls.web}/holders`);
  await expect(
    page.getByRole("button", { name: "Review holder claim" })
  ).toHaveCount(0);
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 5, false, { holderState: "open", holderBadPin: true });
  // Reload starts a new, deterministic verification attempt after a transport failure.
  await page.reload();
  await expect(page.locator(".protocol-page [role=alert]")).toContainText(
    "holder rewards contract could not be verified"
  );
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 5, false, { holderState: "open" });
  await page.getByRole("button", { name: "Retry network read" }).click();
  await expect(page.locator(".holder-state")).toHaveText("Claims open");
});
for (const width of [390, 1440])
  test(`V13 review checks ownership, preserves amount and handles wallet rejection without a duplicate ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 568 : 900 });
    await prepare(page);
    await rpc(page, 5, false, { holderState: "open" });
    await page.clock.resume();
    await installRejectingWallet(page);
    await page.goto(`${urls.web}/holders`);
    await expect(page.locator(".holder-state")).toHaveText("Claims open");
    await connectWebWallet(page, A);
    await page.getByLabel("NFT token ID").fill("2");
    await page
      .getByRole("button", { name: "Review holder claim", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toContainText(
      "Claim 0.016 ETH for NFT #2"
    );
    await expect(page.getByRole("alertdialog")).toContainText(
      "does not reserve a slot"
    );
    expect(
      (await new AxeBuilder({ page }).include("[role=alertdialog]").analyze())
        .violations
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/v13-claim-review-${width}-${info.project.name}.png`,
    });
    await page.getByRole("button", { name: "Continue to wallet" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /declined/i })
    ).toBeVisible();
    expect(
      await page.evaluate(() => (window as any).__v12Submissions.length)
    ).toBe(1);
    await page.unroute("https://v12.fixture.invalid/**");
    await rpc(page, 5, false, { holderState: "open", holderOwner: T });
    await page
      .getByRole("button", { name: "Review holder claim", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Connect the current owner" })
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });
test("V13 first paint, keyboard, text reflow and stale refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await rpc(page, 5, false, { holderState: "open" });
  await page.route("https://v12.fixture.invalid/**", async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto(`${urls.web}/holders`);
  await expect(
    page.getByText("Reading the collection contracts…")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry network read" })
  ).toHaveCount(0);
  await expect(page.locator(".holder-total")).toHaveCount(0);
  await page.screenshot({ path: "test-results/v13-holders-pending.png" });
  release();
  await page.clock.resume();
  await expect(page.locator(".holder-state")).toHaveText("Claims open");
  await page
    .locator("summary")
    .filter({ hasText: "Eligibility, transfers & the 5% limit" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("There is no per-wallet limit.", { exact: false })
  ).toBeVisible();
  await page.addStyleTag({
    content:
      "html{font-size:200%} p{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 5, true, { holderState: "open" });
  await page.clock.runFor(12_100);
  await expect(
    page.getByText("Showing the last verified snapshot.", { exact: false })
  ).toBeVisible();
  await expect(page.locator(".holder-total")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review holder claim" })
  ).toBeDisabled();
});
test("V13 a pool exhausted during review cannot request a wallet signature", async ({
  page,
}) => {
  await prepare(page);
  await rpc(page, 5, false, { holderState: "open" });
  await page.clock.resume();
  await installRejectingWallet(page);
  await page.goto(`${urls.web}/holders`);
  await expect(page.locator(".holder-state")).toHaveText("Claims open");
  await connectWebWallet(page, A);
  await page
    .getByRole("button", { name: "Review holder claim", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 5, false, { holderState: "exhausted" });
  await page.getByRole("button", { name: "Continue to wallet" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "All holder reward claims have been taken" })
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__v12Submissions.length)
  ).toBe(0);
});
test("V13 unconfigured and V12 routes do not invent a holder balance", async ({
  page,
}) => {
  await prepare(page);
  await page.goto(`${urls.web}/holders?state=unconfigured`);
  await expect(
    page.getByText("Onchain seasons are being prepared.")
  ).toBeVisible();
  await expect(page.locator(".holder-total")).toHaveCount(0);
  await rpc(page, 5);
  await page.clock.resume();
  await page.goto(`${urls.web}/holders?state=v12`);
  await expect(
    page.getByText("No holder pool in this deployment.")
  ).toBeVisible();
  await expect(page.locator(".holder-total")).toHaveCount(0);
});
