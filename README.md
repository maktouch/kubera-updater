# Kubera Updater Worker

Daily TypeScript worker that:
1. Fetches records from a source API
2. Transforms them
3. Inserts them into a destination API

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill `.env` with real endpoints and credentials.

## Run

```bash
pnpm run run:once
```

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

## Notes

- `src/source.ts` handles source fetching
- `src/transform.ts` maps source records to destination payload
- `src/destination.ts` handles destination insertion
- `src/worker.ts` wires everything together
