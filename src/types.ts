export type SourceRecord = {
  id: string;
  updatedAt: string;
  payload: unknown;
};

export type DestinationRecord = {
  externalId: string;
  syncedAt: string;
  data: unknown;
};
