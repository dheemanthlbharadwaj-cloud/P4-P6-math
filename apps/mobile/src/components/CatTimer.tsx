// The cat at its board, used as a 5-minute timer: a white wedge fills the board's circle clockwise from 12 o'clock
// over exactly TIMER_MS, then stays full (no loop, no alert). Built from a still frame of the artist's
// laptop-thinking animation (board empty) plus a drawn wedge, so the progress is exact rather than an animation loop.
import React from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Path } from "react-native-svg";
import { useNow } from "../hooks/useNow";
import { TIMER_MS, timerProgress, wedgePath } from "../logic/timer";

const ASPECT = 247 / 168; // frame size
// Board circle in the frame (measured): centre and radius as fractions of the frame width/height.
const CX = 181 / 247, CY = 63.5 / 168, R = 31 / 247;

const FRAMES: Record<string, number> = {
  "color-black": require("../../assets/cats/timer/cat-timer-color-black.png"),
  "color-ginger": require("../../assets/cats/timer/cat-timer-color-ginger.png"),
  "color-grey": require("../../assets/cats/timer/cat-timer-color-grey.png"),
  "color-white": require("../../assets/cats/timer/cat-timer-color-white.png"),
  "color-calico": require("../../assets/cats/timer/cat-timer-color-calico.png"),
};

export function CatTimer({ startedAt, width, colorId = "color-black", total = TIMER_MS }: { startedAt: number; width: number; colorId?: string; total?: number }) {
  const now = useNow(1000);
  const p = timerProgress(startedAt, now, total);
  const h = width / ASPECT;
  const left = Math.ceil((total - (now - startedAt)) / 1000);
  return (
    <View style={{ width, height: h }} accessible accessibilityLabel={p >= 1 ? "Timer finished" : `Timer: ${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>
      <Image source={FRAMES[colorId] ?? FRAMES["color-black"]} style={{ position: "absolute", width, height: h }} contentFit="contain" />
      <Svg width={width} height={h} style={{ position: "absolute" }}>
        {p >= 1 ? <Circle cx={CX * width} cy={CY * h} r={R * width} fill="#fff" /> : <Path d={wedgePath(CX * width, CY * h, R * width, p)} fill="#fff" />}
      </Svg>
    </View>
  );
}
