/** Independent recovery trigger. Never prints authenticated URLs or headers. */
const origin = 'https://launch.app.tincta.xyz';
async function request(path, timeout = 20_000) {
  const secret=process.env.SOCIAL_SENDER_CRON_SECRET;
  if (!secret || secret.length<32) throw new Error('watchdog_secret_missing');
  const response=await fetch(origin+path,{redirect:'error',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(timeout)});
  if (!response.ok) throw new Error('sender_request_failed');
  return response.json();
}
try {
  let health=await request('/api/social-sender/status');
  if (!health.healthy) {
    // The DB lease makes this safe even if a scheduled invocation is still running.
    await request('/api/social-sender/run',125_000);
    health=await request('/api/social-sender/status');
  }
  console.log(JSON.stringify({healthy:health.healthy,sources:health.sources?.map(s=>({id:s.id,pending:s.pending,uncertain:s.uncertain,stale:s.stale,error:s.last_error}))}));
  if (!health.healthy) throw new Error('sender_needs_attention');
} catch {
  console.error('X sender recovery/health check failed. Inspect the authenticated sender status and Launch function logs. Credentials withheld.');
  process.exitCode=1;
}
