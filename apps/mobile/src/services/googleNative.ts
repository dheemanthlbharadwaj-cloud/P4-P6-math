// Native Google sign-in (Android only). This stub is used by web and iOS so they never load the native module;
// Metro picks googleNative.android.ts on Android.
export const googleNativeSupported = false;
export async function googleNativeIdToken(_webClientId: string): Promise<string | null> {
  throw new Error("Native Google sign-in is only available on Android");
}
export async function googleNativeSignOut(): Promise<void> {}
