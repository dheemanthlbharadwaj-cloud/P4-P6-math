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

/** Width / height of a cat image. Poses are 512×473; the animations are trimmed to the cat (no empty padding). */
const ANIMATION_ASPECT = new Map<number, number>([
  [catAnimations.idle, 341 / 332],
  [catAnimations.thinking, 247 / 168],
  [catAnimations.wrong, 225 / 161],
  [catAnimations.sad, 304 / 196],
]);
export const catAspect = (source: unknown): number => ANIMATION_ASPECT.get(source as number) ?? 512 / 473;

// "correct" = cute-eyes pose (ARCHITECTURE.md).
export const catMoodImage = (mood: CatMood): number =>
  mood === "correct" ? catPoses.cute : catAnimations[mood];

/** Coloured coats for every pose and animation (flat cel colour, darker same-hue ink lines and outline, one soft
 *  cel shadow; calico gets orange and dark patches).
 *  Generated from the black art; black is the original file. */
export const catColorVariants = new Map<number, Record<string, number>>([
  [catPoses.banana, {
    "color-ginger": require("../../assets/cats/colors/banana-cat-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/banana-cat-color-grey.png"),
    "color-white": require("../../assets/cats/colors/banana-cat-color-white.png"),
    "color-calico": require("../../assets/cats/colors/banana-cat-color-calico.png"),
  }],
  [catPoses.chasing, {
    "color-ginger": require("../../assets/cats/colors/cat-chasing-mouse-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/cat-chasing-mouse-color-grey.png"),
    "color-white": require("../../assets/cats/colors/cat-chasing-mouse-color-white.png"),
    "color-calico": require("../../assets/cats/colors/cat-chasing-mouse-color-calico.png"),
  }],
  [catPoses.box, {
    "color-ginger": require("../../assets/cats/colors/cat-in-a-box-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/cat-in-a-box-color-grey.png"),
    "color-white": require("../../assets/cats/colors/cat-in-a-box-color-white.png"),
    "color-calico": require("../../assets/cats/colors/cat-in-a-box-color-calico.png"),
  }],
  [catPoses.cup, {
    "color-ginger": require("../../assets/cats/colors/cat-in-a-cup-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/cat-in-a-cup-color-grey.png"),
    "color-white": require("../../assets/cats/colors/cat-in-a-cup-color-white.png"),
    "color-calico": require("../../assets/cats/colors/cat-in-a-cup-color-calico.png"),
  }],
  [catPoses.wool, {
    "color-ginger": require("../../assets/cats/colors/cat-playing-with-wool-ball-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/cat-playing-with-wool-ball-color-grey.png"),
    "color-white": require("../../assets/cats/colors/cat-playing-with-wool-ball-color-white.png"),
    "color-calico": require("../../assets/cats/colors/cat-playing-with-wool-ball-color-calico.png"),
  }],
  [catPoses.laptop, {
    "color-ginger": require("../../assets/cats/colors/cat-with-laptop-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/cat-with-laptop-color-grey.png"),
    "color-white": require("../../assets/cats/colors/cat-with-laptop-color-white.png"),
    "color-calico": require("../../assets/cats/colors/cat-with-laptop-color-calico.png"),
  }],
  [catPoses.confused, {
    "color-ginger": require("../../assets/cats/colors/confused-cat-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/confused-cat-color-grey.png"),
    "color-white": require("../../assets/cats/colors/confused-cat-color-white.png"),
    "color-calico": require("../../assets/cats/colors/confused-cat-color-calico.png"),
  }],
  [catPoses.curious, {
    "color-ginger": require("../../assets/cats/colors/curious-cat-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/curious-cat-color-grey.png"),
    "color-white": require("../../assets/cats/colors/curious-cat-color-white.png"),
    "color-calico": require("../../assets/cats/colors/curious-cat-color-calico.png"),
  }],
  [catPoses.cute, {
    "color-ginger": require("../../assets/cats/colors/cute-eyes-cat-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/cute-eyes-cat-color-grey.png"),
    "color-white": require("../../assets/cats/colors/cute-eyes-cat-color-white.png"),
    "color-calico": require("../../assets/cats/colors/cute-eyes-cat-color-calico.png"),
  }],
  [catPoses.scared, {
    "color-ginger": require("../../assets/cats/colors/scared-cat-color-ginger.png"),
    "color-grey": require("../../assets/cats/colors/scared-cat-color-grey.png"),
    "color-white": require("../../assets/cats/colors/scared-cat-color-white.png"),
    "color-calico": require("../../assets/cats/colors/scared-cat-color-calico.png"),
  }],
  [catAnimations.idle, {
    "color-ginger": require("../../assets/cats/colors/groom-idle-color-ginger.webp"),
    "color-grey": require("../../assets/cats/colors/groom-idle-color-grey.webp"),
    "color-white": require("../../assets/cats/colors/groom-idle-color-white.webp"),
    "color-calico": require("../../assets/cats/colors/groom-idle-color-calico.webp"),
  }],
  [catAnimations.thinking, {
    "color-ginger": require("../../assets/cats/colors/laptop-thinking-color-ginger.webp"),
    "color-grey": require("../../assets/cats/colors/laptop-thinking-color-grey.webp"),
    "color-white": require("../../assets/cats/colors/laptop-thinking-color-white.webp"),
    "color-calico": require("../../assets/cats/colors/laptop-thinking-color-calico.webp"),
  }],
  [catAnimations.wrong, {
    "color-ginger": require("../../assets/cats/colors/confused-wrong-color-ginger.webp"),
    "color-grey": require("../../assets/cats/colors/confused-wrong-color-grey.webp"),
    "color-white": require("../../assets/cats/colors/confused-wrong-color-white.webp"),
    "color-calico": require("../../assets/cats/colors/confused-wrong-color-calico.webp"),
  }],
  [catAnimations.sad, {
    "color-ginger": require("../../assets/cats/colors/lie-down-sad-color-ginger.webp"),
    "color-grey": require("../../assets/cats/colors/lie-down-sad-color-grey.webp"),
    "color-white": require("../../assets/cats/colors/lie-down-sad-color-white.webp"),
    "color-calico": require("../../assets/cats/colors/lie-down-sad-color-calico.webp"),
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
