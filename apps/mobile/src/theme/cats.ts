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

// "correct" = cute-eyes pose (ARCHITECTURE.md).
export const catMoodImage = (mood: CatMood): number =>
  mood === "correct" ? catPoses.cute : catAnimations[mood];

// Store cat colours (ids from packages/shared STORE_ITEMS), applied by CatAvatar as a tint over the black art.
export const catColors: Record<string, string> = {
  "color-black": "#1d1d27",
  "color-ginger": "#e8892b",
  "color-grey": "#8d99ae",
  "color-white": "#f4f1ea",
  "color-calico": "#c98b5a",
};
