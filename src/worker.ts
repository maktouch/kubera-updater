import { appConfig } from "./config.js";
import { insertDestinationRecords } from "./destination.js";
import { fetchSourceRecords } from "./source.js";
import { mapToDestination } from "./transform.js";

async function run(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting daily sync job`);

  const sourceRecords = await fetchSourceRecords(
    appConfig.SOURCE_API_URL,
    appConfig.REQUEST_TIMEOUT_MS
  );
  console.log(`Fetched ${sourceRecords.length} records from source`);

  const destinationRecords = mapToDestination(sourceRecords);
  await insertDestinationRecords(
    appConfig.DEST_API_URL,
    appConfig.DEST_API_KEY,
    destinationRecords,
    appConfig.REQUEST_TIMEOUT_MS
  );
  console.log(`Inserted ${destinationRecords.length} records to destination`);
}

run().catch((error: unknown) => {
  console.error("Worker failed:", error);
  process.exit(1);
});
