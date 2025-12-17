export default async function handler(req, res) {
  try {
    // Your frontend sends /api/birdeye?path=/wallet/v2/current-net-worth&...
    const { path, ...rest } = req.query;

    if (!path || typeof path !== "string") {
      return res.status(400).json({ success: false, message: "Missing ?path=" });
    }

    const apiKey =
      process.env.BIRDEYE_API_KEY ||
      process.env.BIRDEYE_KEY ||
      process.env.BIRDEYE_APIKEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Missing Birdeye API key in env (BIRDEYE_API_KEY).",
      });
    }

    // Build Birdeye URL
    const url = new URL(`https://public-api.birdeye.so${path}`);
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null && String(v).length) {
        url.searchParams.set(k, v);
      }
    }

    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        "accept": "application/json",
      },
    });

    const text = await upstream.text();

    // Return upstream status + body (usually JSON)
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Proxy error",
    });
  }
}
