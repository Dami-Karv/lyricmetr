require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { createGenius } = require('./server/genius');
const { createAnalysis } = require('./server/analysis');
const { parseAnalysis, parseSearch } = require('./src/analysis-input');

function configuredGenius() {
  const interval = Number(process.env.GENIUS_MIN_INTERVAL_MS);
  return createGenius({
    token: process.env.GENIUS_ACCESS_TOKEN,
    metadataIntervalMs: Number.isFinite(interval) && interval >= 100 && interval <= 5000 ? interval : undefined
  });
}

function createApp({ genius = configuredGenius() } = {}) {
  const app = express();
  const analyze = createAnalysis(genius);
  app.use(cors());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/search-artist', async (req, res, next) => {
    try {
      res.json(await genius.search(parseSearch(req.query.q)));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/artist-songs-word-frequency', async (req, res, next) => {
    try {
      res.json(await analyze(parseAnalysis(req.query)));
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));

  if (process.env.NODE_ENV === 'production') {
    const buildPath = path.join(__dirname, 'build');
    app.use(express.static(buildPath));
    app.get('*', (_req, res) => res.sendFile(path.join(buildPath, 'index.html')));
  }

  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.status === 400) return res.status(400).json({ error: error.message });
    if (error.code === 'RATE_LIMIT') {
      if (error.retryAfterSeconds) res.set('Retry-After', String(error.retryAfterSeconds));
      return res.status(429).json({ error: error.message });
    }
    if (error.code === 'BUSY' || error.code === 'CONFIG') {
      return res.status(503).json({ error: error.message });
    }
    console.error('Genius request failed:', error.response?.status || error.code || error.name);
    return res.status(502).json({ error: 'Could not reach Genius. Try again shortly.' });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.API_PORT || process.env.PORT) || 5000;
  createApp().listen(port, () => console.log('Lyricmetr server listening on port ' + port));
}

module.exports = { createApp };
