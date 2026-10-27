import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

// Capture the actual mounted Rewards machine. Export-only styling never enters
// the application bundle. Playwright's clock advances every rendered frame.
// Usage: node scripts/export-rewards-machine-video.mjs <output-dir> [preview-url]
const directory = resolve(process.argv[2] || "artifacts/rewards-machine-video");
const url = new URL(process.argv[3] || "http://127.0.0.1:3107/rewards");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Use a local preview.");
const fps = 30, duration = 12, size = 1080;
const video = resolve(directory, "tincta-rewards-twitter.mp4");
await mkdir(directory, { recursive: true });

const styles = `
html { scroll-behavior: auto; }
body { width: 1080px; height: 1080px; overflow: hidden; background: #fff; }
.collection-announcement, .skip-link, .hero-actions, main > section:not(.hero),
.site > footer, .site > .ui-footer, noscript, .header > :not(.brand),
.vm-controls, .vm-description, .vm-note { display: none; }
.site { width: 1080px; height: 1080px; overflow: hidden; }
.header.landing-header { position: absolute; inset: 44px 60px auto; width: auto; min-height: 0; padding: 0; display: flex; justify-content: space-between; }
.brand { padding: 0; min-height: 0; }
.rewards-landing-brand { gap: 14px; }
.rewards-landing-brand > svg { width: 44px; height: 44px; }
.rewards-landing-brand > span { font-size: 19px; letter-spacing: .14em; }
#video-url { display: block; font-size: 19px; color: #535c6d; letter-spacing: -.015em; }
.hero.wrap { position: absolute; top: 136px; left: 60px; width: 960px; margin: 0; padding: 0; }
.hero-main { display: block; }
.hero-copy { max-width: none; }
.hero-copy h1 { font-size: 40px; line-height: 1.15; }
.hero-copy .hero-description { font-size: 24px; line-height: 1.35; max-width: none; margin: 20px auto 0; }
body #main .hero :is(h1, .hero-description) { transform: none; translate: none; }
body #main .hero .motion-word { display: inline; animation: none; }
.win-word svg { bottom: -10px; height: 20px; }
.vm-machine { width: 960px; margin-top: 48px; --ui-caption: 15px; }
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
#video-story { position: absolute; top: 896px; left: 60px; width: 960px; text-align: center; }
#video-steps { display: flex; justify-content: center; gap: 16px; }
#video-steps span { font-size: 19px; line-height: 26px; padding: 7px 17px; border: 1px solid transparent; border-radius: 6px; color: #697181; }
#video-steps span[data-active] { background: #edf3ff; border-color: #b4c8eb; color: #183e7c; }
#video-caption { min-height: 50px; max-width: 930px; margin: 24px auto 0; font-size: 21px; line-height: 1.3; font-weight: 400; letter-spacing: -.01em; text-wrap: balance; }
#video-note { position: absolute; bottom: 26px; left: 40px; right: 40px; margin: 0; text-align: center; color: #697181; font-size: 14px; line-height: 1.4; }
`;

let encoder;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1, reducedMotion: "no-preference", colorScheme: "light" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), target = new URL(request.url());
    if (target.origin !== url.origin) return route.abort();
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
    if (target.pathname.startsWith('/api/')) return route.fulfill({ json: { collection: null, events: [] } });
    return route.continue();
  });
  const now = new Date("2026-10-27T12:00:00Z");
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
    const story = document.createElement('div'); story.id = 'video-story';
    story.innerHTML = '<div id="video-steps"><span data-step="mint">Mint</span><span data-step="pool">Pool</span><span data-step="vrf">VRF</span><span data-step="winners">Winners</span><span data-step="claims">Claims</span></div><p id="video-caption"></p>';
    document.body.append(story);
    const note = document.createElement('p'); note.id = 'video-note'; note.textContent = 'Illustrative paid draw · Fictional wallets · Winner count follows collection terms'; document.body.append(note);
  });
  await page.addStyleTag({ content: styles });
  await page.clock.runFor(80);

  // Reset through the component's real controls; the first rAF paints time zero.
  await machine.getByRole('button', { name: 'Claims', exact: true, includeHidden: true }).evaluate(button => button.click());
  await page.clock.runFor(16);
  // The export hides controls, so address the playback control structurally;
  // hidden reserved button labels do not have a reliable accessible name.
  await machine.locator('button').first().evaluate(button => button.click());
  await page.clock.runFor(16);
  if (await machine.getAttribute('data-motion') !== 'running' || await machine.getAttribute('data-phase') !== 'mint') throw new Error('Playback did not reset to Mint.');
  const observations = [];
  async function caption(time) {
    return page.evaluate(time => {
      const machine = document.querySelector('[data-rewards-machine]');
      const phase = machine.dataset.phase;
      const copy = {
        mint: 'Mint an NFT. Your four numbers are fixed at mint.',
        pool: 'The collection sells out. 60% of mint revenue funds the prize pool.',
        vrf: 'After sellout, Chainlink VRF supplies verifiable randomness.',
        winners: 'Winning NFTs are revealed. Their artwork and numbers stay unchanged.',
        claims: 'Winning NFT holders claim equal ETH prizes. The prize pool empties.',
      };
      document.querySelector('#video-caption').textContent = copy[phase];
      for (const step of document.querySelectorAll('#video-steps span')) step.toggleAttribute('data-active', step.dataset.step === phase);
      const opacity = Math.max(0, Math.min(1, time / 250, (12000-time) / 350));
      document.querySelector('[data-machine-scene]').style.opacity = opacity;
      document.querySelector('#video-story').style.opacity = opacity;
      return { time, phase, prizeFill: machine.dataset.prizeFill, claimed: machine.querySelectorAll('[data-machine-winner][data-claimed="true"]').length };
    }, time);
  }

  encoder = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'warning', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', 'pipe:0',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '8M', '-bufsize', '16M',
    '-profile:v', 'high', '-level:v', '4.0', '-r', String(fps), '-g', '60',
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
    const state = await caption(time);
    if (!observations.length || observations.at(-1).phase !== state.phase || frame === 315) observations.push(state);
    const pixels = await page.screenshot({ animations: 'allow', caret: 'hide' });
    if (!encoder.stdin.write(pixels)) await once(encoder.stdin, 'drain');
    if (frame === 186) await writeFile(resolve(directory, 'tincta-rewards-poster.png'), pixels);
    if ([42,84,114,186,243,315].includes(frame)) await writeFile(resolve(directory, `review-${frame}.png`), pixels);
    if (frame % 90 === 0) console.log(`Rendered ${frame}/${fps*duration} frames (${state.phase}).`);
  }
  encoder.stdin.end(); await finished;
  if (errors.length) throw new Error(errors.join('\n'));
  if (observations.map(frame => frame.phase).filter((phase,index,array)=>index===0 || phase!==array[index-1]).join(',') !== 'mint,pool,vrf,winners,claims') throw new Error('Video missed a step.');
  if (!observations.some(frame=>frame.claimed===6 && frame.prizeFill==='0.000')) throw new Error('Claims did not finish.');
  const report = { video, size, fps, duration, silent: true, origin: url.href, observations, errors, formatReference: 'https://help.x.com/en/using-x/media-studio-faqs' };
  await writeFile(resolve(directory, 'render-report.json'), JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (encoder && encoder.exitCode === null) encoder.kill('SIGTERM');
  await browser.close();
}
