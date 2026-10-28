import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

// Capture the actual mounted Rewards machine. Export-only styling never enters
// the application bundle. Playwright's clock advances every rendered frame.
// Usage: node scripts/export-rewards-machine-video.mjs <output-dir> [preview-url] [output-size]
const directory = resolve(process.argv[2] || "artifacts/rewards-machine-video");
const url = new URL(process.argv[3] || "http://127.0.0.1:3107/rewards");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Use a local preview.");
const fps = 30, duration = 12, layoutSize = 1080;
const size = Number(process.argv[4] || 3840);
if (!Number.isInteger(size) || size < 1080 || size > 4096 || size % 2) throw new Error("Output size must be an even integer from 1080 to 4096.");
const rendition = size >= 3840 ? '4k' : `${size}p`;
const video = resolve(directory, `tincta-rewards-${rendition}.mp4`);
await mkdir(directory, { recursive: true });

const styles = `
html { scroll-behavior: auto; }
body { width: 1080px; height: 1080px; overflow: hidden; background: #fff; }
.collection-announcement, .skip-link, .hero-actions, main > section:not(.hero),
.site > footer, .site > .ui-footer, noscript, .header > :not(.brand),
.hero-copy, .vm-controls, .vm-description, .vm-note { display: none; }
.site { width: 1080px; height: 1080px; overflow: hidden; }
.header.landing-header { position: absolute; inset: 44px 60px auto; width: auto; min-height: 0; padding: 0; display: flex; justify-content: space-between; }
.brand { padding: 0; min-height: 0; }
.header .brand > span { gap: 14px; }
.header .brand > span > svg { width: 44px; height: 44px; }
.header .brand > span > span { font-size: 19px; letter-spacing: .14em; }
#video-url { display: block; font-size: 19px; color: #535c6d; letter-spacing: -.015em; }
.hero.wrap { position: absolute; top: 282px; left: 60px; width: 960px; margin: 0; padding: 0; }
.hero-main { display: block; }
.vm-machine { width: 960px; margin-top: 0; --ui-caption: 15px; }
.vm-scene { height: 570px; }
.vm-wallets { top: 19%; gap: 3.5rem; }
.vm-wallet { padding: 12px 10px; }
.vm-walletIdentity { gap: 5px; font-size: 14px; }
.vm-mintLabel { font-size: 15px; }
.vm-minted { flex-basis: 46px; width: 46px; }
.vm-buckets { left: 28%; width: 43%; top: 35%; gap: 16px; }
.vm-bucketName { font-size: 27px; }
.vm-vrf .vm-bucketName { font-size: 23px; }
.vm-bucketName span { font-size: 14px; }
.vm-bucketCaption { font-size: 14px; line-height: 1.4; }
.vm-results { top: 5%; width: 24%; }
.vm-winners { gap: 18px 12px; }
.vm-winner { padding: 7px; }
.vm-nftCrop { height: 48px; }
.vm-winner strong { font-size: 15px; }
.vm-numbers { font-size: 15px; }
.vm-owner { font-size: 13px; }
.vm-claimed { font-size: 14px; }
.vm-resultLabel { font-size: 14px; line-height: 1.4; }
.vm-coin { width: 31px; height: 31px; font-size: 23px; }
.vm-proof { width: 17px; height: 17px; }
#video-note { position: absolute; bottom: 26px; left: 40px; right: 40px; margin: 0; text-align: center; color: #697181; font-size: 14px; line-height: 1.4; }
`;

