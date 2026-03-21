import type { DestinationRecord, SourceRecord } from "./types.js";

export function mapToDestination(records: SourceRecord[]): DestinationRecord[] {
  return records.map((record) => ({
    externalId: record.id,
    syncedAt: new Date().toISOString(),
    data: record.payload
  }));
}
