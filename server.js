import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import birdeyeHandler from './api/birdeye.js';
import zerionHandler from './api/zerion.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

const apiRateState = new Map();
function rateLimitApi({ windowMs = 60_000, max = 120 } = {}) {
  return (req, res, next) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
      .split(',')[0]
      .trim();

    const now = Date.now();
    const entry = apiRateState.get(ip) || { start: now, count: 0 };
    if ((now - entry.start) > windowMs) {
      entry.start = now;
      entry.count = 0;
    }

    entry.count += 1;
    apiRateState.set(ip, entry);

    if (entry.count > max) {
      res.status(429).json({ success: false, message: 'Rate limit exceeded. Please try again shortly.' });
      return;
    }

    next();
  };
}

app.use(express.static(__dirname, {
  etag: true,
  lastModified: true,
  index: false,
}));

app.get('/api/birdeye', rateLimitApi(), (req, res) => birdeyeHandler(req, res));
app.get('/api/zerion', rateLimitApi(), (req, res) => zerionHandler(req, res));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Peek listening on http://localhost:${port}`);
});
