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
- Derives a cost basis for each MICA account from the full transaction history (see below)
- Logs into Gopeer with `GOPEER_USERNAME` and `GOPEER_PASSWORD`
- Extracts Gopeer `Total Account Value` and derives net deposits as `Total Account Value - Net Income`
- Updates Kubera assets named `MICA - TFSA`, `MICA - RRSP`, and `Gopeer` through Data API v3, sending `cost` alongside `value` so Kubera shows gain/loss and IRR
- Uses `KUBERA_PORTFOLIO_ID` if provided, otherwise defaults to the first portfolio returned by Kubera

## MICA cost basis

MICA does not display a book cost, so the worker derives net deposits per account from the Transactions page:

```
deposits = buys - sells - cash distributions + current cash balance
```

Fees and reinvested distributions are settled in units and never touch cash, so they are ignored.

As a safety check the worker reconciles units for every fund (bought - sold + reinvested + fee redemptions must equal the units currently held). If that check fails, for example because MICA starts truncating history, the worker logs a warning and leaves the Kubera cost untouched for that account.

## Gopeer cost basis

Gopeer shows `Net Income` on the dashboard and defines its Simple Return relative to net deposits (deposits minus withdrawals), so the worker uses `Total Account Value - Net Income` as the cost basis. If Net Income cannot be read, the Kubera cost is left untouched.

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
