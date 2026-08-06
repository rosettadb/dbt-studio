export interface EnrichedConnectionMeta {
  name: string;
  type: string;
  database?: string;
  schema?: string;
  linkedDbtProject?: { id: string; name: string; path: string } | null;
}
