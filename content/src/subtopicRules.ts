// Subtopic-specific content rules for question selection (see select.ts).
//
// Some subtopics must only contain "pure" questions: e.g. the Level 1-3 questions of "Addition and Subtraction of
// Fractions and Mixed Numbers" must not need algebra or multiplication/division. The editor bank tags such
// questions with the subtopic anyway, so selection filters them out. The rule is data: SUBTOPIC_RULES maps a
// subtopic id to the content features its questions must NOT have. To restrict another subtopic add one line there
// (and, for a new kind of feature, one detector below). Nothing else needs to change.
//
// A candidate is checked on everything the kid sees or types: stem, MCQ options, part prompts and the answers.
// The filter applies to the 5/5/5 levels, the subtopic's own pool and the topic's unlock pool. The questions stay in
// the question bundle (so already-played progress and editor patches keep working); they are just not offered here.
import type { Question, RichText } from "@p6/shared";
import { richToPlain } from "./tokenizer";

export type Intent = "addSubtract";
export type Feature = "algebra" | "multiplicationDivision";

/** Subtopic ids whose questions must not have the listed features. */
export interface SubtopicRule {
  exclude: Feature[];
  /** When a level has fewer than 5 passing questions of its own difficulty, fill it from the nearest difficulty (reported). */
  fillFromNearestDifficulty?: boolean;
  /**
   * Preferred content: candidates that show this intent are used first (at their own difficulty, then the nearest);
   * the others only fill the gaps. Within each group the usual order applies (editor picks, verified, year spread).
   */
  prefer?: Intent;
}
export const SUBTOPIC_RULES: Record<string, SubtopicRule> = {
  // Owner request: no algebra and no x / ÷ (including "3/4 of the class") in the add/subtract-fractions levels.
  "p6-fractions-addition-and-subtraction-of-fractions-and-mixed-numbers": { exclude: ["algebra", "multiplicationDivision"], fillFromNearestDifficulty: true, prefer: "addSubtract" },
};

/** Everything a kid reads or types for this question, as one plain string. */
export function questionText(q: Question): string {
  const rt = (r?: RichText) => (r ? richToPlain(r) : "");
  const bits: string[] = [rt(q.stem)];
  for (const o of q.options ?? []) bits.push(rt(o.text));
  for (const p of q.parts ?? []) {
    bits.push(rt(p.label), p.display);
    if (p.answer.kind === "text") bits.push(...p.answer.accepted);
  }
  return bits.join("\n").replace(/[ \t ]+/g, " ");
}

// Attached unit letters ("250g", "5 l", "3/8 l", "1 1/4 h") are not unknowns.
const UNIT_AFTER_NUMBER = /(?<=[\d/])\s?(?:kg|km|cm|mm|ml|mℓ|ℓ|mins?|hrs?|secs?|g|l|m|h|s)(?![A-Za-z]|[-+=(\d])/g;

const DETECTORS: Record<Feature, (text: string) => boolean> = {
  // Letters standing for numbers: "＄p", "3k", "(2w + 3)", "x = 5".
  algebra(text) {
    const t = text.replace(/\b(?:[ap]\.m\.|e\.g\.|i\.e\.)/gi, " ").replace(UNIT_AFTER_NUMBER, " ");
    if (/\d[a-zA-Z](?![A-Za-z])/.test(t)) return true; // 3k, 2p/2
    if (/(?<![A-Za-z’'.\-])[b-z](?![A-Za-z’']|\.[A-Za-z])/.test(t)) return true; // lone lowercase letter (not the article "a")
    return false;
  },
  // x, ÷, and wording that means multiplication or division (fraction/percent "of", "times", "twice", "how many sixths in").
  multiplicationDivision(text) {
    if (/[×÷∙·⋅✕✖⨯*]/.test(text)) return true;
    if (/\b(times|twice|thrice|double[sd]?|triple[sd]?|multipl\w*|divid\w*|divis\w*|product|quotient|equally)\b/i.test(text)) return true;
    if (/\bas (many|much)\b.*\bas\b/i.test(text)) return true;
    if (/\bhow many (\w+ths?|quarters|halves|halfs|thirds|fifths)\b.*\b(in|are there in)\b/i.test(text)) return true;
    // "<fraction|percent|number|half|quarter|ths> of ..." is multiplication; "which of", "what fraction of" is not.
    const OF = /(?:\d\s*\/\s*\d|\d\s*%|\b\d+|\bhalf|\bhalves|\bquarters?|\bthirds?|\w+ths?|\bremainder|\brest|\bremaining)\s+of\s+(?:the|his|her|their|its|a|an|my|our|some|all|\d|[A-Za-z])/i;
    return OF.test(text);
  },
};

const INTENTS: Record<Intent, (text: string) => boolean> = {
  // The question adds or subtracts: a + or - between numbers/fractions, or (in a fraction problem) wording that asks for a
  // total, a difference, what is left...
  addSubtract(text) {
    const t = text.replace(/\b[ap]\.m\./gi, " ");
    if (/\+/.test(t)) return true;
    const noRanges = t.replace(/\d\s*-\s*\d+\s*(?:year|month|day|hour|digit)/gi, " ").replace(/\b\d{1,2}[.:]\d{2}\s*[−–-]+\s*\d/g, " ");
    if (/[\d)]\s*[−–-]\s*[\d(]/.test(noRanges)) return true;
    const fractions = t.match(/\d\s*\/\s*\d/g)?.length ?? 0;
    if (!fractions) return false;
    if (/\b(?:more than|less than|fewer than|how much (?:more|less)|how many (?:more|fewer)|altogether|in all|total|sum|difference|increase[ds]?|decrease[ds]?|remain\w*|add(?:ed|s)?|subtract\w*|plus|minus|(?:are|is|was|were|be) left|left (?:over|unsold|in)|how (?:much|many)\b[^.?]*\bleft)\b/i.test(t)) return true;
    // several fractions of a whole told one after another: "1/5 were red, 3/5 were blue and the rest ..."
    return fractions >= 2 && /\b(?:then|the rest|rest of|remainder)\b/i.test(t);
  },
};

/** True if the question shows the rule's preferred intent (always true when the rule has none). */
export function showsPreferredIntent(q: Question, rule = SUBTOPIC_RULES[q.subtopicId]): boolean {
  return !rule?.prefer || INTENTS[rule.prefer](questionText(q));
}

/** Which restricted features the question has (empty: fine). `rule` defaults to the question's own subtopic rule. */
export function violatedFeatures(q: Question, rule = SUBTOPIC_RULES[q.subtopicId]): Feature[] {
  if (!rule) return [];
  const text = questionText(q);
  return rule.exclude.filter((f) => DETECTORS[f](text));
}

/** True when the subtopic has no rule or the question passes it. */
export function allowedInSubtopic(q: Question): boolean {
  return violatedFeatures(q).length === 0;
}
