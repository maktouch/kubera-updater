import { z } from "zod";
import type { SourceRecord } from "./types.js";

const SourceRecordSchema = z.object({
  id: z.string(),
  updatedAt: z.string(),
  payload: z.unknown()
});

const SourceResponseSchema = z.array(SourceRecordSchema);

export async function fetchSourceRecords(sourceApiUrl: string, timeoutMs: number): Promise<SourceRecord[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${sourceApiUrl}/records`, {
      method: "GET",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Source fetch failed with ${response.status} ${response.statusText}`);
    }

    const body = await response.json();
    return SourceResponseSchema.parse(body);
  } finally {
    clearTimeout(timer);
  }
}
