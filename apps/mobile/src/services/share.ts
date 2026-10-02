// Share / copy / open-link helpers that never silently do nothing. The web preview runs in a sandboxed iframe where
// navigator.share, the async clipboard and window.open may all be blocked, so each has a fallback and returns an outcome.
import { Linking, Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";

export async function copyText(text: string): Promise<boolean> {
  try { await Clipboard.setStringAsync(text); return true; } catch { /* fall through */ }
  if (Platform.OS === "web" && typeof document !== "undefined") {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
  return false;
}

export type ShareOutcome = "shared" | "copied" | "failed";

export async function shareText(message: string): Promise<ShareOutcome> {
  if (Platform.OS === "web") {
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }) : undefined;
    if (nav?.share) {
      try { await nav.share({ text: message }); return "shared"; } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return "shared"; // user closed the sheet
      }
    }
    return (await copyText(message)) ? "copied" : "failed";
  }
  try { await Share.share({ message }); return "shared"; } catch { return (await copyText(message)) ? "copied" : "failed"; }
}

/** Opens a URL; returns false when nothing could open it (caller shows a message). */
export async function openLink(url: string): Promise<boolean> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try { const w = window.open(url, "_blank", "noopener,noreferrer"); if (w) return true; } catch { /* fall through */ }
  }
  try { await Linking.openURL(url); return true; } catch { return false; }
}
