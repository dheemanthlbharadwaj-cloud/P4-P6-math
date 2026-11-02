// Tiny per-instance TTL cache with a size cap (oldest entries go first). The clock is injectable for tests.
export class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  constructor(private ttlMs: number, private max: number, private now: () => number = Date.now) {}
  get(key: string): V | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (e.exp <= this.now()) { this.m.delete(key); return undefined; }
    return e.v;
  }
  has(key: string): boolean { return this.get(key) !== undefined; }
  set(key: string, v: V): void {
    this.m.delete(key); // re-insert: becomes the newest
    this.m.set(key, { v, exp: this.now() + this.ttlMs });
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  delete(key: string): void { this.m.delete(key); }
  clear(): void { this.m.clear(); }
  get size(): number { return this.m.size; }
}
