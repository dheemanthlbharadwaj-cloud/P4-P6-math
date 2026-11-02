// Sign-in for everyone (students, teachers, the owner): the same Firebase Auth accounts as the game. Email + password,
// or Google (Firebase's pop-up). No sign-up here: students make their account in the game, teachers get theirs from
// the owner (Admin > Teachers).
import {
  GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, type User,
} from "firebase/auth";
import { firebaseAuth } from "./firebase";

export const signInEmail = async (email: string, password: string) =>
  (await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password)).user;
export const signInGooglePopup = async () => (await signInWithPopup(firebaseAuth(), new GoogleAuthProvider())).user;
export const sendPasswordReset = (email: string) => sendPasswordResetEmail(firebaseAuth(), email.trim());
export const signOut = () => fbSignOut(firebaseAuth());
export const watchAuth = (cb: (u: User | null) => void) => onAuthStateChanged(firebaseAuth(), cb);
export const currentUser = () => firebaseAuth().currentUser;

/** "password", "google.com" … of the signed-in user (the first provider). */
export const signInMethod = (u: User | null | undefined): string => u?.providerData[0]?.providerId ?? "";

export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Wrong email or password.";
  if (code.includes("user-disabled")) return "This account is switched off. Ask your teacher or the owner.";
  if (code.includes("invalid-email")) return "That email does not look right.";
  if (code.includes("too-many-requests")) return "Too many tries. Wait a few minutes and try again.";
  if (code.includes("network")) return "No internet connection.";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return "Sign-in was cancelled.";
  if (code.includes("popup-blocked")) return "Your browser blocked the sign-in window. Allow pop-ups and try again.";
  if (code.includes("unauthorized-domain")) return "Sign-in isn't allowed on this web address yet.";
  if (code.includes("operation-not-allowed")) return "This sign-in method isn't switched on yet.";
  if (code.includes("account-exists-with-different-credential")) return "That email already uses another sign-in method. Use that one.";
  return "Something went wrong. Please try again.";
}
