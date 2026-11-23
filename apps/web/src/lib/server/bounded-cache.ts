/**
 * A bounded, least-recently-written map for per-process caches.
 *
 * A single-instance process serves one install, so a cache needs no
 * partition: it holds one entry per key and evicts the oldest write once it
 * reaches `maxEntries`. Entries are re-inserted on write, so a hot key is the
 * last to be evicted.
 *
 * A bounded map rather than a plain `Map` because several of these caches are
 * fed by request input (rate buckets, registration attempts); an unbounded one
 * would grow with traffic for as long as the process lives.
 */
export class BoundedCache<V> {
  private readonly entries = new Map<string, V>()

  constructor(private readonly maxEntries = 5_000) {}

  get(key: string): V | undefined {
    return this.entries.get(key)
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  set(key: string, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  delete(key: string): boolean {
    return this.entries.delete(key)
  }

  memo(key: string, factory: () => V): V {
    const existing = this.get(key)
    if (existing !== undefined) return existing
    const created = factory()
    this.set(key, created)
    return created
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}
