import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, OAuthProvider, signInWithCredential, signInWithEmailAndPassword,
  signOut as fbSignOut, onAuthStateChanged, updateProfile, type User,
} from "firebase/auth";
import { firebaseAuth } from "./firebase";
import { extra } from "./config";

export const signUpEmail = async (email: string, password: string) =>
  (await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password)).user;

export const signInEmail = async (email: string, password: string) =>
  (await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password)).user;

/** Google: the login screen obtains an id token via expo-auth-session (client ids from app.config extra.auth). */
export const signInGoogleIdToken = async (idToken: string) =>
  (await signInWithCredential(firebaseAuth(), GoogleAuthProvider.credential(idToken))).user;

export const googleClientIds = () => extra.auth; // TODO(owner): fill EXPO_PUBLIC_GOOGLE_*_CLIENT_ID

export const appleAvailable = async () => Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync());

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
  return "Something went wrong. Please try again.";
}
