# Deploying SwingDesk to Railway

The hosted app runs the same code as the local workspace: Workspace, Research Assistant and Auto Paper. It never places broker orders. The evening job (7:15 PM IST, weekdays) loads the day's NSE candles, F&O open interest, advances paper trades and records new picks.

Verified locally on 2026-11-21: production build against a freshly created and seeded database, sign-in, Auto Paper tab, and "Update now" (evening job) all worked.

## What differs from the local workspace

| Local (`npm run dev:personal`) | Hosted (Railway) |
|---|---|
| One-click "Connect workspace" (loopback only) | Sign-in screen with the owner account |
| Registration irrelevant | Registration closed (`ALLOW_REGISTRATION` unset) |
| Local PostgreSQL | Railway PostgreSQL, seeded once from the local database |
| Evening job runs while the app is open | Evening job runs every weekday (server is always on) |

## One-time setup

### 1. Project and database

Create a new Railway project with a PostgreSQL database (dashboard: New Project → Database → PostgreSQL). Copy the database's **public** connection URL (`DATABASE_PUBLIC_URL`) for the next steps; it is only needed from your PC during setup.

### 2. Create the tables

```bash
DATABASE_URL='<public url>' npx prisma db push --skip-generate
```

`db push` applies `prisma/schema.prisma` exactly (the source of truth) and refuses destructive changes. The container also runs it on every start.

### 3. Copy the data (about 1 GB, takes several minutes)

```bash
TARGET_DATABASE_URL='<public url>' bash scripts/seed-hosted-db.sh
```

Copies MarketInstrument, DailyCandle (3.6 M rows, 2020→), CorporateAction, FnoDaily, ResultsEvent, SetupEvidence, GlobalMarketDaily and AutoPaperTrade. Only empty tables are copied, so it is safe to re-run. The 11 GB IntradayCandle table and ML tables are not copied.

### 4. Create your sign-in

```bash
DATABASE_URL='<public url>' SWINGDESK_OWNER_PASSWORD='<at least 10 characters>' npm run user:owner -- --email=you@example.com --name="Your name"
```

The password comes from an environment variable so it never sits in a file. Re-run the same command to change it.

### 5. App service

New service → GitHub repo `Swingdesk`, branch `main`. Railway builds the `Dockerfile` (`railway.toml`). Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (private network) |
| `JWT_SECRET` | a random string of at least 32 characters (e.g. `openssl rand -hex 32`) |
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Kolkata` |
| `PAPER_TRADING_MODE` | `true` |
| `ENABLE_LIVE_TRADING` | `false` |
| `ENABLE_AUTOMATION` | `false` |
| `ENABLE_AUTO_SCAN` | `false` |
| `ENABLE_EOD_PIPELINE` | `false` (the auto paper job loads candles itself; this only stops the heavy scanner at start-up) |
| `SWINGDESK_DATA_PROVIDER` | `yahoo` |
| `SCANNER_UNIVERSE` | `nifty500` |
| `CORS_ALLOWED_ORIGINS` | `https://<your railway domain>` |
| `ENABLE_AUTO_PAPER` | leave unset (on). Set `false` to stop the evening job. |

Optional: the Research Assistant needs an AI provider key (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY` or `GROQ_API_KEY`). These cost money per question; leave them unset if you only need Workspace and Auto Paper.

Then Settings → Networking → Generate domain, and deploy.

### 6. Check it

1. `https://<domain>/api/ready` responds.
2. Open the domain, sign in.
3. Auto Paper tab shows the copied paper trades; press **Update now** once.

### 7. Close the setup door

Turn off the PostgreSQL **public** networking (TCP proxy) once seeding is done; the app uses the private network.

## Updating later

Merge a pull request into `main`; Railway rebuilds and redeploys. Schema changes in `schema.prisma` are applied by `db push` at start-up (additive changes only; destructive ones fail safely and need a manual decision).
