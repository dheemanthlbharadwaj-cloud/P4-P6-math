// Per-instance cache of a class feed (newest posts). A refresh after the TTL reads only the posts newer than the newest one
// held (0 reads when nothing is new); a full re-read happens when the entry is older than FULL_MS (so deleted posts vanish
// within that time on other instances) or after invalidate(). The clock is injectable for tests.
import type { ClassPost } from "../shared/index.js";

export interface FeedSource {
  /** the newest `limit` posts, newest first */
  newest(classId: string, limit: number): Promise<ClassPost[]>;
  /** posts with createdAt >= since */
  since(classId: string, since: number): Promise<ClassPost[]>;
}

export class FeedCache {
  private m = new Map<string, { posts: ClassPost[]; at: number; fullAt: number }>();
  constructor(
    private src: FeedSource, private limit: number, private ttlMs = 60_000, private fullMs = 10 * 60_000, private max = 300, private now: () => number = Date.now,
  ) {}

  async get(classId: string): Promise<ClassPost[]> {
    const t = this.now();
    const e = this.m.get(classId);
    if (e && t - e.at < this.ttlMs) return e.posts;
    let posts: ClassPost[];
    let fullAt = t;
    if (e && t - e.fullAt < this.fullMs) {
      const fresh = await this.src.since(classId, e.posts[0]?.createdAt ?? 0);
      const byId = new Map(e.posts.map((p) => [p.id, p] as const));
      for (const p of fresh) byId.set(p.id, p);
      posts = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)).slice(0, this.limit);
      fullAt = e.fullAt;
    } else {
      posts = await this.src.newest(classId, this.limit);
    }
    this.m.delete(classId);
    this.m.set(classId, { posts, at: t, fullAt });
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
    return posts;
  }
  invalidate(classId: string): void { this.m.delete(classId); }
}
