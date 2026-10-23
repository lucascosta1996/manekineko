/** The former server-controlled lifecycle has been retired. No database or worker access. */
function retired() { return Response.json({ error: 'This workflow has been retired. Open the wallet-based season dashboard.', destination: '/dashboard' }, { status: 410, headers: { 'Cache-Control': 'no-store' } }); }
export { retired as GET, retired as POST, retired as PUT, retired as PATCH, retired as DELETE };
