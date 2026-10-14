// Per-instance cache of the editor's edits to the bundle, used when marking answers and judging level completion.
// Incremental: one refresh reads only the edits after the previous one (cost = new edits, minimum one read), at most
// every REFRESH_MS, with a single refresh in flight. A failed refresh keeps what it had (first time: the bundle as is).
import type { QuestionPatch } from "../shared/index.js";
import type { ServerContent, ServerQuestion } from "../content/index.js";
import { toServerQuestion, type PatchPage } from "./patches.js";

export const REFRESH_MS = 10 * 60_000;
const MAX_PAGES = 20; // 6000 edited docs per refresh; the rest comes with the next one

export interface PatchView {
  /** questions edited since the bundle was built → their new answer (null = not auto-markable any more); others: use CONTENT */
  answers: Map<string, ServerQuestion | null>;
  /** questions the editor retired */
  retired: Set<string>;
}
const EMPTY: PatchView = { answers: new Map(), retired: new Set() };

export type PatchFetcher = (since: string) => Promise<PatchPage>;

export class PatchCache {
  private view: PatchView = EMPTY;
  private until = "";
  private at = 0;
  private inflight: Promise<void> | null = null;
  constructor(private content: ServerContent, private fetchPage: PatchFetcher, private now: () => number = Date.now) {}

  /** The current view; waits for a refresh when it is due (first call, or older than REFRESH_MS). Never throws. */
  async get(): Promise<PatchView> {
    if (!this.inflight && (this.at === 0 || this.now() - this.at >= REFRESH_MS)) this.inflight = this.refresh().finally(() => { this.inflight = null; });
    if (this.inflight && this.view === EMPTY) await this.inflight; // first load: wait; later refreshes: serve the old view meanwhile
    return this.view;
  }

  private async refresh(): Promise<void> {
    this.at = this.now(); // a failure is not retried before the next interval: a down Firestore must not slow every submit
    try {
      const answers = new Map(this.view.answers), retired = new Set(this.view.retired);
      let until = this.until;
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = await this.fetchPage(until);
        for (const p of r.patches) apply(p, answers, retired);
        until = r.until;
        if (!r.more) break;
      }
      this.view = { answers, retired };
      this.until = until;
    } catch (e) {
      console.warn("patch cache refresh failed; keeping the bundle's answers", e instanceof Error ? e.message : e);
    }
  }
}

function apply(p: QuestionPatch, answers: Map<string, ServerQuestion | null>, retired: Set<string>) {
  if (p.question === null) { retired.add(p.id); answers.delete(p.id); return; }
  retired.delete(p.id);
  answers.set(p.id, toServerQuestion(p.question));
}
