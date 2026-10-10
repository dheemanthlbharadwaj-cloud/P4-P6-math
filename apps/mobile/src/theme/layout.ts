// Screen size classes. Every screen fills the whole window and picks its layout from the class:
//   phone   – one column, bottom tab bar (phones, and any window too small or too short for more; a phone held
//             sideways stays here, its question screens already switch to side-by-side on their own)
//   tablet  – side navigation, two columns
//   desktop – side navigation, three columns / more maps side by side (laptops, desktop browsers)
// Same rules in the browser and in the native apps (iPads get the tablet layout).
import { useWindowDimensions } from "react-native";
import { SIDE_NAV, screenClass } from "../logic/screenClass";
export { SIDE_NAV, screenClass, type ScreenClass } from "../logic/screenClass";

/** Narrowest area that still takes two panes side by side. */
const SPLIT_MIN = 900;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const kind = screenClass(width, height);
  return {
    width, height, kind,
    wide: kind !== "phone",
    /** Width left for a tab screen beside the side navigation. */
    contentWidth: width - SIDE_NAV[kind],
    /** Room for two panes side by side in a tab screen (a portrait tablet stacks them). */
    split: width - SIDE_NAV[kind] >= SPLIT_MIN,
    /** Room for two half-screen panes (sign-in, onboarding: no side navigation there). */
    splitScreen: kind !== "phone" && width >= SPLIT_MIN,
    /** Card columns for screens made of cards. */
    columns: kind === "desktop" ? 3 : kind === "tablet" ? 2 : 1,
  };
}
