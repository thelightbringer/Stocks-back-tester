import { useState, useRef } from 'react';

const DEFAULT_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META',
  'NVDA', 'TSLA', 'JPM', 'V', 'JNJ',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

function getReturn(historical, daysAgo) {
  if (!historical?.length) return null;

  // FMP returns newest-first; index 0 is today's close
  const latest = historical[0]?.close;
  const targetMs = Date.now() - daysAgo * 86_400_000;

  let best = null;
  let bestDiff = Infinity;
  for (const item of historical) {
    const diff = Math.abs(new Date(item.date).getTime() - targetMs);
    if (diff < bestDiff && item.close != null) {
      bestDiff = diff;
      best = item.close;
    }
  }

  if (best == null || latest == null) return null;
  return ((latest - best) / best) * 100;
}

function normaliseRating(raw) {
  if (!raw) return null;
  if (raw.includes('Strong Buy')) return 'Strong Buy';
  if (raw.includes('Buy')) return 'Buy';
  if (raw === 'Neutral') return 'Hold';
  if (raw.includes('Strong Sell')) return 'Strong Sell';
  if (raw.includes('Sell')) return 'Sell';
  return raw;
}

async function fetchStock(ticker) {
  const res = await fetch(`/api/stock/${encodeURIComponent(ticker)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function makeRow(ticker) {
  return {
    ticker,
    status: 'pending', // pending | loading | done | error
    price: null,
    rating: null,
    ret3m: null,
    ret6m: null,
    ret1y: null,
    error: null,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const color = {
    pending: '#334155',
    loading: '#f59e0b',
    done: '#22c55e',
    error: '#ef4444',
  };
  return (
    <span
      className={`status-dot${status === 'loading' ? ' pulse' : ''}`}
      style={{ background: color[status] ?? '#334155' }}
    />
  );
}

function RatingBadge({ rating }) {
  if (!rating) return <span className="muted">—</span>;

  let cls = 'badge-neutral';
  if (rating.includes('Buy')) cls = 'badge-buy';
  else if (rating.includes('Sell')) cls = 'badge-sell';

  return <span className={`badge ${cls}`}>{rating}</span>;
}

function RetCell({ value }) {
  if (value == null || isNaN(value)) return <span className="muted">—</span>;
  const cls = value > 5 ? 'ret-pos' : value < -5 ? 'ret-neg' : 'ret-neutral';
  return <span className={cls}>{fmt(value)}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function App() {
  const [rows, setRows] = useState(DEFAULT_TICKERS.map(makeRow));
  const [running, setRunning] = useState(false);
  const [input, setInput] = useState('');
  const [lastRun, setLastRun] = useState(null);
  const inputRef = useRef(null);

  function update(ticker, patch) {
    setRows(prev => prev.map(r => (r.ticker === ticker ? { ...r, ...patch } : r)));
  }

  function addTicker() {
    const t = input.trim().toUpperCase();
    if (!t || rows.some(r => r.ticker === t)) {
      setInput('');
      return;
    }
    setRows(prev => [...prev, makeRow(t)]);
    setInput('');
    inputRef.current?.focus();
  }

  function removeTicker(ticker) {
    setRows(prev => prev.filter(r => r.ticker !== ticker));
  }

  function reset() {
    setRows(DEFAULT_TICKERS.map(makeRow));
    setLastRun(null);
  }

  async function runBacktest() {
    setRunning(true);

    for (const { ticker } of rows) {
      update(ticker, { status: 'loading', error: null });
      try {
        const { historical, rating } = await fetchStock(ticker);
        update(ticker, {
          status: 'done',
          price: historical[0]?.close ?? null,
          rating: normaliseRating(rating),
          ret3m: getReturn(historical, 90),
          ret6m: getReturn(historical, 180),
          ret1y: getReturn(historical, 365),
        });
      } catch (err) {
        update(ticker, { status: 'error', error: err.message });
      }
    }

    setLastRun(new Date().toLocaleTimeString());
    setRunning(false);
  }

  const errors = rows.filter(r => r.error);

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Stock Back-Tester</h1>
          <p className="subtitle">
            Analyst ratings &amp; historical returns — powered by Financial Modeling Prep
          </p>
        </div>
        {lastRun && <span className="last-run">Last run: {lastRun}</span>}
      </header>

      <div className="toolbar">
        <div className="ticker-input-group">
          <input
            ref={inputRef}
            className="ticker-input"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addTicker()}
            placeholder="Add ticker (e.g. NFLX)"
            maxLength={6}
          />
          <button className="btn btn-secondary" onClick={addTicker} disabled={!input.trim()}>
            Add
          </button>
        </div>

        <div className="action-group">
          <button className="btn btn-ghost" onClick={reset} disabled={running}>
            Reset
          </button>
          <button className="btn btn-primary" onClick={runBacktest} disabled={running || rows.length === 0}>
            {running ? 'Running…' : 'Run Backtest'}
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 32 }} />
              <th>Ticker</th>
              <th>Price</th>
              <th>Rating</th>
              <th>3M</th>
              <th>6M</th>
              <th>1Y</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.ticker} className={r.status === 'error' ? 'row-error' : ''}>
                <td>
                  <StatusDot status={r.status} />
                </td>
                <td className="ticker-cell">{r.ticker}</td>
                <td>{r.price != null ? `$${r.price.toFixed(2)}` : <span className="muted">—</span>}</td>
                <td>
                  <RatingBadge rating={r.rating} />
                </td>
                <td>
                  <RetCell value={r.ret3m} />
                </td>
                <td>
                  <RetCell value={r.ret6m} />
                </td>
                <td>
                  <RetCell value={r.ret1y} />
                </td>
                <td>
                  <button
                    className="remove-btn"
                    onClick={() => removeTicker(r.ticker)}
                    disabled={running}
                    title="Remove"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {errors.length > 0 && (
        <div className="error-panel">
          {errors.map(r => (
            <div key={r.ticker} className="error-item">
              <strong>{r.ticker}</strong>: {r.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
