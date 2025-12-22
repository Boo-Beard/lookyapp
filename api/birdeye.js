export default async function handler(req, res) {
  try {
    // Pull out path + also strip chain/network from query so they don't get appended upstream
    const { path, chain, network, ...rest } = req.query;

    if (!path || typeof path !== "string") {
      return res.status(400).json({ success: false, message: "Missing ?path=" });
    }

    const normalizedPath = String(path).trim();
    // Only allow known Birdeye API namespaces used by the app.
    // This avoids turning the server into a generic open proxy.
    const allowedPath = /^\/(defi|wallet)\/[a-z0-9_\-\/]+$/i.test(normalizedPath);
    if (!allowedPath) {
      return res.status(400).json({ success: false, message: "Invalid Birdeye path." });
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

    // Read x-chain from request headers first (preferred),
    // fall back to query (chain/network) if you ever send it that way.
    const xChainRaw =
      req.headers["x-chain"] ||
      chain ||
      network;

    const xChain = xChainRaw ? String(xChainRaw).trim() : "";
    if (xChain && !/^[a-z0-9_\-]+$/i.test(xChain)) {
      return res.status(400).json({ success: false, message: "Invalid x-chain." });
    }

    // Build Birdeye URL
    const url = new URL(`https://public-api.birdeye.so${normalizedPath}`);
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null && String(v).length) {
        url.searchParams.set(k, v);
      }
    }

    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        accept: "application/json",
        ...(xChain ? { "x-chain": xChain } : {}), // ✅ THIS is the key fix
      },
    });

    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader(
      "content-type",
      upstream.headers.get("content-type") || "application/json"
    );
    return res.send(text);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Proxy error",
    });
  }
}

export { handler };
