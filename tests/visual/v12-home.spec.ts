import { connectWebWallet } from "./web-wallet-fixture";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Interface, parseEther } from "ethers";
import { prepare, ready, urls, metrics } from "./fixtures";
import { rpc, installRejectingWallet, A, T } from "./v12-rpc";
import ra from "../../packages/contracts/src/ManekinekoRoundV12.json";

const connect = connectWebWallet;

for (const width of [320, 390, 768, 1280, 1440]) {
  for (const [path, phase, heading] of [
    ["/", 3, "Your tickets are in the draw."],
    ["/", 5, "Meet the winning tickets."],
    ["/", 7, "Claim your refund"],
    ["/claims", 5, "Winning tickets"],
    ["/affiliates", 0, "Invite people. Share the rewards."],
  ] as const) {
    test(`public ${path} phase ${phase} at ${width}`, async ({
      page,
    }, info) => {
      // Main engine covers all sizes; both other engines cover the critical narrow/wide views.
      test.skip(
        info.project.name !== "chromium" && ![390, 1440].includes(width),
        "Secondary engine viewport sample"
      );
      await page.setViewportSize({ width, height: 900 });
      await prepare(page);
      await rpc(page, phase);
      await page.clock.resume();
      await page.goto(urls.web + path);
      await expect(
        page.getByRole("heading", { name: heading, exact: true })
      ).toBeVisible();
      await ready(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Mint tickets", exact: true })
      ).toHaveCount(0);
      if (path === "/claims") {
        await expect(page.locator(".public-holder")).toHaveCount(6);
        await expect(page.locator(".public-holder").first()).toHaveText(A);
        await expect(
          page.getByRole("button", { name: "Claim prize", exact: true }).first()
        ).toBeDisabled();
      }
      expect(
        (await new AxeBuilder({ page }).include("main").analyze()).violations
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/v12-public-${info.project.name}-${
          path.replaceAll("/", "") || "home"
        }-${phase}-${width}.png`,
        fullPage: true,
      });
    });
  }
}

test("home centers the verified stage and never opens refunds from a browser countdown", async ({
  page,
}) => {
  await prepare(page);
  await rpc(page, 0, false, { duration: 900 });
  await page.clock.resume();
  await page.goto(urls.web + "/");
  await expect(
    page.getByRole("heading", { name: "Cast your vote" })
  ).toBeVisible();
  await expect(page.getByText("15 minutes", { exact: true })).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "Mint a ticket" })
  ).toHaveCount(0);
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 1);
  await page.clock.fastForward(13000);
  await expect(
    page.getByRole("heading", { name: "Mint a ticket" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cast your vote" })
  ).toHaveCount(0);
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 1, false, {
    deadline: Math.floor(Date.parse("2026-09-28T12:00:00Z") / 1000) - 1,
  });
  await page.clock.fastForward(13000);
  await expect(
    page.getByText("Mint deadline reached.", { exact: false })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refund ticket", exact: true })
  ).toHaveCount(0);
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 7);
  await page.clock.fastForward(13000);
  await expect(
    page.getByRole("heading", { name: "Claim your refund" })
  ).toBeVisible();
});

test("mint keeps referral and exact total through review; invalid quantity cannot submit", async ({
  page,
}) => {
  await prepare(page);
  await rpc(page, 1);
  await installRejectingWallet(page);
  await page.clock.resume();
  await page.goto(urls.web + "/?collection=2&affiliate=3");
  await connect(page);
  await expect(page.getByText("Affiliate position 3 applied")).toBeVisible();
  await page.getByLabel("Number of tickets", { exact: true }).fill("21");
  await expect(
    page.getByRole("button", { name: "Mint tickets", exact: true })
  ).toBeDisabled();
  await expect(
    page.getByText("Enter a whole number from 1 to 20.")
  ).toBeVisible();
  await page.getByLabel("Number of tickets", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Mint tickets", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("0.02 ETH");
  await page.getByRole("button", { name: "Continue to wallet" }).click();
  await expect(
    page.getByText(
      "The wallet request was declined. Nothing else will be sent automatically."
    )
  ).toBeVisible();
  const sent = await page.evaluate(() => (window as any).__v12Submissions);
  expect(sent).toHaveLength(1);
  expect(BigInt(sent[0][0].value)).toBe(parseEther("0.02"));
  const call = new Interface(ra).parseTransaction(sent[0][0]);
  expect(call?.name).toBe("mintQuoted");
  expect(call?.args[1]).toBe(2n);
  expect(call?.args[2]).toBe(3n);
});

test("claims show all holders, support previous collections and guard paid prizes", async ({
  page,
}) => {
  await prepare(page);
  await rpc(page, 5);
  await installRejectingWallet(page);
  await page.clock.resume();
  await page.goto(urls.web + "/claims?collection=1");
  await connect(page);
  const action = page
    .getByRole("button", { name: "Claim prize", exact: true })
    .first();
  await expect(action).toBeEnabled();
  await action.click();
  await expect(page.getByRole("alertdialog")).toContainText("1.0 ETH");
  await page.getByRole("button", { name: "Continue to wallet" }).click();
  await expect(
    page.getByText(
      "The wallet request was declined. Nothing else will be sent automatically."
    )
  ).toBeVisible();
  const sent = await page.evaluate(() => (window as any).__v12Submissions);
  expect(new Interface(ra).parseTransaction(sent[0][0])?.name).toBe(
    "claimPrizeForRank"
  );
  await page.getByRole("combobox", { name: "Collection", exact: true }).click();
  await page
    .getByRole("option", { name: "Collection 2 · Latest", exact: true })
    .click();
  await expect(page).toHaveURL(/collection=2/);
  await expect(page.getByRole("combobox")).toContainText(
    "2 · Fictional voting study"
  );
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 6);
  await page.clock.fastForward(13000);
  await expect(
    page.getByRole("button", { name: "Claimed", exact: true })
  ).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Claimed", exact: true }).first()
  ).toBeDisabled();
});

test("affiliate page exposes enrollment and a collection-bound referral after joining", async ({
  page,
}) => {
  await prepare(page);
  await rpc(page, 0);
  await installRejectingWallet(page);
  await page.clock.resume();
  await page.goto(urls.web + "/affiliates");
  await connect(page);
  await expect(
    page.getByRole("heading", { name: "Invite people. Share the rewards." })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enroll for position 3" })
  ).toBeEnabled();
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 0, false, { affiliateId: 3 });
  await page.clock.fastForward(13000);
  await expect(
    page.getByRole("link", { name: "Your referral link", exact: true })
  ).toHaveAttribute("href", "/?collection=2&affiliate=3");
  await expect(
    page.getByRole("button", { name: "Copy referral link" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Claim affiliate reward" })
  ).toBeDisabled();
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 5, false, { affiliateId: 3 });
  await page.clock.fastForward(13000);
  await expect(
    page.getByRole("button", { name: "Claim affiliate reward" })
  ).toBeEnabled();
});

test("first read, stale recovery and retry preserve honest state and user input", async ({
  page,
}) => {
  await prepare(page);
  await rpc(page, 1);
  await installRejectingWallet(page);
  await page.clock.resume();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("https://v12.fixture.invalid/**", async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto(urls.web + "/");
  await expect(
    page
      .getByRole("status", { name: "" })
      .filter({ hasText: "Reading the collection contracts" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry network read" })
  ).toHaveCount(0);
  await page.screenshot({path: `test-results/v12-home-pending.png`, fullPage: true});
  release();
  await expect(
    page.getByRole("heading", { name: "Mint a ticket" })
  ).toBeVisible();
  await connect(page);
  await expect(page.getByRole("button", { name: "Mint tickets", exact: true })).toBeEnabled();
  await page.getByLabel("Number of tickets", { exact: true }).fill("3");
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 1, true);
  await page.clock.fastForward(13000);
  await expect(page.locator(".public-workspace [role=alert]")).toContainText(
    "last verified snapshot"
  );
  await expect(
    page.getByLabel("Number of tickets", { exact: true })
  ).toHaveValue("3");
  await expect(
    page.getByRole("button", { name: "Mint tickets", exact: true })
  ).toBeDisabled();
  await page.unroute("https://v12.fixture.invalid/**");
  await rpc(page, 1);
  await page.getByRole("button", { name: "Retry network read" }).click();
  await expect(
    page.getByRole("button", { name: "Mint tickets", exact: true })
  ).toBeEnabled();
});

test("live action reflows with enlarged text, keyboard navigation and coarse targets", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 568 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await prepare(page);
  await rpc(page, 0);
  await page.clock.resume();
  await page.goto(urls.web + "/");
  await expect(
    page.getByRole("heading", { name: "Cast your vote" })
  ).toBeVisible();
  const m = await metrics(page, ".header-wallet .ui-button:visible");
  expect(m.height).toBeGreaterThanOrEqual(44);
  expect(m.width).toBeGreaterThanOrEqual(44);
  expect(m.padding).toEqual(["12px", "12px", "12px", "12px"]);
  await page.getByRole("button", { name: "Open menu" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("link", { name: "Affiliates", exact: true })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addStyleTag({ content: "html{font-size:200%}" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  ).toBe(true);
  await page.addStyleTag({
    content:
      ":where(p,span,a,button,input,label){line-height:1.5;letter-spacing:.12em;word-spacing:.16em}p{margin-block-end:2em}",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  ).toBe(true);
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.locator("[aria-current=step]")).toContainText("Vote");
  await context.close();
});

test('returning home clears an old collection and its referral during client navigation', async ({page})=>{
  await prepare(page); await rpc(page,1); await page.clock.resume();
  await page.goto(urls.web+'/?collection=1&affiliate=3');
  await expect(page.getByText('You’re viewing an earlier collection from a saved link.')).toBeVisible();
  await page.getByRole('link',{name:'Participate',exact:true}).click();
  await expect(page).toHaveURL(urls.web+'/');
  await expect(page.getByText('You’re viewing an earlier collection from a saved link.')).toHaveCount(0);
  await expect(page.getByText('Have an affiliate link?',{exact:true})).toBeVisible();
});

test('no prepared round is distinct from pending and earlier voting deposits remain accessible after voting',async({page})=>{
  await prepare(page);await rpc(page,0,false,{count:0});await page.clock.resume();await page.goto(urls.web+'/');
  await expect(page.getByRole('heading',{name:'The first collection is next.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Mint tickets',exact:true})).toHaveCount(0);
  await page.unroute('https://v12.fixture.invalid/**');await rpc(page,5,false,{legacy:true});
  await page.goto(urls.web+'/claims');
  await page.getByText('Manage earlier NFTs for voting',{exact:true}).click();
  await expect(page.getByRole('button',{name:'Withdraw NFT',exact:true})).toBeVisible();
});
