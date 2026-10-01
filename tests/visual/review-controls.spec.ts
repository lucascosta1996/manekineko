import { test, expect } from '@playwright/test';
import { prepare, ready, urls } from './fixtures';
import { visualCollection, visualProgram } from '../../apps/web/test/visual-data';
import { launchFixtureAutomation } from '../../apps/launch/test/visual-data';

for (const width of [390,1440]) test(`Review enrollment has one opening countdown and a spaced retryable confirmation ${width}`, async ({page})=>{
  await prepare(page);await page.setViewportSize({width,height:900});
  await page.route('**/api/collections/*/affiliates',route=>route.fulfill({json:{program:{...visualProgram,saleActivated:false,enrollmentStatus:'open',enrollmentOpensAt:'2026-09-28T11:45:00Z',saleStartAt:'2026-09-28T12:30:00Z',readiness:{...visualProgram.readiness,canEnroll:true}}}}));
  // Only the isolated fixture supplies this provider stub. No real CAPTCHA or wallet request.
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>route.fulfill({contentType:'text/javascript',body:`window.turnstile={render(container,options){window.fixtureChecks??=[];const id=String(window.fixtureChecks.length);window.fixtureChecks.push(options);const control=document.createElement('button');control.textContent='Complete fixture verification';control.onclick=()=>options.callback('fixture-token');container.append(control);return id},remove(){}};`}));
  await page.goto(`${urls.web}/visual/review-controls`);await ready(page);
  await expect(page.getByText('Affiliate enrollment open',{exact:true})).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(1);
  const confirm=page.getByRole('button',{name:'Confirm on-chain enrollment',exact:true});
  await expect(confirm).toBeDisabled();
  await page.getByRole('button',{name:'Complete fixture verification'}).click();await expect(confirm).toBeEnabled();
  const gap=await page.locator('.affiliate-enrollment-submit').evaluate(el=>el.getBoundingClientRect().top-el.previousElementSibling!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(24);
  await page.evaluate(()=> (window as any).fixtureChecks[0]['expired-callback']());await expect(confirm).toBeDisabled();
  await page.getByRole('button',{name:'Retry verification'}).click();
  await page.evaluate(()=> (window as any).fixtureChecks[0].callback('late-token'));await expect(confirm).toBeDisabled();
  await page.getByRole('button',{name:'Complete fixture verification'}).last().click();await expect(confirm).toBeEnabled();
  await page.evaluate(()=> (window as any).fixtureChecks[1]['error-callback']('110200'));await expect(confirm).toBeDisabled();
  await expect(page.locator('.affiliate-verification [role=alert]')).toContainText('allow this hostname');
  await page.screenshot({path:`test-results/review-controls-${width}.png`,fullPage:true});
});

test('Ticket quantity retains its custom buttons and keyboard controls without native spinners',async({page})=>{
  await prepare(page);await page.goto(`${urls.web}/mint/${visualCollection.id}`);await ready(page);
  const quantity=page.locator('.quantity-control input[type="number"]');await expect(quantity).toBeVisible();
  expect(await quantity.evaluate(el=>getComputedStyle(el).appearance)).toBe('textfield');
  await quantity.fill('2');await quantity.press('ArrowUp');await expect(quantity).toHaveValue('3');
  await page.locator('.quantity-control button').last().click();await expect(quantity).toHaveValue('4');
  await page.screenshot({path:'test-results/review-ticket-quantity.png',fullPage:true});
});

test('Launch lists one review season and switches among its three collections',async({page})=>{
  await prepare(page);
  const members=Array.from({length:3},(_,i)=>{const m=structuredClone(launchFixtureAutomation);m.id=`10000000-0000-4000-8000-00000000000${i+1}`;m.plan.steps[0].id=`30000000-0000-4000-8000-00000000000${i+1}`;m.plan.steps[0].payload.contract.name=['Ruby Signal','Coral Pause','Amber Relay'][i];return m;});
  const group={seasonId:members[0].plan.seasonId!,seasonName:members[0].plan.name,stages:members.map(m=>({automationId:m.id,collectionId:m.plan.steps[0].id,name:m.plan.steps[0].payload.contract.name,color:m.plan.steps[0].payload.contract.collectionColor!}))};
  await page.route(/\/api\/launch\/automations(?:\?.*)?$/,route=>route.fulfill({json:{automations:[{...members[0],name:group.seasonName,chainId:'11155111',currentModel:true,collectionCount:3,reviewGroup:group}],nextCursor:null}}));
  for(const member of members)await page.route(`**/api/launch/automations/${member.id}`,route=>route.fulfill({json:{automation:{...member,reviewGroup:group}}}));
  await page.goto(`${urls.launch}/seasons`);await ready(page);
  const seasons=page.getByRole('region',{name:'Saved seasons'});
  await expect(seasons.locator('.automation-plan-card')).toHaveCount(1);await expect(seasons).toContainText('3 collections');
  await seasons.locator('.automation-plan-card').click();
  const collections=page.getByRole('region',{name:'Season collections'});await expect(collections.getByRole('button')).toHaveCount(3);
  await collections.getByRole('button',{name:/2\. Coral Pause/}).click();await expect(collections.getByRole('button',{name:/2\. Coral Pause/})).toHaveAttribute('aria-pressed','true');
  await expect(seasons.locator('.automation-plan-card')).toHaveCount(1);await page.screenshot({path:'test-results/review-launch-group.png',fullPage:true});
});
