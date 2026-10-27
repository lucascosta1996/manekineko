import { test, expect } from '@playwright/test';
import { prepare, ready, urls, widths, browserErrors } from './fixtures';

for (const path of ['/', '/rewards']) {
  for (const [width, height] of [...widths, [2560, 1440] as const]) {
    test(`scroll motion ${path} ${width}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'chromium' && ![390, 1440].includes(width), 'Secondary engines cover phone and desktop.');
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await prepare(page);
      await page.goto(`${urls.landing}${path}`);
      await ready(page);
      await page.clock.resume();
      const root = page.locator('.landing-motion');
      await expect(root).toHaveAttribute('data-scroll-motion', 'on');
      const target = path === '/' ? page.locator('#research') : page.locator('#how-it-works');
      await target.evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight / 2, behavior: 'instant' }));
      await expect(target).toHaveAttribute('data-motion-active', 'true');
      const heading = target.locator('h2');
      await expect(heading).not.toHaveCSS('transform', 'none');
      const before = await heading.evaluate(el => getComputedStyle(el).transform);
      // Leave the neutral reading zone, including on tall desktop viewports.
      await page.evaluate(() => window.scrollBy({ top: innerHeight * .45, behavior: 'instant' }));
      await expect.poll(() => heading.evaluate(el => getComputedStyle(el).transform)).not.toBe(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath('scroll.png'), animations: 'allow' });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(root).toHaveAttribute('data-scroll-motion', 'off');
      await expect(heading).toHaveCSS('transform', 'none');
      expect(browserErrors.get(page)).toEqual([]);
    });
  }
}

test('glass rotates without bobbing and pauses offscreen, hidden and with reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await prepare(page); await page.goto(urls.landing); await ready(page); await page.clock.resume();
  const root=page.locator('.landing-motion'), hero=page.locator('.studio-hero');
  const floating=hero.locator('.glass-float').first();
  const face=hero.locator('[data-glass-face="0"]').first();
  await expect(hero).toHaveAttribute('data-motion-active','true');
  await expect(floating).toHaveCSS('animation-name','none');
  await expect(floating).toHaveCSS('transform','none');
  await expect(root).toHaveAttribute('data-motion-settled','true');
  const initialPath=await face.getAttribute('d');
  await expect.poll(()=>face.getAttribute('d')).not.toBe(initialPath);
  expect(await hero.locator('[data-glass-shape]').first().locator('[data-glass-bevel="true"]').count()).toBeGreaterThan(20);
  const variants=await page.locator('[data-glass-variant]').evaluateAll(elements=>elements.map(el=>el.getAttribute('data-glass-variant')));
  expect(new Set(variants).size).toBe(6);
  await page.screenshot({path:info.outputPath('glass-hero.png'),animations:'allow'});
  await page.evaluate(()=>scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
  await expect(hero).toHaveAttribute('data-motion-active','false');
  const offscreenPath=await face.getAttribute('d');
  await page.waitForTimeout(250);
  expect(await face.getAttribute('d')).toBe(offscreenPath);
  const closingFace=page.locator('.studio-closing [data-glass-face="0"]').first();
  const closingStart=await closingFace.getAttribute('d');
  await expect.poll(()=>closingFace.getAttribute('d')).not.toBe(closingStart);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(root).toHaveAttribute('data-motion-hidden','true');
  const hiddenPath=await closingFace.getAttribute('d');
  await page.waitForTimeout(250);
  expect(await closingFace.getAttribute('d')).toBe(hiddenPath);
  await page.evaluate(()=>{delete (document as unknown as {hidden?:boolean}).hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>closingFace.getAttribute('d')).not.toBe(hiddenPath);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(root).toHaveAttribute('data-scroll-motion','off');
  const staticPath=await closingFace.getAttribute('d');
  await page.waitForTimeout(250);
  expect(await closingFace.getAttribute('d')).toBe(staticPath);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect.poll(()=>closingFace.getAttribute('d')).not.toBe(staticPath);
});

test('both pages remain readable without animation hydration', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route('**/api/**', route => route.fulfill({ json: { collection: null, events: [] } }));
  for (const path of ['/', '/rewards']) {
    await page.goto(`${urls.landing}${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.locator('.landing-motion').getAttribute('data-scroll-motion')).toBeNull();
    expect(await page.locator('.glass-field').evaluateAll(elements => elements.flatMap(el => el.getAnimations({ subtree: true })).every(animation => animation.playState === 'paused'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await context.close();
});

for (const path of ['/', '/rewards']) test(`visible word and button motion ${path}`, async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await prepare(page); await page.goto(`${urls.landing}${path}`); await ready(page); await page.clock.resume();
  const title=page.locator('h1'), word=title.locator('.motion-word').first();
  const action=page.locator('main [data-motion-action]').first();
  await expect(title).toHaveAttribute('data-motion-entered','true');
  await expect(action).toHaveAttribute('data-motion-entered','true');
  const sample=async(time:number)=>{
    await title.evaluate((el,time)=>el.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=time;}),time);
    await action.evaluate((el,time)=>el.getAnimations().forEach(a=>{a.pause();a.currentTime=time;}),time);
    return {word:await word.evaluate(el=>getComputedStyle(el).transform),button:await action.boundingBox()};
  };
  const entry=await sample(0); await page.screenshot({path:info.outputPath('type-entry.png'),animations:'allow'});
  const settled=await sample(1600);
  expect(entry.word).not.toBe(settled.word);
  await expect(title).toHaveCSS('text-shadow','none');
  expect(await title.evaluate(el=>getComputedStyle(el).transform)).toMatch(/^matrix3d\(/);
  expect(entry.button!.y-settled.button!.y).toBeGreaterThan(6);
  expect(entry.button!.y-settled.button!.y).toBeLessThan(10);
  await action.hover();
  await expect.poll(()=>action.evaluate(el=>getComputedStyle(el).translate)).toBe('0px -3px');
  await expect(action.locator('.ui-icon')).not.toHaveCSS('animation-name','none');
  await page.screenshot({path:info.outputPath('button-hover.png'),animations:'allow'});
  // Reload after scrubbing so no script-owned animation masks preference changes.
  await page.reload();await ready(page);await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.landing-motion')).toHaveAttribute('data-scroll-motion','off');
  expect(await page.locator('h1,[data-motion-action]').evaluateAll(nodes=>nodes.flatMap(el=>el.getAnimations({subtree:true})).length)).toBe(0);
});

test('glass crosses the screen over selectable words without intercepting actions',async({page},info)=>{
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await prepare(page);await page.goto(urls.landing);await ready(page);await page.clock.resume();
  const orbit=page.locator('.studio-hero .glass-orbit-1');
  await expect(page.locator('.landing-motion')).toHaveAttribute('data-scroll-motion','on');
  const left=(await orbit.boundingBox())!.x;
  await page.evaluate(()=>scrollTo({top:600,behavior:'instant'}));
  await expect.poll(async()=> (await orbit.boundingBox())!.x-left).toBeGreaterThan(180);
  const field=page.locator('.studio-hero .glass-field');
  await expect(field).toHaveCSS('pointer-events','none');await expect(field).toHaveCSS('z-index','3');
  await expect(page.locator('.landing-motion')).toHaveAttribute('data-motion-settled','true');
  const overlap=await page.locator('.studio-hero').evaluate(hero=>{
    const text=hero.querySelector('h1')!.getBoundingClientRect();
    return [...hero.querySelectorAll('[data-glass-bevel="false"]')].some(face=>{
      const b=face.getBoundingClientRect();return b.left<text.right && b.right>text.left && b.top<text.bottom && b.bottom>text.top;
    });
  });expect(overlap).toBe(true);
  await page.screenshot({path:info.outputPath('transparent-overlap.png'),animations:'allow'});
  await page.getByRole('link',{name:'Explore our projects',exact:true}).click();await expect(page).toHaveURL(/#projects$/);
});


test('glass responds immediately, stays in sync and has no vertical rebound',async({page},info)=>{
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await prepare(page);await page.goto(urls.landing);await ready(page);await page.clock.resume();
  const orbit=page.locator('.studio-hero .glass-orbit-1');
  const sample=()=>orbit.evaluate(el=>({x:el.getBoundingClientRect().x,documentY:el.getBoundingClientRect().y+scrollY}));
  await expect(page.locator('.landing-motion')).toHaveAttribute('data-motion-settled','true');
  const initial=await sample();
  await page.evaluate(async()=>{scrollTo({top:260,behavior:'instant'});for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  const immediate=await sample();
  expect(immediate.x-initial.x).toBeGreaterThan(50);
  expect(immediate.x-initial.x).toBeLessThan(130);
  expect(immediate.documentY).toBeCloseTo(initial.documentY,1);
  await page.waitForTimeout(500);
  expect((await sample()).x).toBeCloseTo(immediate.x,1);
  await page.screenshot({path:info.outputPath('direct-scroll.png'),animations:'allow'});
  await page.evaluate(async()=>{scrollTo({top:0,behavior:'instant'});for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  expect((await sample()).x).toBeCloseTo(initial.x,1);
  expect((await sample()).documentY).toBeCloseTo(initial.documentY,1);
  // A later section is already synchronized on arrival, with no waiting period.
  const next=page.locator('#projects .glass-orbit-1');
  await page.locator('#projects').evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY-innerHeight/2,behavior:'instant'}));
  await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  const nextX=(await next.boundingBox())!.x;
  await page.evaluate(async()=>{scrollBy({top:80,behavior:'instant'});for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
  const moved=(await next.boundingBox())!.x;
  expect(Math.abs(moved-nextX)).toBeGreaterThan(5);
  expect(Math.abs(moved-nextX)).toBeLessThan(40);
  await page.waitForTimeout(350);
  expect((await next.boundingBox())!.x).toBeCloseTo(moved,1);
});

for (const path of ['/', '/rewards']) test(`headings stay clean in focus and move subtly on departure ${path}`,async({page},info)=>{
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await prepare(page);await page.goto(`${urls.landing}${path}`);await ready(page);await page.clock.resume();
  const title=page.locator('h1');
  await expect(page.locator('.landing-motion')).toHaveAttribute('data-scroll-motion','on');
  const pose=()=>title.evaluate(el=>{const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return {x:m.m41,y:m.m42,z:m.m43};});
  await expect.poll(async()=>Math.abs((await pose()).x)).toBeLessThan(.1);
  expect(await page.locator('h1,h2').evaluateAll(nodes=>nodes.every(el=>getComputedStyle(el).textShadow==='none'))).toBe(true);
  await title.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished)));
  await page.screenshot({path:info.outputPath('clean-type.png'),animations:'allow'});
  await page.evaluate(()=>scrollTo({top:300,behavior:'instant'}));
  await expect.poll(async()=>(await pose()).x).toBeGreaterThan(.5);
  const away=await pose();
  expect(away.x).toBeLessThanOrEqual(12);expect(Math.abs(away.y)).toBeLessThanOrEqual(4);expect(Math.abs(away.z)).toBeLessThanOrEqual(18);
  await page.screenshot({path:info.outputPath('type-departure.png'),animations:'allow'});
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await expect.poll(async()=>Math.abs((await pose()).x)).toBeLessThan(.1);
  expect(browserErrors.get(page)).toEqual([]);
});

for(const path of ['/', '/rewards']) test(`buttons do not replay or flicker at viewport boundaries ${path}`,async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await prepare(page);
  await page.goto(`${urls.landing}${path}`);await ready(page);await page.clock.resume();
  const action=page.locator('main [data-motion-action]').last();
  await action.evaluate(el=>el.addEventListener('animationstart',event=>{if((event as AnimationEvent).animationName==='action-arrive')el.setAttribute('data-entry-count',String(Number(el.getAttribute('data-entry-count')||0)+1));}));
  await action.scrollIntoViewIfNeeded();
  await expect(action).toHaveAttribute('data-motion-entered','true');
  await expect(action).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
  const count=await action.getAttribute('data-entry-count');
  for(const offset of [12,-12,8,-8,0]) {
    await action.evaluate((el,offset)=>scrollTo({top:el.getBoundingClientRect().top+scrollY-innerHeight+48+offset,behavior:'instant'}),offset);
    await page.waitForTimeout(120);
    await expect(action).toHaveAttribute('data-motion-entered','true');
    await expect(action).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
  }
  expect(await action.getAttribute('data-entry-count')).toBe(count);
  expect(count).toBe('1');
});

for(const width of [390,1440]) test(`closing sculptures remain complete and include Ethereum glass ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await prepare(page);await page.goto(urls.landing);await ready(page);await page.clock.resume();
  const section=page.locator('.studio-closing'),field=section.locator('.glass-field');
  await section.evaluate(el=>scrollTo({top:el.getBoundingClientRect().top+scrollY+el.clientHeight/2-innerHeight/2,behavior:'instant'}));
  await expect(section).toHaveAttribute('data-motion-active','true');
  expect(await page.locator('[data-glass-shape="ethereum"]').count()).toBe(3);
  await expect(page.locator('.studio main form')).toHaveCSS('z-index','4');
  const contained=()=>field.evaluate(el=>{const box=el.getBoundingClientRect();return [...el.querySelectorAll('[data-glass-mesh]')].every(mesh=>{const b=mesh.getBoundingClientRect();return b.left>=box.left && b.right<=box.right && b.top>=box.top && b.bottom<=box.bottom;});});
  await expect.poll(contained).toBe(true);
  await page.screenshot({path:info.outputPath('complete-closing.png'),animations:'allow'});
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(contained).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
