// Native Google sign-in on Android (Google blocks custom-scheme redirects for new Android OAuth clients).
// The Android OAuth client (package + release SHA-1) must exist in the Firebase/GCP project; the id token is
// minted for the WEB client id passed to configure().
import { GoogleSignin, isErrorWithCode, statusCodes } from "@react-native-google-signin/google-signin";

export const googleNativeSupported = true;

let configured = "";
const ensure = (webClientId: string) => {
  if (configured !== webClientId) { GoogleSignin.configure({ webClientId }); configured = webClientId; }
};

/** Returns the Google id token, or null when the person cancelled. Other failures throw with a `code`. */
export async function googleNativeIdToken(webClientId: string): Promise<string | null> {
  ensure(webClientId);
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res.type !== "success") return null;
    const token = res.data.idToken;
    if (!token) throw Object.assign(new Error("Google returned no id token"), { code: "google/no-id-token" });
    return token;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (e.code === statusCodes.IN_PROGRESS) throw Object.assign(new Error("in progress"), { code: "google/in-progress" });
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw Object.assign(new Error("no play services"), { code: "google/play-services" });
    }
    throw e;
  }
}

/** Forget the chosen Google account so the picker shows next time. */
export async function googleNativeSignOut(): Promise<void> {
  try { await GoogleSignin.signOut(); } catch { /* not signed in with Google */ }
}
