import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const FMP_KEY = process.env.FMP_API_KEY;
const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

// In development allow Vite dev server; in production serve own static files
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));
}

app.use(express.json());

function validateTicker(ticker) {
  return /^[A-Z0-9.]{1,6}$/.test(ticker);
}

app.get('/api/stock/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();

  if (!validateTicker(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker symbol' });
  }

  if (!FMP_KEY) {
    return res.status(500).json({
      error: 'FMP_API_KEY not configured — copy .env.example to .env and add your key.',
    });
  }

  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date(Date.now() - 366 * 86400 * 1000).toISOString().split('T')[0];

  try {
    const [histRes, ratingRes] = await Promise.all([
      fetch(
        `${FMP_BASE}/historical-price-full/${ticker}?from=${fromDate}&to=${toDate}&apikey=${FMP_KEY}`
      ),
      fetch(`${FMP_BASE}/rating/${ticker}?apikey=${FMP_KEY}`),
    ]);

    const [histData, ratingData] = await Promise.all([histRes.json(), ratingRes.json()]);

    const historical = histData?.historical ?? [];

    if (!historical.length) {
      return res.status(404).json({ error: `No price data found for ${ticker}` });
    }

    const rating = ratingData?.[0]?.ratingRecommendation ?? null;

    res.json({ historical, rating });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Production: serve the built React app from the same server
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
  if (!FMP_KEY) {
    console.warn('[server] Warning: FMP_API_KEY not set. Copy .env.example → .env');
  }
});
