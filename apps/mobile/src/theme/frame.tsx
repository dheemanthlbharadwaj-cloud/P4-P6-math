// The app's frame: on phones (and narrow browser windows) the whole window; in a big browser window (desktop, laptop,
// tablet browser) a centred column, so the phone-designed screens keep their proportions instead of stretching.
// Question screens (levels, mini games, practice) get a wide frame: question on the left, working space on the right.
// Screens size themselves with useFrameDimensions(), never the window.
import React, { createContext, useContext } from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import { colors } from "./colors";

/** Window width from which a browser counts as a big screen. */
export const DESKTOP_MIN_WIDTH = 760;
/** Map, tabs, onboarding: phone-shaped column. */
export const COLUMN_WIDTH = 560;
/** Question screens: wide enough for question + working space side by side, not wider. */
export const WIDE_WIDTH = 1280;

export const isBigBrowser = (windowWidth: number) => Platform.OS === "web" && windowWidth >= DESKTOP_MIN_WIDTH;

const FrameContext = createContext<{ width: number; height: number } | null>(null);

export function useFrameDimensions(): { width: number; height: number } {
  const frame = useContext(FrameContext);
  const win = useWindowDimensions();
  return frame ?? win;
}

export function AppFrame({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  const win = useWindowDimensions();
  if (!isBigBrowser(win.width)) return <>{children}</>;
  const width = Math.min(win.width, wide ? WIDE_WIDTH : COLUMN_WIDTH);
  const edge = width < win.width;
  return (
    <View style={{ flex: 1, flexDirection: "row", justifyContent: "center", backgroundColor: FRAME_BG }}>
      <View style={[{ width, height: "100%", overflow: "hidden", backgroundColor: colors.bg },
        edge && { borderLeftWidth: 2, borderRightWidth: 2, borderColor: colors.border }]}>
        <FrameContext.Provider value={{ width, height: win.height }}>{children}</FrameContext.Provider>
      </View>
    </View>
  );
}

/** Around the column on big screens: a darker shade of the app background. */
const FRAME_BG = "#f1e3c8";