let encoder;
const browser = await chromium.launch();
try {
  // Rasterize the SVGs, text and scene natively at the delivery resolution.
  // No enlarged pixels from a previously encoded video are used.
  const page = await browser.newPage({ viewport: { width: layoutSize, height: layoutSize }, deviceScaleFactor: size / layoutSize, reducedMotion: "no-preference", colorScheme: "light" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), target = new URL(request.url());
    if (target.origin !== url.origin) return route.abort();
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
    if (target.pathname.startsWith('/api/')) return route.fulfill({ json: { collection: null, events: [] } });
    return route.continue();
  });
  const now = new Date("2026-10-28T12:00:00Z");
  await page.clock.install({ time: new Date(now.getTime() - 1000) });
  await page.clock.pauseAt(now);
  await page.goto(url.href);
  const machine = page.locator("[data-rewards-machine]");
  await machine.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-rewards-machine]')?.getAttribute('data-motion') === 'running');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('[data-rewards-machine] img')].map(image => image.decode()));
    for (const node of document.querySelectorAll('[data-rewards-machine], [data-rewards-machine] *')) {
      const parts = [...node.classList].filter(name => name.startsWith('rewards-machine-module__')).map(name => name.split('__').at(-1));
      node.classList.add(...parts.map(part => `vm-${part}`));
    }
    const address = document.createElement('span'); address.id = 'video-url'; address.textContent = 'rewards.tincta.xyz'; document.querySelector('.header').append(address);
    const note = document.createElement('p'); note.id = 'video-note'; note.textContent = 'Illustrative paid draw · Fictional wallets · Winner count follows collection terms'; document.body.append(note);
  });
  await page.addStyleTag({ content: styles });
  await page.clock.runFor(80);
  if (await page.locator('.hero-copy').isVisible() || await page.locator('#video-story').count() || await page.locator('.vm-controls').isVisible() || await page.locator('.vm-description').isVisible()) throw new Error('The export still contains a headline or step footer.');
  if (await page.locator('.header .brand [data-tincta-logo="mark"]').count() !== 1 || !(await page.locator('.header .brand').innerText()).includes('REWARDS')) throw new Error('Canonical TC + REWARDS branding is missing.');

  // Reset through the component's real controls; the first rAF paints time zero.
  await machine.getByRole('button', { name: 'Claims', exact: true, includeHidden: true }).evaluate(button => button.click());
  await page.clock.runFor(16);
  // The export hides controls, so address the playback control structurally;
  // hidden reserved button labels do not have a reliable accessible name.
  await machine.locator('button').first().evaluate(button => button.click());
  await page.clock.runFor(16);
  if (await machine.getAttribute('data-motion') !== 'running' || await machine.getAttribute('data-phase') !== 'mint') throw new Error('Playback did not reset to Mint.');
  const observations = [];
  async function observeFrame(time) {
    return page.evaluate(time => {
      const machine = document.querySelector('[data-rewards-machine]');
      const phase = machine.dataset.phase;
      const opacity = Math.max(0, Math.min(1, time / 250, (12000-time) / 350));
      document.querySelector('[data-machine-scene]').style.opacity = opacity;
      return { time, phase, prizeFill: machine.dataset.prizeFill, claimed: machine.querySelectorAll('[data-machine-winner][data-claimed="true"]').length };
    }, time);
  }

  encoder = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', 'pipe:0',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-threads', '4', '-crf', '15', '-maxrate', size >= 3840 ? '40M' : '8M', '-bufsize', size >= 3840 ? '80M' : '16M',
    '-profile:v', 'high', '-level:v', size >= 3840 ? '6.0' : '5.2', '-r', String(fps), '-g', '60',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '128k', '-t', String(duration), '-movflags', '+faststart', video,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let encoderLog = ''; encoder.stderr.on('data', buffer => { encoderLog += buffer.toString(); });
  const finished = new Promise((done, fail) => { encoder.on('error', fail); encoder.on('close', code => code === 0 ? done() : fail(new Error(encoderLog))); });
  let previous = 0;
  for (let frame = 0; frame < fps * duration; frame++) {
    const time = Math.round(frame * 1000 / fps);
    if (time > previous) await page.clock.runFor(time-previous);
    previous = time;
    const state = await observeFrame(time);
    if (!observations.length || observations.at(-1).phase !== state.phase || frame === 315) observations.push(state);
    const pixels = await page.screenshot({ animations: 'allow', caret: 'hide' });
    if (pixels.readUInt32BE(16) !== size || pixels.readUInt32BE(20) !== size) throw new Error('The browser did not render the requested native resolution.');
    if (!encoder.stdin.write(pixels)) await once(encoder.stdin, 'drain');
    if (frame === 186) await writeFile(resolve(directory, `tincta-rewards-poster-${rendition}.png`), pixels);
    if ([42,84,114,186,243,315].includes(frame)) await writeFile(resolve(directory, `review-${frame}.png`), pixels);
    if (frame % 30 === 0) console.log(`Rendered ${frame}/${fps*duration} frames at ${size}×${size} (${state.phase}).`);
  }
  encoder.stdin.end(); await finished;
  if (errors.length) throw new Error(errors.join('\n'));
  if (observations.map(frame => frame.phase).filter((phase,index,array)=>index===0 || phase!==array[index-1]).join(',') !== 'mint,pool,vrf,winners,claims') throw new Error('Video missed a step.');
  if (!observations.some(frame=>frame.claimed===6 && frame.prizeFill==='0.000')) throw new Error('Claims did not finish.');
  const report = { video, size, layoutSize, nativeRender: true, fps, duration, silent: true, headline: false, stepFooter: false, retainedOverlays: ['TC REWARDS', 'rewards.tincta.xyz', 'Illustrative paid draw · Fictional wallets · Winner count follows collection terms'], origin: url.href, observations, errors, formatReference: 'https://help.x.com/en/using-x/x-videos' };
  await writeFile(resolve(directory, 'render-report.json'), JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill('SIGTERM');
  await browser.close();
}
