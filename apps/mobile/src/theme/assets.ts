// ASSET REGISTRY. Every owner-supplied image (map backgrounds, node/level buttons, toolbar icons, lock/cloud
// overlays, status icons, hats) is referenced ONLY here. Replace the files in assets/ui/ (same names) and nothing
// else needs to change. See assets/ui/README.md for names and recommended sizes.
// Cat art lives in assets/cats/ (artist-supplied) and is referenced in src/theme/cats.ts.
import type { ImageSourcePropType } from "react-native";
import { mapPaths, type MapPath } from "./mapPaths";

export const uiAssets = {
  // One island section of the river-map pack per chapter (map order 1..12), built by scripts/map-sections.py.
  // aspect = height / width of the image; island = which side the island sits, so nodes go on the water side.
  maps: [
    { bg: require("../../assets/ui/map-bg-1.webp"), aspect: 1.75, island: "left" },
    { bg: require("../../assets/ui/map-bg-2.webp"), aspect: 1.75, island: "right" },
    { bg: require("../../assets/ui/map-bg-3.webp"), aspect: 1.75, island: "left" },
    { bg: require("../../assets/ui/map-bg-4.webp"), aspect: 1.75, island: "right" },
    { bg: require("../../assets/ui/map-bg-5.webp"), aspect: 1.778, island: "left" },
    { bg: require("../../assets/ui/map-bg-6.webp"), aspect: 1.75, island: "right" },
    { bg: require("../../assets/ui/map-bg-7.webp"), aspect: 1.778, island: "left" },
    { bg: require("../../assets/ui/map-bg-8.webp"), aspect: 2.539, island: "right" },
    { bg: require("../../assets/ui/map-bg-9.webp"), aspect: 1.75, island: "left" },
    { bg: require("../../assets/ui/map-bg-10.webp"), aspect: 1.778, island: "right" },
    { bg: require("../../assets/ui/map-bg-11.webp"), aspect: 1.778, island: "left" },
    { bg: require("../../assets/ui/map-bg-12.webp"), aspect: 1.75, island: "right" },
  ] as Omit<MapTheme, "route">[], // cycled by topic order
  node: {
    default: require("../../assets/ui/node-default.png") as ImageSourcePropType,
    current: require("../../assets/ui/node-current.png") as ImageSourcePropType,
    gold: require("../../assets/ui/node-gold.png") as ImageSourcePropType, // all 3 levels complete
    locked: require("../../assets/ui/node-locked.png") as ImageSourcePropType,
  },
  level: {
    1: require("../../assets/ui/level-1.png") as ImageSourcePropType,
    2: require("../../assets/ui/level-2.png") as ImageSourcePropType,
    3: require("../../assets/ui/level-3.png") as ImageSourcePropType,
    gold: require("../../assets/ui/level-gold.png") as ImageSourcePropType, // completed level
  },
  tabs: {
    map: require("../../assets/ui/tab-map.png") as ImageSourcePropType,
    book: require("../../assets/ui/tab-book.png") as ImageSourcePropType,
    cat: require("../../assets/ui/tab-cat.png") as ImageSourcePropType,
    trophy: require("../../assets/ui/tab-trophy.png") as ImageSourcePropType,
    person: require("../../assets/ui/tab-person.png") as ImageSourcePropType,
  },
  icons: {
    heart: require("../../assets/ui/icon-heart.png") as ImageSourcePropType,
    energy: require("../../assets/ui/icon-energy.png") as ImageSourcePropType,
    star: require("../../assets/ui/icon-star.png") as ImageSourcePropType,
    timer: require("../../assets/ui/icon-timer.png") as ImageSourcePropType,
    calculator: require("../../assets/ui/icon-calculator.png") as ImageSourcePropType,
    noCalculator: require("../../assets/ui/icon-no-calculator.png") as ImageSourcePropType,
  },
  overlays: {
    lock: require("../../assets/ui/lock.png") as ImageSourcePropType,
    cloud: require("../../assets/ui/cloud.png") as ImageSourcePropType,
  },
  hats: {
    "hat-cap": require("../../assets/ui/hat-cap.png") as ImageSourcePropType,
    "hat-crown": require("../../assets/ui/hat-crown.png") as ImageSourcePropType,
    "hat-wizard": require("../../assets/ui/hat-wizard.png") as ImageSourcePropType,
    "hat-grad": require("../../assets/ui/hat-grad.png") as ImageSourcePropType,
  } as Record<string, ImageSourcePropType>,
};

export interface MapTheme {
  bg: ImageSourcePropType;
  aspect: number;
  island: "left" | "right";
  route: MapPath; // water route + node spots, measured from the art (src/theme/mapPaths.ts)
}

/** Map art for a topic (1-based order). Grades with more than 12 topics reuse the maps in order. */
export function mapThemeFor(topicOrder: number): MapTheme {
  const list = uiAssets.maps;
  const i = (((topicOrder - 1) % list.length) + list.length) % list.length;
  return { ...list[i], route: mapPaths[i] };
}
