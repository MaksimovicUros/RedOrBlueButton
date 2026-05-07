# The Choice — Red or Blue?

A social dilemma poll. Choose **Red** (guaranteed personal gain) or **Blue** (collective win if >50% agree). Built with Angular 17, Node.js/Express, and SQLite.

---

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | Angular 17 (standalone, SCSS)       |
| Backend  | Node.js 20 + Express                |
| Database | SQLite via `better-sqlite3`         |
| Serve    | nginx (production) / Angular CLI (dev) |
| Deploy   | Docker + Docker Compose             |

---

## Quick Start (Development)

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### 1 — Backend

```bash
cd backend
cp .env.example .env      # edit if needed
npm install
npm run dev               # starts on http://localhost:3000
```

### 2 — Frontend

```bash
cd frontend
npm install
npm start                 # starts on http://localhost:4200
```

> The Angular dev server proxies `/api/*` → `http://localhost:3000` via `src/proxy.conf.json`, so no CORS issues during development.

Open **http://localhost:4200** and vote!

---

## API Reference

### `GET /api/results`
Returns current poll results.

**Response 200:**
```json
{
  "total": 142,
  "red": 58,
  "blue": 84,
  "redPercent": 41,
  "bluePercent": 59,
  "blueWins": true
}
```

---

### `POST /api/vote`
Cast a vote.

**Body:**
```json
{
  "email": "user@example.com",
  "choice": "red"
}
```

**Responses:**
- `201` — Vote recorded, returns `{ message, results }`
- `400` — Validation error
- `409` — Email already voted
- `429` — Rate limited (10 requests / 15 min per IP)

---

### `GET /api/health`
Health check. Returns `{ "status": "ok" }`.

---

## Production Deployment

### Docker Compose (recommended)

```bash
# 1. Update FRONTEND_URL in docker-compose.yml with your domain
# 2. Update environment.prod.ts with your API URL if not using nginx proxy

docker compose up -d --build
```

The compose stack runs:
- `backend`  on port `3000` (internal)
- `frontend` on port `80` (nginx, proxies `/api/` to backend)

SQLite database is persisted in a named Docker volume (`poll-data`).

### Manual / VPS

```bash
# Backend — use PM2 for process management
npm install -g pm2
cd backend && npm install
pm2 start server.js --name choice-poll-api

# Frontend — build and serve with nginx
cd frontend && npm install && npm run build:prod
# Copy dist/choice-poll/browser to your nginx webroot
```

---

## Project Structure

```
.
├── backend/
│   ├── server.js          # Express app + SQLite logic
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.component.ts    # Main component (state machine)
│   │   │   ├── app.component.html  # Template
│   │   │   ├── app.component.scss  # Cinematic dark styles
│   │   │   ├── app.config.ts       # Angular providers
│   │   │   ├── app.routes.ts
│   │   │   └── services/
│   │   │       └── poll.service.ts # HTTP service
│   │   ├── environments/
│   │   │   ├── environment.ts      # Dev (uses proxy)
│   │   │   └── environment.prod.ts # Prod (set your API URL)
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── styles.scss
│   │   └── proxy.conf.json         # Dev proxy → backend
│   ├── angular.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── nginx.conf
│
├── docker-compose.yml
└── README.md
```

---

## Environment Variables

### Backend (`.env`)

| Variable       | Default                    | Description                      |
|----------------|----------------------------|----------------------------------|
| `PORT`         | `3000`                     | HTTP port                        |
| `FRONTEND_URL` | `http://localhost:4200`    | Allowed CORS origin(s), comma-separated |
| `DB_PATH`      | `./poll.db`                | Path to SQLite database file     |

---

## Design Notes

- **Database**: SQLite with WAL mode — zero-setup, great for single-server workloads. Swap in PostgreSQL by replacing the `better-sqlite3` calls with `pg` if you need multi-instance scale.
- **Rate limiting**: 10 vote attempts per IP per 15 minutes to prevent spam.
- **Email uniqueness**: Enforced both at app level and with a `UNIQUE` DB constraint (handles race conditions).
- **Results polling**: Frontend refreshes results every 5 seconds.
- **Mobile**: Bottom-sheet modal on screens < 420px.
