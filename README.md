# Kubera Updater Worker

Daily TypeScript worker that:
1. Logs into platforms with no API (starting with MICA)
2. Reads balances from the UI
3. Updates values in Kubera

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
```

Fill `.env` with real endpoints and credentials.

## Run

```bash
pnpm run run:once
```

Current behavior:
- Logs into MICA with `MICA_USERNAME` and `MICA_PASSWORD`
- Automatically extracts `CELI` and `REER` from the MICA account summary table
- Logs into Gopeer with `GOPEER_USERNAME` and `GOPEER_PASSWORD`
- Extracts Gopeer `Total Account Value`
- Updates Kubera assets named `CELI`, `REER`, and `Gopeer` through Data API v3
- Uses `KUBERA_PORTFOLIO_ID` if provided, otherwise defaults to the first portfolio returned by Kubera

## Development

```bash
pnpm run dev
pnpm run typecheck
pnpm run build
```

## Schedule Daily

Example cron entry (runs every day at 03:00):

```cron
0 3 * * * cd /path/to/monterrey && pnpm run run:once >> worker.log 2>&1
```

## Debugging

You can run headed mode for troubleshooting:

```dotenv
BROWSER_HEADLESS=false
```
