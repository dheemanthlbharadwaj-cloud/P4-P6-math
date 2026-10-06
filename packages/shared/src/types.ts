// Shared contract between content pipeline, backend and mobile app.
// Changes go through the integrator — keep additive and backwards compatible.

export type Grade = "P4" | "P5" | "P6";
export const ACTIVE_GRADES: Grade[] = ["P6"];

export type Difficulty = "LV1" | "LV2" | "LV3";
export type LevelNo = 1 | 2 | 3;
export const LEVEL_DIFFICULTY: Record<LevelNo, Difficulty> = { 1: "LV1", 2: "LV2", 3: "LV3" };

export type Paper = "Paper 1 Booklet A" | "Paper 1 Booklet B" | "Paper 2";

// ---------- Rich text (math pre-tokenized by the content pipeline; no KaTeX at runtime) ----------
export type RichToken =
  | { t: "text"; v: string } // plain text; may contain unicode math symbols (× ÷ ° π ∠ √ ≠ ≤ ≥) and fullwidth ＄
  | { t: "frac"; n: RichToken[]; d: RichToken[]; w?: string } // stacked fraction; w = whole part of a mixed number
  | { t: "sup"; v: RichToken[] }
  | { t: "sub"; v: RichToken[] }
  | { t: "sqrt"; v: RichToken[] }
  | { t: "br" }; // line break
export type RichText = RichToken[];

// ---------- Answers ----------
// Canonical, machine-checkable answer for one blank.
export type AnswerSpec =
  | { kind: "number"; value: number; tolerance?: number; unit?: string } // decimals/integers/money
  | { kind: "fraction"; num: number; den: number; whole?: number; unit?: string } // accept equivalent forms
  | { kind: "ratio"; terms: number[] } // e.g. 3:4:5, accept equivalent simplified forms only if `acceptEquivalent`
  | { kind: "text"; accepted: string[] }; // normalized case/space-insensitive match

export interface AnswerPart {
  part: string; // "" for single-part, else "a", "b", ...
  label?: RichText; // part prompt, e.g. "(a) ..."
  answer: AnswerSpec;
  display: string; // human-readable correct answer for the review screen
}

// ---------- Questions (bundle) ----------
export interface Question {
  id: string; // editor doc id, e.g. "2024_Nanyang_P2_Q12"
  grade: Grade;
  year: number;
  topic: string; // canonical topic (topic_primary)
  topics: string[];
  subtopicId: string;
  difficulty: Difficulty;
  type: "mcq" | "open";
  paper: Paper;
  calculatorAllowed: boolean;
  stem: RichText;
  // MCQ
  options?: { key: "1" | "2" | "3" | "4"; text: RichText }[];
  correctOption?: "1" | "2" | "3" | "4";
  // Open-ended (one entry per answer box)
  parts?: AnswerPart[];
  figure?: string; // key into the figures registry, i.e. question id
  autoMarkable: boolean; // false → never used in main 5/5/5 or timed games
}

export interface QuestionBundle {
  grade: Grade;
  version: string; // content hash; backend validates level results against it
  builtAt: string;
  questions: Record<string, Question>;
}

// ---------- Curriculum ----------
export interface SubtopicNode {
  id: string; // stable slug, e.g. "p6-fractions-division-of-fractions"
  name: string;
  order: number; // position on the topic map
  main: { 1: string[]; 2: string[]; 3: string[] }; // exactly 5 ids each when available
  pool: string[]; // all other questions of this subtopic → classroom / mini games
  shortfall?: Partial<Record<LevelNo, number>>; // how many short of 5 (reported by audit)
}

export interface TopicMap {
  id: string; // slug of canonical topic
  name: string; // canonical topic name
  order: number; // swipe order
  subtopics: SubtopicNode[];
  unlockPool: string[]; // basic LV1 MCQ ids for "Find the key"
}

export interface Curriculum {
  grade: Grade;
  version: string; // same as QuestionBundle.version
  topics: TopicMap[];
}

// ---------- Player state ----------
export interface CatLook {
  colorId: string;
  hatId: string | null;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  school: string;
  grade: Grade;
  topicsLearnt: string[]; // topic ids
  psleDate: string; // ISO date
  cat: CatLook & { name: string };
  friendCode: string;
  createdAt: number;
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  school?: string;
  cat: CatLook & { name: string };
  grade: Grade;
}

export interface LevelProgress {
  completed: boolean; // gold button
  bestCorrect: number; // 0..5
  completedAt?: number;
}

export interface GradeProgress {
  grade: Grade;
  unlockedTopics: string[];
  // key `${subtopicId}#${level}`
  levels: Record<string, LevelProgress>;
}

// Sent to submitLevelResult (also queued offline).
export interface LevelResult {
  attemptId: string; // uuid, idempotency key
  grade: Grade;
  contentVersion: string;
  subtopicId: string;
  level: LevelNo;
  /** One entry per question: `correct` = answered right by the end, `firstTryCorrect` = the first answer to it in this
   *  attempt was right (stars: see stars.ts). Attempts that end early are sent too (first-time stars still count). */
  answers: { questionId: string; correct: boolean; skipped: boolean; firstTryCorrect: boolean }[];
  completed: boolean;
  finishedAt: number;
}

export interface LevelResultResponse {
  starsAwarded: number;
  starBalance: number;
  monthlyStars: number;
  duplicate: boolean;
}

// ---------- Store ----------
export interface StoreItem {
  id: string;
  kind: "hat" | "color";
  name: string;
  price: number; // stars
}

// ---------- Leaderboards ----------
export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  school?: string;
  cat: CatLook;
  stars: number; // monthly stars (ranking key)
  questionsDone: number;
  rank: number;
  rankDelta: number; // +n rose, -n fell vs yesterday's snapshot
  medal?: "gold" | "silver" | "bronze"; // from previous month
}
