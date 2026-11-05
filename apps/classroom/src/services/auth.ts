// Sign-in (owner decision 5 Nov 2026): ONE code box for everyone. A family code (parents) or a personal staff access code
// (teachers / admins) → codeSignIn → a Firebase custom token → signInWithCustomToken. No email, password or Google here;
// teacher accounts come from Teachers (admins), who hand out the access codes.
import { onAuthStateChanged, signInWithCustomToken, signOut as fbSignOut, type User } from "firebase/auth";
import { firebaseAuth } from "./firebase";

/** Sign in with a family code or a staff access code (the backend checks it and returns a custom token and the kind). */
export async function signInWithCode(code: string) {
  const { lessonsApi } = await import("./api");
  const { token, kind } = await lessonsApi.codeSignIn(code);
  const user = (await signInWithCustomToken(firebaseAuth(), token)).user;
  return { user, kind };
}
export const signOut = () => fbSignOut(firebaseAuth());
export const watchAuth = (cb: (u: User | null) => void) => onAuthStateChanged(firebaseAuth(), cb);
export const currentUser = () => firebaseAuth().currentUser;

export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("user-disabled")) return "This account is switched off. Ask the owner.";
  if (code.includes("too-many-requests")) return "Too many tries. Wait a few minutes and try again.";
  if (code.includes("network")) return "No internet connection.";
  if (code.includes("invalid-custom-token") || code.includes("custom-token-mismatch")) return "That code didn't work. Please try again.";
  return "Something went wrong. Please try again.";
}
