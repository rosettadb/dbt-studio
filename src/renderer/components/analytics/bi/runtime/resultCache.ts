/**
 * Small LRU cache with in-flight de-duplication for analytics query results.
 * Keyed by connection + final SQL text, so identical component queries run
 * once and flipping a filter back to an earlier value is instant.
 */
export class ResultCache<T> {
  private readonly entries = new Map<string, T>();

  private readonly inflight = new Map<string, Promise<T>>();

  private readonly limit: number;

  constructor(limit = 50) {
    this.limit = limit;
  }

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      // Refresh recency.
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Return a cached value, join an identical in-flight request, or start a
   * new one. `shouldCache` decides whether a finished value is kept.
   */
  async run(
    key: string,
    task: () => Promise<T>,
    options: { useCache: boolean; shouldCache: (value: T) => boolean },
  ): Promise<T> {
    if (options.useCache) {
      const hit = this.get(key);
      if (hit !== undefined) return hit;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const promise = task()
      .then((value) => {
        if (options.shouldCache(value)) this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }
}
