function retired() { return Response.json({ error: 'This service has been retired. Collection state and actions are available directly onchain.', destination: '/collections' }, { status: 410, headers: { 'Cache-Control': 'no-store' } }); }
export { retired as GET, retired as POST, retired as PUT, retired as PATCH, retired as DELETE };
