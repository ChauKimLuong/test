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
    let body: Uint8Array | undefined;
    if (!['GET', 'HEAD'].includes(req.method) && req.body) {
      const reader = req.body.getReader(),
        chunks: Uint8Array[] = [],
        limit = 3 * 1024 * 1024;
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limit) {
          await reader.cancel();
          return NextResponse.json(
            { message: 'Nội dung vượt giới hạn cho phép.' },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
      body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: body as BodyInit | undefined,
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
    for (const name of ['content-disposition', 'x-content-type-options', 'x-request-id']) {
      const value = upstream.headers.get(name);
      if (value) result.headers.set(name, value);
    }
    return result;
  } catch {
    return NextResponse.json(
      { message: 'Không kết nối được máy chủ. Vui lòng thử lại sau.' },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
