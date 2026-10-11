// Names other players see (full name on leaderboards, cat name for friends). Shared by the app (instant feedback)
// and the backend (the rule that counts). Deliberately simple: letters, spaces and a few name marks, no links, no
// numbers that look like contact details, and no common rude words.

/** Words that can't appear in a name (whole words, case-insensitive). Short on purpose: obvious cases only. */
const BLOCKED = [
  "fuck", "fucker", "fucking", "shit", "bitch", "bastard", "asshole", "arsehole", "dick", "cock", "pussy", "cunt",
  "slut", "whore", "porn", "sex", "sexy", "nigger", "nigga", "fag", "faggot", "retard", "rape", "kill", "die",
  "nazi", "hitler", "penis", "vagina", "boobs", "butt", "idiot", "stupid", "dumb", "loser", "ugly",
  "knn", "ccb", "chibai", "lanjiao", "pukimak", "babi",
];

export type NameProblem = "empty" | "too-long" | "characters" | "link" | "contact" | "rude";

/** Tidy a name: trim and collapse spaces. */
export const tidyName = (raw: string) => raw.normalize("NFC").replace(/\s+/g, " ").trim();

/** Why a name can't be used, or null when it's fine. `max` = longest allowed (after tidying). */
export function nameProblem(raw: string, max: number): NameProblem | null {
  const name = tidyName(raw);
  if (!name) return "empty";
  if (name.length > max) return "too-long";
  if (/https?:|www\.|\.(com|net|org|sg|io|me|ly)\b|@/i.test(name)) return "link";
  if (/\d{4,}/.test(name.replace(/[\s-]/g, ""))) return "contact";
  // Letters (any alphabet), digits (a few, e.g. "Mochi 2"), spaces and name marks: ' - . ( )
  if (!/^[\p{L}\p{M}\d '’\-.()]+$/u.test(name)) return "characters";
  const words = name.toLowerCase().normalize("NFKD").replace(/[^\p{L}\s]/gu, " ").split(/\s+/);
  const squashed = words.join("");
  if (words.some((w) => BLOCKED.includes(w)) || BLOCKED.some((b) => b.length >= 5 && squashed.includes(b))) return "rude";
  return null;
}

/** A friendly sentence for a problem (shown under the name field). */
export function nameProblemMessage(p: NameProblem): string {
  switch (p) {
    case "empty": return "Please type a name.";
    case "too-long": return "That name is too long.";
    case "link": return "Names can't contain links or email addresses.";
    case "contact": return "Names can't contain phone numbers.";
    case "characters": return "Please use letters only.";
    case "rude": return "Please choose a kind name. Everyone on the leaderboard can see it.";
  }
}
