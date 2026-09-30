import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url =
    (process.env.API_URL || 'http://localhost:3001') +
    '/api/' +
    path.map(encodeURIComponent).join('/') +
    req.nextUrl.search;
  const headers = new Headers();
  for (const h of ['content-type', 'cookie', 'origin']) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    const result = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
    for (const cookie of upstream.headers.getSetCookie())
      result.headers.append('Set-Cookie', cookie);
    return result;
  } catch {
    return NextResponse.json(
      { message: 'Không kết nối được máy chủ. Vui lòng thử lại sau.' },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
