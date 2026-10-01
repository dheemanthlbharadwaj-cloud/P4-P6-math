import Constants from "expo-constants";

interface Extra {
  firebase: { apiKey: string; authDomain: string; projectId: string; storageBucket: string; messagingSenderId: string; appId: string };
  revenueCat: { ios: string; android: string };
  admob: { rewardedAndroid: string; rewardedIos: string };
  auth: { googleWebClientId: string; googleIosClientId: string; googleAndroidClientId: string };
  referralBaseUrl: string;
}

export const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
export const FUNCTIONS_REGION = "asia-southeast1";
export const isFirebaseConfigured = !!extra.firebase?.apiKey && extra.firebase.apiKey !== "PLACEHOLDER";
