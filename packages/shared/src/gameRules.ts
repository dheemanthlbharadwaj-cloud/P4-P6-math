// Game economy constants. Values marked ASSUMPTION are not specified in the mindmap and are
// listed in docs/OPEN_QUESTIONS.md — change them here only.
import type { StoreItem } from "./types";

export const QUESTIONS_PER_LEVEL = 5; // "5-5-5"
// Stars: see stars.ts (per question on a first attempt, one per re-attempted level, one per new mini-game question).

export const MAX_HEARTS = 10; // daily allowance, refilled at midnight
export const HEARTS_PER_AD = 3; // from mindmap: Watch Ad → +3 hearts

export const MAX_ENERGY = 10; // daily allowance, refilled at midnight
export const ENERGY_PER_LEVEL = 1; // ASSUMPTION: starting a level costs 1 energy
export const ENERGY_PER_AD = 3; // ASSUMPTION

export const REFERRAL_STARS = 5; // from mindmap
export const SUBSCRIPTION_PRICE_LABEL = "$15/month"; // from mindmap; real price comes from the store via RevenueCat
export const SUBSCRIPTION_ENTITLEMENT = "unlimited";

export const LEVEL_PASS_MIN_CORRECT = 5; // ASSUMPTION: level completes when all 5 are answered correctly (retry wrong ones)
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
