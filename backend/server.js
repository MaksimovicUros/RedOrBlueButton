require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const { Pool }   = require('pg');
const Redis      = require('ioredis');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── PostgreSQL ────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,                    // max simultaneous DB connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

// ── Redis (optional — degrades gracefully if not set) ─────────────────────────
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  redis.on('error', (err) => console.error('[Redis]', err.message));
  redis.connect().catch(() => {});
  console.log('✓ Redis configured');
} else {
  console.log('⚠ No REDIS_URL — results will not be cached (fine for low traffic)');
}

const CACHE_KEY = 'poll:results';
const CACHE_TTL = 3; // seconds — all users share one DB read every 3s

// ── Database init ─────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id         SERIAL       PRIMARY KEY,
      email      TEXT         NOT NULL UNIQUE,
      choice     TEXT         NOT NULL CHECK (choice IN ('red', 'blue')),
      created_at TIMESTAMPTZ  DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_votes_email  ON votes (email);
    CREATE INDEX IF NOT EXISTS idx_votes_choice ON votes (choice);
  `);
  console.log('✓ Database ready');
}

// ── Results helper ────────────────────────────────────────────────────────────
async function getResults() {
  // 1. Try Redis cache
  if (redis?.status === 'ready') {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) { /* cache miss — fall through */ }
  }

  // 2. Query Postgres
  const { rows } = await pool.query(
    `SELECT choice, COUNT(*)::int AS count FROM votes GROUP BY choice`
  );

  const total = rows.reduce((s, r) => s + r.count, 0);
  const red   = rows.find(r => r.choice === 'red')?.count  ?? 0;
  const blue  = rows.find(r => r.choice === 'blue')?.count ?? 0;

  const data = {
    total,
    red,
    blue,
    redPercent:  total > 0 ? Math.round((red  / total) * 100) : 0,
    bluePercent: total > 0 ? Math.round((blue / total) * 100) : 0,
    blueWins:    total > 0 && blue / total > 0.5,
  };

  // 3. Store in cache
  if (redis?.status === 'ready') {
    try { await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(data)); } catch (_) {}
  }

  return data;
}

async function invalidateCache() {
  if (redis?.status === 'ready') {
    try { await redis.del(CACHE_KEY); } catch (_) {}
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4200')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin not allowed — ${origin}`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '10kb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min window
  max: 10,                    // max 10 vote attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Health check — Railway uses this to confirm the service is alive
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// GET results
app.get('/api/results', async (_req, res) => {
  try {
    res.json(await getResults());
  } catch (err) {
    console.error('[GET /api/results]', err);
    res.status(500).json({ error: 'Failed to fetch results.' });
  }
});

// POST vote
app.post('/api/vote', voteLimiter, async (req, res) => {
  const { email, choice } = req.body ?? {};

  if (!email || !EMAIL_REGEX.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!['red', 'blue'].includes(choice)) {
    return res.status(400).json({ error: 'Choice must be "red" or "blue".' });
  }

  try {
    await pool.query(
      'INSERT INTO votes (email, choice) VALUES ($1, $2)',
      [email.trim().toLowerCase(), choice]
    );
    await invalidateCache();
    res.status(201).json({ message: 'Vote recorded.', results: await getResults() });
  } catch (err) {
    if (err.code === '23505') {  // Postgres unique violation
      return res.status(409).json({ error: 'This email has already been used to vote.' });
    }
    console.error('[POST /api/vote]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

// ── Start ─────────────────────────────────────────────────────────────────────
initDB()
  .then(() => app.listen(PORT, () => console.log(`✓ Server on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });

// Graceful shutdown
const shutdown = async () => {
  await pool.end();
  if (redis) redis.disconnect();
  process.exit(0);
};
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
