// Game economy constants. Values marked ASSUMPTION are not specified in the mindmap and are
// listed in docs/OPEN_QUESTIONS.md — change them here only.
import type { StoreItem } from "./types";

export const QUESTIONS_PER_LEVEL = 5; // "5-5-5"
// Stars: see stars.ts (per question on a first attempt, one per re-attempted level, one per new mini-game question).

export const MAX_HEARTS = 10; // daily allowance, refilled at midnight
export const HEARTS_PER_AD = 3; // from mindmap: Watch Ad → +3 hearts

export const REFERRAL_STARS = 5; // from mindmap: to the student whose friend code was entered
export const REFERRAL_WELCOME_STARS = 3; // to the new student who entered a friend's code (sign-up or Profile), once

// Daily quests: reset at midnight Singapore time; a done quest's stars are claimed by tapping, the same day.
// "answers" = questions answered today in map levels and mini games, right or wrong (practice doesn't count);
// "friends" = friends added today (accepted request, mutual request or a friend code at sign-up).
export interface DailyQuest {
  id: string;
  kind: "answers" | "friends";
  target: number;
  stars: number;
  title: string;
}
export const DAILY_QUESTS: DailyQuest[] = [
  { id: "answer-5", kind: "answers", target: 5, stars: 1, title: "Answer 5 questions" },
  { id: "answer-15", kind: "answers", target: 15, stars: 2, title: "Answer 15 questions" },
  { id: "answer-25", kind: "answers", target: 25, stars: 3, title: "Answer 25 questions" },
  { id: "add-friend", kind: "friends", target: 1, stars: 2, title: "Add a friend" },
];
export const SUBSCRIPTION_PRICE_LABEL = "$15/month"; // from mindmap; real price comes from the store via RevenueCat
export const SUBSCRIPTION_ENTITLEMENT = "unlimited";

export const LEVEL_PASS_MIN_CORRECT = 5; // a level is complete (star button) once all 5 questions are answered right, over any number of attempts
// Mini game "5-Minute Challenge": answer as many LV1 questions as you can in 5 minutes, with 5 hearts.
export const CHALLENGE_SECONDS = 300;
export const CHALLENGE_HEARTS = 5;

export const TIMEZONE = "Asia/Singapore";

// ASSUMPTION: placeholder catalogue; prices and art come later from the product owner/artist.
export const STORE_ITEMS: StoreItem[] = [
  { id: "color-black", kind: "color", name: "Midnight", price: 0 },
  { id: "color-ginger", kind: "color", name: "Ginger", price: 10 },
  { id: "color-grey", kind: "color", name: "Smoky Grey", price: 10 },
  { id: "color-white", kind: "color", name: "Snow", price: 15 },
  { id: "color-calico", kind: "color", name: "Calico", price: 25 },
  { id: "hat-cap", kind: "hat", name: "School Cap", price: 8 },
  { id: "hat-crown", kind: "hat", name: "Crown", price: 30 },
  { id: "hat-wizard", kind: "hat", name: "Math Wizard", price: 40 },
  { id: "hat-grad", kind: "hat", name: "Graduation Cap", price: 50 },
];
