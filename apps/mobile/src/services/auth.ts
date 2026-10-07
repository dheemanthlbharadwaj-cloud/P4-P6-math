import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, OAuthProvider, signInWithCredential, signInWithEmailAndPassword,
  signOut as fbSignOut, onAuthStateChanged, updateProfile, type AuthProvider, type User, type UserCredential,
} from "firebase/auth";
import { firebaseAuth } from "./firebase";
import { extra } from "./config";

// The question bank editor (same Firebase project) gives its team logins at this domain; students can't use it.
const EDITOR_LOGIN_DOMAIN = "@users.primary-math-sg.web.app";

export const signUpEmail = async (email: string, password: string) => {
  if (email.trim().toLowerCase().endsWith(EDITOR_LOGIN_DOMAIN)) throw Object.assign(new Error("reserved"), { code: "auth/invalid-email" });
  return (await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password)).user;
};

export const signInEmail = async (email: string, password: string) =>
  (await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password)).user;

/** Google: the login screen obtains an id token via expo-auth-session (client ids from app.config extra.auth). */
export const signInGoogleIdToken = async (idToken: string) =>
  (await signInWithCredential(firebaseAuth(), GoogleAuthProvider.credential(idToken))).user;

export const googleClientIds = () => extra.auth; // native apps: EXPO_PUBLIC_GOOGLE_*_CLIENT_ID (see backend/README.md)

/** Web: Firebase's own Google / Apple pop-up (no client ids needed; the providers are enabled in Firebase Auth).
 *  signInWithPopup only exists in the browser build of firebase/auth (the web bundle), so it is looked up at run time. */
async function popup(provider: AuthProvider): Promise<User> {
  const { signInWithPopup } = (await import("firebase/auth")) as unknown as { signInWithPopup: (a: ReturnType<typeof firebaseAuth>, p: AuthProvider) => Promise<UserCredential> };
  return (await signInWithPopup(firebaseAuth(), provider)).user;
}
export const signInGooglePopup = () => popup(new GoogleAuthProvider());
export async function signInApplePopup(): Promise<User> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return popup(provider);
}

/** Sign in with Apple: the native sheet on iOS, Firebase's pop-up on web. */
export const appleAvailable = async () => Platform.OS === "web" || (Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync()));

export async function signInApple(): Promise<User> {
  const rawNonce = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const cred = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashed,
  });
  if (!cred.identityToken) throw new Error("Apple sign-in returned no identity token");
  const provider = new OAuthProvider("apple.com");
  const result = await signInWithCredential(firebaseAuth(), provider.credential({ idToken: cred.identityToken, rawNonce }));
  return result.user;
}

export const setDisplayName = (user: User, name: string) => updateProfile(user, { displayName: name });
export const signOut = () => fbSignOut(firebaseAuth());
export const watchAuth = (cb: (u: User | null) => void) => onAuthStateChanged(firebaseAuth(), cb);
export const currentUser = () => firebaseAuth().currentUser;

export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Wrong email or password.";
  if (code.includes("email-already-in-use")) return "That email already has an account. Try logging in.";
  if (code.includes("weak-password")) return "Password needs at least 6 characters.";
  if (code.includes("invalid-email")) return "That email does not look right.";
  if (code.includes("network")) return "No internet connection.";
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request") || code.includes("ERR_REQUEST_CANCELED")) return "Sign-in was cancelled.";
  if (code.includes("popup-blocked")) return "Your browser blocked the sign-in window. Allow pop-ups and try again.";
  if (code.includes("operation-not-allowed")) return "This sign-in method isn't switched on yet.";
  if (code.includes("account-exists-with-different-credential")) return "That email already uses another sign-in method. Use that one.";
  return "Something went wrong. Please try again.";
}
