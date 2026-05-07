require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "poll.db");

// ── Database ──────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    email      TEXT     NOT NULL UNIQUE COLLATE NOCASE,
    choice     TEXT     NOT NULL CHECK(choice IN ('red', 'blue')),
    created_at DATETIME DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_votes_email ON votes(email);
`);

// ── Middleware ────────────────────────────────────────────────────────────────

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:4200")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = (process.env.FRONTEND_URL || "")
        .split(",")
        .map((o) => o.trim());

      // allow server-to-server / curl
      if (!origin) return callback(null, true);

      // allow if match
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("Blocked CORS origin:", origin);
      return callback(null, false); // ❗ do NOT throw error
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(express.json({ limit: "10kb" }));

// ── Rate limiting ─────────────────────────────────────────────────────────────

const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many vote attempts. Please try again later." },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getResults() {
  const rows = db
    .prepare(`SELECT choice, COUNT(*) AS count FROM votes GROUP BY choice`)
    .all();

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const red = rows.find((r) => r.choice === "red")?.count ?? 0;
  const blue = rows.find((r) => r.choice === "blue")?.count ?? 0;

  return {
    total,
    red,
    blue,
    redPercent: total > 0 ? Math.round((red / total) * 100) : 0,
    bluePercent: total > 0 ? Math.round((blue / total) * 100) : 0,
    blueWins: total > 0 && blue / total > 0.5,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/results — public poll results
app.get("/api/results", (req, res) => {
  try {
    res.json(getResults());
  } catch (err) {
    console.error("[GET /api/results]", err);
    res.status(500).json({ error: "Failed to fetch results." });
  }
});

// POST /api/vote — cast a vote
app.post("/api/vote", voteLimiter, (req, res) => {
  const { email, choice } = req.body ?? {};

  // ── Validation ────────────────────────────────────────────────────────────
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Email is required." });
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return res
      .status(400)
      .json({ error: "Please enter a valid email address." });
  }
  if (!choice || !["red", "blue"].includes(choice)) {
    return res.status(400).json({ error: 'Choice must be "red" or "blue".' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // ── Duplicate check ───────────────────────────────────────────────────────
  const existing = db
    .prepare("SELECT id FROM votes WHERE email = ?")
    .get(normalizedEmail);

  if (existing) {
    return res.status(409).json({
      error: "This email address has already been used to vote.",
    });
  }

  // ── Insert ────────────────────────────────────────────────────────────────
  try {
    db.prepare("INSERT INTO votes (email, choice) VALUES (?, ?)").run(
      normalizedEmail,
      choice,
    );
  } catch (err) {
    // Race-condition duplicate
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "This email address has already been used to vote.",
      });
    }
    console.error("[POST /api/vote] insert error:", err);
    return res.status(500).json({ error: "Internal server error." });
  }

  res.status(201).json({
    message: "Vote recorded successfully.",
    results: getResults(),
  });
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ── 404 fallback ──────────────────────────────────────────────────────────────

app.use((_req, res) => res.status(404).json({ error: "Not found." }));

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✓ API server running on http://localhost:${PORT}`);
  console.log(`  Database: ${DB_PATH}`);
  console.log(`  CORS:     ${allowedOrigins.join(", ")}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});
