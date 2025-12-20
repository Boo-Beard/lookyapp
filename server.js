import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import birdeyeHandler from './api/birdeye.js';
import zerionHandler from './api/zerion.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Static site
app.use(express.static(__dirname));

// API proxy
app.get('/api/birdeye', (req, res) => birdeyeHandler(req, res));
app.get('/api/zerion', (req, res) => zerionHandler(req, res));

// SPA-ish fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Looky listening on http://localhost:${port}`);
});
