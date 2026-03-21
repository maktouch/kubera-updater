import type { DestinationRecord } from "./types.js";

export async function insertDestinationRecords(
  destinationApiUrl: string,
  apiKey: string,
  records: DestinationRecord[],
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${destinationApiUrl}/records/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ records }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Destination insert failed with ${response.status} ${response.statusText}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
