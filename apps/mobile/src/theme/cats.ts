// Cat art registry (artist-supplied files in assets/cats/). Mood → animation (webp) used by CatCompanion.
export type CatMood = "idle" | "thinking" | "correct" | "wrong" | "sad";

export const catAnimations: Record<Exclude<CatMood, "correct">, number> = {
  idle: require("../../assets/cats/animations/groom-idle.webp"),
  thinking: require("../../assets/cats/animations/laptop-thinking.webp"),
  wrong: require("../../assets/cats/animations/confused-wrong.webp"),
  sad: require("../../assets/cats/animations/lie-down-sad.webp"),
};

export const catPoses = {
  banana: require("../../assets/cats/poses/banana-cat.png"),
  chasing: require("../../assets/cats/poses/cat-chasing-mouse.png"),
  box: require("../../assets/cats/poses/cat-in-a-box.png"),
  cup: require("../../assets/cats/poses/cat-in-a-cup.png"),
  wool: require("../../assets/cats/poses/cat-playing-with-wool-ball.png"),
  laptop: require("../../assets/cats/poses/cat-with-laptop.png"),
  confused: require("../../assets/cats/poses/confused-cat.png"),
  curious: require("../../assets/cats/poses/curious-cat.png"),
  cute: require("../../assets/cats/poses/cute-eyes-cat.png"),
  scared: require("../../assets/cats/poses/scared-cat.png"),
} as const satisfies Record<string, number>;

/** Head of the front-facing cat, used as the onboarding progress marks. */
export const catHead: number = require("../../assets/cats/cat-head.png");

// "correct" = cute-eyes pose (ARCHITECTURE.md).
export const catMoodImage = (mood: CatMood): number =>
  mood === "correct" ? catPoses.cute : catAnimations[mood];

/** Ready-made coloured versions of the poses that wear hats (body recoloured, eyes/whiskers kept, outlined). */
export const catColorVariants = new Map<number, Record<string, number>>([
  [catPoses.cute, {
    "color-ginger": require("../../assets/cats/colors/cute-eyes-cat-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/cute-eyes-cat-color-grey.png"),
    "color-white": require("../../assets/cats/colors/cute-eyes-cat-color-white.png"),
    "color-calico": require("../../assets/cats/colors/cute-eyes-cat-color-calico.png"),
  }],
  [catPoses.chasing, {
    "color-ginger": require("../../assets/cats/colors/cat-chasing-mouse-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/cat-chasing-mouse-color-grey.png"),
    "color-white": require("../../assets/cats/colors/cat-chasing-mouse-color-white.png"),
    "color-calico": require("../../assets/cats/colors/cat-chasing-mouse-color-calico.png"),
  }],
]);

// Store cat colours (ids from packages/shared STORE_ITEMS). Poses without a ready-made variant (the animations) are
// tinted by CatAvatar instead.
export const catColors: Record<string, string> = {
  "color-black": "#1d1d27",
  "color-ginger": "#e8892b",
  "color-grey": "#8d99ae",
  "color-white": "#f4f1ea",
  "color-calico": "#c98b5a",
};
