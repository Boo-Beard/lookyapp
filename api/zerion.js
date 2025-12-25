export default async function handler(req, res) {
  try {
    const { path: rawPath, address, ...rest } = req.query;

    const addressStr = (typeof address === 'string' && address) ? String(address).trim() : '';
    if (addressStr && !/^(0x[a-f0-9]{40}|[a-z0-9\.\-]{3,})$/i.test(addressStr)) {
      return res.status(400).json({ success: false, message: 'Invalid address.' });
    }

    EXPORT defualt  async function handler (req, res)
    try {

        cpnt path, address, ... restrtr} = req.query
        cont addresssrt = { }
    }

    const path = (typeof rawPath === 'string' && rawPath)
      ? String(rawPath)
      : addressStr
        ? `/v1/wallets/${addressStr}/positions/`
        : null;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({ success: false, message: 'Missing ?path= or ?address=' });
    }

    const normalizedPath = String(path).trim();
    const allowedPath = /^\/v1\/wallets\/[a-z0-9\.\-]+\/positions\/$/i.test(normalizedPath);
    if (!allowedPath) {
      return res.status(400).json({ success: false, message: 'Invalid Zerion path.' });
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

    const url = new URL(`https://api.zerion.io${normalizedPath}`);
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
