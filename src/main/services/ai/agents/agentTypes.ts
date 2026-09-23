export interface EnrichedConnectionMeta {
  name: string;
  type: string;
  database?: string;
  schema?: string;
  catalogType?: string;
  sqlAvailable?: boolean;
  unavailableReason?: string;
  linkedDbtProject?: { id: string; name: string; path: string } | null;
}
