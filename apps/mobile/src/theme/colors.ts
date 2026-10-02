// Palette taken from the art: cyan of the map buttons, gold/orange of the trophy and book icons, the grass green of
// the islands, and the warm dark-brown outline the map buttons and cats use (instead of a cold navy).
export const colors = {
  bg: "#fff7ea",
  card: "#ffffff",
  ink: "#33262a",
  inkSoft: "#75656a",
  primary: "#12aecf",
  primaryDark: "#0b7f9c",
  accent: "#ffb300",
  good: "#3fae49",
  goodBg: "#ddf5dc",
  bad: "#ef5a2f",
  badBg: "#ffe3da",
  border: "#33262a",
  muted: "#b9adb0",
  gold: "#ffc93c",
  silver: "#c9c3c4",
  bronze: "#d0894a",
  highlight: "#fff0c2",
  friend: "#d6f3fa",
};
export const radius = { s: 10, m: 16, l: 24 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
export const MIN_TOUCH = 48;
export const font = { body: 17, small: 14, h1: 28, h2: 22, huge: 36 };
/** Rounded game font (Fredoka, SIL OFL) for titles, buttons and labels; loaded in app/_layout.tsx. Body and question
 *  text stay in the system font for easy reading. Custom fonts carry their own weight, so don't add fontWeight. */
export const fonts = { display: "Fredoka_700Bold", displayMedium: "Fredoka_600SemiBold" };
