import { useEffect, useState } from "react";
import { computeMeters, usePlayer, type MetersView } from "../store/player";

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Live hearts/energy (re-checked every second so the midnight refill shows up). */
export function useMeters(): MetersView {
  const hearts = usePlayer((s) => s.hearts);
  const energy = usePlayer((s) => s.energy);
  const subscribed = usePlayer((s) => s.subscribed);
  const now = useNow(1000);
  return computeMeters({ hearts, energy, subscribed }, now);
}
