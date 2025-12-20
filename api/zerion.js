export default async function handler(req, res) {
  try {
    const { path: rawPath, address, ...rest } = req.query;

    const path = (typeof rawPath === 'string' && rawPath)
      ? rawPath
      : (typeof address === 'string' && address)
        ? `/v1/wallets/${address}/positions/`
        : null;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing ?path= or ?address=' });
    }

    const auth =
      process.env.ZERION_AUTHORIZATION ||
      process.env.ZERION_AUTH ||
      process.env.ZERION_API_KEY;

    if (!auth) {
      return res.status(500).json({
        success: false,
        message: 'Missing Zerion auth in env (ZERION_AUTHORIZATION).',
      });
    }

    const url = new URL(`https://api.zerion.io${path}`);
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null && String(v).length) {
        url.searchParams.set(k, String(v));
      }
    }

    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(String(auth).toLowerCase().startsWith('basic ') || String(auth).toLowerCase().startsWith('bearer ')
          ? { authorization: String(auth) }
          : { authorization: `Basic ${String(auth)}` }),
      },
    });

    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Proxy error',
    });
  }
}

export { handler };
